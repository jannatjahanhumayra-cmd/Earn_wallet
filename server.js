const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Serve static files from 'public' folder
app.use(express.static('public'));

// Initialize Firebase Admin SDK
try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    let rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    serviceAccount = JSON.parse(rawEnv);
  } else {
    serviceAccount = require('./serviceAccountKey.json');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin Initialized Successfully');
} catch (error) {
  console.error('⚠️ Firebase Initialization Error:', error.message);
}

// Basic Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running smoothly!' });
});

// Admin Stats API Example
app.get('/api/admin/stats', async (req, res) => {
  try {
    res.json({
      success: true,
      stats: {
        totalUsers: 0,
        totalEarnings: 0.00,
        totalWithdrawals: 0.00,
        pendingWithdrawals: 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
