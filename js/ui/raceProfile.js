// Race Profile Popup
// Shows race details, results (if completed), and qualifying info.
// Triggered by clicking any element with data-race-profile="round".

import { RACE_CALENDAR, DRIVERS, CONSTRUCTORS, TEAM_COLORS, getFlag } from '../config.js';
import { loadCachedResults, loadTestResults } from '../services/storage.js';

export function initRaceProfile() {
  const modal = document.getElementById('race-profile-modal');
  if (!modal) return;

  const backdrop = modal.querySelector('.race-profile__backdrop');
  const closeBtn = document.getElementById('race-profile-close');

  backdrop.addEventListener('click', closeRaceProfile);
  closeBtn.addEventListener('click', closeRaceProfile);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeRaceProfile();
  });

  function handleTrigger(e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('[data-no-profile]')) return;
    const el = e.target.closest('[data-race-profile]');
    if (el) {
      const round = el.dataset.raceProfile;
      if (round) {
        if (e.type === 'keydown') e.preventDefault();
        openRaceProfile(Number(round));
      }
    }
  }

  document.addEventListener('click', handleTrigger);
  document.addEventListener('keydown', handleTrigger);
}

export function openRaceProfile(round) {
  const race = RACE_CALENDAR.find(r => r.race_round === round || r.round === round);
  if (!race) return;

  const modal = document.getElementById('race-profile-modal');
  const now = new Date();
  const raceDate = new Date(race.date);
  const isPast = raceDate < now;

  // Apply state color theme to panel
  const panel = document.getElementById('race-profile-panel');
  panel.dataset.state = isPast ? 'completed' : 'upcoming';

  // Flag + name
  const flag = getFlag(race.flag);
  document.getElementById('race-profile-flag').textContent = flag;
  document.getElementById('race-profile-name').textContent = race.name;
  document.getElementById('race-profile-circuit').textContent = race.circuit;

  // Date and badges
  const dateStr = raceDate.toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
  });
  document.getElementById('race-profile-date').textContent = dateStr;

  const badgesEl = document.getElementById('race-profile-badges');
  let badges = `<span class="calendar-race__status calendar-race__status--${isPast ? 'completed' : 'next'}">${isPast ? 'Completed' : 'Upcoming'}</span>`;
  if (race.sprint) badges += '<span class="calendar-race__status calendar-race__status--sprint">Sprint Weekend</span>';
  badgesEl.innerHTML = badges;

  // Round label
  document.getElementById('race-profile-round').textContent = `Round ${race.round} of ${RACE_CALENDAR.length}`;

  if (isPast) {
    _renderRaceResults(race);
  } else {
    _renderUpcoming(race, raceDate, now);
  }

  modal.removeAttribute('hidden');
  modal.style.display = 'flex';
  document.getElementById('race-profile-close').focus();
}

