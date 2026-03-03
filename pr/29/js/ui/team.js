// Team Management UI
// Handles the My Team view: driver/constructor selection, slot rendering,
// picker modal, boost activation with driver target selection.
// Supports 5 drivers + 2 constructors per the official F1 Fantasy format.

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS, SCORING, getNextQualiDeadline, getFlag } from '../config.js';
import { on, HookEvents } from '../services/hooks.js';
import {
  getTeam, addDriver, removeDriver, setConstructor, removeConstructor,
  activateBoost, deactivateBoost, getBoosts, getTeamName, setTeamName,
} from '../models/team.js';
import { loadScoringHistory, loadCachedResults } from '../services/storage.js';
import { calculateConstructorQualifyingBonus } from '../scoring/engine.js';
import { showToast } from './toast.js';

let pickerMode = null; // 'driver' | 'constructor'
let pickerSlot = null;
let pendingBoostType = null; // when waiting for driver target selection
let lastRemoved = null; // { id, slot, type } for undo on remove
let _deadlineInterval = null;

export function initTeamUI() {
  renderSlots();
  renderBoosts();
  setupPicker();
  setupBoostTargetModal();
  setupChipInfo();
  renderGuestNotice();
  initTeamNameUI();
  startDeadlineCountdown();

  on(HookEvents.TEAM_UPDATED, () => {
    renderSlots();
    updateTeamMeta();
    renderBoosts();
  });

  // Re-render scores when race simulation or data sync writes new scoring history
  on(HookEvents.DATA_SYNC_COMPLETE, () => {
    renderSlots();
    updateTeamMeta();
    renderProvisionalBanner();
  });

  on(HookEvents.FANTASY_SCORES_CALCULATED, () => {
    renderSlots();
    updateTeamMeta();
  });

  on(HookEvents.RACE_QUALIFYING_RECEIVED, () => {
    renderSlots();
    updateTeamMeta();
    renderProvisionalBanner();
  });
}

// ===== Team Lock Deadline Countdown =====

function renderLockDeadlineBanner() {
  const container = document.getElementById('team-lock-deadline');
  if (!container) return;

  const info = getNextQualiDeadline();
  if (!info) {
    container.innerHTML = '';
    return;
  }

  const { race, deadline } = info;
  const now = new Date();
  const diff = deadline - now;

  if (diff <= 0) {
    container.innerHTML = `
      <div class="lock-deadline lock-deadline--locked">
        <span class="lock-deadline__icon">&#128274;</span>
        <div class="lock-deadline__text">
          <strong>Team Locked</strong>
          <span>${getFlag(race.flag)} ${race.name} — changes locked for Qualies</span>
        </div>
      </div>
    `;
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);

  const urgentClass = diff < 3_600_000 ? 'lock-deadline--urgent'
    : diff < 86_400_000 ? 'lock-deadline--warning' : '';

  const daysHtml = days > 0
    ? `<div class="lock-unit"><span class="lock-unit__val">${days}</span><span class="lock-unit__label">d</span></div>`
    : '';

  container.innerHTML = `
    <div class="lock-deadline ${urgentClass}">
      <span class="lock-deadline__icon">&#9201;</span>
      <div class="lock-deadline__text">
        <strong>Team Lock Deadline</strong>
        <span>${getFlag(race.flag)} ${race.name} — lock before Qualies</span>
      </div>
      <div class="lock-deadline__countdown">
        ${daysHtml}
        <div class="lock-unit"><span class="lock-unit__val">${String(hours).padStart(2, '0')}</span><span class="lock-unit__label">h</span></div>
        <div class="lock-unit"><span class="lock-unit__val">${String(mins).padStart(2, '0')}</span><span class="lock-unit__label">m</span></div>
        <div class="lock-unit"><span class="lock-unit__val">${String(secs).padStart(2, '0')}</span><span class="lock-unit__label">s</span></div>
      </div>
    </div>
  `;
}

