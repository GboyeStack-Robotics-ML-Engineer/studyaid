const WebSocket = require('ws');

class GeminiLiveBridge {
    constructor(socket) {
        this.clientSocket = socket;
        this.geminiWs = null;
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = "models/gemini-2.0-flash-exp"; // Use latest experimental model for Live
    }

    connect() {
        if (!this.apiKey) {
            console.error("GEMINI_API_KEY is missing in .env");
            this.clientSocket.emit('status', { message: 'Error: API Key Missing' });
            return;
        }

        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        console.log('Connecting to Gemini Live API...');

        try {
            this.geminiWs = new WebSocket(url);

            this.geminiWs.on('open', () => {
                console.log('Connected to Gemini Live API');
                this.clientSocket.emit('status', { message: 'Connected to Gemini Intelligence' });
                this.sendSetupMessage();
            });

            this.geminiWs.on('message', (data) => {
                this.handleGeminiMessage(data);
            });

            this.geminiWs.on('close', () => {
                console.log('Gemini Connection Closed');
                this.clientSocket.emit('status', { message: 'Gemini Disconnected' });
            });

            this.geminiWs.on('error', (err) => {
                console.error('Gemini WebSocket Error:', err);
            });

        } catch (error) {
            console.error("Connection failed:", error);
        }
    }

