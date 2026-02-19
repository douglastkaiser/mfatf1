// Views: Drivers, Constructors, Standings, Calendar
// All views render immediately from static config data.
// API data overlays when available.

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS, RACE_CALENDAR, getFlag } from '../config.js';
import { on, HookEvents } from '../services/hooks.js';
import { loadCachedResults, loadTestResults } from '../services/storage.js';

export function initViews() {
  renderDriversTable();
  renderConstructorsTable();
  renderStandings();
  renderCalendar();
  setupDriverFilters();

  on(HookEvents.DRIVER_STANDINGS_UPDATED, renderStandings);
  on(HookEvents.CONSTRUCTOR_STANDINGS_UPDATED, renderStandings);
  on(HookEvents.RACE_SCHEDULE_UPDATED, renderCalendar);
  on(HookEvents.DATA_SYNC_COMPLETE, () => {
    renderDriversTable();
    renderConstructorsTable();
    renderStandings();
    renderCalendar();
  });
}

// ===== All Drivers =====
function renderDriversTable() {
  const body = document.getElementById('drivers-table-body');
  const sortVal = document.getElementById('drivers-sort')?.value || 'price-desc';
  const teamFilter = document.getElementById('drivers-team-filter')?.value || 'all';

  // Load standings and test results for overlay
  const cached = loadCachedResults();
  const driverStandings = cached.driverStandings || [];
  const standingsMap = {};
  for (const s of driverStandings) {
    standingsMap[s.Driver?.driverId] = { totalPoints: Number(s.points) || 0 };
  }

  const testResults = loadTestResults();
  const roundKeys = Object.keys(testResults).sort((a, b) => Number(a) - Number(b));
  const numRounds = roundKeys.length;
  const lastRound = numRounds > 0 ? roundKeys[roundKeys.length - 1] : null;

  let drivers = DRIVERS.map(d => {
    const standing = standingsMap[d.id];
    const totalPoints = standing?.totalPoints || 0;

    let lastRace = '--';
    if (lastRound && testResults[lastRound]?.driverScores?.[d.id]) {
      const lastScore = testResults[lastRound].driverScores[d.id];
      lastRace = String(Math.max(0, lastScore.finish || 0));
    }

    return {
      ...d,
      teamName: CONSTRUCTORS.find(c => c.id === d.team)?.shortName || d.team,
      color: TEAM_COLORS[d.team] || '#555',
      totalPoints,
      avgPoints: numRounds > 0 ? Math.round((totalPoints / numRounds) * 10) / 10 : 0,
      lastRace,
    };
  });

  if (teamFilter !== 'all') {
    drivers = drivers.filter(d => d.team === teamFilter);
  }

  switch (sortVal) {
    case 'price-desc': drivers.sort((a, b) => b.price - a.price); break;
    case 'price-asc': drivers.sort((a, b) => a.price - b.price); break;
    case 'points-desc': drivers.sort((a, b) => b.totalPoints - a.totalPoints || b.price - a.price); break;
    case 'name-asc': drivers.sort((a, b) => a.lastName.localeCompare(b.lastName)); break;
  }

  body.innerHTML = drivers.map((d, i) => `
    <tr>
      <td><span class="pos-badge">${i + 1}</span></td>
      <td>
        <div class="driver-name">
          <span class="team-color-dot" style="background:${d.color}"></span>
          <span><strong>${d.lastName}</strong> ${d.firstName}</span>
          <span class="driver-card__code">${d.code}</span>
        </div>
      </td>
      <td style="color:${d.color};font-weight:600">${d.teamName}</td>
      <td class="points-positive">$${d.price}M</td>
      <td>${d.totalPoints}</td>
      <td>${d.avgPoints}</td>
      <td>${d.lastRace}</td>
    </tr>
  `).join('');
}

function setupDriverFilters() {
  const filter = document.getElementById('drivers-team-filter');
  if (filter) {
    CONSTRUCTORS.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.shortName;
      filter.appendChild(opt);
    });
    filter.addEventListener('change', renderDriversTable);
  }

  const sort = document.getElementById('drivers-sort');
  if (sort) sort.addEventListener('change', renderDriversTable);
}

// ===== All Constructors =====
function renderConstructorsTable() {
  const body = document.getElementById('constructors-table-body');

  // Load standings and test results for overlay
  const cached = loadCachedResults();
  const constructorStandings = cached.constructorStandings || [];
  const standingsMap = {};
  for (const s of constructorStandings) {
    standingsMap[s.Constructor?.constructorId] = Number(s.points) || 0;
  }

  const testResults = loadTestResults();
  const qualiMap = {};
  const pitMap = {};
  for (const ws of Object.values(testResults)) {
    for (const [cId, cScore] of Object.entries(ws.constructorScores || {})) {
      if (!qualiMap[cId]) qualiMap[cId] = 0;
      if (!pitMap[cId]) pitMap[cId] = 0;
      qualiMap[cId] += cScore.qualifyingBonus || 0;
      pitMap[cId] += cScore.pitStopPoints || 0;
    }
  }

  const constructors = CONSTRUCTORS.map(c => ({
    ...c,
    driverNames: c.drivers.map(id => {
      const d = DRIVERS.find(d => d.id === id);
      return d ? `${d.firstName} ${d.lastName}` : id;
    }).join(', '),
    totalPoints: standingsMap[c.id] || 0,
    qualiBonus: qualiMap[c.id] || 0,
    pitStopPts: pitMap[c.id] || 0,
  }));

  constructors.sort((a, b) => b.totalPoints - a.totalPoints || b.price - a.price);

  body.innerHTML = constructors.map((c, i) => `
    <tr>
      <td><span class="pos-badge${i < 3 ? ' pos-badge--' + (i+1) : ''}">${i + 1}</span></td>
      <td>
        <div class="driver-name">
          <span class="team-color-dot" style="background:${c.color}"></span>
          <strong>${c.shortName}</strong>
        </div>
      </td>
      <td>${c.driverNames}</td>
      <td class="points-positive">$${c.price}M</td>
      <td>${c.totalPoints}</td>
      <td>${c.qualiBonus}</td>
      <td>${c.pitStopPts}</td>
    </tr>
  `).join('');
}

