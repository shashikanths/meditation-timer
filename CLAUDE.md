# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Commands

```bash
npm install      # Install dependencies
npm run seed     # Seed database with predefined media
npm start        # Start both backend (4000) and frontend (3000) concurrently
npm run server   # Start backend API only
npm run dev      # Start frontend dev server only
npm run build    # Production build
```

## Project Overview

A **Meditation Timer Application** with anonymous user tracking, leaderboard rankings, and customizable audio/backgrounds. Users can select predefined media or upload custom files stored locally in the browser.

### Architecture
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js + SQLite (better-sqlite3)
- **Storage**: localStorage (settings) + IndexedDB (custom media files)

### Design: "Sacred Minimalism"
- Pure black backgrounds (#000000)
- Solar orange accents (#fb923c)
- Cinzel font for headings, system fonts for data
- Hardware-accelerated animations

## File Structure

```
instant-om/
├── App.tsx                    # Root component with audio/overlay handling
├── index.tsx                  # Entry point
├── components/
│   ├── AudioPlayer.tsx        # Audio with custom file support (IndexedDB)
│   ├── BackgroundManager.tsx  # Background images (predefined + custom)
│   ├── GlobalCounter.tsx      # Real-time active/total user counts
│   ├── SettingsPanel.tsx      # Settings modal for media selection
│   ├── StatsManager.tsx       # Personal stats display
│   └── UnifiedTimer.tsx       # Timer with presets (10m, 20m, 30m, 1h)
├── utils/
│   └── storage.ts             # localStorage + IndexedDB manager
├── server/
│   ├── index.cjs              # Express API server
│   ├── db.cjs                 # SQLite database schema
│   └── seed.cjs               # Database seeding
├── public/media/
│   ├── audio/predefined/      # om-mantra.mp3, meditation-bell-1min.mp3
│   └── images/predefined/     # mountain-sunrise.jpg, etc.
└── instant-om.db              # SQLite database (auto-created)
```

## Key Components

### App.tsx
Root orchestrator with layered z-index:
- z-0: BackgroundManager
- z-10: UI (timers, stats)
- z-50: Entry overlay ("MEDITATE - Tap to Begin")

Click handler satisfies browser autoplay policy.

### UnifiedTimer.tsx
Combined count-up/count-down timer:
- Auto-starts when overlay dismissed
- Presets: 10m, 20m, 30m, 1h, custom
- Count-down plays audio cue at 0, then switches to count-up
- Resets on page refresh (intentional)

### AudioPlayer.tsx / BackgroundManager.tsx
Load media from localStorage settings:
- `selectedAudioId` / `selectedImageId`: predefined ID or 'custom'
- Custom files loaded from IndexedDB (`MeditationTimerDB`)

### SettingsPanel.tsx
Settings modal with tabs for Audio/Background:
- Select predefined media
- Upload custom files (stored in IndexedDB, persists across sessions)
- Remove custom files

### GlobalCounter.tsx
Real-time stats via 10-second heartbeat:
- Active Now: users meditating in last 30 seconds
- Total Users: unique users ever

## Storage Architecture

### localStorage Keys
- `om-user-id` - User UUID (generated via crypto.randomUUID())
- `om-user-settings` - Selected audio/image IDs, custom file names
- `om-local-stats` - Cached meditation stats

### IndexedDB (MeditationTimerDB)
- `customMedia` store - Uploaded audio/images as base64 data URLs
- Keys: `custom-audio`, `custom-image`

### utils/storage.ts Exports
- `StorageManager` - localStorage operations
- `mediaCache` - IndexedDB operations for custom files

## Backend API (server/index.cjs)

**Port**: 4000

**Database Tables**: users, sessions, media_library, user_preferences

**Endpoints**:
- `POST /api/users/init` - Initialize/retrieve user
- `POST /api/meditation/stats` - Heartbeat for active status
- `GET /api/meditation/leaderboard` - Get rankings
- `GET /api/media/list` - List available media
- `GET/PUT /api/preferences/:userId` - User preferences

**Note**: Server uses `.cjs` extension because package.json has `"type": "module"`. UUID requires dynamic import.

## Critical Details

### Browser Autoplay
User interaction required before audio plays. The "Tap to Begin" overlay handles this.

### Timezone Issue (Fixed)
SQLite CURRENT_TIMESTAMP returns UTC. When calculating session duration, add ' UTC' suffix:
```javascript
new Date(timestamp + ' UTC').getTime()
```

### Vite Proxy
Frontend proxies `/api` to `http://localhost:4000` (configured in vite.config.ts).

## Audio Files

- **om-mantra.mp3**: 13-second loop of real Om chanting vocals
- **meditation-bell-1min.mp3**: Zen bell (3 sec) + 57 sec silence, loops every minute

## Adding New Predefined Media

1. Add file to `public/media/audio/predefined/` or `public/media/images/predefined/`
2. Add entry to `AUDIO_PATHS`/`IMAGE_PATHS` in AudioPlayer/BackgroundManager
3. Add entry to `PREDEFINED_AUDIO`/`PREDEFINED_IMAGES` in SettingsPanel
4. Run `npm run seed` to update database
