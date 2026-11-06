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

// ===== TELEGRAM VERIFY FUNCTION =====
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function verifyInitData(initData) {
  if (!initData) return null;
  try {
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
    return JSON.parse(userJson);
  } catch (e) { return null; }
}

// ===== AUTH MIDDLEWARES =====
async function telegramAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const initData = authHeader.replace('tma ', '');
  const user = verifyInitData(initData);
  if (!user || !user.id) return res.status(401).json({ error: 'Invalid InitData' });
  req.telegramUser = { id: user.id, username: user.username || null, firstName: user.first_name || null, lastName: user.last_name || null };
  next();
}

async function adminAuth(req, res, next) {
  try {
    let authHeader = req.headers.authorization || '';
    let initData = authHeader.replace('tma ', '');
    if (!initData && req.query.initData) initData = req.query.initData;

    if (!initData) return res.status(401).json({ error: 'Missing Auth header' });

    const user = verifyInitData(initData);
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
      return res.json({ success: true, data: newUser });
    } else {
      await userRef.update({ lastLogin: new Date().toISOString() });
      return res.json({ success: true, data: (await userRef.get()).data() });
    }
  } catch (error) { res.status(500).json({ success: false, error: 'Server error' }); }
});

// ===== ADMIN APIS =====

// 1. Get Dashboard Stats
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const usersSnapshot = await db.collection('users').get();
    let totalUsers = 0, activeUsers = 0, totalBalance = 0;
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      totalUsers++;
      if (data.status === 'active') activeUsers++;
      totalBalance += (data.balance || 0);
    });
    const withdrawSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
    res.json({ success: true, data: { totalUsers, activeUsers, totalBalance, pendingWithdraws: withdrawSnapshot.size } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 2. Get Users
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const snapshot = await getDb().collection('users').get();
    const users = []; snapshot.forEach(doc => users.push(doc.data()));
    res.json({ success: true, data: users });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 3. Ban/Unban User
app.post('/api/admin/ban', adminAuth, async (req, res) => {
  try {
    const { telegramId, status } = req.body;
    await getDb().collection('users').doc(telegramId).update({ status });
    res.json({ success: true, message: `User status updated to ${status}` });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 4. Ads Management
app.get('/api/admin/ads', adminAuth, async (req, res) => {
  try {
    const snapshot = await getDb().collection('advertisements').get();
    const ads = []; snapshot.forEach(doc => ads.push(doc.data()));
    res.json({ success: true, data: ads });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/admin/ads', adminAuth, async (req, res) => {
  try {
    const { title, url, reward, duration } = req.body;
    const adRef = getDb().collection('advertisements').doc();
    await adRef.set({ id: adRef.id, title, url, reward: Number(reward), duration: Number(duration), status: 'active', createdAt: new Date().toISOString() });
    res.json({ success: true, message: 'Ad created successfully' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/admin/ads/:id', adminAuth, async (req, res) => {
  try {
    await getDb().collection('advertisements').doc(req.params.id).delete();
    res.json({ success: true, message: 'Ad deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 5. Tasks Management
app.get('/api/admin/tasks', adminAuth, async (req, res) => {
  try {
    const snapshot = await getDb().collection('tasks').get();
    const tasks = []; snapshot.forEach(doc => tasks.push(doc.data()));
    res.json({ success: true, data: tasks });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/admin/tasks', adminAuth, async (req, res) => {
  try {
    const { title, url, reward, requiresProof } = req.body;
    const taskRef = getDb().collection('tasks').doc();
    await taskRef.set({ id: taskRef.id, title, url, reward: Number(reward), requiresProof, status: 'active', createdAt: new Date().toISOString() });
    res.json({ success: true, message: 'Task created successfully' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/admin/tasks/:id', adminAuth, async (req, res) => {
  try {
    await getDb().collection('tasks').doc(req.params.id).delete();
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 6. Withdrawal Management
app.get('/api/admin/withdrawals', adminAuth, async (req, res) => {
  try {
    const snapshot = await getDb().collection('withdrawals').orderBy('createdAt', 'desc').get();
    const withdrawals = []; snapshot.forEach(doc => withdrawals.push(doc.data()));
    res.json({ success: true, data: withdrawals });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/admin/withdrawals/:id', adminAuth, async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    const wRef = getDb().collection('withdrawals').doc(req.params.id);
    await wRef.update({ status, updatedAt: new Date().toISOString() });
    res.json({ success: true, message: `Withdrawal ${status}` });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ===== ROUTES =====
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
