// Test Mode UI
// Renders the test mode card inside the admin panel.
// Supports three states: setup, active (mid-season), and complete.

import {
  createTestUsers, simulateRace, getTestModeState, cleanupTestMode,
} from '../services/test-mode.js';
import { getAllUsers, saveH2HSchedule } from '../services/auth.js';
import { generateRoundRobinSchedule } from '../services/h2h.js';
import { RACE_CALENDAR } from '../config.js';
import { showToast } from './toast.js';

let container = null;

export async function initTestMode() {
  container = document.getElementById('test-mode-card-body');
  if (!container) return;
  await renderTestModeUI();
}

async function renderTestModeUI() {
  if (!container) return;
  container.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Loading test mode...</p>';

  try {
    const state = await getTestModeState();

    if (!state.active) {
      renderSetupUI(state);
    } else if (state.nextRound) {
      renderActiveUI(state);
    } else {
      renderCompleteUI(state);
    }
  } catch (err) {
    console.error('[TestMode] Failed to render:', err);
    container.innerHTML = `<p style="color:var(--accent-red)">Error loading test mode: ${err.message}</p>`;
  }
}

// ===== Setup State =====

function renderSetupUI() {
  container.innerHTML = `
    <p class="text-muted" style="margin-bottom:1rem;font-size:0.85rem">
      Create test users with random teams and simulate races to verify
      scoring, leaderboards, and H2H matchups with a full league.
      Test users are marked and can be cleaned up at any time.
    </p>
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
      <label for="test-user-count" style="font-size:0.85rem;color:var(--text-secondary)">Test Users:</label>
      <input type="number" id="test-user-count" min="2" max="8" value="8"
        style="width:60px;background:var(--bg-card);border:1px solid var(--border-color);
        border-radius:var(--radius-sm);padding:0.4rem 0.6rem;color:var(--text-primary);
        font-size:0.85rem;text-align:center">
    </div>
    <button class="btn btn--primary" id="test-mode-init-btn">Initialize Test Mode</button>
  `;

  document.getElementById('test-mode-init-btn').addEventListener('click', handleInit);
}

