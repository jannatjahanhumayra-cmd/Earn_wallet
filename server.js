
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');

let firebaseDb = null;
let firebaseAuth = null;

function initializeFirebase() {
  if (admin.apps.length > 0) {
    const existingApp = admin.app();
    firebaseDb = existingApp.firestore();
    firebaseAuth = existingApp.auth();
    return existingApp;
  }

  const credentialsJson = process.env.FIREBASE_CREDENTIALS;

  if (!credentialsJson) {
    console.warn('FIREBASE_CREDENTIALS missing. Firebase initialization skipped.');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(credentialsJson);
    const appInstance = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    firebaseDb = admin.firestore();
    firebaseAuth = admin.auth();

    console.log('Firebase Admin initialized successfully.');
    return appInstance;
  } catch (error) {
    console.error('Firebase initialization error:', error.message);
    return null;
  }
}

function getDb() {
  if (!firebaseDb) {
    throw new Error('Firebase not initialized. Check FIREBASE_CREDENTIALS in Render Environment.');
  }
  return firebaseDb;
}

function getAuth() {
  if (!firebaseAuth) {
    throw new Error('Firebase not initialized. Check FIREBASE_CREDENTIALS in Render Environment.');
  }
  return firebaseAuth;
}

const app = express();
const PORT = process.env.PORT || 10000;
const PUBLIC_DIR = path.join(__dirname, 'backend', 'public');

initializeFirebase();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_TELEGRAM_ID || '');
const MIN_WITHDRAW = Number(process.env.MIN_WITHDRAW || 100);
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS || 0);

const REQUIRED_REFERRAL_ADS = 20;
const REQUIRED_SUCCESSFUL_REFERRALS = 10;
const TELEGRAM_BOT_USERNAME = String(
  process.env.TELEGRAM_BOT_USERNAME || 'EarnWalle_tBot'
).replace(/^@/, '');

const PUBLIC_APP_URL = String(
  process.env.RENDER_EXTERNAL_URL || 'https://earn-wallet-z0ea.onrender.com'
).replace(/\/$/, '');

const WEBHOOK_SECRET = BOT_TOKEN
  ? crypto.createHmac('sha256', BOT_TOKEN)
      .update('EarnWalletBotWebhook2026')
      .digest('hex')
      .slice(0, 48)
  : '';

const WEBHOOK_PATH = WEBHOOK_SECRET
  ? `/telegram/webhook/${WEBHOOK_SECRET}`
  : '';

function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) return null;

    params.delete('hash');

    const dataCheckString = [...params.entries()]
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

    const a = Buffer.from(calculatedHash, 'hex');
    const b = Buffer.from(hash, 'hex');

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const authDate = Number(params.get('auth_date') || 0);
    const now = Math.floor(Date.now() / 1000);

    if (!authDate || now - authDate > 3600 || authDate > now + 60) {
      return null;
    }

    const user = params.get('user');
    if (!user) return null;

    const parsedUser = JSON.parse(user);
    parsedUser._startParam = params.get('start_param') || '';

    return parsedUser;
  } catch (e) {
    console.error('Telegram initData verification:', e.message);
    return null;
  }
}

function readInitData(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('tma ') ? h.slice(4) : '';
}

async function telegramAuth(req, res, next) {
  const user = verifyInitData(readInitData(req), BOT_TOKEN);

  if (!user?.id) {
    return res.status(401).json({
      success: false,
      error: 'Telegram authentication failed. Open this app from the bot.'
    });
  }

  req.telegramUser = {
    id: String(user.id),
    username: user.username || null,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    startParam: user._startParam || ''
  };

  next();
}

async function adminAuth(req, res, next) {
  const adminUser = verifyInitData(readInitData(req), ADMIN_BOT_TOKEN);

  if (!adminUser?.id) {
    return res.status(401).json({
      success: false,
      error: 'Invalid Admin Bot InitData'
    });
  }

  if (!ADMIN_ID || String(adminUser.id) !== ADMIN_ID) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  req.adminUser = adminUser;
  next();
}

function userRef(db, uid) {
  return db.collection('users').doc(String(uid));
}

function sendError(res, error, fallback = 'Server error') {
  console.error(error);
  res.status(500).json({
    success: false,
    error: fallback
  });
}

