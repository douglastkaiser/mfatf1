// Admin / Commissioner Panel UI
// League management for the commissioner.

import {
  getAllUsers, updateUserRole, removeUser, isAdmin,
  postAnnouncement, getAnnouncements, deleteAnnouncement,
  getCurrentUser, saveH2HSchedule,
} from '../services/auth.js';
import { generateRoundRobinSchedule } from '../services/h2h.js';
import { emit, HookEvents } from '../services/hooks.js';
import { showToast } from './toast.js';

export function initAdmin() {
  if (!isAdmin()) return;
  setupAnnouncementForm();
  initH2HAdminCard();
  renderAdminPanel();
}

async function renderAdminPanel() {
  await renderMembers();
  await renderAnnouncements();
}

// ===== Members =====

async function renderMembers() {
  const container = document.getElementById('admin-members-body');
  if (!container) return;

  container.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--text-muted)">Loading...</td></tr>';

  try {
    const users = await getAllUsers();
    const currentUid = getCurrentUser()?.uid;

    container.innerHTML = users.map(user => {
      const history = user.scoringHistory || {};
      const totalPoints = Object.values(history).reduce((sum, r) => sum + (r.total || 0), 0);
      const isMe = user.id === currentUid;
      const roleBadge = user.role === 'admin'
        ? '<span class="role-badge role-badge--admin">Admin</span>'
        : '<span class="role-badge role-badge--member">Member</span>';

      const lastActive = user.lastActive?.toDate
        ? user.lastActive.toDate().toLocaleDateString()
        : 'Unknown';

      const actions = isMe
        ? '<span style="color:var(--text-muted);font-size:0.75rem">You</span>'
        : `
          <div class="admin-actions">
            <button class="btn btn--sm admin-role-btn" data-uid="${user.id}" data-role="${user.role === 'admin' ? 'member' : 'admin'}">
              ${user.role === 'admin' ? 'Demote' : 'Promote'}
            </button>
            <button class="btn btn--sm admin-remove-btn" data-uid="${user.id}" data-name="${user.displayName || user.email}">
              Remove
            </button>
          </div>
        `;

      return `
        <tr>
          <td><strong>${user.displayName || 'Unknown'}</strong></td>
          <td style="color:var(--text-muted);font-size:0.8rem">${user.email || ''}</td>
          <td>${roleBadge}</td>
          <td style="text-align:center"><strong>${totalPoints}</strong></td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');

    // Attach event handlers
    container.querySelectorAll('.admin-role-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        const newRole = btn.dataset.role;
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
          await updateUserRole(uid, newRole);
          await renderMembers();
        } catch (err) {
          showToast('Failed to update role: ' + err.message, 'error');
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll('.admin-remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        const name = btn.dataset.name;
        if (!confirm(`Remove ${name} from the league? This cannot be undone.`)) return;
        btn.disabled = true;
        try {
          await removeUser(uid);
          await renderMembers();
        } catch (err) {
          showToast('Failed to remove user: ' + err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    console.error('[Admin] Failed to load members:', err);
    container.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--accent-red)">Failed to load members.</td></tr>';
  }
}

// ===== Announcements =====

function setupAnnouncementForm() {
  const form = document.getElementById('announcement-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('announcement-input');
    const text = input.value.trim();
    if (!text) return;

    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Posting...';

    try {
      await postAnnouncement(text);
      input.value = '';
      await renderAnnouncements();
    } catch (err) {
      showToast('Failed to post announcement: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Post';
    }
  });
}

async function renderAnnouncements() {
  const container = document.getElementById('admin-announcements-list');
  if (!container) return;

  try {
    const announcements = await getAnnouncements();

    if (announcements.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0">No announcements yet.</p>';
      return;
    }

    container.innerHTML = announcements.map(a => {
      const date = a.createdAt?.toDate
        ? a.createdAt.toDate().toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })
        : '';

      return `
        <div class="announcement">
          <div class="announcement__header">
            <span class="announcement__author">${a.author}</span>
            <span class="announcement__date">${date}</span>
            <button class="announcement__delete" data-id="${a.id}" title="Delete">&times;</button>
          </div>
          <div class="announcement__text">${escapeHtml(a.text)}</div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.announcement__delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this announcement?')) return;
        try {
          await deleteAnnouncement(btn.dataset.id);
          await renderAnnouncements();
        } catch (err) {
          showToast('Failed to delete: ' + err.message, 'error');
        }
      });
    });
  } catch (err) {
    console.error('[Admin] Failed to load announcements:', err);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== H2H Schedule Generation =====

function initH2HAdminCard() {
  const btn = document.getElementById('admin-h2h-generate-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!confirm('Generate a new H2H schedule? This will overwrite any existing schedule.')) return;

    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      const users = await getAllUsers();
      const playerUids = users.map(u => u.id);

      if (playerUids.length < 2) {
        showToast('Need at least 2 league members to generate a schedule.', 'error');
        return;
      }

      const schedule = generateRoundRobinSchedule(playerUids);
      await saveH2HSchedule(schedule);

      const matchupsPerRound = Math.floor(playerUids.length / 2);
      showToast(
        `H2H schedule generated! ${playerUids.length} players, ${matchupsPerRound} matchup${matchupsPerRound !== 1 ? 's' : ''} per round across 24 rounds.`,
        'success'
      );
      emit(HookEvents.H2H_SCHEDULE_UPDATED, { playerCount: playerUids.length });
    } catch (err) {
      console.error('[Admin] H2H generation failed:', err);
      showToast('Failed to generate H2H schedule: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate H2H Schedule';
    }
  });
}
