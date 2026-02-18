// H2H Season View UI
// Shows current matchup, personal W/L/D record, full schedule, and H2H league table.
// Mirrors the leaderboard.js pattern: getAllUsers() → usersMap → render.

import { getAllUsers, getCurrentUser, loadH2HSchedule } from '../services/auth.js';
import {
  computeH2HStandings,
  computeMatchupResult,
  getMatchupForUser,
  getCurrentRound,
  TOTAL_ROUNDS,
} from '../services/h2h.js';
import { RACE_CALENDAR } from '../config.js';
import { on, HookEvents } from '../services/hooks.js';

// ===== Init =====

export function initH2H() {
  const refreshBtn = document.getElementById('h2h-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => renderH2H());
  }

  // Re-render when scores are calculated or schedule is regenerated
  on(HookEvents.FANTASY_SCORES_CALCULATED, () => {
    const h2hView = document.getElementById('view-h2h');
    if (h2hView?.classList.contains('active')) renderH2H();
  });
  on(HookEvents.H2H_SCHEDULE_UPDATED, () => renderH2H());
}

// ===== Main Render =====

export async function renderH2H() {
  setLoading(true);

  try {
    const users = await getAllUsers();
    const currentUid = getCurrentUser()?.uid;

    if (!currentUid) {
      setLoading(false);
      return;
    }

    // Build uid → userDoc map (same pattern as leaderboard.js)
    const usersMap = Object.fromEntries(users.map(u => [u.id, u]));

    // Load the H2H schedule from Firestore
    const h2hDoc = await loadH2HSchedule();
    if (!h2hDoc || !h2hDoc.schedule?.length) {
      renderNoSchedule();
      setLoading(false);
      return;
    }

    const schedule = h2hDoc.schedule;
    const currentRound = getCurrentRound(usersMap);

    // Determine matchup to show: current round if scored, otherwise upcoming
    const displayRound = currentRound > 0 ? currentRound : 1;
    const upcomingRound = currentRound < TOTAL_ROUNDS ? currentRound + 1 : currentRound;
    const currentMatchup = getMatchupForUser(schedule, currentUid, displayRound)
      || getMatchupForUser(schedule, currentUid, upcomingRound);

    renderCurrentMatchup(currentMatchup, currentUid, usersMap, displayRound);
    renderPersonalRecord(currentUid, schedule, usersMap, currentRound);
    renderScheduleList(currentUid, schedule, usersMap, currentRound);
    renderH2HTable(schedule, usersMap, currentRound, currentUid);

  } catch (err) {
    console.error('[H2H] Failed to render:', err);
    const el = document.getElementById('h2h-current-matchup');
    if (el) el.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem">Failed to load H2H data. Please refresh.</p>';
  } finally {
    setLoading(false);
  }
}

// ===== Sub-renderers =====

