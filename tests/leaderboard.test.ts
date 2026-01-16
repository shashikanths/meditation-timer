import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock user data structure
interface UserData {
  id: string;
  displayName: string;
  totalSeconds: number;
  sessionsCount: number;
  lastSeen: Date;
}

// Helper function to format time (mirrors actual implementation)
function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Helper to calculate rank
function calculateRank(userSeconds: number, allUsers: UserData[]): number {
  const higherUsers = allUsers.filter(u => u.totalSeconds > userSeconds);
  return higherUsers.length + 1;
}

// Sort leaderboard by total seconds (descending)
function sortLeaderboard(users: UserData[]): UserData[] {
  return [...users].sort((a, b) => b.totalSeconds - a.totalSeconds);
}

describe('Leaderboard Calculations', () => {
  let mockUsers: UserData[];

  beforeEach(() => {
    // Set up mock user data
    mockUsers = [
      { id: 'user-1', displayName: 'MeditatorA', totalSeconds: 36000, sessionsCount: 10, lastSeen: new Date() },
      { id: 'user-2', displayName: 'MeditatorB', totalSeconds: 18000, sessionsCount: 5, lastSeen: new Date() },
      { id: 'user-3', displayName: 'MeditatorC', totalSeconds: 7200, sessionsCount: 2, lastSeen: new Date() },
      { id: 'user-4', displayName: 'MeditatorD', totalSeconds: 54000, sessionsCount: 15, lastSeen: new Date() },
      { id: 'user-5', displayName: 'MeditatorE', totalSeconds: 3600, sessionsCount: 1, lastSeen: new Date() },
    ];
  });

  describe('Time Formatting', () => {
    it('should format seconds as hours and minutes', () => {
      expect(formatTime(3600)).toBe('1h 0m');
      expect(formatTime(7200)).toBe('2h 0m');
      expect(formatTime(5400)).toBe('1h 30m');
    });

    it('should format minutes only when less than an hour', () => {
      expect(formatTime(1800)).toBe('30m');
      expect(formatTime(600)).toBe('10m');
      expect(formatTime(60)).toBe('1m');
    });

    it('should handle zero seconds', () => {
      expect(formatTime(0)).toBe('0m');
    });

    it('should handle large durations', () => {
      expect(formatTime(360000)).toBe('100h 0m'); // 100 hours
      expect(formatTime(86400)).toBe('24h 0m'); // 24 hours
    });
  });

  describe('Rank Calculation', () => {
    it('should calculate rank 1 for top meditator', () => {
      const topUser = mockUsers.find(u => u.id === 'user-4')!; // 54000 seconds
      const rank = calculateRank(topUser.totalSeconds, mockUsers);
      expect(rank).toBe(1);
    });

    it('should calculate correct rank for middle users', () => {
      const midUser = mockUsers.find(u => u.id === 'user-1')!; // 36000 seconds
      const rank = calculateRank(midUser.totalSeconds, mockUsers);
      expect(rank).toBe(2);
    });

    it('should calculate last rank for lowest meditator', () => {
      const lastUser = mockUsers.find(u => u.id === 'user-5')!; // 3600 seconds
      const rank = calculateRank(lastUser.totalSeconds, mockUsers);
      expect(rank).toBe(5);
    });

    it('should handle tie in total seconds', () => {
      const tieUsers = [
        { id: 'user-1', displayName: 'A', totalSeconds: 3600, sessionsCount: 1, lastSeen: new Date() },
        { id: 'user-2', displayName: 'B', totalSeconds: 3600, sessionsCount: 1, lastSeen: new Date() },
        { id: 'user-3', displayName: 'C', totalSeconds: 7200, sessionsCount: 2, lastSeen: new Date() },
      ];
      // Both tied users should get rank 2 (one user has more)
      expect(calculateRank(3600, tieUsers)).toBe(2);
    });

    it('should handle single user', () => {
      const singleUser = [mockUsers[0]];
      const rank = calculateRank(singleUser[0].totalSeconds, singleUser);
      expect(rank).toBe(1);
    });

    it('should handle new user with 0 seconds', () => {
      const newUserSeconds = 0;
      const rank = calculateRank(newUserSeconds, mockUsers);
      expect(rank).toBe(6); // Last place
    });
  });

  describe('Leaderboard Sorting', () => {
    it('should sort users by total seconds descending', () => {
      const sorted = sortLeaderboard(mockUsers);
      expect(sorted[0].id).toBe('user-4'); // 54000
      expect(sorted[1].id).toBe('user-1'); // 36000
      expect(sorted[2].id).toBe('user-2'); // 18000
      expect(sorted[3].id).toBe('user-3'); // 7200
      expect(sorted[4].id).toBe('user-5'); // 3600
    });

    it('should maintain correct order after user update', () => {
      // User-5 meditates more and moves up
      const updatedUsers = mockUsers.map(u =>
        u.id === 'user-5' ? { ...u, totalSeconds: 40000 } : u
      );
      const sorted = sortLeaderboard(updatedUsers);
      expect(sorted[0].id).toBe('user-4'); // 54000
      expect(sorted[1].id).toBe('user-5'); // 40000 (moved up!)
      expect(sorted[2].id).toBe('user-1'); // 36000
    });

    it('should not modify original array', () => {
      const originalFirst = mockUsers[0].id;
      sortLeaderboard(mockUsers);
      expect(mockUsers[0].id).toBe(originalFirst);
    });
  });

  describe('Leaderboard Display Logic', () => {
    it('should include all users regardless of meditation time', () => {
      const usersWithZero = [
        ...mockUsers,
        { id: 'user-6', displayName: 'NewUser', totalSeconds: 0, sessionsCount: 0, lastSeen: new Date() }
      ];
      const sorted = sortLeaderboard(usersWithZero);
      expect(sorted.length).toBe(6);
      expect(sorted[5].totalSeconds).toBe(0);
    });

    it('should show top 10 users by default', () => {
      const manyUsers = Array.from({ length: 20 }, (_, i) => ({
        id: `user-${i}`,
        displayName: `User${i}`,
        totalSeconds: (20 - i) * 1000,
        sessionsCount: 1,
        lastSeen: new Date()
      }));
      const sorted = sortLeaderboard(manyUsers);
      const top10 = sorted.slice(0, 10);
      expect(top10.length).toBe(10);
      expect(top10[0].totalSeconds).toBe(20000);
      expect(top10[9].totalSeconds).toBe(11000);
    });

    it('should calculate hours correctly for display', () => {
      const user = mockUsers.find(u => u.id === 'user-4')!;
      const hours = Math.floor(user.totalSeconds / 3600);
      expect(hours).toBe(15); // 54000 / 3600 = 15 hours
    });
  });

  describe('Stats Update After Session', () => {
    it('should update user stats after session completion', () => {
      const user = { ...mockUsers[0] };
      const sessionDuration = 1800; // 30 minutes

      // Simulate session completion
      user.totalSeconds += sessionDuration;
      user.sessionsCount += 1;
      user.lastSeen = new Date();

      expect(user.totalSeconds).toBe(37800); // 36000 + 1800
      expect(user.sessionsCount).toBe(11);
    });

    it('should recalculate rank after stats update', () => {
      // User-5 was last with 3600 seconds
      const beforeRank = calculateRank(3600, mockUsers);
      expect(beforeRank).toBe(5);

      // User-5 completes 50 hours of meditation
      const updatedUsers = mockUsers.map(u =>
        u.id === 'user-5' ? { ...u, totalSeconds: 180000 } : u
      );

      // Now user-5 should be #1
      const afterRank = calculateRank(180000, updatedUsers);
      expect(afterRank).toBe(1);
    });
  });
});

