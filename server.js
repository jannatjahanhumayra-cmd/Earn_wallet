
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 10000;
const PUBLIC_DIR = path.join(__dirname, 'backend', 'public');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==========================================
// FIREBASE INITIALIZATION
// ==========================================

let firebaseDb = null;
let firebaseAuth = null;

function initializeFirebase() {
  if (admin.apps.length) {
    const existing = admin.app();
    firebaseDb = existing.firestore();
    firebaseAuth = existing.auth();
    return existing;
  }

  const credentials = process.env.FIREBASE_CREDENTIALS;

  if (!credentials) {
    console.error('FIREBASE_CREDENTIALS is missing.');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(credentials);

    const instance = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    firebaseDb = admin.firestore();
    firebaseAuth = admin.auth();

    console.log('Firebase Admin initialized.');
    return instance;
  } catch (error) {
    console.error('Firebase initialization failed:', error.message);
    return null;
  }
}

initializeFirebase();

function getDb() {
  if (!firebaseDb) {
    throw new Error('Firebase is not initialized. Check FIREBASE_CREDENTIALS.');
  }
  return firebaseDb;
}

function getAuth() {
  if (!firebaseAuth) {
    throw new Error('Firebase Auth is not initialized.');
  }
  return firebaseAuth;
}

// ==========================================
// ENVIRONMENT SETTINGS
// ==========================================

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
  process.env.RENDER_EXTERNAL_URL ||
  'https://earn-wallet-z0ea.onrender.com'
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

const DEFAULT_APP_SETTINGS = {
  appName: 'EarnWallet',
  maintenance: false,
  maintenanceMessage:
    'We are currently updating EarnWallet. Please try again later.',
  supportUrl: '',
  minWithdraw: MIN_WITHDRAW
};

const DEFAULT_PAYMENT_SETTINGS = {
  bKash: { enabled: true, label: 'bKash' },
  Nagad: { enabled: true, label: 'Nagad' },
  USDT: { enabled: true, label: 'Binance USDT' }
};

const AD_PLACEMENT_SLOTS = new Set([
  'top', 'middle', 'bottom', 'gate'
]);

// ==========================================
// COMMON HELPERS
// ==========================================

function sendError(res, error, fallback = 'Server error') {
  console.error(error);
  return res.status(500).json({
    success: false,
    error: fallback
  });
}

function userRef(db, uid) {
  return db.collection('users').doc(String(uid));
}

async function requireActiveUser(db, uid) {
  const snap = await userRef(db, uid).get();

  if (!snap.exists) throw new Error('USER_NOT_FOUND');
  if (snap.data().status === 'banned') {
    throw new Error('ACCOUNT_SUSPENDED');
  }

  return snap;
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka'
  }).format(new Date());
}

function parseReferralPayload(value) {
  const match = String(value || '')
    .trim()
    .match(/^(?:ref_)?(\d{1,20})$/);

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

// ==========================================
// TELEGRAM MINI APP AUTHENTICATION
// ==========================================

function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) return null;

    params.delete('hash');

    const checkString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculated = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    const a = Buffer.from(calculated, 'hex');
    const b = Buffer.from(hash, 'hex');

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return null;
    }

    const authDate = Number(params.get('auth_date') || 0);
    const now = Math.floor(Date.now() / 1000);

    if (
      !authDate ||
      now - authDate > 3600 ||
      authDate > now + 60
    ) {
      return null;
    }

    const user = params.get('user');
    if (!user) return null;

    const parsed = JSON.parse(user);
    parsed._startParam = params.get('start_param') || '';

    return parsed;
  } catch (error) {
    console.error('InitData verification failed:', error.message);
    return null;
  }
}

function readInitData(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('tma ') ? header.slice(4) : '';
}

// User Bot authentication
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

  // Maintenance mode: allow the config endpoint so the app
  // can display the maintenance message.
  try {
    if (req.path !== '/api/app-config') {
      const snap = await getDb()
        .collection('appConfig')
        .doc('settings')
        .get();

      if (snap.exists && snap.data().maintenance === true) {
        return res.status(503).json({
          success: false,
          maintenance: true,
          error: String(
            snap.data().maintenanceMessage ||
            DEFAULT_APP_SETTINGS.maintenanceMessage
          )
        });
      }
    }
  } catch (error) {
    return sendError(res, error, 'Could not verify app status.');
  }

  next();
}

