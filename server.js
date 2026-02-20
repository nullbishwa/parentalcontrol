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

    // 1. LIVE LOCATION & BATTERY (Basic + Geofencing Alert)
    socket.on('update-location', (data) => {
        // data: { familyId, lat, lng, battery, isInsideGeofence }
        socket.to(data.familyId).emit('location-receive', data);
        
        // If child exits safe zone, the app sends isInsideGeofence: false
        if (data.isInsideGeofence === false) {
            socket.to(data.familyId).emit('alert-geofence', {
                msg: "Child has exited the Safe Zone!",
                lat: data.lat,
                lng: data.lng
            });
        }
    });

    // 2. AI MOOD & SAFETY RELAY
    // Triggered when TFLite on Android detects toxic content
    socket.on('ai-safety-alert', (data) => {
        // data: { familyId, severity, category: "Bullying"|"Depression", snippet: "..." }
        console.log(`AI Alert in ${data.familyId}: ${data.category}`);
        socket.to(data.familyId).emit('parent-notification', {
            title: "Safety Alert",
            message: `Potential ${data.category} detected. Severity: ${data.severity}%`,
            content: data.snippet
        });
    });

    // 3. REMOTE CHECK-IN (WebRTC Signaling)
    // Parent requests to listen/view; Server pings Child app to start WebRTC
    socket.on('request-remote-checkin', (data) => {
        // data: { familyId, type: "audio" | "video" }
        socket.to(data.familyId).emit('start-stream-request', { type: data.type });
    });

    // WebRTC Signaling Handlers (passing the 'handshake' between phones)
    socket.on('webrtc-offer', (data) => {
        socket.to(data.familyId).emit('webrtc-offer', data.offer);
    });
    socket.on('webrtc-answer', (data) => {
        socket.to(data.familyId).emit('webrtc-answer', data.answer);
    });

    // 4. HARDENED PERSISTENCE & ANTI-TAMPER
    socket.on('tamper-alert', (data) => {
        // Triggered if child tries to disable Device Admin or Accessibility
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
