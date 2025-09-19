const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// A simple in-memory store for rooms and their peers
const rooms = {};

// Serve the static frontend files from the public directory
app.use(express.static(__dirname + '/public'));

// Explicitly serve the login.html file for the root URL
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

io.on('connection', socket => {
    console.log('A user connected:', socket.id);

    // When a user joins a room
    socket.on('joinRoom', (roomId, userName) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { peers: [] };
        }

        // Add the new peer to the room
        rooms[roomId].peers.push({ id: socket.id, name: userName });
        socket.join(roomId);

        // Notify all other peers in the room about the new user
        socket.to(roomId).emit('userJoined', { id: socket.id, name: userName });
        
        // Send a list of all existing peers back to the new user
        const existingPeers = rooms[roomId].peers.filter(peer => peer.id !== socket.id);
        socket.emit('existingPeers', existingPeers);

        console.log(`User ${userName} joined room ${roomId}. Total users: ${rooms[roomId].peers.length}`);
    });

    // Handle the WebRTC signaling
    socket.on('offer', (payload) => {
        io.to(payload.target).emit('offer', payload);
    });

    socket.on('answer', (payload) => {
        io.to(payload.target).emit('answer', payload);
    });

    socket.on('ice-candidate', (payload) => {
        io.to(payload.target).emit('ice-candidate', payload);
    });

    // Handle disconnects
    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        for (const roomId in rooms) {
            rooms[roomId].peers = rooms[roomId].peers.filter(peer => peer.id !== socket.id);
            socket.to(roomId).emit('userLeft', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
