// F1 News Service
// Fetches live headlines from multiple F1 RSS feeds via rss2json.com
// Caches results in localStorage for 30 minutes to avoid rate limits

const NEWS_CACHE_KEY = 'f1_news_cache';
const NEWS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const RSS2JSON = 'https://api.rss2json.com/v1/api.json';

export const NEWS_SOURCES = [
  {
    id: 'f1official',
    name: 'F1 Official',
    color: '#e10600',
    rssUrl: 'https://www.formula1.com/content/fom-website/en/latest/all.xml',
  },
  {
    id: 'autosport',
    name: 'Autosport',
    color: '#009c3b',
    rssUrl: 'https://www.autosport.com/rss/f1/news/',
  },
  {
    id: 'motorsport',
    name: 'Motorsport.com',
    color: '#ff6b00',
    rssUrl: 'https://www.motorsport.com/rss/f1/news/',
  },
  {
    id: 'therace',
    name: 'The Race',
    color: '#3391ff',
    rssUrl: 'https://the-race.com/formula-1/feed/',
  },
  {
    id: 'racefans',
    name: 'RaceFans',
    color: '#9b59b6',
    rssUrl: 'https://www.racefans.net/feed/',
  },
];

function loadCache() {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    const { ts, articles } = JSON.parse(raw);
    if (Date.now() - ts > NEWS_CACHE_TTL) return null;
    return articles;
  } catch {
    return null;
  }
}

function saveCache(articles) {
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ ts: Date.now(), articles }));
  } catch {
    // localStorage may be full — ignore
  }
}

async function fetchSource(source) {
  const url = `${RSS2JSON}?rss_url=${encodeURIComponent(source.rssUrl)}&count=10`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`Feed error: ${data.message || 'unknown'}`);

  return (data.items || []).map(item => ({
    id: `${source.id}-${item.link}`,
    title: (item.title || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim(),
    link: item.link || '#',
    pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
    source: source.name,
    sourceId: source.id,
    sourceColor: source.color,
    thumbnail: item.thumbnail || null,
  }));
}

/**
 * Fetch F1 news from all configured sources.
 * Returns a flat, deduplicated array sorted newest-first.
 * Uses a 30-minute localStorage cache.
 *
 * @param {boolean} [force=false] - bypass cache and re-fetch
 * @returns {Promise<Array>}
 */
export async function fetchNews(force = false) {
  if (!force) {
    const cached = loadCache();
    if (cached) return cached;
  }

  const results = await Promise.allSettled(NEWS_SOURCES.map(fetchSource));

  const articles = [];
  const seenTitles = new Set();

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      const normalised = article.title.toLowerCase().replace(/\s+/g, ' ').substring(0, 80);
      if (!seenTitles.has(normalised)) {
        seenTitles.add(normalised);
        articles.push(article);
      }
    }
  }

  // Sort newest-first
  articles.sort((a, b) => b.pubDate - a.pubDate);

  if (articles.length > 0) saveCache(articles);

  return articles;
}

/** Returns a human-friendly relative time string */
export function relativeTime(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