// Admin Bot authentication
async function adminAuth(req, res, next) {
  const user = verifyInitData(
    readInitData(req),
    ADMIN_BOT_TOKEN
  );

  if (!user?.id) {
    return res.status(401).json({
      success: false,
      error: 'Invalid Admin Bot InitData'
    });
  }

  if (!ADMIN_ID || String(user.id) !== ADMIN_ID) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  req.adminUser = user;
  next();
}

// ==========================================
// REGISTER TELEGRAM USER
// ==========================================

async function registerTelegramUser(tg, referralPayload = '') {
  const db = getDb();
  const uid = String(tg.id);
  const ref = userRef(db, uid);
  const inviterId = parseReferralPayload(referralPayload);

  return db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    const now = new Date().toISOString();

    if (existing.exists) {
      const old = existing.data();

      if (old.status === 'banned') {
        throw new Error('ACCOUNT_SUSPENDED');
      }

      tx.update(ref, {
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

    if (
      inviterSnap?.exists &&
      inviterSnap.data().status !== 'banned' &&
      referralRef
    ) {
      const oldReferral = await tx.get(referralRef);

      if (!oldReferral.exists) {
        fresh.referredBy = inviterId;
      }
    }

    tx.create(ref, fresh);

    if (fresh.referredBy && inviterSnap?.exists && referralRef) {
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

// ==========================================
// TELEGRAM BOT API & WEBHOOK
// ==========================================

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
    throw new Error(result.description || 'Telegram API request failed.');
  }

  return result.result;
}

async function configureTelegramWebhook() {
  if (!BOT_TOKEN || !WEBHOOK_PATH) {
    console.warn('User Bot webhook not configured.');
    return;
  }

  try {
    const info = await telegramApi('getMe');

    if (
      String(info.username || '').toLowerCase() !==
      TELEGRAM_BOT_USERNAME.toLowerCase()
    ) {
      console.error('User Bot username does not match environment setting.');
      return;
    }

    await telegramApi('setWebhook', {
      url: `${PUBLIC_APP_URL}${WEBHOOK_PATH}`,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ['message'],
      drop_pending_updates: false
    });

    console.log('User Bot webhook configured.');
  } catch (error) {
    console.error('Webhook setup failed:', error.message);
  }
}

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'running'
  });
});

// ==========================================
// USER BOT /START WEBHOOK
// ==========================================

if (WEBHOOK_PATH) {
  app.post(WEBHOOK_PATH, async (req, res) => {
    if (
      req.get('X-Telegram-Bot-Api-Secret-Token') !==
      WEBHOOK_SECRET
    ) {
      return res.sendStatus(401);
    }

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
      console.error('/start failed:', error.message);
    }
  });
}

// ==========================================
// USER AUTH & PROFILE
// ==========================================

app.post('/api/auth', telegramAuth, async (req, res) => {
  try {
    const data = await registerTelegramUser(
      req.telegramUser,
      req.telegramUser.startParam
    );

    res.json({ success: true, data });
  } catch (error) {
    if (error.message === 'ACCOUNT_SUSPENDED') {
      return res.status(403).json({
        success: false,
        error: 'Your account is suspended.'
      });
    }

    sendError(res, error, 'Could not sign in.');
  }
});

app.get('/api/me', telegramAuth, async (req, res) => {
  try {
    const snap = await requireActiveUser(
      getDb(),
      req.telegramUser.id
    );

    res.json({ success: true, data: snap.data() });
  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'User not found. Reopen the app.'
      });
    }

    if (error.message === 'ACCOUNT_SUSPENDED') {
      return res.status(403).json({
        success: false,
        error: 'Account suspended.'
      });
    }

    sendError(res, error, 'Could not load profile.');
  }
});

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

    if (!Object.keys(allowed).length) {
      return res.status(400).json({
        success: false,
        error: 'No profile fields provided.'
      });
    }

    await requireActiveUser(getDb(), uid);
    await userRef(getDb(), uid).update(allowed);

    res.json({ success: true, message: 'Profile updated.' });
  } catch (error) {
    sendError(res, error, 'Could not update profile.');
  }
});

