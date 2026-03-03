// Constructor Profile Popup
// Renders a modal with constructor colors, both drivers, stats, and live data.
// Triggered by clicking any element with data-constructor-profile="constructorId".

import { CONSTRUCTORS, DRIVERS, TEAM_COLORS, getFlag } from '../config.js';
import { loadScoringHistory, loadCachedResults, loadTestResults } from '../services/storage.js';

function getDriverHeadshotUrl(driver) {
  const first3 = driver.firstName.slice(0, 3).toUpperCase();
  const last3 = driver.lastName.slice(0, 3).toUpperCase();
  const code = `${first3}${last3}01`;
  const firstLetter = driver.firstName.charAt(0).toUpperCase();
  return `https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/${firstLetter}/${code}_${driver.firstName}_${driver.lastName}/${code.toLowerCase()}.png.transform/2col/image.png`;
}

/**
 * Build a simple SVG bar chart sparkline for per-race points.
 * Returns an SVG string. Each bar represents one race round.
 */
function buildSparkline(pointsPerRound, color) {
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

export function initConstructorProfile() {
  const modal = document.getElementById('constructor-profile-modal');
  if (!modal) return;

  const backdrop = modal.querySelector('.constructor-profile__backdrop');
  const closeBtn = document.getElementById('constructor-profile-close');

  backdrop.addEventListener('click', closeConstructorProfile);
  closeBtn.addEventListener('click', closeConstructorProfile);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeConstructorProfile();
  });

  // Global delegation: click or Enter/Space on any element with data-constructor-profile
  function handleTrigger(e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('[data-no-profile]')) return;
    const el = e.target.closest('[data-constructor-profile]');
    if (el) {
      const id = el.dataset.constructorProfile;
      if (id) {
        if (e.type === 'keydown') e.preventDefault();
        openConstructorProfile(id);
      }
    }
  }

  document.addEventListener('click', handleTrigger);
  document.addEventListener('keydown', handleTrigger);
}

