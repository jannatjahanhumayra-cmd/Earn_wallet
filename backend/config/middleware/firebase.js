const admin = require('firebase-admin');

let db = null;
let auth = null;

function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const credentialsJson = process.env.FIREBASE_CREDENTIALS;

  if (!credentialsJson) {
    console.warn('FIREBASE_CREDENTIALS missing. Skipping Firebase init.');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(credentialsJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    db = admin.firestore();
    auth = admin.auth();
    console.log('Firebase Admin initialized successfully.');
    return admin.app();
  } catch (error) {
    console.error('Firebase initialization error:', error.message);
    return null;
  }
}

function getDb() {
  if (!db) throw new Error('Firebase not initialized.');
  return db;
}

function getAuth() {
  if (!auth) throw new Error('Firebase not initialized.');
  return auth;
}

module.exports = { initializeFirebase, getDb, getAuth };