function _renderRaceResults(race) {
  const cached = loadCachedResults();
  const testResults = loadTestResults();

  // Find this round in results data
  const raceData = (cached.raceResults || []).find(r => Number(r.round) === race.round);
  const qualData = (cached.qualifying || []).find(r => Number(r.round) === race.round);
  const sprintData = (cached.sprintResults || []).find(r => Number(r.round) === race.round);

  // Fantasy scores for this round
  const fantasyRound = testResults[race.round];

  const body = document.getElementById('race-profile-body');
  let html = '';

  // ── Race Results ──
  if (raceData?.Results?.length > 0) {
    html += '<h3 class="rp-section-title">Race Result</h3>';
    html += '<div class="rp-results">';

    const top = raceData.Results.slice(0, 10);
    for (const r of top) {
      const pos = Number(r.position);
      const driverId = r.Driver?.driverId;
      const driverConfig = DRIVERS.find(d => d.id === driverId);
      const constructorId = r.Constructor?.constructorId;
      const color = TEAM_COLORS[constructorId] || CONSTRUCTORS.find(c => c.id === constructorId)?.color || '#555';
      const name = `${r.Driver?.givenName || ''} ${r.Driver?.familyName || ''}`.trim();

      const isDNF = r.status && r.status !== 'Finished' && !r.status.startsWith('+');
      const isFastestLap = r.FastestLap?.rank === '1' || r.FastestLap?.rank === 1;
      const statusBadge = isDNF
        ? `<span class="rp-badge rp-badge--dnf">DNF</span>`
        : isFastestLap
          ? `<span class="rp-badge rp-badge--fl">FL</span>`
          : '';

      const posClass = pos === 1 ? 'rp-pos--gold' : pos === 2 ? 'rp-pos--silver' : pos === 3 ? 'rp-pos--bronze' : '';
      const profileAttr = driverConfig ? `data-driver-profile="${driverConfig.id}" role="button" tabindex="0"` : '';

      // Fantasy points for this driver this round
      const fpts = fantasyRound?.driverScores?.[driverId];
      const fptsVal = fpts !== undefined ? (typeof fpts === 'object' ? fpts.total : fpts) : null;
      const fptsHtml = fptsVal !== null
        ? `<span class="rp-fpts" title="Fantasy pts">${fptsVal >= 0 ? '+' : ''}${fptsVal}</span>`
        : '';

      html += `
        <div class="rp-result-row" ${profileAttr}>
          <span class="rp-pos ${posClass}">${pos}</span>
          <span class="rp-dot" style="background:${color}"></span>
          <span class="rp-driver-name">${name}</span>
          <span class="rp-constructor" style="color:${color}">${r.Constructor?.name || ''}</span>
          ${statusBadge}
          ${fptsHtml}
        </div>
      `;
    }
    html += '</div>';
  }

  // ── Qualifying ──
  if (qualData?.QualifyingResults?.length > 0) {
    html += '<h3 class="rp-section-title">Qualifying – Front Row</h3>';
    html += '<div class="rp-results">';

    const front = qualData.QualifyingResults.slice(0, 3);
    for (const r of front) {
      const pos = Number(r.position);
      const driverId = r.Driver?.driverId;
      const driverConfig = DRIVERS.find(d => d.id === driverId);
      const constructorId = r.Constructor?.constructorId;
      const color = TEAM_COLORS[constructorId] || CONSTRUCTORS.find(c => c.id === constructorId)?.color || '#555';
      const name = `${r.Driver?.givenName || ''} ${r.Driver?.familyName || ''}`.trim();
      const posClass = pos === 1 ? 'rp-pos--gold' : pos === 2 ? 'rp-pos--silver' : pos === 3 ? 'rp-pos--bronze' : '';
      const profileAttr = driverConfig ? `data-driver-profile="${driverConfig.id}" role="button" tabindex="0"` : '';
      const lapTime = r.Q3 || r.Q2 || r.Q1 || '';

      html += `
        <div class="rp-result-row" ${profileAttr}>
          <span class="rp-pos ${posClass}">P${pos}</span>
          <span class="rp-dot" style="background:${color}"></span>
          <span class="rp-driver-name">${name}</span>
          <span class="rp-constructor" style="color:${color}">${r.Constructor?.name || ''}</span>
          ${lapTime ? `<span class="rp-laptime">${lapTime}</span>` : ''}
        </div>
      `;
    }
    html += '</div>';
  }

  // ── Sprint ──
  if (sprintData?.SprintResults?.length > 0) {
    html += '<h3 class="rp-section-title">Sprint Result</h3>';
    html += '<div class="rp-results">';

    const sprintTop = sprintData.SprintResults.slice(0, 8);
    for (const r of sprintTop) {
      const pos = Number(r.position);
      const driverId = r.Driver?.driverId;
      const driverConfig = DRIVERS.find(d => d.id === driverId);
      const constructorId = r.Constructor?.constructorId;
      const color = TEAM_COLORS[constructorId] || CONSTRUCTORS.find(c => c.id === constructorId)?.color || '#555';
      const name = `${r.Driver?.givenName || ''} ${r.Driver?.familyName || ''}`.trim();
      const isDNF = r.status && r.status !== 'Finished' && !r.status.startsWith('+');
      const posClass = pos === 1 ? 'rp-pos--gold' : pos === 2 ? 'rp-pos--silver' : pos === 3 ? 'rp-pos--bronze' : '';
      const profileAttr = driverConfig ? `data-driver-profile="${driverConfig.id}" role="button" tabindex="0"` : '';

      html += `
        <div class="rp-result-row" ${profileAttr}>
          <span class="rp-pos ${posClass}">${pos}</span>
          <span class="rp-dot" style="background:${color}"></span>
          <span class="rp-driver-name">${name}</span>
          <span class="rp-constructor" style="color:${color}">${r.Constructor?.name || ''}</span>
          ${isDNF ? '<span class="rp-badge rp-badge--dnf">DNF</span>' : ''}
        </div>
      `;
    }
    html += '</div>';
  }

  // ── Fantasy Summary (if we have fantasy scores for this round) ──
  if (fantasyRound) {
    html += '<h3 class="rp-section-title">Fantasy Summary</h3>';
    html += '<div class="rp-fantasy-summary">';
    html += `
      <div class="rp-fsum-row">
        <span class="rp-fsum-label">Team Score</span>
        <span class="rp-fsum-value">${fantasyRound.total ?? '—'} pts</span>
      </div>
    `;
    html += '</div>';
  }

  if (html === '') {
    html = '<div class="rp-no-data">Results not yet available for this race.</div>';
  }

  body.innerHTML = html;
}

function _renderUpcoming(race, raceDate, now) {
  const diff = raceDate - now;
  const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  const hours = Math.max(0, Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));

  const body = document.getElementById('race-profile-body');
  let html = '';

  // Countdown
  html += `
    <div class="rp-countdown">
      <div class="rp-countdown__item">
        <span class="rp-countdown__num">${days}</span>
        <span class="rp-countdown__unit">days</span>
      </div>
      <div class="rp-countdown__sep">:</div>
      <div class="rp-countdown__item">
        <span class="rp-countdown__num">${hours}</span>
        <span class="rp-countdown__unit">hours</span>
      </div>
    </div>
  `;

  // Circuit details
  html += `
    <div class="rp-upcoming-info">
      <div class="rp-info-row">
        <span class="rp-info-label">Location</span>
        <span class="rp-info-value">${race.location}, ${race.country}</span>
      </div>
      <div class="rp-info-row">
        <span class="rp-info-label">Circuit</span>
        <span class="rp-info-value">${race.circuit}</span>
      </div>
    </div>
  `;

  if (race.sprint) {
    html += `
      <div class="rp-sprint-notice">
        <span class="calendar-race__status calendar-race__status--sprint">Sprint Weekend</span>
        <span class="rp-sprint-text">This weekend features a sprint race with extra fantasy points available.</span>
      </div>
    `;
  }

  body.innerHTML = html;
}

export function closeRaceProfile() {
  const modal = document.getElementById('race-profile-modal');
  if (modal) {
    modal.setAttribute('hidden', '');
    modal.style.display = 'none';
  }
}