async function requireActiveUser(db, uid) {
  const snap = await userRef(db, uid).get();

  if (!snap.exists) throw new Error('USER_NOT_FOUND');
  if (snap.data().status === 'banned') throw new Error('ACCOUNT_SUSPENDED');

  return snap;
}

function todayKey() {
  const d = new Date();

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka'
  }).format(d);
}

function parseReferralPayload(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(?:ref_)?(\d{1,20})$/);
  return match ? match[1] : null;
}

function newUserRecord(tg, now) {
  return {
    telegramId: String(tg.id),
    username: tg.username || null,
    firstName: tg.firstName || null,
    lastName: tg.lastName || null,
    balance: 0,
    totalEarnings: 0,
    todayEarnings: 0,
    earningsDate: todayKey(),
    referralsCount: 0,
    completedTasks: 0,
    pendingTasks: 0,
    withdrawnAmount: 0,
    status: 'active',
    createdAt: now,
    lastLogin: now
  };
}

// Create a new Telegram user only once.
// Referral attribution is permanent and cannot be changed later.
async function registerTelegramUser(tg, referralPayload = '') {
  const db = getDb();
  const uid = String(tg.id);
  const uRef = userRef(db, uid);
  const inviterId = parseReferralPayload(referralPayload);

  return db.runTransaction(async tx => {
    const existing = await tx.get(uRef);
    const now = new Date().toISOString();

    if (existing.exists) {
      const old = existing.data();

      if (old.status === 'banned') {
        throw new Error('ACCOUNT_SUSPENDED');
      }

      tx.update(uRef, {
        username: tg.username || null,
        firstName: tg.firstName || null,
        lastName: tg.lastName || null,
        lastLogin: now
      });

      return {
        ...old,
        username: tg.username || null,
        firstName: tg.firstName || null,
        lastName: tg.lastName || null,
        lastLogin: now
      };
    }

    let inviterSnap = null;
    let referralRef = null;

    if (inviterId && inviterId !== uid) {
      inviterSnap = await tx.get(userRef(db, inviterId));
      referralRef = db.collection('referrals').doc(uid);
    }

    const fresh = newUserRecord(tg, now);

    if (inviterSnap?.exists && inviterSnap.data().status !== 'banned' && referralRef) {
      fresh.referredBy = inviterId;

      const oldReferral = await tx.get(referralRef);
      if (oldReferral.exists) {
        fresh.referredBy = null;
      }
    }

    tx.create(uRef, fresh);

    if (
      fresh.referredBy &&
      inviterSnap?.exists &&
      inviterSnap.data().status !== 'banned' &&
      referralRef
    ) {
      tx.create(referralRef, {
        referrerId: inviterId,
        referredUserId: uid,
        firstName: tg.firstName || null,
        lastName: tg.lastName || null,
        username: tg.username || null,
        completedAds: 0,
        requiredAds: REQUIRED_REFERRAL_ADS,
        status: 'in_progress',
        createdAt: now,
        updatedAt: now
      });

      tx.update(userRef(db, inviterId), {
        totalReferrals: admin.firestore.FieldValue.increment(1)
      });
    }

    return fresh;
  });
}

async function telegramApi(method, payload = {}) {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing.');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram API ${method} failed.`);
  }

  return result.result;
}

// Automatically connect Telegram /start to this Render server.
async function configureTelegramWebhook() {
  if (!BOT_TOKEN || !WEBHOOK_PATH) {
    console.warn('Telegram webhook not configured: TELEGRAM_BOT_TOKEN is missing.');
    return;
  }

  const webhookUrl = `${PUBLIC_APP_URL}${WEBHOOK_PATH}`;

  try {
    const botInfo = await telegramApi('getMe');

    if (
      String(botInfo.username || '').toLowerCase() !==
      TELEGRAM_BOT_USERNAME.toLowerCase()
    ) {
      console.error(
        `Bot token username mismatch. Expected @${TELEGRAM_BOT_USERNAME}, received @${botInfo.username || 'unknown'}. Webhook was not changed.`
      );
      return;
    }

    await telegramApi('setWebhook', {
      url: webhookUrl,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ['message'],
      drop_pending_updates: false
    });

    console.log('Telegram /start webhook configured.');
  } catch (error) {
    console.error('Telegram webhook setup failed:', error.message);
  }
}

// HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'running'
  });
});

