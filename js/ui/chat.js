// Chat UI Module
// Renders the encrypted group-chat interface.
// Only available to authenticated (non-guest) users.

import { getCurrentUser } from '../services/auth.js';
import {
  initUserChatKeys, createChat, sendMessage,
  subscribeToMessages, subscribeToUserChats,
  getChatEligibleUsers, clearChatKeyCache,
} from '../services/chat.js';

// ===== State =====

let _unsubMessages = null;
let _unsubChats = null;
let _activeChatId = null;
let _chatList = [];
let _initialized = false;

// ===== Lifecycle =====

export function initChat() {
  if (_initialized) return;
  _initialized = true;

  const user = getCurrentUser();
  if (!user) return;

  // Generate key pair in background and publish public key to Firestore
  initUserChatKeys(user.uid).catch(err =>
    console.warn('[Chat] Key init warning:', err),
  );

  _bindNewChatBtn();
  _bindSendForm();
  _bindBackBtn();

  // Live chat list
  _unsubChats = subscribeToUserChats((chats) => {
    _chatList = chats;
    _renderChatList(chats);
  });
}

export function destroyChat() {
  if (_unsubChats) { _unsubChats(); _unsubChats = null; }
  if (_unsubMessages) { _unsubMessages(); _unsubMessages = null; }
  clearChatKeyCache();
  _activeChatId = null;
  _initialized = false;
}

// ===== Chat List =====

function _renderChatList(chats) {
  const listEl = document.getElementById('chat-list');
  if (!listEl) return;

  if (chats.length === 0) {
    listEl.innerHTML = `
      <div class="chat-empty">
        <div class="chat-empty__icon">&#128172;</div>
        <p class="chat-empty__text">No conversations yet.<br>Tap <strong>+ New Chat</strong> to start one.</p>
      </div>`;
    return;
  }

  const user = getCurrentUser();
  listEl.innerHTML = chats.map(chat => {
    const isGroup = chat.participants.length > 2;
    const name = _chatDisplayName(chat, user?.uid);
    const time = chat.lastMessageAt?.toDate ? _formatTime(chat.lastMessageAt.toDate()) : '';
    const memberCount = chat.participants.length;
    const isActive = chat.id === _activeChatId ? 'chat-list-item--active' : '';

    return `
      <button class="chat-list-item ${isActive}" data-chat-id="${_esc(chat.id)}">
        <div class="chat-list-item__avatar">${isGroup ? '&#128101;' : '&#128100;'}</div>
        <div class="chat-list-item__info">
          <div class="chat-list-item__name">${_esc(name)}</div>
          <div class="chat-list-item__meta">${memberCount} member${memberCount !== 1 ? 's' : ''} &middot; encrypted</div>
        </div>
        <div class="chat-list-item__time">${_esc(time)}</div>
      </button>`;
  }).join('');

  listEl.querySelectorAll('.chat-list-item').forEach(btn => {
    btn.addEventListener('click', () => _openChat(btn.dataset.chatId));
  });
}

function _chatDisplayName(chat, myUid) {
  if (chat.name) return chat.name;
  if (chat.participants.length === 2) return 'Direct Message';
  return `Group Chat (${chat.participants.length})`;
}

// ===== Open Chat Thread =====

function _openChat(chatId) {
  _activeChatId = chatId;
  const chat = _chatList.find(c => c.id === chatId);
  const user = getCurrentUser();

  // Mobile: switch to message view
  const chatPanel = document.getElementById('chat-panel');
  const messagesPanel = document.getElementById('chat-messages-panel');
  if (chatPanel) chatPanel.classList.add('chat-panel--hidden-mobile');
  if (messagesPanel) messagesPanel.classList.add('chat-messages-panel--visible');

  // Update active state in list
  document.querySelectorAll('.chat-list-item').forEach(btn =>
    btn.classList.toggle('chat-list-item--active', btn.dataset.chatId === chatId),
  );

  // Update thread header
  const headerEl = document.getElementById('chat-thread-header');
  if (headerEl && chat) {
    const name = _chatDisplayName(chat, user?.uid);
    const count = chat.participants.length;
    headerEl.innerHTML = `
      <button class="chat-back-btn" id="chat-back-btn" aria-label="Back to chat list">&#8592;</button>
      <div class="chat-thread-header__info">
        <strong class="chat-thread-header__name">${_esc(name)}</strong>
        <span class="chat-thread-header__meta">${count} member${count !== 1 ? 's' : ''} &middot; end-to-end encrypted</span>
      </div>`;
    // Re-bind back button (it was replaced by innerHTML)
    document.getElementById('chat-back-btn')?.addEventListener('click', _handleBack);
  }

  // Show loading state
  const msgContainer = document.getElementById('chat-messages');
  if (msgContainer) {
    msgContainer.innerHTML = '<div class="chat-status-msg">Decrypting messages...</div>';
  }

  // Enable input
  const input = document.getElementById('chat-input');
  const sendBtn = document.querySelector('.chat-send-btn');
  if (input) input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;

  // Unsubscribe previous thread
  if (_unsubMessages) { _unsubMessages(); _unsubMessages = null; }

  // Subscribe to new thread
  _unsubMessages = subscribeToMessages(chatId, _renderMessages);
}

// ===== Render Messages =====

