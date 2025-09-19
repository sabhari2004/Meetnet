const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mediasoup = require('mediasoup');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- Mediasoup Variables ---
let worker;
const rooms = {};
const peers = {};

const mediaCodecs = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
    },
    {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
            'x-google-start-bitrate': 1000
        }
    }
];

// --- Helper functions for state management ---
function getRouterBySocketId(socketId) {
    const roomId = getRoomIdBySocketId(socketId);
    if (roomId && rooms[roomId]) {
        return rooms[roomId].router;
    }
    return null;
}

function getRoomIdBySocketId(socketId) {
    for (const roomId in rooms) {
        if (rooms[roomId].peers.has(socketId)) {
            return roomId;
        }
    }
    return null;
}

function getProducerById(producerId) {
    for (const roomId in rooms) {
        for (const peerId of rooms[roomId].peers.keys()) {
            if (peers[peerId].producers.has(producerId)) {
                return peers[peerId].producers.get(producerId);
            }
        }
    }
    return null;
}

// --- Server Setup ---
app.use(express.static(__dirname + '/public'));

// --- Mediasoup Worker Initialization ---
async function createWorker() {
    try {
        worker = await mediasoup.createWorker({
            logLevel: 'debug',
            logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
        });
        console.log('Mediasoup worker created successfully');
    } catch (error) {
        console.error('Failed to create mediasoup worker:', error);
        return;
    }

    worker.on('died', () => {
        console.error('Mediasoup worker died, exiting in 2 seconds...');
        setTimeout(() => process.exit(1), 2000);
    });

    // Create a single router for the worker to use.
    // In a multi-room app, you would create a router per room.
    const router = await worker.createRouter({ mediaCodecs });
    worker.router = router;

    // Now that the worker and router are ready, start the server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

createWorker();

// --- Socket.IO Logic ---
io.on('connection', socket => {
    console.log('A user connected:', socket.id);

    // Get the server's RTP capabilities for the client
    socket.on('getRtpCapabilities', (callback) => {
        if (worker && worker.router) {
            callback(worker.router.rtpCapabilities);
        } else {
            console.error('Mediasoup worker or router not ready.');
            callback(null);
        }
    });

    // When a user joins a room
    socket.on('joinRoom', async ({ roomId, rtpCapabilities }) => {
        if (!rooms[roomId]) {
            // Create a new room with a Mediasoup Router
            const router = await worker.createRouter({ mediaCodecs });
            rooms[roomId] = { router, peers: new Map() };
        }

        const router = rooms[roomId].router;
        const peer = {
            id: socket.id,
            transports: new Map(),
            producers: new Map(),
            consumers: new Map()
        };
        peers[socket.id] = peer;
        rooms[roomId].peers.set(socket.id, peer);
    });

    // Create a transport for sending or receiving media
    socket.on('createTransport', async (payload, callback) => {
        const { isProducer } = payload;
        const router = getRouterBySocketId(socket.id);
        if (!router) return;

        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: '103.224.33.35', announcedIp: null }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        });

        const transportData = {
            transportId: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters
        };
        callback(transportData);

        peers[socket.id].transports.set(transport.id, transport);
    });

    // ... (rest of the code for 'produce', 'consume', 'disconnect') ...
});