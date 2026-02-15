// Local Storage Persistence Layer
// Saves and loads fantasy team state, scoring history, and app preferences.

const STORAGE_PREFIX = 'f1fantasy_';

const KEYS = {
  TEAM: `${STORAGE_PREFIX}team`,
  SCORING_HISTORY: `${STORAGE_PREFIX}scoring_history`,
  BOOSTS: `${STORAGE_PREFIX}boosts`,
  TRANSFERS: `${STORAGE_PREFIX}transfers`,
  LAST_SYNC: `${STORAGE_PREFIX}last_sync`,
  CACHED_RESULTS: `${STORAGE_PREFIX}cached_results`,
  PREFERENCES: `${STORAGE_PREFIX}preferences`,
};

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
  return read(KEYS.TEAM) || {
    drivers: [null, null, null, null, null],
    constructor: null,
    budget: 100.0,
    freeTransfers: 2,
    transfersMade: 0,
  };
}

export function saveTeam(team) {
  write(KEYS.TEAM, team);
}

// ===== Scoring History =====
// Stores per-race fantasy points for each driver on the user's team.
// Shape: { [raceRound]: { driverScores: { [driverId]: points }, constructorScore: points, total: points } }

export function loadScoringHistory() {
  return read(KEYS.SCORING_HISTORY) || {};
}

export function saveScoringHistory(history) {
  write(KEYS.SCORING_HISTORY, history);
}

export function appendRaceScore(round, scoreData) {
  const history = loadScoringHistory();
  history[round] = scoreData;
  saveScoringHistory(history);
  return history;
}

// ===== Boosts =====

export function loadBoosts() {
  return read(KEYS.BOOSTS) || {
    drs: { used: false, target: null },
    mega: { used: false, target: null },
    'extra-drs': { used: false, target: null },
    limitless: { used: false },
  };
}

export function saveBoosts(boosts) {
  write(KEYS.BOOSTS, boosts);
}

// ===== Transfers =====

export function loadTransferLog() {
  return read(KEYS.TRANSFERS) || [];
}

export function saveTransferLog(log) {
  write(KEYS.TRANSFERS, log);
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

// ===== Utility =====

export function clearAllData() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}
