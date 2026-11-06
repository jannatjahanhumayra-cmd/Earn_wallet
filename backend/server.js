require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const { initializeFirebase, getDb } = require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 10000;

// Firebase
initializeFirebase();

app.use(cors());
app.use(express.json());

// =====================================
// BOT CONFIGURATION
// =====================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN;

const ADMIN_ID = String(
  process.env.ADMIN_TELEGRAM_ID || '7302992283'
);

// =====================================
// TELEGRAM INIT DATA VERIFICATION
// =====================================

function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  try {
    const params = new URLSearchParams(initData);

    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) return null;

    const authDate = Number(params.get('auth_date') || 0);
    const now = Math.floor(Date.now() / 1000);

    if (!authDate || now - authDate > 3600 || authDate > now + 60) {
      return null;
    }

    const userData = params.get('user');

    if (!userData) return null;

    return JSON.parse(userData);

  } catch (error) {
    console.error('Telegram verification error:', error.message);
    return null;
  }
}

// =====================================
// USER AUTHENTICATION
// =====================================

async function telegramAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    const initData = authHeader.startsWith('tma ')
      ? authHeader.slice(4)
      : '';

    const user = verifyInitData(initData, BOT_TOKEN);

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        error: 'Invalid User Bot InitData'
      });
    }

    req.telegramUser = {
      id: user.id,
      username: user.username || null,
      firstName: user.first_name || null,
      lastName: user.last_name || null
    };

    next();

  } catch (error) {
    console.error('User authentication error:', error);

    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

// =====================================
// ADMIN AUTHENTICATION
// =====================================

async function adminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    const initData = authHeader.startsWith('tma ')
      ? authHeader.slice(4)
      : '';

    const admin = verifyInitData(initData, ADMIN_BOT_TOKEN);

    if (!admin || !admin.id) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Admin Bot InitData'
      });
    }

    if (String(admin.id) !== ADMIN_ID) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied',
        message: 'You are not authorized to access the Admin Panel.'
      });
    }

    req.adminUser = admin;

    next();

  } catch (error) {
    console.error('Admin authentication error:', error);

    return res.status(401).json({
      success: false,
      error: 'Admin authentication failed'
    });
  }
}

// =====================================
// USER PROFILE
// =====================================

app.get('/api/me', telegramAuth, async (req, res) => {
  try {
    const db = getDb();

    const doc = await db
      .collection('users')
      .doc(String(req.telegramUser.id))
      .get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    const user = doc.data();

    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        error: 'Your account is suspended.'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('User profile error:', error);

    res.status(500).json({
      success: false,
      error: 'Could not load user profile.'
    });
  }
});

// =====================================
// USER REGISTRATION / LOGIN
// =====================================

app.post('/api/auth', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const tgUser = req.telegramUser;

    const userRef = db
      .collection('users')
      .doc(String(tgUser.id));

    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      const newUser = {
        telegramId: String(tgUser.id),
        username: tgUser.username,
        firstName: tgUser.firstName,
        lastName: tgUser.lastName,

        balance: 0,
        totalEarnings: 0,
        todayEarnings: 0,

        referralsCount: 0,
        completedTasks: 0,
        pendingTasks: 0,
        withdrawnAmount: 0,

        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),

        status: 'active'
      };

      await userRef.set(newUser);

      return res.json({
        success: true,
        data: newUser
      });
    }

    await userRef.update({
      lastLogin: new Date().toISOString()
    });

    res.json({
      success: true,
      data: (await userRef.get()).data()
    });

  } catch (error) {
    console.error('Auth error:', error);

    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// =====================================
// WATCH ADS - GET ADS
// =====================================

app.get('/api/ads', telegramAuth, async (req, res) => {
  try {
    const db = getDb();

    const uid = String(req.telegramUser.id);

    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found. Reopen the app.'
      });
    }

    if (userDoc.data().status === 'banned') {
      return res.status(403).json({
        success: false,
        error: 'Your account is suspended.'
      });
    }

    const snapshot = await db
      .collection('advertisements')
      .where('status', '==', 'active')
      .get();

    const ads = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();

      const claimId = `${uid}_${doc.id}`;

      const claim = await db
        .collection('adClaims')
        .doc(claimId)
        .get();

      if (!claim.exists) {
        ads.push({
          id: doc.id,
          title: String(data.title || 'Sponsored link'),
          reward: Number(data.reward || 0),
          duration: Number(data.duration || 0)
        });
      }
    }

    res.json({
      success: true,
      data: ads
    });

  } catch (error) {
    console.error('Load ads error:', error);

    res.status(500).json({
      success: false,
      error: 'Could not load advertisements.'
    });
  }
});

