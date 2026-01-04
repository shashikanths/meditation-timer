const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { db } = require('./db.cjs');

// Use dynamic import for ES modules
let uuidv4;
(async () => {
  const { v4 } = await import('uuid');
  uuidv4 = v4;
})();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.type;
    const uploadPath = path.join(__dirname, '..', 'public', 'media', type, 'uploads');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const userId = req.body.userId;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${userId}-${timestamp}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const type = req.body.type;
  if (type === 'audio') {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio file'), false);
    }
  } else if (type === 'image') {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image file'), false);
    }
  } else {
    cb(new Error('Invalid type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ===== USER MANAGEMENT =====

// POST /api/users/init - Initialize or retrieve user
app.post('/api/users/init', (req, res) => {
  try {
    let { userId, displayName } = req.body;

    // Generate UUID if not provided
    if (!userId) {
      userId = uuidv4();
    }

    // Check if user exists
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user) {
      // Create new user with display name
      db.prepare(`
        INSERT INTO users (id, display_name, created_at, last_seen, total_seconds, sessions_count)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0)
      `).run(userId, displayName || null);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    } else if (displayName && user.display_name !== displayName) {
      // Update display name if changed
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
      user.display_name = displayName;
    }

    // Get user preferences
    let preferences = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);

    if (!preferences) {
      // Create default preferences
      db.prepare(`
        INSERT INTO user_preferences (user_id, selected_audio_id, selected_image_id, theme_colors)
        VALUES (?, NULL, NULL, NULL)
      `).run(userId);

      preferences = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
    }

    res.json({
      userId: user.id,
      displayName: user.display_name,
      totalSeconds: user.total_seconds,
      sessionsCount: user.sessions_count,
      preferences: {
        selectedAudioId: preferences.selected_audio_id,
        selectedImageId: preferences.selected_image_id,
        themeColors: preferences.theme_colors ? JSON.parse(preferences.theme_colors) : null
      }
    });
  } catch (error) {
    console.error('Error in /api/users/init:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== MEDITATION STATS =====

// POST /api/meditation/stats - Heartbeat endpoint
app.post('/api/meditation/stats', (req, res) => {
  try {
    const { userId, status, timestamp } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Update user's last_seen
    db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);

    if (status === 'active') {
      // Check if user has an active session
      const activeSession = db.prepare(`
        SELECT * FROM sessions
        WHERE user_id = ? AND is_active = TRUE
      `).get(userId);

      if (!activeSession) {
        // Create new active session
        db.prepare(`
          INSERT INTO sessions (user_id, started_at, is_active)
          VALUES (?, CURRENT_TIMESTAMP, TRUE)
        `).run(userId);
      }
    } else if (status === 'inactive') {
      // Close active session and update user stats
      const activeSession = db.prepare(`
        SELECT * FROM sessions
        WHERE user_id = ? AND is_active = TRUE
      `).get(userId);

      if (activeSession) {
        // Convert SQLite CURRENT_TIMESTAMP (UTC) to milliseconds
        const startTime = new Date(activeSession.started_at + ' UTC').getTime();
        const endTime = Date.now();
        const durationSeconds = Math.floor((endTime - startTime) / 1000);

        // Update session
        db.prepare(`
          UPDATE sessions
          SET ended_at = CURRENT_TIMESTAMP,
              duration_seconds = ?,
              is_active = FALSE
          WHERE id = ?
        `).run(durationSeconds, activeSession.id);

        // Update user stats
        db.prepare(`
          UPDATE users
          SET total_seconds = total_seconds + ?,
              sessions_count = sessions_count + 1
          WHERE id = ?
        `).run(durationSeconds, userId);
      }
    }

    // Calculate active count (users with last_seen < 30 seconds ago)
    const activeCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM users
      WHERE datetime(last_seen) >= datetime('now', '-30 seconds')
    `).get().count;

    // Calculate total unique users (all users ever created)
    const totalUniqueUsers = db.prepare(`
      SELECT COUNT(*) as count FROM users
    `).get().count || 0;

    res.json({ activeCount, totalUniqueUsers, totalCount: totalUniqueUsers });
  } catch (error) {
    console.error('Error in /api/meditation/stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/meditation/leaderboard - Get top users
app.get('/api/meditation/leaderboard', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const currentUserId = req.query.userId;

    // Get top users by total_seconds with display names
    const topUsers = db.prepare(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY total_seconds DESC) as rank,
        id,
        display_name,
        total_seconds
      FROM users
      WHERE total_seconds > 0
      ORDER BY total_seconds DESC
      LIMIT ?
    `).all(limit);

    // Convert seconds to hours and include display names
    const leaderboard = topUsers.map(user => ({
      rank: user.rank,
      displayName: user.display_name || 'Anonymous Meditator',
      totalHours: parseFloat((user.total_seconds / 3600).toFixed(2)),
      isCurrentUser: currentUserId ? user.id === currentUserId : false
    }));

    // Get current user's rank if provided
    if (currentUserId) {
      const userRank = db.prepare(`
        SELECT
          (SELECT COUNT(*) + 1 FROM users WHERE total_seconds > u.total_seconds) as rank,
          display_name,
          total_seconds
        FROM users u
        WHERE id = ?
      `).get(currentUserId);

      if (userRank) {
        res.json({
          leaderboard,
          currentUserRank: {
            rank: userRank.rank,
            displayName: userRank.display_name || 'Anonymous Meditator',
            totalHours: parseFloat((userRank.total_seconds / 3600).toFixed(2))
          }
        });
        return;
      }
    }

    res.json({ leaderboard });
  } catch (error) {
    console.error('Error in /api/meditation/leaderboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== MEDIA LIBRARY =====

// GET /api/media/list - List all media
app.get('/api/media/list', (req, res) => {
  try {
    const type = req.query.type;

    let query = 'SELECT * FROM media_library';
    let params = [];

    if (type && (type === 'audio' || type === 'image')) {
      query += ' WHERE type = ?';
      params.push(type);
    }

    query += ' ORDER BY is_predefined DESC, created_at DESC';

    const media = db.prepare(query).all(...params);

    // Organize by type
    const audio = media.filter(m => m.type === 'audio');
    const images = media.filter(m => m.type === 'image');

    res.json({ audio, images });
  } catch (error) {
    console.error('Error in /api/media/list:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/media/upload - Upload new media
app.post('/api/media/upload', upload.single('file'), (req, res) => {
  try {
    const { userId, type } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = `/media/${type}/uploads/${req.file.filename}`;
    const displayName = req.file.originalname;

    const result = db.prepare(`
      INSERT INTO media_library (type, filename, display_name, file_path, uploaded_by, is_predefined)
      VALUES (?, ?, ?, ?, ?, FALSE)
    `).run(type, req.file.filename, displayName, filePath, userId);

    res.json({
      id: result.lastInsertRowid,
      type,
      filename: req.file.filename,
      displayName,
      filePath,
      isPredefined: false
    });
  } catch (error) {
    console.error('Error in /api/media/upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== USER PREFERENCES =====

// GET /api/preferences/:userId - Get user preferences
app.get('/api/preferences/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    let preferences = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);

    if (!preferences) {
      // Create default preferences
      db.prepare(`
        INSERT INTO user_preferences (user_id, selected_audio_id, selected_image_id, theme_colors)
        VALUES (?, NULL, NULL, NULL)
      `).run(userId);

      preferences = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
    }

    res.json({
      selectedAudioId: preferences.selected_audio_id,
      selectedImageId: preferences.selected_image_id,
      themeColors: preferences.theme_colors ? JSON.parse(preferences.theme_colors) : null
    });
  } catch (error) {
    console.error('Error in /api/preferences/:userId:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/preferences/:userId - Update user preferences
app.put('/api/preferences/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { selectedAudioId, selectedImageId, themeColors } = req.body;

    // Ensure preferences record exists
    const exists = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);

    if (!exists) {
      db.prepare(`
        INSERT INTO user_preferences (user_id, selected_audio_id, selected_image_id, theme_colors)
        VALUES (?, NULL, NULL, NULL)
      `).run(userId);
    }

    // Update preferences (only update fields that were provided)
    const updates = [];
    const params = [];

    if (selectedAudioId !== undefined) {
      updates.push('selected_audio_id = ?');
      params.push(selectedAudioId);
    }

    if (selectedImageId !== undefined) {
      updates.push('selected_image_id = ?');
      params.push(selectedImageId);
    }

    if (themeColors !== undefined) {
      updates.push('theme_colors = ?');
      params.push(JSON.stringify(themeColors));
    }

    if (updates.length > 0) {
      params.push(userId);
      db.prepare(`
        UPDATE user_preferences
        SET ${updates.join(', ')}
        WHERE user_id = ?
      `).run(...params);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/preferences/:userId:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Instant Om API server running on port ${PORT}`);
  console.log(`📊 Database: instant-om.db`);
  console.log(`🎵 Media storage: public/media/`);
});