function _renderMessages(messages) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const user = getCurrentUser();

  if (messages.length === 0) {
    container.innerHTML = '<div class="chat-status-msg">No messages yet — say hello!</div>';
    return;
  }

  const prevScrollTop = container.scrollTop;
  const prevScrollHeight = container.scrollHeight;
  const wasNearBottom = prevScrollHeight - prevScrollTop - container.clientHeight < 80;

  container.innerHTML = messages.map((msg, i) => {
    const isMine = msg.sender === user?.uid;
    const time = msg.timestamp ? _formatTime(msg.timestamp) : '';
    const prevMsg = messages[i - 1];
    const showSender = !isMine && (!prevMsg || prevMsg.sender !== msg.sender);

    return `
      <div class="chat-msg ${isMine ? 'chat-msg--mine' : 'chat-msg--theirs'}">
        ${showSender ? `<div class="chat-msg__sender">${_esc(msg.senderName)}</div>` : ''}
        <div class="chat-msg__bubble">${_escNewlines(msg.text)}</div>
        <div class="chat-msg__time">${_esc(time)}</div>
      </div>`;
  }).join('');

  // Auto-scroll to bottom only if already near it
  if (wasNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

// ===== Send Message =====

function _bindSendForm() {
  const form = document.getElementById('chat-send-form');
  const input = document.getElementById('chat-input');
  if (!form || !input) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !_activeChatId) return;

    input.value = '';
    input.disabled = true;
    const sendBtn = form.querySelector('.chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    try {
      await sendMessage(_activeChatId, text);
    } catch (err) {
      console.error('[Chat] Send failed:', err);
      input.value = text; // restore on failure
    } finally {
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  });

  // Send on Enter (Shift+Enter = newline — but input is single-line so this is fine)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
}

// ===== Back Button (mobile) =====

function _bindBackBtn() {
  // Initial bind — also re-bound after header re-render in _openChat
  document.getElementById('chat-back-btn')?.addEventListener('click', _handleBack);
}

function _handleBack() {
  const chatPanel = document.getElementById('chat-panel');
  const messagesPanel = document.getElementById('chat-messages-panel');
  if (chatPanel) chatPanel.classList.remove('chat-panel--hidden-mobile');
  if (messagesPanel) messagesPanel.classList.remove('chat-messages-panel--visible');

  if (_unsubMessages) { _unsubMessages(); _unsubMessages = null; }
  _activeChatId = null;

  // Reset active states
  document.querySelectorAll('.chat-list-item').forEach(btn =>
    btn.classList.remove('chat-list-item--active'),
  );
}

// ===== New Chat Modal =====

function _bindNewChatBtn() {
  const btn = document.getElementById('chat-new-btn');
  const modal = document.getElementById('chat-new-modal');
  if (!btn || !modal) return;

  const closeBtn = document.getElementById('chat-new-modal-close');
  const backdrop = modal.querySelector('.chat-new-modal__backdrop');
  const createBtn = document.getElementById('chat-new-create-btn');
  const errorEl = document.getElementById('chat-new-error');
  const nameInput = document.getElementById('chat-new-name');

  btn.addEventListener('click', async () => {
    // Reset form
    if (nameInput) nameInput.value = '';
    if (errorEl) errorEl.textContent = '';

    const memberListEl = document.getElementById('chat-member-list');
    if (memberListEl) memberListEl.innerHTML = '<div class="chat-status-msg">Loading members...</div>';

    _showModal(modal);

    try {
      const users = await getChatEligibleUsers();
      _renderMemberPicker(users);
    } catch {
      if (memberListEl) {
        memberListEl.innerHTML = '<div class="chat-status-msg chat-status-msg--error">Failed to load members. Please try again.</div>';
      }
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', () => _hideModal(modal));
  if (backdrop) backdrop.addEventListener('click', () => _hideModal(modal));

  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      if (errorEl) errorEl.textContent = '';

      const selected = [...document.querySelectorAll('.chat-member-check:checked')]
        .map(cb => cb.value);

      if (selected.length === 0) {
        if (errorEl) errorEl.textContent = 'Select at least one member to chat with.';
        return;
      }

      const chatName = nameInput?.value.trim() || null;

      createBtn.disabled = true;
      createBtn.textContent = 'Creating...';

      try {
        const chatId = await createChat(selected, chatName);
        _hideModal(modal);
        // Small delay so the new chat appears in the list
        setTimeout(() => _openChat(chatId), 200);
      } catch (err) {
        if (errorEl) errorEl.textContent = err.message || 'Failed to create chat.';
      } finally {
        createBtn.disabled = false;
        createBtn.textContent = 'Start Chat';
      }
    });
  }
}

function _renderMemberPicker(users) {
  const listEl = document.getElementById('chat-member-list');
  if (!listEl) return;

  if (users.length === 0) {
    listEl.innerHTML = `
      <div class="chat-status-msg">
        No other members are chat-ready yet.<br>
        Ask them to open the Chat tab so their keys can be set up.
      </div>`;
    return;
  }

  listEl.innerHTML = users.map(u => {
    const initials = (u.displayName || u.email || '?')[0].toUpperCase();
    const label = _esc(u.displayName || u.email || u.id);
    return `
      <label class="chat-member-item">
        <input type="checkbox" class="chat-member-check" value="${_esc(u.id)}">
        <span class="chat-member-avatar">${initials}</span>
        <span class="chat-member-name">${label}</span>
        <span class="chat-member-check-indicator" aria-hidden="true"></span>
      </label>`;
  }).join('');
}

// ===== Helpers =====

function _showModal(el) {
  el.removeAttribute('hidden');
  el.style.display = 'flex';
}

function _hideModal(el) {
  el.setAttribute('hidden', '');
  el.style.display = 'none';
}

function _esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Escape HTML but preserve line breaks as <br>
function _escNewlines(str) {
  return _esc(str).replace(/\n/g, '<br>');
}

function _formatTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = now - date;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
