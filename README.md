# StudyAid - Gemini Live Tutoring System

An interactive AI tutoring system powered by Google's Gemini Multimodal Live API, featuring real-time voice conversation and visual demonstrations with LaTeX math rendering.

## Features

- 🎙️ **Real-time Voice Interaction**: Speak naturally with an AI tutor using bidirectional audio streaming
- 📊 **Visual Demonstrations**: AI draws shapes, diagrams, and formulas on a digital whiteboard
- 🧮 **LaTeX Math Rendering**: Beautiful mathematical formula display using KaTeX
- 🔄 **Step-by-Step Explanations**: AI breaks down problems into clear, visual steps
- 🎨 **Modern UI**: Premium dark theme with glassmorphism effects

## Prerequisites

- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **Google Gemini API Key** (Get one from [Google AI Studio](https://aistudio.google.com))

## Installation

### 1. Clone the Repository

```bash
cd studyaid
```

### 2. Install Server Dependencies

```bash
cd server
npm install
```

### 3. Install Client Dependencies

```bash
cd ../client
npm install
```

### 4. Configure API Key

Create a `.env` file in the `server` directory:

```bash
cd ../server
# On Windows
echo GEMINI_API_KEY=YOUR_API_KEY_HERE > .env

# On Mac/Linux
echo "GEMINI_API_KEY=YOUR_API_KEY_HERE" > .env
```

Replace `YOUR_API_KEY_HERE` with your actual Gemini API key from [Google AI Studio](https://aistudio.google.com).

## Running the Project

You'll need **two terminal windows** - one for the server and one for the client.

### Terminal 1: Start the Server

```bash
cd server
npm start
```

You should see:
```
Server running on port 3001
```

### Terminal 2: Start the Client

```bash
cd client
npm run dev
```

You should see:
```
VITE v... ready in ...ms
Local: http://localhost:5173/
```

### 3. Open in Browser

Navigate to `http://localhost:5173` in your web browser (Chrome or Edge recommended for best audio support).

## Usage

1. **Allow Microphone Access**: The browser will ask for microphone permission - click "Allow"
2. **Wait for Connection**: The status should show "Gemini Live Ready"
3. **Click "Start Mic"**: The orb will turn red and pulse
4. **Speak Your Question**: Try asking:
   - "Draw a triangle"
   - "Solve 2x + 5 = 15"
   - "Show me the area of a circle formula"
   - "Explain the Pythagorean theorem"

5. **AI Response**: The AI will:
   - Respond with natural voice
   - Draw relevant shapes/formulas on the whiteboard
   - Use LaTeX for mathematical expressions

## Troubleshooting

### No Audio Output
- Check browser volume/permissions
- Ensure "Start Mic" was clicked (this initializes audio playback)
- Try refreshing the page

### "Error: API Key Missing"
- Verify `.env` file exists in `server` directory
- Check that `GEMINI_API_KEY=` has your actual key
- Restart the server after adding the key

### Connection Issues
- Ensure both server (port 3001) and client (port 5173) are running
- Check your internet connection (required for Gemini API)
- Look for error messages in server terminal

### Visual Commands Not Showing
- Check browser console (F12) for errors
- Verify canvas is visible (right panel)
- Try asking for a simple shape first: "Draw a circle"

### Audio Lag/Choppiness
- Close other browser tabs to free up resources
- Check your internet speed
- The buffer size is optimized for ~128ms latency

## Project Structure

```
studyaid/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── CanvasBoard.jsx   # Visual whiteboard
│   │   ├── hooks/
│   │   │   └── useAudioStream.js # Audio capture
│   │   ├── App.jsx               # Main app component
│   │   └── index.css             # Styling
│   └── package.json
│
├── server/                 # Node.js backend
│   ├── services/
│   │   └── GeminiLiveBridge.js   # Gemini API integration
│   ├── index.js                   # Express server
│   ├── .env                       # API key (create this!)
│   └── package.json
│
└── README.md
```

## Technology Stack

**Frontend:**
- React 19
- Vite
- Socket.IO Client
- KaTeX (math rendering)
- Lucide React (icons)

**Backend:**
- Node.js
- Express
- Socket.IO
- WebSocket (`ws`)
- Gemini Multimodal Live API

## How It Works

1. **Audio Capture**: Browser captures microphone input, converts to 16kHz PCM, and streams via WebSocket
2. **Gemini Processing**: Server forwards audio to Gemini Live API, which generates:
   - Audio responses (24kHz PCM)
   - Tool calls (e.g., `draw_on_canvas`)
3. **Visual Rendering**: Frontend receives drawing commands and renders them using:
   - HTML5 Canvas for shapes
   - KaTeX overlay for LaTeX formulas
4. **Audio Playback**: Frontend plays Gemini's audio response in real-time

## Development

### Enable Debug Logs

Server logs are already verbose. For client-side debugging, open browser console (F12).

### Modify System Instructions

Edit `server/services/GeminiLiveBridge.js` → `sendSetupMessage()` → `systemInstruction.parts[0].text`

### Adjust Audio Latency

Edit `client/src/hooks/useAudioStream.js` → `createScriptProcessor(2048, 1, 1)`
- Lower value (e.g., 1024) = lower latency, higher CPU
- Higher value (e.g., 4096) = smoother, more lag

## License

This project is for educational purposes.

## Credits

Built with:
- [Google Gemini API](https://ai.google.dev/)
- [KaTeX](https://katex.org/)
- [Socket.IO](https://socket.io/)

---

**Need Help?** Check the troubleshooting section or open an issue.
