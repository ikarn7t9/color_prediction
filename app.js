const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const moment = require('moment');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Import the logPickedObject function from dbHelper.js
const { logPickedObject } = require('./dbhelper');

// Set up Express and Socket.io
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MySQL connection configuration
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Default XAMPP password for MySQL is empty
    database: 'countdown_db'
});

// Connect to MySQL
db.connect(err => {
    if (err) {
        console.error('MySQL connection error:', err);
        process.exit(1);
    }
    console.log('Connected to MySQL using XAMPP');
});

// Middleware for parsing JSON bodies
app.use(bodyParser.json());

// Serve static files from the 'public' directory
app.use(express.static('public'));

// JWT secret key
const JWT_SECRET = 'your_jwt_secret_key';

// Register endpoint
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
        if (err) {
            console.error('Registration error:', err);
            return res.status(500).json({ error: 'Failed to register' });
        }
        res.status(201).json({ message: 'User registered successfully!' });
    });
});

// Login endpoint
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        const user = results[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    });
});

// Middleware to authenticate requests
function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'Token required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// Timer configuration
const TIMER_DURATION = 120000; // 2 minutes in milliseconds
let timerEndTime = moment().add(TIMER_DURATION, 'milliseconds');
let adminSelectedObject = null;

// Endpoint to get the remaining time
app.get('/time', (req, res) => {
    const remainingTime = Math.max(0, timerEndTime.diff(moment()));
    res.json({ remainingTime });
});

// Endpoint for admin to submit selected object
app.post('/admin/submit', (req, res) => {
    const { number, color } = req.body;
    if (number && color) {
        adminSelectedObject = { number: parseInt(number), color };
        logPickedObject(adminSelectedObject);
        fetchLogs();
        res.sendStatus(200);
    } else {
        res.sendStatus(400);
    }
});

// Fetch logs from the database
function fetchLogs() {
    const query = 'SELECT * FROM logs ORDER BY picked_at DESC';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching logs:', err);
            return;
        }
        io.emit('updateLogs', results);
    });
}

// Socket connection
io.on('connection', (socket) => {
    console.log('A user connected');

    fetchLogs();
    const remainingTime = Math.max(0, timerEndTime.diff(moment()));
    socket.emit('updateTimer', remainingTime);

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Timer logic
function resetTimer() {
    timerEndTime = moment().add(TIMER_DURATION, 'milliseconds');
    pickRandomOrAdminObject();
}

function pickRandomOrAdminObject() {
    if (adminSelectedObject) {
        logPickedObject(adminSelectedObject);
        adminSelectedObject = null;
        fetchLogs();
    } else {
        db.query('SELECT * FROM objects', (err, results) => {
            if (err) throw err;
            const randomObject = results[Math.floor(Math.random() * results.length)];
            logPickedObject(randomObject);
            fetchLogs();
        });
    }
}

// Timer check and update logic
function checkAndUpdateClients() {
    const remainingTime = Math.max(0, timerEndTime.diff(moment()));
    io.emit('updateTimer', remainingTime);

    if (remainingTime <= 0) {
        resetTimer();
    }
}

// Set an interval to update clients every second
setInterval(checkAndUpdateClients, 1000);

// Endpoint to fetch transactions for the logged-in user
app.get('/transactions', authenticateToken, (req, res) => {
    const userId = req.user.userId;

    db.query('SELECT * FROM transactions WHERE user_id = ?', [userId], (err, results) => {
        if (err) {
            console.error('Error fetching transactions:', err);
            return res.status(500).json({ error: 'Failed to fetch transactions' });
        }
        res.json(results);
    });
});

// Payment API to store payment information for logged-in users
app.post('/store-payment', authenticateToken, (req, res) => {
    const { payer_name, upi_id, amount, transaction_id, status } = req.body;
    const userId = req.user.userId;

    const query = `INSERT INTO payments (user_id, payer_name, upi_id, amount, transaction_id, status) 
                   VALUES (?, ?, ?, ?, ?, ?)`;

    db.query(query, [userId, payer_name, upi_id, amount, transaction_id, status], (err, result) => {
        if (err) {
            console.error('Error inserting payment info:', err);
            return res.status(500).json({ error: 'Failed to store payment info' });
        }
        res.status(200).json({ message: 'Payment info stored successfully', paymentId: result.insertId });
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
