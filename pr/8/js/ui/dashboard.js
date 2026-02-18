// Dashboard UI
// Renders the dashboard with rich content immediately from static config,
// then overlays live API data when available.

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS, RACE_CALENDAR, getFlag } from '../config.js';
import { on, HookEvents, getLog } from '../services/hooks.js';
import { getTeam } from '../models/team.js';
import { loadScoringHistory, loadCachedResults } from '../services/storage.js';

export function initDashboard() {
  renderHeroNextRace();
  renderStatsRow();
  renderTeamSummary();
  renderDriverMarket();
  renderConstructorsList();
  renderPointsChart();
  renderHookLog();
  setupForceSync();

  on(HookEvents.RACE_SCHEDULE_UPDATED, renderHeroNextRace);
  on(HookEvents.TEAM_UPDATED, renderTeamSummary);
  on(HookEvents.RACE_RESULTS_RECEIVED, () => renderStatsRow());
  on(HookEvents.FANTASY_SCORES_CALCULATED, () => renderStatsRow());
  on(HookEvents.DATA_SYNC_START, () => updateSyncIndicator('syncing'));
  on(HookEvents.DATA_SYNC_COMPLETE, (data) => {
    updateSyncIndicator(data.errors?.length > 0 ? 'error' : 'synced');
    renderPointsChart();
    renderStatsRow();
  });
  on(HookEvents.DATA_SYNC_ERROR, () => updateSyncIndicator('error'));
  on(HookEvents.TEAM_BUDGET_CHANGED, updateBudgetDisplay);

  for (const event of Object.values(HookEvents)) {
    on(event, () => renderHookLog());
  }
}

// ===== Hero Next Race =====
function renderHeroNextRace() {
  const container = document.getElementById('hero-next-race');
  const now = new Date();
  const nextRace = RACE_CALENDAR.find(r => new Date(r.date) >= now) || RACE_CALENDAR[0];

  const raceDate = new Date(nextRace.date);
  const diff = raceDate - now;
  const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  const hours = Math.max(0, Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
  const mins = Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));

  const dateStr = raceDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const flag = getFlag(nextRace.flag);
  const sprintHtml = nextRace.sprint ? '<span class="sprint-badge">Sprint Weekend</span>' : '';

  // Count completed races
  const completed = RACE_CALENDAR.filter(r => new Date(r.date) < now).length;

  container.innerHTML = `
    <div class="hero-content">
      <div class="hero-race-info">
        <div class="hero-round">Round ${nextRace.round} of 24 ${sprintHtml}</div>
        <div class="hero-race-name">${flag} ${nextRace.name}</div>
        <div class="hero-circuit">${nextRace.circuit}</div>
        <div class="hero-date">${dateStr}</div>
      </div>
      <div class="hero-countdown">
        <div class="countdown-unit">
          <span class="countdown-unit__value">${days}</span>
          <span class="countdown-unit__label">Days</span>
        </div>
        <div class="countdown-unit">
          <span class="countdown-unit__value">${hours}</span>
          <span class="countdown-unit__label">Hours</span>
        </div>
        <div class="countdown-unit">
          <span class="countdown-unit__value">${mins}</span>
          <span class="countdown-unit__label">Mins</span>
        </div>
      </div>
    </div>
  `;
}