// TELEGRAM BOT /START WEBHOOK
if (WEBHOOK_PATH) {
  app.post(WEBHOOK_PATH, async (req, res) => {
    if (req.get('X-Telegram-Bot-Api-Secret-Token') !== WEBHOOK_SECRET) {
      return res.sendStatus(401);
    }

    // Telegram expects a fast 200 response.
    res.sendStatus(200);

    try {
      const message = req.body?.message;
      const text = String(message?.text || '');
      const from = message?.from;
      const chatId = message?.chat?.id;

      if (
        !from?.id ||
        from.is_bot ||
        !chatId ||
        !/^\/start(?:@\w+)?(?:\s|$)/i.test(text)
      ) {
        return;
      }

      const payload = text.trim().split(/\s+/, 2)[1] || '';

      await registerTelegramUser({
        id: String(from.id),
        username: from.username || null,
        firstName: from.first_name || null,
        lastName: from.last_name || null
      }, payload);

      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: `Welcome to EarnWallet, ${from.first_name || 'friend'}! Your account is ready. Tap below to open the Mini App.`,
        reply_markup: {
          inline_keyboard: [[
            {
              text: 'Open EarnWallet',
              web_app: { url: PUBLIC_APP_URL }
            }
          ]]
        }
      });
    } catch (error) {
      console.error('Telegram /start handling failed:', error.message);
    }
  });
}

// USER AUTH
app.post('/api/auth', telegramAuth, async (req, res) => {
  try {
    const result = await registerTelegramUser(
      req.telegramUser,
      req.telegramUser.startParam
    );

    res.json({
      success: true,
      data: result
    });
  } catch (e) {
    if (e.message === 'ACCOUNT_SUSPENDED') {
      return res.status(403).json({
        success: false,
        error: 'Your account is suspended.'
      });
    }

    sendError(res, e, 'Could not sign in.');
  }
});

// USER PROFILE
app.get('/api/me', telegramAuth, async (req, res) => {
  try {
    const snap = await requireActiveUser(
      getDb(),
      req.telegramUser.id
    );

    res.json({
      success: true,
      data: snap.data()
    });
  } catch (e) {
    if (e.message === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'User not found. Reopen the app.'
      });
    }

    if (e.message === 'ACCOUNT_SUSPENDED') {
      return res.status(403).json({
        success: false,
        error: 'Your account is suspended.'
      });
    }

    sendError(res, e, 'Could not load profile.');
  }
});

// ADS
app.get('/api/ads', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;

    await requireActiveUser(db, uid);

    const snap = await db.collection('advertisements')
      .where('status', '==', 'active')
      .get();

    const claims = await db.collection('adClaims')
      .where('userId', '==', uid)
      .get();

    const claimed = new Set(
      claims.docs.map(d => d.data().adId)
    );

    const ads = snap.docs
      .filter(d => !claimed.has(d.id))
      .map(d => {
        const x = d.data();

        return {
          id: d.id,
          title: String(x.title || 'Sponsored task'),
          reward: Number(x.reward || 0),
          duration: Math.max(
            20,
            Math.min(300, Math.floor(Number(x.duration) || 20))
          )
        };
      });

    res.json({
      success: true,
      data: ads
    });
  } catch (e) {
    sendError(res, e, 'Could not load advertisements.');
  }
});

// START AD
app.post('/api/ads/:id/start', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;

    await requireActiveUser(db, uid);

    const adRef = db.collection('advertisements').doc(req.params.id);
    const adSnap = await adRef.get();

    if (!adSnap.exists || adSnap.data().status !== 'active') {
      return res.status(404).json({
        success: false,
        error: 'Ad unavailable.'
      });
    }

    const ad = adSnap.data();

    const duration = Math.max(
      20,
      Math.min(300, Math.floor(Number(ad.duration) || 20))
    );

    const reward = Number(ad.reward);

    if (!Number.isFinite(reward) || reward <= 0 || reward > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reward configuration.'
      });
    }

    const claimRef = db.collection('adClaims')
      .doc(`${uid}_${adSnap.id}`);

    const sessionRef = db.collection('watchSessions').doc();

    await db.runTransaction(async tx => {
      const claim = await tx.get(claimRef);

      if (claim.exists) throw new Error('ALREADY_CLAIMED');

      tx.create(sessionRef, {
        userId: uid,
        adId: adSnap.id,
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
        url: String(ad.url || ''),
        duration
      }
    });
  } catch (e) {
    if (e.message === 'ALREADY_CLAIMED') {
      return res.status(409).json({
        success: false,
        error: 'Already completed this ad.'
      });
    }

    sendError(res, e, 'Could not start ad.');
  }
});

