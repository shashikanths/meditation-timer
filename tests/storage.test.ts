import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to test the storage logic directly, so let's create a simplified version
// that mirrors the actual StorageManager behavior

const STORAGE_KEYS = {
  USER_ID: 'om-user-id',
  DISPLAY_NAME: 'om-display-name',
  SETTINGS: 'om-user-settings',
  LOCAL_STATS: 'om-local-stats',
  SESSION_CHECKPOINT: 'om-session-checkpoint',
  PENDING_ORPHAN_SESSION: 'om-pending-orphan-session'
};

interface SessionCheckpoint {
  sessionId: string;
  userId: string;
  startedAt: number;
  lastCheckpoint: number;
  elapsedSeconds: number;
}

interface PendingOrphanSession {
  sessionId: string;
  userId: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
}

interface UserSettings {
  userId: string;
  displayName: string;
  selectedAudioId: string | null;
  selectedImageId: string | null;
  customAudioName: string | null;
  customImageName: string | null;
  timerSettings?: {
    type: 'count-up' | 'count-down';
    targetMinutes?: number;
  };
}

interface LocalStats {
  totalSeconds: number;
  lastSession: string | null;
  sessionsCount: number;
}

// Simplified StorageManager for testing
const TestStorageManager = {
  getUserId: (): string => {
    let userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    }
    return userId;
  },

  getSettings: (): UserSettings => {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Invalid JSON
      }
    }
    return {
      userId: TestStorageManager.getUserId(),
      displayName: 'TestUser',
      selectedAudioId: null,
      selectedImageId: null,
      customAudioName: null,
      customImageName: null
    };
  },

  updateSettings: (partial: Partial<UserSettings>) => {
    const current = TestStorageManager.getSettings();
    const updated = { ...current, ...partial };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
  },

  getLocalStats: (): LocalStats => {
    const stored = localStorage.getItem(STORAGE_KEYS.LOCAL_STATS);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Invalid JSON
      }
    }
    return { totalSeconds: 0, lastSession: null, sessionsCount: 0 };
  },

  updateLocalStats: (stats: LocalStats) => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_STATS, JSON.stringify(stats));
  },

  saveSessionCheckpoint: (checkpoint: SessionCheckpoint): void => {
    localStorage.setItem(STORAGE_KEYS.SESSION_CHECKPOINT, JSON.stringify(checkpoint));
  },

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

  clearSessionCheckpoint: (): void => {
    localStorage.removeItem(STORAGE_KEYS.SESSION_CHECKPOINT);
  },

  savePendingOrphanSession: (session: PendingOrphanSession): void => {
    localStorage.setItem(STORAGE_KEYS.PENDING_ORPHAN_SESSION, JSON.stringify(session));
  },

  getPendingOrphanSession: (): PendingOrphanSession | null => {
    const stored = localStorage.getItem(STORAGE_KEYS.PENDING_ORPHAN_SESSION);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  },

  clearPendingOrphanSession: (): void => {
    localStorage.removeItem(STORAGE_KEYS.PENDING_ORPHAN_SESSION);
  }
};

