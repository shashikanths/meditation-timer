import { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, getCountFromServer, Timestamp, addDoc, increment } from 'firebase/firestore';
import { StorageManager, SessionCheckpoint, SESSION_BACKGROUND_THRESHOLD_MS } from '../utils/storage';
import { getUserCounts, isUsingLocalDatabase, updateUser, endSession, getUser } from '../lib/database';

interface GlobalCounterProps {
  userId: string;
}

/**
 * GlobalCounter: Real-time meditation statistics
 * Shows: Active users (concurrent) and Total unique users
 *
 * Session persistence: Saves checkpoints to localStorage every 10 seconds
 * to survive page close. Orphaned sessions are recovered on next visit.
 *
 * Session continuity logic:
 * - If page was VISIBLE (foreground, even if screen locked): always continue session
 * - If page was HIDDEN (backgrounded/tab switched):
 *   - Return within threshold: continue session
 *   - Return after threshold: end session at lastHiddenAt time, start new session
 * - This allows long meditation sessions while preventing inflation from forgotten tabs
 *
 * Note on audio and background detection:
 * Browsers intentionally keep tabs with active audio in "visible" state to prevent
 * audio interruption. This means visibilitychange won't fire when audio is playing.
 * However, on mobile devices with screen lock, visibilitychange DOES fire even with
 * audio playing. The current implementation relies on visibilitychange which works
 * for the primary use case (phone locked during meditation).
 */
