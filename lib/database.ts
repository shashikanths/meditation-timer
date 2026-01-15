/**
 * Database abstraction layer
 *
 * In development (localhost), uses the local SQLite database via Express API.
 * In production (Firebase hosting), uses Firestore directly.
 */

import { db as firestore } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  serverTimestamp,
  increment,
  Timestamp,
  addDoc
} from 'firebase/firestore';

// Determine if we're in local development mode
const isLocalDev = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

console.log(`Database mode: ${isLocalDev ? 'LOCAL (SQLite)' : 'PRODUCTION (Firebase)'}`);

// Types
export interface User {
  id: string;
  displayName: string | null;
  totalSeconds: number;
  sessionsCount: number;
  lastSeen?: Date;
  createdAt?: Date;
}

export interface Session {
  id: string;
  oderId: string;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds?: number;
  isActive: boolean;
}

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  totalHours: number;
  rank: number;
  isCurrentUser: boolean;
}

// ============ LOCAL API FUNCTIONS ============

async function localApiCall(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

// ============ USER FUNCTIONS ============

export async function getUser(userId: string): Promise<User | null> {
  if (isLocalDev) {
    try {
      const data = await localApiCall(`/users/${userId}`);
      return data.user || null;
    } catch {
      return null;
    }
  } else {
    const userRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) return null;
    const data = userDoc.data();
    return {
      id: userId,
      displayName: data.displayName || null,
      totalSeconds: data.totalSeconds || 0,
      sessionsCount: data.sessionsCount || 0,
    };
  }
}

export async function createUser(userId: string, displayName: string | null): Promise<void> {
  if (isLocalDev) {
    await localApiCall('/users/init', {
      method: 'POST',
      body: JSON.stringify({ userId, displayName }),
    });
  } else {
    const userRef = doc(firestore, 'users', userId);
    await setDoc(userRef, {
      id: userId,
      displayName: displayName || null,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      totalSeconds: 0,
      sessionsCount: 0,
    });
  }
}

export async function updateUser(
  userId: string,
  updates: {
    displayName?: string;
    totalSecondsIncrement?: number;
    sessionsCountIncrement?: number;
    lastSeen?: boolean;
  }
): Promise<void> {
  if (isLocalDev) {
    await localApiCall(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  } else {
    const userRef = doc(firestore, 'users', userId);
    const firestoreUpdates: Record<string, unknown> = {};

    if (updates.displayName !== undefined) {
      firestoreUpdates.displayName = updates.displayName;
    }
    if (updates.totalSecondsIncrement !== undefined) {
      firestoreUpdates.totalSeconds = increment(updates.totalSecondsIncrement);
    }
    if (updates.sessionsCountIncrement !== undefined) {
      firestoreUpdates.sessionsCount = increment(updates.sessionsCountIncrement);
    }
    if (updates.lastSeen) {
      firestoreUpdates.lastSeen = serverTimestamp();
    }

    await updateDoc(userRef, firestoreUpdates);
  }
}

export async function getUserRank(userId: string, userTotalSeconds: number): Promise<number> {
  if (isLocalDev) {
    try {
      const data = await localApiCall(`/meditation/leaderboard?userId=${userId}`);
      return data.currentUserRank?.rank || 1;
    } catch {
      return 1;
    }
  } else {
    const usersRef = collection(firestore, 'users');
    const higherUsersQuery = query(
      usersRef,
      where('totalSeconds', '>', userTotalSeconds)
    );
    const higherUsersSnapshot = await getDocs(higherUsersQuery);
    return higherUsersSnapshot.size + 1;
  }
}

// ============ LEADERBOARD FUNCTIONS ============

export async function getLeaderboard(userId: string, limitCount: number = 50): Promise<LeaderboardEntry[]> {
  if (isLocalDev) {
    try {
      const data = await localApiCall(`/meditation/leaderboard?userId=${userId}&limit=${limitCount}`);
      return (data.leaderboard || []).map((entry: { rank: number; displayName: string; totalHours: number; isCurrentUser: boolean }, index: number) => ({
        id: `user-${index}`,
        displayName: entry.displayName || 'Anonymous Meditator',
        totalHours: entry.totalHours,
        rank: entry.rank,
        isCurrentUser: entry.isCurrentUser,
      }));
    } catch {
      return [];
    }
  } else {
    const usersRef = collection(firestore, 'users');
    const leaderboardQuery = query(
      usersRef,
      orderBy('totalSeconds', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(leaderboardQuery);

    const entries: LeaderboardEntry[] = [];
    let rank = 1;
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      entries.push({
        id: docSnap.id,
        displayName: data.displayName || 'Anonymous Meditator',
        totalHours: Math.floor((data.totalSeconds || 0) / 3600),
        rank: rank++,
        isCurrentUser: docSnap.id === userId,
      });
    });

    return entries;
  }
}

// ============ SESSION FUNCTIONS ============

export async function createSession(userId: string): Promise<string> {
  if (isLocalDev) {
    const data = await localApiCall('/meditation/start', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return data.sessionId;
  } else {
    const sessionRef = await addDoc(collection(firestore, 'sessions'), {
      userId: userId,
      startedAt: serverTimestamp(),
      isActive: true,
    });
    return sessionRef.id;
  }
}

export async function endSession(
  sessionId: string,
  durationSeconds: number,
  endedAt?: number // timestamp in ms
): Promise<void> {
  if (isLocalDev) {
    await localApiCall(`/meditation/end`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, durationSeconds }),
    });
  } else {
    const sessionRef = doc(firestore, 'sessions', sessionId);
    await updateDoc(sessionRef, {
      endedAt: endedAt ? Timestamp.fromMillis(endedAt) : serverTimestamp(),
      durationSeconds,
      isActive: false,
    });
  }
}

