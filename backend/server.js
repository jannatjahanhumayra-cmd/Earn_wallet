require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto'); // Telegram Auth এর জন্য
const { initializeFirebase, getDb } = require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Firebase
initializeFirebase();

app.use(cors());
app.use(express.json());

// ===== TELEGRAM AUTH MIDDLEWARE (এখানেই যুক্ত করা হলো) =====
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function verifyInitData(initData) {
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
    .update(BOT_TOKEN)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) return null;

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 3600) return null;

  const userJson = params.get('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

async function telegramAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [authType, initData] = authHeader.split(' ');

    if (authType !== 'tma' || !initData) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const user = verifyInitData(initData);
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Invalid or expired InitData' });
    }

    req.telegramUser = {
      id: user.id,
      username: user.username || null,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
    };

    next();
  } catch (error) {
    console.error('Telegram auth error:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// ===== API ROUTES =====

app.get('/', (req, res) => {
  res.json({ name: 'Watch & Earn API', status: 'running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 1. Telegram Authentication Route
app.post('/api/auth', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const tgUser = req.telegramUser;

    const userRef = db.collection('users').doc(tgUser.id.toString());
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      const newUser = {
        telegramId: tgUser.id.toString(),
        username: tgUser.username || null,
        firstName: tgUser.firstName || null,
        lastName: tgUser.lastName || null,
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
      return res.json({ success: true, message: 'User created', data: newUser });
    } else {
      await userRef.update({ lastLogin: new Date().toISOString() });
      const updatedUser = (await userRef.get()).data();
      return res.json({ success: true, message: 'Login successful', data: updatedUser });
    }
  } catch (error) {
    console.error('Auth Error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ===== FRONTEND SERVING =====
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