// COMPLETE AD
app.post('/api/ads/complete', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;
    const sessionId = String(req.body.sessionId || '');

    if (!sessionId || sessionId.length > 150) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session.'
      });
    }

    const sessionRef = db.collection('watchSessions').doc(sessionId);
    const uRef = userRef(db, uid);

    const result = await db.runTransaction(async tx => {
      const [ss, us] = await Promise.all([
        tx.get(sessionRef),
        tx.get(uRef)
      ]);

      if (!ss.exists) throw new Error('SESSION_NOT_FOUND');
      if (!us.exists) throw new Error('USER_NOT_FOUND');

      const s = ss.data();
      const u = us.data();

      if (s.userId !== uid) throw new Error('SESSION_FORBIDDEN');
      if (s.status !== 'started') throw new Error('SESSION_USED');
      if (u.status === 'banned') throw new Error('ACCOUNT_SUSPENDED');

      const adRef = db.collection('advertisements').doc(s.adId);
      const claimRef = db.collection('adClaims').doc(`${uid}_${s.adId}`);

      const [ad, claim] = await Promise.all([
        tx.get(adRef),
        tx.get(claimRef)
      ]);

      if (!ad.exists || ad.data().status !== 'active') {
        throw new Error('AD_INACTIVE');
      }

      if (claim.exists) throw new Error('ALREADY_CLAIMED');

      if (Date.now() - Number(s.startedAt) < Number(s.duration) * 1000) {
        throw new Error('TOO_EARLY');
      }

      // Read referral records before transaction writes.
      let referralSnap = null;
      let inviterSnap = null;
      let referralRef = null;
      let inviterRef = null;

      if (u.referredBy) {
        referralRef = db.collection('referrals').doc(uid);
        referralSnap = await tx.get(referralRef);

        if (
          referralSnap.exists &&
          referralSnap.data().status !== 'successful'
        ) {
          inviterRef = userRef(db, referralSnap.data().referrerId);
          inviterSnap = await tx.get(inviterRef);
        }
      }

      const reward = Number(s.reward);

      if (!Number.isFinite(reward) || reward <= 0) {
        throw new Error('INVALID_REWARD');
      }

      const day = todayKey();

      const today = u.earningsDate === day
        ? Number(u.todayEarnings || 0) + reward
        : reward;

      tx.update(uRef, {
        balance: Number(u.balance || 0) + reward,
        totalEarnings: Number(u.totalEarnings || 0) + reward,
        todayEarnings: today,
        earningsDate: day
      });

      tx.create(claimRef, {
        userId: uid,
        adId: s.adId,
        reward,
        completedAt: new Date().toISOString()
      });

      tx.update(sessionRef, {
        status: 'completed',
        completedAt: new Date().toISOString()
      });

      // Each unique completed ad advances referral progress once.
      if (
        referralSnap?.exists &&
        referralSnap.data().status !== 'successful'
      ) {
        const referralData = referralSnap.data();

        const nextCompletedAds = Math.min(
          REQUIRED_REFERRAL_ADS,
          Number(referralData.completedAds || 0) + 1
        );

        const nowIso = new Date().toISOString();
        const becameSuccessful = nextCompletedAds >= REQUIRED_REFERRAL_ADS;

        tx.update(referralRef, {
          completedAds: nextCompletedAds,
          status: becameSuccessful ? 'successful' : 'in_progress',
          updatedAt: nowIso,
          ...(becameSuccessful ? { successfulAt: nowIso } : {})
        });

        if (becameSuccessful && inviterSnap?.exists) {
          tx.update(inviterRef, {
            referralsCount: Number(inviterSnap.data().referralsCount || 0) + 1
          });
        }
      }

      const hist = db.collection('transactions').doc();

      tx.create(hist, {
        userId: uid,
        type: 'ad_reward',
        amount: reward,
        status: 'completed',
        note: 'Advertisement reward',
        createdAt: new Date().toISOString()
      });

      return {
        reward,
        balance: Number(u.balance || 0) + reward
      };
    });

    res.json({
      success: true,
      data: result
    });
  } catch (e) {
    const map = {
      SESSION_NOT_FOUND: [404, 'Session not found.'],
      USER_NOT_FOUND: [404, 'User not found.'],
      SESSION_FORBIDDEN: [403, 'Forbidden.'],
      SESSION_USED: [409, 'Session already used.'],
      ACCOUNT_SUSPENDED: [403, 'Account suspended.'],
      AD_INACTIVE: [409, 'Ad inactive.'],
      ALREADY_CLAIMED: [409, 'Already claimed.'],
      TOO_EARLY: [425, 'Watch timer is not complete.'],
      INVALID_REWARD: [400, 'Invalid reward.']
    };

    const [status, message] = map[e.message] || [
      500,
      'Could not complete ad.'
    ];

    if (status === 500) console.error(e);

    res.status(status).json({
      success: false,
      error: message
    });
  }
});