async function handleInit(e) {
  const btn = e.target;
  const count = parseInt(document.getElementById('test-user-count').value, 10) || 8;
  btn.disabled = true;
  btn.textContent = 'Creating test users...';

  try {
    await createTestUsers(count);

    // Auto-regenerate H2H schedule to include test users
    btn.textContent = 'Generating H2H schedule...';
    const allUsers = await getAllUsers();
    const uids = allUsers.map(u => u.id);
    if (uids.length >= 2) {
      const schedule = generateRoundRobinSchedule(uids);
      await saveH2HSchedule(schedule);
    }

    showToast(`Test mode initialized with ${count} users. H2H schedule regenerated.`, 'success');
    await renderTestModeUI();
  } catch (err) {
    showToast('Failed to initialize: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Initialize Test Mode';
  }
}

// ===== Active State (mid-season) =====

function renderActiveUI(state) {
  const nextRace = RACE_CALENDAR.find(r => r.round === state.nextRound);
  const sprintBadge = nextRace?.sprint
    ? '<span class="card__badge" style="background:rgba(0,161,232,0.15);color:var(--accent-blue);margin-left:0.5rem">Sprint</span>'
    : '';

  const progressPct = Math.round((state.currentRound / 24) * 100);

  // Mini leaderboard of test users
  const leaderboard = state.testUsers
    .map(u => {
      const history = u.scoringHistory || {};
      const total = Object.values(history).reduce((s, r) => s + (r.total || 0), 0);
      return { name: u.displayName, total };
    })
    .sort((a, b) => b.total - a.total);

  const leaderboardHtml = state.currentRound > 0
    ? `<div style="margin-bottom:1rem">
        <div style="font-weight:600;font-size:0.82rem;margin-bottom:0.4rem;color:var(--text-muted)">Test Standings</div>
        ${leaderboard.map((u, i) => `
          <div style="display:flex;justify-content:space-between;padding:0.2rem 0;
            font-size:0.82rem;${i === 0 ? 'font-weight:700;color:var(--accent-yellow)' : 'color:var(--text-secondary)'}">
            <span>${i + 1}. ${u.name}</span>
            <span>${u.total} pts</span>
          </div>
        `).join('')}
      </div>`
    : '';

  container.innerHTML = `
    <div style="background:rgba(245,197,24,0.1);border:1px solid rgba(245,197,24,0.3);
      border-radius:var(--radius-sm);padding:0.6rem 1rem;margin-bottom:1rem;
      font-size:0.82rem;color:var(--accent-yellow);font-weight:600;display:flex;
      align-items:center;gap:0.5rem">
      &#9888; TEST MODE ACTIVE &mdash; ${state.testUserCount} test users
    </div>

    <div style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.35rem">
        <span>Season Progress</span>
        <span>${state.currentRound} / 24 rounds</span>
      </div>
      <div style="height:6px;background:var(--border-color);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${progressPct}%;background:var(--accent-red);border-radius:3px;transition:width 0.3s"></div>
      </div>
    </div>

    <div style="margin-bottom:1rem;padding:0.75rem;background:var(--bg-card);border-radius:var(--radius-sm);border:1px solid var(--border-color)">
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem">Next Race</div>
      <div style="font-weight:700;font-size:1rem">
        Round ${state.nextRound} &mdash; ${nextRace?.name || 'Unknown'}
        ${sprintBadge}
      </div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem">
        ${nextRace?.circuit || ''} &middot; ${nextRace?.location || ''}
      </div>
    </div>

    <button class="btn btn--primary" id="test-simulate-btn" style="width:100%;margin-bottom:1rem">
      Simulate Round ${state.nextRound}
    </button>

    ${leaderboardHtml}

    <div style="border-top:1px solid var(--border-color);padding-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap">
      <button class="btn btn--sm" id="test-regen-h2h-btn">Regen H2H Schedule</button>
      <button class="btn btn--sm" id="test-reset-btn" style="color:var(--accent-red)">Reset Test Mode</button>
    </div>
  `;

  // Wire up Simulate button
  document.getElementById('test-simulate-btn').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = `Simulating Round ${state.nextRound}...`;

    try {
      const result = await simulateRace(state.nextRound);
      showToast(
        `Round ${result.round} (${result.raceName}) simulated. ${result.testUsersScored} users scored.`,
        'success',
      );
      await renderTestModeUI();
    } catch (err) {
      showToast('Simulation failed: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = `Simulate Round ${state.nextRound}`;
    }
  });

  // Wire up H2H regen
  document.getElementById('test-regen-h2h-btn').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Regenerating...';
    try {
      const allUsers = await getAllUsers();
      const uids = allUsers.map(u => u.id);
      const schedule = generateRoundRobinSchedule(uids);
      await saveH2HSchedule(schedule);
      showToast('H2H schedule regenerated with all users.', 'success');
    } catch (err) {
      showToast('Failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Regen H2H Schedule';
    }
  });

  // Wire up Reset
  document.getElementById('test-reset-btn').addEventListener('click', handleReset);
}

// ===== Complete State (24/24 rounds) =====

function renderCompleteUI(state) {
  const leaderboard = state.testUsers
    .map(u => {
      const history = u.scoringHistory || {};
      const total = Object.values(history).reduce((s, r) => s + (r.total || 0), 0);
      return { name: u.displayName, total };
    })
    .sort((a, b) => b.total - a.total);

  const leaderboardHtml = leaderboard.map((u, i) => `
    <div style="display:flex;justify-content:space-between;padding:0.3rem 0;
      font-size:0.85rem;${i === 0 ? 'font-weight:700;color:var(--accent-yellow)' : ''}">
      <span>${i + 1}. ${u.name}</span>
      <span>${u.total} pts</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div style="background:rgba(39,244,210,0.1);border:1px solid rgba(39,244,210,0.3);
      border-radius:var(--radius-sm);padding:0.6rem 1rem;margin-bottom:1rem;
      font-size:0.82rem;color:var(--accent-green);font-weight:600;text-align:center">
      TEST SEASON COMPLETE &mdash; 24 of 24 Rounds
    </div>
    <div style="margin-bottom:1rem">
      <div style="font-weight:600;font-size:0.85rem;margin-bottom:0.5rem">Final Test Standings</div>
      ${leaderboardHtml}
    </div>
    <button class="btn btn--sm" id="test-reset-btn" style="width:100%;color:var(--accent-red)">Reset Test Mode</button>
  `;

  document.getElementById('test-reset-btn').addEventListener('click', handleReset);
}

// ===== Shared Handlers =====

async function handleReset(e) {
  if (!confirm('Delete all test users and their scoring data? This cannot be undone.')) return;
  const btn = e.target;
  btn.disabled = true;
  btn.textContent = 'Cleaning up...';

  try {
    const result = await cleanupTestMode();
    showToast(`Test mode reset. ${result.deletedCount} test users removed.`, 'success');
    await renderTestModeUI();
  } catch (err) {
    showToast('Cleanup failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Reset Test Mode';
  }
}
