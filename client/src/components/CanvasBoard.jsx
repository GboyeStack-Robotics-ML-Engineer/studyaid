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

    // Pagination State
    const [slides, setSlides] = useState([]); // Array of arrays (each page has steps)
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [solutionTitle, setSolutionTitle] = useState("");

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

    // Helper to render mixed Text and LaTeX into a DOM node
    const renderMathText = (node, content) => {
        const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g);

        parts.forEach(part => {
            if (!part) return;
            const isMath = /^(\$\$|\$|\\\[|\\\()/.test(part);
            if (isMath) {
                try {
                    let cleanMath = part
                        .replace(/^\$\$(.*)\$\$$/s, '$1')
                        .replace(/^\$(.*)\$$/s, '$1')
                        .replace(/^\\\[(.*)\\\]$/s, '$1')
                        .replace(/^\\\((.*)\\\)$/s, '$1');

                    const span = document.createElement('span');
                    const isDisplay = part.startsWith('$$') || part.startsWith('\\[');
                    katex.render(cleanMath, span, { throwOnError: false, displayMode: isDisplay });
                    node.appendChild(span);
                } catch (e) {
                    node.appendChild(document.createTextNode(part));
                }
            } else {
                const span = document.createElement('span');
                span.textContent = part;
                node.appendChild(span);
            }
        });
    };

    // Helper to create DOM nodes for steps
    const createStepNode = (content, color = '#fff', fontSize = '24px') => {
        const node = document.createElement('div');
        node.style.color = color;
        node.style.fontSize = fontSize;
        node.style.textAlign = 'center';
        node.style.transition = 'opacity 0.8s ease-in, transform 0.5s ease-out';
        node.style.background = 'rgba(0,0,0,0.6)';
        node.style.padding = '15px 25px';
        node.style.borderRadius = '12px';
        node.style.width = 'fit-content';
        node.style.maxWidth = '90%';
        node.style.alignSelf = 'center';
        node.style.marginBottom = '15px';
        node.style.boxShadow = '0 4px 6px rgba(0,0,0,0.2)';

        renderMathText(node, content);
        return node;
    };

    const drawCommand = useCallback((cmd) => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        console.log('Drawing command:', cmd);
        setActiveCommand(cmd);

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        // Handle Animated Sequence with Pagination (Slides)
        if (cmd.type === 'ANIMATE_SEQUENCE') {
            const steps = cmd.steps || [];
            const title = cmd.title || "Solution";
            setSolutionTitle(title);

            // Clear entire board
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (overlay) overlay.innerHTML = '';

            // Reduced to 3 steps per page for better visibility without overlap
            const STEPS_PER_PAGE = 3;
            const newSlides = [];
            for (let i = 0; i < steps.length; i += STEPS_PER_PAGE) {
                const chunk = steps.slice(i, i + STEPS_PER_PAGE).map(s => ({ content: s, visible: false }));
                newSlides.push(chunk);
            }
            setSlides(newSlides);
            setCurrentSlideIndex(0);
            setIsAnimating(true);


            // CRITICAL: Timing must match Gemini's speech pace
            // Audio speaks at ~150-180 words/minute (conversational pace)
            // That's roughly 3 words/second, or ~15-20 chars/second
            // BUT we need buffer time for audio to actually reach that part of narration
            let cumulativeDelay = 300; // Initial delay for audio to start

            steps.forEach((stepContent, i) => {
                const pageIndex = Math.floor(i / STEPS_PER_PAGE);
                const stepIndexInPage = i % STEPS_PER_PAGE;

                // Timing tuned to match speech pace
                // Base: 400ms (transition time)
                // + 25ms per character (matches speech + buffer)
                // Example: 50-char step = 400ms + 1250ms = 1.65s
                const readingTime = Math.max(400, stepContent.length * 25);

                setTimeout(() => {
                    // Switch page if needed
                    if (stepIndexInPage === 0) {
                        setCurrentSlideIndex(pageIndex);
                    }

                    // Mark step as visible
                    setSlides(prevSlides => {
                        const newSlidesState = prevSlides.map(slide => slide.map(s => ({ ...s })));
                        if (newSlidesState[pageIndex] && newSlidesState[pageIndex][stepIndexInPage]) {
                            newSlidesState[pageIndex][stepIndexInPage].visible = true;
                        }
                        return newSlidesState;
                    });

                }, cumulativeDelay);

                cumulativeDelay += readingTime;
            });



            setTimeout(() => {
                setIsAnimating(false);
            }, cumulativeDelay + 1000);

            return;
        }

        // For non-sequence commands:
        if (cmd.type === 'DRAW_GRAPH') {
            // Reset pagination if user asks for a simple graph
            setSlides([]);
            setSolutionTitle("");
            drawGraph(cmd, ctx, canvas, overlay, cmd.animated !== false);
            return;
        }

        if (cmd.type === 'DRAW_SHAPE') {
            setSlides([]);
            setSolutionTitle("");
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
            return;
        }

        // Legacy/Generic Text
        if (cmd.type === 'DRAW_TEXT') {
            setSlides([]);
            setSolutionTitle("");
            const text = cmd.text || '';
            ctx.fillStyle = cmd.color || '#fff';
            ctx.font = '24px Inter, sans-serif';
            ctx.textAlign = 'center';
            const x = (cmd.position && cmd.position[0]) || canvas.width / 2;
            const y = (cmd.position && cmd.position[1]) || canvas.height / 2;
            ctx.fillText(text, x, y);
        }

    }, [drawGraph]);

    // Render Pagination Overlay with Fixed Footer
    useEffect(() => {
        if (slides.length === 0 || !overlayRef.current) return;

        const overlay = overlayRef.current;
        overlay.innerHTML = '';

        // Main Flex Container
        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.justifyContent = 'space-between'; // Push footer down
        container.style.padding = '30px';
        container.style.boxSizing = 'border-box';
        container.style.pointerEvents = 'auto'; // Enable clicks on this container

        // Header
        const header = document.createElement('div');
        renderMathText(header, solutionTitle);
        header.style.color = '#00D2FF';
        header.style.fontSize = '26px';
        header.style.fontWeight = 'bold';
        header.style.marginBottom = '20px';
        header.style.textAlign = 'center';
        header.style.flexShrink = '0';
        container.appendChild(header);

        // Content Area (Flexible)
        const contentArea = document.createElement('div');
        contentArea.style.flex = '1'; // Take remaining space
        contentArea.style.display = 'flex';
        contentArea.style.flexDirection = 'column';
        contentArea.style.gap = '20px';
        contentArea.style.overflowY = 'auto'; // Scroll internal steps if they exceed space
        contentArea.style.scrollbarWidth = 'none';
        contentArea.style.alignItems = 'center';

        const currentSteps = slides[currentSlideIndex] || [];

        currentSteps.forEach((stepObj) => {
            const node = createStepNode(stepObj.content, '#fff', '20px');
            // Adjust margin for cleaner look
            node.style.marginBottom = '10px';

            if (!stepObj.visible) {
                node.style.opacity = '0';
                node.style.transform = 'translateY(10px)';
            } else {
                node.style.opacity = '1';
                node.style.transform = 'translateY(0)';
            }
            contentArea.appendChild(node);
        });

        container.appendChild(contentArea);

        // Footer (Controls)
        if (slides.length > 1) {
            const controls = document.createElement('div');
            controls.style.display = 'flex';
            controls.style.gap = '20px';
            controls.style.justifyContent = 'center';
            controls.style.alignItems = 'center';
            controls.style.padding = '10px';
            controls.style.marginTop = '10px';
            controls.style.flexShrink = '0'; // Don't shrink buttons

            const createBtn = (text, onClick, disabled) => {
                const btn = document.createElement('button');
                btn.textContent = text;
                btn.onclick = onClick;
                btn.disabled = disabled;
                btn.style.padding = '8px 20px';
                btn.style.background = disabled ? 'rgba(255,255,255,0.1)' : '#00D2FF';
                btn.style.color = disabled ? '#555' : '#fff';
                btn.style.border = 'none';
                btn.style.borderRadius = '20px';
                btn.style.cursor = disabled ? 'default' : 'pointer';
                btn.style.fontWeight = 'bold';
                btn.style.fontSize = '14px';
                return btn;
            };

            const prevBtn = createBtn('← Back', () => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1)), currentSlideIndex === 0);
            const nextBtn = createBtn('Next →', () => setCurrentSlideIndex(Math.min(slides.length - 1, currentSlideIndex + 1)), currentSlideIndex === slides.length - 1);

            const indicator = document.createElement('span');
            indicator.textContent = `${currentSlideIndex + 1} / ${slides.length}`;
            indicator.style.color = '#888';
            indicator.style.fontSize = '14px';

            controls.appendChild(prevBtn);
            controls.appendChild(indicator);
            controls.appendChild(nextBtn);
            container.appendChild(controls);
        }

        overlay.appendChild(container);

    }, [slides, currentSlideIndex, solutionTitle]);
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
