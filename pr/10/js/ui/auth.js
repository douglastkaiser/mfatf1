// Auth UI
// Login and registration screen logic with email/password and Google Sign-In.

import { register, login, loginWithGoogle } from '../services/auth.js';
import { enterGuestMode } from '../app.js';

let currentTab = 'login';

export function initAuthUI() {
  const loginTab = document.getElementById('auth-tab-login');
  const registerTab = document.getElementById('auth-tab-register');
  const form = document.getElementById('auth-form');
  const submitBtn = document.getElementById('auth-submit');
  const errorEl = document.getElementById('auth-error');
  const googleBtn = document.getElementById('auth-google-btn');
  const guestBtn = document.getElementById('auth-guest-btn');

  if (!form) return;

  // Continue as Guest
  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      enterGuestMode();
    });
  }

  loginTab.addEventListener('click', () => switchTab('login'));
  registerTab.addEventListener('click', () => switchTab('register'));

  // Email/Password form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = currentTab === 'login' ? 'Signing in...' : 'Creating account...';

    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const displayName = document.getElementById('auth-name')?.value.trim();

    try {
      if (currentTab === 'login') {
        await login(email, password);
      } else {
        if (!displayName) {
          throw new Error('Please enter a display name.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        await register(email, password, displayName);
      }
    } catch (err) {
      errorEl.textContent = formatAuthError(err);
      submitBtn.disabled = false;
      submitBtn.textContent = currentTab === 'login' ? 'Sign In' : 'Create Account';
    }
  });

  // Google Sign-In
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      errorEl.textContent = '';
      googleBtn.disabled = true;

      try {
        await loginWithGoogle();
      } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
          errorEl.textContent = formatAuthError(err);
        }
        googleBtn.disabled = false;
      }
    });
  }
}

function switchTab(tab) {
  currentTab = tab;
  const loginTab = document.getElementById('auth-tab-login');
  const registerTab = document.getElementById('auth-tab-register');
  const nameGroup = document.getElementById('auth-name-group');
  const submitBtn = document.getElementById('auth-submit');
  const errorEl = document.getElementById('auth-error');

  loginTab.classList.toggle('active', tab === 'login');
  registerTab.classList.toggle('active', tab === 'register');
  nameGroup.style.display = tab === 'register' ? 'block' : 'none';
  submitBtn.textContent = tab === 'login' ? 'Sign In' : 'Create Account';
  errorEl.textContent = '';
}

function formatAuthError(err) {
  const code = err.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/user-not-found':
      return 'No account found with this email. Try registering.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/popup-blocked':
      return 'Pop-up was blocked. Please allow pop-ups for this site.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for sign-in. The site administrator needs to add this domain in the Firebase Console under Authentication > Settings > Authorized domains.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    default:
      return err.message || 'An error occurred. Please try again.';
  }
}