function renderHeaderLockPill() {
  const pill = document.getElementById('header-lock-pill');
  if (!pill) return;

  const info = getNextQualiDeadline();
  if (!info) {
    pill.innerHTML = '';
    return;
  }

  const { race, deadline } = info;
  const diff = deadline - new Date();

  if (diff <= 0) {
    pill.innerHTML = `
      <div class="header-lock-pill__inner header-lock-pill--locked">
        <span>&#128274;</span>
        <span>${getFlag(race.flag)} Locked</span>
      </div>`;
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);

  const urgentClass = diff < 3_600_000 ? 'header-lock-pill--urgent'
    : diff < 86_400_000 ? 'header-lock-pill--warning' : '';

  const timeStr = days > 0
    ? `${days}d ${String(hours).padStart(2, '0')}h`
    : `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  pill.innerHTML = `
    <div class="header-lock-pill__inner ${urgentClass}">
      <span>&#9201;</span>
      <span class="header-lock-pill__race">${getFlag(race.flag)} ${race.name}</span>
      <span class="header-lock-pill__time">${timeStr}</span>
    </div>`;
}

function startDeadlineCountdown() {
  if (_deadlineInterval) clearInterval(_deadlineInterval);
  renderLockDeadlineBanner();
  renderHeaderLockPill();
  _deadlineInterval = setInterval(() => {
    renderLockDeadlineBanner();
    renderHeaderLockPill();
  }, 1000);
}

// ===== Provisional Points (Qualifying Complete, Race Pending) =====

/**
 * Returns projected points based on qualifying positions if qualifying has
 * completed but the race has not yet happened. Returns null otherwise.
 */
function getProvisionalData() {
  const cached = loadCachedResults();
  const { qualifying = [], raceResults = [] } = cached;

  if (qualifying.length === 0) return null;

  const latestQualiRound = Math.max(...qualifying.map(q => Number(q.round)));
  const hasRaceResult = raceResults.some(r => Number(r.round) === latestQualiRound);

  if (hasRaceResult) return null;

  const qualiRace = qualifying.find(q => Number(q.round) === latestQualiRound);
  if (!qualiRace) return null;

  const qualiResults = qualiRace.QualifyingResults || [];
  if (qualiResults.length === 0) return null;

  // Project each driver's points as if they finish where they qualified
  const driverProvisional = {};
  for (const result of qualiResults) {
    const driverId = result.Driver?.driverId;
    if (!driverId) continue;
    const position = parseInt(result.position, 10);
    driverProvisional[driverId] = {
      points: SCORING.RACE_FINISH[position] || 0,
      position,
    };
  }

  // Project constructor points: race finish + qualifying bonus
  const constructorProvisional = {};
  for (const constructor of CONSTRUCTORS) {
    let racePoints = 0;
    for (const driverId of constructor.drivers) {
      if (driverProvisional[driverId]) {
        racePoints += driverProvisional[driverId].points;
      }
    }
    const qualiBonus = calculateConstructorQualifyingBonus(constructor.id, qualiResults);
    constructorProvisional[constructor.id] = {
      points: racePoints + qualiBonus.bonus,
      racePoints,
      qualiBonus: qualiBonus.bonus,
    };
  }

  return {
    round: latestQualiRound,
    raceName: qualiRace.raceName,
    driverProvisional,
    constructorProvisional,
  };
}

function renderProvisionalBanner() {
  const container = document.getElementById('provisional-race-banner');
  if (!container) return;

  const provisional = getProvisionalData();
  if (!provisional) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <span class="provisional-banner__icon" aria-hidden="true">&#9203;</span>
    <div class="provisional-banner__text">
      <strong>Qualifying complete &mdash; ${provisional.raceName}</strong>
      <span>Points below are projected if grid positions hold to the finish. No position changes assumed.</span>
    </div>
  `;
}

function updateTeamMeta() {
  const team = getTeam();
  document.getElementById('team-budget').textContent = `$${team.budget.toFixed(1)}M`;
  document.getElementById('team-transfers').textContent = team.freeTransfers;

  const history = loadScoringHistory();
  const totalPoints = Object.values(history).reduce((sum, r) => sum + (r.total || 0), 0);

  const provisional = getProvisionalData();
  const totalEl = document.getElementById('team-total-points');
  if (provisional) {
    const provDriverPts = team.drivers.reduce((sum, dId) => {
      return sum + (provisional.driverProvisional[dId]?.points || 0);
    }, 0);
    const provConPts = team.constructors.reduce((sum, cId) => {
      return sum + (provisional.constructorProvisional[cId]?.points || 0);
    }, 0);
    const provTotal = provDriverPts + provConPts;
    totalEl.innerHTML = `${totalPoints} <span class="meta-provisional" title="Projected points this race if qualifying positions hold">+~${provTotal} proj.</span>`;
  } else {
    totalEl.textContent = totalPoints;
  }

  renderProvisionalBanner();
}

