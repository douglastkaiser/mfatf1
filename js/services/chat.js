// Encrypted Chat Service
// Stores all messages in Firebase Firestore, fully end-to-end encrypted.
//
// Firestore structure:
//   chats/{chatId}
//     participants:    string[]          — list of UIDs
//     encryptedKeys:  { [uid]: string } — per-user RSA-wrapped AES key (base64)
//     createdBy:      string
//     createdAt:      Timestamp
//     name:           string | null
//     lastMessageAt:  Timestamp
//
//   chats/{chatId}/messages/{msgId}
//     sender:           string   — UID
//     senderName:       string   — display name at time of send
//     encryptedContent: string   — base64 AES-GCM ciphertext
//     iv:               string   — base64 AES-GCM IV
//     timestamp:        Timestamp
//
// Privacy guarantee:
//   The AES key for each chat is encrypted with every participant's RSA public key
//   using RSA-OAEP 2048-bit. Even someone with direct read access to Firestore
//   cannot decrypt messages without also possessing a participant's private key,
//   which is stored only in that user's browser IndexedDB.

import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, onSnapshot, query, orderBy, where,
  serverTimestamp, limit as firestoreLimit,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

import { getDb, getCurrentUser, getCachedProfile } from './auth.js';
import {
  getUserKeyPair, exportPublicKey, importPublicKey,
  generateChatKey, encryptChatKey, decryptChatKey,
  encryptMessage, decryptMessage,
} from './crypto.js';

// In-memory AES key cache: chatId -> CryptoKey
// Cleared on logout so keys are never retained across sessions.
const _keyCache = new Map();

export function clearChatKeyCache() {
  _keyCache.clear();
}

// ===== Key Initialisation =====

/**
 * Generate (if needed) and publish the current user's RSA public key to Firestore.
 * Must be called once after login before any chat operations.
 */
export async function initUserChatKeys(uid) {
  const db = getDb();
  if (!db) return;

  const pair = await getUserKeyPair(uid);
  const publicKeyB64 = await exportPublicKey(pair.publicKey);

  try {
    await updateDoc(doc(db, 'users', uid), { chatPublicKey: publicKeyB64 });
  } catch {
    // Doc may not exist yet — auth flow will create it shortly
  }
}

// ===== Chat Creation =====

/**
 * Create a new encrypted chat between the current user and `participantUids`.
 *
 * @param {string[]} participantUids - UIDs of other participants (creator added automatically)
 * @param {string|null} name         - Optional name for groups of 3+
 * @returns {string} chatId
 */
export async function createChat(participantUids, name = null) {
  const db = getDb();
  const user = getCurrentUser();
  if (!db || !user) throw new Error('Not authenticated');

  const allUids = [...new Set([user.uid, ...participantUids])];

  // Fetch & import each participant's RSA public key
  const publicKeys = {};
  for (const uid of allUids) {
    const snap = await getDoc(doc(db, 'users', uid));
    const keyB64 = snap.data()?.chatPublicKey;
    if (!keyB64) throw new Error(`A selected member hasn't enabled chat yet. Ask them to open the Chat tab first.`);
    publicKeys[uid] = await importPublicKey(keyB64);
  }

  // Generate the shared AES-256-GCM key for this chat
  const chatKey = await generateChatKey();

  // Encrypt the AES key for every participant separately
  const encryptedKeys = {};
  for (const uid of allUids) {
    encryptedKeys[uid] = await encryptChatKey(chatKey, publicKeys[uid]);
  }

  const chatRef = await addDoc(collection(db, 'chats'), {
    participants: allUids,
    encryptedKeys,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    name: name || null,
    lastMessageAt: serverTimestamp(),
  });

  // Cache the key so we don't have to decrypt it again this session
  _keyCache.set(chatRef.id, chatKey);

  return chatRef.id;
}

// ===== AES Key Resolution =====

async function _getChatKey(chatId) {
  if (_keyCache.has(chatId)) return _keyCache.get(chatId);

  const db = getDb();
  const user = getCurrentUser();
  if (!db || !user) throw new Error('Not authenticated');

  const snap = await getDoc(doc(db, 'chats', chatId));
  if (!snap.exists()) throw new Error('Chat not found');

  const encryptedB64 = snap.data().encryptedKeys?.[user.uid];
  if (!encryptedB64) throw new Error('No decryption key available for this chat');

  const { privateKey } = await getUserKeyPair(user.uid);
  const aesKey = await decryptChatKey(encryptedB64, privateKey);

  _keyCache.set(chatId, aesKey);
  return aesKey;
}

// ===== Messaging =====

/**
 * Encrypt and send a message to a chat.
 */
export async function sendMessage(chatId, text) {
  const db = getDb();
  const user = getCurrentUser();
  const profile = getCachedProfile();
  if (!db || !user) throw new Error('Not authenticated');
  if (!text || !text.trim()) return;

  const aesKey = await _getChatKey(chatId);
  const { ciphertext, iv } = await encryptMessage(text.trim(), aesKey);

  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    sender: user.uid,
    senderName: profile?.displayName || user.email || 'Unknown',
    encryptedContent: ciphertext,
    iv,
    timestamp: serverTimestamp(),
  });

  await updateDoc(doc(db, 'chats', chatId), {
    lastMessageAt: serverTimestamp(),
  });
}

/**
 * Subscribe to real-time messages in a chat.
 * Each message is decrypted client-side before the callback receives it.
 *
 * @param {string}   chatId
 * @param {Function} callback - receives Array<{ id, sender, senderName, text, timestamp }>
 * @returns Unsubscribe function
 */
export function subscribeToMessages(chatId, callback) {
  const db = getDb();
  if (!db) return () => {};

  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('timestamp', 'asc'),
    firestoreLimit(300),
  );

  return onSnapshot(q, async (snapshot) => {
    try {
      const aesKey = await _getChatKey(chatId);
      const messages = [];

      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        let text = '[Unable to decrypt]';
        try {
          text = await decryptMessage(d.encryptedContent, d.iv, aesKey);
        } catch {
          // Decryption failure — key mismatch or corrupted data
        }
        messages.push({
          id: docSnap.id,
          sender: d.sender,
          senderName: d.senderName,
          text,
          timestamp: d.timestamp?.toDate?.() || null,
        });
      }

      callback(messages);
    } catch (err) {
      console.error('[Chat] Message subscription error:', err);
      callback([]);
    }
  });
}

/**
 * Subscribe to the current user's full chat list, ordered by most recent message.
 * @returns Unsubscribe function
 */
export function subscribeToUserChats(callback) {
  const db = getDb();
  const user = getCurrentUser();
  if (!db || !user) return () => {};

  const q = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', user.uid),
    orderBy('lastMessageAt', 'desc'),
  );

  return onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(chats);
  });
}

/**
 * Return all league members (other than the current user) who have already
 * published a chat public key — i.e. they've opened the Chat tab at least once.
 */
export async function getChatEligibleUsers() {
  const db = getDb();
  const user = getCurrentUser();
  if (!db || !user) return [];

  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.id !== user.uid && u.chatPublicKey);
}
