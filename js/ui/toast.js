// Toast Notification System
// Provides non-blocking, stackable toast messages to replace native alert() calls.

const ICONS = {
  error: '✕',
  success: '✓',
  info: 'ℹ',
  warning: '⚠',
};

/**
 * Show a toast notification.
 * @param {string} message - The message to display
 * @param {'info'|'success'|'error'|'warning'} type - Toast type
 * @param {number} duration - Auto-dismiss delay in ms (0 = no auto-dismiss)
 * @param {{ label: string, fn: Function }|null} action - Optional action button (e.g. Undo)
 * @returns {HTMLElement|null} The toast element
 */
export function showToast(message, type = 'info', duration = 3500, action = null) {
  const container = document.getElementById('toast-container');
  if (!container) return null;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');

  const actionHtml = action
    ? `<button class="toast__action">${action.label}</button>`
    : '';

  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${ICONS[type] || ICONS.info}</span>
    <span class="toast__msg">${message}</span>
    ${actionHtml}
    <button class="toast__close" aria-label="Dismiss notification">&times;</button>
  `;

  if (action) {
    toast.querySelector('.toast__action').addEventListener('click', () => {
      action.fn();
      removeToast(toast);
    });
  }
  toast.querySelector('.toast__close').addEventListener('click', () => removeToast(toast));

  container.appendChild(toast);

  if (duration > 0) setTimeout(() => removeToast(toast), duration);
  return toast;
}

function removeToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.add('toast--removing');
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 300);
}
