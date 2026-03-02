// Driver Profile Popup
// Renders a modal with driver photo, stats, and live data.
// Triggered by clicking any element with data-driver-profile="driverId".

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS, getFlag } from '../config.js';
import { loadScoringHistory, loadCachedResults, loadTestResults } from '../services/storage.js';

/**
 * Build the F1 media CDN headshot URL for a driver.
 * The d_driver_fallback_image.png Cloudinary prefix ensures the request
 * always returns an image (real headshot or a fallback silhouette).
 */
function getDriverHeadshotUrl(driver) {
  const first3 = driver.firstName.slice(0, 3).toUpperCase();
  const last3 = driver.lastName.slice(0, 3).toUpperCase();
  const code = `${first3}${last3}01`;
  const firstLetter = driver.firstName.charAt(0).toUpperCase();
  return `https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/${firstLetter}/${code}_${driver.firstName}_${driver.lastName}/${code.toLowerCase()}.png.transform/2col/image.png`;
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

  // Last race finish position
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

  // Photo — F1 CDN with Cloudinary fallback ensures something always loads
  const photo = document.getElementById('driver-profile-photo');
  photo.style.opacity = '0';
  photo.onload = () => { photo.style.opacity = '1'; };
  photo.onerror = () => { photo.style.opacity = '0'; };
  photo.src = getDriverHeadshotUrl(driver);
  photo.alt = `${driver.firstName} ${driver.lastName}`;

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
