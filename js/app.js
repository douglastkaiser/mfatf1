// F1 Fantasy App - Main Entry Point
// Initializes Firebase auth, all modules, sets up navigation,
// starts data polling, and wires up the hook system for live updates.

import { API } from './config.js';
import { emit, on, HookEvents } from './services/hooks.js';
import { fullSync, clearCache } from './services/api.js';
import { saveCachedResults, saveLastSync, loadLastSync, hydrateFromCloud, clearAllData } from './services/storage.js';
import { processRaceWeekend } from './scoring/engine.js';
import { initTeam } from './models/team.js';
import { initDashboard, renderPointsChart } from './ui/dashboard.js';
import { initTeamUI } from './ui/team.js';
import { initViews } from './ui/views.js';
import {
  initFirebase, onAuthChanged, loadCurrentProfile, isAdmin,
  getCachedProfile, loadTeamFromCloud, logout, getAnnouncements,
} from './services/auth.js';
import { initAuthUI } from './ui/auth.js';
import { initLeaderboard, renderLeaderboard } from './ui/leaderboard.js';
import { initAdmin } from './ui/admin.js';

// ===== DOM References =====

const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');

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

      if (btn.dataset.view === 'dashboard') {
        requestAnimationFrame(() => renderPointsChart());
      }
      if (btn.dataset.view === 'leaderboard') {
        renderLeaderboard();
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

let pollTimer = null;

async function runSync() {
  try {
    const data = await fullSync();

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
  runSync();
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

document.addEventListener('visibilitychange', () => {
  if (!appEl.style.display || appEl.style.display === 'none') return;
  if (document.hidden) {
    stopPolling();
  } else {
    const lastSync = loadLastSync();
    if (!lastSync || Date.now() - new Date(lastSync).getTime() > API.CACHE_TTL_MS) {
      clearCache();
    }
    startPolling();
  }
});

// ===== User Menu =====

function initUserMenu() {
  const menuBtn = document.getElementById('user-menu-btn');
  const dropdown = document.getElementById('user-dropdown');
  const logoutBtn = document.getElementById('logout-btn');

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
  });

  document.addEventListener('click', () => {
    dropdown.hidden = true;
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());

  logoutBtn.addEventListener('click', async () => {
    stopPolling();
    clearAllData();
    await logout();
  });
}

function updateUserUI(profile) {
  const nameEl = document.getElementById('user-display-name');
  const avatarEl = document.getElementById('user-avatar');
  const dropdownName = document.getElementById('dropdown-name');
  const dropdownEmail = document.getElementById('dropdown-email');
  const dropdownRole = document.getElementById('dropdown-role');
  const adminNav = document.getElementById('nav-admin');

  const name = profile?.displayName || 'User';
  nameEl.textContent = name;
  avatarEl.textContent = name.charAt(0).toUpperCase();
  dropdownName.textContent = name;
  dropdownEmail.textContent = profile?.email || '';

  if (profile?.role === 'admin') {
    dropdownRole.textContent = 'Commissioner';
    dropdownRole.style.display = 'block';
    adminNav.style.display = '';
  } else {
    dropdownRole.textContent = '';
    dropdownRole.style.display = 'none';
    adminNav.style.display = 'none';
  }
}

// ===== Announcement Banner =====

async function showLatestAnnouncement() {
  try {
    const announcements = await getAnnouncements(1);
    if (announcements.length === 0) return;

    const latest = announcements[0];
    const banner = document.getElementById('announcement-banner');
    const text = document.getElementById('announcement-banner-text');
    const closeBtn = document.getElementById('announcement-banner-close');

    text.textContent = `${latest.author}: ${latest.text}`;
    banner.hidden = false;

    closeBtn.addEventListener('click', () => { banner.hidden = true; });
  } catch {
    // Silently fail
  }
}

// ===== Auth-Aware Boot =====

let appBooted = false;

async function showApp(user) {
  authScreen.style.display = 'none';
  appEl.style.display = '';

  // Load profile from Firestore
  const profile = await loadCurrentProfile();
  updateUserUI(profile);

  // Pull cloud data into localStorage if available
  try {
    const cloudData = await loadTeamFromCloud();
    if (cloudData && cloudData.team) {
      hydrateFromCloud(cloudData);
    }
  } catch (err) {
    console.warn('[App] Could not load cloud data:', err.message);
  }

  if (!appBooted) {
    // First boot: initialize everything
    initTeam();
    initNavigation();
    initNotifications();
    initUserMenu();
    initDashboard();
    initTeamUI();
    initViews();
    initLeaderboard();

    if (isAdmin()) {
      initAdmin();
    }

    startPolling();
    showLatestAnnouncement();
    appBooted = true;

    console.log('[F1 Fantasy] App initialized. Polling every', API.POLL_INTERVAL_MS / 1000, 'seconds.');
  } else {
    // Returning from logout/login cycle: re-init team data
    initTeam();
    startPolling();
  }
}

function showAuth() {
  stopPolling();
  authScreen.style.display = '';
  appEl.style.display = 'none';
}

function boot() {
  // Initialize auth UI (login/register form)
  initAuthUI();

  // Try to initialize Firebase
  const firebaseOk = initFirebase();

  if (!firebaseOk) {
    // Firebase not configured - show app without auth (dev/local mode)
    console.warn('[App] Running without Firebase. Configure firebase-config.js to enable auth.');
    authScreen.style.display = 'none';
    appEl.style.display = '';

    initTeam();
    initNavigation();
    initNotifications();
    initDashboard();
    initTeamUI();
    initViews();
    startPolling();
    appBooted = true;
    return;
  }

  // Listen for auth state changes
  onAuthChanged(async (user) => {
    if (user) {
      await showApp(user);
    } else {
      showAuth();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