function renderSlots() {
  const team = getTeam();
  const slotsContainer = document.getElementById('driver-slots');
  const constructorContainer = document.getElementById('constructor-slots');

  const provisional = getProvisionalData();
  renderProvisionalBanner();

  // Build per-driver points from scoring history
  const history = loadScoringHistory();
  const sortedRounds = Object.keys(history).sort((a, b) => Number(a) - Number(b));
  const driverTotalPts = {};
  const driverLastPts = {};
  const lastRound = sortedRounds[sortedRounds.length - 1];

  for (const [round, roundData] of Object.entries(history)) {
    if (roundData.driverScores) {
      for (const [dId, scoreObj] of Object.entries(roundData.driverScores)) {
        const pts = typeof scoreObj === 'object' ? (scoreObj.total || 0) : scoreObj;
        driverTotalPts[dId] = (driverTotalPts[dId] || 0) + pts;
      }
    }
  }
  if (lastRound && history[lastRound]?.driverScores) {
    for (const [dId, scoreObj] of Object.entries(history[lastRound].driverScores)) {
      driverLastPts[dId] = typeof scoreObj === 'object' ? (scoreObj.total || 0) : scoreObj;
    }
  }

  // Constructor points
  const constructorTotalPts = {};
  for (const [, roundData] of Object.entries(history)) {
    if (roundData.constructorScores) {
      for (const [cId, scoreObj] of Object.entries(roundData.constructorScores)) {
        const pts = typeof scoreObj === 'object' ? (scoreObj.total || 0) : scoreObj;
        constructorTotalPts[cId] = (constructorTotalPts[cId] || 0) + pts;
      }
    }
  }

  // Driver slots (5)
  slotsContainer.innerHTML = team.drivers.map((driverId, i) => {
    if (!driverId) {
      return `
        <div class="slot slot--empty" data-slot="${i}" data-type="driver"
             role="button" tabindex="0" aria-label="Select driver for slot ${i + 1}">
          <div class="slot__placeholder">+ Select Driver</div>
        </div>
      `;
    }
    const driver = DRIVERS.find(d => d.id === driverId);
    if (!driver) return '';
    const constructor = CONSTRUCTORS.find(c => c.id === driver.team);
    const color = TEAM_COLORS[driver.team] || 'var(--border-color)';

    // Check if this driver has an active boost
    const boosts = getBoosts();
    let boostBadge = '';
    for (const [type, state] of Object.entries(boosts)) {
      if (state.active && state.target === driverId) {
        const labels = { drs: 'DRS 2x', mega: 'MEGA 3x', 'extra-drs': 'XDRS 2x' };
        boostBadge = `<span class="slot__boost-badge">${labels[type] || type}</span>`;
      }
    }

    const totalPts = driverTotalPts[driverId] || 0;
    const lastPts = driverLastPts[driverId];
    const lastPtsHtml = lastPts !== undefined
      ? `<span class="slot__driver-last">Last: ${lastPts >= 0 ? '+' : ''}${lastPts}</span>`
      : '';

    const provPts = provisional?.driverProvisional?.[driverId];
    const provisionalHtml = provPts !== undefined
      ? `<div class="slot__provisional" title="Projected if P${provPts.position} finish — no position changes assumed">
           <span class="slot__provisional__icon">&#126;</span>
           <span class="slot__provisional__pts">${provPts.points >= 0 ? '+' : ''}${provPts.points} pts</span>
           <span class="slot__provisional__pos">if P${provPts.position}</span>
           <span class="slot__provisional__badge">PROJ</span>
         </div>`
      : '';

    return `
      <div class="slot slot--filled" data-slot="${i}" data-type="driver" style="border-color:${color}"
           data-driver-profile="${driverId}" aria-label="View ${driver.firstName} ${driver.lastName} profile">
        <div class="slot__driver">
          <div class="slot__driver-header">
            <span class="slot__driver-name">${driver.firstName} ${driver.lastName}</span>
            ${boostBadge}
          </div>
          <span class="slot__driver-team">${constructor?.name || driver.team}</span>
          <div class="slot__driver-meta">
            <span class="slot__driver-price">$${driver.price}M</span>
            <span class="slot__driver-points">${totalPts} pts</span>
            ${lastPtsHtml}
          </div>
          ${provisionalHtml}
          <button class="slot__remove" data-remove-type="driver" data-remove-slot="${i}" data-no-profile
                  aria-label="Remove ${driver.firstName} ${driver.lastName}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  // Constructor slots (2)
  constructorContainer.innerHTML = team.constructors.map((constructorId, i) => {
    if (!constructorId) {
      return `
        <div class="slot slot--empty slot--constructor" data-slot="${i}" data-type="constructor"
             role="button" tabindex="0" aria-label="Select constructor for slot ${i + 1}">
          <div class="slot__placeholder">+ Select Constructor</div>
        </div>
      `;
    }
    const c = CONSTRUCTORS.find(c => c.id === constructorId);
    if (!c) return '';

    const totalPts = constructorTotalPts[constructorId] || 0;

    const cProvPts = provisional?.constructorProvisional?.[constructorId];
    const cProvisionalHtml = cProvPts !== undefined
      ? `<div class="slot__provisional" title="Projected: ${cProvPts.racePoints} race pts + ${cProvPts.qualiBonus >= 0 ? '+' : ''}${cProvPts.qualiBonus} quali bonus">
           <span class="slot__provisional__icon">&#126;</span>
           <span class="slot__provisional__pts">${cProvPts.points >= 0 ? '+' : ''}${cProvPts.points} pts</span>
           <span class="slot__provisional__pos">${cProvPts.racePoints} race, ${cProvPts.qualiBonus >= 0 ? '+' : ''}${cProvPts.qualiBonus} quali</span>
           <span class="slot__provisional__badge">PROJ</span>
         </div>`
      : '';

    return `
      <div class="slot slot--filled slot--constructor" data-slot="${i}" data-type="constructor" style="border-color:${c.color}">
        <div class="slot__driver">
          <span class="slot__driver-name">${c.name}</span>
          <span class="slot__driver-team">${c.drivers.map(id => {
            const d = DRIVERS.find(d => d.id === id);
            return d ? `${d.firstName} ${d.lastName}` : id;
          }).join(', ')}</span>
          <div class="slot__driver-meta">
            <span class="slot__driver-price">$${c.price}M</span>
            <span class="slot__driver-points">${totalPts} pts</span>
          </div>
          ${cProvisionalHtml}
          <button class="slot__remove" data-remove-type="constructor" data-remove-slot="${i}"
                  aria-label="Remove ${c.name}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  // Empty slot: click + keyboard handlers
  slotsContainer.querySelectorAll('.slot--empty').forEach(slot => {
    const open = () => openPicker('driver', parseInt(slot.dataset.slot, 10));
    slot.addEventListener('click', open);
    slot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  constructorContainer.querySelectorAll('.slot--empty').forEach(slot => {
    const open = () => openPicker('constructor', parseInt(slot.dataset.slot, 10));
    slot.addEventListener('click', open);
    slot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });

  // Remove buttons with undo
  document.querySelectorAll('.slot__remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.removeType;
      const slot = parseInt(btn.dataset.removeSlot, 10);

      if (type === 'constructor') {
        removeConstructor(slot);
        showToast('Constructor removed.', 'info', 3500);
      } else {
        const driverId = getTeam().drivers[slot];
        const driver = DRIVERS.find(d => d.id === driverId);
        const driverName = driver ? `${driver.firstName} ${driver.lastName}` : 'Driver';

        // Clear any pending undo timer
        if (lastRemoved?.timer) clearTimeout(lastRemoved.timer);

        removeDriver(slot);

        const undoTimer = setTimeout(() => { lastRemoved = null; }, 5000);
        lastRemoved = { id: driverId, slot, timer: undoTimer };

        showToast(`${driverName} removed.`, 'info', 5000, {
          label: 'Undo',
          fn: () => {
            if (lastRemoved && lastRemoved.id === driverId) {
              clearTimeout(lastRemoved.timer);
              const result = addDriver(lastRemoved.id, lastRemoved.slot);
              lastRemoved = null;
              if (!result.success) showToast(result.error, 'error');
            }
          },
        });
      }
    });
  });
}

function renderBoosts() {
  const boosts = getBoosts();
  const team = getTeam();

  document.querySelectorAll('.chip[data-boost]').forEach(chip => {
    const type = chip.dataset.boost;
    const state = boosts[type];
    const statusEl = chip.querySelector('.chip__status');

    chip.classList.remove('active', 'used');

    if (state?.used && type !== 'drs') {
      chip.classList.add('used');
      statusEl.textContent = 'Used';
    } else if (state?.active) {
      chip.classList.add('active');
      if (state.target) {
        const driver = DRIVERS.find(d => d.id === state.target);
        statusEl.textContent = driver ? `Active: ${driver.code}` : 'Active';
      } else {
        statusEl.textContent = 'Active';
      }
    } else {
      const perRaceBoosts = ['drs'];
      statusEl.textContent = perRaceBoosts.includes(type) ? 'Available each race' : 'Available';
    }

    chip.onclick = (e) => {
      // Don't activate if the info button was clicked
      if (e.target.closest('.chip__info')) return;

      if (state?.used && type !== 'drs') return;

      if (state?.active) {
        deactivateBoost(type);
        renderBoosts();
        renderSlots();
        return;
      }

      const needsTarget = ['drs', 'mega', 'extra-drs'];
      if (needsTarget.includes(type)) {
        const driversOnTeam = team.drivers.filter(d => d !== null);
        if (driversOnTeam.length === 0) {
          showToast('Add drivers to your team before activating this boost.', 'warning');
          return;
        }
        openBoostTargetModal(type);
        return;
      }

      const result = activateBoost(type);
      if (!result.success) {
        showToast(result.error, 'error');
      }
      renderBoosts();
      renderSlots();
    };
  });
}

// ===== Boost Info Panel (P2.2) =====

function setupChipInfo() {
  let expandedChip = null;

  document.addEventListener('click', (e) => {
    const infoBtn = e.target.closest('.chip__info');
    if (infoBtn) {
      e.stopPropagation();
      const chip = infoBtn.closest('.chip');
      if (!chip) return;

      if (expandedChip && expandedChip !== chip) {
        expandedChip.classList.remove('chip--expanded');
      }

      chip.classList.toggle('chip--expanded');
      expandedChip = chip.classList.contains('chip--expanded') ? chip : null;
      return;
    }

    // Click outside collapses expanded chip
    if (expandedChip && !e.target.closest('.chip--expanded')) {
      expandedChip.classList.remove('chip--expanded');
      expandedChip = null;
    }
  });
}

// ===== Guest Notice (P0.4) =====

function renderGuestNotice() {
  // Detect guest mode by checking if the guest profile button is visible
  const guestBtn = document.getElementById('guest-profile-btn');
  const isGuest = guestBtn && guestBtn.style.display !== 'none';
  if (!isGuest) return;

  const builder = document.querySelector('.team-builder');
  if (!builder) return;

  if (document.getElementById('guest-team-notice')) return; // Already rendered

  const notice = document.createElement('div');
  notice.className = 'guest-notice';
  notice.id = 'guest-team-notice';
  notice.innerHTML = `
    <span class="guest-notice__icon" aria-hidden="true">&#9888;</span>
    <span class="guest-notice__text">
      <strong>Guest mode</strong> — your team saves locally only. Sign in to sync across devices.
    </span>
    <button class="guest-notice__btn" id="guest-notice-signin">Sign In</button>
  `;
  builder.insertAdjacentElement('afterbegin', notice);

  document.getElementById('guest-notice-signin').addEventListener('click', () => {
    document.getElementById('guest-signin-btn')?.click();
  });
}

// ===== Team Name =====

function initTeamNameUI() {
  renderTeamNameDisplay();

  document.getElementById('team-name-edit-btn').addEventListener('click', () => {
    document.getElementById('team-name-input').value = getTeamName();
    document.getElementById('team-name-row').style.display = 'none';
    const form = document.getElementById('team-name-form');
    form.removeAttribute('hidden');
    form.style.display = 'flex';
    const input = document.getElementById('team-name-input');
    input.focus();
    input.select();
  });

  document.getElementById('team-name-save').addEventListener('click', saveTeamNameFromUI);

  document.getElementById('team-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveTeamNameFromUI();
    if (e.key === 'Escape') cancelTeamNameEdit();
  });

  document.getElementById('team-name-cancel').addEventListener('click', cancelTeamNameEdit);

  on(HookEvents.TEAM_NAME_CHANGED, renderTeamNameDisplay);
}

