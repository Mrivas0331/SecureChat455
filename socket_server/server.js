const express = require('express');
const https = require('https');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();
const env = JSON.parse(fs.readFileSync('env.json', 'utf8'));

// HTTPS Setup
const httpsOptions = {
  key: fs.readFileSync('./certs/key.pem'),
  cert: fs.readFileSync('./certs/cert.pem'),
};

const server = https.createServer(httpsOptions, app);
const io = socketIo(server, {
  cors: {
    origin: env.corsOrigin,
  },
});

// SQLite Database Setup
const db = new sqlite3.Database('./messages.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the messages database.');
});

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT
  )
`);

// Socket.IO Events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('message', (msg) => {
    console.log('Received message:', msg, 'from', socket.id);

    // Store the message in the database
    db.run('INSERT INTO messages (message) VALUES (?)', [msg], function (err) {
      if (err) {
        return console.error(err.message);
      }
      console.log(`A row has been inserted with rowid ${this.lastID}`);
    });

    // Mimic the message back
    socket.emit('message', `Message stored: ${msg}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start the server
const port = env.port;
const host = env.host;

server.listen(port, host, () => {
  console.log(`Server listening on https://${host}:${port}`);
});
