const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'instant-om.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
const initDatabase = () => {
  // Users table (anonymous UUID-based with display names)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_seconds INTEGER DEFAULT 0,
      sessions_count INTEGER DEFAULT 0
    )
  `);

  // Add display_name column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      ended_at DATETIME,
      duration_seconds INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Media library table
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      display_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      is_predefined BOOLEAN DEFAULT FALSE,
      uploaded_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

  // User preferences table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      selected_audio_id INTEGER,
      selected_image_id INTEGER,
      theme_colors TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (selected_audio_id) REFERENCES media_library(id),
      FOREIGN KEY (selected_image_id) REFERENCES media_library(id)
    )
  `);

  console.log('✅ Database initialized successfully');
};

// Initialize database on module load
initDatabase();

module.exports = { db, initDatabase };