function renderCurrentMatchup(matchup, currentUid, usersMap, currentRound) {
  const container = document.getElementById('h2h-current-matchup');
  if (!container) return;

  if (!matchup) {
    container.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem">No matchup found.</p>';
    return;
  }

  const isHome = matchup.home === currentUid;
  const opponentUid = isHome ? matchup.away : matchup.home;
  const raceInfo = RACE_CALENDAR.find(r => r.round === matchup.round);
  const raceName = raceInfo ? raceInfo.name : `Round ${matchup.round}`;

  if (!opponentUid) {
    container.innerHTML = `
      <div class="h2h-matchup-card h2h-matchup-card--bye">
        <div class="h2h-matchup-card__label">Round ${matchup.round} &mdash; ${raceName}</div>
        <p style="text-align:center;color:var(--accent-blue);font-weight:700;font-size:1.1rem;margin:1rem 0">Bye Week</p>
        <p class="text-muted" style="text-align:center;font-size:0.82rem">You have a bye this round &mdash; automatic win!</p>
      </div>
    `;
    return;
  }

  const me = usersMap[currentUid];
  const opp = usersMap[opponentUid];
  const { result, homeScore, awayScore } = computeMatchupResult(matchup, usersMap);
  const myScore = isHome ? homeScore : awayScore;
  const oppScore = isHome ? awayScore : homeScore;

  // Compute result from my perspective
  let myResult = result;
  if (result === 'win' && !isHome) myResult = 'loss';
  else if (result === 'loss' && !isHome) myResult = 'win';

  const cardClass = myResult === 'pending' ? '' : `h2h-matchup-card--${myResult}`;

  const resultLabel = myResult === 'pending' ? 'Live / TBD'
    : myResult === 'win'  ? 'WIN'
    : myResult === 'loss' ? 'LOSS'
    : 'DRAW';

  container.innerHTML = `
    <div class="h2h-matchup-card ${cardClass}">
      <div class="h2h-matchup-card__label">Round ${matchup.round} &mdash; ${raceName}</div>
      <div class="h2h-matchup-vs">
        <div class="h2h-matchup-vs__player h2h-matchup-vs__player--me">
          <div class="h2h-matchup-vs__name">
            ${escHtml(me?.displayName || 'You')}
            <span class="you-badge">You</span>
          </div>
          <div class="h2h-matchup-vs__score">${myScore ?? '--'}</div>
        </div>
        <div class="h2h-matchup-vs__divider">
          <span class="h2h-result-badge h2h-result-badge--${myResult}">${resultLabel}</span>
          <span class="h2h-matchup-vs__vs">pts</span>
        </div>
        <div class="h2h-matchup-vs__player h2h-matchup-vs__player--opp">
          <div class="h2h-matchup-vs__name">${escHtml(opp?.displayName || 'Unknown')}</div>
          <div class="h2h-matchup-vs__score">${oppScore ?? '--'}</div>
        </div>
      </div>
    </div>
  `;
}

