// Local Storage Persistence Layer
// Saves and loads fantasy team state, scoring history, and app preferences.
// Cloud sync via Firestore is layered on top -- localStorage acts as local cache.

import { saveTeamToCloud, isFirebaseReady } from './auth.js';

const STORAGE_PREFIX = 'f1fantasy_';

const KEYS = {
  TEAM: `${STORAGE_PREFIX}team`,
  SCORING_HISTORY: `${STORAGE_PREFIX}scoring_history`,
  BOOSTS: `${STORAGE_PREFIX}boosts`,
  TRANSFERS: `${STORAGE_PREFIX}transfers`,
  LAST_SYNC: `${STORAGE_PREFIX}last_sync`,
  CACHED_RESULTS: `${STORAGE_PREFIX}cached_results`,
  PREFERENCES: `${STORAGE_PREFIX}preferences`,
  GUEST_PROFILE: `${STORAGE_PREFIX}guest_profile`,
  TEST_RESULTS: `${STORAGE_PREFIX}test_results`,
};

// ===== Cloud Sync (debounced) =====

let syncTimer = null;

function scheduleCloudSync() {
  if (!isFirebaseReady()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const data = {
      team: read(KEYS.TEAM),
      scoringHistory: read(KEYS.SCORING_HISTORY) || {},
      boosts: read(KEYS.BOOSTS) || {},
      transfers: read(KEYS.TRANSFERS) || [],
    };
    saveTeamToCloud(data).catch(err => {
      console.warn('[Storage] Cloud sync failed:', err.message);
    });
  }, 1500);
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('[Storage] Write failed:', err);
  }
}

// ===== Team =====

export function loadTeam() {
  const stored = read(KEYS.TEAM);
  if (stored) {
    // Migrate old single-constructor format
    if (!Array.isArray(stored.constructors)) {
      stored.constructors = stored.constructor
        ? [stored.constructor, null]
        : [null, null];
      delete stored.constructor;
    }
    return stored;
  }
  return {
    drivers: [null, null, null, null, null],
    constructors: [null, null],
    budget: 100.0,
    freeTransfers: 2,
    transfersMade: 0,
  };
}

export function saveTeam(team) {
  write(KEYS.TEAM, team);
  scheduleCloudSync();
}

// ===== Scoring History =====
// Stores per-race fantasy points for each driver on the user's team.
// Shape: { [raceRound]: { driverScores: { [driverId]: points }, constructorScore: points, total: points } }

export function loadScoringHistory() {
  return read(KEYS.SCORING_HISTORY) || {};
}

export function saveScoringHistory(history) {
  write(KEYS.SCORING_HISTORY, history);
  scheduleCloudSync();
}

export function appendRaceScore(round, scoreData) {
  const history = loadScoringHistory();
  history[round] = scoreData;
  saveScoringHistory(history);
  return history;
}

// ===== Boosts =====

export function loadBoosts() {
  const stored = read(KEYS.BOOSTS);
  const defaults = {
    drs: { used: false, target: null, active: false },
    mega: { used: false, target: null, active: false },
    'extra-drs': { used: false, target: null, active: false },
    limitless: { used: false, active: false },
    wildcard: { used: false, active: false },
    'no-negative': { used: false, active: false },
  };
  if (!stored) return defaults;
  // Merge in any new boost types that don't exist yet
  for (const key of Object.keys(defaults)) {
    if (!stored[key]) stored[key] = defaults[key];
  }
  return stored;
}

export function saveBoosts(boosts) {
  write(KEYS.BOOSTS, boosts);
  scheduleCloudSync();
}

// ===== Transfers =====

export function loadTransferLog() {
  return read(KEYS.TRANSFERS) || [];
}

export function saveTransferLog(log) {
  write(KEYS.TRANSFERS, log);
  scheduleCloudSync();
}

// ===== Cached Results =====
// Store the last fetched race results so we don't need network on every load.

export function loadCachedResults() {
  return read(KEYS.CACHED_RESULTS) || {
    raceResults: [],
    qualifying: [],
    sprintResults: [],
    driverStandings: [],
    constructorStandings: [],
    schedule: [],
  };
}

export function saveCachedResults(results) {
  write(KEYS.CACHED_RESULTS, results);
}

// ===== Last Sync =====

export function loadLastSync() {
  return read(KEYS.LAST_SYNC) || null;
}

export function saveLastSync() {
  write(KEYS.LAST_SYNC, new Date().toISOString());
}

// ===== Preferences =====

export function loadPreferences() {
  return read(KEYS.PREFERENCES) || {};
}

export function savePreferences(prefs) {
  write(KEYS.PREFERENCES, prefs);
}

// ===== Test Results (sim mode) =====

export function loadTestResults() {
  return read(KEYS.TEST_RESULTS) || {};
}

export function saveTestResults(results) {
  write(KEYS.TEST_RESULTS, results);
}

export function clearTestResults() {
  localStorage.removeItem(KEYS.TEST_RESULTS);
}

// ===== Utility =====

export function clearAllData() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}

// ===== Guest Profile =====

export function loadGuestProfile() {
  return read(KEYS.GUEST_PROFILE) || {
    displayName: 'Guest',
    teamName: '',
    createdAt: new Date().toISOString(),
  };
}

export function saveGuestProfile(profile) {
  write(KEYS.GUEST_PROFILE, profile);
}

// ===== Cloud Hydration =====
// Called on login to populate localStorage from Firestore data.

export function hydrateFromCloud(cloudData) {
  if (!cloudData) return;
  if (cloudData.team) write(KEYS.TEAM, cloudData.team);
  if (cloudData.scoringHistory) write(KEYS.SCORING_HISTORY, cloudData.scoringHistory);
  if (cloudData.boosts) write(KEYS.BOOSTS, cloudData.boosts);
  if (cloudData.transfers) write(KEYS.TRANSFERS, cloudData.transfers);
}
