// Driver Profile Popup
// Shows a popup with driver details when clicking on any driver name/card
// throughout the app.

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS, getFlag } from '../config.js';
import { loadScoringHistory } from '../services/storage.js';
import { loadCachedResults, loadTestResults } from '../services/storage.js';

const NATIONALITY_NAMES = {
  GBR: 'British', NED: 'Dutch', MON: 'Monegasque', AUS: 'Australian',
  ITA: 'Italian', ESP: 'Spanish', FRA: 'French', NZL: 'New Zealander',
  THA: 'Thai', DEU: 'German', CAN: 'Canadian', ARG: 'Argentine',
  MEX: 'Mexican', BRA: 'Brazilian', FIN: 'Finnish',
};

let _popup = null;

export function initDriverProfile() {
  _popup = document.getElementById('driver-profile-popup');
  if (!_popup) return;

  const backdrop = _popup.querySelector('.driver-profile-popup__backdrop');
  const closeBtn = document.getElementById('driver-profile-close');

  backdrop.addEventListener('click', closeDriverProfile);
  closeBtn.addEventListener('click', closeDriverProfile);
}

export function openDriverProfile(driverId) {
  const driver = DRIVERS.find(d => d.id === driverId);
  if (!driver || !_popup) return;

  const constructor = CONSTRUCTORS.find(c => c.id === driver.team);
  const color = TEAM_COLORS[driver.team] || '#555';

  // Avatar: driver initials
  const initials = `${driver.firstName.charAt(0)}${driver.lastName.charAt(0)}`;
  const avatarEl = document.getElementById('driver-profile-avatar');
  avatarEl.textContent = initials;
  avatarEl.style.background = color;

  // Hero border color
  const heroEl = document.getElementById('driver-profile-hero');
  heroEl.style.setProperty('--driver-team-color', color);

  // Number badge
  const numberEl = document.getElementById('driver-profile-number');
  numberEl.textContent = `#${driver.number} ${driver.code}`;
  numberEl.style.borderColor = color;
  numberEl.style.color = color;

  // Name
  document.getElementById('driver-profile-name').textContent =
    `${driver.firstName} ${driver.lastName}`;

  // Team
  const teamEl = document.getElementById('driver-profile-team');
  teamEl.textContent = constructor?.name || driver.team;
  teamEl.style.color = color;

  // Stats
  const stats = getDriverStats(driver);
  const statsEl = document.getElementById('driver-profile-stats');
  statsEl.innerHTML = stats.map(s => `
    <div class="driver-profile-popup__stat">
      <span class="driver-profile-popup__stat-value">${s.value}</span>
      <span class="driver-profile-popup__stat-label">${s.label}</span>
    </div>
  `).join('');

  // Show
  _popup.removeAttribute('hidden');
  _popup.style.display = 'flex';
}

export function closeDriverProfile() {
  if (!_popup) return;
  _popup.setAttribute('hidden', '');
  _popup.style.display = 'none';
}

function getDriverStats(driver) {
  const constructor = CONSTRUCTORS.find(c => c.id === driver.team);
  const flag = getFlag(driver.nationality);
  const nationalityName = NATIONALITY_NAMES[driver.nationality] || driver.nationality;

  // Load scoring data
  const history = loadScoringHistory();
  const sortedRounds = Object.keys(history).sort((a, b) => Number(a) - Number(b));

  let totalFantasyPts = 0;
  let racesScored = 0;
  for (const round of sortedRounds) {
    const roundData = history[round];
    if (roundData.driverScores?.[driver.id]) {
      const scoreObj = roundData.driverScores[driver.id];
      const pts = typeof scoreObj === 'object' ? (scoreObj.total || 0) : scoreObj;
      totalFantasyPts += pts;
      racesScored++;
    }
  }
  const avgPts = racesScored > 0 ? Math.round((totalFantasyPts / racesScored) * 10) / 10 : 0;

  // Load real standings for championship position
  const cached = loadCachedResults();
  const driverStandings = cached.driverStandings || [];
  const standing = driverStandings.find(s => s.Driver?.driverId === driver.id);
  const champPos = standing ? `P${standing.position}` : '--';
  const champPts = standing ? standing.points : '0';

  // Last race finish
  const testResults = loadTestResults();
  const roundKeys = Object.keys(testResults).sort((a, b) => Number(a) - Number(b));
  const lastRound = roundKeys.length > 0 ? roundKeys[roundKeys.length - 1] : null;
  let lastRaceFinish = '--';
  if (lastRound && testResults[lastRound]?.driverScores?.[driver.id]) {
    const lastScore = testResults[lastRound].driverScores[driver.id];
    lastRaceFinish = `P${Math.max(1, lastScore.finish || 0)}`;
  }

  return [
    { label: 'Price', value: `$${driver.price}M` },
    { label: 'Nationality', value: `${flag} ${nationalityName}` },
    { label: 'Team', value: constructor?.shortName || driver.team },
    { label: 'Number', value: `#${driver.number}` },
    { label: 'Fantasy Pts', value: totalFantasyPts },
    { label: 'Avg Pts/Race', value: avgPts },
    { label: 'WDC Position', value: champPos },
    { label: 'WDC Points', value: champPts },
  ];
}
