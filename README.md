# Meditation Timer

A minimal, atmospheric meditation timer with real-time user tracking and customizable audio/backgrounds.

## Features

- **Auto-starting Timer**: Begins when you tap "Tap to Begin"
- **Preset Durations**: 10 min, 20 min, 30 min, 1 hour, or custom
- **Real-time Stats**: See how many people are meditating right now
- **Leaderboard**: Rankings by total meditation hours
- **Customizable Media**: Choose from predefined audio/images or upload your own
- **Local Persistence**: Your settings and custom files are saved in the browser
- **Anonymous**: No signup required (UUID-based tracking)

## Quick Start

```bash
npm install        # Install dependencies
npm run seed       # Seed database with predefined media
npm start          # Start the app
```

Open http://localhost:3000 (or the next available port shown in terminal).

## How It Works

1. **Tap to Begin**: Click anywhere on the splash screen to start
2. **Timer Auto-starts**: Counts up in open session mode
3. **Set a Goal**: Click preset buttons or enter custom minutes
4. **Audio Plays**: Om chanting loops continuously (can be muted)
5. **Track Progress**: View your stats in the bottom-left corner
6. **Customize**: Click the gear icon to change audio/background

## Audio Files

- **Om Mantra Chant**: 13-second loop of real vocal Om chanting
- **Meditation Bell**: Zen bell that rings every minute

You can also upload your own audio files (stored locally in your browser).

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS
- Express.js + SQLite backend
- IndexedDB for custom media storage

## Project Structure

```
instant-om/
├── App.tsx                 # Main app component
├── components/             # UI components
├── utils/storage.ts        # Local storage + IndexedDB
├── server/                 # Express API + SQLite
├── public/media/           # Predefined audio/images
└── instant-om.db           # Database (auto-created)
```

## Development

```bash
npm run dev        # Frontend only (port 3000)
npm run server     # Backend only (port 4000)
npm start          # Both concurrently
npm run build      # Production build
```

## Design

"Sacred Minimalism" aesthetic:
- Pure black backgrounds
- Solar orange accents (#fb923c)
- Cinzel font for headings
- Smooth, hardware-accelerated animations

## License

MIT
