// This mock service simulates the AI generating a "Lesson Plan"
// In a real app, this would call an LLM to generate the text and code.

const getTriangleLesson = () => {
    return {
        // The "Audio" part (simplified as text for the frontend to speak via TTS for now)
        spokenText: "Sure! A triangle is a polygon with three edges and three vertices. Let me draw one for you. Notice how it has three distinct sides connecting at the corners.",

        // The "Visual" part (timed sequence of commands)
        visualEvents: [
            {
                timeOffset: 500, // execute 500ms after speech starts
                command: {
                    type: 'DRAW_SHAPE',
                    shape: 'triangle',
                    points: [[200, 100], [150, 300], [250, 300]],
                    color: '#FF0055'
                }
            },
            {
                timeOffset: 4000,
                command: {
                    type: 'DRAW_TEXT',
                    text: "Vertices = 3",
                    position: [260, 200],
                    color: '#fff'
                }
            }
        ]
    };
};

module.exports = { getTriangleLesson };