// ==========================================
// USER APP CONFIG
// ==========================================

app.get('/api/app-config', telegramAuth, async (req, res) => {
  try {
    await requireActiveUser(getDb(), req.telegramUser.id);

    const db = getDb();

    const [settingsSnap, paymentSnap] = await Promise.all([
      db.collection('appConfig').doc('settings').get(),
      db.collection('appConfig').doc('payments').get()
    ]);

    const settings = {
      ...DEFAULT_APP_SETTINGS,
      ...(settingsSnap.exists ? settingsSnap.data() : {})
    };

    const payments = {
      ...DEFAULT_PAYMENT_SETTINGS,
      ...(paymentSnap.exists ? paymentSnap.data() : {})
    };

    res.json({
      success: true,
      data: {
        appName: settings.appName,
        maintenance: settings.maintenance === true,
        maintenanceMessage: settings.maintenanceMessage,
        supportUrl: settings.supportUrl,
        minWithdraw: settings.minWithdraw,
        payments
      }
    });
  } catch (error) {
    sendError(res, error, 'Could not load app configuration.');
  }
});

// ==========================================
// USER ADVERTISEMENTS
// ==========================================

app.get('/api/ads', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;

    await requireActiveUser(db, uid);

    const [adsSnap, claimsSnap] = await Promise.all([
      db.collection('advertisements')
        .where('status', '==', 'active')
        .get(),
      db.collection('adClaims')
        .where('userId', '==', uid)
        .get()
    ]);

    const claimed = new Set(
      claimsSnap.docs.map(d => d.data().adId)
    );

    const ads = adsSnap.docs
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

    res.json({ success: true, data: ads });
  } catch (error) {
    sendError(res, error, 'Could not load advertisements.');
  }
});

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
  } catch (error) {
    if (error.message === 'ALREADY_CLAIMED') {
      return res.status(409).json({
        success: false,
        error: 'Already completed this ad.'
      });
    }

    sendError(res, error, 'Could not start ad.');
  }
});

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
      const [session, user] = await Promise.all([
        tx.get(sessionRef),
        tx.get(uRef)
      ]);

      if (!session.exists) throw new Error('SESSION_NOT_FOUND');
      if (!user.exists) throw new Error('USER_NOT_FOUND');

      const s = session.data();
      const u = user.data();

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

      const now = new Date().toISOString();

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
        completedAt: now
      });

      tx.update(sessionRef, {
        status: 'completed',
        completedAt: now
      });

      if (
        referralSnap?.exists &&
        referralSnap.data().status !== 'successful'
      ) {
        const referral = referralSnap.data();

        const completed = Math.min(
          REQUIRED_REFERRAL_ADS,
          Number(referral.completedAds || 0) + 1
        );

        const successful = completed >= REQUIRED_REFERRAL_ADS;

        tx.update(referralRef, {
          completedAds: completed,
          status: successful ? 'successful' : 'in_progress',
          updatedAt: now,
          ...(successful ? { successfulAt: now } : {})
        });

        if (successful && inviterSnap?.exists) {
          tx.update(inviterRef, {
            referralsCount:
              Number(inviterSnap.data().referralsCount || 0) + 1
          });
        }
      }

      const historyRef = db.collection('transactions').doc();

      tx.create(historyRef, {
        userId: uid,
        type: 'ad_reward',
        amount: reward,
        status: 'completed',
        note: 'Advertisement reward',
        createdAt: now
      });

      return {
        reward,
        balance: Number(u.balance || 0) + reward
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const errors = {
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

    const [status, message] = errors[error.message] || [
      500, 'Could not complete ad.'
    ];

    if (status === 500) console.error(error);

    res.status(status).json({
      success: false,
      error: message
    });
  }
});

// ==========================================
// USER TASKS
// ==========================================

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
      submissions.docs.map(d => [d.data().taskId, d.data().status])
    );

    res.json({
      success: true,
      data: tasks.docs.map(d => ({
        id: d.id,
        ...d.data(),
        submissionStatus: submitted.get(d.id) || null
      }))
    });
  } catch (error) {
    sendError(res, error, 'Could not load tasks.');
  }
});

