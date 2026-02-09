const { GoogleGenAI, Modality } = require('@google/genai');
const path = require('path');

class GeminiLiveBridge {
    constructor(socket) {
        this.clientSocket = socket;
        this.session = null;

        // ===== CONFIGURABLE OPTIONS =====
        this.model = "gemini-2.5-flash-native-audio-preview-12-2025";

        // Voice Options: "Puck", "Charon", "Kore", "Fenrir", "Aoede"
        // Puck = friendly/casual, Charon = deep/serious, Kore = soft/gentle
        // Fenrir = energetic, Aoede = melodic/warm
        this.voiceName = "Charon"; // Change this to your preferred voice
        // =================================

        this.credentialsPath = path.join(__dirname, '..', 'service-account.json');

        // Set GOOGLE_APPLICATION_CREDENTIALS environment variable
        // This allows the SDK to use Application Default Credentials (ADC)
        process.env.GOOGLE_APPLICATION_CREDENTIALS = this.credentialsPath;
    }

    async connect() {
        console.log('Initializing with Service Account credentials (ADC)...');
        console.log('Credentials path:', this.credentialsPath);

        try {
            // Step 1: Create client WITHOUT API key - uses ADC (service account)
            // This is how Google's official docs show it: genai.Client(http_options={'api_version': 'v1alpha'})
            const tokenClient = new GoogleGenAI({
                httpOptions: { apiVersion: 'v1alpha' }
            });

            console.log('Creating ephemeral token via SDK...');

            // Step 2: Create ephemeral token with retry logic
            const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

            let tokenResult = null;
            let retries = 3;

            while (retries > 0 && !tokenResult) {
                try {
                    tokenResult = await tokenClient.authTokens.create({
                        config: {
                            uses: 1,
                            expireTime: expireTime,
                            httpOptions: { apiVersion: 'v1alpha' }
                        }
                    });
                    break; // Success, exit retry loop
                } catch (tokenError) {
                    retries--;
                    if (retries > 0) {
                        console.log(`Token creation failed, retrying... (${retries} attempts left)`);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
                    } else {
                        throw tokenError; // No more retries
                    }
                }
            }

            console.log('✅ Ephemeral token created:', tokenResult && tokenResult.name ? 'success' : 'failed');

            if (!tokenResult || !tokenResult.name) {
                throw new Error('Failed to create ephemeral token - no token returned');
            }

            // Step 3: Connect to Live API using the ephemeral token (as API key)
            // IMPORTANT: Must use v1alpha as per SDK warning
            const liveClient = new GoogleGenAI({
                apiKey: tokenResult.name,
                httpOptions: { apiVersion: 'v1alpha' }
            });

            const config = {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: this.voiceName
                        }
                    }
                },
                systemInstruction: {
                    parts: [
                        { text: "You are an expert Math Tutor with the style of 3Blue1Brown. When a user asks for a solution or explanation, YOU MUST use the 'animate_solution' tool to provide a step-by-step visual breakdown. IMPORTANT: You must VERBALLY explain the steps as you show them. Do not just show the steps and stay silent. Narration is key. Use LaTeX for all math equations." }
                    ]
                },
                tools: [
                    {
                        functionDeclarations: [
                            {
                                name: "draw_on_canvas",
                                description: "Draws simple static shapes or single graphs. Use this for quick, simple visuals.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        instruction: { type: "STRING" }
                                    },
                                    required: ["instruction"]
                                }
                            },
                            {
                                name: "animate_solution",
                                description: "Explains a math problem step-by-step with synchronized text animations. Use this for ALL problem solving explanations to give a 3Blue1Brown style experience.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        title: { type: "STRING", description: "The problem title or question." },
                                        steps: {
                                            type: "ARRAY",
                                            items: { type: "STRING" },
                                            description: "Array of step-by-step mathematical derivations (LaTeX supported)."
                                        }
                                    },
                                    required: ["title", "steps"]
                                }
                            }
                        ]
                    }
                ]
            };

            this.session = await liveClient.live.connect({
                model: this.model,
                config: config,
                callbacks: {
                    onmessage: (response) => this.handleGeminiMessage(response),
                    onclose: (e) => {
                        console.log('Gemini Closed:', e.reason);
                        this.clientSocket.emit('status', { message: 'Gemini Disconnected' });
                    },
                    onerror: (e) => {
                        console.log('Gemini Error:', e);
                        this.clientSocket.emit('status', { message: 'Gemini Error: ' + e.message });
                    }
                }
            });

            // Handle Errors
            this.clientSocket.on('disconnect', () => {
                if (this.session) {
                    // session cleanup if needed
                }
            });

        } catch (error) {
            console.error("Connection failed:", error);
            this.clientSocket.emit('status', { message: 'Connection Error: ' + error.message });
        }
    }

    sendAudioInput(pcmData) {
        if (this.session) {
            this.session.sendRealtimeInput({
                audio: {
                    data: pcmData.toString('base64'),
                    mimeType: "audio/pcm;rate=16000"
                }
            });
        }
    }

    sendTextInput(textMessage) {
        if (this.session) {
            // Use sendClientContent for text, not sendRealtimeInput
            this.session.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: textMessage }] }]
            });
        }
    }

    handleGeminiMessage(response) {
        try {
            // 1. Handle Audio Response
            if (response.serverContent && response.serverContent.modelTurn && response.serverContent.modelTurn.parts) {
                for (const part of response.serverContent.modelTurn.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        console.log('🔊 Sending audio chunk:', part.inlineData.data.length, 'bytes');
                        this.clientSocket.emit('audio-output', part.inlineData.data);
                    }
                }
            }

            // 2. Handle Tool Call (Visual Commands)
            if (response.toolCall) {
                console.log("✓ Gemini requested tool:", JSON.stringify(response.toolCall));
                const calls = response.toolCall.functionCalls;
                if (calls) {
                    calls.forEach(call => {
                        // --- ANIMATED SOLUTION TOOL ---
                        if (call.name === 'animate_solution') {
                            const title = call.args.title || "Solution";
                            const steps = call.args.steps || [];

                            console.log('🎬 Animating Solution:', title, steps.length, 'steps');

                            this.clientSocket.emit('visual-command', {
                                type: 'ANIMATE_SEQUENCE',
                                title: title,
                                steps: steps,
                                color: '#00D2FF'
                            });
                        }

                        // --- DRAW ON CANVAS TOOL ---
                        else if (call.name === 'draw_on_canvas') {
                            const rawInstruction = call.args.instruction || '';
                            const instructionLower = rawInstruction.toLowerCase();

                            let visualCmd = { type: 'DRAW_TEXT', text: rawInstruction, position: [400, 300], color: '#fff' };

                            // Shape detection
                            if (instructionLower.includes("triangle")) {
                                visualCmd = { type: 'DRAW_SHAPE', shape: 'triangle', points: [[400, 100], [200, 400], [600, 400]], color: '#00D2FF' };
                            } else if (instructionLower.includes("circle")) {
                                visualCmd = { type: 'DRAW_SHAPE', shape: 'circle', points: [], color: '#00FF00' };
                            }
                            // Graph/Function detection
                            else if (instructionLower.includes("sine") || instructionLower.includes("sin(")) {
                                visualCmd = { type: 'DRAW_GRAPH', function: 'sin(x)', range: { min: -6.28, max: 6.28 }, color: '#00D2FF', label: true };
                            } else if (instructionLower.includes("cosine") || instructionLower.includes("cos(")) {
                                visualCmd = { type: 'DRAW_GRAPH', function: 'cos(x)', range: { min: -6.28, max: 6.28 }, color: '#FF6B6B', label: true };
                            } else if (instructionLower.includes("tangent") || instructionLower.includes("tan(")) {
                                visualCmd = { type: 'DRAW_GRAPH', function: 'tan(x)', range: { min: -3.14, max: 3.14 }, color: '#FFBE0B', label: true };
                            } else if (instructionLower.includes("parabola") || instructionLower.includes("x^2") || instructionLower.includes("x squared")) {
                                visualCmd = { type: 'DRAW_GRAPH', function: 'x^2', range: { min: -5, max: 5 }, color: '#00D2FF', label: true };
                            } else if (instructionLower.includes("cubic") || instructionLower.includes("x^3") || instructionLower.includes("x cubed")) {
                                visualCmd = { type: 'DRAW_GRAPH', function: 'x^3', range: { min: -3, max: 3 }, color: '#FF6B6B', label: true };
                            } else if (instructionLower.includes("exponential") || instructionLower.includes("e^x")) {
                                visualCmd = { type: 'DRAW_GRAPH', function: 'exp(x)', range: { min: -3, max: 3 }, color: '#00FF00', label: true };
                            } else if (instructionLower.includes("linear") || instructionLower.includes("straight line")) {
                                visualCmd = { type: 'DRAW_GRAPH', function: 'x', range: { min: -5, max: 5 }, color: '#FFFFFF', label: true };
                            } else if (instructionLower.includes("square root") || instructionLower.includes("sqrt")) {
                                visualCmd = { type: 'DRAW_GRAPH', function: 'sqrt(x)', range: { min: 0, max: 10 }, color: '#FF6B6B', label: true };
                            } else if (instructionLower.includes("graph") || instructionLower.includes("plot")) {
                                // Generic graph request - try to extract function
                                visualCmd = { type: 'DRAW_GRAPH', function: 'x^2', range: { min: -5, max: 5 }, color: '#00D2FF', label: true };
                            }

                            console.log('📊 Sending visual command:', visualCmd.type, visualCmd.function || visualCmd.shape || visualCmd.text);
                            this.clientSocket.emit('visual-command', visualCmd);

                            // Tool Response disabled for now - SDK parsing issue
                            // The visual command is still sent to the client, just no response to Gemini
                            // TODO: Fix when SDK tool response format is clarified
                        }
                    });
                }
            }

        } catch (e) {
            console.error("Error parsing Gemini message", e);
        }
    }
}

module.exports = GeminiLiveBridge;
