const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Helper: Generate UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// ===== USER MANAGEMENT =====

// POST /api/users/init - Initialize or retrieve user
app.post('/api/users/init', async (req, res) => {
  try {
    let { userId, displayName } = req.body;

    // Generate UUID if not provided
    if (!userId) {
      userId = generateUUID();
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Create new user
      await userRef.set({
        id: userId,
        displayName: displayName || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        totalSeconds: 0,
        sessionsCount: 0
      });
    } else if (displayName && userDoc.data().displayName !== displayName) {
      // Update display name if changed
      await userRef.update({ displayName });
    }

    // Get updated user data
    const updatedUser = await userRef.get();
    const userData = updatedUser.data();

    res.json({
      userId: userData.id,
      displayName: userData.displayName,
      totalSeconds: userData.totalSeconds,
      sessionsCount: userData.sessionsCount,
      preferences: {
        selectedAudioId: userData.selectedAudioId || null,
        selectedImageId: userData.selectedImageId || null,
        themeColors: userData.themeColors || null
      }
    });
  } catch (error) {
    console.error('Error in /api/users/init:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== MEDITATION STATS =====

// POST /api/meditation/stats - Heartbeat endpoint
app.post('/api/meditation/stats', async (req, res) => {
  try {
    const { userId, status } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const userRef = db.collection('users').doc(userId);

    // Update user's last_seen
    await userRef.update({
      lastSeen: admin.firestore.FieldValue.serverTimestamp()
    });

    if (status === 'active') {
      // Check if user has an active session
      const activeSessions = await db.collection('sessions')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (activeSessions.empty) {
        // Create new active session
        await db.collection('sessions').add({
          userId,
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
          isActive: true
        });
      }
    } else if (status === 'inactive') {
      // Close active session and update user stats
      const activeSessions = await db.collection('sessions')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!activeSessions.empty) {
        const sessionDoc = activeSessions.docs[0];
        const sessionData = sessionDoc.data();

        const startTime = sessionData.startedAt.toMillis();
        const endTime = Date.now();
        const durationSeconds = Math.floor((endTime - startTime) / 1000);

        // Update session
        await sessionDoc.ref.update({
          endedAt: admin.firestore.FieldValue.serverTimestamp(),
          durationSeconds,
          isActive: false
        });

        // Update user stats
        await userRef.update({
          totalSeconds: admin.firestore.FieldValue.increment(durationSeconds),
          sessionsCount: admin.firestore.FieldValue.increment(1)
        });
      }
    }

    // Calculate active count (users with last_seen < 30 seconds ago)
    const thirtySecondsAgo = new Date(Date.now() - 30000);
    const activeUsersSnapshot = await db.collection('users')
      .where('lastSeen', '>=', admin.firestore.Timestamp.fromDate(thirtySecondsAgo))
      .get();

    const activeCount = activeUsersSnapshot.size;

    // Calculate total unique users
    const allUsersSnapshot = await db.collection('users').count().get();
    const totalUniqueUsers = allUsersSnapshot.data().count;

    res.json({ activeCount, totalUniqueUsers, totalCount: totalUniqueUsers });
  } catch (error) {
    console.error('Error in /api/meditation/stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/meditation/leaderboard - Get top users
app.get('/api/meditation/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const currentUserId = req.query.userId;

    // Get top users by total_seconds
    const topUsersSnapshot = await db.collection('users')
      .where('totalSeconds', '>', 0)
      .orderBy('totalSeconds', 'desc')
      .limit(limit)
      .get();

    let rank = 0;
    const leaderboard = topUsersSnapshot.docs.map(doc => {
      const data = doc.data();
      rank++;
      return {
        rank,
        displayName: data.displayName || 'Anonymous Meditator',
        totalHours: parseFloat((data.totalSeconds / 3600).toFixed(2)),
        isCurrentUser: currentUserId ? doc.id === currentUserId : false
      };
    });

    // Get current user's rank if provided
    if (currentUserId) {
      const userDoc = await db.collection('users').doc(currentUserId).get();

      if (userDoc.exists) {
        const userData = userDoc.data();

        // Count users with more seconds
        const higherUsersSnapshot = await db.collection('users')
          .where('totalSeconds', '>', userData.totalSeconds)
          .get();

        const userRank = higherUsersSnapshot.size + 1;

        res.json({
          leaderboard,
          currentUserRank: {
            rank: userRank,
            displayName: userData.displayName || 'Anonymous Meditator',
            totalHours: parseFloat((userData.totalSeconds / 3600).toFixed(2))
          }
        });
        return;
      }
    }

    res.json({ leaderboard });
  } catch (error) {
    console.error('Error in /api/meditation/leaderboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== USER PREFERENCES =====

// GET /api/preferences/:userId - Get user preferences
app.get('/api/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();

    res.json({
      selectedAudioId: userData.selectedAudioId || null,
      selectedImageId: userData.selectedImageId || null,
      themeColors: userData.themeColors || null
    });
  } catch (error) {
    console.error('Error in /api/preferences/:userId:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/preferences/:userId - Update user preferences
app.put('/api/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { selectedAudioId, selectedImageId, themeColors } = req.body;

    const updates = {};

    if (selectedAudioId !== undefined) {
      updates.selectedAudioId = selectedAudioId;
    }

    if (selectedImageId !== undefined) {
      updates.selectedImageId = selectedImageId;
    }

    if (themeColors !== undefined) {
      updates.themeColors = themeColors;
    }

    if (Object.keys(updates).length > 0) {
      await db.collection('users').doc(userId).update(updates);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/preferences/:userId:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app);
