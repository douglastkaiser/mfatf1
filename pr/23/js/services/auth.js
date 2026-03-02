// Firebase Authentication & User Profile Service
// Uses the modular Firebase v12.9.0 SDK loaded directly from CDN.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

import { FIREBASE_CONFIG, ADMIN_EMAIL } from './firebase-config.js';

let app = null;
let auth = null;
let db = null;
let currentProfile = null;
let firebaseReady = false;

// ===== Initialization =====

export function initFirebase() {
  if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    console.warn('[Auth] Firebase not configured yet. Update js/services/firebase-config.js');
    return false;
  }

  try {
    app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
    firebaseReady = true;
    return true;
  } catch (err) {
    console.error('[Auth] Firebase initialization failed:', err);
    return false;
  }
}

export function isFirebaseReady() {
  return firebaseReady;
}

export function getDb() {
  return db;
}

// ===== Auth State =====

export function onAuthChanged(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth?.currentUser || null;
}

// ===== Registration (Email/Password) =====

export async function register(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });

  const role = email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim()
    ? 'admin' : 'member';

  await setDoc(doc(db, 'users', cred.user.uid), {
    displayName,
    email: email.toLowerCase().trim(),
    role,
    team: null,
    scoringHistory: {},
    boosts: {},
    transfers: [],
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp(),
  });

  currentProfile = { displayName, email: email.toLowerCase().trim(), role };
  return cred.user;
}

// ===== Login (Email/Password) =====

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);

  try {
    await updateDoc(doc(db, 'users', cred.user.uid), {
      lastActive: serverTimestamp(),
    });
  } catch {
    // Profile may not exist yet
  }

  currentProfile = await getUserProfile(cred.user.uid);
  return cred.user;
}

// ===== Google Sign-In =====

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;

  // Check if user profile already exists in Firestore
  const profileDoc = await getDoc(doc(db, 'users', user.uid));

  if (!profileDoc.exists()) {
    // First time Google sign-in -- create profile
    const email = (user.email || '').toLowerCase().trim();
    const role = email === ADMIN_EMAIL.toLowerCase().trim() ? 'admin' : 'member';

    await setDoc(doc(db, 'users', user.uid), {
      displayName: user.displayName || email.split('@')[0],
      email,
      role,
      team: null,
      scoringHistory: {},
      boosts: {},
      transfers: [],
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    });

    currentProfile = { displayName: user.displayName, email, role };
  } else {
    await updateDoc(doc(db, 'users', user.uid), {
      lastActive: serverTimestamp(),
    });
    currentProfile = { id: profileDoc.id, ...profileDoc.data() };
  }

  return user;
}

// ===== Logout =====

export async function logout() {
  currentProfile = null;
  await signOut(auth);
}

// ===== User Profiles =====

export async function getUserProfile(uid) {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
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

  const update = { lastActive: serverTimestamp() };
  if (data.team !== undefined) update.team = data.team;
  if (data.scoringHistory !== undefined) update.scoringHistory = data.scoringHistory;
  if (data.boosts !== undefined) update.boosts = data.boosts;
  if (data.transfers !== undefined) update.transfers = data.transfers;

  await updateDoc(doc(db, 'users', user.uid), update);
}

export async function loadTeamFromCloud() {
  const user = getCurrentUser();
  if (!user || !db) return null;

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) return null;

  const d = snap.data();
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
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ===== Admin Functions =====

export async function updateUserRole(uid, role) {
  if (!db) return;
  await updateDoc(doc(db, 'users', uid), { role });
}

export async function removeUser(uid) {
  if (!db) return;
  await deleteDoc(doc(db, 'users', uid));
}

// ===== Announcements =====

export async function postAnnouncement(text) {
  const user = getCurrentUser();
  if (!user || !db) return;

  await addDoc(collection(db, 'announcements'), {
    text,
    author: currentProfile?.displayName || user.email,
    authorUid: user.uid,
    createdAt: serverTimestamp(),
  });
}

export async function getAnnouncements(maxResults = 20) {
  if (!db) return [];
  const q = query(
    collection(db, 'announcements'),
    orderBy('createdAt', 'desc'),
    firestoreLimit(maxResults),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteAnnouncement(id) {
  if (!db) return;
  await deleteDoc(doc(db, 'announcements', id));
}

// ===== Account Management =====

export async function updateDisplayName(newName) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not signed in');

  // Update Firebase Auth profile
  await updateProfile(user, { displayName: newName });

  // Update Firestore document
  if (db) {
    await updateDoc(doc(db, 'users', user.uid), { displayName: newName });
  }

  // Update cached profile
  if (currentProfile) {
    currentProfile.displayName = newName;
  }
}

export async function changeUserPassword(newPassword) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not signed in');

  await updatePassword(user, newPassword);
}

// ===== H2H Schedule =====

export async function saveH2HSchedule(scheduleArray) {
  if (!db) throw new Error('Firestore not initialized');
  await setDoc(doc(db, 'h2h', '2026'), {
    season: '2026',
    generatedAt: serverTimestamp(),
    generatedBy: getCurrentUser()?.uid || 'unknown',
    schedule: scheduleArray,
  });
}

export async function loadH2HSchedule() {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'h2h', '2026'));
  if (!snap.exists()) return null;
  return snap.data();
}
