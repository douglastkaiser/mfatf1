// Dashboard UI
// Renders the main dashboard view: next race, team summary, latest results,
// points chart, top performers, and the hook activity log.

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS } from '../config.js';
import { on, HookEvents, getLog } from '../services/hooks.js';
import { getTeam } from '../models/team.js';
import { loadScoringHistory, loadCachedResults } from '../services/storage.js';

export function initDashboard() {
  renderNextRace();
  renderTeamSummary();
  renderHookLog();
  setupForceSync();

  // Live updates
  on(HookEvents.RACE_SCHEDULE_UPDATED, renderNextRace);
  on(HookEvents.TEAM_UPDATED, renderTeamSummary);
  on(HookEvents.RACE_RESULTS_RECEIVED, renderLatestResults);
  on(HookEvents.FANTASY_SCORES_CALCULATED, renderTopPerformers);
  on(HookEvents.DATA_SYNC_START, () => updateSyncIndicator('syncing'));
  on(HookEvents.DATA_SYNC_COMPLETE, (data) => {
    updateSyncIndicator(data.errors?.length > 0 ? 'error' : 'synced');
    renderLatestResults(data.raceResults);
    renderPointsChart();
  });
  on(HookEvents.DATA_SYNC_ERROR, () => updateSyncIndicator('error'));

  // Log all hook events to the activity log
  for (const event of Object.values(HookEvents)) {
    on(event, () => renderHookLog());
  }
}

function renderNextRace(races) {
  const schedule = races || loadCachedResults().schedule || [];
  const now = new Date();
  const nextRace = schedule.find(r => new Date(r.date) > now) || schedule[0];

  const nameEl = document.getElementById('next-race-name');
  const circuitEl = document.getElementById('next-race-circuit');
  const dateEl = document.getElementById('next-race-date');
  const countdownEl = document.getElementById('next-race-countdown');

  if (!nextRace) {
    nameEl.textContent = 'No upcoming races';
    return;
  }

  nameEl.textContent = nextRace.raceName;
  circuitEl.textContent = nextRace.Circuit?.circuitName || '';
  const raceDate = new Date(nextRace.date);
  dateEl.textContent = raceDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const daysUntil = Math.ceil((raceDate - now) / (1000 * 60 * 60 * 24));
  if (daysUntil > 0) {
    countdownEl.textContent = `${daysUntil} day${daysUntil !== 1 ? 's' : ''} away`;
  } else if (daysUntil === 0) {
    countdownEl.textContent = 'Race Day!';
    countdownEl.style.background = 'var(--accent-red)';
    countdownEl.style.color = '#fff';
  } else {
    countdownEl.textContent = 'Completed';
  }
}