function renderTeamNameDisplay() {
  const el = document.getElementById('team-name-display');
  if (el) el.textContent = getTeamName() || 'My Fantasy Team';
}

function saveTeamNameFromUI() {
  const input = document.getElementById('team-name-input');
  setTeamName(input.value);
  cancelTeamNameEdit();
  showToast('Team name saved.', 'success');
}

function cancelTeamNameEdit() {
  document.getElementById('team-name-row').style.display = '';
  const form = document.getElementById('team-name-form');
  form.setAttribute('hidden', '');
  form.style.display = 'none';
}

// ===== Boost Target Selection Modal =====

function setupBoostTargetModal() {
  const modal = document.getElementById('boost-target-modal');
  if (!modal) return;

  const backdrop = modal.querySelector('.boost-target__backdrop');
  const closeBtn = document.getElementById('boost-target-close');

  backdrop.addEventListener('click', closeBoostTargetModal);
  closeBtn.addEventListener('click', closeBoostTargetModal);
}

function openBoostTargetModal(boostType) {
  pendingBoostType = boostType;
  const modal = document.getElementById('boost-target-modal');
  const title = document.getElementById('boost-target-title');
  const body = document.getElementById('boost-target-body');

  const labels = {
    drs: 'DRS Boost (2x points)',
    mega: 'Mega Driver (3x points)',
    'extra-drs': 'Extra DRS (2x points)',
  };
  title.textContent = `Select driver for ${labels[boostType] || boostType}`;

  const team = getTeam();
  body.innerHTML = team.drivers.filter(id => id !== null).map(driverId => {
    const driver = DRIVERS.find(d => d.id === driverId);
    if (!driver) return '';
    const color = TEAM_COLORS[driver.team] || 'var(--border-color)';

    return `
      <div class="boost-target-item" data-driver-id="${driver.id}" role="button" tabindex="0">
        <span class="picker-item__color" style="background:${color}"></span>
        <div class="picker-item__info">
          <div class="picker-item__name">${driver.firstName} ${driver.lastName}</div>
          <div class="picker-item__team">${CONSTRUCTORS.find(c => c.id === driver.team)?.name || driver.team}</div>
        </div>
      </div>
    `;
  }).join('');

  body.querySelectorAll('.boost-target-item').forEach(el => {
    el.addEventListener('click', () => {
      const driverId = el.dataset.driverId;
      const result = activateBoost(pendingBoostType, driverId);
      if (result.success) {
        closeBoostTargetModal();
        renderBoosts();
        renderSlots();
      } else {
        showToast(result.error, 'error');
      }
    });
  });

  modal.removeAttribute('hidden');
  modal.style.display = 'flex';
  // Focus first item for keyboard users
  setTimeout(() => body.querySelector('.boost-target-item')?.focus(), 50);
}

