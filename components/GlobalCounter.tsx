
import React, { useState, useEffect, useRef } from 'react';

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

  const fetchStats = async (isClosing = false) => {
    if (!userId) return;

    try {
      const response = await fetch('/api/meditation/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          status: isClosing ? 'inactive' : 'active',
          timestamp: Date.now()
        }),
        keepalive: true
      });

      if (response.ok) {
        const data = await response.json();
        setActive(data.activeCount);
        setTotalUnique(data.totalUniqueUsers || data.totalCount);
      }
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