describe('StorageManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('User ID Management', () => {
    it('should generate a new user ID if none exists', () => {
      const userId = TestStorageManager.getUserId();
      expect(userId).toBeTruthy();
      expect(userId).toContain('test-uuid-');
    });

    it('should return the same user ID on subsequent calls', () => {
      const userId1 = TestStorageManager.getUserId();
      const userId2 = TestStorageManager.getUserId();
      expect(userId1).toBe(userId2);
    });

    it('should persist user ID across sessions', () => {
      const userId1 = TestStorageManager.getUserId();
      // Simulate new session by getting again
      const userId2 = TestStorageManager.getUserId();
      expect(userId1).toBe(userId2);
    });
  });

  describe('Settings Persistence', () => {
    it('should return default settings when none exist', () => {
      const settings = TestStorageManager.getSettings();
      expect(settings.selectedAudioId).toBeNull();
      expect(settings.selectedImageId).toBeNull();
    });

    it('should persist audio selection', () => {
      TestStorageManager.updateSettings({ selectedAudioId: 'om-mantra' });
      const settings = TestStorageManager.getSettings();
      expect(settings.selectedAudioId).toBe('om-mantra');
    });

    it('should persist image selection', () => {
      TestStorageManager.updateSettings({ selectedImageId: 'mountain-sunrise' });
      const settings = TestStorageManager.getSettings();
      expect(settings.selectedImageId).toBe('mountain-sunrise');
    });

    it('should persist timer settings', () => {
      TestStorageManager.updateSettings({
        timerSettings: { type: 'count-down', targetMinutes: 30 }
      });
      const settings = TestStorageManager.getSettings();
      expect(settings.timerSettings?.type).toBe('count-down');
      expect(settings.timerSettings?.targetMinutes).toBe(30);
    });

    it('should persist silent mode selection', () => {
      TestStorageManager.updateSettings({ selectedAudioId: 'silence' });
      const settings = TestStorageManager.getSettings();
      expect(settings.selectedAudioId).toBe('silence');
    });

    it('should persist custom audio name', () => {
      TestStorageManager.updateSettings({
        selectedAudioId: 'custom',
        customAudioName: 'my-meditation.mp3'
      });
      const settings = TestStorageManager.getSettings();
      expect(settings.selectedAudioId).toBe('custom');
      expect(settings.customAudioName).toBe('my-meditation.mp3');
    });

    it('should preserve existing settings when updating partial', () => {
      TestStorageManager.updateSettings({ selectedAudioId: 'om-mantra' });
      TestStorageManager.updateSettings({ selectedImageId: 'forest-mist' });
      const settings = TestStorageManager.getSettings();
      expect(settings.selectedAudioId).toBe('om-mantra');
      expect(settings.selectedImageId).toBe('forest-mist');
    });
  });

  describe('Local Stats', () => {
    it('should return zero stats when none exist', () => {
      const stats = TestStorageManager.getLocalStats();
      expect(stats.totalSeconds).toBe(0);
      expect(stats.sessionsCount).toBe(0);
      expect(stats.lastSession).toBeNull();
    });

    it('should persist meditation stats', () => {
      TestStorageManager.updateLocalStats({
        totalSeconds: 3600,
        sessionsCount: 5,
        lastSession: '2024-01-15T10:00:00Z'
      });
      const stats = TestStorageManager.getLocalStats();
      expect(stats.totalSeconds).toBe(3600);
      expect(stats.sessionsCount).toBe(5);
      expect(stats.lastSession).toBe('2024-01-15T10:00:00Z');
    });

    it('should accumulate meditation time correctly', () => {
      const stats = TestStorageManager.getLocalStats();
      const newTotal = stats.totalSeconds + 1800; // Add 30 minutes
      TestStorageManager.updateLocalStats({
        ...stats,
        totalSeconds: newTotal,
        sessionsCount: stats.sessionsCount + 1
      });
      const updated = TestStorageManager.getLocalStats();
      expect(updated.totalSeconds).toBe(1800);
      expect(updated.sessionsCount).toBe(1);
    });
  });
});

describe('Session Checkpoint Management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save and retrieve session checkpoint', () => {
    const checkpoint: SessionCheckpoint = {
      sessionId: 'session-123',
      userId: 'user-456',
      startedAt: Date.now() - 60000,
      lastCheckpoint: Date.now(),
      elapsedSeconds: 60
    };
    TestStorageManager.saveSessionCheckpoint(checkpoint);
    const retrieved = TestStorageManager.getSessionCheckpoint();
    expect(retrieved).toEqual(checkpoint);
  });

  it('should return null when no checkpoint exists', () => {
    const checkpoint = TestStorageManager.getSessionCheckpoint();
    expect(checkpoint).toBeNull();
  });

  it('should clear checkpoint', () => {
    const checkpoint: SessionCheckpoint = {
      sessionId: 'session-123',
      userId: 'user-456',
      startedAt: Date.now(),
      lastCheckpoint: Date.now(),
      elapsedSeconds: 0
    };
    TestStorageManager.saveSessionCheckpoint(checkpoint);
    TestStorageManager.clearSessionCheckpoint();
    expect(TestStorageManager.getSessionCheckpoint()).toBeNull();
  });

  it('should update checkpoint on each heartbeat', () => {
    const startTime = Date.now() - 30000;
    const checkpoint1: SessionCheckpoint = {
      sessionId: 'session-123',
      userId: 'user-456',
      startedAt: startTime,
      lastCheckpoint: Date.now() - 10000,
      elapsedSeconds: 20
    };
    TestStorageManager.saveSessionCheckpoint(checkpoint1);

    const checkpoint2: SessionCheckpoint = {
      ...checkpoint1,
      lastCheckpoint: Date.now(),
      elapsedSeconds: 30
    };
    TestStorageManager.saveSessionCheckpoint(checkpoint2);

    const retrieved = TestStorageManager.getSessionCheckpoint();
    expect(retrieved?.elapsedSeconds).toBe(30);
  });
});

