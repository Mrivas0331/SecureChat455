const express = require("express");
const https = require("https");
const socketIo = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");
const fs = require("fs");
const env = JSON.parse(fs.readFileSync("env.json", "utf8"));

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
  console.log(
    "\nHTTPS Signup request:",
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

// Socket.IO Events
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("message", (msg) => {
    console.log("Received message:", msg, "from", socket.id);

    // Store the message in the database
    db.run("INSERT INTO messages (message) VALUES (?)", [msg], function (err) {
      if (err) {
        return console.error(err.message);
      }
      console.log(`A row has been inserted with rowid ${this.lastID}`);
    });

    // Mimic the message back
    socket.emit("message", `Message stored: ${msg}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Start the server
const port = env.port;
const host = env.host;

server.listen(port, host, () => {
  console.log(`Server listening on https://${host}:${port}`);
});