    sendSetupMessage() {
        const setupMsg = {
            setup: {
                model: this.model,
                systemInstruction: {
                    parts: [
                        {
                            text: `You are an advanced Math Tutor with a digital whiteboard.

CRITICAL RULES FOR VISUAL PRESENTATION:
1. **ALWAYS USE draw_on_canvas TOOL**: Whenever you mention ANY visual element (graph, formula, shape, equation), you MUST immediately call the 'draw_on_canvas' tool BEFORE or WHILE explaining it. This includes when YOU are explaining concepts, not just when the user asks.

2. **GRAPHS AND VISUALS**: If you say "let me show you a graph", "here's a plot", "watch this graph", or mention ANY visual demonstration, you MUST use 'draw_on_canvas' with a command like:
   - "graph y = x^2"
   - "plot f(x) = sin(x)"
   - "graph of quadratic function"
   Always trigger visuals through the tool when you describe them.

3. **WRITE QUESTIONS FIRST**: When the user asks a question, your FIRST action must be to use 'draw_on_canvas' to write the question clearly on the board.

4. **STEP-BY-STEP VISUALS**: Break down solutions visually:
   - Draw Step 1 using the tool
   - Explain Step 1 verbally
   - Draw Step 2 using the tool
   - Explain Step 2 verbally

5. **LATEX IS MANDATORY**: For ANY formula or math expression, use LaTeX syntax in the tool:
   - Examples: "y = x^2", "f(x) = \\frac{1}{x}", "E = mc^2", "\\int_0^1 x dx"
   - Always use LaTeX for formulas, equations, and mathematical expressions

6. **BE PROACTIVE WITH VISUALS**: Don't just describe visuals - actually create them using the tool. If you're explaining a concept visually, use the tool immediately.

7. **CLEAR THE BOARD**: If starting a NEW problem, the board clears automatically, so just start drawing the new problem context.

8. **BE CONCISE**: Speak naturally but avoid long monologues. One step at a time.`
                        }
                    ]
                },
                generationConfig: {
                    responseModalities: ["AUDIO"]
                },
                tools: [
                    {
                        functionDeclarations: [
                            {
                                name: "draw_on_canvas",
                                description: "Draws shapes, graphs, or text on the student's whiteboard. For formulas, use LaTeX syntax (e.g. 'E = mc^2', '\\frac{1}{2}'). For graphs, use expressions like 'graph y = x^2' or 'plot f(x) = sin(x)'. Examples: 'graph y = x^2', 'plot f(x) = sin(x)', 'draw a triangle', 'y = 2x + 1'.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        instruction: {
                                            type: "STRING",
                                            description: "Visual instruction: 'graph y = x^2', 'plot f(x) = sin(x)', 'triangle', 'circle', or mathematical formula/LaTeX string."
                                        }
                                    },
                                    required: ["instruction"]
                                }
                            }
                        ]
                    }
                ]
            }
        };
        this.sendJson(setupMsg);
    }

    sendAudioInput(pcmData) {
        if (this.geminiWs && this.geminiWs.readyState === WebSocket.OPEN) {
            const msg = {
                realtimeInput: {
                    mediaChunks: [
                        {
                            mimeType: "audio/pcm;rate=16000",
                            data: pcmData.toString('base64')
                        }
                    ]
                }
            };
            this.sendJson(msg);
        } else {
            console.warn('WebSocket not ready, state:', this.geminiWs?.readyState);
        }
    }

    handleGeminiMessage(data) {
        try {
            const response = JSON.parse(data.toString());

            // DEBUG: Log ALL responses to see what Gemini sends
            console.log('Gemini Response:', JSON.stringify(response, null, 2));

            // 1. Handle Audio Output (ServerContent)
            if (response.serverContent && response.serverContent.modelTurn) {
                const parts = response.serverContent.modelTurn.parts;
                parts.forEach(part => {
                    if (part.inlineData) {
                        console.log("✓ Received Audio Chunk from Gemini");
                        this.clientSocket.emit('audio-output', part.inlineData.data);
                    }
                });
            }

            // 2. Handle Tool Calls
            if (response.toolCall) {
                console.log("✓ Gemini requested tool:", response.toolCall);
                const calls = response.toolCall.functionCalls;
                calls.forEach(call => {
                    if (call.name === 'draw_on_canvas') {
                        const rawInstruction = call.args.instruction;
                        const instructionLower = rawInstruction.toLowerCase();

                        // Parse instruction to determine what to draw
                        let visualCmd = this.parseInstruction(rawInstruction, instructionLower);

                        this.clientSocket.emit('visual-command', visualCmd);

                        // Send toolResponse back
                        this.sendJson({
                            toolResponse: {
                                functionResponses: [
                                    {
                                        response: { result: { status: "success" } },
                                        id: call.id
                                    }
                                ]
                            }
                        });
                    }
                });
            }

        } catch (e) {
            console.error("Error parsing Gemini message", e);
        }
    }

    parseInstruction(instruction, instructionLower) {
        // Check for graph/function drawing commands
        const graphKeywords = ['graph', 'plot', 'function', 'f(x)', 'y =', 'y='];
        const hasGraphKeyword = graphKeywords.some(keyword => instructionLower.includes(keyword));
        
        // Check for mathematical function patterns
        const functionPattern = /(?:y\s*=\s*|f\s*\(\s*x\s*\)\s*=\s*|f\(x\)\s*=\s*)(.+?)(?:\s|$)/i;
        const functionMatch = instruction.match(functionPattern);
        
        // Check if it's a LaTeX expression (formula)
        const hasLatex = /[\\^_{}]/.test(instruction) || 
                        /(?:\\frac|\\sqrt|\\sum|\\int|\\lim)/.test(instruction);
        
        // Check for basic shapes
        if (instructionLower.includes("triangle")) {
            return {
                type: 'DRAW_SHAPE',
                shape: 'triangle',
                points: [[200, 100], [150, 300], [250, 300]],
                color: '#00D2FF',
                animated: true
            };
        }
        else if (instructionLower.includes("circle")) {
            return {
                type: 'DRAW_SHAPE',
                shape: 'circle',
                points: [],
                color: '#00FF00',
                animated: true
            };
        }
        // Check for graph/function drawing
        else if (hasGraphKeyword || functionMatch) {
            let functionExpression = functionMatch ? functionMatch[1].trim() : null;
            
            // If no explicit function found but graph keyword exists, try to extract from instruction
            if (!functionExpression && hasGraphKeyword) {
                // Try to find common patterns: "graph of x^2", "plot sin(x)", etc.
                const patterns = [
                    /(?:of|for)\s+(.+?)(?:\s|$)/i,
                    /(?:the|a)\s+(?:graph|plot|function)\s+(?:of|for)?\s*(.+?)(?:\s|$)/i,
                    /(.+?)(?:\s+graph|\s+plot|$)/i
                ];
                
                for (const pattern of patterns) {
                    const match = instruction.match(pattern);
                    if (match && match[1]) {
                        functionExpression = match[1].trim();
                        break;
                    }
                }
            }
            
            // Default function if none found but graph keyword exists
            if (!functionExpression) {
                functionExpression = 'x^2'; // Default to x^2
            }
            
            return {
                type: 'DRAW_GRAPH',
                function: functionExpression,
                color: '#00D2FF',
                animated: true,
                range: { min: -5, max: 5 },
                label: instruction // Keep original instruction as label
            };
        }
        // Check if it's a LaTeX formula (not a graph command)
        else if (hasLatex || /[=+\-*/()0-9x^a-zA-Z]/.test(instruction)) {
            // Check if it contains mathematical content
            const hasMath = /[=+\-*/()^]/.test(instruction) || 
                           /[a-zA-Z]\s*[=+\-*/]\s*[a-zA-Z0-9]/.test(instruction) ||
                           /[0-9]+[a-zA-Z]|[a-zA-Z][0-9]+/.test(instruction);
            
            return {
                type: 'DRAW_TEXT',
                text: instruction,
                position: null, // Let client auto-position
                color: '#fff',
                animated: true,
                isLatex: hasMath || hasLatex  // Treat as LaTeX if it has math
            };
        }
        // Default: display as text (not math)
        else {
            return {
                type: 'DRAW_TEXT',
                text: instruction,
                position: null, // Let client auto-position
                color: '#fff',
                animated: false,
                isLatex: false
            };
        }
    }

    sendJson(obj) {
        if (this.geminiWs && this.geminiWs.readyState === WebSocket.OPEN) {
            this.geminiWs.send(JSON.stringify(obj));
        }
    }
}

module.exports = GeminiLiveBridge;