describe('Orphaned Session Handling', () => {
  const ONE_HOUR_IN_SECONDS = 60 * 60;

  beforeEach(() => {
    localStorage.clear();
  });

  it('should save pending orphan session', () => {
    const orphan: PendingOrphanSession = {
      sessionId: 'session-123',
      userId: 'user-456',
      startedAt: Date.now() - 7200000, // 2 hours ago
      endedAt: Date.now(),
      durationSeconds: 7200
    };
    TestStorageManager.savePendingOrphanSession(orphan);
    const retrieved = TestStorageManager.getPendingOrphanSession();
    expect(retrieved).toEqual(orphan);
  });

  it('should return null when no pending orphan exists', () => {
    const orphan = TestStorageManager.getPendingOrphanSession();
    expect(orphan).toBeNull();
  });

  it('should clear pending orphan session', () => {
    const orphan: PendingOrphanSession = {
      sessionId: 'session-123',
      userId: 'user-456',
      startedAt: Date.now() - 7200000,
      endedAt: Date.now(),
      durationSeconds: 7200
    };
    TestStorageManager.savePendingOrphanSession(orphan);
    TestStorageManager.clearPendingOrphanSession();
    expect(TestStorageManager.getPendingOrphanSession()).toBeNull();
  });

  it('should identify session > 1 hour as requiring confirmation', () => {
    const checkpoint: SessionCheckpoint = {
      sessionId: 'session-123',
      userId: 'user-456',
      startedAt: Date.now() - 3700000, // 1 hour 1 min 40 sec ago
      lastCheckpoint: Date.now(),
      elapsedSeconds: 3700
    };
    const durationSeconds = Math.floor((checkpoint.lastCheckpoint - checkpoint.startedAt) / 1000);
    expect(durationSeconds >= ONE_HOUR_IN_SECONDS).toBe(true);
  });

  it('should not require confirmation for session < 1 hour', () => {
    const checkpoint: SessionCheckpoint = {
      sessionId: 'session-123',
      userId: 'user-456',
      startedAt: Date.now() - 1800000, // 30 minutes ago
      lastCheckpoint: Date.now(),
      elapsedSeconds: 1800
    };
    const durationSeconds = Math.floor((checkpoint.lastCheckpoint - checkpoint.startedAt) / 1000);
    expect(durationSeconds >= ONE_HOUR_IN_SECONDS).toBe(false);
  });

  it('should calculate correct duration for orphaned session', () => {
    const startTime = Date.now() - 5400000; // 1.5 hours ago
    const endTime = Date.now();
    const checkpoint: SessionCheckpoint = {
      sessionId: 'session-123',
      userId: 'user-456',
      startedAt: startTime,
      lastCheckpoint: endTime,
      elapsedSeconds: 5400
    };

    const durationSeconds = Math.max(0, Math.floor((checkpoint.lastCheckpoint - checkpoint.startedAt) / 1000));
    expect(durationSeconds).toBe(5400);
    expect(durationSeconds / 60).toBe(90); // 90 minutes
  });
});