export function openConstructorProfile(constructorId) {
  const constructor = CONSTRUCTORS.find(c => c.id === constructorId);
  if (!constructor) return;

  const modal = document.getElementById('constructor-profile-modal');
  const color = constructor.color || TEAM_COLORS[constructorId] || '#555';

  // Fantasy scoring history — aggregate across all rounds
  const history = loadScoringHistory();
  const sortedRounds = Object.keys(history).sort((a, b) => Number(a) - Number(b));

  let totalFantasyPts = 0;
  let lastFantasyPts = null;
  const pointsPerRound = [];

  for (const round of sortedRounds) {
    const rData = history[round];
    const cScore = rData.constructorScores?.[constructorId];
    if (cScore !== undefined) {
      const pts = typeof cScore === 'object' ? (cScore.total || 0) : cScore;
      totalFantasyPts += pts;
      pointsPerRound.push(pts);
    } else {
      pointsPerRound.push(0);
    }
  }
  if (sortedRounds.length > 0) {
    const lastRound = sortedRounds[sortedRounds.length - 1];
    const cScore = history[lastRound]?.constructorScores?.[constructorId];
    if (cScore !== undefined) {
      lastFantasyPts = typeof cScore === 'object' ? (cScore.total || 0) : cScore;
    }
  }

  // WCC standing from cached API data
  const cached = loadCachedResults();
  const constructorStandings = cached.constructorStandings || [];
  const standing = constructorStandings.find(s => s.Constructor?.constructorId === constructorId);

  // Apply team color
  const panel = document.getElementById('constructor-profile-panel');
  panel.style.setProperty('--cp-team-color', color);

  // Hero: constructor name and color
  document.getElementById('constructor-profile-name').textContent = constructor.name;
  const shortEl = document.getElementById('constructor-profile-short');
  shortEl.textContent = constructor.shortName;
  shortEl.style.color = color;

  // Driver duo
  const driversEl = document.getElementById('constructor-profile-drivers');
  driversEl.innerHTML = constructor.drivers.map(dId => {
    const d = DRIVERS.find(d => d.id === dId);
    if (!d) return '';
    const photoUrl = getDriverHeadshotUrl(d);
    return `
      <div class="cp-driver" data-driver-profile="${d.id}" role="button" tabindex="0" aria-label="View ${d.firstName} ${d.lastName} profile">
        <div class="cp-driver__photo-wrap">
          <img class="cp-driver__photo" src="${photoUrl}" alt="${d.firstName} ${d.lastName}"
               onerror="this.style.opacity='0'" onload="this.style.opacity='1'">
          <span class="cp-driver__number">${d.number}</span>
        </div>
        <div class="cp-driver__info">
          <strong class="cp-driver__name">${d.firstName} ${d.lastName}</strong>
          <span class="cp-driver__code">${d.code}</span>
          <span class="cp-driver__price">$${d.price}M</span>
        </div>
      </div>
    `;
  }).join('');

  // Stats grid
  let statsHtml = `
    <div class="dp-stat">
      <span class="dp-stat__label">Fantasy Price</span>
      <span class="dp-stat__value dp-stat__value--green">$${constructor.price}M</span>
    </div>
    <div class="dp-stat">
      <span class="dp-stat__label">Fantasy Pts</span>
      <span class="dp-stat__value">${totalFantasyPts}</span>
    </div>
  `;

  if (lastFantasyPts !== null) {
    const cls = lastFantasyPts >= 0 ? 'dp-stat__value--pos' : 'dp-stat__value--neg';
    statsHtml += `
      <div class="dp-stat">
        <span class="dp-stat__label">Last Race Pts</span>
        <span class="dp-stat__value ${cls}">${lastFantasyPts >= 0 ? '+' : ''}${lastFantasyPts}</span>
      </div>
    `;
  }

  if (standing) {
    statsHtml += `
      <div class="dp-stat">
        <span class="dp-stat__label">WCC Position</span>
        <span class="dp-stat__value">P${standing.position}</span>
      </div>
      <div class="dp-stat">
        <span class="dp-stat__label">Season Pts</span>
        <span class="dp-stat__value">${standing.points}</span>
      </div>
    `;
  }

  // Qualifying bonus and pit stop pts from test results
  const testResults = loadTestResults();
  let totalQualiBons = 0;
  let totalPitPts = 0;
  for (const ws of Object.values(testResults)) {
    const cScore = ws.constructorScores?.[constructorId];
    if (cScore) {
      totalQualiBons += cScore.qualifyingBonus || 0;
      totalPitPts += cScore.pitStopPoints || 0;
    }
  }
  if (totalQualiBons !== 0 || totalPitPts !== 0) {
    statsHtml += `
      <div class="dp-stat">
        <span class="dp-stat__label">Quali Bonus</span>
        <span class="dp-stat__value">${totalQualiBons}</span>
      </div>
      <div class="dp-stat">
        <span class="dp-stat__label">Pit Stop Pts</span>
        <span class="dp-stat__value">${totalPitPts}</span>
      </div>
    `;
  }

  document.getElementById('constructor-profile-stats').innerHTML = statsHtml;

  // Points over time sparkline
  const chartEl = document.getElementById('constructor-profile-chart');
  if (pointsPerRound.length > 0) {
    chartEl.style.display = '';
    const sparkEl = chartEl.querySelector('.cp-chart__spark');
    if (sparkEl) sparkEl.innerHTML = buildSparkline(pointsPerRound, color);
    const label = document.getElementById('constructor-profile-chart-label');
    if (label) label.textContent = `Fantasy points over ${pointsPerRound.length} race${pointsPerRound.length > 1 ? 's' : ''}`;
  } else {
    chartEl.style.display = 'none';
  }

  // Show modal
  modal.removeAttribute('hidden');
  modal.style.display = 'flex';
  document.getElementById('constructor-profile-close').focus();
}

export function closeConstructorProfile() {
  const modal = document.getElementById('constructor-profile-modal');
  if (modal) {
    modal.setAttribute('hidden', '');
    modal.style.display = 'none';
  }
}
