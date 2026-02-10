import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import CanvasBoard from './components/CanvasBoard';
import useAudioStream from './hooks/useAudioStream';
import { Mic, MicOff, Play } from 'lucide-react';

// Ensure we use the full URL with protocol
const getServerUrl = () => {
  const url = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
  if (url.startsWith('http')) return url;
  return `https://${url}`;
};

const socket = io(getServerUrl());

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Connecting...');
  const [inputMode, setInputMode] = useState('voice'); // 'voice' or 'text'
  const [textMessage, setTextMessage] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false); // Track when AI is speaking

  // Audio Hook
  const { isRecording, toggleMic } = useAudioStream(socket);

  // PCM Player State
  const audioCtxRef = useRef(null);
  const nextTimeRef = useRef(0);
  const audioStartTimeRef = useRef(null); // When audio playback actually started
  const queuedAudioDurationRef = useRef(0); // Total duration of audio queued
  const visualCommandQueueRef = useRef([]); // Queue of visual commands waiting to be scheduled

  // Reference to CanvasBoard's draw function (passed via callback)
  const drawVisualCommandRef = useRef(null);

  // Timeout for clearing speaking state
  const speakingTimeoutRef = useRef(null);

  const initAudioOutput = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 }); // Gemini 24kHz
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  // Process any queued visual commands once audio timeline is established
  const processVisualCommandQueue = useCallback(() => {
    if (audioStartTimeRef.current === null || visualCommandQueueRef.current.length === 0) {
      return;
    }

    if (!drawVisualCommandRef.current) return;

    console.log('⏯️ Processing', visualCommandQueueRef.current.length, 'queued visual commands');

    // Clear queue and draw immediately
    // The CanvasBoard will handle internal step-by-step animation timing
    const commandsToProcess = [...visualCommandQueueRef.current];
    visualCommandQueueRef.current = [];

    commandsToProcess.forEach((queued) => {
      if (drawVisualCommandRef.current) {
        drawVisualCommandRef.current(queued.cmd);
      }
    });
  }, []);

  // Schedule a visual command - queue it to sync with audio playback
  const scheduleVisualCommand = useCallback((cmd) => {
    console.log('📺 Received visual command:', cmd.type);

    // IMPORTANT: Queue the command instead of drawing immediately
    // This ensures visuals sync with audio, not just arrive whenever the server sends them
    if (audioStartTimeRef.current === null) {
      // Audio hasn't started yet - queue for later
      visualCommandQueueRef.current.push({ cmd, timestamp: Date.now() });
      console.log('🔄 Audio not started yet, queuing visual command');
    } else {
      // Audio is playing - draw immediately since we're already in sync
      if (drawVisualCommandRef.current) {
        drawVisualCommandRef.current(cmd);
      }
    }
  }, []);

  const playPcmChunk = useCallback((base64String) => {
    console.log('🔊 playPcmChunk called with data length:', base64String?.length);

    if (!audioCtxRef.current) initAudioOutput();

    const ctx = audioCtxRef.current;

    // Ensure audio context is running
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Convert base64 -> Int16 -> Float32
    const binaryString = window.atob(base64String);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    // Gemini native audio model uses 24000 Hz sample rate
    const sampleRate = 24000;
    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // INCREASED lookahead buffer to prevent stuttering
    // 200ms provides enough cushion for network jitter and processing delays
    const currentTime = ctx.currentTime;
    const BUFFER_LOOKAHEAD = 0.2; // Increased from 50ms to 200ms

    // Initialize playback timeline on first chunk
    if (nextTimeRef.current === 0) {
      nextTimeRef.current = currentTime + BUFFER_LOOKAHEAD;
    }

    // If we've fallen behind (e.g., due to page being backgrounded), catch up
    if (nextTimeRef.current < currentTime) {
      nextTimeRef.current = currentTime + BUFFER_LOOKAHEAD;
      console.warn('Audio playback fell behind, catching up...');
    }

    // Mark when audio playback actually starts (first chunk)
    if (audioStartTimeRef.current === null) {
      audioStartTimeRef.current = nextTimeRef.current;
    }

    source.start(nextTimeRef.current);
    const chunkDuration = buffer.duration;
    nextTimeRef.current += chunkDuration;
    queuedAudioDurationRef.current += chunkDuration;

    // Mark AI as speaking
    setIsSpeaking(true);

    // Clear previous timeout
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
    }

    // Stop pulsating 500ms after last audio chunk
    speakingTimeoutRef.current = setTimeout(() => {
      setIsSpeaking(false);
    }, chunkDuration * 1000 + 500);

    // Process queued visual commands now that we have audio timeline
    processVisualCommandQueue();
  }, [initAudioOutput, processVisualCommandQueue]);

  const handleScenario = useCallback((scenario) => {
    // Legacy Mock Handler (Keep for testing without API Key)
    setStatusMsg('Tutor is explaining (Mock Mode)...');
    const utterance = new SpeechSynthesisUtterance(scenario.spokenText);
    window.speechSynthesis.speak(utterance);

    // 2. Schedule Visuals
    const startTime = Date.now();

    scenario.visualEvents.forEach(event => {
      setTimeout(() => {
        // Directly emit to our local canvas handler via a custom dispatch or prop
        // For simplicity, we can emit back to socket or just call a global/context handler
        // Here we'll trick the socket listener by simulating an incoming event
        // A better way is to pass a "dispatch" prop to CanvasBoard, but this works for a prototype:
        socket.emit('simulate-local-visual', event.command);
      }, event.timeOffset);
    });
  }, []);

  const handleTestVisual = useCallback(() => {
    socket.emit('request-benchmark', 'triangle');
  }, []);

  const sendTextMessage = useCallback(() => {
    if (textMessage.trim() && isConnected) {
      // Initialize audio output for Gemini's spoken response
      initAudioOutput();
      socket.emit('text-input', textMessage);
      setTextMessage(''); // Clear input after sending
    }
  }, [textMessage, isConnected, initAudioOutput]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  }, [sendTextMessage]);

  // Set up socket event listeners
  useEffect(() => {
    socket.on('connect', () => {
      setIsConnected(true);
      setStatusMsg('Connected to Tutor');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setStatusMsg('Disconnected');
      // Reset audio tracking on disconnect
      audioStartTimeRef.current = null;
      queuedAudioDurationRef.current = 0;
      visualCommandQueueRef.current = [];
    });

    // Handle "Smart" Response (Audio + Visual Sync)
    socket.on('tutor-response', (scenario) => {
      handleScenario(scenario);
    });

    // Handle Gemini Audio (PCM)
    socket.on('audio-output', (base64String) => {
      console.log('🎵 CLIENT: Received audio chunk, length:', base64String?.length || 0);
      playPcmChunk(base64String);
    });

    // Handle Visual Commands - now scheduled to sync with audio
    socket.on('visual-command', (cmd) => {
      scheduleVisualCommand(cmd);
    });

    // Handle status updates from server
    socket.on('status', (data) => {
      if (data.message) {
        setStatusMsg(data.message);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('tutor-response');
      socket.off('audio-output');
      socket.off('visual-command');
      socket.off('status');
    };
  }, [handleScenario, playPcmChunk, scheduleVisualCommand]);

  return (
    <div className="app-container" style={{ padding: '2rem', height: '100vh', boxSizing: 'border-box', display: 'flex', gap: '2rem' }}>

      {/* Left Panel */}
      <div className="glass-panel" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>Gemini Tutor</h1>

        {/* AI Orb - shows different states */}
        <div style={{
          width: '120px', height: '120px',
          borderRadius: '50%',
          background: isRecording
            ? 'radial-gradient(circle, #FF416C 0%, #FF4B2B 100%)'
            : (isSpeaking
              ? 'radial-gradient(circle, #00D2FF 0%, #3A7BD5 100%)'
              : (isConnected ? 'radial-gradient(circle, #00D2FF 0%, #3A7BD5 100%)' : '#333')),
          boxShadow: isRecording
            ? '0 0 30px rgba(255, 65, 108, 0.6)'
            : (isSpeaking
              ? '0 0 40px rgba(0, 210, 255, 0.8)'
              : (isConnected ? '0 0 30px rgba(0, 210, 255, 0.5)' : 'none')),
          marginBottom: '2rem',
          transition: 'all 0.3s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: (isRecording || isSpeaking) ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }}>
          {isRecording ? <Mic size={40} /> : (isSpeaking ? <Mic size={40} /> : <div />)}
        </div>

        <div style={{ marginBottom: 'auto', textAlign: 'center' }}>
          <p style={{ color: '#aaa', marginBottom: '10px' }}>Status: {statusMsg}</p>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column', width: '100%' }}>
          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
            <button
              onClick={() => { setInputMode('voice'); if (isRecording) toggleMic(); }}
              style={{
                flex: 1,
                background: inputMode === 'voice' ? '#00D2FF' : '#333',
                padding: '0.5rem',
                fontSize: '0.9rem'
              }}
            >
              🎤 Voice
            </button>
            <button
              onClick={() => { setInputMode('text'); if (isRecording) toggleMic(); }}
              style={{
                flex: 1,
                background: inputMode === 'text' ? '#00D2FF' : '#333',
                padding: '0.5rem',
                fontSize: '0.9rem'
              }}
            >
              ⌨️ Text
            </button>
          </div>

          {/* Voice Mode Controls */}
          {inputMode === 'voice' && (
            <button onClick={() => { toggleMic(); initAudioOutput(); }} disabled={!isConnected} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              {isRecording ? <><MicOff /> Stop Mic</> : <><Mic /> Start Mic</>}
            </button>
          )}

          {/* Text Mode Controls */}
          {inputMode === 'text' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <textarea
                value={textMessage}
                onChange={(e) => setTextMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message and press Enter..."
                disabled={!isConnected}
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  minHeight: '80px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
              <button
                onClick={sendTextMessage}
                disabled={!isConnected || !textMessage.trim()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  opacity: (!isConnected || !textMessage.trim()) ? 0.5 : 1
                }}
              >
                Send Message
              </button>
            </div>
          )}

          <button onClick={handleTestVisual} disabled={!isConnected} style={{ background: '#333' }}>
            <Play size={16} /> Test "Triangle" Scenario
          </button>
        </div>
      </div>

      {/* Right Panel */}
      <div className="glass-panel" style={{ flex: 2, padding: '1rem' }}>
        <CanvasBoard
          socket={socket}
          onDrawCommand={(drawFn) => {
            drawVisualCommandRef.current = drawFn;
            // Process any queued commands immediately
            if (visualCommandQueueRef.current.length > 0) {
              console.log('Processing', visualCommandQueueRef.current.length, 'queued visual commands');
              visualCommandQueueRef.current.forEach(({ cmd }) => {
                drawFn(cmd);
              });
              visualCommandQueueRef.current = [];
            }
          }}
        />
      </div>

    </div>
  );
}

export default App;
