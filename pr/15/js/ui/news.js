// F1 News UI
// Renders the News view with headlines from multiple F1 sources

import { fetchNews, relativeTime, NEWS_SOURCES } from '../services/news.js';

let activeFilter = 'all';
let allArticles = [];
let isLoading = false;

// ===== Render helpers =====

function sourceFilterBar() {
  const sources = [{ id: 'all', name: 'All Sources', color: 'var(--accent-red)' }, ...NEWS_SOURCES];
  return `
    <div class="news-filters" role="tablist" aria-label="Filter by source">
      ${sources.map(s => `
        <button
          class="news-filter-btn${s.id === activeFilter ? ' active' : ''}"
          data-source="${s.id}"
          role="tab"
          aria-selected="${s.id === activeFilter}"
          style="${s.id !== 'all' ? `--source-color: ${s.color}` : ''}"
        >${s.name}</button>
      `).join('')}
    </div>
  `;
}

function articleCard(article) {
  const time = relativeTime(article.pubDate);
  const domain = (() => {
    try { return new URL(article.link).hostname.replace(/^www\./, ''); } catch { return ''; }
  })();

  return `
    <article class="news-card" data-source="${article.sourceId}">
      <div class="news-card__body">
        <div class="news-card__meta">
          <span class="news-source-badge" style="--source-color: ${article.sourceColor}">${article.source}</span>
          <span class="news-card__time">${time}</span>
        </div>
        <h3 class="news-card__title">
          <a href="${article.link}" class="news-card__link" target="_blank" rel="noopener noreferrer">
            ${article.title}
          </a>
        </h3>
        ${domain ? `<span class="news-card__domain">${domain}</span>` : ''}
      </div>
      ${article.thumbnail ? `
        <div class="news-card__thumb">
          <img src="${article.thumbnail}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
        </div>
      ` : ''}
    </article>
  `;
}

function skeletonCards(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="news-card news-card--skeleton">
      <div class="news-card__body">
        <div class="news-skeleton-line short"></div>
        <div class="news-skeleton-line"></div>
        <div class="news-skeleton-line medium"></div>
      </div>
    </div>
  `).join('');
}

function renderView() {
  const container = document.getElementById('news-feed');
  const countEl = document.getElementById('news-count');
  if (!container) return;

  const filtered = activeFilter === 'all'
    ? allArticles
    : allArticles.filter(a => a.sourceId === activeFilter);

  if (countEl) {
    countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'article' : 'articles'}`;
  }

  // Re-render filter bar active states
  document.querySelectorAll('.news-filter-btn').forEach(btn => {
    const active = btn.dataset.source === activeFilter;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="news-empty">
        <p class="news-empty__icon">&#128240;</p>
        <p class="news-empty__text">No articles found for this source.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(articleCard).join('');
}

function renderError() {
  const container = document.getElementById('news-feed');
  if (!container) return;
  container.innerHTML = `
    <div class="news-empty news-empty--error">
      <p class="news-empty__icon">&#9888;</p>
      <p class="news-empty__text">Could not load F1 news.<br>Check your connection and try again.</p>
      <button class="btn btn--sm" id="news-retry-btn" style="margin-top:1rem">Retry</button>
    </div>
  `;
  document.getElementById('news-retry-btn')?.addEventListener('click', () => loadNews(true));
}

// ===== Data loading =====

async function loadNews(force = false) {
  if (isLoading) return;
  isLoading = true;

  const container = document.getElementById('news-feed');
  const refreshBtn = document.getElementById('news-refresh-btn');
  const lastUpdatedEl = document.getElementById('news-last-updated');

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
  }

  if (container && allArticles.length === 0) {
    container.innerHTML = skeletonCards();
  }

  try {
    allArticles = await fetchNews(force);

    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = `Updated ${relativeTime(new Date())}`;
    }

    renderView();
  } catch {
    renderError();
  } finally {
    isLoading = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';
    }
  }
}

// ===== Init =====

export function initNews() {
  // Wire up source filter buttons (delegated)
  const filtersEl = document.querySelector('.news-filters');
  if (filtersEl) {
    filtersEl.addEventListener('click', e => {
      const btn = e.target.closest('.news-filter-btn');
      if (!btn) return;
      activeFilter = btn.dataset.source;
      renderView();
    });
  }

  // Wire up refresh button
  const refreshBtn = document.getElementById('news-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadNews(true));
  }

  // Load immediately
  loadNews();
}

/**
 * Called by app.js switchView when the news view becomes active.
 * If we already have articles, just re-render; otherwise trigger a load.
 */
export function renderNews() {
  if (allArticles.length > 0) {
    renderView();
  } else {
    loadNews();
  }
}
