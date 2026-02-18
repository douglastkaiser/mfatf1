// Team Management UI
// Handles the My Team view: driver/constructor selection, slot rendering,
// picker modal, boost activation with driver target selection.
// Supports 5 drivers + 2 constructors per the official F1 Fantasy format.

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS } from '../config.js';
import { on, HookEvents } from '../services/hooks.js';
import {
  getTeam, addDriver, removeDriver, setConstructor, removeConstructor,
  activateBoost, deactivateBoost, getBoosts, getBudget,
} from '../models/team.js';
import { loadScoringHistory } from '../services/storage.js';

let pickerMode = null; // 'driver' | 'constructor'
let pickerSlot = null;
let pendingBoostType = null; // when waiting for driver target selection

export function initTeamUI() {
  renderSlots();
  renderBoosts();
  setupPicker();
  setupBoostTargetModal();

  on(HookEvents.TEAM_UPDATED, () => {
    renderSlots();
    updateTeamMeta();
    renderBoosts();
  });
}

function updateTeamMeta() {
  const team = getTeam();
  document.getElementById('team-budget').textContent = `$${team.budget.toFixed(1)}M`;
  document.getElementById('team-transfers').textContent = team.freeTransfers;

  const history = loadScoringHistory();
  const totalPoints = Object.values(history).reduce((sum, r) => sum + (r.total || 0), 0);
  document.getElementById('team-total-points').textContent = totalPoints;
}

function renderSlots() {
  const team = getTeam();
  const slotsContainer = document.getElementById('driver-slots');
  const constructorContainer = document.getElementById('constructor-slots');

  // Driver slots (5)
  slotsContainer.innerHTML = team.drivers.map((driverId, i) => {
    if (!driverId) {
      return `
        <div class="slot slot--empty" data-slot="${i}" data-type="driver">
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

    return `
      <div class="slot slot--filled" data-slot="${i}" data-type="driver" style="border-color:${color}">
        <div class="slot__driver">
          <div class="slot__driver-header">
            <span class="slot__driver-name">${driver.firstName} ${driver.lastName}</span>
            ${boostBadge}
          </div>
          <span class="slot__driver-team">${constructor?.name || driver.team}</span>
          <div class="slot__driver-meta">
            <span class="slot__driver-price">$${driver.price}M</span>
            <span class="slot__driver-points">0 pts</span>
          </div>
          <button class="slot__remove" data-remove-type="driver" data-remove-slot="${i}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  // Constructor slots (2)
  constructorContainer.innerHTML = team.constructors.map((constructorId, i) => {
    if (!constructorId) {
      return `
        <div class="slot slot--empty slot--constructor" data-slot="${i}" data-type="constructor">
          <div class="slot__placeholder">+ Select Constructor</div>
        </div>
      `;
    }
    const c = CONSTRUCTORS.find(c => c.id === constructorId);
    if (!c) return '';

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
            <span class="slot__driver-points">0 pts</span>
          </div>
          <button class="slot__remove" data-remove-type="constructor" data-remove-slot="${i}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach click handlers for empty slots
  slotsContainer.querySelectorAll('.slot--empty').forEach(slot => {
    slot.addEventListener('click', () => openPicker('driver', parseInt(slot.dataset.slot, 10)));
  });
  constructorContainer.querySelectorAll('.slot--empty').forEach(slot => {
    slot.addEventListener('click', () => openPicker('constructor', parseInt(slot.dataset.slot, 10)));
  });

  // Remove buttons
  document.querySelectorAll('.slot__remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.removeType;
      const slot = parseInt(btn.dataset.removeSlot, 10);
      if (type === 'constructor') {
        removeConstructor(slot);
      } else {
        removeDriver(slot);
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
      // Show target driver name for targeted boosts
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

    chip.onclick = () => {
      if (state?.used && type !== 'drs') return;

      if (state?.active) {
        deactivateBoost(type);
        renderBoosts();
        renderSlots();
        return;
      }

      // Boosts that need a driver target
      const needsTarget = ['drs', 'mega', 'extra-drs'];
      if (needsTarget.includes(type)) {
        // Check if team has any drivers
        const driversOnTeam = team.drivers.filter(d => d !== null);
        if (driversOnTeam.length === 0) {
          alert('Add drivers to your team before activating this boost.');
          return;
        }
        openBoostTargetModal(type);
        return;
      }

      // Non-targeted boosts (limitless, wildcard, no-negative) activate directly
      const result = activateBoost(type);
      if (!result.success) {
        alert(result.error);
      }
      renderBoosts();
      renderSlots();
    };
  });
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
      <div class="boost-target-item" data-driver-id="${driver.id}">
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
        alert(result.error);
      }
    });
  });

  modal.removeAttribute('hidden');
  modal.style.display = 'flex';
}

function closeBoostTargetModal() {
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

  renderPickerItems();
}

function closePicker() {
  const picker = document.getElementById('picker');
  picker.setAttribute('hidden', '');
  picker.style.display = 'none';
  pickerMode = null;
  pickerSlot = null;
}

function renderPickerItems() {
  const body = document.getElementById('picker-body');
  const searchVal = document.getElementById('picker-search').value.toLowerCase();
  const sortVal = document.getElementById('picker-sort').value;
  const team = getTeam();

  if (pickerMode === 'driver') {
    let items = DRIVERS.map(d => ({
      ...d,
      fullName: `${d.firstName} ${d.lastName}`,
      teamName: CONSTRUCTORS.find(c => c.id === d.team)?.name || d.team,
      color: TEAM_COLORS[d.team] || 'var(--border-color)',
      onTeam: team.drivers.includes(d.id),
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

    body.innerHTML = items.map(d => `
      <div class="picker-item${d.onTeam ? ' disabled' : ''}" data-driver-id="${d.id}">
        <span class="picker-item__color" style="background:${d.color}"></span>
        <div class="picker-item__info">
          <div class="picker-item__name">${d.fullName}</div>
          <div class="picker-item__team">${d.teamName}</div>
        </div>
        <span class="picker-item__price">$${d.price}M</span>
        <span class="picker-item__points">${d.points} pts</span>
      </div>
    `).join('');

    body.querySelectorAll('.picker-item:not(.disabled)').forEach(el => {
      el.addEventListener('click', () => {
        const result = addDriver(el.dataset.driverId, pickerSlot);
        if (result.success) closePicker();
        else alert(result.error);
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

    body.innerHTML = items.map(c => `
      <div class="picker-item${c.onTeam ? ' disabled' : ''}" data-constructor-id="${c.id}">
        <span class="picker-item__color" style="background:${c.color}"></span>
        <div class="picker-item__info">
          <div class="picker-item__name">${c.name}</div>
          <div class="picker-item__team">${c.driverNames}</div>
        </div>
        <span class="picker-item__price">$${c.price}M</span>
        <span class="picker-item__points">${c.points} pts</span>
      </div>
    `).join('');

    body.querySelectorAll('.picker-item:not(.disabled)').forEach(el => {
      el.addEventListener('click', () => {
        const result = setConstructor(el.dataset.constructorId, pickerSlot);
        if (result.success) closePicker();
        else alert(result.error);
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
