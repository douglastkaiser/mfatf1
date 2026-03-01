// Dashboard UI
// Renders the dashboard with rich content immediately from static config,
// then overlays live API data when available.

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS, RACE_CALENDAR, getFlag } from '../config.js';
import { on, HookEvents, getLog } from '../services/hooks.js';
import { getTeam } from '../models/team.js';
import { loadScoringHistory } from '../services/storage.js';

let _lastSyncTime = null; // track last successful sync for activity footer

export function initDashboard() {
  renderHeroNextRace();
  renderStatsRow();
  renderTeamSummary();
  renderDriverMarket();
  renderConstructorsList();
  renderPointsChart();
  renderHookLog();
  renderOnboardingBanner();
  setupForceSync();

  on(HookEvents.RACE_SCHEDULE_UPDATED, renderHeroNextRace);
  on(HookEvents.TEAM_UPDATED, () => {
    renderTeamSummary();
    renderHookLog();
    renderOnboardingBanner();
  });
  on(HookEvents.RACE_RESULTS_RECEIVED, () => renderStatsRow());
  on(HookEvents.FANTASY_SCORES_CALCULATED, () => renderStatsRow());
  on(HookEvents.DATA_SYNC_START, () => updateSyncIndicator('syncing'));
  on(HookEvents.DATA_SYNC_COMPLETE, (data) => {
    _lastSyncTime = new Date();
    updateSyncIndicator(data.errors?.length > 0 ? 'error' : 'synced');
    renderPointsChart();
    renderStatsRow();
    renderHookLog();
  });
  on(HookEvents.DATA_SYNC_ERROR, () => updateSyncIndicator('error'));
  on(HookEvents.TEAM_BUDGET_CHANGED, updateBudgetDisplay);

  // Log team events for activity feed
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

  const completed = RACE_CALENDAR.filter(r => new Date(r.date) < now).length;
  const total = RACE_CALENDAR.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  container.innerHTML = `
    <div class="hero-content">
      <div class="hero-race-info">
        <div class="hero-round">
          Round ${nextRace.round} of ${total} ${sprintHtml}
        </div>
        <div class="season-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Season progress: ${completed} of ${total} races completed">
          <div class="season-progress__fill" style="width:${pct}%"></div>
        </div>
        <div class="season-progress__label">${completed} of ${total} races complete</div>
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

let _chartState = null; // stored for hover interactivity

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

  // Toggle empty overlay
  const emptyOverlay = document.getElementById('chart-empty-overlay');
  if (emptyOverlay) {
    emptyOverlay.hidden = rounds.length > 0;
  }

  ctx.clearRect(0, 0, w, h);

  if (rounds.length === 0) {
    drawEmptyChart(ctx, w, h, pad, plotW, plotH);
    _chartState = null;
    removeChartListeners(canvas);
    return;
  }

  let cumulative = 0;
  const points = rounds.map(r => {
    cumulative += history[r].total || 0;
    return cumulative;
  });

  const maxPts = Math.max(...points, 10);

  drawChartBase(ctx, w, h, pad, points, rounds, maxPts, plotW, plotH);

  _chartState = { ctx, w, h, pad, points, rounds, maxPts, plotW, plotH };
  setupChartHover(canvas);
}

function drawChartBase(ctx, w, h, pad, points, rounds, maxPts, plotW, plotH) {
  ctx.fillStyle = '#252a3a';
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = '#2e3450';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = '#8b90a8';
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
  ctx.fillStyle = '#8b90a8';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  rounds.forEach((r, i) => {
    const x = pad.left + (plotW / (rounds.length - 1 || 1)) * i;
    ctx.fillText(`R${r}`, x, h - 8);
  });
}

function drawEmptyChart(ctx, w, h, pad, plotW, plotH) {
  ctx.fillStyle = '#252a3a';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#2e3450';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  }

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
}

// ===== Chart Hover Tooltips (P2.1) =====

function setupChartHover(canvas) {
  removeChartListeners(canvas);

  canvas._hoverListener = (e) => handleChartHover(e, canvas);
  canvas._leaveListener = () => {
    if (!_chartState) return;
    const { ctx, w, h, pad, points, rounds, maxPts, plotW, plotH } = _chartState;
    drawChartBase(ctx, w, h, pad, points, rounds, maxPts, plotW, plotH);
  };

  canvas.addEventListener('mousemove', canvas._hoverListener);
  canvas.addEventListener('mouseleave', canvas._leaveListener);
}

function removeChartListeners(canvas) {
  if (canvas._hoverListener) canvas.removeEventListener('mousemove', canvas._hoverListener);
  if (canvas._leaveListener) canvas.removeEventListener('mouseleave', canvas._leaveListener);
}

function handleChartHover(e, canvas) {
  if (!_chartState) return;
  const { ctx, w, h, pad, points, rounds, maxPts, plotW, plotH } = _chartState;
  if (!points.length) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Find nearest data point within 20px
  let nearest = null;
  let minDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const x = pad.left + (plotW / (points.length - 1 || 1)) * i;
    const y = pad.top + plotH - (points[i] / maxPts) * plotH;
    const dist = Math.sqrt((mouseX - x) ** 2 + (mouseY - y) ** 2);
    if (dist < 20 && dist < minDist) {
      minDist = dist;
      nearest = { x, y, round: rounds[i], pts: points[i] };
    }
  }

  // Redraw base chart
  drawChartBase(ctx, w, h, pad, points, rounds, maxPts, plotW, plotH);

  if (!nearest) return;

  // Draw highlighted dot
  ctx.beginPath();
  ctx.arc(nearest.x, nearest.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = '#e10600';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Tooltip content
  const race = RACE_CALENDAR.find(r => r.round === parseInt(nearest.round));
  const raceName = race?.name || `Round ${nearest.round}`;
  const line1 = `Round ${nearest.round}: ${raceName}`;
  const line2 = `${nearest.pts} pts cumulative`;

  ctx.save();
  ctx.font = 'bold 11px Inter, sans-serif';
  const l1w = ctx.measureText(line1).width;
  ctx.font = '10px Inter, sans-serif';
  const l2w = ctx.measureText(line2).width;
  const tipW = Math.max(l1w, l2w) + 24;
  const tipH = 46;

  let tx = nearest.x + 14;
  if (tx + tipW > w - 8) tx = nearest.x - tipW - 14;
  let ty = nearest.y - tipH / 2;
  if (ty < pad.top) ty = pad.top;
  if (ty + tipH > h - pad.bottom) ty = h - pad.bottom - tipH;

  // Tooltip box
  ctx.fillStyle = 'rgba(22, 25, 36, 0.95)';
  ctx.strokeStyle = '#2e3450';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(tx, ty, tipW, tipH);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#eaecf0';
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(line1, tx + 12, ty + 18);

  ctx.fillStyle = '#e10600';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText(line2, tx + 12, ty + 33);
  ctx.restore();
}

// ===== Recent Activity Log (P1.4) =====

const TEAM_EVENT_LABELS = {
  'team:driver:added': { label: 'Driver added to team', cls: 'activity-log__msg--team' },
  'team:driver:removed': { label: 'Driver removed from team', cls: '' },
  'team:constructor:changed': { label: 'Constructor updated', cls: 'activity-log__msg--team' },
  'team:updated': null, // skip generic event
  'team:budget:changed': { label: 'Budget recalculated', cls: '' },
  'team:boost:activated': { label: 'Boost chip activated', cls: 'activity-log__msg--boost' },
  'team:transfer:made': { label: 'Transfer completed', cls: 'activity-log__msg--team' },
};

function renderHookLog() {
  const list = document.getElementById('hook-log-list');
  const log = getLog();

  // Filter to team events only, skip 'team:updated' (too noisy)
  const teamEvents = log.filter(e => e.event.startsWith('team:') && e.event !== 'team:updated');

  if (teamEvents.length === 0) {
    list.innerHTML = '<li class="activity-log__empty">No team changes yet this session.</li>';
  } else {
    list.innerHTML = teamEvents.slice(0, 10).map(entry => {
      const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const meta = TEAM_EVENT_LABELS[entry.event];
      const label = meta?.label || entry.event;
      const cls = meta?.cls || '';
      return `
        <li class="activity-log__item">
          <span class="activity-log__time">${time}</span>
          <span class="activity-log__msg ${cls}">${label}</span>
        </li>
      `;
    }).join('');
  }

  // Update sync status footer
  const syncTimeEl = document.getElementById('last-sync-time');
  if (syncTimeEl) {
    if (_lastSyncTime) {
      syncTimeEl.textContent = `Synced ${_lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      syncTimeEl.textContent = 'Not yet synced';
    }
  }
}

