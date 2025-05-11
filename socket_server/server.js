const express = require("express");
const https = require("https");
const socketIo = require("socket.io");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");
const fs = require("fs");
const { exec } = require("child_process");
const env = JSON.parse(fs.readFileSync("env.json", "utf8"));

// Server Setup
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const httpsOptions = {
  key: fs.readFileSync("./certs/key.pem"),
  cert: fs.readFileSync("./certs/cert.pem"),
};
const server = https.createServer(httpsOptions, app);
const io = new socketIo.Server(server, {
  cors: {
    origin: [env.corsOrigin],
  },
});
const db = new sqlite3.Database("./secure_chat.db", (err) => {
  if (err) {
    console.error(err.message);
  }
});

// Helper functions
function getReqIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip;
}
function tableExists(tableName, callback) {
  db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [tableName],
    (err, row) => {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, !!row);
    }
  );
}
function msgTableName(user1, user2) {
  console.log(
    crypto.createHash("sha256").update(user1.toLowerCase()).digest("hex")
  );
  const fn = user1 > user2 ? user1 : user2;
  const sn = user1 === fn ? user2 : user1;
  return `${fn}_${sn}`;
}
// Create user table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    lastlogin TEXT,
    session_token TEXT
  )
`);

// API Routes
app.post("/signup", (req, res) => {
  const { username, password } = req.body;
  const ip = getReqIp(req);
  console.log(
    "\nHTTPS Signup request from " + ip + ":",
    JSON.stringify({ username, password }, null, 2)
  );

  if (!username || !password) {
    console.log("Recieved a bad request on /signup");
    return res.status(400).send("Missing username or password");
  }

  try {
    const sessionToken = crypto.randomBytes(64).toString("hex");
    const lastlogin = new Date().toISOString();
    db.run(
      `INSERT INTO users (id, username, lastlogin, session_token) VALUES (?, ?, ?, ?)`,
      [password, username, lastlogin, sessionToken],
      function (err) {
        if (err) {
          if (err.errno === 19) {
            console.log("Username already exists, rejecting signup.");
            // SQLITE_CONSTRAINT error (username already exists)
            return res.status(400).json({ error: "Username already exists." });
          }
          console.error("Error inserting user:", err.message);
          return res.status(500).json({ error: "Internal server error." });
        }
        console.log(`A row has been inserted with rowid ${this.lastID}`);
        console.log("User created successfully.");
        res.status(201).json({
          message: "User created successfully.",
          session_token: sessionToken,
        });
      }
    );
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});
const loginAttempts = new Map();
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const ip = getReqIp(req);
  const key = `${ip}:${username}`;
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  console.log(
    "\nHTTPS Login request from " + ip + ":",
    JSON.stringify({ username, password: "*".repeat(password.length) }, null, 2)
  );

  if (!username || !password) {
    console.log("Recieved a bad request on /login");
    return res.status(400).send("Missing username or password");
  }

  let attempts = loginAttempts.get(key) || [];
  attempts = attempts.filter((time) => time > oneMinuteAgo);
  if (attempts.length >= 5) {
    console.log("Too many login attempts, rejecting login.");
    return res.status(429).json({ error: "Too many login attempts." });
  }
  loginAttempts.set(key, [...attempts, now]);

  try {
    db.get(
      "SELECT id, session_token FROM users WHERE username = ?",
      [username],
      async (err, row) => {
        if (err) {
          console.error("Error selecting user:", err.message);
          return res.status(500).json({ error: "Internal server error." });
        }

        if (!row) {
          console.log("User not found, rejecting login.");
          return res.status(400).json({ error: "User not found." });
        }

        const matches = await bcrypt.compare(password, row.id);

        if (!matches) {
          console.log("Password incorrect, rejecting login.");
          return res.status(400).json({ error: "Password incorrect." });
        }

        const newSessionToken = crypto.randomBytes(64).toString("hex");
        const lastlogin = new Date().toISOString();

        db.run(
          "UPDATE users SET session_token = ?, lastlogin = ? WHERE username = ?",
          [newSessionToken, lastlogin, username],
          function (err) {
            if (err) {
              console.error("Error updating user:", err.message);
              return res.status(500).json({ error: "Internal server error." });
            }
            console.log(`A row has been updated with rowid ${this.lastID}`);
            console.log("User logged in successfully.");
            res.status(200).json({
              message: "Logged in successfully.",
              session_token: newSessionToken,
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});
app.post("/verify", (req, res) => {
  const { session_token } = req.body;
  const ip = getReqIp(req);

  console.log(
    "\nHTTPS Verify request from " + ip + ":",
    JSON.stringify({ session_token }, null, 2)
  );

  if (!session_token) {
    console.log("Recieved a bad request on /verify");
    return res.status(400).send("Missing session_token");
  }

  try {
    db.get(
      "SELECT username, lastlogin FROM users WHERE session_token = ?",
      [session_token],
      async (err, row) => {
        if (err) {
          console.error("Error selecting user:", err.message);
          return res.status(500).json({ error: "Internal server error." });
        }

        if (!row) {
          console.log("Invalid session token, rejecting verify.");
          return res.status(400).json({ error: "Invalid session token." });
        }

        const lastLoginTime = new Date(row.lastlogin).getTime();
        const currentTime = Date.now();
        const expiresIn = 48 * 60 * 60 * 1000; // 48 hours

        if (currentTime - lastLoginTime > expiresIn) {
          console.log("Session expired, rejecting verify.");
          return res.status(401).json({ error: "Session expired." });
        }

        const newSessionToken = crypto.randomBytes(64).toString("hex");
        const newLastLogin = new Date().toISOString();

        db.run(
          "UPDATE users SET session_token = ?, lastlogin = ? WHERE session_token = ?",
          [newSessionToken, newLastLogin, session_token],
          (err) => {
            if (err) {
              console.error("Error updating user:", err.message);
              return res.status(500).json({ error: "Internal server error." });
            }
            console.log(`A row has been updated with rowid ${row.id}`);
            console.log(
              "User verified successfully, gave new session token:",
              newSessionToken
            );
            res.status(200).json({
              message: "Verified successfully.",
              session_token: newSessionToken,
              username: row.username,
            });
          }
        );
      }
    );
  } catch (error) {
    console.log("Verify error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

function verifyUserAndSession(socket_message) {
  if (typeof socket_message !== "object") {
    return false;
  }
  const { username, session_token } = socket_message;
  if (!username || !session_token) {
    return false;
  }
  try {
    return db.get(
      "SELECT session_token FROM users WHERE username = ?",
      [username],
      (err, row) => {
        if (err) {
          return false;
        }
        if (!row) {
          return false;
        }
        if (row.session_token !== session_token) {
          return false;
        }
        return true;
      }
    );
  } catch (error) {
    console.log("Verify error:", error);
    return false;
  }
}

// Socket.IO Events
// user_memory stores { username: { socket_id, session_token } }
const user_memory = new Map();
const userPubKeys = new Map();
const message_limit = 5;
const timeframe = 10000;
const messagerate = new Map();
io.on("connection", (socket) => {
  
  // All socket messages are in the expected format of:
  // { username, sesson_token, event, ...other_info_related_to_event }
  console.log("\nClient connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
  const verifyTimeout = setTimeout(() => {
    console.log(`Client ${socket.id} did not verify in time.`);
    socket.disconnect(true);
  }, 10 * 1000);

  // Clients must send the "verify" event first to authenticate. It must have:
  // { username, session_token }
  // The server only sends them things and listens to their events if they pass verification
  socket.on("verify", (verification) => {
    clearTimeout(verifyTimeout);
    let verificationinfo = null;
    try {
      verificationinfo = JSON.parse(verification);
    } catch (error) {
      console.log("Error parsing verification:", error);
      socket.disconnect(true);
      return;
    }
    console.log(`Client ${socket.id} sent session info for verification.`);
    if (!verifyUserAndSession(verificationinfo)) {
      console.log(`Client ${socket.id} failed verification.`);
      socket.disconnect(true);
      return;
    }

    // Client passed socket verification, store their info and attach new events

    user_memory.set(verificationinfo.username, {
      socket_id: socket.id,
      session_token: verificationinfo.session_token,
    });
    console.log(`Client ${socket.id} passed verification. All online users:`, [
      ...user_memory.keys(),
    ]);


    // All socket messages are in the expected format of:
    // { username, session_token, event, ...other_info_related_to_event }
    // event tells us what to do with the other_info, such as "message" or "join"

    // Heartbeat code
    let heartbeatRecieved = true;
    const interval = 30 * 1000; // 30 seconds per heartbeat
    const sendHeartbeat = () => {
      if (!heartbeatRecieved) {
        console.log(`Client ${socket.id} failed to respond to heartbeat.`);
        socket.disconnect(true);
        clearInterval(heartbeatInterval);
        return;
      }
      heartbeatRecieved = false;
      socket.emit("heartbeat");
    };
    socket.on("heartbeat", async (verificationInfo) => {
      heartbeatRecieved = true;
      try {
        const verification = JSON.parse(verificationInfo);
        if (!verifyUserAndSession(verification)) {
          throw new Error("Invalid verification.");
        }
      } catch (error) {
        console.log(`Client ${socket.id} failed heartbeat verification.`);
        socket.disconnect(true);
      }
    });
    let heartbeatInterval = null;
    new Promise((resolve) => setTimeout(resolve, 2000)).then(() => {
      heartbeatInterval = setInterval(sendHeartbeat, interval);
    });

    // Tell all clients that a new user has joined
    for (const [username, user] of user_memory) {
      if (username !== verificationinfo.username) {
        const tablename = msgTableName(username, verificationinfo.username);
        console.log(tablename);
        tableExists(tablename, (err, exists) => {
          if (err) {
            return;
          }
          if (exists) {
            db.all(
              `SELECT * FROM ${tablename} ORDER BY id DESC LIMIT 20`,
              (err, rows) => {
                if (err) {
                  console.error("Error selecting messages:", err.message);
                  return;
                }
                const messages = rows.map((row) => ({
                  sender: row.sender,
                  content: row.message,
                }));
                io.to(user.socket_id).emit(
                  "join",
                  JSON.stringify({
                    username: verificationinfo.username,
                    messages: messages.reverse(),
                  })
                );
              }
            );
          } else {
            io.to(user.socket_id).emit(
              "join",
              JSON.stringify({
                username: verificationinfo.username,
                messages: [],
              })
            );
          }
        });
      }
    }

    // Tell this user all the other online users
    for (const [username, user] of user_memory) {
      if (username !== verificationinfo.username) {
        const tablename = msgTableName(username, verificationinfo.username);
        tableExists(tablename, (err, exists) => {
          if (err) {
            return;
          }
          if (exists) {
            db.all(
              `SELECT * FROM ${tablename} ORDER BY id DESC LIMIT 20`,
              (err, rows) => {
                if (err) {
                  console.error("Error selecting messages:", err.message);
                  return;
                }
                const messages = rows.map((row) => ({
                  sender: row.sender,
                  content: row.message,
                }));
                socket.emit(
                  "join",
                  JSON.stringify({ username, messages: messages.reverse() })
                );
              }
            );
          } else {
            socket.emit("join", JSON.stringify({ username, messages: [] }));
          }
        });
      }
    }
    // Basic Messages, expects format:
    // { username, session_token, to, message }
    // Emits (to both sender and receiver):
    // { username, to, message }
    socket.on("message", (clientMessage) => {
      // Parse message
      let parsedMessage = null;
      try {
        parsedMessage = JSON.parse(clientMessage);
      } catch (error) {
        return;
      }
      const { username, session_token, to, encrypted, message } = parsedMessage;
      if (!username || !session_token || !to || !message) {
        return;
      }
      if (!verifyUserAndSession({ username, session_token })) {
        return;
      }
      if (!user_memory.has(to)) {
        return;
      }
      // Rate limiting
      const now = Date.now();
      if (!messagerate.has(username)) {
        messagerate.set(username, []);
      }
      messagerate.get(username).push(now);
      if (messagerate.get(username).length > message_limit) {
        const timespan = now - messagerate.get(username)[0];
        if (timespan < timeframe) {
          socket.emit("message_rate_limit", "");
          messagerate.get(username).shift();
          return;
        }
        messagerate.get(username).shift();
      }
      delete parsedMessage.session_token;
      console.log(
        `Client ${socket.id} sent message to ${to}:`,
        JSON.stringify(parsedMessage, null, 2)
      );
      const to_socket_id = user_memory.get(to).socket_id;
      const outgoingMessage = JSON.stringify({
        sender: username,
        reciever: to,
        message,
        encrypted: parsedMessage.encrypted ?? false,
      });
      socket.emit("message", outgoingMessage);
      io.to(to_socket_id).emit("message", outgoingMessage);
      const tablename = msgTableName(username, to);
      console.log("Logging message to table:", tablename);
      tableExists(tablename, (err, exists) => {
        if (err) {
          return;
        }
        if (!exists) {
          db.run(
            `CREATE TABLE ${tablename} (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, sender TEXT, timestamp TEXT)`,
            (err) => {
              db.run(
                `INSERT INTO ${tablename} (message, sender, timestamp) VALUES (?, ?, ?)`,
                [message, username, new Date().toISOString()],
                (err) => {
                  if (err) {
                    console.error("Error inserting message:", err.message);
                  }
                }
              );
            }
          );
        } else {
          db.run(
            `INSERT INTO ${tablename} (message, sender, timestamp) VALUES (?, ?, ?)`,
            [message, username, new Date().toISOString()],
            (err) => {
              if (err) {
                console.error("Error inserting message:", err.message);
              }
            }
          );
        }
      });
    });
    socket.on("ecdh_pubkey", ({username, pubkey}) => {
      userPubKeys.set(username, pubkey);
    });
    socket.on("request_pubkey", ({from, to}) => {
      if (userPubKeys.has(to)) {
        const pubkey = userPubKeys.get(to);
        io.to(user_memory.get(from).socket_id).emit("receive_pubkey", { from: to, pubkey});
      }
    });
    // File Transfer handling
    const fileChunks = {};
    socket.on("fileChunk", (clientMessage) => {
      let parsedMessage = null;
      try {
        parsedMessage = JSON.parse(clientMessage);
      } catch (error) {
        return;
      }
      const {
        username,
        session_token,
        type,
        fileName,
        mimeType,
        chunkIndex,
        data,
      } = parsedMessage;
      if (!username || !session_token || !type || !fileName || !mimeType) {
        return;
      }
      if (!verifyUserAndSession({ username, session_token })) {
        return;
      }
      if (!fileChunks[fileName]) {
        fileChunks[fileName] = {
          mimeType,
          chunks: [],
        };
      }

      fileChunks[fileName].chunks[chunkIndex] = new Uint8Array(data);
    });
    socket.on("fileEnd", (clientMessage) => {
      let parsedMessage = null;
      try {
        parsedMessage = JSON.parse(clientMessage);
      } catch (error) {
        return;
      }
      const { username, session_token, to, fileName, totalChunks, mimeType } =
        parsedMessage;
      if (
        !username ||
        !session_token ||
        !totalChunks ||
        !fileName ||
        !mimeType ||
        !to
      ) {
        return;
      }
      if (!verifyUserAndSession({ username, session_token })) {
        return;
      }
      if (
        fileChunks[fileName].chunks.filter((chunk) => chunk).length ===
        totalChunks
      ) {
        const combinedChunks = new Uint8Array(
          fileChunks[fileName].chunks.reduce(
            (acc, chunk) => acc + chunk.length,
            0
          )
        );

        let offset = 0;
        fileChunks[fileName].chunks.forEach((chunk) => {
          combinedChunks.set(chunk, offset);
          offset += chunk.length;
        });

        const fullFileData = combinedChunks;

        const outgoing = JSON.stringify({
          sender: username,
          reciever: to,
          fileData: {
            type: mimeType,
            name: fileName,
            data: Array.from(fullFileData),
          },
        });

        socket.emit("file", outgoing);
        io.to(user_memory.get(to).socket_id).emit("file", outgoing);
      }
      const tablename = msgTableName(username, to);
      console.log("Logging message to table:", tablename);
      tableExists(tablename, (err, exists) => {
        if (err) {
          return;
        }
        if (!exists) {
          // each msg table has an id autoincrementing primary key and a message column, a sender column, and a timestamp column
          db.run(
            `CREATE TABLE ${tablename} (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, sender TEXT, timestamp TEXT)`,
            (err) => {
              db.run(
                `INSERT INTO ${tablename} (message, sender, timestamp) VALUES (?, ?, ?)`,
                [
                  `*Sent a file: ${fileName}*`,
                  username,
                  new Date().toISOString(),
                ],
                (err) => {
                  if (err) {
                    console.error("Error inserting message:", err.message);
                  }
                }
              );
            }
          );
        } else {
          db.run(
            `INSERT INTO ${tablename} (message, sender, timestamp) VALUES (?, ?, ?)`,
            [`*Sent a file: ${fileName}*`, username, new Date().toISOString()],
            (err) => {
              if (err) {
                console.error("Error inserting message:", err.message);
              }
            }
          );
        }
      });
    });
    // Handle disconnects
    socket.on("disconnect", () => {
      // Tell all clients that a user has left
      clearInterval(heartbeatInterval);
      for (const [username, user] of user_memory) {
        if (username !== verificationinfo.username) {
          io.to(user.socket_id).emit(
            "leave",
            JSON.stringify({ username: verificationinfo.username })
          );
        }
      }
      if (user_memory.has(verificationinfo.username)) {
        user_memory.delete(verificationinfo.username);
      }
      console.log(`Client ${socket.id} disconnected. All online users:`, [
        ...user_memory.keys(),
      ]);
    });
  });
});
// Every 10 minutes, dump all chats to text files
setInterval(() => {
  exec("node dump_chats_as_txts.js", (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("\nOutput from periodic chat dump:");
    console.log(stdout);
  });
}, 2 * 60 * 1000);
// Start the server
const port = env.port;
const host = env.host;

server.listen(port, host, () => {
  console.log(`Server listening on https://${host}:${port}`);
});
