// Event Hook System
// Pub/sub pattern for race data updates, scoring changes, and team mutations.
// All components communicate through this central event bus.

const listeners = new Map();
const hookLog = [];
const MAX_LOG = 100;

export const HookEvents = {
  // Data lifecycle
  DATA_SYNC_START: 'data:sync:start',
  DATA_SYNC_COMPLETE: 'data:sync:complete',
  DATA_SYNC_ERROR: 'data:sync:error',

  // Race events
  RACE_SCHEDULE_UPDATED: 'race:schedule:updated',
  RACE_RESULTS_RECEIVED: 'race:results:received',
  RACE_QUALIFYING_RECEIVED: 'race:qualifying:received',
  SPRINT_RESULTS_RECEIVED: 'race:sprint:received',

  // Standings
  STANDINGS_UPDATED: 'standings:updated',
  DRIVER_STANDINGS_UPDATED: 'standings:driver:updated',
  CONSTRUCTOR_STANDINGS_UPDATED: 'standings:constructor:updated',

  // Fantasy scoring
  FANTASY_SCORES_CALCULATED: 'fantasy:scores:calculated',
  FANTASY_SCORES_UPDATED: 'fantasy:scores:updated',

  // Team management
  TEAM_DRIVER_ADDED: 'team:driver:added',
  TEAM_DRIVER_REMOVED: 'team:driver:removed',
  TEAM_CONSTRUCTOR_CHANGED: 'team:constructor:changed',
  TEAM_UPDATED: 'team:updated',
  TEAM_BUDGET_CHANGED: 'team:budget:changed',
  TEAM_BOOST_ACTIVATED: 'team:boost:activated',
  TEAM_TRANSFER_MADE: 'team:transfer:made',

  // H2H season
  H2H_SCHEDULE_UPDATED: 'h2h:schedule:updated',

  // Price changes
  PRICES_UPDATED: 'prices:updated',

  // Notifications
  NOTIFICATION: 'ui:notification',
};

/**
 * Subscribe to an event.
 * @param {string} event - Event name from HookEvents
 * @param {Function} callback - Handler function receiving (data, event)
 * @returns {Function} Unsubscribe function
 */
export function on(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(callback);

  // Return unsubscribe function
  return () => listeners.get(event)?.delete(callback);
}

/**
 * Subscribe to an event only once.
 */
export function once(event, callback) {
  const unsub = on(event, (data) => {
    unsub();
    callback(data);
  });
  return unsub;
}

/**
 * Emit an event to all subscribers.
 * @param {string} event - Event name
 * @param {*} data - Payload
 */
export function emit(event, data = null) {
  const timestamp = new Date();
  const logEntry = { event, data, timestamp };
  hookLog.unshift(logEntry);
  if (hookLog.length > MAX_LOG) hookLog.length = MAX_LOG;

  const subs = listeners.get(event);
  if (subs) {
    for (const cb of subs) {
      try {
        cb(data, event);
      } catch (err) {
        console.error(`[Hook] Error in listener for ${event}:`, err);
      }
    }
  }
}

/**
 * Get the hook activity log for the dashboard.
 */
export function getLog() {
  return hookLog;
}

/**
 * Clear all listeners (for testing/teardown).
 */
export function clearAll() {
  listeners.clear();
  hookLog.length = 0;
}

/**
 * Get count of listeners for an event.
 */
export function listenerCount(event) {
  return listeners.get(event)?.size || 0;
}
