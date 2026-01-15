import React, { useState, useEffect } from 'react';
import { StorageManager } from '../utils/storage';
import { getLeaderboard, getUserStats, type LeaderboardEntry } from '../lib/database';

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
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  useEffect(() => {
    // Get display name from storage
    setDisplayName(StorageManager.getDisplayName());
  }, []);

  useEffect(() => {
    if (!userId) return;

    const loadStats = async () => {
      try {
        // Fetch user stats from database (local SQLite or Firebase based on environment)
        const userStats = await getUserStats(userId);

        setStats({
          totalSeconds: userStats.totalSeconds,
          lastSession: null,
          sessionsCount: userStats.sessionsCount
        });
        setLeaderboardRank(userStats.rank);

        // Update localStorage
        StorageManager.updateLocalStats({
          totalSeconds: userStats.totalSeconds,
          lastSession: null,
          sessionsCount: userStats.sessionsCount
        });
      } catch (error) {
        console.warn('Failed to load stats:', error);
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

  // Fetch leaderboard data (uses local SQLite in dev, Firebase in production)
  const fetchLeaderboard = async () => {
    if (leaderboardLoading) return;

    setLeaderboardLoading(true);
    setShowLeaderboard(true);

    try {
      const entries = await getLeaderboard(userId, 50);
      setLeaderboardData(entries);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  return (
    <div className="flex flex-col space-y-2">
      <div className="text-left">
        <p className="text-primary text-sm font-cinzel">{displayName}</p>
        <p className="text-primary-40 text-[9px] uppercase tracking-[0.3em] font-bold mt-1">Your Progress</p>
        <p className="text-white/90 text-lg font-cinzel">{totalHours}h Total</p>
        {leaderboardRank && (
          <button
            className="mt-2 px-3 py-1.5 text-xs border border-primary-30 rounded-md bg-primary-5 hover:bg-primary-10 hover:border-primary text-primary-50 hover:text-primary transition-all flex items-center gap-2"
            onClick={fetchLeaderboard}
            title="Click to view leaderboard"
          >
            <span>Rank #{leaderboardRank}</span>
            <span className="text-[10px]">View Leaderboard</span>
          </button>
        )}
      </div>
      <div className="text-left">
        <p className="text-primary-30 text-[9px] uppercase tracking-[0.3em]">Sessions: {stats.sessionsCount}</p>
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowLeaderboard(false)}
        >
          <div
            className="bg-black/95 border border-primary-30 rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-cinzel text-white/90">Leaderboard</h2>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="text-primary-50 hover:text-primary text-2xl transition-colors"
              >
                &times;
              </button>
            </div>

            {/* Leaderboard List */}
            <div className="overflow-y-auto flex-1">
              {leaderboardLoading ? (
                <div className="text-center py-8 text-primary-50">Loading...</div>
              ) : leaderboardData.length === 0 ? (
                <div className="text-center py-8 text-primary-50">No data yet</div>
              ) : (
                <div className="space-y-2">
                  {leaderboardData.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-3 rounded border transition-all ${
                        entry.isCurrentUser
                          ? 'border-primary bg-primary-10'
                          : 'border-primary-20 bg-primary-5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className={`text-lg font-bold ${
                            entry.rank === 1 ? 'text-yellow-400' :
                            entry.rank === 2 ? 'text-gray-300' :
                            entry.rank === 3 ? 'text-amber-600' :
                            'text-primary-40'
                          }`}>
                            #{entry.rank}
                          </span>
                          <span className={`font-medium ${entry.isCurrentUser ? 'text-primary' : 'text-white/90'}`}>
                            {entry.displayName}
                            {entry.isCurrentUser && <span className="text-primary-50 text-xs ml-2">(you)</span>}
                          </span>
                        </div>
                        <span className="text-primary-50 text-sm">{entry.totalHours}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-primary-20 text-center">
              <p className="text-primary-30 text-xs">Top 50 meditators by total hours</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
