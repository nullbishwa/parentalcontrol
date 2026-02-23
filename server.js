const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());

// --- ROUTES ---
app.get('/', (req, res) => res.send("Advanced Parental Control Server Active"));

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log(`Connected: ${socket.id}`);

    // Join family room
    socket.on('join-room', (familyId) => {
        socket.join(familyId);
        console.log(`Family ID ${familyId} linked to ${socket.id}`);
    });

    // 1. LIVE LOCATION & BATTERY
    socket.on('update-location', (data) => {
        // Broadcast location to parent
        socket.to(data.familyId).emit('location-receive', data);
        
        // Geofencing Alert
        if (data.isInsideGeofence === false) {
            socket.to(data.familyId).emit('alert-geofence', {
                msg: "Child has exited the Safe Zone!",
                lat: data.lat,
                lng: data.lng
            });
        }
    });

    // 2. AI MOOD & SAFETY RELAY (TFLite Detections)
    socket.on('ai-safety-alert', (data) => {
        console.log(`AI Alert in ${data.familyId}: ${data.category}`);
        socket.to(data.familyId).emit('parent-notification', {
            title: "Safety Alert",
            message: `Potential ${data.category} detected. Severity: ${data.severity}%`,
            content: data.snippet
        });
    });

    // 3. REMOTE CHECK-IN (WebRTC Signaling for Video/Audio)
    socket.on('request-remote-checkin', (data) => {
        // Parent triggers this; Child receives 'start-stream-request'
        socket.to(data.familyId).emit('start-stream-request', { type: data.type });
    });

    socket.on('webrtc-offer', (data) => {
        socket.to(data.familyId).emit('webrtc-offer', data.offer);
    });

    socket.on('webrtc-answer', (data) => {
        socket.to(data.familyId).emit('webrtc-answer', data.answer);
    });
    socket.on('audio-chunk', (data) => {
        socket.to(data.familyId).emit('audio-chunk-receive', data.chunk);
    });

    socket.on('start-audio-request', (data) => {
        socket.to(data.familyId).emit('start-mic-capture');
    });
    socket.on('ice-candidate', (data) => {
        socket.to(data.familyId).emit('ice-candidate', data.candidate);
    });

    // 4. SOS, ALARM & USAGE RELAYS
    socket.on('sos-alert', (data) => {
        console.log(`SOS Alert in room: ${data.familyId}`);
        socket.to(data.familyId).emit('parent-sos-receive', data);
    });

    socket.on('trigger-alarm', (data) => {
        console.log(`Triggering alarm for: ${data.familyId}`);
        socket.to(data.familyId).emit('ring-alarm-command');
    });

    socket.on('usage-report', (data) => {
        socket.to(data.familyId).emit('usage-display', data.appList);
    });

    // 5. ANTI-TAMPER & PERSISTENCE
    socket.on('tamper-alert', (data) => {
        socket.to(data.familyId).emit('parent-notification', {
            title: "SECURITY WARNING",
            message: "Child is attempting to bypass parental controls!"
        });
    });

    socket.on('disconnect', () => console.log("User Disconnected"));
});

// --- RENDER KEEP-ALIVE ---
const APP_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`; 
setInterval(() => {
    axios.get(APP_URL).catch(() => {});
}, 600000); // 10 min ping

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
