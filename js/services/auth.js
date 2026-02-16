// Firebase Authentication & User Profile Service
// Handles login, registration, logout, and Firestore user data.

import { FIREBASE_CONFIG, ADMIN_EMAIL } from './firebase-config.js';

let auth = null;
let db = null;
let currentProfile = null;
let firebaseReady = false;

// ===== Initialization =====

export function initFirebase() {
  if (!window.firebase) {
    console.error('[Auth] Firebase SDK not loaded. Add script tags to index.html.');
    return false;
  }

  if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    console.warn('[Auth] Firebase not configured yet. Update js/services/firebase-config.js');
    return false;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }

  auth = firebase.auth();
  db = firebase.firestore();
  firebaseReady = true;
  return true;
}

export function isFirebaseReady() {
  return firebaseReady;
}

// ===== Auth State =====

export function onAuthChanged(callback) {
  if (!auth) return () => {};
  return auth.onAuthStateChanged(callback);
}

export function getCurrentUser() {
  return auth?.currentUser || null;
}

// ===== Registration =====

export async function register(email, password, displayName) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await cred.user.updateProfile({ displayName });

  const role = email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim()
    ? 'admin' : 'member';

  await db.collection('users').doc(cred.user.uid).set({
    displayName,
    email: email.toLowerCase().trim(),
    role,
    team: null,
    scoringHistory: {},
    boosts: {},
    transfers: [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastActive: firebase.firestore.FieldValue.serverTimestamp(),
  });

  currentProfile = { displayName, email: email.toLowerCase().trim(), role };
  return cred.user;
}

// ===== Login =====

export async function login(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);

  try {
    await db.collection('users').doc(cred.user.uid).update({
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    // Profile may not exist if created before Firestore was set up
  }

  currentProfile = await getUserProfile(cred.user.uid);
  return cred.user;
}

// ===== Logout =====

export async function logout() {
  currentProfile = null;
  await auth.signOut();
}

// ===== User Profiles =====

export async function getUserProfile(uid) {
  if (!db) return null;
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function loadCurrentProfile() {
  const user = getCurrentUser();
  if (!user) return null;
  currentProfile = await getUserProfile(user.uid);
  return currentProfile;
}

export function getCachedProfile() {
  return currentProfile;
}

export function isAdmin() {
  if (!currentProfile) return false;
  return currentProfile.role === 'admin';
}

// ===== Cloud Storage =====

export async function saveTeamToCloud(data) {
  const user = getCurrentUser();
  if (!user || !db) return;

  const update = { lastActive: firebase.firestore.FieldValue.serverTimestamp() };
  if (data.team !== undefined) update.team = data.team;
  if (data.scoringHistory !== undefined) update.scoringHistory = data.scoringHistory;
  if (data.boosts !== undefined) update.boosts = data.boosts;
  if (data.transfers !== undefined) update.transfers = data.transfers;

  await db.collection('users').doc(user.uid).update(update);
}

export async function loadTeamFromCloud() {
  const user = getCurrentUser();
  if (!user || !db) return null;

  const doc = await db.collection('users').doc(user.uid).get();
  if (!doc.exists) return null;

  const d = doc.data();
  return {
    team: d.team || null,
    scoringHistory: d.scoringHistory || {},
    boosts: d.boosts || {},
    transfers: d.transfers || [],
  };
}

// ===== League / Leaderboard =====

export async function getAllUsers() {
  if (!db) return [];
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ===== Admin Functions =====

export async function updateUserRole(uid, role) {
  if (!db) return;
  await db.collection('users').doc(uid).update({ role });
}

export async function removeUser(uid) {
  if (!db) return;
  await db.collection('users').doc(uid).delete();
}

// ===== Announcements =====

export async function postAnnouncement(text) {
  const user = getCurrentUser();
  if (!user || !db) return;

  await db.collection('announcements').add({
    text,
    author: currentProfile?.displayName || user.email,
    authorUid: user.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export async function getAnnouncements(limit = 20) {
  if (!db) return [];
  const snapshot = await db.collection('announcements')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function deleteAnnouncement(id) {
  if (!db) return;
  await db.collection('announcements').doc(id).delete();
}
