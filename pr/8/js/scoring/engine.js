// Fantasy Scoring Engine
// Calculates fantasy points from race results following the official
// 2026 F1 Fantasy scoring rules.

import { SCORING, DRIVERS, CONSTRUCTORS } from '../config.js';
import { emit, HookEvents } from '../services/hooks.js';

/**
 * Calculate fantasy points for a single driver from race results.
 * @param {object} result - API race result for one driver
 * @param {number} gridPosition - Starting grid position
 * @param {boolean} hasFastestLap - Whether this driver set fastest lap
 * @param {boolean} isDriverOfTheDay - DOTD flag
 * @returns {object} Breakdown of points
 */
export function calculateDriverRacePoints(result, gridPosition, hasFastestLap = false, isDriverOfTheDay = false) {
  const breakdown = {
    finish: 0,
    positionChange: 0,
    fastestLap: 0,
    driverOfTheDay: 0,
    total: 0,
  };

  const position = parseInt(result.position, 10);
  const status = result.status || '';

  // DNF / DSQ
  if (status === 'Disqualified') {
    // 2026: drivers no longer penalized for DSQ
    breakdown.finish = SCORING.DSQ_PENALTY_DRIVER;
  } else if (position > 0 && !isRetired(status)) {
    // Race finish points
    breakdown.finish = SCORING.RACE_FINISH[position] || 0;
  } else {
    // DNF / not classified
    breakdown.finish = SCORING.DNF_PENALTY;
  }

  // Position change (grid to finish)
  if (position > 0 && gridPosition > 0 && !isRetired(status)) {
    const change = gridPosition - position; // positive = gained, negative = lost
    breakdown.positionChange = change > 0
      ? change * SCORING.POSITION_GAINED
      : change * Math.abs(SCORING.POSITION_LOST);
  }

  // Fastest lap bonus
  if (hasFastestLap) {
    breakdown.fastestLap = SCORING.FASTEST_LAP;
  }

  // Driver of the Day
  if (isDriverOfTheDay) {
    breakdown.driverOfTheDay = SCORING.DRIVER_OF_THE_DAY;
  }

  breakdown.total = breakdown.finish + breakdown.positionChange +
    breakdown.fastestLap + breakdown.driverOfTheDay;

  return breakdown;
}

/**
 * Calculate fantasy points for a driver from sprint results.
 */
export function calculateDriverSprintPoints(result, hasFastestLap = false) {
  const breakdown = {
    finish: 0,
    fastestLap: 0,
    total: 0,
  };

  const position = parseInt(result.position, 10);
  const status = result.status || '';

  if (isRetired(status)) {
    breakdown.finish = SCORING.DNF_PENALTY;
  } else {
    breakdown.finish = SCORING.SPRINT[position] || 0;
  }

  if (hasFastestLap) {
    breakdown.fastestLap = SCORING.SPRINT_FASTEST_LAP;
  }

  breakdown.total = breakdown.finish + breakdown.fastestLap;
  return breakdown;
}

/**
 * Calculate constructor qualifying bonus based on how far their drivers got.
 * @param {string} constructorId
 * @param {Array} qualifyingResults - All qualifying results for the race
 * @returns {object} Points breakdown
 */
export function calculateConstructorQualifyingBonus(constructorId, qualifyingResults) {
  const constructor = CONSTRUCTORS.find(c => c.id === constructorId);
  if (!constructor) return { bonus: 0 };

  const driverIds = constructor.drivers;
  let driversInQ2 = 0;
  let driversInQ3 = 0;

  for (const result of qualifyingResults) {
    const driverId = result.Driver?.driverId;
    if (!driverIds.includes(driverId)) continue;

    if (result.Q3) driversInQ3++;
    else if (result.Q2) driversInQ2++;
  }

  const totalQ2Plus = driversInQ2 + driversInQ3;
  let bonus = 0;
  const rules = SCORING.CONSTRUCTOR_QUALIFYING;

  if (driversInQ3 >= 2) bonus = rules.BOTH_Q3;
  else if (driversInQ3 === 1) bonus = rules.ONE_Q3;
  else if (totalQ2Plus >= 2) bonus = rules.BOTH_Q2;
  else if (totalQ2Plus === 1) bonus = rules.ONE_Q2;
  else bonus = rules.NEITHER_Q2;

  return { bonus, driversInQ2, driversInQ3 };
}

