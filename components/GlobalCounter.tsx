import { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, getCountFromServer, Timestamp, getDocs, addDoc, getDoc, increment } from 'firebase/firestore';
import { StorageManager, SessionCheckpoint } from '../utils/storage';

interface GlobalCounterProps {
  userId: string;
}

/**
 * GlobalCounter: Real-time meditation statistics
 * Shows: Active users (concurrent) and Total unique users
 *
 * Session persistence: Saves checkpoints to localStorage every 10 seconds
 * to survive page close. Orphaned sessions are recovered on next visit.
 */
export const GlobalCounter: React.FC<GlobalCounterProps> = ({ userId }) => {
  const [active, setActive] = useState(0);
  const [totalUnique, setTotalUnique] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Recover orphaned session on mount
  useEffect(() => {
    if (!userId) return;

    const recoverOrphanedSession = async () => {
      const checkpoint = StorageManager.getSessionCheckpoint();

      if (checkpoint && checkpoint.userId === userId) {
        // Found an orphaned session - calculate total duration
        const totalSeconds = Math.floor((Date.now() - checkpoint.startedAt) / 1000);

        console.log(`Recovering orphaned session: ${totalSeconds} seconds`);

        try {
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);

          if (userDoc.exists()) {
            // Update user's total meditation time
            await updateDoc(userRef, {
              totalSeconds: increment(totalSeconds),
              sessionsCount: increment(1),
              lastSeen: serverTimestamp()
            });

            // Update local stats
            const userData = userDoc.data();
            StorageManager.updateLocalStats({
              totalSeconds: (userData.totalSeconds || 0) + totalSeconds,
              lastSession: new Date().toISOString(),
              sessionsCount: (userData.sessionsCount || 0) + 1
            });
          }

          // Close the orphaned Firestore session if it exists
          if (checkpoint.sessionId) {
            const sessionRef = doc(db, 'sessions', checkpoint.sessionId);
            await updateDoc(sessionRef, {
              endedAt: serverTimestamp(),
              durationSeconds: totalSeconds,
              isActive: false,
              recoveredFromCheckpoint: true
            }).catch(() => {
              // Session might not exist in Firestore, that's ok
            });
          }
        } catch (error) {
          console.error('Failed to recover orphaned session:', error);
        }

        // Clear the checkpoint
        StorageManager.clearSessionCheckpoint();
      }
    };

    recoverOrphanedSession();
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
      const userRef = doc(db, 'users', userId);

      // Update user's last_seen
      await updateDoc(userRef, {
        lastSeen: serverTimestamp()
      });

      if (isClosing) {
        // Close active session and update user stats
        if (sessionIdRef.current && sessionStartTimeRef.current) {
          const durationSeconds = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);

          // Update session in Firestore
          const sessionRef = doc(db, 'sessions', sessionIdRef.current);
          await updateDoc(sessionRef, {
            endedAt: serverTimestamp(),
            durationSeconds,
            isActive: false
          }).catch(() => {});

          // Update user stats
          await updateDoc(userRef, {
            totalSeconds: increment(durationSeconds),
            sessionsCount: increment(1)
          });

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

      // Calculate active count (users with last_seen < 30 seconds ago)
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

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      // Cleanup - try to end session
      if (intervalRef.current) clearInterval(intervalRef.current);
      saveCheckpoint();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
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
