// F1 Fantasy App - Main Entry Point
// Initializes Firebase auth, all modules, sets up navigation,
// starts data polling, and wires up the hook system for live updates.

import { API } from './config.js';
import { emit, on, HookEvents } from './services/hooks.js';
import { fullSync, clearCache } from './services/api.js';
import { saveCachedResults, saveLastSync, loadLastSync, hydrateFromCloud, clearAllData, loadGuestProfile, saveGuestProfile } from './services/storage.js';
import { processRaceWeekend } from './scoring/engine.js';
import { initTeam } from './models/team.js';
import { initDashboard, renderPointsChart } from './ui/dashboard.js';
import { initTeamUI } from './ui/team.js';
import { initViews } from './ui/views.js';
import {
  initFirebase, onAuthChanged, loadCurrentProfile, isAdmin,
  getCachedProfile, loadTeamFromCloud, logout, getAnnouncements,
  updateDisplayName, changeUserPassword,
} from './services/auth.js';
import { initAuthUI } from './ui/auth.js';
import { initLeaderboard, renderLeaderboard } from './ui/leaderboard.js';
import { initH2H, renderH2H } from './ui/h2h.js';
import { initAdmin } from './ui/admin.js';
import { initNews, renderNews } from './ui/news.js';
import { initChat, destroyChat } from './ui/chat.js';

// ===== DOM References =====

const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');

// ===== Navigation =====

function switchView(viewName) {
  const navBtns = document.querySelectorAll('.nav-btn[data-view]');
  const bottomBtns = document.querySelectorAll('.bottom-nav-btn[data-view]');
  const drawerBtns = document.querySelectorAll('.bottom-nav-drawer-item[data-view]');
  const views = document.querySelectorAll('.view');

  const viewId = `view-${viewName}`;

  navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
  bottomBtns.forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
  drawerBtns.forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
  views.forEach(v => v.classList.toggle('active', v.id === viewId));

  if (viewName === 'dashboard') requestAnimationFrame(() => renderPointsChart());
  if (viewName === 'leaderboard') renderLeaderboard();
  if (viewName === 'h2h') renderH2H();
  if (viewName === 'news') renderNews();
  if (viewName === 'chat') initChat();
}

function initNavigation() {
  // Top nav buttons
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Bottom nav primary buttons
  document.querySelectorAll('.bottom-nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // "More" button opens the drawer
  const moreBtn = document.getElementById('bottom-nav-more');
  const drawer = document.getElementById('bottom-nav-drawer');
  const backdrop = document.getElementById('bottom-nav-backdrop');

  if (moreBtn && drawer && backdrop) {
    function openDrawer() {
      drawer.classList.add('open');
      backdrop.classList.add('open');
      moreBtn.setAttribute('aria-expanded', 'true');
    }
    function closeDrawer() {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      moreBtn.setAttribute('aria-expanded', 'false');
    }

    moreBtn.addEventListener('click', () => {
      drawer.classList.contains('open') ? closeDrawer() : openDrawer();
    });
    backdrop.addEventListener('click', closeDrawer);

    // Drawer items navigate and close the drawer
    document.querySelectorAll('.bottom-nav-drawer-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
        closeDrawer();
      });
    });
  }
}

// ===== Escape Key Handler (A11y) =====

function initEscapeHandler() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    // Close modals in reverse priority order
    const picker = document.getElementById('picker');
    if (picker && !picker.hasAttribute('hidden')) {
      import('./ui/team.js').then(m => m.closePicker?.());
      return;
    }
    const boostModal = document.getElementById('boost-target-modal');
    if (boostModal && !boostModal.hasAttribute('hidden')) {
      import('./ui/team.js').then(m => m.closeBoostTargetModal?.());
      return;
    }
    const accountModal = document.getElementById('account-modal');
    if (accountModal && !accountModal.hasAttribute('hidden')) {
      hideModal(accountModal);
      return;
    }
    const guestModal = document.getElementById('guest-profile-modal');
    if (guestModal && !guestModal.hasAttribute('hidden')) {
      hideModal(guestModal);
      return;
    }
    const chatNewModal = document.getElementById('chat-new-modal');
    if (chatNewModal && !chatNewModal.hasAttribute('hidden')) {
      hideModal(chatNewModal);
    }
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
    destroyChat();
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

  // Show chat nav for authenticated users
  const chatNav = document.getElementById('nav-chat');
  const bottomChatNav = document.getElementById('bottom-nav-chat');
  if (chatNav) chatNav.style.display = '';
  if (bottomChatNav) bottomChatNav.style.display = '';

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

// ===== Modal Helpers =====

function showModal(el) {
  el.removeAttribute('hidden');
  el.style.display = 'flex';
}

function hideModal(el) {
  el.setAttribute('hidden', '');
  el.style.display = 'none';
}

// ===== Account Settings Modal =====

