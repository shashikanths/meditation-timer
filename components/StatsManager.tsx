import React, { useState, useEffect } from 'react';
import { StorageManager } from '../utils/storage';

interface StatsManagerProps {
  userId: string;
}

export const StatsManager: React.FC<StatsManagerProps> = ({ userId }) => {
  const [stats, setStats] = useState({
    totalSeconds: 0,
    lastSession: null as string | null,
    sessionsCount: 0
  });
  const [leaderboardRank, setLeaderboardRank] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState<string>('');

  useEffect(() => {
    // Get display name from storage
    setDisplayName(StorageManager.getDisplayName());
  }, []);

  useEffect(() => {
    if (!userId) return;

    const loadStats = async () => {
      try {
        // Fetch user data from backend
        const response = await fetch('/api/users/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, displayName: StorageManager.getDisplayName() })
        });

        if (response.ok) {
          const data = await response.json();
          setStats({
            totalSeconds: data.totalSeconds,
            lastSession: null,
            sessionsCount: data.sessionsCount
          });

          // Fetch leaderboard rank
          const leaderboardResponse = await fetch(`/api/meditation/leaderboard?userId=${userId}`);
          if (leaderboardResponse.ok) {
            const leaderboardData = await leaderboardResponse.json();
            if (leaderboardData.currentUserRank) {
              setLeaderboardRank(leaderboardData.currentUserRank.rank);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load stats from backend:', error);
        // Load from localStorage as fallback
        const localStats = localStorage.getItem('om-local-stats');
        if (localStats) {
          try {
            setStats(JSON.parse(localStats));
          } catch (e) {
            console.error('Failed to parse local stats:', e);
          }
        }
      }
    };

    loadStats();

    // Refresh stats every 60 seconds
    const interval = setInterval(loadStats, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  const totalHours = Math.floor(stats.totalSeconds / 3600);

  return (
    <div className="flex flex-col space-y-2">
      <div className="text-left">
        <p className="text-primary text-sm font-cinzel">{displayName}</p>
        <p className="text-primary-40 text-[9px] uppercase tracking-[0.3em] font-bold mt-1">Your Progress</p>
        <p className="text-white/90 text-lg font-cinzel">{totalHours}h Total</p>
        {leaderboardRank && (
          <p className="text-primary-50 text-xs">Rank #{leaderboardRank}</p>
        )}
      </div>
      <div className="text-left">
        <p className="text-primary-30 text-[9px] uppercase tracking-[0.3em]">Sessions: {stats.sessionsCount}</p>
      </div>
    </div>
  );
};
