// End-to-End Encryption Service
// Uses the browser's built-in Web Crypto API (no external libraries).
//
// Design:
//   - Each user has an RSA-OAEP 2048-bit key pair (generated once per device).
//   - Public keys are stored in Firestore (users/{uid}.chatPublicKey).
//   - Private keys are stored ONLY in IndexedDB on this device — never sent anywhere.
//   - Each chat has a unique AES-256-GCM key, encrypted with every participant's
//     RSA public key. The server stores only ciphertext — even an admin with full
//     Firestore access cannot read messages without a participant's private key.
//
// Persistence:
//   - IndexedDB survives clearing cookies AND localStorage.
//   - It is only wiped if the user explicitly clears "All site data" in browser settings.

const IDB_NAME = 'f1fantasy_e2e_v1';
const IDB_VERSION = 1;
const IDB_STORE = 'keys';

let _db = null;

// ===== IndexedDB Helpers =====

async function _openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function _idbGet(key) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function _idbPut(key, value) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ===== RSA-OAEP Key Pair =====

async function _generateRSAKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,             // extractable (needed to serialise into IndexedDB)
    ['encrypt', 'decrypt'],
  );
}

/**
 * Export a CryptoKey (RSA public, spki format) to a base64 string.
 * This base64 string is safe to store in Firestore.
 */
export async function exportPublicKey(publicKey) {
  const buf = await crypto.subtle.exportKey('spki', publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

/**
 * Import an RSA public key from the base64 string stored in Firestore.
 * Returns a CryptoKey that can only encrypt.
 */
export async function importPublicKey(b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'spki',
    bytes.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
}

/**
 * Get (or generate) the RSA key pair for `uid`.
 * Stored as JWK in IndexedDB — survives browser cache & cookie clears.
 *
 * @param {string} uid - Firebase Auth UID
 * @returns {{ publicKey: CryptoKey, privateKey: CryptoKey }}
 */
export async function getUserKeyPair(uid) {
  const stored = await _idbGet(`rsa_${uid}`);
  if (stored) {
    const [privateKey, publicKey] = await Promise.all([
      crypto.subtle.importKey(
        'jwk', stored.privateJwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true, ['decrypt'],
      ),
      crypto.subtle.importKey(
        'jwk', stored.publicJwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true, ['encrypt'],
      ),
    ]);
    return { publicKey, privateKey };
  }

  // First time — generate and persist
  const pair = await _generateRSAKeyPair();
  const [privateJwk, publicJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.privateKey),
    crypto.subtle.exportKey('jwk', pair.publicKey),
  ]);
  await _idbPut(`rsa_${uid}`, { privateJwk, publicJwk });
  return pair;
}

// ===== AES-256-GCM Chat Key =====

/** Generate a new random AES-256-GCM key for a chat session. */
export async function generateChatKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt an AES chat key with a recipient's RSA public key.
 * Result is a base64 string safe for Firestore storage.
 */
export async function encryptChatKey(aesKey, rsaPublicKey) {
  const rawAes = await crypto.subtle.exportKey('raw', aesKey);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    rsaPublicKey,
    rawAes,
  );
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

/**
 * Decrypt an AES chat key (base64) using the user's RSA private key.
 * Returns a CryptoKey ready for message decryption.
 */
export async function decryptChatKey(encryptedB64, rsaPrivateKey) {
  const bytes = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const rawAes = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    rsaPrivateKey,
    bytes.buffer,
  );
  return crypto.subtle.importKey(
    'raw', rawAes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ===== Message Encryption / Decryption =====

/**
 * Encrypt a plaintext string with an AES-GCM key.
 * A fresh random IV is generated for every message.
 *
 * @returns {{ ciphertext: string, iv: string }} — both base64-encoded
 */
export async function encryptMessage(plaintext, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded,
  );
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

/**
 * Decrypt a message stored in Firestore.
 *
 * @param {string} ciphertextB64 - base64-encoded ciphertext
 * @param {string} ivB64         - base64-encoded IV
 * @param {CryptoKey} aesKey
 * @returns {string} plaintext
 */
export async function decryptMessage(ciphertextB64, ivB64, aesKey) {
  const cipherBytes = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    cipherBytes.buffer,
  );
  return new TextDecoder().decode(decrypted);
}