function initAccountSettings() {
  const settingsBtn = document.getElementById('account-settings-btn');
  const modal = document.getElementById('account-modal');
  const backdrop = modal.querySelector('.account-modal__backdrop');
  const closeBtn = document.getElementById('account-modal-close');
  const form = document.getElementById('account-form');
  const passwordForm = document.getElementById('password-form');

  settingsBtn.addEventListener('click', () => {
    document.getElementById('user-dropdown').hidden = true;
    const profile = getCachedProfile();
    document.getElementById('account-name').value = profile?.displayName || '';
    document.getElementById('account-email-display').value = profile?.email || '';
    document.getElementById('account-error').textContent = '';
    document.getElementById('account-success').textContent = '';
    document.getElementById('password-error').textContent = '';
    document.getElementById('password-success').textContent = '';
    showModal(modal);
  });

  backdrop.addEventListener('click', () => hideModal(modal));
  closeBtn.addEventListener('click', () => hideModal(modal));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('account-error');
    const successEl = document.getElementById('account-success');
    errorEl.textContent = '';
    successEl.textContent = '';

    const newName = document.getElementById('account-name').value.trim();
    if (!newName) {
      errorEl.textContent = 'Display name cannot be empty.';
      return;
    }

    try {
      await updateDisplayName(newName);
      updateUserUI(getCachedProfile());
      successEl.textContent = 'Display name updated.';
      setTimeout(() => hideModal(modal), 800);
    } catch (err) {
      errorEl.textContent = err.message || 'Failed to update name.';
    }
  });

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('password-error');
    const successEl = document.getElementById('password-success');
    errorEl.textContent = '';
    successEl.textContent = '';

    const newPass = document.getElementById('account-new-password').value;
    const confirmPass = document.getElementById('account-confirm-password').value;

    if (newPass.length < 6) {
      errorEl.textContent = 'Password must be at least 6 characters.';
      return;
    }
    if (newPass !== confirmPass) {
      errorEl.textContent = 'Passwords do not match.';
      return;
    }

    try {
      await changeUserPassword(newPass);
      successEl.textContent = 'Password updated.';
      document.getElementById('account-new-password').value = '';
      document.getElementById('account-confirm-password').value = '';
      setTimeout(() => hideModal(modal), 800);
    } catch (err) {
      const msg = err.code === 'auth/requires-recent-login'
        ? 'Please sign out and sign back in before changing your password.'
        : (err.message || 'Failed to update password.');
      errorEl.textContent = msg;
    }
  });
}

// ===== Guest Profile Modal =====

function initGuestProfile() {
  const profileBtn = document.getElementById('guest-profile-btn');
  const modal = document.getElementById('guest-profile-modal');
  const backdrop = modal.querySelector('.account-modal__backdrop');
  const closeBtn = document.getElementById('guest-profile-close');
  const form = document.getElementById('guest-profile-form');

  profileBtn.addEventListener('click', () => {
    const profile = loadGuestProfile();
    document.getElementById('guest-name').value = profile.displayName || '';
    document.getElementById('guest-team-name').value = profile.teamName || '';
    document.getElementById('guest-profile-success').textContent = '';
    showModal(modal);
  });

  backdrop.addEventListener('click', () => hideModal(modal));
  closeBtn.addEventListener('click', () => hideModal(modal));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('guest-name').value.trim() || 'Guest';
    const teamName = document.getElementById('guest-team-name').value.trim();

    saveGuestProfile({ displayName: name, teamName, createdAt: loadGuestProfile().createdAt });

    document.getElementById('guest-profile-success').textContent = 'Profile saved.';
    setTimeout(() => hideModal(modal), 600);
  });
}

// ===== Auth-Aware Boot =====

let appBooted = false;
let guestMode = false;

export function isGuestMode() {
  return guestMode;
}

const guestSigninBtn = document.getElementById('guest-signin-btn');
const userMenuEl = document.getElementById('user-menu');

async function showApp(user) {
  guestMode = false;
  authScreen.style.display = 'none';
  appEl.style.display = '';

  // Show user menu, hide guest buttons
  userMenuEl.style.display = '';
  guestSigninBtn.style.display = 'none';
  document.getElementById('guest-profile-btn').style.display = 'none';

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
    initEscapeHandler();
    initNotifications();
    initUserMenu();
    initAccountSettings();
    initDashboard();
    initTeamUI();
    initViews();
    initLeaderboard();
    initH2H();
    initNews();

    if (isAdmin()) {
      initAdmin();
      // Show admin in bottom nav drawer
      const bottomAdmin = document.getElementById('bottom-nav-admin');
      if (bottomAdmin) bottomAdmin.style.display = '';
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

export function enterGuestMode() {
  guestMode = true;
  authScreen.style.display = 'none';
  appEl.style.display = '';

  // Hide user menu, show sign-in button and guest profile button
  userMenuEl.style.display = 'none';
  guestSigninBtn.style.display = '';
  document.getElementById('guest-profile-btn').style.display = '';

  if (!appBooted) {
    initTeam();
    initNavigation();
    initEscapeHandler();
    initNotifications();
    initDashboard();
    initTeamUI();
    initViews();
    initNews();
    initGuestProfile();
    startPolling();
    appBooted = true;

    console.log('[F1 Fantasy] App initialized in guest mode.');
  } else {
    startPolling();
  }
}

function showAuth() {
  guestMode = false;
  stopPolling();
  authScreen.style.display = '';
  appEl.style.display = 'none';

  // Reset visibility for next login
  userMenuEl.style.display = '';
  guestSigninBtn.style.display = 'none';
  document.getElementById('guest-profile-btn').style.display = 'none';
}

function boot() {
  // Initialize auth UI (login/register form)
  initAuthUI();

  // Guest sign-in button in the header returns to auth screen
  guestSigninBtn.addEventListener('click', () => {
    showAuth();
  });

  // Try to initialize Firebase
  const firebaseOk = initFirebase();

  if (!firebaseOk) {
    // Firebase not configured - show app without auth (dev/local mode)
    console.warn('[App] Running without Firebase. Configure firebase-config.js to enable auth.');
    authScreen.style.display = 'none';
    appEl.style.display = '';

    initTeam();
    initNavigation();
    initEscapeHandler();
    initNotifications();
    initDashboard();
    initTeamUI();
    initViews();
    initNews();
    startPolling();
    appBooted = true;
    return;
  }

  // Listen for auth state changes
  onAuthChanged(async (user) => {
    if (user) {
      await showApp(user);
    } else {
      // Only show auth screen if not in guest mode
      if (!guestMode) {
        showAuth();
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
