// Driver Profile Popup
// Renders a modal with driver photo, stats, and live data.
// Triggered by clicking any element with data-driver-profile="driverId".

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS, getFlag } from '../config.js';
import { loadScoringHistory, loadCachedResults, loadTestResults } from '../services/storage.js';

// Wikipedia page titles for each driver (used to fetch their headshot)
const WIKI_TITLES = {
  norris:         'Lando_Norris',
  max_verstappen: 'Max_Verstappen',
  russell:        'George_Russell_(racing_driver)',
  leclerc:        'Charles_Leclerc',
  piastri:        'Oscar_Piastri',
  hamilton:       'Lewis_Hamilton',
  antonelli:      'Andrea_Kimi_Antonelli',
  sainz:          'Carlos_Sainz_Jr.',
  alonso:         'Fernando_Alonso',
  gasly:          'Pierre_Gasly',
  hadjar:         'Isack_Hadjar',
  lawson:         'Liam_Lawson_(racing_driver)',
  albon:          'Alexander_Albon',
  ocon:           'Esteban_Ocon',
  hulkenberg:     'Nico_Hülkenberg',
  stroll:         'Lance_Stroll',
  bearman:        'Oliver_Bearman',
  colapinto:      'Franco_Colapinto',
  perez:          'Sergio_Pérez',
  bortoleto:      'Gabriel_Bortoleto',
  bottas:         'Valtteri_Bottas',
  lindblad:       'Arvid_Lindblad',
};

// In-memory cache so each driver is only fetched once per session
const _photoCache = {};

async function fetchDriverPhoto(driverId) {
  if (_photoCache[driverId] !== undefined) return _photoCache[driverId];

  const title = WIKI_TITLES[driverId];
  if (!title) { _photoCache[driverId] = null; return null; }

  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    if (!res.ok) { _photoCache[driverId] = null; return null; }
    const data = await res.json();
    const raw = data.thumbnail?.source || null;
    // Request a 320 px wide version — Wikimedia serves any width on demand
    const url = raw ? raw.replace(/\/(\d+)px-([^/]+)$/, '/320px-$2') : null;
    _photoCache[driverId] = url;
    return url;
  } catch {
    _photoCache[driverId] = null;
    return null;
  }
}

export function initDriverProfile() {
  const modal = document.getElementById('driver-profile-modal');
  if (!modal) return;

  const backdrop = modal.querySelector('.driver-profile__backdrop');
  const closeBtn = document.getElementById('driver-profile-close');

  backdrop.addEventListener('click', closeDriverProfile);
  closeBtn.addEventListener('click', closeDriverProfile);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeDriverProfile();
  });

  // Global event delegation: click or Enter/Space on any element with data-driver-profile
  function handleProfileTrigger(e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('[data-no-profile]')) return;
    const el = e.target.closest('[data-driver-profile]');
    if (el) {
      const driverId = el.dataset.driverProfile;
      if (driverId) {
        if (e.type === 'keydown') e.preventDefault();
        openDriverProfile(driverId);
      }
    }
  }

  document.addEventListener('click', handleProfileTrigger);
  document.addEventListener('keydown', handleProfileTrigger);
}