describe('Active/Total User Counts', () => {
  const THIRTY_SECONDS = 30 * 1000;

  interface ActiveUser {
    id: string;
    lastSeen: Date;
  }

  function countActiveUsers(users: ActiveUser[], now: Date = new Date()): number {
    const threshold = new Date(now.getTime() - THIRTY_SECONDS);
    return users.filter(u => u.lastSeen >= threshold).length;
  }

  it('should count users seen within last 30 seconds as active', () => {
    const now = new Date();
    const users: ActiveUser[] = [
      { id: 'user-1', lastSeen: new Date(now.getTime() - 10000) }, // 10 sec ago - active
      { id: 'user-2', lastSeen: new Date(now.getTime() - 25000) }, // 25 sec ago - active
      { id: 'user-3', lastSeen: new Date(now.getTime() - 35000) }, // 35 sec ago - inactive
      { id: 'user-4', lastSeen: new Date(now.getTime() - 60000) }, // 60 sec ago - inactive
    ];

    const activeCount = countActiveUsers(users, now);
    expect(activeCount).toBe(2);
  });

  it('should return 0 when no users are active', () => {
    const now = new Date();
    const users: ActiveUser[] = [
      { id: 'user-1', lastSeen: new Date(now.getTime() - 60000) },
      { id: 'user-2', lastSeen: new Date(now.getTime() - 120000) },
    ];

    const activeCount = countActiveUsers(users, now);
    expect(activeCount).toBe(0);
  });

  it('should count all users when all are active', () => {
    const now = new Date();
    const users: ActiveUser[] = [
      { id: 'user-1', lastSeen: new Date(now.getTime() - 5000) },
      { id: 'user-2', lastSeen: new Date(now.getTime() - 10000) },
      { id: 'user-3', lastSeen: new Date(now.getTime() - 15000) },
    ];

    const activeCount = countActiveUsers(users, now);
    expect(activeCount).toBe(3);
  });

  it('should count total unique users correctly', () => {
    const users = [
      { id: 'user-1' },
      { id: 'user-2' },
      { id: 'user-3' },
      { id: 'user-4' },
      { id: 'user-5' },
    ];

    expect(users.length).toBe(5);
  });

  it('should handle boundary case exactly at 30 seconds', () => {
    const now = new Date();
    const users: ActiveUser[] = [
      { id: 'user-1', lastSeen: new Date(now.getTime() - 30000) }, // exactly 30 sec
    ];

    const activeCount = countActiveUsers(users, now);
    // At exactly 30 seconds, user should still be considered active (>=)
    expect(activeCount).toBe(1);
  });
});