// =====================================
// WATCH ADS - START
// =====================================

app.post('/api/ads/:id/start', telegramAuth, async (req, res) => {
  try {
    const db = getDb();

    const uid = String(req.telegramUser.id);

    const userRef = db.collection('users').doc(uid);
    const adRef = db.collection('advertisements').doc(req.params.id);

    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    if (userDoc.data().status === 'banned') {
      return res.status(403).json({
        success: false,
        error: 'Account suspended.'
      });
    }

    const adDoc = await adRef.get();

    if (!adDoc.exists || adDoc.data().status !== 'active') {
      return res.status(404).json({
        success: false,
        error: 'Advertisement is no longer available.'
      });
    }

    const ad = adDoc.data();

    const duration = Math.max(
      5,
      Math.min(300, Math.floor(Number(ad.duration) || 0))
    );

    const reward = Number(ad.reward);

    if (!Number.isFinite(reward) || reward <= 0 || reward > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ad reward configuration.'
      });
    }

    const claimRef = db
      .collection('adClaims')
      .doc(`${uid}_${adDoc.id}`);

    const sessionRef = db
      .collection('watchSessions')
      .doc();

    await db.runTransaction(async tx => {
      const claim = await tx.get(claimRef);

      if (claim.exists) {
        throw new Error('ALREADY_CLAIMED');
      }

      tx.create(sessionRef, {
        id: sessionRef.id,
        userId: uid,
        adId: adDoc.id,
        startedAt: Date.now(),
        duration,
        reward,
        status: 'started',
        createdAt: new Date().toISOString()
      });
    });

    res.json({
      success: true,
      data: {
        sessionId: sessionRef.id,
        url: String(ad.url),
        duration
      }
    });

  } catch (error) {
    if (error.message === 'ALREADY_CLAIMED') {
      return res.status(409).json({
        success: false,
        error: 'You have already completed this ad.'
      });
    }

    console.error('Start ad error:', error);

    res.status(500).json({
      success: false,
      error: 'Could not start advertisement.'
    });
  }
});

// =====================================
// WATCH ADS - COMPLETE
// =====================================