export const GlobalCounter: React.FC<GlobalCounterProps> = ({ userId }) => {
  const [active, setActive] = useState(0);
  const [totalUnique, setTotalUnique] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Track page visibility state
  const lastHiddenAtRef = useRef<number | null>(null);

  // Handle checkpoint on mount - either continue or recover the session
  useEffect(() => {
    if (!userId) return;

    const handleExistingCheckpoint = async () => {
      const checkpoint = StorageManager.getSessionCheckpoint();

      if (checkpoint && checkpoint.userId === userId) {
        // Determine if session should continue based on visibility
        const shouldContinue = (() => {
          // If page was visible (foreground) at last checkpoint, always continue
          if (checkpoint.wasPageVisible) {
            console.log('Page was visible at last checkpoint - continuing session');
            return true;
          }

          // Page was hidden (backgrounded) - check how long ago
          if (checkpoint.lastHiddenAt) {
            const timeSinceHidden = Date.now() - checkpoint.lastHiddenAt;
            if (timeSinceHidden <= SESSION_BACKGROUND_THRESHOLD_MS) {
              console.log(`Page was backgrounded ${Math.floor(timeSinceHidden / 1000)}s ago - continuing session`);
              return true;
            }
            console.log(`Page was backgrounded ${Math.floor(timeSinceHidden / 1000)}s ago - exceeds threshold`);
            return false;
          }

          // Fallback: use lastCheckpoint time (for backwards compatibility with old checkpoints)
          const timeSinceLastCheckpoint = Date.now() - checkpoint.lastCheckpoint;
          if (timeSinceLastCheckpoint <= SESSION_BACKGROUND_THRESHOLD_MS) {
            console.log(`Fallback: ${Math.floor(timeSinceLastCheckpoint / 1000)}s since last checkpoint - continuing`);
            return true;
          }
          return false;
        })();

        if (shouldContinue) {
          // Restore session state so heartbeat continues it
          sessionIdRef.current = checkpoint.sessionId;
          sessionStartTimeRef.current = checkpoint.startedAt;
          lastHiddenAtRef.current = checkpoint.lastHiddenAt;
          // Don't clear checkpoint - it will be updated by the next heartbeat
          return;
        }

        // Session ended - calculate duration
        // Use lastHiddenAt if page was backgrounded, otherwise lastCheckpoint
        const sessionEndTime = checkpoint.lastHiddenAt || checkpoint.lastCheckpoint;
        const totalSeconds = Math.max(0, Math.floor((sessionEndTime - checkpoint.startedAt) / 1000));

        // Skip if duration is 0 or negative (clock skew protection)
        if (totalSeconds <= 0) {
          console.log(`Skipping orphaned session recovery: invalid duration (${totalSeconds}s)`);
          StorageManager.clearSessionCheckpoint();
          return;
        }

        console.log(`Recovering orphaned session: ${totalSeconds} seconds (ended at ${checkpoint.lastHiddenAt ? 'lastHiddenAt' : 'lastCheckpoint'})`);

        try {
          // Update user stats via abstraction layer
          const userData = await getUser(userId);
          if (userData) {
            await updateUser(userId, {
              totalSecondsIncrement: totalSeconds,
              sessionsCountIncrement: 1,
              lastSeen: true
            });

            // Update local stats
            StorageManager.updateLocalStats({
              totalSeconds: (userData.totalSeconds || 0) + totalSeconds,
              lastSession: new Date(sessionEndTime).toISOString(),
              sessionsCount: (userData.sessionsCount || 0) + 1
            });
          }

          // Close the orphaned session if it exists
          if (checkpoint.sessionId) {
            await endSession(checkpoint.sessionId, totalSeconds, sessionEndTime).catch(() => {
              // Session might not exist, that's ok
            });
          }
        } catch (error) {
          console.error('Failed to recover orphaned session:', error);
        }

        // Clear the checkpoint - a new session will start
        StorageManager.clearSessionCheckpoint();
      }
    };

    handleExistingCheckpoint();
  }, [userId]);

  const saveCheckpoint = () => {
    if (!userId || !sessionStartTimeRef.current || !sessionIdRef.current) return;

    const isPageVisible = document.visibilityState === 'visible';

    const checkpoint: SessionCheckpoint = {
      sessionId: sessionIdRef.current,
      userId,
      startedAt: sessionStartTimeRef.current,
      lastCheckpoint: Date.now(),
      elapsedSeconds: Math.floor((Date.now() - sessionStartTimeRef.current) / 1000),
      wasPageVisible: isPageVisible,
      lastHiddenAt: lastHiddenAtRef.current
    };

    StorageManager.saveSessionCheckpoint(checkpoint);
  };

  const fetchStats = async (isClosing = false) => {
    if (!userId) return;

    try {
      // Use local SQLite in dev mode, Firebase in production
      if (isUsingLocalDatabase()) {
        // Local dev mode - use Express API for all operations
        if (isClosing) {
          // End session via API
          if (sessionIdRef.current && sessionStartTimeRef.current) {
            const durationSeconds = Math.max(0, Math.floor((Date.now() - sessionStartTimeRef.current) / 1000));

            // End session and update user stats via API
            await fetch('/api/meditation/end', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId: sessionIdRef.current, durationSeconds })
            });

            // Update user stats
            if (durationSeconds > 0) {
              await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  totalSecondsIncrement: durationSeconds,
                  sessionsCountIncrement: 1,
                  lastSeen: true
                })
              });
            }

            StorageManager.clearSessionCheckpoint();
            sessionIdRef.current = null;
            sessionStartTimeRef.current = null;
          }
        } else {
          // Heartbeat - update last_seen and start session if needed
          await fetch('/api/meditation/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, status: 'active' })
          });

          if (!sessionIdRef.current) {
            // Start new session via API
            const response = await fetch('/api/meditation/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId })
            });
            const data = await response.json();
            sessionIdRef.current = data.sessionId;
            sessionStartTimeRef.current = Date.now();
          }

          saveCheckpoint();
        }

        // Get counts from local SQLite
        const counts = await getUserCounts();
        setActive(counts.activeCount);
        setTotalUnique(counts.totalCount);
      } else {
        // Production mode - use Firebase directly
        const userRef = doc(db, 'users', userId);

        // Update user's last_seen
        await updateDoc(userRef, {
          lastSeen: serverTimestamp()
        });

        if (isClosing) {
          // Close active session and update user stats
          if (sessionIdRef.current && sessionStartTimeRef.current) {
            const durationSeconds = Math.max(0, Math.floor((Date.now() - sessionStartTimeRef.current) / 1000));

            // Update session in Firestore
            const sessionRef = doc(db, 'sessions', sessionIdRef.current);
            await updateDoc(sessionRef, {
              endedAt: serverTimestamp(),
              durationSeconds,
              isActive: false
            }).catch(() => {});

            // Update user stats (only if positive duration)
            if (durationSeconds > 0) {
              await updateDoc(userRef, {
                totalSeconds: increment(durationSeconds),
                sessionsCount: increment(1)
              });
            }

            // Clear checkpoint since session ended normally
            StorageManager.clearSessionCheckpoint();

            sessionIdRef.current = null;
            sessionStartTimeRef.current = null;
          }
        } else {
          // Check if we need to start a new session
          if (!sessionIdRef.current) {
            // Create new active session
            const newSession = await addDoc(collection(db, 'sessions'), {
              userId,
              startedAt: serverTimestamp(),
              isActive: true
            });
            sessionIdRef.current = newSession.id;
            sessionStartTimeRef.current = Date.now();
          }

          // Save checkpoint on every heartbeat
          saveCheckpoint();
        }

        // Get counts from Firebase
        const thirtySecondsAgo = Timestamp.fromMillis(Date.now() - 30000);
        const usersRef = collection(db, 'users');
        const activeQuery = query(usersRef, where('lastSeen', '>=', thirtySecondsAgo));
        const activeSnapshot = await getCountFromServer(activeQuery);
        const activeCount = activeSnapshot.data().count;

        // Calculate total unique users
        const totalSnapshot = await getCountFromServer(collection(db, 'users'));
        const totalUniqueUsers = totalSnapshot.data().count;

        setActive(activeCount);
        setTotalUnique(totalUniqueUsers);
      }
    } catch (err) {
      console.warn('Failed to fetch stats:', err);
      // Still save checkpoint even if Firestore fails
      saveCheckpoint();
      // Fallback: Show local user only
      setActive(1);
      setTotalUnique(1);
    }
  };

  useEffect(() => {
    if (!userId) return;

    // Initial load ping
    fetchStats();

    // Continuous heartbeat (every 10 seconds)
    const startHeartbeat = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => fetchStats(), 10000);
    };

    startHeartbeat();

    // Handle page unload - try to end session
    const handleBeforeUnload = () => {
      // Save final checkpoint (beforeunload is unreliable but worth trying)
      saveCheckpoint();
      // Note: We don't call fetchStats(true) here because it's async
      // and won't complete before page closes. The checkpoint will be
      // recovered on next visit.
    };

    // Handle page hide (more reliable on mobile)
    const handlePageHide = () => {
      saveCheckpoint();
    };

    // Handle explicit session end (from End Session button)
    const handleEndSession = async () => {
      if (sessionIdRef.current && sessionStartTimeRef.current) {
        const durationSeconds = Math.max(0, Math.floor((Date.now() - sessionStartTimeRef.current) / 1000));

        try {
          // End session via abstraction layer
          await endSession(sessionIdRef.current, durationSeconds).catch(() => {});

          // Update user stats (only if positive duration)
          if (durationSeconds > 0) {
            await updateUser(userId, {
              totalSecondsIncrement: durationSeconds,
              sessionsCountIncrement: 1,
              lastSeen: true
            });
          }

          // Update local stats
          const userData = await getUser(userId);
          if (userData) {
            StorageManager.updateLocalStats({
              totalSeconds: userData.totalSeconds || 0,
              lastSession: new Date().toISOString(),
              sessionsCount: userData.sessionsCount || 0
            });
          }

          console.log(`Session ended manually: ${durationSeconds} seconds`);
        } catch (error) {
          console.error('Failed to end session:', error);
        }

        // Clear session state
        sessionIdRef.current = null;
        sessionStartTimeRef.current = null;
        lastHiddenAtRef.current = null;
        StorageManager.clearSessionCheckpoint();
      }
    };

    // Track when page goes to background
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        // Page is going to background - record timestamp
        lastHiddenAtRef.current = Date.now();
        saveCheckpoint();
      } else if (document.visibilityState === 'visible') {
        // Page is returning to foreground - check if session should end
        if (lastHiddenAtRef.current) {
          const timeSinceHidden = Date.now() - lastHiddenAtRef.current;

          if (timeSinceHidden > SESSION_BACKGROUND_THRESHOLD_MS) {
            // Session was backgrounded too long - end it at lastHiddenAt and start fresh
            console.log(`Session was backgrounded for ${Math.floor(timeSinceHidden / 1000)}s - ending session`);

            if (sessionIdRef.current && sessionStartTimeRef.current) {
              const durationSeconds = Math.max(0, Math.floor((lastHiddenAtRef.current - sessionStartTimeRef.current) / 1000));

              try {
                // End session via abstraction layer - ended at lastHiddenAt
                await endSession(sessionIdRef.current, durationSeconds, lastHiddenAtRef.current).catch(() => {});

                // Update user stats (only if positive duration)
                if (durationSeconds > 0) {
                  await updateUser(userId, {
                    totalSecondsIncrement: durationSeconds,
                    sessionsCountIncrement: 1,
                    lastSeen: true
                  });
                }

                // Update local stats
                const userData = await getUser(userId);
                if (userData) {
                  StorageManager.updateLocalStats({
                    totalSeconds: userData.totalSeconds || 0,
                    lastSession: new Date(lastHiddenAtRef.current).toISOString(),
                    sessionsCount: userData.sessionsCount || 0
                  });
                }
              } catch (error) {
                console.error('Failed to end backgrounded session:', error);
              }

              // Clear session state - new session will start on next heartbeat
              sessionIdRef.current = null;
              sessionStartTimeRef.current = null;
              StorageManager.clearSessionCheckpoint();

              // Dispatch event to reset UI
              window.dispatchEvent(new CustomEvent('endMeditationSession'));
            }

            // Reset lastHiddenAt for the new session
            lastHiddenAtRef.current = null;
          }
        }

        // Save checkpoint (either continuing session or will start new one)
        saveCheckpoint();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('endMeditationSession', handleEndSession);

    return () => {
      // Cleanup - try to end session
      if (intervalRef.current) clearInterval(intervalRef.current);
      saveCheckpoint();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('endMeditationSession', handleEndSession);
    };
  }, [userId]);

  return (
    <div className="flex flex-col items-center space-y-1">
      <div className="flex space-x-10 items-center">
        <div className="text-center">
          <span className="text-5xl md:text-7xl font-cinzel font-bold text-primary glow-primary">
            {active === 0 ? '...' : active.toLocaleString()}
          </span>
          <p className="text-[10px] uppercase tracking-[0.4em] text-primary-30 mt-2 font-bold">Active Now</p>
        </div>
        <div className="h-10 w-px bg-primary-10"></div>
        <div className="text-center">
          <span className="text-2xl md:text-4xl font-cinzel text-white/60">
            {totalUnique === 0 ? '...' : totalUnique.toLocaleString()}
          </span>
          <p className="text-[10px] uppercase tracking-[0.4em] text-primary-30 mt-2 font-bold">Total Users</p>
        </div>
      </div>
    </div>
  );
};
