const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.db');

const fs = require('node:fs');

fs.readFile('./initdb.sql', 'utf8', (err, data) => {
  if (err) {
    console.error(err);
    return;
  }

  let statements = data.split(';');

  for (let i = 0; i < statements.length - 1; i++) {
    // console.log( statements[i]);
    db.serialize(function() {
      db.run(statements[i])
    })
  }

  db.close();
});
