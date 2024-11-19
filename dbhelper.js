const mysql = require('mysql2');

// MySQL connection configuration
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', // Default XAMPP password for MySQL is empty
  database: 'countdown_db'
});

// Connect to the database
db.connect(err => {
  if (err) {
    console.error('MySQL connection error:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL using XAMPP');
});

// Log picked object function
function logPickedObject(object) {
  // First, insert the new picked object into the logs table
  db.query(
    'INSERT INTO logs (object_number, color) VALUES (?, ?)',
    [object.number, object.color],
    (err, result) => {
      if (err) throw err;
      console.log(`Picked object number: ${object.number}, color: ${object.color}`);

      // After insertion, check the number of rows in the logs table
      db.query('SELECT COUNT(*) AS count FROM logs', (err, result) => {
        if (err) throw err;

        const count = result[0].count;

        // If there are more than 25 entries, delete the oldest ones
        if (count > 25) {
          const rowsToDelete = count - 25;

          db.query(
            'DELETE FROM logs ORDER BY id ASC LIMIT ?',
            [rowsToDelete],
            (err, result) => {
              if (err) throw err;
              console.log(`Deleted ${rowsToDelete} old log(s) to maintain the limit of 25 entries.`);
            }
          );
        }
      });
    }
  );
}

// Export the function
module.exports = {
  logPickedObject
};
