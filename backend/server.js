require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initializeFirebase } = require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Firebase
initializeFirebase();

app.use(cors());
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Watch & Earn API',
    status: 'running',
    message: 'User panel coming in Phase 3',
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
