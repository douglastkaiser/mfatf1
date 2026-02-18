// Leaderboard UI
// Shows all league members ranked by fantasy points.

import { getAllUsers, getCurrentUser } from '../services/auth.js';
import { DRIVERS, CONSTRUCTORS, TEAM_COLORS } from '../config.js';

export function initLeaderboard() {
  const refreshBtn = document.getElementById('leaderboard-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => renderLeaderboard());
  }
  renderLeaderboard();
}

export async function renderLeaderboard() {
  const container = document.getElementById('leaderboard-body');
  if (!container) return;

  container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">Loading league standings...</td></tr>';

  try {
    const users = await getAllUsers();
    const currentUid = getCurrentUser()?.uid;

    // Calculate total points for each user
    const ranked = users.map(u => {
      const history = u.scoringHistory || {};
      const totalPoints = Object.values(history).reduce((sum, r) => sum + (r.total || 0), 0);
      const racesScored = Object.keys(history).length;
      const team = u.team || {};
      const driverCount = (team.drivers || []).filter(Boolean).length;
      const constructors = team.constructors || (team.constructor ? [team.constructor] : []);
      const constructorCount = constructors.filter(Boolean).length;

      return {
        ...u,
        totalPoints,
        racesScored,
        driverCount,
        constructorCount,
        teamValue: calculateTeamValue(team),
      };
    });

    // Sort by total points descending
    ranked.sort((a, b) => b.totalPoints - a.totalPoints);

    if (ranked.length === 0) {
      container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">No league members yet.</td></tr>';
      return;
    }

    container.innerHTML = ranked.map((user, i) => {
      const isMe = user.id === currentUid;
      const posClass = i < 3 ? ` pos-badge--${i + 1}` : '';
      const rowClass = isMe ? ' leaderboard-row--me' : '';
      const roleBadge = user.role === 'admin'
        ? '<span class="role-badge role-badge--admin">Commissioner</span>'
        : '';

      // Build mini team display
      const teamDrivers = (user.team?.drivers || []).filter(Boolean).map(id => {
        const d = DRIVERS.find(d => d.id === id);
        return d ? d.code : '?';
      }).join(', ');

      const userConstructors = user.team?.constructors || (user.team?.constructor ? [user.team.constructor] : []);
      const teamConstructors = userConstructors.filter(Boolean).map(id => {
        return CONSTRUCTORS.find(c => c.id === id)?.shortName || '?';
      }).join(', ');

      const teamDisplay = teamDrivers || teamConstructors
        ? `${teamDrivers}${teamConstructors ? ' + ' + teamConstructors : ''}`
        : '<span style="color:var(--text-muted)">No team</span>';

      return `
        <tr class="leaderboard-row${rowClass}">
          <td><span class="pos-badge${posClass}">${i + 1}</span></td>
          <td>
            <div class="leaderboard-player">
              <strong>${user.displayName || 'Unknown'}</strong>
              ${roleBadge}
              ${isMe ? '<span class="you-badge">You</span>' : ''}
            </div>
          </td>
          <td class="leaderboard-team-cell">${teamDisplay}</td>
          <td style="text-align:center">${user.driverCount}/5 + ${user.constructorCount}/2</td>
          <td style="text-align:center">${user.racesScored}</td>
          <td><strong class="points-positive">${user.totalPoints}</strong></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('[Leaderboard] Failed to load:', err);
    container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--accent-red)">Failed to load leaderboard. Please try again.</td></tr>';
  }
}

function calculateTeamValue(team) {
  if (!team) return 0;
  let value = 0;
  for (const id of (team.drivers || [])) {
    if (!id) continue;
    const d = DRIVERS.find(d => d.id === id);
    if (d) value += d.price;
  }
  const constructors = team.constructors || (team.constructor ? [team.constructor] : []);
  for (const cId of constructors) {
    if (!cId) continue;
    const c = CONSTRUCTORS.find(c => c.id === cId);
    if (c) value += c.price;
  }
  return value;
}