// ============ STATS FUNCTIONS ============

export async function recordHeartbeat(userId: string): Promise<{ activeCount: number; totalCount: number }> {
  if (isLocalDev) {
    const data = await localApiCall('/meditation/stats', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return {
      activeCount: data.activeCount || 0,
      totalCount: data.totalCount || data.totalUniqueUsers || 0,
    };
  } else {
    // For Firebase, we update lastSeen and query for counts
    const userRef = doc(firestore, 'users', userId);
    await updateDoc(userRef, {
      lastSeen: serverTimestamp(),
    });

    // Get active users (active in last 30 seconds) - requires index
    const usersRef = collection(firestore, 'users');
    const thirtySecondsAgo = new Date(Date.now() - 30000);

    try {
      const activeQuery = query(
        usersRef,
        where('lastSeen', '>', Timestamp.fromDate(thirtySecondsAgo))
      );
      const activeSnapshot = await getDocs(activeQuery);

      // Get total users
      const totalSnapshot = await getDocs(usersRef);

      return {
        activeCount: activeSnapshot.size,
        totalCount: totalSnapshot.size,
      };
    } catch {
      // If index doesn't exist, return estimates
      return { activeCount: 1, totalCount: 1 };
    }
  }
}

// ============ STATS (read-only) ============

export async function getUserCounts(): Promise<{ activeCount: number; totalCount: number }> {
  if (isLocalDev) {
    // For local dev, call the stats endpoint to get counts
    // This is a GET-like operation even though we POST
    const data = await localApiCall('/meditation/stats', {
      method: 'POST',
      body: JSON.stringify({ userId: 'count-only' }),
    });
    return {
      activeCount: data.activeCount || 0,
      totalCount: data.totalCount || data.totalUniqueUsers || 0,
    };
  } else {
    // For Firebase, query user counts
    const usersRef = collection(firestore, 'users');
    const thirtySecondsAgo = new Date(Date.now() - 30000);

    try {
      const activeQuery = query(
        usersRef,
        where('lastSeen', '>', Timestamp.fromDate(thirtySecondsAgo))
      );
      const activeSnapshot = await getDocs(activeQuery);
      const totalSnapshot = await getDocs(usersRef);

      return {
        activeCount: activeSnapshot.size,
        totalCount: totalSnapshot.size,
      };
    } catch {
      return { activeCount: 1, totalCount: 1 };
    }
  }
}

// ============ HEARTBEAT WITH SESSION MANAGEMENT ============

/**
 * Send heartbeat, manage session, and get counts - all in one call
 * This is the main function GlobalCounter should use
 */
export async function sendHeartbeat(
  userId: string,
  options: {
    sessionId?: string | null;
    startNewSession?: boolean;
    endSession?: boolean;
    sessionStartTime?: number;
  } = {}
): Promise<{
  activeCount: number;
  totalCount: number;
  sessionId?: string;
}> {
  if (isLocalDev) {
    // Local dev mode - use Express API
    if (options.endSession && options.sessionId && options.sessionStartTime) {
      const durationSeconds = Math.max(0, Math.floor((Date.now() - options.sessionStartTime) / 1000));

      // End the session
      await localApiCall('/meditation/end', {
        method: 'POST',
        body: JSON.stringify({ sessionId: options.sessionId, durationSeconds }),
      });

      // Update user stats
      if (durationSeconds > 0) {
        await localApiCall(`/users/${userId}`, {
          method: 'PUT',
          body: JSON.stringify({
            totalSecondsIncrement: durationSeconds,
            sessionsCountIncrement: 1,
            lastSeen: true
          }),
        });
      }

      // Get counts
      const counts = await getUserCounts();
      return { ...counts };
    }

    // Regular heartbeat
    await localApiCall('/meditation/stats', {
      method: 'POST',
      body: JSON.stringify({ userId, status: 'active' }),
    });

    let sessionId = options.sessionId || undefined;

    // Start new session if requested
    if (options.startNewSession && !options.sessionId) {
      const data = await localApiCall('/meditation/start', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      sessionId = data.sessionId;
    }

    // Get counts
    const counts = await getUserCounts();
    return { ...counts, sessionId };
  } else {
    // Production mode - use Firebase
    const userRef = doc(firestore, 'users', userId);

    // Update lastSeen
    await updateDoc(userRef, {
      lastSeen: serverTimestamp(),
    });

    if (options.endSession && options.sessionId && options.sessionStartTime) {
      const durationSeconds = Math.max(0, Math.floor((Date.now() - options.sessionStartTime) / 1000));

      // End session
      const sessionRef = doc(firestore, 'sessions', options.sessionId);
      await updateDoc(sessionRef, {
        endedAt: serverTimestamp(),
        durationSeconds,
        isActive: false,
      }).catch(() => {});

      // Update user stats
      if (durationSeconds > 0) {
        await updateDoc(userRef, {
          totalSeconds: increment(durationSeconds),
          sessionsCount: increment(1),
        });
      }

      // Get counts
      const counts = await getUserCounts();
      return { ...counts };
    }

    let sessionId = options.sessionId || undefined;

    // Start new session if requested
    if (options.startNewSession && !options.sessionId) {
      const sessionRef = await addDoc(collection(firestore, 'sessions'), {
        userId,
        startedAt: serverTimestamp(),
        isActive: true,
      });
      sessionId = sessionRef.id;
    }

    // Get counts
    const counts = await getUserCounts();
    return { ...counts, sessionId };
  }
}

/**
 * Initialize or get user - used by App.tsx on startup
 */
export async function initializeUser(userId: string, displayName: string | null): Promise<User> {
  if (isLocalDev) {
    const data = await localApiCall('/users/init', {
      method: 'POST',
      body: JSON.stringify({ userId, displayName }),
    });
    return {
      id: data.userId,
      displayName: data.displayName,
      totalSeconds: data.totalSeconds || 0,
      sessionsCount: data.sessionsCount || 0,
    };
  } else {
    const userRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      await setDoc(userRef, {
        id: userId,
        displayName: displayName || null,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
        totalSeconds: 0,
        sessionsCount: 0,
      });
      return {
        id: userId,
        displayName,
        totalSeconds: 0,
        sessionsCount: 0,
      };
    }

    const data = userDoc.data();
    return {
      id: userId,
      displayName: data.displayName || null,
      totalSeconds: data.totalSeconds || 0,
      sessionsCount: data.sessionsCount || 0,
    };
  }
}

/**
 * Get user stats and rank - used by StatsManager
 */
export async function getUserStats(userId: string): Promise<{
  totalSeconds: number;
  sessionsCount: number;
  rank: number;
}> {
  if (isLocalDev) {
    try {
      const userData = await localApiCall(`/users/${userId}`);
      const leaderboardData = await localApiCall(`/meditation/leaderboard?userId=${userId}`);

      return {
        totalSeconds: userData.user?.totalSeconds || 0,
        sessionsCount: userData.user?.sessionsCount || 0,
        rank: leaderboardData.currentUserRank?.rank || 1,
      };
    } catch {
      return { totalSeconds: 0, sessionsCount: 0, rank: 1 };
    }
  } else {
    const userRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return { totalSeconds: 0, sessionsCount: 0, rank: 1 };
    }

    const data = userDoc.data();
    const totalSeconds = data.totalSeconds || 0;
    const sessionsCount = data.sessionsCount || 0;

    // Calculate rank
    const usersRef = collection(firestore, 'users');
    const higherUsersQuery = query(usersRef, where('totalSeconds', '>', totalSeconds));
    const higherUsersSnapshot = await getDocs(higherUsersQuery);
    const rank = higherUsersSnapshot.size + 1;

    return { totalSeconds, sessionsCount, rank };
  }
}

// ============ UTILITY ============

export function isUsingLocalDatabase(): boolean {
  return isLocalDev;
}
