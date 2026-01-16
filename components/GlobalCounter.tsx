import { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, getCountFromServer, Timestamp, addDoc, increment } from 'firebase/firestore';
import { StorageManager, SessionCheckpoint, PendingOrphanSession } from '../utils/storage';
import { getUserCounts, isUsingLocalDatabase, updateUser, endSession, getUser } from '../lib/database';

interface GlobalCounterProps {
  userId: string;
}

/**
 * GlobalCounter: Real-time meditation statistics
 * Shows: Active users (concurrent) and Total unique users
 *
 * Session persistence: Saves checkpoints to localStorage every 10 seconds
 * to survive page close.
 *
 * Orphaned session handling:
 * - When page loads with an existing checkpoint, it's treated as an orphaned session
 * - User is prompted to confirm they actually meditated for that duration
 * - Session is only saved to stats if user confirms
 *
 * Sessions only end when:
 * - User clicks "End Session" button
 * - User refreshes the page
 * - User closes the browser tab
 */
export const GlobalCounter: React.FC<GlobalCounterProps> = ({ userId }) => {
  const [active, setActive] = useState(0);
  const [totalUnique, setTotalUnique] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Handle checkpoint on mount - orphaned sessions need confirmation
  useEffect(() => {
    if (!userId) return;

    const handleExistingCheckpoint = () => {
      const checkpoint = StorageManager.getSessionCheckpoint();

      if (checkpoint && checkpoint.userId === userId) {
        // Found an orphaned session - create pending session for confirmation
        const durationSeconds = Math.max(0, Math.floor((checkpoint.lastCheckpoint - checkpoint.startedAt) / 1000));
        const ONE_HOUR_IN_SECONDS = 60 * 60;

        // Only prompt for confirmation if session was > 1 hour
        // Shorter sessions are assumed to be intentional page refreshes
        if (durationSeconds >= ONE_HOUR_IN_SECONDS) {
          const pendingSession: PendingOrphanSession = {
            sessionId: checkpoint.sessionId,
            userId: checkpoint.userId,
            startedAt: checkpoint.startedAt,
            endedAt: checkpoint.lastCheckpoint,
            durationSeconds
          };

          StorageManager.savePendingOrphanSession(pendingSession);
          console.log(`Found orphaned session: ${durationSeconds} seconds (>${ONE_HOUR_IN_SECONDS}s) - awaiting user confirmation`);

          // Dispatch event to show confirmation popup
          window.dispatchEvent(new CustomEvent('orphanedSessionFound', {
            detail: pendingSession
          }));
        } else {
          console.log(`Found short orphaned session: ${durationSeconds} seconds - discarding (< 1 hour)`);
        }

        // Clear the checkpoint - don't resume the old session
        StorageManager.clearSessionCheckpoint();
      }
    };

    handleExistingCheckpoint();
  }, [userId]);

  const saveCheckpoint = () => {
    if (!userId || !sessionStartTimeRef.current || !sessionIdRef.current) return;

    const checkpoint: SessionCheckpoint = {
      sessionId: sessionIdRef.current,
      userId,
      startedAt: sessionStartTimeRef.current,
      lastCheckpoint: Date.now(),
      elapsedSeconds: Math.floor((Date.now() - sessionStartTimeRef.current) / 1000)
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
        StorageManager.clearSessionCheckpoint();
      }
    };

    // Handle confirmed orphan session (user confirmed they meditated)
    const handleConfirmOrphanSession = async (event: Event) => {
      const customEvent = event as CustomEvent<PendingOrphanSession>;
      const session = customEvent.detail;

      if (!session || session.userId !== userId) return;

      try {
        // End session via abstraction layer
        await endSession(session.sessionId, session.durationSeconds, session.endedAt).catch(() => {});

        // Update user stats
        if (session.durationSeconds > 0) {
          await updateUser(userId, {
            totalSecondsIncrement: session.durationSeconds,
            sessionsCountIncrement: 1,
            lastSeen: true
          });
        }

        // Update local stats
        const userData = await getUser(userId);
        if (userData) {
          StorageManager.updateLocalStats({
            totalSeconds: userData.totalSeconds || 0,
            lastSession: new Date(session.endedAt).toISOString(),
            sessionsCount: userData.sessionsCount || 0
          });
        }

        console.log(`Orphan session confirmed and saved: ${session.durationSeconds} seconds`);
      } catch (error) {
        console.error('Failed to save confirmed orphan session:', error);
      }

      StorageManager.clearPendingOrphanSession();
    };

    // Handle denied orphan session (user said they didn't meditate)
    const handleDenyOrphanSession = () => {
      console.log('Orphan session denied by user');
      StorageManager.clearPendingOrphanSession();
    };

    // Handle session start request (from tapping past entry screen)
    const handleStartSession = () => {
      // Immediately start a session if not already active
      if (!sessionIdRef.current) {
        fetchStats();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('endMeditationSession', handleEndSession);
    window.addEventListener('confirmOrphanSession', handleConfirmOrphanSession);
    window.addEventListener('denyOrphanSession', handleDenyOrphanSession);
    window.addEventListener('startMeditationSession', handleStartSession);

    return () => {
      // Cleanup - try to end session
      if (intervalRef.current) clearInterval(intervalRef.current);
      saveCheckpoint();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('endMeditationSession', handleEndSession);
      window.removeEventListener('confirmOrphanSession', handleConfirmOrphanSession);
      window.removeEventListener('denyOrphanSession', handleDenyOrphanSession);
      window.removeEventListener('startMeditationSession', handleStartSession);
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
