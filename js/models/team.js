// Fantasy Team Model
// Manages the user's team: driver/constructor selection, budget, transfers, boosts.

import { DRIVERS, CONSTRUCTORS, BUDGET, SCORING } from '../config.js';
import { emit, HookEvents } from '../services/hooks.js';
import { loadTeam, saveTeam, loadBoosts, saveBoosts, loadTransferLog, saveTransferLog } from '../services/storage.js';

let teamState = null;
let boostState = null;
let transferLog = null;

export function initTeam() {
  teamState = loadTeam();
  boostState = loadBoosts();
  transferLog = loadTransferLog();
  return teamState;
}

export function getTeam() {
  if (!teamState) initTeam();
  return { ...teamState };
}

export function getBoosts() {
  if (!boostState) boostState = loadBoosts();
  return { ...boostState };
}

/**
 * Add a driver to a slot.
 * @param {string} driverId
 * @param {number} slot - 0-4
 * @returns {{ success: boolean, error?: string }}
 */
export function addDriver(driverId, slot) {
  if (!teamState) initTeam();

  const driver = DRIVERS.find(d => d.id === driverId);
  if (!driver) return { success: false, error: 'Driver not found' };

  if (slot < 0 || slot > 4) return { success: false, error: 'Invalid slot' };

  // Check if driver already on team
  if (teamState.drivers.includes(driverId)) {
    return { success: false, error: 'Driver already on team' };
  }

  // Calculate budget impact
  const currentDriverId = teamState.drivers[slot];
  let budgetChange = -driver.price;
  if (currentDriverId) {
    const currentDriver = DRIVERS.find(d => d.id === currentDriverId);
    budgetChange += currentDriver ? currentDriver.price : 0;
  }

  const isLimitless = boostState?.limitless?.active;
  if (!isLimitless && teamState.budget + budgetChange < 0) {
    return { success: false, error: 'Insufficient budget' };
  }

  // Check if this is a transfer (replacing a filled slot after lockdown)
  if (currentDriverId && teamState.locked) {
    const freeLeft = teamState.freeTransfers - teamState.transfersMade;
    if (freeLeft <= 0) {
      // Extra transfer penalty will be applied
    }
    transferLog.push({
      type: 'driver',
      out: currentDriverId,
      in: driverId,
      timestamp: new Date().toISOString(),
    });
    saveTransferLog(transferLog);
    emit(HookEvents.TEAM_TRANSFER_MADE, { out: currentDriverId, in: driverId });
  }

  teamState.drivers[slot] = driverId;
  if (!isLimitless) {
    teamState.budget = Math.round((teamState.budget + budgetChange) * 10) / 10;
  }

  saveTeam(teamState);
  emit(HookEvents.TEAM_DRIVER_ADDED, { driverId, slot });
  emit(HookEvents.TEAM_UPDATED, teamState);
  emit(HookEvents.TEAM_BUDGET_CHANGED, teamState.budget);

  return { success: true };
}

/**
 * Remove a driver from a slot.
 */
export function removeDriver(slot) {
  if (!teamState) initTeam();
  if (slot < 0 || slot > 4) return { success: false, error: 'Invalid slot' };

  const driverId = teamState.drivers[slot];
  if (!driverId) return { success: false, error: 'Slot is empty' };

  const driver = DRIVERS.find(d => d.id === driverId);
  if (driver) {
    teamState.budget = Math.round((teamState.budget + driver.price) * 10) / 10;
  }

  teamState.drivers[slot] = null;
  saveTeam(teamState);

  emit(HookEvents.TEAM_DRIVER_REMOVED, { driverId, slot });
  emit(HookEvents.TEAM_UPDATED, teamState);
  emit(HookEvents.TEAM_BUDGET_CHANGED, teamState.budget);

  return { success: true };
}

/**
 * Set the constructor.
 */
export function setConstructor(constructorId) {
  if (!teamState) initTeam();

  const constructor = CONSTRUCTORS.find(c => c.id === constructorId);
  if (!constructor) return { success: false, error: 'Constructor not found' };

  // Budget adjustment
  let budgetChange = -constructor.price;
  if (teamState.constructor) {
    const current = CONSTRUCTORS.find(c => c.id === teamState.constructor);
    budgetChange += current ? current.price : 0;
  }

  const isLimitless = boostState?.limitless?.active;
  if (!isLimitless && teamState.budget + budgetChange < 0) {
    return { success: false, error: 'Insufficient budget' };
  }

  teamState.constructor = constructorId;
  if (!isLimitless) {
    teamState.budget = Math.round((teamState.budget + budgetChange) * 10) / 10;
  }

  saveTeam(teamState);
  emit(HookEvents.TEAM_CONSTRUCTOR_CHANGED, { constructorId });
  emit(HookEvents.TEAM_UPDATED, teamState);
  emit(HookEvents.TEAM_BUDGET_CHANGED, teamState.budget);

  return { success: true };
}

/**
 * Remove the constructor.
 */
export function removeConstructor() {
  if (!teamState) initTeam();
  if (!teamState.constructor) return { success: false, error: 'No constructor selected' };

  const current = CONSTRUCTORS.find(c => c.id === teamState.constructor);
  if (current) {
    teamState.budget = Math.round((teamState.budget + current.price) * 10) / 10;
  }
  teamState.constructor = null;
  saveTeam(teamState);

  emit(HookEvents.TEAM_CONSTRUCTOR_CHANGED, { constructorId: null });
  emit(HookEvents.TEAM_UPDATED, teamState);
  emit(HookEvents.TEAM_BUDGET_CHANGED, teamState.budget);

  return { success: true };
}

/**
 * Activate a boost for a race.
 * @param {string} boostType - 'drs', 'mega', 'extra-drs', 'limitless'
 * @param {string} [targetDriverId] - For DRS/Mega/ExtraDRS, which driver to boost
 */
export function activateBoost(boostType, targetDriverId = null) {
  if (!boostState) boostState = loadBoosts();

  const boost = boostState[boostType];
  if (!boost) return { success: false, error: 'Unknown boost type' };

  if (boostType !== 'drs' && boost.used) {
    return { success: false, error: 'Boost already used this season' };
  }

  if (boostType === 'limitless') {
    boost.active = true;
  } else {
    boost.target = targetDriverId;
    boost.active = true;
  }

  saveBoosts(boostState);
  emit(HookEvents.TEAM_BOOST_ACTIVATED, { boostType, targetDriverId });

  return { success: true };
}

/**
 * Deactivate a boost.
 */
export function deactivateBoost(boostType) {
  if (!boostState) boostState = loadBoosts();
  const boost = boostState[boostType];
  if (!boost) return;

  boost.active = false;
  boost.target = null;
  saveBoosts(boostState);
}

/**
 * Mark boosts as consumed after a race.
 */
export function consumeBoosts() {
  if (!boostState) boostState = loadBoosts();

  for (const [key, boost] of Object.entries(boostState)) {
    if (boost.active && key !== 'drs') {
      boost.used = true;
    }
    boost.active = false;
    boost.target = null;
  }

  saveBoosts(boostState);
}

/**
 * Get remaining budget.
 */
export function getBudget() {
  if (!teamState) initTeam();
  return teamState.budget;
}

/**
 * Check if team is complete (5 drivers + 1 constructor).
 */
export function isTeamComplete() {
  if (!teamState) initTeam();
  return teamState.drivers.every(d => d !== null) && teamState.constructor !== null;
}
