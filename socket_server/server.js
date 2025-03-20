const express = require("express");
const https = require("https");
const socketIo = require("socket.io");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");
const fs = require("fs");
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

// Create initial database tables
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT
  )
`);
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
    console.log("Verifying user and session:", username, session_token);
    db.run(
      "SELECT * FROM users WHERE username = ? AND session_token = ?",
      [username, session_token],
      (err, row) => {
        if (err) {
          return false;
        }
        if (!row) {
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
io.on("connection", (socket) => {
  // All socket messages are in the expected format of:
  // { username, sesson_token, event, ...other_info_related_to_event }
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
  const verifyTimeout = setTimeout(() => {
    console.log(`Client ${socket.id} did not verify in time.`);
    socket.disconnect(true);
  }, 10 * 1000);

  // Clients must send the "verify" event first to authenticate. It must have:
  // { username, session_token }
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
    console.log(`Client ${socket.id} sent verification:`, verificationinfo);
    if (!verifyUserAndSession(verificationinfo)) {
      console.log(`Client ${socket.id} failed verification.`);
      socket.disconnect(true);
      return;
    }

    // Client passed socket verification, store their info and attach new events
  });
});

// Start the server
const port = env.port;
const host = env.host;

server.listen(port, host, () => {
  console.log(`Server listening on https://${host}:${port}`);
});
