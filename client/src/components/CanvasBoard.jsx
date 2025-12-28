import React, { useRef, useEffect, useState, useCallback } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Function parser to evaluate mathematical expressions
const parseFunction = (expression) => {
    // Clean up the expression
    let expr = expression.replace(/\s/g, '').toLowerCase();
    
    // Convert common patterns to JavaScript-compatible format
    expr = expr
        .replace(/x\^(\d+)/g, 'Math.pow(x, $1)')  // x^2 -> Math.pow(x, 2)
        .replace(/x\^\((.+?)\)/g, 'Math.pow(x, $1)')  // x^(1/2) -> Math.pow(x, 1/2)
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/exp\(/g, 'Math.exp(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/log\(/g, 'Math.log10(')
        .replace(/sqrt\(/g, 'Math.sqrt(')
        .replace(/abs\(/g, 'Math.abs(');
    
    return (x) => {
        try {
            // Use Function constructor for safe evaluation
            // eslint-disable-next-line no-new-func
            const fn = new Function('x', 'Math', `return ${expr}`);
            return fn(x, Math);
        } catch (e) {
            console.error('Error evaluating function:', e);
            return 0;
        }
    };
};

const CanvasBoard = ({ socket, onDrawCommand }) => {
    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const [activeCommand, setActiveCommand] = useState(null);
    const animationFrameRef = useRef(null);
    const textLayoutRef = useRef({ nextY: 100, elements: [] }); // Track text positions

    // Function to draw a graph with optional animation (defined before drawCommand)
    const drawGraph = useCallback((cmd, ctx, canvas, overlay, animated = true) => {
        const width = canvas.width;
        const height = canvas.height;
        const padding = 60;
        const graphWidth = width - 2 * padding;
        const graphHeight = height - 2 * padding;

        // Parse function
        const func = parseFunction(cmd.function || 'x^2');
        const range = cmd.range || { min: -5, max: 5 };
        const color = cmd.color || '#00D2FF';

        // Calculate scale and origin
        const xScale = graphWidth / (range.max - range.min);
        const yRange = 5;
        const yScale = graphHeight / (2 * yRange);
        
        // Calculate origin position: x=0 should be at center, or at padding if range doesn't include 0
        let originX;
        if (range.min <= 0 && range.max >= 0) {
            // Range includes 0, so center the origin at x=0
            originX = padding + (0 - range.min) * xScale;
        } else {
            // Range doesn't include 0, center the graph area
            originX = width / 2;
        }
        const originY = height / 2;

        // Helper to draw axes and grid (uses variables from outer scope)
        const drawAxesAndGrid = () => {
            
            // Draw grid
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            for (let i = Math.ceil(range.min); i <= Math.floor(range.max); i++) {
                if (i === 0) continue;
                const x = padding + (i - range.min) * xScale;
                ctx.beginPath();
                ctx.moveTo(x, padding);
                ctx.lineTo(x, height - padding);
                ctx.stroke();
            }
            for (let i = -yRange; i <= yRange; i++) {
                if (i === 0) continue;
                const y = originY - i * yScale;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(width - padding, y);
                ctx.stroke();
            }

            // Draw axes
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 2;
            // X-axis at y = originY
            ctx.beginPath();
            ctx.moveTo(padding, originY);
            ctx.lineTo(width - padding, originY);
            ctx.stroke();
            // Y-axis at x = originX
            ctx.beginPath();
            ctx.moveTo(originX, padding);
            ctx.lineTo(originX, height - padding);
            ctx.stroke();

            // Draw axis labels
            ctx.fillStyle = '#aaa';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('0', originX + 5, originY + 20);
            ctx.fillText('x', width - padding + 10, originY + 20);
            ctx.textAlign = 'left';
            ctx.fillText('y', originX + 5, padding - 10);
        };

        // Draw axes first
        drawAxesAndGrid();

        // Generate points with corrected positioning
        const points = [];
        const step = (range.max - range.min) / (graphWidth * 2);
        
        for (let x = range.min; x <= range.max; x += step) {
            try {
                const y = func(x);
                if (isFinite(y) && Math.abs(y) < 100) {
                    // Calculate pixel position: map x from [range.min, range.max] to [padding, padding+graphWidth]
                    const pixelX = padding + (x - range.min) * xScale;
                    // Calculate y position: map y to canvas coordinates (invert y-axis)
                    const pixelY = originY - y * yScale;
                    points.push({ x: pixelX, y: pixelY });
                }
            } catch (e) {
                // Skip invalid points
            }
        }

        if (animated) {
            // Animated drawing
            let currentIndex = 0;
            const totalPoints = points.length;
            const animationDuration = 2000;
            const startTime = performance.now();

            const animate = (timestamp) => {
                const elapsed = timestamp - startTime;
                const progress = Math.min(elapsed / animationDuration, 1);
                currentIndex = Math.floor(progress * totalPoints);

                // Clear graph area (preserve axes)
                ctx.fillStyle = '#1e1e1e';
                ctx.fillRect(padding, padding, graphWidth, graphHeight);
                drawAxesAndGrid();

                // Draw graph up to current point
                if (currentIndex > 0) {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(points[0].x, points[0].y);
                    
                    for (let i = 1; i < currentIndex; i++) {
                        ctx.lineTo(points[i].x, points[i].y);
                    }
                    ctx.stroke();
                }

                if (progress < 1) {
                    animationFrameRef.current = requestAnimationFrame(animate);
                } else {
                    animationFrameRef.current = null;
                }
            };

            animationFrameRef.current = requestAnimationFrame(animate);
        } else {
            // Immediate drawing
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        }

        // Draw function label if provided
        if (cmd.label && overlay) {
            const labelDiv = document.createElement('div');
            labelDiv.style.position = 'absolute';
            labelDiv.style.top = `${padding + 10}px`;
            labelDiv.style.left = `${padding + 10}px`;
            labelDiv.style.color = color;
            labelDiv.style.fontSize = '16px';
            labelDiv.style.fontFamily = 'Inter, sans-serif';
            labelDiv.style.opacity = animated ? '0' : '1';
            labelDiv.style.transition = animated ? 'opacity 0.5s ease-in 0.5s' : 'none';
            labelDiv.textContent = `f(x) = ${cmd.function}`;
            overlay.appendChild(labelDiv);
            
            if (animated) {
                requestAnimationFrame(() => {
                    labelDiv.style.opacity = '1';
                });
            }
        }
    }, []);

    const drawCommand = useCallback((cmd) => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        console.log('Drawing command:', cmd);
        setActiveCommand(cmd);

        // Cancel any ongoing animation
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        // ALWAYS clear both canvas and overlay for fresh start
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (overlay) overlay.innerHTML = '';
        
        // Reset text layout when clearing or starting new content
        if (cmd.type === 'CLEAR' || cmd.clearLayout) {
            textLayoutRef.current.nextY = 100;
            textLayoutRef.current.elements = [];
            if (cmd.type === 'CLEAR') {
                return;
            }
        }

        // Handle graph drawing with animation
        if (cmd.type === 'DRAW_GRAPH') {
            drawGraph(cmd, ctx, canvas, overlay, cmd.animated !== false);
            return;
        }

        if (cmd.type === 'DRAW_SHAPE') {
            ctx.strokeStyle = cmd.color || '#00D2FF';
            ctx.fillStyle = cmd.color || '#00D2FF';
            ctx.lineWidth = 4;

            if (cmd.shape === 'circle') {
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const radius = 100;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (cmd.points && cmd.points.length > 0) {
                ctx.beginPath();
                ctx.moveTo(cmd.points[0][0], cmd.points[0][1]);
                cmd.points.forEach((p, i) => {
                    if (i > 0) ctx.lineTo(p[0], p[1]);
                });
                ctx.closePath();
                ctx.stroke();
            }
        }

        if (cmd.type === 'DRAW_TEXT') {
            const text = cmd.text || '';

            // Enhanced LaTeX detection - be more permissive
            const hasLatex = cmd.isLatex !== undefined ? cmd.isLatex : (
                text.includes('\\') ||  // LaTeX commands
                (text.includes('^') && /[a-zA-Z]/.test(text)) ||  // Exponents with variables
                (text.includes('_') && /[a-zA-Z]/.test(text)) ||  // Subscripts
                text.includes('=') && /[a-zA-Z]/.test(text) ||  // Equations with variables
                /[a-zA-Z]\s*[=+\-*/]\s*[a-zA-Z0-9]/.test(text) ||  // Mathematical expressions
                /\\frac|\\sqrt|\\sum|\\int|\\lim|\\sin|\\cos|\\tan|\\log|\\ln/.test(text) ||  // LaTeX functions
                /[a-zA-Z]\^[0-9]|[a-zA-Z]_[0-9]/.test(text)  // Variables with superscript/subscript
            );

            // Calculate position for text (prevent overlap)
            let textX, textY;
            if (cmd.position && cmd.position[0] && cmd.position[1]) {
                // Use provided position
                textX = cmd.position[0];
                textY = cmd.position[1];
            } else {
                // Auto-position: center horizontally, stack vertically
                textX = canvas.width / 2;
                textY = textLayoutRef.current.nextY;
                // Update next position for next text element
                textLayoutRef.current.nextY += 80; // Space between text elements
                // Reset if we run out of space
                if (textLayoutRef.current.nextY > canvas.height - 50) {
                    textLayoutRef.current.nextY = 100;
                }
            }

            if ((hasLatex || cmd.isLatex) && overlay) {
                // Render as LaTeX using KaTeX with animation
                try {
                    const latexDiv = document.createElement('div');
                    latexDiv.style.position = 'absolute';
                    latexDiv.style.left = `${textX}px`;
                    latexDiv.style.top = `${textY}px`;
                    latexDiv.style.transform = 'translate(-50%, -50%)';
                    latexDiv.style.color = cmd.color || '#fff';
                    latexDiv.style.fontSize = '36px';
                    latexDiv.style.padding = '15px 25px';
                    latexDiv.style.background = 'rgba(0,0,0,0.5)';
                    latexDiv.style.borderRadius = '10px';
                    latexDiv.style.opacity = cmd.animated !== false ? '0' : '1';
                    latexDiv.style.transition = cmd.animated !== false ? 'opacity 0.8s ease-in' : 'none';
                    latexDiv.style.marginBottom = '20px'; // Add spacing

                    katex.render(text, latexDiv, {
                        throwOnError: false,
                        displayMode: true
                    });

                    overlay.appendChild(latexDiv);

                    // Animate fade-in
                    if (cmd.animated !== false) {
                        requestAnimationFrame(() => {
                            latexDiv.style.opacity = '1';
                        });
                    }
                } catch (e) {
                    console.error('KaTeX render error:', e);
                    // Fallback to canvas text
                    ctx.fillStyle = cmd.color || '#fff';
                    ctx.font = '24px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(text, textX, textY);
                }
            } else {
                // Regular text on canvas
                ctx.fillStyle = cmd.color || '#fff';
                ctx.font = '24px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(text, textX, textY);
            }
        }
    }, [drawGraph]);

    // Expose drawCommand to parent component
    useEffect(() => {
        if (onDrawCommand) {
            onDrawCommand(drawCommand);
        }
    }, [drawCommand, onDrawCommand]);

    // Handle legacy simulate-local-visual for testing (immediate execution)
    useEffect(() => {
        if (!socket) return;

        const handleSimulateVisual = (cmd) => {
            console.log('Received Simulated Visual Command:', cmd);
            setActiveCommand(cmd);
            drawCommand(cmd);
        };

        socket.on('simulate-local-visual', handleSimulateVisual);

        return () => {
            socket.off('simulate-local-visual', handleSimulateVisual);
        };
    }, [socket, drawCommand]);

    return (
        <div className="canvas-container" style={{
            background: '#1e1e1e',
            borderRadius: '12px',
            overflow: 'hidden',
            height: '100%',
            width: '100%',
            position: 'relative',
            border: '1px solid #333'
        }}>
            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />

            {/* Overlay for LaTeX and other HTML content */}
            <div
                ref={overlayRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                }}
            />

            {/* Status indicator */}
            <div style={{ position: 'absolute', top: 10, left: 10, color: '#666', fontSize: '0.8rem' }}>
                {activeCommand ? `Last: ${activeCommand.type}` : 'Ready'}
            </div>
        </div>
    );
};

export default CanvasBoard;
