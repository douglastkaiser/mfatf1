// Team Management UI
// Handles the My Team view: driver/constructor selection, slot rendering,
// picker modal, and boost activation.

import { DRIVERS, CONSTRUCTORS, TEAM_COLORS } from '../config.js';
import { on, HookEvents } from '../services/hooks.js';
import {
  getTeam, addDriver, removeDriver, setConstructor, removeConstructor,
  activateBoost, deactivateBoost, getBoosts, getBudget,
} from '../models/team.js';
import { loadScoringHistory } from '../services/storage.js';

let pickerMode = null; // 'driver' | 'constructor'
let pickerSlot = null;

export function initTeamUI() {
  renderSlots();
  renderBoosts();
  setupPicker();

  on(HookEvents.TEAM_UPDATED, () => {
    renderSlots();
    updateTeamMeta();
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

  // Driver slots
  slotsContainer.innerHTML = team.drivers.map((driverId, i) => {
    if (!driverId) {
      return `
        <div class="slot slot--empty" data-slot="${i}">
          <div class="slot__placeholder">+ Select Driver</div>
        </div>
      `;
    }
    const driver = DRIVERS.find(d => d.id === driverId);
    if (!driver) return '';
    const constructor = CONSTRUCTORS.find(c => c.id === driver.team);
    const color = TEAM_COLORS[driver.team] || 'var(--border-color)';

    return `
      <div class="slot slot--filled" data-slot="${i}" style="border-color:${color}">
        <div class="slot__driver">
          <span class="slot__driver-name">${driver.firstName} ${driver.lastName}</span>
          <span class="slot__driver-team">${constructor?.name || driver.team}</span>
          <div class="slot__driver-meta">
            <span class="slot__driver-price">$${driver.price}M</span>
            <span class="slot__driver-points">0 pts</span>
          </div>
          <button class="slot__remove" data-remove-slot="${i}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  // Constructor slot
  if (!team.constructor) {
    constructorContainer.innerHTML = `
      <div class="slot slot--empty slot--constructor" data-slot="constructor">
        <div class="slot__placeholder">+ Select Constructor</div>
      </div>
    `;
  } else {
    const c = CONSTRUCTORS.find(c => c.id === team.constructor);
    if (c) {
      constructorContainer.innerHTML = `
        <div class="slot slot--filled slot--constructor" data-slot="constructor" style="border-color:${c.color}">
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
            <button class="slot__remove" data-remove-slot="constructor">Remove</button>
          </div>
        </div>
      `;
    }
  }

  // Attach click handlers
  slotsContainer.querySelectorAll('.slot--empty').forEach(slot => {
    slot.addEventListener('click', () => openPicker('driver', parseInt(slot.dataset.slot, 10)));
  });
  constructorContainer.querySelectorAll('.slot--empty').forEach(slot => {
    slot.addEventListener('click', () => openPicker('constructor'));
  });

  // Remove buttons
  document.querySelectorAll('.slot__remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slot = btn.dataset.removeSlot;
      if (slot === 'constructor') {
        removeConstructor();
      } else {
        removeDriver(parseInt(slot, 10));
      }
    });
  });
}

function renderBoosts() {
  const boosts = getBoosts();
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
      statusEl.textContent = 'Active';
    } else {
      statusEl.textContent = type === 'drs' ? 'Available each race' : 'Available';
    }

    chip.onclick = () => {
      if (state?.used && type !== 'drs') return;
      if (state?.active) {
        deactivateBoost(type);
        renderBoosts();
        return;
      }
      // For simplicity, activate without target selection for now
      activateBoost(type);
      renderBoosts();
    };
  });
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
  picker.hidden = false;

  renderPickerItems();
}

function closePicker() {
  document.getElementById('picker').hidden = true;
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
      points: 0, // Will be populated from scoring history
    }));

    // Filter
    if (searchVal) {
      items = items.filter(d =>
        d.fullName.toLowerCase().includes(searchVal) ||
        d.teamName.toLowerCase().includes(searchVal) ||
        d.code.toLowerCase().includes(searchVal)
      );
    }

    // Sort
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
      onTeam: team.constructor === c.id,
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
        const result = setConstructor(el.dataset.constructorId);
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