// ===== Onboarding Banner (P0.4) =====

function renderOnboardingBanner() {
  // Don't show if already dismissed or team has at least one driver
  if (localStorage.getItem('f1fantasy_onboarding_dismissed')) return;

  const team = getTeam();
  const hasAnyDriver = team.drivers.some(d => d !== null);
  if (hasAnyDriver) return;

  const dashGrid = document.querySelector('.dashboard-grid');
  if (!dashGrid) return;

  // Don't duplicate
  if (document.getElementById('onboarding-banner-card')) return;

  const banner = document.createElement('div');
  banner.id = 'onboarding-banner-card';
  banner.className = 'onboarding-banner';
  banner.innerHTML = `
    <div class="onboarding-banner__icon" aria-hidden="true">&#127945;</div>
    <div class="onboarding-banner__body">
      <div class="onboarding-banner__title">Welcome to F1 Fantasy!</div>
      <ul class="onboarding-banner__list">
        <li>Pick <strong>5 drivers</strong> and <strong>2 constructors</strong> within a $100M budget</li>
        <li>Earn points based on real race results every weekend</li>
        <li>Use <strong>boost chips</strong> like DRS and Wildcard to maximise your score</li>
      </ul>
      <div class="onboarding-banner__actions">
        <button class="btn btn--primary" id="onboarding-build-btn">Build Your Team</button>
        <button class="onboarding-banner__dismiss" id="onboarding-dismiss-btn">Dismiss</button>
      </div>
    </div>
    <button class="onboarding-banner__close" id="onboarding-close-btn" aria-label="Dismiss welcome banner">&times;</button>
  `;

  dashGrid.insertAdjacentElement('afterbegin', banner);

  function dismiss() {
    localStorage.setItem('f1fantasy_onboarding_dismissed', '1');
    banner.remove();
  }

  document.getElementById('onboarding-build-btn').addEventListener('click', () => {
    dismiss();
    document.querySelector('[data-view="my-team"]')?.click();
  });
  document.getElementById('onboarding-dismiss-btn').addEventListener('click', dismiss);
  document.getElementById('onboarding-close-btn').addEventListener('click', dismiss);
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
