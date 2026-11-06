require('dotenv').config();
const express = require('express');
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

// ===== API ROUTES =====
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

// ===== FRONTEND HTML (এখানেই বসানো হলো) =====
app.get('*', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="bn">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Watch & Earn</title>
      <script src="https://telegram.org/js/telegram-web-app.js"></script>
      <style>
        body { font-family: sans-serif; background: #0a0e27; color: white; text-align: center; padding: 50px 20px; }
        .card { background: #1a1f3d; padding: 20px; border-radius: 15px; margin-top: 20px; }
        h1 { color: #ff6600; }
      </style>
    </head>
    <body>
      <h1 id="greeting">Loading...</h1>
      <p id="status">Connecting to Telegram...</p>
      <div class="card">
        <h3>Your Balance</h3>
        <h2 id="balance" style="color: #4ade80;">৳ 0</h2>
      </div>

      <script>
        const tg = window.Telegram.WebApp;
        tg.expand();
        
        const greetingEl = document.getElementById('greeting');
        const statusEl = document.getElementById('status');
        const balanceEl = document.getElementById('balance');

        async function authenticate() {
          if (!tg.initData) {
            greetingEl.innerText = "Hello, Guest";
            statusEl.innerText = "⚠️ Open inside Telegram App";
            return;
          }
          try {
            const res = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Authorization': 'tma ' + tg.initData, 'Content-Type': 'application/json' }
            });
            const result = await res.json();
            if (result.success) {
              greetingEl.innerText = 'Hello, ' + (result.data.firstName || 'User') + '! 👋';
              statusEl.innerText = '✅ Logged In Successfully';
              statusEl.style.color = '#4ade80';
              balanceEl.innerText = '৳ ' + result.data.balance;
            } else {
              throw new Error(result.error);
            }
          } catch (err) {
            greetingEl.innerText = "Authentication Failed";
            statusEl.innerText = "Error: " + err.message;
            statusEl.style.color = "#ef4444";
          }
        }
        authenticate();
      </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => console.log('Server running on port ' + PORT));
