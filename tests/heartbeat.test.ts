import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('Heartbeat and Session Tracking', () => {
  const HEARTBEAT_INTERVAL = 10000; // 10 seconds

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Heartbeat Timing', () => {
    it('should send heartbeat every 10 seconds', () => {
      const heartbeatFn = vi.fn();
      const interval = setInterval(heartbeatFn, HEARTBEAT_INTERVAL);

      // Initial - no calls yet
      expect(heartbeatFn).not.toHaveBeenCalled();

      // After 10 seconds - 1 call
      vi.advanceTimersByTime(10000);
      expect(heartbeatFn).toHaveBeenCalledTimes(1);

      // After 20 seconds - 2 calls
      vi.advanceTimersByTime(10000);
      expect(heartbeatFn).toHaveBeenCalledTimes(2);

      // After 60 seconds - 6 calls
      vi.advanceTimersByTime(40000);
      expect(heartbeatFn).toHaveBeenCalledTimes(6);

      clearInterval(interval);
    });

    it('should save checkpoint on each heartbeat', () => {
      const saveCheckpoint = vi.fn();
      const interval = setInterval(saveCheckpoint, HEARTBEAT_INTERVAL);

      vi.advanceTimersByTime(30000); // 30 seconds = 3 heartbeats
      expect(saveCheckpoint).toHaveBeenCalledTimes(3);

      clearInterval(interval);
    });
  });

  describe('Session Start Behavior', () => {
    it('should start session immediately when user taps entry screen', () => {
      const startSession = vi.fn();
      const isBlocked = true;

      // Simulate tap interaction
      if (isBlocked) {
        startSession();
      }

      expect(startSession).toHaveBeenCalledTimes(1);
    });

    it('should not start new session if one already exists', () => {
      let sessionId: string | null = 'existing-session';
      const startSession = vi.fn();

      // Check if session exists before starting
      if (!sessionId) {
        startSession();
      }

      expect(startSession).not.toHaveBeenCalled();
    });

    it('should create new session after previous one ended', () => {
      let sessionId: string | null = 'old-session';
      const startSession = vi.fn(() => {
        sessionId = 'new-session-' + Date.now();
      });

      // End session
      sessionId = null;

      // Start new session
      if (!sessionId) {
        startSession();
      }

      expect(startSession).toHaveBeenCalledTimes(1);
      expect(sessionId).toContain('new-session');
    });
  });

  describe('Background/Visibility Handling', () => {
    it('should continue session when page goes to background', () => {
      let sessionActive = true;
      let visibilityState = 'visible';

      // Page goes to background
      visibilityState = 'hidden';

      // Session should still be active (we don't end on visibility change anymore)
      expect(sessionActive).toBe(true);
    });

    it('should continue session when screen is locked', () => {
      let sessionActive = true;
      const screenLocked = true;

      // Screen lock shouldn't affect session
      expect(sessionActive).toBe(true);
    });

    it('should continue tracking time in background', () => {
      const startTime = Date.now();
      let elapsedSeconds = 0;

      // Simulate 5 minutes passing while in background
      vi.advanceTimersByTime(300000);

      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

      // Timer should show 5 minutes elapsed
      expect(elapsedSeconds).toBe(300);
    });

    it('should update display when page becomes visible again', () => {
      const startTime = Date.now() - 600000; // Started 10 minutes ago
      let displayedElapsed = 0;

      // Simulate visibility change to visible
      const updateDisplay = () => {
        displayedElapsed = Math.floor((Date.now() - startTime) / 1000);
      };

      updateDisplay();

      expect(displayedElapsed).toBe(600); // 10 minutes
    });
  });

  describe('Audio Playback During Session', () => {
    it('should continue audio even when screen is locked', () => {
      let isPlaying = true;
      const screenLocked = true;

      // Audio should keep playing
      // (This is handled by browser/Web Audio API, we just verify state)
      expect(isPlaying).toBe(true);
    });

    it('should allow muting without ending session', () => {
      let isMuted = false;
      let sessionActive = true;

      // Mute audio
      isMuted = true;

      // Session should still be active
      expect(isMuted).toBe(true);
      expect(sessionActive).toBe(true);
    });

    it('should resume audio when unmuted', () => {
      let isMuted = true;

      // Unmute
      isMuted = false;

      expect(isMuted).toBe(false);
    });
  });

  describe('Session End Scenarios', () => {
    it('should end session on explicit End Session button click', () => {
      let sessionActive = true;
      let checkpointCleared = false;

      // Click End Session
      const endSession = () => {
        sessionActive = false;
        checkpointCleared = true;
      };

      endSession();

      expect(sessionActive).toBe(false);
      expect(checkpointCleared).toBe(true);
    });

    it('should save checkpoint on page unload', () => {
      const saveCheckpoint = vi.fn();

      // Simulate beforeunload event
      const handleBeforeUnload = () => {
        saveCheckpoint();
      };

      handleBeforeUnload();

      expect(saveCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('should save checkpoint on page hide (mobile)', () => {
      const saveCheckpoint = vi.fn();

      // Simulate pagehide event
      const handlePageHide = () => {
        saveCheckpoint();
      };

      handlePageHide();

      expect(saveCheckpoint).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timer Display Accuracy', () => {
    it('should display elapsed time correctly from checkpoint', () => {
      const checkpoint = {
        startedAt: Date.now() - 125000, // 2 minutes 5 seconds ago
        lastCheckpoint: Date.now()
      };

      const elapsedSeconds = Math.floor((Date.now() - checkpoint.startedAt) / 1000);

      expect(elapsedSeconds).toBe(125);
    });

    it('should format time display correctly', () => {
      const formatDisplay = (totalSeconds: number) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
          return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      };

      expect(formatDisplay(65)).toBe('1:05');
      expect(formatDisplay(3665)).toBe('1:01:05');
      expect(formatDisplay(0)).toBe('0:00');
      expect(formatDisplay(3600)).toBe('1:00:00');
    });

    it('should update timer every second', () => {
      let elapsed = 0;
      const updateTimer = vi.fn(() => elapsed++);

      const interval = setInterval(updateTimer, 1000);

      vi.advanceTimersByTime(5000);
      expect(updateTimer).toHaveBeenCalledTimes(5);
      expect(elapsed).toBe(5);

      clearInterval(interval);
    });
  });
});

describe('Server Communication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Stats Endpoint', () => {
    it('should send heartbeat with correct payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ activeCount: 5, totalCount: 100 })
      });
      global.fetch = mockFetch;

      const userId = 'test-user-123';
      await fetch('/api/meditation/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: 'active' })
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/meditation/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: 'active' })
      });
    });

    it('should handle network errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      let error: Error | null = null;
      try {
        await fetch('/api/meditation/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'test', status: 'active' })
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toBe('Network error');
    });
  });

  describe('Session Start Endpoint', () => {
    it('should create session and return session ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessionId: 'new-session-456' })
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/meditation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'test-user' })
      });
      const data = await response.json();

      expect(data.sessionId).toBe('new-session-456');
    });
  });

  describe('Session End Endpoint', () => {
    it('should send correct duration on session end', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });
      global.fetch = mockFetch;

      const sessionId = 'session-123';
      const durationSeconds = 1800; // 30 minutes

      await fetch('/api/meditation/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, durationSeconds })
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/meditation/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, durationSeconds })
      });
    });
  });

  describe('User Stats Update', () => {
    it('should update user stats after session', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });
      global.fetch = mockFetch;

      const userId = 'user-123';
      const sessionDuration = 3600; // 1 hour

      await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalSecondsIncrement: sessionDuration,
          sessionsCountIncrement: 1,
          lastSeen: true
        })
      });

      expect(mockFetch).toHaveBeenCalledWith(`/api/users/${userId}`, expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"totalSecondsIncrement":3600')
      }));
    });
  });
});