app.post('/api/tasks/:id/submit', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;

    await requireActiveUser(db, uid);

    const task = await db.collection('tasks').doc(req.params.id).get();

    if (!task.exists || task.data().status !== 'active') {
      return res.status(404).json({
        success: false,
        error: 'Task unavailable.'
      });
    }

    const proof = String(req.body.proof || '').trim().slice(0, 1000);

    if (task.data().requiresProof && !proof) {
      return res.status(400).json({
        success: false,
        error: 'Please provide task proof.'
      });
    }

    const ref = db.collection('taskSubmissions')
      .doc(`${uid}_${req.params.id}`);

    await db.runTransaction(async tx => {
      const [old, user] = await Promise.all([
        tx.get(ref),
        tx.get(userRef(db, uid))
      ]);

      if (old.exists) throw new Error('ALREADY_SUBMITTED');
      if (!user.exists) throw new Error('USER_NOT_FOUND');

      tx.create(ref, {
        userId: uid,
        taskId: req.params.id,
        proof,
        status: 'pending',
        reward: Number(task.data().reward || 0),
        createdAt: new Date().toISOString()
      });

      tx.update(userRef(db, uid), {
        pendingTasks: Number(user.data().pendingTasks || 0) + 1
      });
    });

    res.json({
      success: true,
      message: 'Task submitted for review.'
    });
  } catch (error) {
    if (error.message === 'ALREADY_SUBMITTED') {
      return res.status(409).json({
        success: false,
        error: 'You have already submitted this task.'
      });
    }

    sendError(res, error, 'Could not submit task.');
  }
});

// ==========================================
// USER REFERRALS
// ==========================================