function renderPersonalRecord(currentUid, schedule, usersMap, currentRound) {
  const container = document.getElementById('h2h-record');
  if (!container) return;

  let wins = 0, losses = 0, draws = 0, byes = 0;

  const myMatchups = schedule.filter(
    m => m.round <= currentRound && (m.home === currentUid || m.away === currentUid)
  );

  for (const matchup of myMatchups) {
    const isHome = matchup.home === currentUid;
    const { result } = computeMatchupResult(matchup, usersMap);

    if (result === 'pending') continue;

    if (result === 'bye') {
      wins++;
      byes++;
      continue;
    }

    // Flip perspective if I'm the away player
    const myResult = isHome ? result : (result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw');
    if (myResult === 'win') wins++;
    else if (myResult === 'loss') losses++;
    else draws++;
  }

  const byePill = byes > 0 ? `
    <div class="h2h-record-pill h2h-record-pill--bye">
      <span class="h2h-record-pill__value">${byes}</span>
      <span class="h2h-record-pill__label">Bye</span>
    </div>` : '';

  container.innerHTML = `
    <div class="h2h-record-pills">
      <div class="h2h-record-pill h2h-record-pill--win">
        <span class="h2h-record-pill__value">${wins}</span>
        <span class="h2h-record-pill__label">W</span>
      </div>
      <div class="h2h-record-pill h2h-record-pill--draw">
        <span class="h2h-record-pill__value">${draws}</span>
        <span class="h2h-record-pill__label">D</span>
      </div>
      <div class="h2h-record-pill h2h-record-pill--loss">
        <span class="h2h-record-pill__value">${losses}</span>
        <span class="h2h-record-pill__label">L</span>
      </div>
      ${byePill}
    </div>
  `;
}

function renderScheduleList(currentUid, schedule, usersMap, currentRound) {
  const container = document.getElementById('h2h-schedule-body');
  if (!container) return;

  const myMatchups = schedule
    .filter(m => m.home === currentUid || m.away === currentUid)
    .sort((a, b) => a.round - b.round);

  if (myMatchups.length === 0) {
    container.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:2rem">No schedule generated yet.</td></tr>';
    return;
  }

  container.innerHTML = myMatchups.map(matchup => {
    const isHome = matchup.home === currentUid;
    const opponentUid = isHome ? matchup.away : matchup.home;
    const opp = opponentUid ? usersMap[opponentUid] : null;

    const { result, homeScore, awayScore } = computeMatchupResult(matchup, usersMap);
    const myScore  = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;

    let myResult = result;
    if (result === 'win' && !isHome) myResult = 'loss';
    else if (result === 'loss' && !isHome) myResult = 'win';

    const isCurrent = matchup.round === currentRound;
    const raceName = RACE_CALENDAR.find(r => r.round === matchup.round)?.name || `Round ${matchup.round}`;
    const rowClass = isCurrent ? ' class="h2h-schedule-row--current"' : '';

    const scoreCell = (myResult === 'pending')
      ? '<span class="text-muted" style="font-size:0.78rem">TBD</span>'
      : `${myScore ?? '--'} &ndash; ${oppScore ?? '--'}`;

    const opponentCell = !opponentUid
      ? '<em style="color:var(--text-muted)">Bye</em>'
      : escHtml(opp?.displayName || 'Unknown');

    return `
      <tr${rowClass}>
        <td><span class="pos-badge">${matchup.round}</span></td>
        <td style="font-size:0.78rem;color:var(--text-secondary)">${escHtml(raceName)}</td>
        <td>${opponentCell}</td>
        <td style="text-align:center;font-size:0.85rem">${scoreCell}</td>
        <td><span class="h2h-result-badge h2h-result-badge--${myResult}">${myResult.toUpperCase()}</span></td>
      </tr>
    `;
  }).join('');
}

function renderH2HTable(schedule, usersMap, currentRound, currentUid) {
  const container = document.getElementById('h2h-table-body');
  if (!container) return;

  const standings = computeH2HStandings(schedule, usersMap, currentRound);

  if (standings.length === 0) {
    container.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:2rem">No standings yet.</td></tr>';
    return;
  }

  container.innerHTML = standings.map((row, i) => {
    const isMe = row.uid === currentUid;
    const rowClass = isMe ? ' class="leaderboard-row leaderboard-row--me"' : ' class="leaderboard-row"';
    const posClass = i < 3 ? ` pos-badge--${i + 1}` : '';

    return `
      <tr${rowClass}>
        <td><span class="pos-badge${posClass}">${i + 1}</span></td>
        <td>
          <div class="leaderboard-player">
            <strong>${escHtml(row.displayName)}</strong>
            ${isMe ? '<span class="you-badge">You</span>' : ''}
          </div>
        </td>
        <td style="text-align:center"><strong style="color:var(--accent-green)">${row.wins}</strong></td>
        <td style="text-align:center;color:var(--accent-yellow)">${row.draws}</td>
        <td style="text-align:center;color:var(--accent-red)">${row.losses}</td>
        <td style="text-align:center;color:var(--text-muted)">${row.played}</td>
        <td style="text-align:center"><strong>${row.pointsFor}</strong></td>
      </tr>
    `;
  }).join('');
}

function renderNoSchedule() {
  const matchupEl = document.getElementById('h2h-current-matchup');
  if (matchupEl) {
    matchupEl.innerHTML = `
      <div style="text-align:center;padding:2.5rem 1rem">
        <div style="font-size:2rem;margin-bottom:0.75rem">&#9877;</div>
        <div style="font-weight:700;font-size:1rem;margin-bottom:0.5rem;color:var(--text-primary)">Schedule Not Generated</div>
        <p class="text-muted" style="font-size:0.85rem">The commissioner needs to generate the H2H schedule from the Admin panel.</p>
      </div>
    `;
  }

  const schedBody = document.getElementById('h2h-schedule-body');
  if (schedBody) schedBody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:2rem">No schedule yet.</td></tr>';

  const tableBody = document.getElementById('h2h-table-body');
  if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:2rem">No standings yet.</td></tr>';

  const recordEl = document.getElementById('h2h-record');
  if (recordEl) recordEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:1rem;font-size:0.82rem">No schedule generated yet.</p>';
}

function setLoading(isLoading) {
  const spinner = document.getElementById('h2h-loading');
  if (spinner) spinner.hidden = !isLoading;
}

// Minimal HTML escaping to prevent XSS from user display names
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
