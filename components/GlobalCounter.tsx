
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, getCountFromServer, Timestamp, getDocs, setDoc, addDoc } from 'firebase/firestore';

interface GlobalCounterProps {
  userId: string;
}

/**
 * GlobalCounter: Real-time meditation statistics
 * Shows: Active users (concurrent) and Total unique users
 */
export const GlobalCounter: React.FC<GlobalCounterProps> = ({ userId }) => {
  const [active, setActive] = useState(0);
  const [totalUnique, setTotalUnique] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionRef = useRef<string | null>(null);

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
        if (activeSessionRef.current) {
          const sessionsRef = collection(db, 'sessions');
          const q = query(sessionsRef, where('userId', '==', userId), where('isActive', '==', true));
          const activeSessions = await getDocs(q);

          if (!activeSessions.empty) {
            const sessionDoc = activeSessions.docs[0];
            const sessionData = sessionDoc.data();

            const startTime = sessionData.startedAt?.toMillis() || Date.now();
            const endTime = Date.now();
            const durationSeconds = Math.floor((endTime - startTime) / 1000);

            // Update session
            await updateDoc(sessionDoc.ref, {
              endedAt: serverTimestamp(),
              durationSeconds,
              isActive: false
            });

            // Update user stats
            await updateDoc(userRef, {
              totalSeconds: (await getDocs(query(collection(db, 'users'), where('id', '==', userId)))).docs[0]?.data()?.totalSeconds || 0 + durationSeconds,
              sessionsCount: ((await getDocs(query(collection(db, 'users'), where('id', '==', userId)))).docs[0]?.data()?.sessionsCount || 0) + 1
            });

            activeSessionRef.current = null;
          }
        }
      } else {
        // Check if user has an active session
        const sessionsRef = collection(db, 'sessions');
        const q = query(sessionsRef, where('userId', '==', userId), where('isActive', '==', true));
        const activeSessions = await getDocs(q);

        if (activeSessions.empty) {
          // Create new active session
          const newSession = await addDoc(collection(db, 'sessions'), {
            userId,
            startedAt: serverTimestamp(),
            isActive: true
          });
          activeSessionRef.current = newSession.id;
        } else {
          activeSessionRef.current = activeSessions.docs[0].id;
        }
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

    const stopHeartbeat = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      fetchStats(true);
    };

    startHeartbeat();

    // Tab visibility handling
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startHeartbeat();
      } else {
        stopHeartbeat();
      }
    };

    const handleBeforeUnload = () => {
      fetchStats(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      stopHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