export function closeBoostTargetModal() {
  const modal = document.getElementById('boost-target-modal');
  if (modal) {
    modal.setAttribute('hidden', '');
    modal.style.display = 'none';
  }
  pendingBoostType = null;
}

// ===== Picker Modal =====

function setupPicker() {
  const picker = document.getElementById('picker');
  const backdrop = picker.querySelector('.picker__backdrop');
  const closeBtn = document.getElementById('picker-close');
  const searchInput = document.getElementById('picker-search');
  const sortSelect = document.getElementById('picker-sort');

  backdrop.addEventListener('click', closePicker);
  closeBtn.addEventListener('click', closePicker);
  searchInput.addEventListener('input', renderPickerItems);
  sortSelect.addEventListener('change', renderPickerItems);
}

function openPicker(mode, slot = null) {
  pickerMode = mode;
  pickerSlot = slot;

  const picker = document.getElementById('picker');
  const title = document.getElementById('picker-title');
  const search = document.getElementById('picker-search');

  title.textContent = mode === 'driver' ? 'Select Driver' : 'Select Constructor';
  search.value = '';
  picker.removeAttribute('hidden');
  picker.style.display = 'flex';

  // Update budget indicator
  updatePickerBudget();

  renderPickerItems();

  // Focus search for keyboard users
  setTimeout(() => search.focus(), 50);
}

