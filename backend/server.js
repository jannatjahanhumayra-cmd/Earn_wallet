require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initializeFirebase } = require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Firebase on startup
initializeFirebase();

// Middleware
app.use(cors());
app.use(express.json());

// ===== Serve static frontend files =====
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ===== Health check (for Render) =====
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ===== Root: serve frontend index.html =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ===== Admin panel =====
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html'));
});

// ===== 404 handler (only for /api routes and unknown) =====
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ===== Error handler =====
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
