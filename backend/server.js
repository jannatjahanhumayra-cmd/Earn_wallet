require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const { initializeFirebase, getDb } = require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 10000;

initializeFirebase();
app.use(cors());
app.use(express.json());

// ===== TELEGRAM AUTH MIDDLEWARE =====
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
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computedHash !== hash) return null;
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > 3600) return null;
  const userJson = params.get('user');
  if (!userJson) return null;
  try { return JSON.parse(userJson); } catch { return null; }
}

async function telegramAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [authType, initData] = authHeader.split(' ');
    if (authType !== 'tma' || !initData) return res.status(401).json({ error: 'Missing Auth header' });
    const user = verifyInitData(initData);
    if (!user || !user.id) return res.status(401).json({ error: 'Invalid InitData' });
    req.telegramUser = { id: user.id, username: user.username || null, firstName: user.first_name || null, lastName: user.last_name || null };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Auth failed' });
  }
}

// ===== ADMIN SECURITY MIDDLEWARE =====
async function adminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [authType, initData] = authHeader.split(' ');
    if (authType !== 'tma' || !initData) return res.status(401).json({ error: 'Missing Auth header' });
    const user = verifyInitData(initData);
    
    // চেক করা হচ্ছে এটি অ্যাডমিন কি না
    if (!user || user.id.toString() !== process.env.ADMIN_TELEGRAM_ID) {
      return res.status(403).json({ error: 'Access Denied. You are not the Admin.' });
    }
    req.adminUser = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Auth failed' });
  }
}

// ===== USER API =====
app.post('/api/auth', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const tgUser = req.telegramUser;
    const userRef = db.collection('users').doc(tgUser.id.toString());
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      const newUser = {
        telegramId: tgUser.id.toString(), username: tgUser.username, firstName: tgUser.firstName,
        lastName: tgUser.lastName, balance: 0, totalEarnings: 0, todayEarnings: 0,
        referralsCount: 0, completedTasks: 0, pendingTasks: 0, withdrawnAmount: 0,
        createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(), status: 'active'
      };
      await userRef.set(newUser);
      return res.json({ success: true, message: 'User created', data: newUser });
    } else {
      await userRef.update({ lastLogin: new Date().toISOString() });
      return res.json({ success: true, message: 'Login successful', data: (await userRef.get()).data() });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ===== ADMIN API (Real Data) =====
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const usersSnapshot = await db.collection('users').get();
    const users = [];
    usersSnapshot.forEach(doc => {
      users.push(doc.data());
    });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/ban', adminAuth, async (req, res) => {
  try {
    const { telegramId, status } = req.body;
    const db = getDb();
    await db.collection('users').doc(telegramId).update({ status: status });
    res.json({ success: true, message: `User status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== ADMIN ROUTE =====
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ===== FRONTEND SERVING =====
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
