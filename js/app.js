// F1 Fantasy App - Main Entry Point
// Initializes all modules, sets up navigation, starts data polling,
// and wires up the hook system for live updates.

import { API } from './config.js';
import { emit, on, HookEvents } from './services/hooks.js';
import { fullSync, clearCache } from './services/api.js';
import { saveCachedResults, saveLastSync, loadLastSync } from './services/storage.js';
import { processRaceWeekend } from './scoring/engine.js';
import { initTeam } from './models/team.js';
import { initDashboard, renderPointsChart } from './ui/dashboard.js';
import { initTeamUI } from './ui/team.js';
import { initViews } from './ui/views.js';

// ===== Navigation =====

function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn[data-view]');
  const views = document.querySelectorAll('.view');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = `view-${btn.dataset.view}`;

      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      views.forEach(v => v.classList.toggle('active', v.id === viewId));

      // Re-render chart when dashboard is shown (canvas sizing)
      if (btn.dataset.view === 'dashboard') {
        requestAnimationFrame(() => renderPointsChart());
      }
    });
  });
}

// ===== Notifications =====

function initNotifications() {
  const bar = document.getElementById('notification-bar');
  const message = document.getElementById('notification-message');
  const closeBtn = document.getElementById('notification-close');

  on(HookEvents.NOTIFICATION, ({ text, type }) => {
    message.textContent = text;
    bar.hidden = false;
    bar.style.background = type === 'error' ? 'var(--accent-red)'
      : type === 'success' ? 'var(--accent-green)'
      : 'var(--accent-blue)';
  });

  closeBtn.addEventListener('click', () => {
    bar.hidden = true;
  });
}

// ===== Data Sync Pipeline =====
// The core update hook: poll for new data, cache it, score it.

let pollTimer = null;

async function runSync() {
  try {
    const data = await fullSync();

    // Cache successful results for offline/fast reload
    const cachePayload = {
      schedule: data.schedule || [],
      raceResults: data.raceResults || [],
      qualifying: data.qualifying || [],
      sprintResults: data.sprintResults || [],
      driverStandings: data.driverStandings || [],
      constructorStandings: data.constructorStandings || [],
    };
    saveCachedResults(cachePayload);
    saveLastSync();

    // Process scoring for each race that has results
    if (data.raceResults && data.raceResults.length > 0) {
      for (const race of data.raceResults) {
        const round = race.round;
        const qualifying = (data.qualifying || []).find(q => q.round === round);
        const sprint = (data.sprintResults || []).find(s => s.round === round);

        processRaceWeekend({
          round,
          raceName: race.raceName,
          results: race.Results || [],
          qualifying: qualifying?.QualifyingResults || [],
          sprint: sprint?.SprintResults || [],
        });
      }
    }

    if (data.errors.length > 0) {
      emit(HookEvents.NOTIFICATION, {
        text: `Sync completed with ${data.errors.length} error(s). Some data may be stale.`,
        type: 'error',
      });
    }
  } catch (err) {
    console.error('[App] Sync failed:', err);
    emit(HookEvents.NOTIFICATION, {
      text: 'Failed to sync data. Will retry shortly.',
      type: 'error',
    });
  }
}

function startPolling() {
  // Initial sync
  runSync();

  // Periodic polling
  pollTimer = setInterval(runSync, API.POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ===== Force Sync Handler =====

window.addEventListener('f1fantasy:forcesync', () => {
  clearCache();
  runSync();
  emit(HookEvents.NOTIFICATION, { text: 'Force sync initiated...', type: 'info' });
});

// ===== Visibility-Based Polling =====
// Pause polling when tab is hidden, resume when visible.

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else {
    // Check if we need a fresh sync
    const lastSync = loadLastSync();
    if (!lastSync || Date.now() - new Date(lastSync).getTime() > API.CACHE_TTL_MS) {
      clearCache();
    }
    startPolling();
  }
});

// ===== Boot =====

function boot() {
  initTeam();
  initNavigation();
  initNotifications();
  initDashboard();
  initTeamUI();
  initViews();
  startPolling();

  console.log('[F1 Fantasy] App initialized. Polling every', API.POLL_INTERVAL_MS / 1000, 'seconds.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
