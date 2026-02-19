// Jolpica F1 API Service
// Fetches live race data, standings, schedules, and results from the
// Jolpica API (drop-in Ergast replacement).

import { API } from '../config.js';
import { emit, HookEvents } from './hooks.js';

const cache = new Map();

function cacheKey(endpoint) {
  return endpoint;
}

function isCacheValid(key) {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < API.CACHE_TTL_MS;
}

/**
 * Core fetch wrapper with caching, error handling, and hook emissions.
 */
async function apiFetch(endpoint) {
  const key = cacheKey(endpoint);

  if (isCacheValid(key)) {
    return cache.get(key).data;
  }

  const url = `${API.BASE_URL}/${endpoint}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API ${response.status}: ${response.statusText}`);
    }
    const json = await response.json();
    const data = json.MRData;

    cache.set(key, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    emit(HookEvents.DATA_SYNC_ERROR, { endpoint, error: err.message });
    throw err;
  }
}

/**
 * Clear the API cache.
 */
export function clearCache() {
  cache.clear();
}

/**
 * Fetch the full season schedule.
 */
export async function fetchSchedule() {
  const data = await apiFetch(`${API.SEASON}.json`);
  const races = data?.RaceTable?.Races || [];
  emit(HookEvents.RACE_SCHEDULE_UPDATED, races);
  return races;
}

/**
 * Fetch results for a specific race round, or the latest if no round given.
 */
export async function fetchRaceResults(round) {
  const path = round
    ? `${API.SEASON}/${round}/results.json`
    : `${API.SEASON}/results.json`;
  const data = await apiFetch(path);
  const races = data?.RaceTable?.Races || [];
  if (races.length > 0) {
    emit(HookEvents.RACE_RESULTS_RECEIVED, races);
  }
  return races;
}

/**
 * Fetch qualifying results for a specific round or all.
 */
export async function fetchQualifying(round) {
  const path = round
    ? `${API.SEASON}/${round}/qualifying.json`
    : `${API.SEASON}/qualifying.json`;
  const data = await apiFetch(path);
  const races = data?.RaceTable?.Races || [];
  if (races.length > 0) {
    emit(HookEvents.RACE_QUALIFYING_RECEIVED, races);
  }
  return races;
}

/**
 * Fetch sprint results for a specific round or all.
 */
export async function fetchSprintResults(round) {
  const path = round
    ? `${API.SEASON}/${round}/sprint.json`
    : `${API.SEASON}/sprint.json`;
  const data = await apiFetch(path);
  const races = data?.RaceTable?.Races || [];
  if (races.length > 0) {
    emit(HookEvents.SPRINT_RESULTS_RECEIVED, races);
  }
  return races;
}

/**
 * Fetch current driver standings.
 */
export async function fetchDriverStandings() {
  const data = await apiFetch(`${API.SEASON}/driverStandings.json`);
  const lists = data?.StandingsTable?.StandingsLists || [];
  const standings = lists[0]?.DriverStandings || [];
  emit(HookEvents.DRIVER_STANDINGS_UPDATED, standings);
  return standings;
}

/**
 * Fetch current constructor standings.
 */
export async function fetchConstructorStandings() {
  const data = await apiFetch(`${API.SEASON}/constructorStandings.json`);
  const lists = data?.StandingsTable?.StandingsLists || [];
  const standings = lists[0]?.ConstructorStandings || [];
  emit(HookEvents.CONSTRUCTOR_STANDINGS_UPDATED, standings);
  return standings;
}

/**
 * Fetch all drivers for the season.
 */
export async function fetchDrivers() {
  const data = await apiFetch(`${API.SEASON}/drivers.json`);
  return data?.DriverTable?.Drivers || [];
}

/**
 * Fetch all constructors for the season.
 */
export async function fetchConstructors() {
  const data = await apiFetch(`${API.SEASON}/constructors.json`);
  return data?.ConstructorTable?.Constructors || [];
}

/**
 * Full sync: fetches schedule, latest results, standings.
 * Emits DATA_SYNC_START and DATA_SYNC_COMPLETE.
 */
export async function fullSync() {
  emit(HookEvents.DATA_SYNC_START, { timestamp: new Date() });

  const results = {
    schedule: null,
    raceResults: null,
    qualifying: null,
    sprintResults: null,
    driverStandings: null,
    constructorStandings: null,
    errors: [],
  };

  const tasks = [
    fetchSchedule().then(d => { results.schedule = d; }),
    fetchRaceResults().then(d => { results.raceResults = d; }),
    fetchQualifying().then(d => { results.qualifying = d; }),
    fetchSprintResults().then(d => { results.sprintResults = d; }),
    fetchDriverStandings().then(d => { results.driverStandings = d; }),
    fetchConstructorStandings().then(d => { results.constructorStandings = d; }),
  ];

  // Use allSettled so one failure doesn't block the rest
  const outcomes = await Promise.allSettled(tasks);
  outcomes.forEach((outcome, i) => {
    if (outcome.status === 'rejected') {
      results.errors.push(outcome.reason?.message || 'Unknown error');
    }
  });

  emit(HookEvents.DATA_SYNC_COMPLETE, results);
  return results;
}