/**
 * Calculate pit stop fantasy points for a constructor.
 * @param {number} fastestPitTime - Fastest pit stop time in seconds for this team
 * @param {boolean} isFastestOverall - Whether this was the fastest pit stop of the race
 */
export function calculatePitStopPoints(fastestPitTime, isFastestOverall = false) {
  const rules = SCORING.PIT_STOP;
  let points = 0;

  if (isFastestOverall) points += rules.FASTEST_OVERALL;

  if (fastestPitTime > 0) {
    if (fastestPitTime < rules.RECORD_TIME) {
      points += rules.UNDER_2_0 + rules.RECORD_BONUS;
    } else if (fastestPitTime < 2.0) {
      points += rules.UNDER_2_0;
    } else if (fastestPitTime < 2.2) {
      points += rules.UNDER_2_2;
    } else if (fastestPitTime < 2.5) {
      points += rules.UNDER_2_5;
    } else if (fastestPitTime < 3.0) {
      points += rules.UNDER_3_0;
    }
  }

  return points;
}

/**
 * Check streaks for a driver across recent races.
 * @param {string} driverId
 * @param {Array} recentResults - Last N race results
 */
export function checkDriverStreaks(driverId, recentResults) {
  let qualiStreak = 0;
  let finishStreak = 0;
  let bonusPoints = 0;

  // Check most recent races first
  for (const race of recentResults) {
    const qualiResult = race.qualifying?.find(q => q.Driver?.driverId === driverId);
    const raceResult = race.results?.find(r => r.Driver?.driverId === driverId);

    const qualiPos = qualiResult ? parseInt(qualiResult.position, 10) : 99;
    const finishPos = raceResult ? parseInt(raceResult.position, 10) : 99;

    if (qualiPos <= 10) qualiStreak++;
    else qualiStreak = 0;

    if (finishPos <= 10) finishStreak++;
    else finishStreak = 0;
  }

  if (qualiStreak >= 5) bonusPoints += SCORING.STREAKS.DRIVER_QUALI_TOP10_5;
  if (finishStreak >= 5) bonusPoints += SCORING.STREAKS.DRIVER_FINISH_TOP10_5;

  return { qualiStreak, finishStreak, bonusPoints };
}

/**
 * Process a full race weekend and calculate all fantasy points.
 * This is the main hook that fires after race data is received.
 *
 * @param {object} raceData - { results, qualifying, sprint, round, raceName }
 * @returns {object} Fantasy scores per driver and constructor
 */