app.get('/api/referrals', telegramAuth, async (req, res) => {
  try {
    const uid = req.telegramUser.id;
    const db = getDb();

    await requireActiveUser(db, uid);

    const snap = await db.collection('referrals')
      .where('referrerId', '==', uid)
      .get();

    const referrals = snap.docs.map(doc => {
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

    res.json({
      success: true,
      data: {
        count: successfulCount,
        successfulCount,
        totalCount: referrals.length,
        inProgressCount: referrals.length - successfulCount,
        requiredSuccessfulReferrals: REQUIRED_SUCCESSFUL_REFERRALS,
        requiredAdsPerReferral: REQUIRED_REFERRAL_ADS,
        link: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=ref_${uid}`,
        bonus: REFERRAL_BONUS,
        referrals
      }
    });
  } catch (error) {
    sendError(res, error, 'Could not load referrals.');
  }
});

// ==========================================
// USER TRANSACTION HISTORY
// ==========================================

app.get('/api/history', telegramAuth, async (req, res) => {
  try {
    const uid = req.telegramUser.id;
    const db = getDb();

    await requireActiveUser(db, uid);

    const snap = await db.collection('transactions')
      .where('userId', '==', uid)
      .get();

    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      )
      .slice(0, 100);

    res.json({ success: true, data: items });
  } catch (error) {
    sendError(res, error, 'Could not load history.');
  }
});

// ==========================================
// USER WITHDRAWAL
// ==========================================

app.post('/api/withdraw', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const uid = req.telegramUser.id;

    const amount = Number(req.body.amount);
    const method = String(req.body.method || '').trim();
    const account = String(req.body.account || '').trim();

    const [settingsSnap, paymentSnap] = await Promise.all([
      db.collection('appConfig').doc('settings').get(),
      db.collection('appConfig').doc('payments').get()
    ]);

    const currentMin = settingsSnap.exists
      ? Number(settingsSnap.data().minWithdraw || MIN_WITHDRAW)
      : MIN_WITHDRAW;

    const payments = {
      ...DEFAULT_PAYMENT_SETTINGS,
      ...(paymentSnap.exists ? paymentSnap.data() : {})
    };

    const paymentKey = method === 'bKash'
      ? 'bKash'
      : method === 'Nagad'
        ? 'Nagad'
        : method === 'Binance USDT'
          ? 'USDT'
          : null;

    if (!paymentKey || payments[paymentKey]?.enabled !== true) {
      return res.status(400).json({
        success: false,
        error: 'This payment method is currently unavailable.'
      });
    }

    if (!Number.isFinite(amount) || amount < currentMin) {
      return res.status(400).json({
        success: false,
        error: `Minimum withdrawal is ${currentMin}.`
      });
    }

    if (amount > 10000000) {
      return res.status(400).json({
        success: false,
        error: 'Withdrawal amount is too high.'
      });
    }

    if (account.length < 5 || account.length > 120) {
      return res.status(400).json({
        success: false,
        error: 'Enter a valid payment account.'
      });
    }

    const referralDocs = await db.collection('referrals')
      .where('referrerId', '==', uid)
      .get();

    const successful = referralDocs.docs.filter(
      d => d.data().status === 'successful'
    ).length;

    if (successful < REQUIRED_SUCCESSFUL_REFERRALS) {
      return res.status(403).json({
        success: false,
        error: `Withdrawal locked. You need ${REQUIRED_SUCCESSFUL_REFERRALS} successful referrals. Current: ${successful}.`
      });
    }

    const uRef = userRef(db, uid);
    const wRef = db.collection('withdrawals').doc();
    const tRef = db.collection('transactions').doc();

    await db.runTransaction(async tx => {
      const user = await tx.get(uRef);

      if (!user.exists) throw new Error('USER_NOT_FOUND');

      const data = user.data();

      if (data.status === 'banned') {
        throw new Error('ACCOUNT_SUSPENDED');
      }

      if (Number(data.balance || 0) < amount) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const now = new Date().toISOString();

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
        createdAt: now
      });

      tx.create(tRef, {
        userId: uid,
        type: 'withdrawal',
        amount: -amount,
        status: 'pending',
        note: `Withdrawal request (${method})`,
        createdAt: now,
        referenceId: wRef.id
      });
    });

    res.json({
      success: true,
      message: 'Withdrawal request submitted.'
    });
  } catch (error) {
    const map = {
      USER_NOT_FOUND: [404, 'User not found.'],
      ACCOUNT_SUSPENDED: [403, 'Account suspended.'],
      INSUFFICIENT_BALANCE: [400, 'Insufficient balance.']
    };

    const [status, message] = map[error.message] || [
      500, 'Could not submit withdrawal.'
    ];

    if (status === 500) console.error(error);

    res.status(status).json({
      success: false,
      error: message
    });
  }
});

// ==========================================
// USER AD PLACEMENTS
// ==========================================

app.get('/api/ad-placements', telegramAuth, async (req, res) => {
  try {
    await requireActiveUser(getDb(), req.telegramUser.id);

    const snap = await getDb().collection('adPlacements').get();
    const placements = {};

    snap.forEach(doc => {
      const item = doc.data();

      if (
        AD_PLACEMENT_SLOTS.has(doc.id) &&
        item.enabled === true
      ) {
        placements[doc.id] = {
          slot: doc.id,
          label: String(item.label || 'Advertisement').slice(0, 60),
          html: String(item.html || '').slice(0, 50000)
        };
      }
    });

    res.json({ success: true, data: placements });
  } catch (error) {
    sendError(res, error, 'Could not load ad placements.');
  }
});

// ==========================================
// ADMIN DASHBOARD STATS
// ==========================================

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const db = getDb();

    const [users, pending] = await Promise.all([
      db.collection('users').get(),
      db.collection('withdrawals')
        .where('status', '==', 'pending')
        .get()
    ]);

    let totalBalance = 0;
    let activeUsers = 0;
    let bannedUsers = 0;

    users.forEach(doc => {
      const data = doc.data();

      totalBalance += Number(data.balance || 0);

      if (data.status === 'active') activeUsers++;
      if (data.status === 'banned') bannedUsers++;
    });

    res.json({
      success: true,
      data: {
        totalUsers: users.size,
        activeUsers,
        bannedUsers,
        totalBalance,
        pendingWithdraws: pending.size
      }
    });
  } catch (error) {
    sendError(res, error, 'Could not load dashboard stats.');
  }
});

// ==========================================
// ADMIN USERS
// ==========================================

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const snap = await getDb().collection('users').get();

    res.json({
      success: true,
      data: snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
    });
  } catch (error) {
    sendError(res, error, 'Could not load users.');
  }
});

app.post('/api/admin/ban', adminAuth, async (req, res) => {
  try {
    const telegramId = String(req.body.telegramId || '');
    const status = req.body.status;

    if (
      !/^\d{1,20}$/.test(telegramId) ||
      !['active', 'banned'].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user or status.'
      });
    }

    const ref = userRef(getDb(), telegramId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    await ref.update({ status });

    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'Could not update user status.');
  }
});

// ==========================================
// ADMIN ADVERTISEMENTS
// ==========================================

app.get('/api/admin/ads', adminAuth, async (req, res) => {
  try {
    const snap = await getDb().collection('advertisements').get();

    res.json({
      success: true,
      data: snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
    });
  } catch (error) {
    sendError(res, error, 'Could not load ads.');
  }
});

app.post('/api/admin/ads', adminAuth, async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const url = new URL(String(req.body.url || ''));
    const reward = Number(req.body.reward);
    const duration = Number(req.body.duration);

    if (
      !title ||
      !['http:', 'https:'].includes(url.protocol) ||
      !Number.isFinite(reward) ||
      reward <= 0 ||
      reward > 1000 ||
      !Number.isInteger(duration) ||
      duration < 20 ||
      duration > 300
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ad fields. Duration must be 20 to 300 seconds.'
      });
    }

    const ref = getDb().collection('advertisements').doc();

    await ref.set({
      id: ref.id,
      title,
      url: url.toString(),
      reward,
      duration,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, data: { id: ref.id } });
  } catch (error) {
    sendError(res, error, 'Could not create ad.');
  }
});

app.delete('/api/admin/ads/:id', adminAuth, async (req, res) => {
  try {
    await getDb().collection('advertisements')
      .doc(req.params.id)
      .delete();

    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'Could not delete ad.');
  }
});

// ==========================================
// ADMIN TASKS
// ==========================================

app.get('/api/admin/tasks', adminAuth, async (req, res) => {
  try {
    const snap = await getDb().collection('tasks').get();

    res.json({
      success: true,
      data: snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
    });
  } catch (error) {
    sendError(res, error, 'Could not load tasks.');
  }
});

app.post('/api/admin/tasks', adminAuth, async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const url = String(req.body.url || '').trim();
    const reward = Number(req.body.reward);
    const requiresProof = req.body.requiresProof === true;

    if (!title || !Number.isFinite(reward) || reward < 0 || reward > 100000) {
      return res.status(400).json({
        success: false,
        error: 'Invalid task fields.'
      });
    }

    if (url) {
      const parsed = new URL(url);

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid task URL.'
        });
      }
    }

    const ref = getDb().collection('tasks').doc();

    await ref.set({
      id: ref.id,
      title,
      url,
      reward,
      requiresProof,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, data: { id: ref.id } });
  } catch (error) {
    sendError(res, error, 'Could not create task.');
  }
});

app.delete('/api/admin/tasks/:id', adminAuth, async (req, res) => {
  try {
    await getDb().collection('tasks')
      .doc(req.params.id)
      .delete();

    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'Could not delete task.');
  }
});

// ==========================================
// ADMIN WITHDRAWALS
// ==========================================

app.get('/api/admin/withdrawals', adminAuth, async (req, res) => {
  try {
    const snap = await getDb().collection('withdrawals')
      .orderBy('createdAt', 'desc')
      .get();

    res.json({
      success: true,
      data: snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
    });
  } catch (error) {
    sendError(res, error, 'Could not load withdrawals.');
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
      const withdrawal = await tx.get(wRef);

      if (!withdrawal.exists) throw new Error('NOT_FOUND');

      const data = withdrawal.data();

      if (data.status !== 'pending') {
        throw new Error('ALREADY_PROCESSED');
      }

      const uRef = userRef(db, data.userId);
      const user = await tx.get(uRef);

      if (!user.exists) throw new Error('USER_NOT_FOUND');

      const now = new Date().toISOString();

      tx.update(wRef, {
        status,
        updatedAt: now
      });

      if (status === 'rejected') {
        tx.update(uRef, {
          balance: Number(user.data().balance || 0) +
            Number(data.amount || 0)
        });
      } else {
        tx.update(uRef, {
          withdrawnAmount: Number(user.data().withdrawnAmount || 0) +
            Number(data.amount || 0)
        });
      }

      const transaction = db.collection('transactions').doc();

      tx.create(transaction, {
        userId: data.userId,
        type: 'withdrawal',
        amount: status === 'rejected'
          ? Number(data.amount)
          : -Number(data.amount),
        status,
        note: `Withdrawal ${status}`,
        referenceId: wRef.id,
        createdAt: now
      });
    });

    res.json({ success: true });
  } catch (error) {
    const map = {
      NOT_FOUND: [404, 'Withdrawal not found.'],
      ALREADY_PROCESSED: [409, 'Already processed.'],
      USER_NOT_FOUND: [404, 'Withdrawal user not found.']
    };

    const [status, message] = map[error.message] || [
      500, 'Could not process withdrawal.'
    ];

    if (status === 500) console.error(error);

    res.status(status).json({
      success: false,
      error: message
    });
  }
});

// ==========================================
// ADMIN AD PLACEMENTS
// ==========================================

app.get('/api/admin/ad-placements', adminAuth, async (req, res) => {
  try {
    const snap = await getDb().collection('adPlacements').get();
    const data = {};

    snap.forEach(doc => {
      if (AD_PLACEMENT_SLOTS.has(doc.id)) {
        data[doc.id] = {
          slot: doc.id,
          ...doc.data()
        };
      }
    });

    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error, 'Could not load ad placements.');
  }
});

app.put('/api/admin/ad-placements/:slot', adminAuth, async (req, res) => {
  try {
    const slot = String(req.params.slot || '');

    if (!AD_PLACEMENT_SLOTS.has(slot)) {
      return res.status(400).json({
        success: false,
        error: 'Unknown ad placement slot.'
      });
    }

    const label = String(req.body.label || 'Advertisement')
      .trim().slice(0, 60);

    const html = String(req.body.html || '');
    const enabled = req.body.enabled === true;

    if (html.length > 50000) {
      return res.status(400).json({
        success: false,
        error: 'Ad HTML must be 50 KB or less.'
      });
    }

    await getDb().collection('adPlacements').doc(slot).set({
      slot,
      label,
      html,
      enabled,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    res.json({
      success: true,
      message: `Ad placement "${slot}" saved.`
    });
  } catch (error) {
    sendError(res, error, 'Could not save ad placement.');
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

    await getDb().collection('adPlacements').doc(slot).delete();

    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'Could not remove ad placement.');
  }
});

// ==========================================
// ADMIN APP SETTINGS
// ==========================================

app.get('/api/admin/settings', adminAuth, async (req, res) => {
  try {
    const snap = await getDb()
      .collection('appConfig')
      .doc('settings')
      .get();

    res.json({
      success: true,
      data: {
        ...DEFAULT_APP_SETTINGS,
        ...(snap.exists ? snap.data() : {})
      }
    });
  } catch (error) {
    sendError(res, error, 'Could not load settings.');
  }
});

app.put('/api/admin/settings', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};

    const settings = {
      appName: String(body.appName || 'EarnWallet')
        .trim().slice(0, 60),
      maintenance: body.maintenance === true,
      maintenanceMessage: String(
        body.maintenanceMessage ||
        DEFAULT_APP_SETTINGS.maintenanceMessage
      ).trim().slice(0, 500),
      supportUrl: String(body.supportUrl || '').trim().slice(0, 500),
      minWithdraw: Number(body.minWithdraw)
    };

    if (
      !Number.isFinite(settings.minWithdraw) ||
      settings.minWithdraw < 1 ||
      settings.minWithdraw > 1000000
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid minimum withdrawal.'
      });
    }

    if (settings.supportUrl) {
      const parsed = new URL(settings.supportUrl);

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid support URL.'
        });
      }
    }

    await getDb().collection('appConfig').doc('settings').set({
      ...settings,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    res.json({ success: true, data: settings });
  } catch (error) {
    sendError(res, error, 'Could not save settings.');
  }
});

// ==========================================
// ADMIN PAYMENT SETTINGS
// ==========================================

app.get('/api/admin/payment-settings', adminAuth, async (req, res) => {
  try {
    const snap = await getDb()
      .collection('appConfig')
      .doc('payments')
      .get();

    res.json({
      success: true,
      data: {
        ...DEFAULT_PAYMENT_SETTINGS,
        ...(snap.exists ? snap.data() : {})
      }
    });
  } catch (error) {
    sendError(res, error, 'Could not load payment settings.');
  }
});

app.put('/api/admin/payment-settings', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const methods = {};

    for (const method of ['bKash', 'Nagad', 'USDT']) {
      methods[method] = {
        enabled: body[method]?.enabled === true,
        label: method === 'USDT' ? 'Binance USDT' : method
      };
    }

    await getDb().collection('appConfig').doc('payments').set({
      ...methods,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    res.json({ success: true, data: methods });
  } catch (error) {
    sendError(res, error, 'Could not save payment settings.');
  }
});

// ==========================================
// ADMIN DATABASE BACKUP
// ==========================================

const BACKUP_COLLECTIONS = [
  'users',
  'advertisements',
  'adClaims',
  'watchSessions',
  'tasks',
  'taskSubmissions',
  'referrals',
  'transactions',
  'withdrawals',
  'adPlacements',
  'appConfig'
];

app.get('/api/admin/backup', adminAuth, async (req, res) => {
  try {
    const db = getDb();

    const backup = {
      app: 'EarnWallet',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      collections: {}
    };

    let total = 0;

    for (const name of BACKUP_COLLECTIONS) {
      const snap = await db.collection(name).get();
      backup.collections[name] = {};

      for (const doc of snap.docs) {
        total++;

        if (total > 5000) {
          return res.status(413).json({
            success: false,
            error: 'Backup is limited to 5000 documents.'
          });
        }

        backup.collections[name][doc.id] = doc.data();
      }
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="earnwallet-backup-${Date.now()}.json"`
    );

    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(backup));
  } catch (error) {
    sendError(res, error, 'Could not create backup.');
  }
});

// ==========================================
// ADMIN DATABASE RESTORE
// Safe MERGE restore. Does not delete documents.
// ==========================================

app.post('/api/admin/restore', adminAuth, async (req, res) => {
  try {
    const backup = req.body;

    if (
      !backup ||
      backup.app !== 'EarnWallet' ||
      backup.formatVersion !== 1 ||
      !backup.collections ||
      typeof backup.collections !== 'object' ||
      Array.isArray(backup.collections)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid EarnWallet backup file.'
      });
    }

    const db = getDb();

    let batch = db.batch();
    let batchCount = 0;
    let restored = 0;

    for (const name of Object.keys(backup.collections)) {
      if (!BACKUP_COLLECTIONS.includes(name)) continue;

      const docs = backup.collections[name];

      if (
        !docs ||
        typeof docs !== 'object' ||
        Array.isArray(docs)
      ) {
        continue;
      }

      for (const [id, data] of Object.entries(docs)) {
        if (
          !id ||
          id.length > 500 ||
          id.includes('/') ||
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data)
        ) {
          continue;
        }

        restored++;

        if (restored > 5000) {
          throw new Error('RESTORE_LIMIT_EXCEEDED');
        }

        batch.set(
          db.collection(name).doc(id),
          data,
          { merge: true }
        );

        batchCount++;

        if (batchCount >= 400) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    if (batchCount) {
      await batch.commit();
    }

    res.json({
      success: true,
      message: 'Backup restored using safe merge.',
      data: {
        restoredDocuments: restored,
        deletedDocuments: 0
      }
    });
  } catch (error) {
    if (error.message === 'RESTORE_LIMIT_EXCEEDED') {
      return res.status(413).json({
        success: false,
        error: 'Restore is limited to 5000 documents.'
      });
    }

    sendError(res, error, 'Could not restore backup.');
  }
});

// ==========================================
// FRONTEND SERVING
// ==========================================

app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.use(express.static(PUBLIC_DIR));

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(`EarnWallet server running on port ${PORT}`);
  console.log(`Frontend directory: ${PUBLIC_DIR}`);

  configureTelegramWebhook();
});
