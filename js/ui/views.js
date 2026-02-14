// Supplementary Views: Drivers, Constructors, Standings, Calendar
// Renders the data-display views that show all drivers, constructors,
// championship standings, and the race calendar.

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS } from '../config.js';
import { on, HookEvents } from '../services/hooks.js';
import { loadCachedResults } from '../services/storage.js';

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
  const sortVal = document.getElementById('drivers-sort')?.value || 'points-desc';
  const teamFilter = document.getElementById('drivers-team-filter')?.value || 'all';

  let drivers = DRIVERS.map(d => ({
    ...d,
    teamName: CONSTRUCTORS.find(c => c.id === d.team)?.name || d.team,
    color: TEAM_COLORS[d.team] || 'var(--border-color)',
    totalPoints: 0,
    avgPoints: 0,
    lastRace: '--',
  }));

  if (teamFilter !== 'all') {
    drivers = drivers.filter(d => d.team === teamFilter);
  }

  // Sort
  switch (sortVal) {
    case 'price-desc': drivers.sort((a, b) => b.price - a.price); break;
    case 'price-asc': drivers.sort((a, b) => a.price - b.price); break;
    case 'points-desc': drivers.sort((a, b) => b.totalPoints - a.totalPoints); break;
    case 'name-asc': drivers.sort((a, b) => `${a.lastName}`.localeCompare(`${b.lastName}`)); break;
  }

  body.innerHTML = drivers.map((d, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div class="driver-name">
          <span class="team-color-dot" style="background:${d.color}"></span>
          ${d.firstName} ${d.lastName}
          <span style="color:var(--text-muted);font-size:0.75rem;margin-left:4px">${d.code}</span>
        </div>
      </td>
      <td>${d.teamName}</td>
      <td class="points-positive">$${d.price}M</td>
      <td>${d.totalPoints}</td>
      <td>${d.avgPoints}</td>
      <td>${d.lastRace}</td>
    </tr>
  `).join('');
}

function setupDriverFilters() {
  // Populate team filter
  const filter = document.getElementById('drivers-team-filter');
  if (filter) {
    CONSTRUCTORS.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
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

  const constructors = CONSTRUCTORS.map(c => ({
    ...c,
    driverNames: c.drivers.map(id => {
      const d = DRIVERS.find(d => d.id === id);
      return d ? `${d.code}` : id;
    }).join(', '),
    totalPoints: 0,
    qualiBonus: 0,
    pitStopPts: 0,
  }));

  constructors.sort((a, b) => b.totalPoints - a.totalPoints);

  body.innerHTML = constructors.map((c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div class="driver-name">
          <span class="team-color-dot" style="background:${c.color}"></span>
          ${c.name}
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

  // Driver standings
  const driverStandings = cached.driverStandings || [];
  const wdcBody = document.getElementById('wdc-table-body');

  if (driverStandings.length > 0) {
    wdcBody.innerHTML = driverStandings.map(s => {
      const constructorId = s.Constructors?.[0]?.constructorId || '';
      const color = TEAM_COLORS[constructorId] || CONSTRUCTORS.find(c => c.id === constructorId)?.color || 'var(--border-color)';
      const pos = parseInt(s.position, 10);
      const posClass = pos <= 3 ? ` pos-badge--${pos}` : '';
      return `
        <tr>
          <td><span class="pos-badge${posClass}">${s.position}</span></td>
          <td>
            <div class="driver-name">
              <span class="team-color-dot" style="background:${color}"></span>
              ${s.Driver?.givenName} ${s.Driver?.familyName}
            </div>
          </td>
          <td>${s.Constructors?.[0]?.name || ''}</td>
          <td><strong>${s.points}</strong></td>
        </tr>
      `;
    }).join('');
  } else {
    wdcBody.innerHTML = '<tr><td colspan="4" class="text-muted">Season not started yet</td></tr>';
  }

  // Constructor standings
  const constructorStandings = cached.constructorStandings || [];
  const wccBody = document.getElementById('wcc-table-body');

  if (constructorStandings.length > 0) {
    wccBody.innerHTML = constructorStandings.map(s => {
      const constructorId = s.Constructor?.constructorId || '';
      const color = TEAM_COLORS[constructorId] || CONSTRUCTORS.find(c => c.id === constructorId)?.color || 'var(--border-color)';
      const pos = parseInt(s.position, 10);
      const posClass = pos <= 3 ? ` pos-badge--${pos}` : '';
      return `
        <tr>
          <td><span class="pos-badge${posClass}">${s.position}</span></td>
          <td>
            <div class="driver-name">
              <span class="team-color-dot" style="background:${color}"></span>
              ${s.Constructor?.name}
            </div>
          </td>
          <td><strong>${s.points}</strong></td>
        </tr>
      `;
    }).join('');
  } else {
    wccBody.innerHTML = '<tr><td colspan="3" class="text-muted">Season not started yet</td></tr>';
  }
}

// ===== Calendar =====

function renderCalendar(races) {
  const schedule = races || loadCachedResults().schedule || [];
  const container = document.getElementById('calendar-list');
  const now = new Date();

  if (schedule.length === 0) {
    container.innerHTML = '<p class="text-muted">Loading calendar...</p>';
    return;
  }

  let foundNext = false;

  container.innerHTML = schedule.map((race, i) => {
    const raceDate = new Date(race.date);
    const isPast = raceDate < now;
    const isNext = !isPast && !foundNext;
    if (isNext) foundNext = true;

    const stateClass = isPast ? 'calendar-race--completed'
      : isNext ? 'calendar-race--next'
      : 'calendar-race--upcoming';

    const statusHtml = isPast
      ? '<span class="calendar-race__status calendar-race__status--completed">Completed</span>'
      : isNext
        ? '<span class="calendar-race__status calendar-race__status--next">Next</span>'
        : '';

    const dateStr = raceDate.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    });

    return `
      <div class="calendar-race ${stateClass}">
        <span class="calendar-race__round">R${race.round}</span>
        <div class="calendar-race__info">
          <div class="calendar-race__name">${race.raceName}</div>
          <div class="calendar-race__circuit">${race.Circuit?.circuitName || ''}, ${race.Circuit?.Location?.country || ''}</div>
        </div>
        <span class="calendar-race__date">${dateStr}</span>
        ${statusHtml}
      </div>
    `;
  }).join('');
}