export function processRaceWeekend(raceData) {
  const { results = [], qualifying = [], sprint = [], round, raceName } = raceData;

  const driverScores = {};
  const constructorScores = {};

  // Find fastest lap driver
  const fastestLapDriver = results.find(r => r.FastestLap?.rank === '1');
  const fastestLapDriverId = fastestLapDriver?.Driver?.driverId;

  // Process each driver's race result
  for (const result of results) {
    const driverId = result.Driver?.driverId;
    const constructorId = result.Constructor?.constructorId;
    const gridPos = parseInt(result.grid, 10) || 0;
    const hasFastestLap = driverId === fastestLapDriverId;

    const racePoints = calculateDriverRacePoints(result, gridPos, hasFastestLap, false);

    driverScores[driverId] = {
      ...racePoints,
      constructorId,
      driverName: `${result.Driver?.givenName} ${result.Driver?.familyName}`,
      position: parseInt(result.position, 10),
      grid: gridPos,
      status: result.status,
    };

    // Aggregate constructor scores from both drivers' race finishes
    if (!constructorScores[constructorId]) {
      constructorScores[constructorId] = {
        racePoints: 0,
        qualifyingBonus: 0,
        pitStopPoints: 0,
        total: 0,
      };
    }
    constructorScores[constructorId].racePoints += racePoints.total;
  }

  // Process qualifying bonuses for constructors
  if (qualifying.length > 0) {
    for (const constructor of CONSTRUCTORS) {
      const qualiBonus = calculateConstructorQualifyingBonus(constructor.id, qualifying);
      if (constructorScores[constructor.id]) {
        constructorScores[constructor.id].qualifyingBonus = qualiBonus.bonus;
      }
    }
  }

  // Process sprint results
  const sprintScores = {};
  if (sprint.length > 0) {
    const sprintFastestLap = sprint.find(r => r.FastestLap?.rank === '1');
    const sprintFLDriverId = sprintFastestLap?.Driver?.driverId;

    for (const result of sprint) {
      const driverId = result.Driver?.driverId;
      const hasFastestLap = driverId === sprintFLDriverId;
      sprintScores[driverId] = calculateDriverSprintPoints(result, hasFastestLap);

      // Add sprint points to driver totals
      if (driverScores[driverId]) {
        driverScores[driverId].sprintPoints = sprintScores[driverId].total;
        driverScores[driverId].total += sprintScores[driverId].total;
      }
    }
  }

  // Total constructor scores
  for (const cId of Object.keys(constructorScores)) {
    const c = constructorScores[cId];
    c.total = c.racePoints + c.qualifyingBonus + c.pitStopPoints;
  }

  const weekendResult = {
    round,
    raceName,
    driverScores,
    constructorScores,
    sprintScores,
    timestamp: new Date().toISOString(),
  };

  emit(HookEvents.FANTASY_SCORES_CALCULATED, weekendResult);

  return weekendResult;
}

/**
 * Calculate total fantasy points for a user's team for one race.
 * Applies boosts (DRS, Mega, No Negative, etc).
 *
 * @param {object} team - User's team { drivers: [id,...], constructors: [id, id] }
 * @param {object} weekendScores - Output of processRaceWeekend
 * @param {object} boosts - Active boosts { drs: { target }, mega: { target }, 'no-negative': { active }, ... }
 * @returns {object} Team score breakdown
 */
export function calculateTeamScore(team, weekendScores, boosts = {}) {
  const { driverScores, constructorScores } = weekendScores;
  let teamTotal = 0;
  const driverBreakdown = {};
  const noNegative = boosts['no-negative']?.active;

  // Resolve boost targets (support both old format { drs: driverId } and new { drs: { target: driverId } })
  const getTarget = (key) => {
    const b = boosts[key];
    if (!b) return null;
    if (typeof b === 'string') return b;
    return b.target || null;
  };

  for (const driverId of team.drivers) {
    if (!driverId) continue;
    const score = driverScores[driverId];
    if (!score) continue;

    let multiplier = 1;
    if (getTarget('drs') === driverId) multiplier = 2;
    if (getTarget('mega') === driverId) multiplier = 3;
    if (getTarget('extra-drs') === driverId) multiplier = Math.max(multiplier, 2);

    let adjusted = score.total * multiplier;
    // No Negative: floor individual driver score at 0
    if (noNegative && adjusted < 0) adjusted = 0;

    driverBreakdown[driverId] = {
      base: score.total,
      multiplier,
      adjusted,
      breakdown: score,
    };
    teamTotal += adjusted;
  }

  // Constructor scores (now supports 2 constructors)
  const constructors = team.constructors || (team.constructor ? [team.constructor] : []);
  let constructorTotal = 0;
  const constructorBreakdown = {};

  for (const cId of constructors) {
    if (!cId) continue;
    const cScore = constructorScores[cId];
    if (!cScore) continue;

    let cPoints = cScore.total;
    if (noNegative && cPoints < 0) cPoints = 0;

    constructorBreakdown[cId] = cPoints;
    constructorTotal += cPoints;
  }
  teamTotal += constructorTotal;

  return {
    teamTotal,
    driverBreakdown,
    constructorTotal,
    constructorBreakdown,
    constructors,
  };
}

// ===== Helpers =====

function isRetired(status) {
  if (!status) return false;
  const s = status.toLowerCase();
  return s !== 'finished' && s !== '+1 lap' && s !== '+2 laps' &&
    s !== '+3 laps' && s !== '+4 laps' && s !== '+5 laps' &&
    s !== '+6 laps';
}