// TASKS
app.get('/api/tasks', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;

    await requireActiveUser(db, uid);

    const [tasks, submissions] = await Promise.all([
      db.collection('tasks').where('status', '==', 'active').get(),
      db.collection('taskSubmissions').where('userId', '==', uid).get()
    ]);

    const submitted = new Map(
      submissions.docs.map(d => [
        d.data().taskId,
        d.data().status
      ])
    );

    res.json({
      success: true,
      data: tasks.docs.map(d => ({
        id: d.id,
        ...d.data(),
        submissionStatus: submitted.get(d.id) || null
      }))
    });
  } catch (e) {
    sendError(res, e, 'Could not load tasks.');
  }
});

// SUBMIT TASK
app.post('/api/tasks/:id/submit', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;

    await requireActiveUser(db, uid);

    const taskRef = db.collection('tasks').doc(req.params.id);
    const task = await taskRef.get();

    if (!task.exists || task.data().status !== 'active') {
      return res.status(404).json({
        success: false,
        error: 'Task unavailable.'
      });
    }

    const proof = String(req.body.proof || '')
      .trim()
      .slice(0, 1000);

    if (task.data().requiresProof && !proof) {
      return res.status(400).json({
        success: false,
        error: 'Please provide task proof.'
      });
    }

    const ref = db.collection('taskSubmissions')
      .doc(`${uid}_${req.params.id}`);

    await db.runTransaction(async tx => {
      const [old, userSnap] = await Promise.all([
        tx.get(ref),
        tx.get(userRef(db, uid))
      ]);

      if (old.exists) throw new Error('ALREADY_SUBMITTED');
      if (!userSnap.exists) throw new Error('USER_NOT_FOUND');

      tx.create(ref, {
        userId: uid,
        taskId: req.params.id,
        proof,
        status: 'pending',
        reward: Number(task.data().reward || 0),
        createdAt: new Date().toISOString()
      });

      tx.update(userRef(db, uid), {
        pendingTasks: Number(userSnap.data().pendingTasks || 0) + 1
      });
    });

    res.json({
      success: true,
      message: 'Task submitted for review.'
    });
  } catch (e) {
    if (e.message === 'ALREADY_SUBMITTED') {
      return res.status(409).json({
        success: false,
        error: 'You have already submitted this task.'
      });
    }

    sendError(res, e, 'Could not submit task.');
  }
});