function renderTeamSummary() {
  const team = getTeam();
  const container = document.getElementById('team-mini-list');
  const pointsBadge = document.getElementById('team-points-total');

  const history = loadScoringHistory();
  const totalPoints = Object.values(history).reduce((sum, r) => sum + (r.total || 0), 0);
  pointsBadge.textContent = `${totalPoints} pts`;

  if (team.drivers.every(d => d === null)) {
    container.innerHTML = '<p class="text-muted">No team selected yet. Go to My Team to pick your drivers.</p>';
    return;
  }

  let html = '';
  for (const driverId of team.drivers) {
    if (!driverId) continue;
    const driver = DRIVERS.find(d => d.id === driverId);
    if (!driver) continue;
    const color = TEAM_COLORS[driver.team] || 'var(--border-color)';
    html += `
      <div class="performer">
        <span class="team-color-dot" style="background:${color}"></span>
        <span class="performer__name">${driver.firstName} ${driver.lastName}</span>
        <span class="performer__points">$${driver.price}M</span>
      </div>
    `;
  }

  if (team.constructor) {
    const c = CONSTRUCTORS.find(c => c.id === team.constructor);
    if (c) {
      html += `
        <div class="performer" style="border-top:1px solid var(--border-color);padding-top:0.5rem;margin-top:0.25rem">
          <span class="team-color-dot" style="background:${c.color}"></span>
          <span class="performer__name">${c.name}</span>
          <span class="performer__points">$${c.price}M</span>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

export function renderLatestResults(races) {
  const raceList = races || loadCachedResults().raceResults || [];
  const latestRace = raceList[raceList.length - 1];
  const body = document.getElementById('latest-results-body');
  const badge = document.getElementById('latest-race-name');

  if (!latestRace) {
    body.innerHTML = '<tr><td colspan="4" class="text-muted">No results yet</td></tr>';
    badge.textContent = '';
    return;
  }

  badge.textContent = latestRace.raceName;
  const results = latestRace.Results || [];

  body.innerHTML = results.slice(0, 10).map((r, i) => {
    const pos = parseInt(r.position, 10);
    const posClass = pos <= 3 ? ` pos-badge--${pos}` : '';
    const driverName = `${r.Driver?.givenName} ${r.Driver?.familyName}`;
    const constructorName = r.Constructor?.name || '';
    const constructorId = r.Constructor?.constructorId || '';
    const color = TEAM_COLORS[constructorId] || CONSTRUCTORS.find(c => c.id === constructorId)?.color || 'var(--border-color)';

    return `
      <tr>
        <td><span class="pos-badge${posClass}">${pos}</span></td>
        <td>
          <div class="driver-name">
            <span class="team-color-dot" style="background:${color}"></span>
            ${driverName}
          </div>
        </td>
        <td>${constructorName}</td>
        <td class="points-positive">--</td>
      </tr>
    `;
  }).join('');
}

function renderTopPerformers(weekendData) {
  const container = document.getElementById('top-performers');
  if (!weekendData?.driverScores) {
    container.innerHTML = '<p class="text-muted">Updated after each race</p>';
    return;
  }

  const sorted = Object.entries(weekendData.driverScores)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  container.innerHTML = sorted.map(([driverId, score], i) => {
    const rankClass = i < 3 ? ` performer__rank--${i + 1}` : '';
    return `
      <div class="performer">
        <span class="performer__rank${rankClass}">${i + 1}</span>
        <span class="performer__name">${score.driverName || driverId}</span>
        <span class="performer__points">${score.total} pts</span>
      </div>
    `;
  }).join('');
}

export function renderPointsChart() {
  const canvas = document.getElementById('points-chart');
  const ctx = canvas.getContext('2d');
  const history = loadScoringHistory();
  const rounds = Object.keys(history).sort((a, b) => a - b);

  // Set canvas size for HiDPI
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1);
  canvas.height = 200 * (window.devicePixelRatio || 1);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '200px';
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  const w = rect.width;
  const h = 200;
  const pad = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  if (rounds.length === 0) {
    ctx.fillStyle = '#6b6d80';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Points will appear here after races', w / 2, h / 2);
    return;
  }

  // Cumulative points
  let cumulative = 0;
  const points = rounds.map(r => {
    cumulative += history[r].total || 0;
    return cumulative;
  });

  const maxPts = Math.max(...points, 10);

  // Grid lines
  ctx.strokeStyle = '#2a2d3e';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = '#6b6d80';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxPts - (maxPts / 4) * i), pad.left - 8, y + 4);
  }

  // Line chart
  ctx.strokeStyle = '#e10600';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();

  points.forEach((p, i) => {
    const x = pad.left + (plotW / (points.length - 1 || 1)) * i;
    const y = pad.top + plotH - (p / maxPts) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  ctx.fillStyle = '#e10600';
  points.forEach((p, i) => {
    const x = pad.left + (plotW / (points.length - 1 || 1)) * i;
    const y = pad.top + plotH - (p / maxPts) * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Round labels
  ctx.fillStyle = '#6b6d80';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  rounds.forEach((r, i) => {
    const x = pad.left + (plotW / (rounds.length - 1 || 1)) * i;
    ctx.fillText(`R${r}`, x, h - 8);
  });
}

function renderHookLog() {
  const list = document.getElementById('hook-log-list');
  const log = getLog();

  if (log.length === 0) {
    list.innerHTML = '<li class="hook-log__item"><span class="hook-log__time">--</span><span class="hook-log__msg">Waiting for first sync...</span></li>';
    return;
  }

  list.innerHTML = log.slice(0, 20).map(entry => {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const isError = entry.event.includes('error');
    const isSuccess = entry.event.includes('complete') || entry.event.includes('calculated');
    const msgClass = isError ? ' hook-log__msg--error' : isSuccess ? ' hook-log__msg--success' : ' hook-log__msg--info';
    const label = formatEventLabel(entry.event);
    return `
      <li class="hook-log__item">
        <span class="hook-log__time">${time}</span>
        <span class="hook-log__msg${msgClass}">${label}</span>
      </li>
    `;
  }).join('');
}

function formatEventLabel(event) {
  const labels = {
    'data:sync:start': 'Syncing data from Jolpica API...',
    'data:sync:complete': 'Data sync complete',
    'data:sync:error': 'Sync error occurred',
    'race:schedule:updated': 'Race schedule updated',
    'race:results:received': 'Race results received',
    'race:qualifying:received': 'Qualifying results received',
    'race:sprint:received': 'Sprint results received',
    'standings:driver:updated': 'Driver standings updated',
    'standings:constructor:updated': 'Constructor standings updated',
    'fantasy:scores:calculated': 'Fantasy scores calculated',
    'fantasy:scores:updated': 'Fantasy scores updated',
    'team:driver:added': 'Driver added to team',
    'team:driver:removed': 'Driver removed from team',
    'team:constructor:changed': 'Constructor changed',
    'team:updated': 'Team updated',
    'team:budget:changed': 'Budget updated',
    'team:boost:activated': 'Boost activated',
    'team:transfer:made': 'Transfer completed',
  };
  return labels[event] || event;
}

function updateSyncIndicator(status) {
  const dot = document.querySelector('.update-indicator__dot');
  const text = document.querySelector('.update-indicator__text');

  dot.classList.remove('syncing', 'error');
  if (status === 'syncing') {
    dot.classList.add('syncing');
    text.textContent = 'Syncing...';
  } else if (status === 'error') {
    dot.classList.add('error');
    text.textContent = 'Error';
  } else {
    text.textContent = 'Synced';
  }
}

function setupForceSync() {
  const btn = document.getElementById('force-sync-btn');
  btn.addEventListener('click', () => {
    // Dispatch a custom event the app.js can listen for
    window.dispatchEvent(new CustomEvent('f1fantasy:forcesync'));
  });
}

function updateBudgetDisplay(budget) {
  const el = document.querySelector('.budget-pill__value');
  if (el) el.textContent = `$${budget.toFixed(1)}M`;
}

// Keep budget display in sync
on(HookEvents.TEAM_BUDGET_CHANGED, updateBudgetDisplay);