app.post('/api/ads/complete', telegramAuth, async (req, res) => {
  try {
    const db = getDb();

    const uid = String(req.telegramUser.id);

    const sessionId = String(req.body.sessionId || '');

    if (!sessionId || sessionId.length > 150) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session.'
      });
    }

    const sessionRef = db
      .collection('watchSessions')
      .doc(sessionId);

    const userRef = db
      .collection('users')
      .doc(uid);

    const result = await db.runTransaction(async tx => {
      const sessionDoc = await tx.get(sessionRef);
      const userDoc = await tx.get(userRef);

      if (!sessionDoc.exists) throw new Error('SESSION_NOT_FOUND');
      if (!userDoc.exists) throw new Error('USER_NOT_FOUND');

      const session = sessionDoc.data();
      const user = userDoc.data();

      if (session.userId !== uid) {
        throw new Error('SESSION_FORBIDDEN');
      }

      if (session.status !== 'started') {
        throw new Error('SESSION_USED');
      }

      if (user.status === 'banned') {
        throw new Error('ACCOUNT_SUSPENDED');
      }

      const adRef = db
        .collection('advertisements')
        .doc(session.adId);

      const claimRef = db
        .collection('adClaims')
        .doc(`${uid}_${session.adId}`);

      const adDoc = await tx.get(adRef);
      const claimDoc = await tx.get(claimRef);

      if (!adDoc.exists || adDoc.data().status !== 'active') {
        throw new Error('AD_INACTIVE');
      }

      if (claimDoc.exists) {
        throw new Error('ALREADY_CLAIMED');
      }

      const elapsed = Date.now() - Number(session.startedAt || 0);

      const required = Number(session.duration || 0) * 1000;

      if (elapsed < required) {
        throw new Error('TOO_EARLY');
      }

      const reward = Number(session.reward);

      if (!Number.isFinite(reward) || reward <= 0) {
        throw new Error('INVALID_REWARD');
      }

      const now = new Date();
      const today = now.toISOString().slice(0, 10);

      const todayEarnings =
        user.earningsDate === today
          ? Number(user.todayEarnings || 0) + reward
          : reward;

      tx.update(userRef, {
        balance: Number(user.balance || 0) + reward,
        totalEarnings: Number(user.totalEarnings || 0) + reward,
        todayEarnings,
        earningsDate: today
      });

      tx.create(claimRef, {
        userId: uid,
        adId: session.adId,
        reward,
        completedAt: now.toISOString()
      });

      tx.update(sessionRef, {
        status: 'completed',
        completedAt: now.toISOString()
      });

      return {
        reward,
        balance: Number(user.balance || 0) + reward
      };
    });

    res.json({
      success: true,
      data: result,
      message: `৳${result.reward} added to your balance.`
    });

  } catch (error) {
    const errorMap = {
      SESSION_NOT_FOUND: [404, 'Watch session not found.'],
      USER_NOT_FOUND: [404, 'User not found.'],
      SESSION_FORBIDDEN: [403, 'This session belongs to another user.'],
      SESSION_USED: [409, 'This watch session has already been used.'],
      ACCOUNT_SUSPENDED: [403, 'Your account is suspended.'],
      AD_INACTIVE: [409, 'This advertisement is no longer active.'],
      ALREADY_CLAIMED: [409, 'Reward already claimed for this ad.'],
      TOO_EARLY: [425, 'The required watch time has not finished yet.'],
      INVALID_REWARD: [400, 'Invalid reward configuration.']
    };

    const [status, message] =
      errorMap[error.message] || [500, 'Could not complete the ad.'];

    if (status === 500) {
      console.error('Complete ad error:', error);
    }

    res.status(status).json({
      success: false,
      error: message
    });
  }
});

// =====================================
// ADMIN - DASHBOARD STATS
// =====================================

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const db = getDb();

    const usersSnapshot = await db
      .collection('users')
      .get();

    let totalUsers = 0;
    let activeUsers = 0;
    let totalBalance = 0;

    usersSnapshot.forEach(doc => {
      const data = doc.data();

      totalUsers++;

      if (data.status === 'active') {
        activeUsers++;
      }

      totalBalance += Number(data.balance || 0);
    });

    const withdrawSnapshot = await db
      .collection('withdrawals')
      .where('status', '==', 'pending')
      .get();

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalBalance,
        pendingWithdraws: withdrawSnapshot.size
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================
// ADMIN - USERS
// =====================================

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const snapshot = await getDb()
      .collection('users')
      .get();

    const users = [];

    snapshot.forEach(doc => {
      users.push(doc.data());
    });

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================
// ADMIN - BAN / UNBAN USER
// =====================================

