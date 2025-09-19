const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// In-memory data structure for rooms and peers
const rooms = {};

// Helper function to get a list of all peers in a room
function getPeersInRoom(roomId) {
    const clients = io.sockets.adapter.rooms.get(roomId);
    if (clients) {
        return Array.from(clients).map(id => ({ id }));
    }
    return [];
}

app.use(express.static(__dirname + '/public'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

io.on('connection', socket => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);

        // Notify all other users in the room about the new user
        const otherPeers = getPeersInRoom(roomId).filter(p => p.id !== socket.id);
        if (otherPeers.length > 0) {
            socket.to(roomId).emit('userJoined', { peerId: socket.id, otherPeers });
        }
    });

    socket.on('offer', (payload) => {
        // Forward the offer to the specific peer
        socket.to(payload.target).emit('offer', payload);
    });

    socket.on('answer', (payload) => {
        // Forward the answer to the specific peer
        socket.to(payload.target).emit('answer', payload);
    });

    socket.on('ice-candidate', (payload) => {
        // Forward the ICE candidate to the specific peer
        socket.to(payload.target).emit('ice-candidate', payload);
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        const rooms = Array.from(socket.rooms);
        rooms.forEach(roomId => {
            // Notify other users that this user has left
            socket.to(roomId).emit('userLeft', { peerId: socket.id });
        });
    });
});
