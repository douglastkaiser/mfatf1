// User Profile Popup
// Renders a modal with a league member's team, points history, and stats.
// Triggered by clicking any element with data-user-profile="userId".

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS } from '../config.js';
import { getUserProfile } from '../services/auth.js';
import { loadScoringHistory } from '../services/storage.js';

/**
 * Build a simple SVG line chart showing cumulative points over time.
 */
function buildLineChart(cumulativePoints, color) {
  if (!cumulativePoints || cumulativePoints.length === 0) return '';
  const W = 100;
  const H = 52;
  const padT = 4;
  const padB = 4;
  const plotH = H - padT - padB;
  const count = cumulativePoints.length;
  const max = Math.max(...cumulativePoints, 1);

  const pts = cumulativePoints.map((v, i) => {
    const x = count === 1 ? 50 : (i / (count - 1)) * W;
    const y = padT + plotH - Math.round((v / max) * plotH);
    return `${x},${y}`;
  }).join(' ');

  // Area fill
  const firstX = count === 1 ? 50 : 0;
  const lastX = count === 1 ? 50 : W;
  const bottomY = padT + plotH;
  const areaPoints = `${firstX},${bottomY} ${pts} ${lastX},${bottomY}`;

  return `
    <svg class="up-line-chart" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="up-grad-${color.replace('#', '')}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.03"/>
        </linearGradient>
      </defs>
      <polygon points="${areaPoints}" fill="url(#up-grad-${color.replace('#', '')})" />
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  `;
}

/**
 * Build a simple SVG bar sparkline for per-race points (same as constructor).
 */
function buildBarSparkline(pointsPerRound, color) {
  if (!pointsPerRound || pointsPerRound.length === 0) return '';
  const values = pointsPerRound.map(p => Math.max(0, p));
  const max = Math.max(...values, 1);
  const count = values.length;
  const W = 100;
  const H = 48;
  const barW = Math.max(2, (W / count) - 1.5);

  const bars = values.map((v, i) => {
    const h = Math.round((v / max) * H);
    const x = i * (W / count);
    const y = H - h;
    return `<rect x="${x + 0.75}" y="${y}" width="${barW}" height="${h}" rx="1" fill="${color}" opacity="${h === 0 ? 0.2 : 0.85}"/>`;
  }).join('');

  return `
    <svg class="cp-sparkline" viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
      ${bars}
    </svg>
  `;
}

// In-memory cache to avoid repeated Firestore calls during one session
const _profileCache = new Map();

export function initUserProfile() {
  const modal = document.getElementById('user-profile-modal');
  if (!modal) return;

  const backdrop = modal.querySelector('.user-profile__backdrop');
  const closeBtn = document.getElementById('user-profile-close');

  backdrop.addEventListener('click', closeUserProfile);
  closeBtn.addEventListener('click', closeUserProfile);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeUserProfile();
  });

  // Global delegation
  function handleTrigger(e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('[data-no-profile]')) return;
    const el = e.target.closest('[data-user-profile]');
    if (el) {
      const uid = el.dataset.userProfile;
      if (uid) {
        if (e.type === 'keydown') e.preventDefault();
        openUserProfile(uid, el.dataset.userDisplayName || '');
      }
    }
  }

  document.addEventListener('click', handleTrigger);
  document.addEventListener('keydown', handleTrigger);
}

export async function openUserProfile(uid, fallbackName) {
  const modal = document.getElementById('user-profile-modal');
  if (!modal) return;

  // Show modal immediately with loading state
  document.getElementById('user-profile-display-name').textContent = fallbackName || 'Loading...';
  document.getElementById('user-profile-avatar').textContent = (fallbackName || '?').charAt(0).toUpperCase();
  document.getElementById('user-profile-role').textContent = '';
  document.getElementById('user-profile-role').style.display = 'none';
  document.getElementById('user-profile-team').innerHTML = '<div class="up-loading">Loading team...</div>';
  document.getElementById('user-profile-stats').innerHTML = '';
  document.getElementById('user-profile-chart').style.display = 'none';

  modal.removeAttribute('hidden');
  modal.style.display = 'flex';
  document.getElementById('user-profile-close').focus();

  let profile = _profileCache.get(uid);

  if (!profile) {
    try {
      profile = await getUserProfile(uid);
      if (profile) _profileCache.set(uid, profile);
    } catch {
      // Firestore unavailable — use whatever fallback we have
    }
  }

  if (!profile) {
    document.getElementById('user-profile-display-name').textContent = fallbackName || 'Unknown User';
    document.getElementById('user-profile-team').innerHTML = '<div class="up-loading">Could not load profile.</div>';
    return;
  }

  _renderUserProfile(profile);
}