export function openDriverProfile(driverId) {
  const driver = DRIVERS.find(d => d.id === driverId);
  if (!driver) return;

  const modal = document.getElementById('driver-profile-modal');
  const constructor = CONSTRUCTORS.find(c => c.id === driver.team);
  const color = TEAM_COLORS[driver.team] || '#555';

  // Fantasy scoring history
  const history = loadScoringHistory();
  let totalPts = 0;
  let lastPts = null;
  const sortedRounds = Object.keys(history).sort((a, b) => Number(a) - Number(b));
  for (const [, rData] of Object.entries(history)) {
    if (rData.driverScores?.[driverId]) {
      const s = rData.driverScores[driverId];
      totalPts += typeof s === 'object' ? (s.total || 0) : s;
    }
  }
  if (sortedRounds.length > 0) {
    const lastRound = sortedRounds[sortedRounds.length - 1];
    const s = history[lastRound]?.driverScores?.[driverId];
    if (s !== undefined) lastPts = typeof s === 'object' ? (s.total || 0) : s;
  }

  // WDC standing from API cache
  const cached = loadCachedResults();
  const driverStandings = cached.driverStandings || [];
  const standing = driverStandings.find(s => s.Driver?.driverId === driverId);

  // Last race finish position from test results
  const testResults = loadTestResults();
  const testRounds = Object.keys(testResults).sort((a, b) => Number(a) - Number(b));
  let lastRaceFinish = null;
  if (testRounds.length > 0) {
    const lr = testRounds[testRounds.length - 1];
    const sc = testResults[lr]?.driverScores?.[driverId];
    if (sc?.finish !== undefined) lastRaceFinish = sc.finish;
  }

  // Apply team color to panel
  const panel = document.getElementById('driver-profile-panel');
  panel.style.setProperty('--dp-team-color', color);

  // Photo: reset to invisible; preload via Image() then fade in
  const photo = document.getElementById('driver-profile-photo');
  photo.src = '';
  photo.alt = '';
  photo.style.opacity = '0';
  // Tag the element with the current driver so stale callbacks can self-cancel
  photo.dataset.forDriver = driverId;

  fetchDriverPhoto(driverId).then(url => {
    // Bail out if a different profile is now showing, or modal was closed
    if (modal.hidden || photo.dataset.forDriver !== driverId || !url) return;

    // Preload via a detached Image so the real <img> src switches without flash
    const tmp = new Image();
    tmp.onload = () => {
      if (photo.dataset.forDriver !== driverId) return; // stale
      photo.src = url;
      photo.alt = `${driver.firstName} ${driver.lastName}`;
      // rAF ensures the browser has painted before we start the transition
      requestAnimationFrame(() => { photo.style.opacity = '1'; });
    };
    tmp.src = url;
  });

  // Number overlay
  document.getElementById('driver-profile-number').textContent = driver.number;

  // Name + team
  document.getElementById('driver-profile-name').textContent =
    `${driver.firstName} ${driver.lastName}`;
  const teamEl = document.getElementById('driver-profile-team');
  teamEl.textContent = constructor?.name || driver.team;
  teamEl.style.color = color;

  // Stats grid
  const flagEmoji = getFlag(driver.nationality);
  const nationalityLabel = NATIONALITY_LABELS[driver.nationality] || driver.nationality;

  let statsHtml = `
    <div class="dp-stat">
      <span class="dp-stat__label">Number</span>
      <span class="dp-stat__value">#${driver.number}</span>
    </div>
    <div class="dp-stat">
      <span class="dp-stat__label">Code</span>
      <span class="dp-stat__value">${driver.code}</span>
    </div>
    <div class="dp-stat">
      <span class="dp-stat__label">Nationality</span>
      <span class="dp-stat__value">${flagEmoji} ${nationalityLabel}</span>
    </div>
    <div class="dp-stat">
      <span class="dp-stat__label">Fantasy Price</span>
      <span class="dp-stat__value dp-stat__value--green">$${driver.price}M</span>
    </div>
    <div class="dp-stat">
      <span class="dp-stat__label">Fantasy Pts</span>
      <span class="dp-stat__value">${totalPts}</span>
    </div>
  `;

  if (lastPts !== null) {
    const cls = lastPts >= 0 ? 'dp-stat__value--pos' : 'dp-stat__value--neg';
    statsHtml += `
      <div class="dp-stat">
        <span class="dp-stat__label">Last Race Pts</span>
        <span class="dp-stat__value ${cls}">${lastPts >= 0 ? '+' : ''}${lastPts}</span>
      </div>
    `;
  }

  if (lastRaceFinish !== null) {
    statsHtml += `
      <div class="dp-stat">
        <span class="dp-stat__label">Last Finish</span>
        <span class="dp-stat__value">P${lastRaceFinish}</span>
      </div>
    `;
  }

  if (standing) {
    statsHtml += `
      <div class="dp-stat">
        <span class="dp-stat__label">WDC Position</span>
        <span class="dp-stat__value">P${standing.position}</span>
      </div>
      <div class="dp-stat">
        <span class="dp-stat__label">Season Pts</span>
        <span class="dp-stat__value">${standing.points}</span>
      </div>
    `;
  }

  document.getElementById('driver-profile-stats').innerHTML = statsHtml;

  // Show modal
  modal.removeAttribute('hidden');
  modal.style.display = 'flex';
  document.getElementById('driver-profile-close').focus();
}

export function closeDriverProfile() {
  const modal = document.getElementById('driver-profile-modal');
  if (modal) {
    modal.setAttribute('hidden', '');
    modal.style.display = 'none';
  }
}

// Nationality code → readable label
const NATIONALITY_LABELS = {
  GBR: 'British', NED: 'Dutch', MON: 'Monégasque', AUS: 'Australian',
  ESP: 'Spanish', ITA: 'Italian', FRA: 'French', DEU: 'German',
  CAN: 'Canadian', NZL: 'New Zealander', THA: 'Thai', MEX: 'Mexican',
  BRA: 'Brazilian', FIN: 'Finnish', ARG: 'Argentine',
};