export function closePicker() {
  const picker = document.getElementById('picker');
  picker.setAttribute('hidden', '');
  picker.style.display = 'none';
  pickerMode = null;
  pickerSlot = null;
}

function updatePickerBudget() {
  const el = document.getElementById('picker-budget-value');
  if (el) {
    const team = getTeam();
    el.textContent = `$${team.budget.toFixed(1)}M`;
  }
}

function renderPickerItems() {
  const body = document.getElementById('picker-body');
  const searchVal = document.getElementById('picker-search').value.toLowerCase();
  const sortVal = document.getElementById('picker-sort').value;
  const team = getTeam();

  // Also keep budget indicator current
  updatePickerBudget();

  if (pickerMode === 'driver') {
    let items = DRIVERS.map(d => ({
      ...d,
      fullName: `${d.firstName} ${d.lastName}`,
      teamName: CONSTRUCTORS.find(c => c.id === d.team)?.name || d.team,
      color: TEAM_COLORS[d.team] || 'var(--border-color)',
      onTeam: team.drivers.includes(d.id),
      overBudget: d.price > team.budget,
      points: 0,
    }));

    if (searchVal) {
      items = items.filter(d =>
        d.fullName.toLowerCase().includes(searchVal) ||
        d.teamName.toLowerCase().includes(searchVal) ||
        d.code.toLowerCase().includes(searchVal)
      );
    }

    items.sort(getSortFn(sortVal));

    body.innerHTML = items.map(d => {
      let disabledClass = '';
      let reasonHtml = '';
      if (d.onTeam) {
        disabledClass = 'picker-item--on-team';
        reasonHtml = '<span class="picker-item__reason">On team</span>';
      } else if (d.overBudget) {
        disabledClass = 'picker-item--over-budget';
        reasonHtml = '<span class="picker-item__reason">Over budget</span>';
      }

      return `
        <div class="picker-item ${disabledClass}" data-driver-id="${d.id}">
          <span class="picker-item__color" style="background:${d.color}"></span>
          <div class="picker-item__info">
            <div class="picker-item__name">${d.fullName}</div>
            <div class="picker-item__team">${d.teamName}</div>
          </div>
          <span class="picker-item__price">$${d.price}M</span>
          <span class="picker-item__points">${d.points} pts</span>
          ${reasonHtml}
        </div>
      `;
    }).join('');

    body.querySelectorAll('.picker-item:not(.picker-item--on-team):not(.picker-item--over-budget)').forEach(el => {
      el.addEventListener('click', () => {
        const result = addDriver(el.dataset.driverId, pickerSlot);
        if (result.success) {
          closePicker();
        } else {
          showToast(result.error, 'error');
        }
      });
    });

  } else {
    // Constructor picker
    let items = CONSTRUCTORS.map(c => ({
      ...c,
      driverNames: c.drivers.map(id => {
        const d = DRIVERS.find(d => d.id === id);
        return d ? `${d.firstName} ${d.lastName}` : id;
      }).join(', '),
      onTeam: team.constructors.includes(c.id),
      points: 0,
    }));

    if (searchVal) {
      items = items.filter(c =>
        c.name.toLowerCase().includes(searchVal) ||
        c.driverNames.toLowerCase().includes(searchVal)
      );
    }

    items.sort(getSortFn(sortVal));

    body.innerHTML = items.map(c => {
      const disabledClass = c.onTeam ? 'picker-item--on-team' : '';
      const reasonHtml = c.onTeam ? '<span class="picker-item__reason">On team</span>' : '';

      return `
        <div class="picker-item ${disabledClass}" data-constructor-id="${c.id}">
          <span class="picker-item__color" style="background:${c.color}"></span>
          <div class="picker-item__info">
            <div class="picker-item__name">${c.name}</div>
            <div class="picker-item__team">${c.driverNames}</div>
          </div>
          <span class="picker-item__price">$${c.price}M</span>
          <span class="picker-item__points">${c.points} pts</span>
          ${reasonHtml}
        </div>
      `;
    }).join('');

    body.querySelectorAll('.picker-item:not(.picker-item--on-team)').forEach(el => {
      el.addEventListener('click', () => {
        const result = setConstructor(el.dataset.constructorId, pickerSlot);
        if (result.success) {
          closePicker();
        } else {
          showToast(result.error, 'error');
        }
      });
    });
  }
}

function getSortFn(sortVal) {
  switch (sortVal) {
    case 'price-asc': return (a, b) => a.price - b.price;
    case 'price-desc': return (a, b) => b.price - a.price;
    case 'points-desc': return (a, b) => (b.points || 0) - (a.points || 0);
    case 'name-asc': return (a, b) => (a.fullName || a.name || '').localeCompare(b.fullName || b.name || '');
    default: return () => 0;
  }
}
