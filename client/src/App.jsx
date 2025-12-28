import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import CanvasBoard from './components/CanvasBoard';
import useAudioStream from './hooks/useAudioStream';
import { Mic, MicOff, Play } from 'lucide-react';

const socket = io('http://localhost:3001');

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Connecting...');

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

    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    const currentAudioTime = ctx.currentTime;
    const audioElapsed = currentAudioTime - audioStartTimeRef.current;

    // Process each queued command
    const commandsToSchedule = [...visualCommandQueueRef.current];
    visualCommandQueueRef.current = []; // Clear immediately to prevent double-processing

    commandsToSchedule.forEach((queued, index) => {
      // Schedule visual to appear after some audio has played
      // First visual appears sooner, subsequent ones appear later
      const delaySeconds = 0.8 + (index * 0.3); // Stagger visuals slightly
      const scheduleTime = audioStartTimeRef.current + delaySeconds;
      const msDelay = Math.max(0, (scheduleTime - currentAudioTime) * 1000);

      setTimeout(() => {
        if (drawVisualCommandRef.current) {
          drawVisualCommandRef.current(queued.cmd);
        }
      }, msDelay);
    });
  }, []);

  // Schedule a visual command to appear at the right time relative to audio
  const scheduleVisualCommand = useCallback((cmd) => {
    if (!audioCtxRef.current) {
      // No audio context yet, queue it
      visualCommandQueueRef.current.push({ cmd, timestamp: Date.now() });
      return;
    }

    const ctx = audioCtxRef.current;
    
    // If audio hasn't started yet, queue the command
    if (audioStartTimeRef.current === null) {
      visualCommandQueueRef.current.push({ cmd, timestamp: Date.now() });
      return;
    }

    // Calculate when this visual should appear
    // Strategy: Visual should appear roughly when the audio explaining it is playing
    // Since tool calls usually come before the audio mentioning them,
    // we schedule the visual to appear after some audio has played
    
    const currentAudioTime = ctx.currentTime;
    const audioElapsed = currentAudioTime - audioStartTimeRef.current;
    
    // Estimate when visual should appear:
    // - If audio just started, delay slightly (let audio introduce the visual)
    // - If audio has been playing, schedule based on current position
    // - Use a small delay (0.5-1.5s) to let the audio "introduce" the visual
    
    let delaySeconds = 0.8; // Default delay to let audio introduce the visual
    
    if (audioElapsed < 0.5) {
      // Audio just started, wait a bit more
      delaySeconds = 1.0;
    } else if (audioElapsed < 2.0) {
      // Audio has been playing, shorter delay
      delaySeconds = 0.5;
    }
    
    // Calculate when to show the visual (in real-world time)
    const scheduleTime = currentAudioTime + delaySeconds;
    const now = ctx.currentTime;
    const msDelay = Math.max(0, (scheduleTime - now) * 1000);

    // Schedule the visual command
    setTimeout(() => {
      if (drawVisualCommandRef.current) {
        drawVisualCommandRef.current(cmd);
      }
    }, msDelay);
  }, []);

  const playPcmChunk = useCallback((base64String) => {
    if (!audioCtxRef.current) initAudioOutput();

    const ctx = audioCtxRef.current;
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

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // Track audio timeline for synchronization
    const currentTime = ctx.currentTime;
    if (nextTimeRef.current < currentTime) {
      nextTimeRef.current = currentTime;
    }
    
    // Mark when audio playback actually starts (first chunk)
    if (audioStartTimeRef.current === null) {
      audioStartTimeRef.current = nextTimeRef.current;
    }

    source.start(nextTimeRef.current);
    const chunkDuration = buffer.duration;
    nextTimeRef.current += chunkDuration;
    queuedAudioDurationRef.current += chunkDuration;

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

        <div style={{
          width: '120px', height: '120px',
          borderRadius: '50%',
          background: isRecording ? 'radial-gradient(circle, #FF416C 0%, #FF4B2B 100%)' : (isConnected ? 'radial-gradient(circle, #00D2FF 0%, #3A7BD5 100%)' : '#333'),
          boxShadow: isRecording ? '0 0 30px rgba(255, 65, 108, 0.6)' : (isConnected ? '0 0 30px rgba(0, 210, 255, 0.5)' : 'none'),
          marginBottom: '2rem',
          transition: 'all 0.5s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {isRecording ? <Mic size={40} /> : <div />}
        </div>

        <div style={{ marginBottom: 'auto', textAlign: 'center' }}>
          <p style={{ color: '#aaa', marginBottom: '10px' }}>Status: {statusMsg}</p>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column', width: '100%' }}>
          <button onClick={() => { toggleMic(); initAudioOutput(); }} disabled={!isConnected} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            {isRecording ? <><MicOff /> Stop Mic</> : <><Mic /> Start Mic</>}
          </button>

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
          }}
        />
      </div>

    </div>
  );
}

export default App;
