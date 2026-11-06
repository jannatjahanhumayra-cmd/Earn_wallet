require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initializeFirebase, getDb } = require('./config/firebase');
const telegramAuth = require('./middleware/telegramAuth');

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Firebase
initializeFirebase();

app.use(cors());
app.use(express.json());

// ===== API ROUTES =====

// Root endpoint
app.get('/', (req, res) => {
  res.json({ name: 'Watch & Earn API', status: 'running' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 1. Telegram Authentication Route
app.post('/api/auth', telegramAuth, async (req, res) => {
  try {
    const db = getDb();
    const tgUser = req.telegramUser; // telegramAuth middleware থেকে আসছে

    const userRef = db.collection('users').doc(tgUser.id.toString());
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // নতুন ইউজার তৈরি
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
      // পুরানো ইউজার, last login আপডেট
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
