/**
 * StorageManager - Centralized storage for Meditation Timer
 * Handles user settings, stats, and custom media files (via IndexedDB)
 */

import { generateDisplayName } from './displayName';

interface TimerSettings {
  type: 'count-up' | 'count-down';
  targetMinutes?: number;  // For count-down mode
}

interface UserSettings {
  userId: string;
  displayName: string;
  selectedAudioId: string | null;  // Can be 'predefined-1', 'custom', or 'silence'
  selectedImageId: string | null;  // Can be 'predefined-1' or 'custom'
  customAudioName: string | null;
  customImageName: string | null;
  timerSettings?: TimerSettings;
}

interface LocalStats {
  totalSeconds: number;
  lastSession: string | null;
  sessionsCount: number;
}

// Session continuation threshold: only applies when page was backgrounded
// If page was in foreground (even with screen locked), session continues indefinitely
export const SESSION_BACKGROUND_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

// Active session checkpoint - saved frequently to survive page close
interface SessionCheckpoint {
  sessionId: string;
  userId: string;
  startedAt: number;  // timestamp
  lastCheckpoint: number;  // timestamp of last save
  elapsedSeconds: number;  // seconds elapsed at last checkpoint
  wasPageVisible: boolean;  // true if page was in foreground at last checkpoint
  lastHiddenAt: number | null;  // timestamp when page last went to background (null if never hidden)
}

const STORAGE_KEYS = {
  USER_ID: 'om-user-id',
  DISPLAY_NAME: 'om-display-name',
  SETTINGS: 'om-user-settings',
  LOCAL_STATS: 'om-local-stats',
  SESSION_CHECKPOINT: 'om-session-checkpoint'
};

const DB_NAME = 'MeditationTimerDB';
const DB_VERSION = 1;
const MEDIA_STORE = 'customMedia';

// IndexedDB for storing large files (audio/images)
class MediaCache {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<IDBDatabase>;

  constructor() {
    this.dbReady = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  async saveFile(type: 'audio' | 'image', file: File): Promise<string> {
    const db = await this.dbReady;
    const id = `custom-${type}`;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const transaction = db.transaction([MEDIA_STORE], 'readwrite');
        const store = transaction.objectStore(MEDIA_STORE);

        const data = {
          id,
          type,
          name: file.name,
          mimeType: file.type,
          data: reader.result,
          savedAt: Date.now()
        };

        const request = store.put(data);
        request.onsuccess = () => resolve(id);
        request.onerror = () => reject(request.error);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async getFile(type: 'audio' | 'image'): Promise<{ url: string; name: string } | null> {
    const db = await this.dbReady;
    const id = `custom-${type}`;

    return new Promise((resolve) => {
      const transaction = db.transaction([MEDIA_STORE], 'readonly');
      const store = transaction.objectStore(MEDIA_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          resolve({
            url: request.result.data as string,
            name: request.result.name
          });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  }

  async deleteFile(type: 'audio' | 'image'): Promise<void> {
    const db = await this.dbReady;
    const id = `custom-${type}`;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MEDIA_STORE], 'readwrite');
      const store = transaction.objectStore(MEDIA_STORE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instance
export const mediaCache = new MediaCache();

export const StorageManager = {
  /**
   * Get or generate user ID
   */
  getUserId: (): string => {
    let userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    }
    return userId;
  },

  /**
   * Get or generate display name (two random words)
   */
  getDisplayName: (): string => {
    let displayName = localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME);
    if (!displayName) {
      displayName = generateDisplayName();
      localStorage.setItem(STORAGE_KEYS.DISPLAY_NAME, displayName);
    }
    return displayName;
  },

  /**
   * Set display name (allows user to regenerate)
   */
  setDisplayName: (name: string): void => {
    localStorage.setItem(STORAGE_KEYS.DISPLAY_NAME, name);
  },

  /**
   * Get user settings
   */
  getSettings: (): UserSettings => {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Invalid JSON, return defaults
      }
    }

    return {
      userId: StorageManager.getUserId(),
      displayName: StorageManager.getDisplayName(),
      selectedAudioId: null,
      selectedImageId: null,
      customAudioName: null,
      customImageName: null
    };
  },

  /**
   * Update user settings (partial update)
   */
  updateSettings: (partial: Partial<Omit<UserSettings, 'userId'>>) => {
    const current = StorageManager.getSettings();
    const updated = { ...current, ...partial };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
  },

  /**
   * Get local stats
   */
  getLocalStats: (): LocalStats => {
    const stored = localStorage.getItem(STORAGE_KEYS.LOCAL_STATS);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Invalid JSON, return defaults
      }
    }

    return {
      totalSeconds: 0,
      lastSession: null,
      sessionsCount: 0
    };
  },

  /**
   * Update local stats
   */
  updateLocalStats: (stats: LocalStats) => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_STATS, JSON.stringify(stats));
  },

  /**
   * Clear all stored data
   */
  clearAll: async () => {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    await mediaCache.deleteFile('audio');
    await mediaCache.deleteFile('image');
  },

  /**
   * Save session checkpoint (call frequently during active session)
   */
  saveSessionCheckpoint: (checkpoint: SessionCheckpoint): void => {
    localStorage.setItem(STORAGE_KEYS.SESSION_CHECKPOINT, JSON.stringify(checkpoint));
  },

  /**
   * Get active session checkpoint (if exists)
   */
  getSessionCheckpoint: (): SessionCheckpoint | null => {
    const stored = localStorage.getItem(STORAGE_KEYS.SESSION_CHECKPOINT);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  },

  /**
   * Clear session checkpoint (call when session ends normally)
   */
  clearSessionCheckpoint: (): void => {
    localStorage.removeItem(STORAGE_KEYS.SESSION_CHECKPOINT);
  }
};

export type { SessionCheckpoint };