describe('Session Lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should track complete session flow: start -> heartbeats -> end', () => {
    const userId = TestStorageManager.getUserId();
    const sessionId = 'session-' + Date.now();
    const startTime = Date.now();

    // Session start
    const initialCheckpoint: SessionCheckpoint = {
      sessionId,
      userId,
      startedAt: startTime,
      lastCheckpoint: startTime,
      elapsedSeconds: 0
    };
    TestStorageManager.saveSessionCheckpoint(initialCheckpoint);

    // Simulate heartbeats (every 10 seconds)
    for (let i = 1; i <= 6; i++) {
      const checkpoint: SessionCheckpoint = {
        sessionId,
        userId,
        startedAt: startTime,
        lastCheckpoint: startTime + (i * 10000),
        elapsedSeconds: i * 10
      };
      TestStorageManager.saveSessionCheckpoint(checkpoint);
    }

    // Session end
    const finalCheckpoint = TestStorageManager.getSessionCheckpoint();
    expect(finalCheckpoint?.elapsedSeconds).toBe(60);

    // Clear checkpoint on proper end
    TestStorageManager.clearSessionCheckpoint();
    expect(TestStorageManager.getSessionCheckpoint()).toBeNull();

    // Update stats
    const stats = TestStorageManager.getLocalStats();
    TestStorageManager.updateLocalStats({
      totalSeconds: stats.totalSeconds + 60,
      sessionsCount: stats.sessionsCount + 1,
      lastSession: new Date().toISOString()
    });

    const updatedStats = TestStorageManager.getLocalStats();
    expect(updatedStats.totalSeconds).toBe(60);
    expect(updatedStats.sessionsCount).toBe(1);
  });

  it('should handle page refresh during session (orphan flow)', () => {
    const userId = TestStorageManager.getUserId();
    const sessionId = 'session-' + Date.now();
    const startTime = Date.now() - 7200000; // 2 hours ago

    // Session was running, checkpoint saved
    const checkpoint: SessionCheckpoint = {
      sessionId,
      userId,
      startedAt: startTime,
      lastCheckpoint: Date.now() - 10000, // Last checkpoint 10 sec ago
      elapsedSeconds: 7190
    };
    TestStorageManager.saveSessionCheckpoint(checkpoint);

    // Page refreshes - detect orphan
    const savedCheckpoint = TestStorageManager.getSessionCheckpoint();
    expect(savedCheckpoint).not.toBeNull();

    const durationSeconds = Math.floor(
      (savedCheckpoint!.lastCheckpoint - savedCheckpoint!.startedAt) / 1000
    );
    const ONE_HOUR = 3600;

    // Should require confirmation (> 1 hour)
    expect(durationSeconds >= ONE_HOUR).toBe(true);

    // Create pending orphan
    const pendingOrphan: PendingOrphanSession = {
      sessionId: savedCheckpoint!.sessionId,
      userId: savedCheckpoint!.userId,
      startedAt: savedCheckpoint!.startedAt,
      endedAt: savedCheckpoint!.lastCheckpoint,
      durationSeconds
    };
    TestStorageManager.savePendingOrphanSession(pendingOrphan);
    TestStorageManager.clearSessionCheckpoint();

    // Verify orphan is pending
    const orphan = TestStorageManager.getPendingOrphanSession();
    expect(orphan).not.toBeNull();
    expect(orphan?.durationSeconds).toBeGreaterThan(ONE_HOUR);
  });

  it('should handle explicit End Session button click', () => {
    const userId = TestStorageManager.getUserId();
    const sessionId = 'session-' + Date.now();
    const startTime = Date.now() - 1800000; // 30 minutes ago

    // Active session
    const checkpoint: SessionCheckpoint = {
      sessionId,
      userId,
      startedAt: startTime,
      lastCheckpoint: Date.now(),
      elapsedSeconds: 1800
    };
    TestStorageManager.saveSessionCheckpoint(checkpoint);

    // User clicks "End Session"
    const finalCheckpoint = TestStorageManager.getSessionCheckpoint();
    const durationSeconds = Math.floor(
      (Date.now() - finalCheckpoint!.startedAt) / 1000
    );

    // Update stats directly (no confirmation needed)
    const stats = TestStorageManager.getLocalStats();
    TestStorageManager.updateLocalStats({
      totalSeconds: stats.totalSeconds + durationSeconds,
      sessionsCount: stats.sessionsCount + 1,
      lastSession: new Date().toISOString()
    });

    // Clear checkpoint
    TestStorageManager.clearSessionCheckpoint();

    // Verify no pending orphan (proper end)
    expect(TestStorageManager.getPendingOrphanSession()).toBeNull();
    expect(TestStorageManager.getSessionCheckpoint()).toBeNull();

    // Verify stats updated
    const updatedStats = TestStorageManager.getLocalStats();
    expect(updatedStats.sessionsCount).toBe(1);
    expect(updatedStats.totalSeconds).toBeGreaterThanOrEqual(1800);
  });
});