// ===== Standings =====
function renderStandings() {
  const cached = loadCachedResults();

  // WDC
  const driverStandings = cached.driverStandings || [];
  const wdcBody = document.getElementById('wdc-table-body');

  if (driverStandings.length > 0) {
    wdcBody.innerHTML = driverStandings.map(s => {
      const constructorId = s.Constructors?.[0]?.constructorId || '';
      const color = TEAM_COLORS[constructorId] || CONSTRUCTORS.find(c => c.id === constructorId)?.color || '#555';
      const pos = parseInt(s.position, 10);
      const posClass = pos <= 3 ? ` pos-badge--${pos}` : '';
      return `
        <tr>
          <td><span class="pos-badge${posClass}">${s.position}</span></td>
          <td>
            <div class="driver-name">
              <span class="team-color-dot" style="background:${color}"></span>
              <strong>${s.Driver?.familyName}</strong> ${s.Driver?.givenName}
            </div>
          </td>
          <td style="color:${color};font-weight:600">${s.Constructors?.[0]?.name || ''}</td>
          <td><strong>${s.points}</strong></td>
        </tr>
      `;
    }).join('');
  } else {
    // Fallback: show drivers from config sorted by price as a proxy for expected performance
    const fallback = [...DRIVERS].sort((a, b) => b.price - a.price);
    wdcBody.innerHTML = fallback.map((d, i) => {
      const color = TEAM_COLORS[d.team] || '#555';
      const constructor = CONSTRUCTORS.find(c => c.id === d.team);
      const posClass = i < 3 ? ` pos-badge--${i + 1}` : '';
      return `
        <tr>
          <td><span class="pos-badge${posClass}">${i + 1}</span></td>
          <td>
            <div class="driver-name">
              <span class="team-color-dot" style="background:${color}"></span>
              <strong>${d.lastName}</strong> ${d.firstName}
            </div>
          </td>
          <td style="color:${color};font-weight:600">${constructor?.shortName || ''}</td>
          <td><strong>0</strong></td>
        </tr>
      `;
    }).join('');
  }

  // WCC
  const constructorStandings = cached.constructorStandings || [];
  const wccBody = document.getElementById('wcc-table-body');

  if (constructorStandings.length > 0) {
    wccBody.innerHTML = constructorStandings.map(s => {
      const constructorId = s.Constructor?.constructorId || '';
      const color = TEAM_COLORS[constructorId] || CONSTRUCTORS.find(c => c.id === constructorId)?.color || '#555';
      const pos = parseInt(s.position, 10);
      const posClass = pos <= 3 ? ` pos-badge--${pos}` : '';
      return `
        <tr>
          <td><span class="pos-badge${posClass}">${s.position}</span></td>
          <td>
            <div class="driver-name">
              <span class="team-color-dot" style="background:${color}"></span>
              <strong>${s.Constructor?.name}</strong>
            </div>
          </td>
          <td><strong>${s.points}</strong></td>
        </tr>
      `;
    }).join('');
  } else {
    const fallback = [...CONSTRUCTORS].sort((a, b) => b.price - a.price);
    wccBody.innerHTML = fallback.map((c, i) => {
      const posClass = i < 3 ? ` pos-badge--${i + 1}` : '';
      return `
        <tr>
          <td><span class="pos-badge${posClass}">${i + 1}</span></td>
          <td>
            <div class="driver-name">
              <span class="team-color-dot" style="background:${c.color}"></span>
              <strong>${c.name}</strong>
            </div>
          </td>
          <td><strong>0</strong></td>
        </tr>
      `;
    }).join('');
  }
}

// ===== Calendar =====
function renderCalendar() {
  const container = document.getElementById('calendar-list');
  const now = new Date();
  let foundNext = false;

  container.innerHTML = RACE_CALENDAR.map(race => {
    const raceDate = new Date(race.date);
    const isPast = raceDate < now;
    const isNext = !isPast && !foundNext;
    if (isNext) foundNext = true;

    const stateClass = isPast ? 'calendar-race--completed'
      : isNext ? 'calendar-race--next'
      : 'calendar-race--upcoming';

    const flag = getFlag(race.flag);

    const dateStr = raceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let badges = '';
    if (isPast) badges += '<span class="calendar-race__status calendar-race__status--completed">Completed</span>';
    if (isNext) badges += '<span class="calendar-race__status calendar-race__status--next">Next Race</span>';
    if (race.sprint) badges += '<span class="calendar-race__status calendar-race__status--sprint">Sprint</span>';

    return `
      <div class="calendar-race ${stateClass}">
        <span class="calendar-race__round">R${race.round}</span>
        <span class="calendar-race__flag">${flag}</span>
        <div class="calendar-race__info">
          <div class="calendar-race__name">${race.name}</div>
          <div class="calendar-race__circuit">${race.circuit}, ${race.country}</div>
        </div>
        <span class="calendar-race__date">${dateStr}</span>
        <div class="calendar-race__badges">${badges}</div>
      </div>
    `;
  }).join('');
}
