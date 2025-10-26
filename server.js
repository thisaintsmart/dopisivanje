const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow images, documents, and PDFs
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('File type not allowed'));
        }
    }
});

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Store connected users
const connectedUsers = new Map();

// Simple XOR encryption for demo purposes (use proper encryption in production)
function encrypt(text, key) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return Buffer.from(result).toString('base64');
}

function decrypt(encryptedText, key) {
    const text = Buffer.from(encryptedText, 'base64').toString();
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Assign random username to new user
    const username = `User${Math.floor(1000 + Math.random() * 9000)}`;
    connectedUsers.set(socket.id, username);

    // Notify everyone about new user
    io.emit('user joined', {
        username: username,
        users: Array.from(connectedUsers.values()),
        timestamp: new Date().toISOString()
    });

    // Handle chat messages
    socket.on('chat message', (data) => {
        const encryptedMessage = encrypt(data.message, 'secret-key-123');
        
        const messageData = {
            id: Date.now().toString(),
            username: connectedUsers.get(socket.id),
            message: encryptedMessage,
            originalMessage: data.message, // For demo - remove in production
            timestamp: new Date().toISOString(),
            type: 'text'
        };

        io.emit('chat message', messageData);
    });

    // Handle file uploads
    socket.on('file upload', (fileData) => {
        const fileInfo = {
            id: Date.now().toString(),
            username: connectedUsers.get(socket.id),
            filename: fileData.filename,
            originalName: fileData.originalName,
            size: fileData.size,
            url: `/uploads/${fileData.filename}`,
            timestamp: new Date().toISOString(),
            type: 'file'
        };

        io.emit('file upload', fileInfo);
    });

    // Handle typing indicators
    socket.on('typing', () => {
        socket.broadcast.emit('user typing', connectedUsers.get(socket.id));
    });

    socket.on('stop typing', () => {
        socket.broadcast.emit('user stop typing', connectedUsers.get(socket.id));
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const username = connectedUsers.get(socket.id);
        connectedUsers.delete(socket.id);
        
        io.emit('user left', {
            username: username,
            users: Array.from(connectedUsers.values()),
            timestamp: new Date().toISOString()
        });
        
        console.log('User disconnected:', socket.id);
    });
});

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        res.json({
            success: true,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            url: `/uploads/${req.file.filename}`
        });
    } catch (error) {
        res.status(500).json({ error: 'Upload failed' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});