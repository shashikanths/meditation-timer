# Meditation Timer

A minimal, atmospheric meditation timer with real-time user tracking and customizable audio/backgrounds.

**🧘 Live App**: [mdtimer.web.app](https://mdtimer.web.app)

## Features

- **Auto-starting Timer**: Begins when you tap "Tap to Begin"
- **Preset Durations**: 10 min, 20 min, 30 min, 1 hour, or custom
- **Real-time Stats**: See how many people are meditating right now
- **Leaderboard**: Rankings by total meditation hours
- **Customizable Media**: Choose from predefined audio/images or upload your own
- **Local Persistence**: Your settings and custom files are saved in the browser
- **Anonymous**: No signup required (UUID-based tracking)
- **Fully Serverless**: Runs entirely on Firebase's free tier

## Quick Start

### Deploy Your Own (Recommended)

1. **Fork this repository**
2. **Create a Firebase project**: https://console.firebase.google.com
3. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   ```
4. **Login and deploy**:
   ```bash
   firebase login
   firebase init  # Select your project, use existing config
   npm install
   npm run deploy
   ```

Your app will be live at `https://your-project-id.web.app` 🎉

### Local Development

```bash
npm install        # Install dependencies
npm run dev        # Start development server
```

Open http://localhost:3000.

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

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore (NoSQL, real-time)
- **Hosting**: Firebase Hosting
- **Storage**: localStorage + IndexedDB for custom media
- **Cost**: $0/month (Firebase free tier)

## Architecture

Client-side only - no backend server needed! The app talks directly to Firebase Firestore with security rules for data validation.

```
Browser → Firestore (Cloud Database)
   ↓           ↓
React App   Security Rules
```

## Project Structure

```
instant-om/
├── App.tsx                 # Main app component
├── components/             # UI components
├── lib/firebase.ts         # Firebase client SDK
├── utils/storage.ts        # Local storage + IndexedDB
├── public/media/           # Predefined audio/images
├── firebase.json           # Firebase hosting config
├── firestore.rules         # Database security rules
└── firestore.indexes.json  # Database indexes
```

## Development

```bash
npm run dev                 # Development server (port 3000)
npm run build               # Production build
npm run deploy              # Deploy to Firebase
npm run deploy:hosting      # Deploy hosting only
npm run deploy:firestore    # Deploy Firestore rules only
```

## Deployment

The app uses Firebase's free Spark plan with these generous limits:
- 50K document reads/day
- 20K document writes/day
- 1 GB storage
- 10 GB/month bandwidth

Perfect for personal or small group use!

## Design

"Sacred Minimalism" aesthetic:
- Pure black backgrounds
- Solar orange accents (#fb923c)
- Cinzel font for headings
- Smooth, hardware-accelerated animations

## License

MIT