app.post('/api/admin/ban', adminAuth, async (req, res) => {
  try {
    const { telegramId, status } = req.body;

    if (!telegramId || !['active', 'banned'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID or status.'
      });
    }

    await getDb()
      .collection('users')
      .doc(String(telegramId))
      .update({ status });

    res.json({
      success: true,
      message: `User status updated to ${status}`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================
// ADMIN - ADVERTISEMENTS
// =====================================

app.get('/api/admin/ads', adminAuth, async (req, res) => {
  try {
    const snapshot = await getDb()
      .collection('advertisements')
      .get();

    const ads = [];

    snapshot.forEach(doc => {
      ads.push(doc.data());
    });

    res.json({
      success: true,
      data: ads
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ADD AD
app.post('/api/admin/ads', adminAuth, async (req, res) => {
  try {
    const { title, url, reward, duration } = req.body;

    let parsedUrl;

    try {
      parsedUrl = new URL(String(url));
    } catch {
      return res.status(400).json({
        success: false,
        error: 'A valid ad URL is required.'
      });
    }

    const rewardValue = Number(reward);
    const durationValue = Number(duration);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        success: false,
        error: 'Only http/https URLs are allowed.'
      });
    }

    if (!String(title || '').trim() || String(title).length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Ad title is required.'
      });
    }

    if (
      !Number.isFinite(rewardValue) ||
      rewardValue <= 0 ||
      rewardValue > 1000
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reward.'
      });
    }

    if (
      !Number.isInteger(durationValue) ||
      durationValue < 5 ||
      durationValue > 300
    ) {
      return res.status(400).json({
        success: false,
        error: 'Duration must be 5-300 seconds.'
      });
    }

    const adRef = getDb()
      .collection('advertisements')
      .doc();

    await adRef.set({
      id: adRef.id,
      title: String(title).trim(),
      url: parsedUrl.toString(),
      reward: rewardValue,
      duration: durationValue,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Ad created successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE AD
app.delete('/api/admin/ads/:id', adminAuth, async (req, res) => {
  try {
    await getDb()
      .collection('advertisements')
      .doc(req.params.id)
      .delete();

    res.json({
      success: true,
      message: 'Ad deleted'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================
// ADMIN - TASKS
// =====================================

app.get('/api/admin/tasks', adminAuth, async (req, res) => {
  try {
    const snapshot = await getDb()
      .collection('tasks')
      .get();

    const tasks = [];

    snapshot.forEach(doc => {
      tasks.push(doc.data());
    });

    res.json({
      success: true,
      data: tasks
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ADD TASK
app.post('/api/admin/tasks', adminAuth, async (req, res) => {
  try {
    const { title, url, reward, requiresProof } = req.body;

    const taskRef = getDb()
      .collection('tasks')
      .doc();

    await taskRef.set({
      id: taskRef.id,
      title,
      url,
      reward: Number(reward),
      requiresProof,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Task created successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE TASK
app.delete('/api/admin/tasks/:id', adminAuth, async (req, res) => {
  try {
    await getDb()
      .collection('tasks')
      .doc(req.params.id)
      .delete();

    res.json({
      success: true,
      message: 'Task deleted'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================
// ADMIN - WITHDRAWALS
// =====================================

app.get('/api/admin/withdrawals', adminAuth, async (req, res) => {
  try {
    const snapshot = await getDb()
      .collection('withdrawals')
      .orderBy('createdAt', 'desc')
      .get();

    const withdrawals = [];

    snapshot.forEach(doc => {
      withdrawals.push(doc.data());
    });

    res.json({
      success: true,
      data: withdrawals
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// UPDATE WITHDRAWAL
app.post('/api/admin/withdrawals/:id', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid withdrawal status.'
      });
    }

    await getDb()
      .collection('withdrawals')
      .doc(req.params.id)
      .update({
        status,
        updatedAt: new Date().toISOString()
      });

    res.json({
      success: true,
      message: `Withdrawal ${status}`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================
// WEBSITE ROUTES
// =====================================

app.get('/admin', (req, res) => {
  res.sendFile(
    path.join(__dirname, 'public', 'admin.html')
  );
});

app.use(express.static(
  path.join(__dirname, 'public')
));

app.get('*', (req, res) => {
  res.sendFile(
    path.join(__dirname, 'public', 'index.html')
  );
});

// =====================================
// START SERVER
// =====================================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