// ===== Stats Row =====
function renderStatsRow() {
  const container = document.getElementById('stats-row');
  const history = loadScoringHistory();
  const totalPoints = Object.values(history).reduce((sum, r) => sum + (r.total || 0), 0);
  const racesScored = Object.keys(history).length;
  const completed = RACE_CALENDAR.filter(r => new Date(r.date) < new Date()).length;

  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-card__value stat-card__value--red">${RACE_CALENDAR.length}</div>
      <div class="stat-card__label">Races</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__value stat-card__value--green">${completed}</div>
      <div class="stat-card__label">Completed</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__value stat-card__value--blue">${DRIVERS.length}</div>
      <div class="stat-card__label">Drivers</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__value stat-card__value--yellow">${totalPoints}</div>
      <div class="stat-card__label">Your Points</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__value stat-card__value--green">${CONSTRUCTORS.length}</div>
      <div class="stat-card__label">Teams</div>
    </div>
  `;
}

// ===== Team Summary =====
function renderTeamSummary() {
  const team = getTeam();
  const container = document.getElementById('team-mini-list');
  const pointsBadge = document.getElementById('team-points-total');

  const history = loadScoringHistory();
  const totalPoints = Object.values(history).reduce((sum, r) => sum + (r.total || 0), 0);
  pointsBadge.textContent = `${totalPoints} pts`;

  if (team.drivers.every(d => d === null)) {
    container.innerHTML = `
      <div style="text-align:center;padding:1rem 0">
        <p style="color:var(--text-muted);margin-bottom:0.75rem">Build your team to start earning fantasy points</p>
        <button class="btn btn--primary" onclick="document.querySelector('[data-view=my-team]').click()">Build Your Team</button>
      </div>
    `;
    return;
  }

  let html = '';
  for (const driverId of team.drivers) {
    if (!driverId) continue;
    const driver = DRIVERS.find(d => d.id === driverId);
    if (!driver) continue;
    const color = TEAM_COLORS[driver.team] || 'var(--border-color)';
    const constructor = CONSTRUCTORS.find(c => c.id === driver.team);
    html += `
      <div class="performer">
        <span class="performer__color" style="background:${color}"></span>
        <span class="performer__name">${driver.firstName} ${driver.lastName}</span>
        <span class="performer__team">${constructor?.shortName || ''}</span>
        <span class="performer__points">$${driver.price}M</span>
      </div>
    `;
  }

  const constructors = team.constructors || (team.constructor ? [team.constructor] : []);
  for (const cId of constructors) {
    if (!cId) continue;
    const c = CONSTRUCTORS.find(c => c.id === cId);
    if (c) {
      html += `
        <div class="performer" style="border-top:1px solid var(--border-color);padding-top:0.5rem;margin-top:0.25rem">
          <span class="performer__color" style="background:${c.color}"></span>
          <span class="performer__name">${c.shortName}</span>
          <span class="performer__team">Constructor</span>
          <span class="performer__points">$${c.price}M</span>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

// ===== Driver Market =====
function renderDriverMarket() {
  const container = document.getElementById('driver-market');
  const sorted = [...DRIVERS].sort((a, b) => b.price - a.price);

  container.innerHTML = sorted.map(d => {
    const color = TEAM_COLORS[d.team] || '#555';
    const constructor = CONSTRUCTORS.find(c => c.id === d.team);
    return `
      <div class="driver-card" style="--driver-team-color:${color}">
        <span class="driver-card__number">${d.number}</span>
        <div class="driver-card__name">${d.lastName}</div>
        <div class="driver-card__team">${constructor?.shortName || d.team}</div>
        <div class="driver-card__meta">
          <span class="driver-card__price">$${d.price}M</span>
          <span class="driver-card__code">${d.code}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Constructors List =====
function renderConstructorsList() {
  const container = document.getElementById('constructor-list');

  container.innerHTML = CONSTRUCTORS.map(c => {
    const driverNames = c.drivers.map(id => {
      const d = DRIVERS.find(d => d.id === id);
      return d ? `${d.firstName} ${d.lastName}` : id;
    }).join(' & ');

    return `
      <div class="constructor-row" style="--constructor-color:${c.color}">
        <span class="constructor-row__name">${c.shortName}</span>
        <span class="constructor-row__drivers">${driverNames}</span>
        <span class="constructor-row__price">$${c.price}M</span>
      </div>
    `;
  }).join('');
}

// ===== Points Chart =====
export function renderPointsChart() {
  const canvas = document.getElementById('points-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const history = loadScoringHistory();
  const rounds = Object.keys(history).sort((a, b) => a - b);

  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = 200 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '200px';
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = 200;
  const pad = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  if (rounds.length === 0) {
    // Draw a stylish empty state
    ctx.fillStyle = '#252a3a';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#2e3450';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    // Simulated trend line
    ctx.strokeStyle = 'rgba(225, 6, 0, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const x = pad.left + (plotW / 10) * i;
      const y = pad.top + plotH - (plotH * 0.1) - (plotH * 0.7) * (i / 10) + Math.sin(i * 0.8) * 15;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#6c7090';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Your points will be tracked here as races complete', w / 2, h / 2 + 30);
    return;
  }

  // Background
  ctx.fillStyle = '#252a3a';
  ctx.fillRect(0, 0, w, h);

  let cumulative = 0;
  const points = rounds.map(r => {
    cumulative += history[r].total || 0;
    return cumulative;
  });

  const maxPts = Math.max(...points, 10);

  // Grid
  ctx.strokeStyle = '#2e3450';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = '#6c7090';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxPts - (maxPts / 4) * i), pad.left - 8, y + 4);
  }

  // Area fill
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = pad.left + (plotW / (points.length - 1 || 1)) * i;
    const y = pad.top + plotH - (p / maxPts) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  grad.addColorStop(0, 'rgba(225, 6, 0, 0.2)');
  grad.addColorStop(1, 'rgba(225, 6, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
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
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // Round labels
  ctx.fillStyle = '#6c7090';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  rounds.forEach((r, i) => {
    const x = pad.left + (plotW / (rounds.length - 1 || 1)) * i;
    ctx.fillText(`R${r}`, x, h - 8);
  });
}

// ===== Hook Log =====
function renderHookLog() {
  const list = document.getElementById('hook-log-list');
  const log = getLog();

  if (log.length === 0) {
    list.innerHTML = '<li class="hook-log__item"><span class="hook-log__time">--:--</span><span class="hook-log__msg hook-log__msg--info">App initialized, awaiting data sync...</span></li>';
    return;
  }

  list.innerHTML = log.slice(0, 25).map(entry => {
    const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isError = entry.event.includes('error');
    const isSuccess = entry.event.includes('complete') || entry.event.includes('calculated');
    const msgClass = isError ? ' hook-log__msg--error' : isSuccess ? ' hook-log__msg--success' : ' hook-log__msg--info';
    const label = formatEventLabel(entry.event);
    return `<li class="hook-log__item"><span class="hook-log__time">${time}</span><span class="hook-log__msg${msgClass}">${label}</span></li>`;
  }).join('');
}

function formatEventLabel(event) {
  const labels = {
    'data:sync:start': 'Syncing data from Jolpica API...',
    'data:sync:complete': 'Data sync complete',
    'data:sync:error': 'Sync error occurred',
    'race:schedule:updated': 'Race schedule updated',
    'race:results:received': 'Race results received',
    'race:qualifying:received': 'Qualifying data received',
    'race:sprint:received': 'Sprint results received',
    'standings:driver:updated': 'Driver standings updated',
    'standings:constructor:updated': 'Constructor standings updated',
    'fantasy:scores:calculated': 'Fantasy scores calculated',
    'fantasy:scores:updated': 'Fantasy scores updated',
    'team:driver:added': 'Driver added to team',
    'team:driver:removed': 'Driver removed from team',
    'team:constructor:changed': 'Constructor changed',
    'team:updated': 'Team roster updated',
    'team:budget:changed': 'Budget recalculated',
    'team:boost:activated': 'Boost chip activated',
    'team:transfer:made': 'Transfer completed',
  };
  return labels[event] || event;
}

function updateSyncIndicator(status) {
  const dot = document.querySelector('.update-indicator__dot');
  const text = document.querySelector('.update-indicator__text');
  if (!dot || !text) return;

  dot.classList.remove('syncing', 'error');
  if (status === 'syncing') {
    dot.classList.add('syncing');
    text.textContent = 'Syncing...';
  } else if (status === 'error') {
    dot.classList.add('error');
    text.textContent = 'Offline';
  } else {
    text.textContent = 'Live';
  }
}

function setupForceSync() {
  const btn = document.getElementById('force-sync-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('f1fantasy:forcesync'));
    });
  }
}

function updateBudgetDisplay(budget) {
  const el = document.querySelector('.budget-pill__value');
  if (el) el.textContent = `$${budget.toFixed(1)}M`;
}
