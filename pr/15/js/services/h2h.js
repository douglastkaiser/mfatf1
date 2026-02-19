// H2H Season Service
// Round-robin schedule generation and result computation.
// Pure logic module — no Firebase, no DOM.

import { RACE_CALENDAR } from '../config.js';

export const TOTAL_ROUNDS = RACE_CALENDAR.length; // 24

/**
 * Generate a full-season round-robin H2H schedule.
 * Uses the circle-method rotation algorithm.
 * @param {string[]} playerUids - Array of authenticated user UIDs (≥ 2)
 * @returns {Array<{round: number, home: string, away: string|null}>}
 */
export function generateRoundRobinSchedule(playerUids) {
  let players = [...playerUids];

  // Add a null "bye" placeholder if the count is odd
  if (players.length % 2 !== 0) {
    players.push(null);
  }

  const n = players.length;
  const leagueRounds = n - 1; // full round-robin cycle length
  const half = n / 2;

  const fixed = players[0];
  let rotating = players.slice(1);
  const baseSchedule = [];

  for (let r = 0; r < leagueRounds; r++) {
    const roundNum = r + 1;
    // Pair fixed with first of the rotating list
    baseSchedule.push({ round: roundNum, home: fixed, away: rotating[0] });
    // Pair remaining slots across the two halves
    for (let i = 1; i < half; i++) {
      baseSchedule.push({
        round: roundNum,
        home: rotating[i],
        away: rotating[n - 1 - i],
      });
    }
    // Rotate: move last element to front
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  // Expand to cover all 24 F1 rounds by cycling through league rounds
  const finalSchedule = [];
  for (let f1Round = 1; f1Round <= TOTAL_ROUNDS; f1Round++) {
    const leagueRound = ((f1Round - 1) % leagueRounds) + 1;
    const matchups = baseSchedule.filter(m => m.round === leagueRound);
    for (const m of matchups) {
      finalSchedule.push({ round: f1Round, home: m.home, away: m.away });
    }
  }

  return finalSchedule;
}

/**
 * Find the matchup entry for a given user and round.
 * @param {Array} schedule - Full schedule array
 * @param {string} uid
 * @param {number} round - F1 round number
 * @returns {object|null}
 */
export function getMatchupForUser(schedule, uid, round) {
  return schedule.find(
    m => m.round === round && (m.home === uid || m.away === uid)
  ) || null;
}

/**
 * Compute win/loss/draw result for a single matchup.
 * @param {object} matchup - { round, home, away }
 * @param {object} usersMap - { [uid]: userDoc } with scoringHistory
 * @returns {{ result: 'win'|'loss'|'draw'|'bye'|'pending', homeScore: number|null, awayScore: number|null }}
 */
export function computeMatchupResult(matchup, usersMap) {
  const { home, away, round } = matchup;

  if (!away) {
    return { result: 'bye', homeScore: null, awayScore: null };
  }

  const homeScore = usersMap[home]?.scoringHistory?.[round]?.total ?? null;
  const awayScore = usersMap[away]?.scoringHistory?.[round]?.total ?? null;

  if (homeScore === null && awayScore === null) {
    return { result: 'pending', homeScore: null, awayScore: null };
  }

  const h = homeScore ?? 0;
  const a = awayScore ?? 0;
  const result = h > a ? 'win' : h < a ? 'loss' : 'draw';
  return { result, homeScore: h, awayScore: a };
}

/**
 * Compute season H2H standings for all users.
 * Sort order: Wins DESC, then Points For DESC.
 * @param {Array} schedule - Full schedule array
 * @param {object} usersMap - { [uid]: userDoc }
 * @param {number} currentRound - Last completed F1 round (0 if none)
 * @returns {Array} Sorted standings rows
 */
export function computeH2HStandings(schedule, usersMap, currentRound) {
  const records = {};

  for (const uid of Object.keys(usersMap)) {
    const history = usersMap[uid]?.scoringHistory || {};
    const totalPts = Object.values(history).reduce((s, r) => s + (r.total || 0), 0);
    records[uid] = {
      uid,
      displayName: usersMap[uid]?.displayName || 'Unknown',
      wins: 0,
      losses: 0,
      draws: 0,
      byes: 0,
      played: 0,
      pointsFor: totalPts,
    };
  }

  const pastMatchups = schedule.filter(m => m.round <= currentRound);

  for (const matchup of pastMatchups) {
    const { home, away } = matchup;
    if (!records[home]) continue;

    const { result } = computeMatchupResult(matchup, usersMap);

    if (result === 'pending') continue;

    if (result === 'bye') {
      records[home].byes++;
      records[home].played++;
      continue;
    }

    if (!away || !records[away]) continue;

    records[home].played++;
    records[away].played++;

    if (result === 'win') {
      records[home].wins++;
      records[away].losses++;
    } else if (result === 'loss') {
      records[home].losses++;
      records[away].wins++;
    } else {
      records[home].draws++;
      records[away].draws++;
    }
  }

  return Object.values(records).sort(
    (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
  );
}

/**
 * Determine the current/most recent F1 round that has been scored.
 * Returns 0 if no races have been scored yet.
 * @param {object} usersMap - { [uid]: userDoc }
 * @returns {number}
 */
export function getCurrentRound(usersMap) {
  const playedRounds = new Set();
  for (const user of Object.values(usersMap)) {
    for (const round of Object.keys(user.scoringHistory || {})) {
      playedRounds.add(parseInt(round, 10));
    }
  }
  if (playedRounds.size === 0) return 0;
  return Math.max(...playedRounds);
}