function _renderUserProfile(profile) {
  const name = profile.displayName || 'Unknown';
  const avatarColor = _nameToColor(name);

  // Avatar
  const avatarEl = document.getElementById('user-profile-avatar');
  avatarEl.textContent = name.charAt(0).toUpperCase();
  avatarEl.style.background = avatarColor;

  document.getElementById('user-profile-display-name').textContent = name;

  // Role badge
  const roleEl = document.getElementById('user-profile-role');
  if (profile.role === 'admin') {
    roleEl.textContent = 'Commissioner';
    roleEl.style.display = '';
  } else {
    roleEl.textContent = '';
    roleEl.style.display = 'none';
  }

  // Team
  const team = profile.team || {};
  const teamDrivers = (team.drivers || []).filter(Boolean);
  const teamConstructors = (team.constructors || (team.constructor ? [team.constructor] : [])).filter(Boolean);

  let teamHtml = '';

  if (teamDrivers.length === 0 && teamConstructors.length === 0) {
    teamHtml = '<div class="up-no-team">No team built yet</div>';
  } else {
    if (teamDrivers.length > 0) {
      teamHtml += '<div class="up-team-section-label">Drivers</div>';
      teamHtml += teamDrivers.map(dId => {
        const d = DRIVERS.find(d => d.id === dId);
        if (!d) return '';
        const color = TEAM_COLORS[d.team] || '#555';
        const constructor = CONSTRUCTORS.find(c => c.id === d.team);
        return `
          <div class="up-team-row" data-driver-profile="${d.id}" role="button" tabindex="0" aria-label="View ${d.firstName} ${d.lastName} profile">
            <span class="up-team-dot" style="background:${color}"></span>
            <span class="up-team-number" style="color:${color}">${d.number}</span>
            <span class="up-team-name"><strong>${d.lastName}</strong> ${d.firstName}</span>
            <span class="up-team-meta">${constructor?.shortName || ''}</span>
            <span class="up-team-price">$${d.price}M</span>
          </div>
        `;
      }).join('');
    }

    if (teamConstructors.length > 0) {
      teamHtml += '<div class="up-team-section-label">Constructors</div>';
      teamHtml += teamConstructors.map(cId => {
        const c = CONSTRUCTORS.find(c => c.id === cId);
        if (!c) return '';
        const driverNames = c.drivers.map(dId => {
          const d = DRIVERS.find(d => d.id === dId);
          return d ? d.lastName : dId;
        }).join(' & ');
        return `
          <div class="up-team-row" data-constructor-profile="${c.id}" role="button" tabindex="0" aria-label="View ${c.name} profile">
            <span class="up-team-dot" style="background:${c.color}"></span>
            <span class="up-team-number" style="color:${c.color}">C</span>
            <span class="up-team-name"><strong>${c.shortName}</strong></span>
            <span class="up-team-meta">${driverNames}</span>
            <span class="up-team-price">$${c.price}M</span>
          </div>
        `;
      }).join('');
    }
  }
  document.getElementById('user-profile-team').innerHTML = teamHtml;

  // Scoring history
  const history = profile.scoringHistory || {};
  const sortedRounds = Object.keys(history).sort((a, b) => Number(a) - Number(b));
  let totalPoints = 0;
  let lastRacePts = null;
  let cumulativePts = [];
  let cumSum = 0;
  let perRacePts = [];

  for (const round of sortedRounds) {
    const rData = history[round];
    const pts = rData.total || 0;
    totalPoints += pts;
    cumSum += pts;
    perRacePts.push(pts);
    cumulativePts.push(cumSum);
    lastRacePts = pts;
  }

  // Calculate team value
  let teamValue = 0;
  for (const dId of teamDrivers) {
    const d = DRIVERS.find(d => d.id === dId);
    if (d) teamValue += d.price;
  }
  for (const cId of teamConstructors) {
    const c = CONSTRUCTORS.find(c => c.id === cId);
    if (c) teamValue += c.price;
  }

  // Stats grid
  let statsHtml = `
    <div class="dp-stat">
      <span class="dp-stat__label">Total Pts</span>
      <span class="dp-stat__value">${totalPoints}</span>
    </div>
    <div class="dp-stat">
      <span class="dp-stat__label">Races Scored</span>
      <span class="dp-stat__value">${sortedRounds.length}</span>
    </div>
    <div class="dp-stat">
      <span class="dp-stat__label">Team Value</span>
      <span class="dp-stat__value dp-stat__value--green">$${teamValue}M</span>
    </div>
    <div class="dp-stat">
      <span class="dp-stat__label">Drivers</span>
      <span class="dp-stat__value">${teamDrivers.length}/5</span>
    </div>
  `;

  if (lastRacePts !== null && sortedRounds.length > 0) {
    const cls = lastRacePts >= 0 ? 'dp-stat__value--pos' : 'dp-stat__value--neg';
    statsHtml += `
      <div class="dp-stat">
        <span class="dp-stat__label">Last Race Pts</span>
        <span class="dp-stat__value ${cls}">${lastRacePts >= 0 ? '+' : ''}${lastRacePts}</span>
      </div>
    `;
  }

  if (sortedRounds.length > 1) {
    const avg = Math.round((totalPoints / sortedRounds.length) * 10) / 10;
    statsHtml += `
      <div class="dp-stat">
        <span class="dp-stat__label">Avg / Race</span>
        <span class="dp-stat__value">${avg}</span>
      </div>
    `;
  }

  document.getElementById('user-profile-stats').innerHTML = statsHtml;

  // Points over time
  const chartEl = document.getElementById('user-profile-chart');
  if (cumulativePts.length > 0) {
    chartEl.style.display = '';
    chartEl.querySelector('.up-chart__spark').innerHTML = buildLineChart(cumulativePts, avatarColor);
    chartEl.querySelector('.up-chart__label').textContent =
      `Cumulative points over ${sortedRounds.length} race${sortedRounds.length > 1 ? 's' : ''}`;
  } else {
    chartEl.style.display = 'none';
  }
}

export function closeUserProfile() {
  const modal = document.getElementById('user-profile-modal');
  if (modal) {
    modal.setAttribute('hidden', '');
    modal.style.display = 'none';
  }
}

// Deterministic color from a display name string
function _nameToColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#3671C6', '#E8002D', '#FF8000', '#27F4D2', '#229971',
    '#1868DB', '#6692FF', '#00A1E8', '#B6BABD', '#FF2D00',
  ];
  return colors[Math.abs(hash) % colors.length];
}
