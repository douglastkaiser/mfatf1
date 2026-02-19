// Test Mode Service
// Creates test users, generates realistic mock race data, and simulates
// a full season one race at a time. All data is written to Firestore
// with an `isTestUser: true` marker for easy cleanup.

import {
  doc, setDoc, deleteDoc, updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

import { DRIVERS, CONSTRUCTORS, RACE_CALENDAR, BUDGET } from '../config.js';
import { processRaceWeekend, calculateTeamScore } from '../scoring/engine.js';
import { getAllUsers, getDb } from './auth.js';

// ===== Constants =====

const TEST_USER_NAMES = [
  'Alex Turner', 'Jamie Chen', 'Sam Williams', 'Riley Johnson',
  'Morgan Smith', 'Taylor Brown', 'Casey Davis', 'Jordan Miller',
];

const DNF_STATUSES = ['Retired', 'Collision', 'Engine', 'Gearbox', 'Hydraulics'];

// ===== Helpers =====

function generateTestUserId(index) {
  return `test-user-${index + 1}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateLapTime(baseSeconds, variance) {
  const time = baseSeconds + Math.random() * variance;
  const mins = Math.floor(time / 60);
  const secs = (time % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
}

// ===== Team Generation =====

/**
 * Generate a random valid team (5 drivers + 2 constructors) within the $100M budget.
 */
export function generateRandomTeam() {
  const budget = BUDGET.STARTING;
  const sortedConstructors = [...CONSTRUCTORS].sort((a, b) => a.price - b.price);
  const minTwoConstructors = sortedConstructors[0].price + sortedConstructors[1].price;

  const sortedDrivers = [...DRIVERS].sort((a, b) => a.price - b.price);
  const cheapestDriverPrice = sortedDrivers[0].price;

  // Shuffle drivers to get random selection order
  const shuffledDrivers = shuffle(DRIVERS);
  const selectedDrivers = [];
  let driverSpend = 0;

  for (const driver of shuffledDrivers) {
    if (selectedDrivers.length >= 5) break;

    // Remaining budget must accommodate remaining driver slots + 2 constructors
    const slotsLeft = 4 - selectedDrivers.length; // slots after this one
    const reserveForDrivers = slotsLeft * cheapestDriverPrice;
    const reserveForConstructors = minTwoConstructors;
    const maxForThisSlot = budget - driverSpend - reserveForDrivers - reserveForConstructors;

    if (driver.price <= maxForThisSlot) {
      selectedDrivers.push(driver);
      driverSpend += driver.price;
    }
  }

  // Fallback: fill any remaining slots with cheapest available drivers
  if (selectedDrivers.length < 5) {
    const selectedIds = new Set(selectedDrivers.map(d => d.id));
    for (const driver of sortedDrivers) {
      if (selectedDrivers.length >= 5) break;
      if (selectedIds.has(driver.id)) continue;
      selectedDrivers.push(driver);
      driverSpend += driver.price;
      selectedIds.add(driver.id);
    }
  }

  // Pick 2 constructors from remaining budget
  const remainingBudget = budget - driverSpend;
  const shuffledConstructors = shuffle(CONSTRUCTORS);
  const selectedConstructors = [];
  let constructorSpend = 0;

  for (const c of shuffledConstructors) {
    if (selectedConstructors.length >= 2) break;
    // Reserve room for a second constructor if still needed
    const needSecond = selectedConstructors.length === 0;
    const reserve = needSecond ? sortedConstructors[0].price : 0;
    if (constructorSpend + c.price + reserve <= remainingBudget) {
      selectedConstructors.push(c);
      constructorSpend += c.price;
    }
  }

  // Fallback: fill with cheapest constructors
  if (selectedConstructors.length < 2) {
    const selectedIds = new Set(selectedConstructors.map(c => c.id));
    for (const c of sortedConstructors) {
      if (selectedConstructors.length >= 2) break;
      if (selectedIds.has(c.id)) continue;
      selectedConstructors.push(c);
      constructorSpend += c.price;
      selectedIds.add(c.id);
    }
  }

  const totalSpend = driverSpend + constructorSpend;

  return {
    drivers: selectedDrivers.map(d => d.id),
    constructors: selectedConstructors.map(c => c.id),
    budget: Math.round((budget - totalSpend) * 10) / 10,
    freeTransfers: 2,
    transfersMade: 0,
  };
}

// ===== Boost Simulation =====

function generateFreshBoosts() {
  return {
    drs: { used: false, target: null, active: false },
    mega: { used: false, target: null, active: false },
    'extra-drs': { used: false, target: null, active: false },
    limitless: { used: false, active: false },
    wildcard: { used: false, active: false },
    'no-negative': { used: false, active: false },
  };
}

/**
 * Randomly activate a boost for a test user this round.
 */
export function pickBoostsForRound(team, boosts) {
  const active = JSON.parse(JSON.stringify(boosts));
  const randomDriver = pickRandom(team.drivers.filter(Boolean));

  // ~8% chance to use Mega (if unused)
  if (!active.mega?.used && Math.random() < 0.08 && randomDriver) {
    active.mega = { active: true, target: randomDriver, used: false };
    return active;
  }

  // ~20% chance to use DRS
  if (Math.random() < 0.20 && randomDriver) {
    active.drs = { active: true, target: randomDriver, used: false };
  }

  // ~6% chance to use No-Negative (if unused)
  if (!active['no-negative']?.used && Math.random() < 0.06) {
    active['no-negative'] = { active: true, used: false };
  }

  // ~5% chance to use Extra-DRS (if unused)
  if (!active['extra-drs']?.used && Math.random() < 0.05 && randomDriver) {
    active['extra-drs'] = { active: true, target: randomDriver, used: false };
  }

  return active;
}

/**
 * Consume active boosts after a round (mark one-time boosts as used).
 */
function consumeBoosts(boosts) {
  const updated = JSON.parse(JSON.stringify(boosts));
  for (const [key, boost] of Object.entries(updated)) {
    if (boost.active && key !== 'drs') {
      updated[key] = { ...boost, used: true, active: false, target: null };
    } else if (boost.active) {
      updated[key] = { ...boost, active: false, target: null };
    }
  }
  return updated;
}

// ===== Race Result Generation =====

/**
 * Compute a base "strength" for a driver (lower = faster).
 * Weighted by price so expensive drivers tend to finish higher.
 */
function driverStrength(driver, variance = 10) {
  const maxPrice = 30;
  const base = 1 + (maxPrice - driver.price) * (21 / 25);
  return base + (Math.random() - 0.5) * variance;
}

/**
 * Generate a full set of race results for a round in Ergast/Jolpica API format.
 * Includes race results, qualifying, and sprint (if applicable).
 */
export function generateRaceResults(round) {
  const raceInfo = RACE_CALENDAR.find(r => r.round === round);
  if (!raceInfo) return null;

  // --- Qualifying ---
  const qualiOrder = DRIVERS.map(d => ({ driver: d, strength: driverStrength(d, 8) }))
    .sort((a, b) => a.strength - b.strength);

  const qualifying = qualiOrder.map((entry, i) => {
    const pos = i + 1;
    const result = {
      Driver: { driverId: entry.driver.id },
      position: String(pos),
      Q1: generateLapTime(90, 2),
    };
    if (pos <= 15) result.Q2 = generateLapTime(89, 1.5);
    if (pos <= 10) result.Q3 = generateLapTime(88, 1.0);
    return result;
  });

  // Grid map from qualifying
  const gridMap = {};
  qualiOrder.forEach((entry, i) => { gridMap[entry.driver.id] = i + 1; });

  // --- Race ---
  const raceOrder = DRIVERS.map(d => ({ driver: d, strength: driverStrength(d, 10) }))
    .sort((a, b) => a.strength - b.strength);

  // Pick a fastest-lap driver from the top 10 finishers (non-DNF)
  const fastestLapIndex = Math.floor(Math.random() * Math.min(10, raceOrder.length));

  let positionCounter = 1;
  const results = [];

  for (let i = 0; i < raceOrder.length; i++) {
    const d = raceOrder[i].driver;
    const gridPos = gridMap[d.id] || (i + 1);

    // DNF chance: higher for cheaper drivers
    const dnfChance = d.price < 8 ? 0.10 : 0.05;
    const isDNF = Math.random() < dnfChance;

    let status;
    let position;

    if (isDNF) {
      status = pickRandom(DNF_STATUSES);
      position = String(20 + Math.floor(Math.random() * 3)); // DNF positions at the back
    } else {
      status = positionCounter <= 20 ? 'Finished' : '+1 Lap';
      position = String(positionCounter);
      positionCounter++;
    }

    const result = {
      Driver: {
        driverId: d.id,
        givenName: d.firstName,
        familyName: d.lastName,
      },
      Constructor: {
        constructorId: d.team,
      },
      position,
      grid: String(gridPos),
      status,
    };

    // Assign fastest lap to one non-DNF top-10 finisher
    if (i === fastestLapIndex && !isDNF) {
      result.FastestLap = { rank: '1' };
    }

    results.push(result);
  }

  // Ensure exactly one fastest lap exists (if the chosen driver DNF'd, pick another)
  const hasFastestLap = results.some(r => r.FastestLap?.rank === '1');
  if (!hasFastestLap) {
    const eligible = results.filter(r => !DNF_STATUSES.includes(r.status));
    if (eligible.length > 0) {
      eligible[0].FastestLap = { rank: '1' };
    }
  }

  // --- Sprint (only for sprint weekends) ---
  let sprint = [];
  if (raceInfo.sprint) {
    const sprintOrder = DRIVERS.map(d => ({ driver: d, strength: driverStrength(d, 8) }))
      .sort((a, b) => a.strength - b.strength);

    const sprintFLIndex = Math.floor(Math.random() * Math.min(8, sprintOrder.length));
    let sprintPos = 1;

    sprint = sprintOrder.map((entry, i) => {
      const d = entry.driver;
      const isDNF = Math.random() < 0.03;
      const result = {
        Driver: { driverId: d.id, givenName: d.firstName, familyName: d.lastName },
        Constructor: { constructorId: d.team },
        position: isDNF ? String(20 + Math.floor(Math.random() * 3)) : String(sprintPos),
        status: isDNF ? 'Retired' : 'Finished',
      };
      if (!isDNF) sprintPos++;
      if (i === sprintFLIndex && !isDNF) {
        result.FastestLap = { rank: '1' };
      }
      return result;
    });

    // Ensure sprint has a fastest lap
    if (!sprint.some(r => r.FastestLap?.rank === '1')) {
      const eligible = sprint.filter(r => r.status === 'Finished');
      if (eligible.length > 0) eligible[0].FastestLap = { rank: '1' };
    }
  }

  return {
    round,
    raceName: raceInfo.name,
    results,
    qualifying,
    sprint,
  };
}

// ===== Test User CRUD =====

/**
 * Create test users in Firestore with random teams.
 */
export async function createTestUsers(count = 8) {
  const db = getDb();
  if (!db) throw new Error('Firestore not initialized');

  const clamped = Math.min(Math.max(count, 2), 8);
  const testUsers = [];

  for (let i = 0; i < clamped; i++) {
    const uid = generateTestUserId(i);
    const team = generateRandomTeam();

    const userData = {
      displayName: TEST_USER_NAMES[i] || `Test User ${i + 1}`,
      email: `testuser${i + 1}@test.local`,
      role: 'member',
      isTestUser: true,
      team,
      scoringHistory: {},
      boosts: generateFreshBoosts(),
      transfers: [],
      createdAt: new Date(),
      lastActive: new Date(),
    };

    await setDoc(doc(db, 'users', uid), userData);
    testUsers.push({ id: uid, ...userData });
  }

  return testUsers;
}

/**
 * Delete all test user documents from Firestore.
 */
export async function cleanupTestMode() {
  const db = getDb();
  if (!db) throw new Error('Firestore not initialized');

  const allUsers = await getAllUsers();
  const testUsers = allUsers.filter(u => u.isTestUser === true);

  for (const user of testUsers) {
    await deleteDoc(doc(db, 'users', user.id));
  }

  return { deletedCount: testUsers.length };
}

// ===== State Query =====

/**
 * Get the current test mode state from Firestore.
 */
export async function getTestModeState() {
  const allUsers = await getAllUsers();
  const testUsers = allUsers.filter(u => u.isTestUser === true);

  let maxScoredRound = 0;
  for (const user of testUsers) {
    const rounds = Object.keys(user.scoringHistory || {}).map(Number);
    if (rounds.length > 0) {
      maxScoredRound = Math.max(maxScoredRound, ...rounds);
    }
  }

  return {
    active: testUsers.length > 0,
    testUserCount: testUsers.length,
    currentRound: maxScoredRound,
    nextRound: maxScoredRound < 24 ? maxScoredRound + 1 : null,
    testUsers,
  };
}

// ===== Race Simulation =====

/**
 * Simulate a single race round for all test users.
 * Generates mock results, runs the scoring engine, and writes scores to Firestore.
 */
export async function simulateRace(round) {
  const db = getDb();
  if (!db) throw new Error('Firestore not initialized');

  // 1. Generate mock race data
  const raceData = generateRaceResults(round);
  if (!raceData) throw new Error(`Invalid round: ${round}`);

  // 2. Run scoring engine
  const weekendScores = processRaceWeekend(raceData);

  // 3. Load test users
  const allUsers = await getAllUsers();
  const testUsers = allUsers.filter(u => u.isTestUser === true);

  // 4. Score each test user and write to Firestore
  for (const user of testUsers) {
    if (!user.team) continue;

    const boosts = pickBoostsForRound(user.team, user.boosts || generateFreshBoosts());
    const teamScore = calculateTeamScore(user.team, weekendScores, boosts);

    const roundEntry = {
      driverScores: teamScore.driverBreakdown,
      constructorScore: teamScore.constructorTotal,
      total: teamScore.teamTotal,
      raceName: raceData.raceName,
      timestamp: new Date().toISOString(),
    };

    const scoringHistory = { ...(user.scoringHistory || {}) };
    scoringHistory[round] = roundEntry;

    const updatedBoosts = consumeBoosts(boosts);

    await updateDoc(doc(db, 'users', user.id), {
      scoringHistory,
      boosts: updatedBoosts,
      lastActive: new Date(),
    });
  }

  return {
    round,
    raceName: raceData.raceName,
    raceData,
    weekendScores,
    testUsersScored: testUsers.length,
  };
}
