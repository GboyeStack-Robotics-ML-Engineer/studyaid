import { useState, useRef, useEffect } from 'react';

const useAudioStream = (socket) => {
    const [isRecording, setIsRecording] = useState(false);
    const audioContextRef = useRef(null);
    const processorRef = useRef(null);
    const streamRef = useRef(null);
    const isRecordingRef = useRef(false); // Use ref to avoid closure issues

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000 // Try to request 16kHz directly
                }
            });

            streamRef.current = stream;

            const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);

            // Use ScriptProcessor for raw PCM access (AudioWorklet is better but more complex to setup in 1 file for now)
            // Reduced buffer size from 4096 to 2048 to lower latency (from ~256ms to ~128ms at 16kHz)
            const processor = audioContext.createScriptProcessor(2048, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (!socket) {
                    console.error('Socket is null!');
                    return;
                }
                if (!isRecordingRef.current) { // Check ref instead of state
                    return;
                }

                const inputData = e.inputBuffer.getChannelData(0);

                // Convert Float32 to Int16 PCM
                const pcmData = floatTo16BitPCM(inputData);

                // Emit audio without verbose logging (was slowing down)
                socket.emit('audio-input', pcmData);
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            isRecordingRef.current = true; // Set ref
            setIsRecording(true);
            console.log('Microphone started (PCM 16kHz)');

        } catch (err) {
            console.error('Error accessing microphone:', err);
        }
    };

    const stopRecording = () => {
        isRecordingRef.current = false; // Clear ref
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsRecording(false);
        console.log('Microphone stopped');
    };

    const toggleMic = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    // Helper: Float32 -> Int16
    const floatTo16BitPCM = (input) => {
        let output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            let s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output.buffer;
    };

    return { isRecording, toggleMic };
};

export default useAudioStream;
