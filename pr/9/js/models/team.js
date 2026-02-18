// Fantasy Team Model
// Manages the user's team: driver/constructor selection, budget, transfers, boosts.
// Official F1 Fantasy format: 5 drivers + 2 constructors, $100M budget.

import { DRIVERS, CONSTRUCTORS, BUDGET, SCORING } from '../config.js';
import { emit, HookEvents } from '../services/hooks.js';
import { loadTeam, saveTeam, loadBoosts, saveBoosts, loadTransferLog, saveTransferLog } from '../services/storage.js';

let teamState = null;
let boostState = null;
let transferLog = null;

export function initTeam() {
  teamState = loadTeam();
  // Migrate old single-constructor format to new 2-constructor format
  if (teamState && !Array.isArray(teamState.constructors)) {
    teamState.constructors = teamState.constructor
      ? [teamState.constructor, null]
      : [null, null];
    delete teamState.constructor;
    saveTeam(teamState);
  }
  boostState = loadBoosts();
  transferLog = loadTransferLog();
  return teamState;
}

export function getTeam() {
  if (!teamState) initTeam();
  return { ...teamState, constructors: [...teamState.constructors] };
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
    const isWildcard = boostState?.wildcard?.active;
    if (!isWildcard) {
      const freeLeft = teamState.freeTransfers - teamState.transfersMade;
      if (freeLeft <= 0) {
        // Extra transfer penalty will be applied
      }
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
 * Set a constructor in a slot (0 or 1).
 * @param {string} constructorId
 * @param {number} slot - 0 or 1
 */
export function setConstructor(constructorId, slot = 0) {
  if (!teamState) initTeam();

  const constructor = CONSTRUCTORS.find(c => c.id === constructorId);
  if (!constructor) return { success: false, error: 'Constructor not found' };

  if (slot < 0 || slot > 1) return { success: false, error: 'Invalid constructor slot' };

  // Check if constructor already on team (in either slot)
  if (teamState.constructors.includes(constructorId)) {
    return { success: false, error: 'Constructor already on team' };
  }

  // Budget adjustment
  let budgetChange = -constructor.price;
  const currentId = teamState.constructors[slot];
  if (currentId) {
    const current = CONSTRUCTORS.find(c => c.id === currentId);
    budgetChange += current ? current.price : 0;
  }

  const isLimitless = boostState?.limitless?.active;
  if (!isLimitless && teamState.budget + budgetChange < 0) {
    return { success: false, error: 'Insufficient budget' };
  }

  // Track transfer if replacing after lockdown
  if (currentId && teamState.locked) {
    const isWildcard = boostState?.wildcard?.active;
    if (!isWildcard) {
      const freeLeft = teamState.freeTransfers - teamState.transfersMade;
      if (freeLeft <= 0) {
        // Extra transfer penalty will be applied
      }
    }
    transferLog.push({
      type: 'constructor',
      out: currentId,
      in: constructorId,
      timestamp: new Date().toISOString(),
    });
    saveTransferLog(transferLog);
    emit(HookEvents.TEAM_TRANSFER_MADE, { out: currentId, in: constructorId });
  }

  teamState.constructors[slot] = constructorId;
  if (!isLimitless) {
    teamState.budget = Math.round((teamState.budget + budgetChange) * 10) / 10;
  }

  saveTeam(teamState);
  emit(HookEvents.TEAM_CONSTRUCTOR_CHANGED, { constructorId, slot });
  emit(HookEvents.TEAM_UPDATED, teamState);
  emit(HookEvents.TEAM_BUDGET_CHANGED, teamState.budget);

  return { success: true };
}

/**
 * Remove a constructor from a slot.
 * @param {number} slot - 0 or 1
 */
export function removeConstructor(slot = 0) {
  if (!teamState) initTeam();
  if (slot < 0 || slot > 1) return { success: false, error: 'Invalid constructor slot' };

  const constructorId = teamState.constructors[slot];
  if (!constructorId) return { success: false, error: 'Slot is empty' };

  const current = CONSTRUCTORS.find(c => c.id === constructorId);
  if (current) {
    teamState.budget = Math.round((teamState.budget + current.price) * 10) / 10;
  }
  teamState.constructors[slot] = null;
  saveTeam(teamState);

  emit(HookEvents.TEAM_CONSTRUCTOR_CHANGED, { constructorId: null, slot });
  emit(HookEvents.TEAM_UPDATED, teamState);
  emit(HookEvents.TEAM_BUDGET_CHANGED, teamState.budget);

  return { success: true };
}

/**
 * Activate a boost for a race.
 * @param {string} boostType - 'drs', 'mega', 'extra-drs', 'limitless', 'wildcard', 'no-negative'
 * @param {string} [targetDriverId] - For DRS/Mega/ExtraDRS, which driver to boost
 */
export function activateBoost(boostType, targetDriverId = null) {
  if (!boostState) boostState = loadBoosts();

  const boost = boostState[boostType];
  if (!boost) return { success: false, error: 'Unknown boost type' };

  if (boostType !== 'drs' && boost.used) {
    return { success: false, error: 'Boost already used this season' };
  }

  // Boosts that require a driver target
  const needsTarget = ['drs', 'mega', 'extra-drs'];
  if (needsTarget.includes(boostType)) {
    if (!targetDriverId) {
      return { success: false, error: 'Select a driver for this boost' };
    }
    // Validate driver is on the team
    if (!teamState) initTeam();
    if (!teamState.drivers.includes(targetDriverId)) {
      return { success: false, error: 'Driver is not on your team' };
    }
    boost.target = targetDriverId;
  }

  boost.active = true;
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
 * Check if team is complete (5 drivers + 2 constructors).
 */
export function isTeamComplete() {
  if (!teamState) initTeam();
  return teamState.drivers.every(d => d !== null) &&
    teamState.constructors.every(c => c !== null);
}
