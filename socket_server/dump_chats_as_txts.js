const sqlite3 = require("sqlite3").verbose();
const e = require("express");
const fs = require("fs");
const path = require("path");

const db = new sqlite3.Database("./secure_chat.db", (err) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
});

const ignoredTables = ["sqlite_sequence", "sqlite_stat1", "users", "messages"];

const pathToHere = path.resolve(__dirname);
const chatsDir = path.join(pathToHere, "chats");
if (!fs.existsSync(chatsDir)) {
  fs.mkdirSync(chatsDir);
}

db.serialize(() => {
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    tables.forEach((table) => {
      if (ignoredTables.includes(table.name)) return;
      console.log(`Dumping ${table.name} to .txt file...`);
      const [username1, username2] = table.name.split("_");
      const chatPath = path.join(chatsDir, `${username1}_${username2}.txt`);
      db.all(`SELECT * FROM ${table.name}`, (err, rows) => {
        if (err) {
          console.error(err.message);
          process.exit(1);
        }
        fs.writeFile(
          chatPath,
          `Chats between ${username1} and ${username2}:\n\n` +
            rows
              .map((row) => {
                return `[${row.timestamp}] ${row.sender}: ${row.message}`;
              })
              .join("\n") +
            "\n",
          (err) => {
            if (err) {
              console.error(err.message);
              process.exit(1);
            } else {
              console.log(`Dumped ${table.name} to ${chatPath}`);
            }
          }
        );
      });
    });
  });
});