const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Health Check / Root Route
app.get('/', (req, res) => {
  res.send('StudyAid Server is Running 🚀');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for dev
    methods: ["GET", "POST"]
  }
});

// Mock AI Service State
// const { getTriangleLesson } = require('./services/ScriptedScenario');
const GeminiLiveBridge = require('./services/GeminiLiveBridge');
require('dotenv').config();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Initialize Gemini Bridge for this user
  const gemini = new GeminiLiveBridge(socket);
  gemini.connect();

  socket.emit('status', { status: 'connected', message: 'Gemini Live Ready' });

  // Handle Audio Stream from Client (PCM)
  let audioChunkCount = 0;
  socket.on('audio-input', (data) => {
    audioChunkCount++;
    if (audioChunkCount % 50 === 0) { // Log every 50th chunk to avoid spam
      console.log(`Audio chunks received: ${audioChunkCount} (last size: ${data.byteLength} bytes)`);
    }
    gemini.sendAudioInput(Buffer.from(data));
  });

  // Handle Text Input from Client
  socket.on('text-input', (textMessage) => {
    console.log('📝 Text message received:', textMessage);
    gemini.sendTextInput(textMessage);
  });

  // Handle Manual Benchmark (Legacy simulator)
  socket.on('request-benchmark', (type) => {
    // We can keep this for testing visual-only if needed, or remove.
  });

  // Loopback for local simulation
  socket.on('simulate-local-visual', (cmd) => {
    socket.emit('visual-command', cmd);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    // Clean up Gemini connection if you want
    // gemini.disconnect();
  });
});


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