// REFERRALS
app.get('/api/referrals', telegramAuth, async (req, res) => {
  try {
    const uid = req.telegramUser.id;

    await requireActiveUser(getDb(), uid);

    const referralsSnap = await getDb()
      .collection('referrals')
      .where('referrerId', '==', uid)
      .get();

    const referrals = referralsSnap.docs.map(doc => {
      const item = doc.data();

      return {
        telegramId: item.referredUserId || doc.id,
        firstName: item.firstName || 'Telegram User',
        lastName: item.lastName || '',
        username: item.username || null,
        completedAds: Number(item.completedAds || 0),
        requiredAds: REQUIRED_REFERRAL_ADS,
        status: item.status || 'in_progress',
        createdAt: item.createdAt || null
      };
    }).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );

    const successfulCount = referrals.filter(
      x => x.status === 'successful'
    ).length;

    const inProgressCount = referrals.filter(
      x => x.status !== 'successful'
    ).length;

    res.json({
      success: true,
      data: {
        count: successfulCount,
        successfulCount,
        totalCount: referrals.length,
        inProgressCount,
        requiredSuccessfulReferrals: REQUIRED_SUCCESSFUL_REFERRALS,
        requiredAdsPerReferral: REQUIRED_REFERRAL_ADS,
        link: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=ref_${uid}`,
        bonus: REFERRAL_BONUS,
        referrals
      }
    });
  } catch (e) {
    sendError(res, e, 'Could not load referrals.');
  }
});

// TRANSACTION HISTORY
app.get('/api/history', telegramAuth, async (req, res) => {
  try {
    const uid = req.telegramUser.id;

    await requireActiveUser(getDb(), uid);

    const snap = await getDb()
      .collection('transactions')
      .where('userId', '==', uid)
      .get();

    const items = snap.docs
      .map(d => ({
        id: d.id,
        ...d.data()
      }))
      .sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt))
      )
      .slice(0, 100);

    res.json({
      success: true,
      data: items
    });
  } catch (e) {
    sendError(res, e, 'Could not load history.');
  }
});

// WITHDRAW
app.post('/api/withdraw', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;

    const amount = Number(req.body.amount);
    const method = String(req.body.method || '').trim();
    const account = String(req.body.account || '').trim();

    if (!Number.isFinite(amount) || amount < MIN_WITHDRAW) {
      return res.status(400).json({
        success: false,
        error: `Minimum withdrawal is ৳${MIN_WITHDRAW}.`
      });
    }

    if (!['bKash', 'Nagad', 'Binance USDT'].includes(method)) {
      return res.status(400).json({
        success: false,
        error: 'Select a valid payment method.'
      });
    }

    if (account.length < 5 || account.length > 120) {
      return res.status(400).json({
        success: false,
        error: 'Enter a valid payment account.'
      });
    }

    // Server-side referral check. Frontend locking is not trusted.
    const referralDocs = await db.collection('referrals')
      .where('referrerId', '==', uid)
      .get();

    const successfulReferrals = referralDocs.docs
      .filter(doc => doc.data().status === 'successful').length;

    if (successfulReferrals < REQUIRED_SUCCESSFUL_REFERRALS) {
      return res.status(403).json({
        success: false,
        error: `Withdrawal is locked. You need ${REQUIRED_SUCCESSFUL_REFERRALS} successful referrals. Your current successful referrals: ${successfulReferrals}.`
      });
    }

    const uRef = userRef(db, uid);
    const wRef = db.collection('withdrawals').doc();
    const tRef = db.collection('transactions').doc();

    await db.runTransaction(async tx => {
      const u = await tx.get(uRef);

      if (!u.exists) throw new Error('USER_NOT_FOUND');

      const data = u.data();

      if (data.status === 'banned') {
        throw new Error('ACCOUNT_SUSPENDED');
      }

      if (Number(data.balance || 0) < amount) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      tx.update(uRef, {
        balance: Number(data.balance || 0) - amount
      });

      tx.create(wRef, {
        id: wRef.id,
        userId: uid,
        telegramId: uid,
        amount,
        method,
        account,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      tx.create(tRef, {
        userId: uid,
        type: 'withdrawal',
        amount: -amount,
        status: 'pending',
        note: `Withdrawal request (${method})`,
        createdAt: new Date().toISOString(),
        referenceId: wRef.id
      });
    });

    res.json({
      success: true,
      message: 'Withdrawal request submitted.'
    });
  } catch (e) {
    const m = {
      USER_NOT_FOUND: [404, 'User not found.'],
      ACCOUNT_SUSPENDED: [403, 'Account suspended.'],
      INSUFFICIENT_BALANCE: [400, 'Insufficient balance.']
    };

    const [s, msg] = m[e.message] || [
      500,
      'Could not submit withdrawal.'
    ];

    if (s === 500) console.error(e);

    res.status(s).json({
      success: false,
      error: msg
    });
  }
});

// PROFILE UPDATE
app.patch('/api/profile', telegramAuth, async (req, res) => {
  try {
    const uid = req.telegramUser.id;
    const allowed = {};

    if (typeof req.body.phone === 'string') {
      allowed.phone = req.body.phone.trim().slice(0, 30);
    }

    if (typeof req.body.email === 'string') {
      allowed.email = req.body.email.trim().slice(0, 100);
    }

    await requireActiveUser(getDb(), uid);
    await userRef(getDb(), uid).update(allowed);

    res.json({
      success: true,
      message: 'Profile updated.'
    });
  } catch (e) {
    sendError(res, e, 'Could not update profile.');
  }
});

// AD PLACEMENTS
const AD_PLACEMENT_SLOTS = new Set([
  'top',
  'middle',
  'bottom',
  'gate'
]);

app.get('/api/ad-placements', telegramAuth, async (req, res) => {
  try {
    await requireActiveUser(getDb(), req.telegramUser.id);

    const snap = await getDb()
      .collection('adPlacements')
      .get();

    const placements = {};

    snap.forEach(doc => {
      const item = doc.data();

      if (AD_PLACEMENT_SLOTS.has(doc.id) && item.enabled === true) {
        placements[doc.id] = {
          slot: doc.id,
          label: String(item.label || 'Advertisement').slice(0, 60),
          html: String(item.html || '').slice(0, 50000)
        };
      }
    });

    res.json({
      success: true,
      data: placements
    });
  } catch (e) {
    sendError(res, e, 'Could not load ad placements.');
  }
});

app.get('/api/admin/ad-placements', adminAuth, async (req, res) => {
  try {
    const snap = await getDb()
      .collection('adPlacements')
      .get();

    const data = {};

    snap.forEach(doc => {
      if (AD_PLACEMENT_SLOTS.has(doc.id)) {
        data[doc.id] = {
          slot: doc.id,
          ...doc.data()
        };
      }
    });

    res.json({
      success: true,
      data
    });
  } catch (e) {
    sendError(res, e, 'Could not load ad placement settings.');
  }
});

app.put('/api/admin/ad-placements/:slot', adminAuth, async (req, res) => {
  try {
    const slot = String(req.params.slot || '');
    const label = String(req.body.label || 'Advertisement')
      .trim()
      .slice(0, 60);

    const html = String(req.body.html || '');
    const enabled = req.body.enabled === true;

    if (!AD_PLACEMENT_SLOTS.has(slot)) {
      return res.status(400).json({
        success: false,
        error: 'Unknown ad placement slot.'
      });
    }

    if (html.length > 50000) {
      return res.status(400).json({
        success: false,
        error: 'Ad HTML must be 50 KB or less.'
      });
    }

    await getDb()
      .collection('adPlacements')
      .doc(slot)
      .set({
        slot,
        label,
        html,
        enabled,
        updatedAt: new Date().toISOString()
      }, {
        merge: true
      });

    res.json({
      success: true,
      message: `Ad placement "${slot}" saved.`
    });
  } catch (e) {
    sendError(res, e, 'Could not save ad placement.');
  }
});

app.delete('/api/admin/ad-placements/:slot', adminAuth, async (req, res) => {
  try {
    const slot = String(req.params.slot || '');

    if (!AD_PLACEMENT_SLOTS.has(slot)) {
      return res.status(400).json({
        success: false,
        error: 'Unknown ad placement slot.'
      });
    }

    await getDb()
      .collection('adPlacements')
      .doc(slot)
      .delete();

    res.json({
      success: true,
      message: `Ad placement "${slot}" removed.`
    });
  } catch (e) {
    sendError(res, e, 'Could not remove ad placement.');
  }
});

// ADMIN STATS
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const users = await db.collection('users').get();

    let totalBalance = 0;
    let activeUsers = 0;

    users.forEach(d => {
      const x = d.data();
      totalBalance += Number(x.balance || 0);

      if (x.status === 'active') activeUsers++;
    });

    const pending = await db.collection('withdrawals')
      .where('status', '==', 'pending')
      .get();

    res.json({
      success: true,
      data: {
        totalUsers: users.size,
        activeUsers,
        totalBalance,
        pendingWithdraws: pending.size
      }
    });
  } catch (e) {
    sendError(res, e);
  }
});

// ADMIN USERS
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const s = await getDb().collection('users').get();

    res.json({
      success: true,
      data: s.docs.map(d => d.data())
    });
  } catch (e) {
    sendError(res, e);
  }
});

// ADMIN BAN
app.post('/api/admin/ban', adminAuth, async (req, res) => {
  try {
    const { telegramId, status } = req.body;

    if (!telegramId || !['active', 'banned'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user/status'
      });
    }

    await userRef(getDb(), telegramId).update({ status });

    res.json({ success: true });
  } catch (e) {
    sendError(res, e);
  }
});

// ADMIN ADS
app.get('/api/admin/ads', adminAuth, async (req, res) => {
  try {
    const s = await getDb().collection('advertisements').get();

    res.json({
      success: true,
      data: s.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
    });
  } catch (e) {
    sendError(res, e);
  }
});

app.post('/api/admin/ads', adminAuth, async (req, res) => {
  try {
    const { title, url, reward, duration } = req.body;
    const u = new URL(String(url));

    const r = Number(reward);
    const d = Number(duration);

    if (
      !['http:', 'https:'].includes(u.protocol) ||
      !String(title || '').trim() ||
      !Number.isFinite(r) ||
      r <= 0 ||
      r > 1000 ||
      !Number.isInteger(d) ||
      d < 20 ||
      d > 300
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ad fields. Duration must be 20 to 300 seconds.'
      });
    }

    const ref = getDb().collection('advertisements').doc();

    await ref.set({
      id: ref.id,
      title: String(title).trim(),
      url: u.toString(),
      reward: r,
      duration: d,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (e) {
    sendError(res, e, 'Could not create ad.');
  }
});

app.delete('/api/admin/ads/:id', adminAuth, async (req, res) => {
  try {
    await getDb()
      .collection('advertisements')
      .doc(req.params.id)
      .delete();

    res.json({ success: true });
  } catch (e) {
    sendError(res, e);
  }
});

// ADMIN TASKS
app.get('/api/admin/tasks', adminAuth, async (req, res) => {
  try {
    const s = await getDb().collection('tasks').get();

    res.json({
      success: true,
      data: s.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
    });
  } catch (e) {
    sendError(res, e);
  }
});

app.post('/api/admin/tasks', adminAuth, async (req, res) => {
  try {
    const { title, url, reward, requiresProof } = req.body;
    const r = Number(reward);

    if (!String(title || '').trim() || !Number.isFinite(r) || r < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid task fields.'
      });
    }

    const ref = getDb().collection('tasks').doc();

    await ref.set({
      id: ref.id,
      title: String(title).trim(),
      url: String(url || ''),
      reward: r,
      requiresProof: !!requiresProof,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (e) {
    sendError(res, e);
  }
});

app.delete('/api/admin/tasks/:id', adminAuth, async (req, res) => {
  try {
    await getDb()
      .collection('tasks')
      .doc(req.params.id)
      .delete();

    res.json({ success: true });
  } catch (e) {
    sendError(res, e);
  }
});

// ADMIN WITHDRAWALS
app.get('/api/admin/withdrawals', adminAuth, async (req, res) => {
  try {
    const s = await getDb()
      .collection('withdrawals')
      .orderBy('createdAt', 'desc')
      .get();

    res.json({
      success: true,
      data: s.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
    });
  } catch (e) {
    sendError(res, e);
  }
});

app.post('/api/admin/withdrawals/:id', adminAuth, async (req, res) => {
  try {
    const status = req.body.status;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status.'
      });
    }

    const db = getDb();
    const wRef = db.collection('withdrawals').doc(req.params.id);

    await db.runTransaction(async tx => {
      const w = await tx.get(wRef);

      if (!w.exists) throw new Error('NOT_FOUND');

      const x = w.data();

      if (x.status !== 'pending') {
        throw new Error('ALREADY_PROCESSED');
      }

      const uRef = userRef(db, x.userId);
      const u = await tx.get(uRef);

      tx.update(wRef, {
        status,
        updatedAt: new Date().toISOString()
      });

      if (u.exists && status === 'rejected') {
        tx.update(uRef, {
          balance: Number(u.data().balance || 0) + Number(x.amount || 0)
        });
      }

      if (u.exists && status === 'approved') {
        tx.update(uRef, {
          withdrawnAmount: Number(u.data().withdrawnAmount || 0) + Number(x.amount || 0)
        });
      }

      const t = db.collection('transactions').doc();

      tx.create(t, {
        userId: x.userId,
        type: 'withdrawal',
        amount: status === 'rejected'
          ? Number(x.amount)
          : -Number(x.amount),
        status,
        note: `Withdrawal ${status}`,
        referenceId: wRef.id,
        createdAt: new Date().toISOString()
      });
    });

    res.json({ success: true });
  } catch (e) {
    if (e.message === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'Not found'
      });
    }

    if (e.message === 'ALREADY_PROCESSED') {
      return res.status(409).json({
        success: false,
        error: 'Already processed'
      });
    }

    sendError(res, e);
  }
});

// FRONTEND SERVING
app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.use(express.static(PUBLIC_DIR));

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// START SERVER
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend directory: ${PUBLIC_DIR}`);
  configureTelegramWebhook();
});
