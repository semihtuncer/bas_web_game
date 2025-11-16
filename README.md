# Multiplayer Top-Down Game

A minimalist, production-deployable top-down pixel art multiplayer game.

## Features

- **Client:** Pure HTML/CSS/vanilla JS (no frameworks, no bundlers)
- **Server:** Node.js with WebSocket
- **Players:** Maximum 2 concurrent players per room
- **Persistence:** Player state saved and restored across sessions
- **Server Authoritative:** Position, collisions, and game time controlled by server
- **Smooth Movement:** Client-side interpolation for smooth rendering

## Installation

```bash
npm install
```

## Running

### Server
```bash
npm start
```

The server will start on port 3001 (or PORT environment variable). You can change it by setting the PORT environment variable:
```bash
PORT=8080 npm start
```

### Client
Open `public/index.html` in a web browser, or serve it with a simple HTTP server:

```bash
# Using Python
cd public
python -m http.server 8000

# Using Node.js http-server
npx http-server public -p 8000
```

Then navigate to `http://localhost:8000`

## Controls

- **WASD** or **Arrow Keys** - Move character

## Architecture

### Server (`/server`)
- `server.js` - Main WebSocket server and game loop (20 TPS)
- `schema.js` - Game state schemas and constants
- `store.js` - Persistence layer for player state
- `health.js` - Health check endpoint

### Client (`/public`)
- `main.js` - Main game loop and coordination
- `input.js` - Input handling (keyboard)
- `net.js` - WebSocket communication
- `render.js` - Rendering with interpolation
- `world.js` - World state management

## Scalability Features

- **Delta time movement** - Frame-rate independent movement
- **Client-side interpolation** - Smooth rendering between server updates
- **Input buffering** - Efficient input handling
- **State persistence** - Player positions saved on disconnect
- **Deterministic tick rate** - 20 TPS server-side for consistency

## Deployment

The server is designed to run perpetually on platforms like Render, Fly.io, or Railway. The `Procfile` is included for easy deployment.

