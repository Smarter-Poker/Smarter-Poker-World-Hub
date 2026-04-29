/**
 * /api/news/* — Hono catch-all router (Phase 4.4 module #10, 2026-04-29)
 *
 * Consolidates 13 previously-separate handlers under a single Hono app.
 * Same pattern as video/live-help/promo/employee/venues/kyc/hendonmob/trivia.
 *
 * Routes (mounted at /api/news):
 *   GET  /articles           — get news articles (cached 30s, public)
 *   POST /articles           — increment view count (rate-limited, public)
 *   POST /cleanup-google     — DELETE all articles (CRON_SECRET)
 *   GET  /debug-extraction   — RSS feed inspection (public, blocked in prod)
 *   GET  /events             — upcoming events with fallback (public)
 *   GET  /extract-article    — Microlink+regex article extraction (public)
 *   POST /fix-images         — update null images to category defaults (CRON_SECRET)
 *   GET  /leaderboard        — POTY with fallback (public)
 *   GET  /reels              — get social_reels (public, cached)
 *   POST /refetch-images     — re-fetch og:images from source URLs (CRON_SECRET)
 *   GET  /show-images        — debug image inspection (public)
 *   GET  /source-boxes       — 6 articles, 1 per source (public)
 *   POST /subscribe          — newsletter signup (rate-limited, public)
 *   GET  /videos             — social_reels reformatted as videos (public, cached)
 *
 * Replaces: 13 files, 1444 LOC -> ~1150 LOC ([...slug].js with shared middleware).
 * Net: -294 LOC.
 *
 * Auth pattern (per-route):
 *   - public: most read endpoints (no auth required)
 *   - rate-limited: articles POST (view count), subscribe POST (writes)
 *   - secretAuth: cleanup-google, fix-images, refetch-images (admin-only)
 *
 * No DB schema changes — uses existing tables: poker_news, poker_events,
 * poy_leaderboard, social_reels, profiles, newsletter_subscribers.
 *
 * Bonus: drops dead-code SUPABASE_URL/SUPABASE_KEY refs in fix-images +
 * refetch-images (undefined identifiers that would ReferenceError if reached;
 * never reached because auth gate blocks first).
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import Parser from 'rss-parser';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const CRON_SECRET = process.env.CRON_SECRET;

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;

// ─── Fallback data ────────────────────────────────────────────────────────
const FALLBACK_EVENTS = [
  { id: 1, name: 'WSOP Main Event', event_date: '2026-06-27', location: 'Las Vegas' },
  { id: 2, name: 'EPT Barcelona', event_date: '2026-08-14', location: 'Barcelona' },
  { id: 3, name: 'WPT Championship', event_date: '2026-12-01', location: 'Las Vegas' },
];

const FALLBACK_LEADERBOARD = [
  { id: 1, player_name: 'Alex F.', points: 2850, rank: 1 },
  { id: 2, player_name: 'Thomas B.', points: 2720, rank: 2 },
  { id: 3, player_name: 'Chad E.', points: 2580, rank: 3 },
  { id: 4, player_name: 'Stephen C.', points: 2410, rank: 4 },
  { id: 5, player_name: 'Daniel N.', points: 2290, rank: 5 },
];

const FALLBACK_REELS = [
  { id: 1, caption: 'INSANE River Bluff at WSOP', video_url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg', view_count: 1250000 },
  { id: 2, caption: 'Phil Hellmuth LOSES IT', video_url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg', view_count: 890000 },
  { id: 3, caption: 'When You Flop the NUTS', video_url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg', view_count: 654000 },
  { id: 4, caption: 'Pocket Aces vs Kings - $100K Pot', video_url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg', view_count: 2100000 },
  { id: 5, caption: 'GTO Play That SHOCKED Everyone', video_url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg', view_count: 432000 },
  { id: 6, caption: 'HUGE Cooler at High Stakes', video_url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg', view_count: 780000 },
];

const FALLBACK_VIDEOS = [
  { id: 1, title: 'WSOP 2025 Main Event Preview', youtube_id: 'dQw4w9WgXcQ', thumbnail_url: 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80', duration: '12:34', views: 45000, channel: 'PokerGO' },
  { id: 2, title: 'GTO Strategy Breakdown', youtube_id: 'dQw4w9WgXcQ', thumbnail_url: 'https://images.unsplash.com/photo-1596451190630-186aff535bf2?w=400&q=80', duration: '8:22', views: 32000, channel: 'Jonathan Little' },
  { id: 3, title: 'Top 10 Poker Hands', youtube_id: 'dQw4w9WgXcQ', thumbnail_url: 'https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80', duration: '15:45', views: 28000, channel: 'Doug Polk Poker' },
  { id: 4, title: 'Live Cash Game Session', youtube_id: 'dQw4w9WgXcQ', thumbnail_url: 'https://images.unsplash.com/photo-1541278107931-e006523892df?w=400&q=80', duration: '45:12', views: 18000, channel: 'Upswing Poker' },
  { id: 5, title: 'Phil Hellmuth Best Moments', youtube_id: 'dQw4w9WgXcQ', thumbnail_url: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=400&q=80', duration: '22:18', views: 125000, channel: 'Poker Clips' },
  { id: 6, title: 'How to Play Pocket Aces', youtube_id: 'dQw4w9WgXcQ', thumbnail_url: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=400&q=80', duration: '18:45', views: 67000, channel: 'Daniel Negreanu' },
  { id: 7, title: 'Tournament Strategy Guide', youtube_id: 'dQw4w9WgXcQ', thumbnail_url: 'https://images.unsplash.com/photo-1609743522653-52354461eb27?w=400&q=80', duration: '35:20', views: 89000, channel: 'Jonathan Little' },
  { id: 8, title: 'Online Poker Tips 2025', youtube_id: 'dQw4w9WgXcQ', thumbnail_url: 'https://images.unsplash.com/photo-1517232115160-ff93364542dd?w=400&q=80', duration: '14:55', views: 42000, channel: 'Upswing Poker' },
];

// ─── Source boxes config (preserved from source-boxes.js) ─────────────────
const SOURCE_BOXES = [
  { box: 1, source_name: 'PokerNews', fallback_image: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { box: 2, source_name: 'MSPT', fallback_image: 'https://images.pexels.com/photos/3279691/pexels-photo-3279691.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { box: 3, source_name: 'CardPlayer', fallback_image: 'https://images.pexels.com/photos/279009/pexels-photo-279009.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { box: 4, source_name: 'WSOP', fallback_image: 'https://images.pexels.com/photos/6664248/pexels-photo-6664248.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { box: 5, source_name: 'Poker.org', fallback_image: 'https://images.pexels.com/photos/4254890/pexels-photo-4254890.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { box: 6, source_name: 'Pokerfuse', fallback_image: 'https://images.pexels.com/photos/1871508/pexels-photo-1871508.jpeg?auto=compress&cs=tinysrgb&w=800' },
];

// ─── Image helpers (preserved from refetch-images.js + fix-images.js) ──────
const DEFAULT_IMAGE_PATTERNS = [
  'unsplash.com', 'pexels.com', 'placeholder', 'lh3.googleusercontent.com', 'gstatic.com', 'google.com/images',
];

const DEFAULT_CATEGORY_IMAGES = {
  tournament: 'https://images.unsplash.com/photo-1609743522653-52354461eb27?w=600&q=80',
  strategy: 'https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=600&q=80',
  industry: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=600&q=80',
  news: 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=600&q=80',
  online: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&q=80',
};

async function extractRealUrlFromGoogleNews(googleUrl) {
  if (!googleUrl || !googleUrl.includes('news.google.com')) return googleUrl;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(googleUrl, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
    });
    clearTimeout(timeout);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location && !location.includes('google.com')) return location;
    }
    const html = await response.text();
    let match = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>\s]+)/i);
    if (match && match[1] && !match[1].includes('google.com')) return decodeURIComponent(match[1]);
    match = html.match(/window\.location\s*=\s*["']([^"']+)["']/i);
    if (match && match[1] && !match[1].includes('google.com')) return match[1];
    match = html.match(/data-url=["']([^"']+)["']/i);
    if (match && match[1] && !match[1].includes('google.com')) return decodeURIComponent(match[1]);
    match = html.match(/<a[^>]+href=["'](https?:\/\/(?!news\.google\.com)[^"']+)["'][^>]*>/i);
    if (match && match[1]) return match[1];
    return null;
  } catch { return null; }
}

async function fetchOgImage(url) {
  if (!url) return null;
  try {
    let actualUrl = url;
    if (url.includes('news.google.com')) {
      const realUrl = await extractRealUrlFromGoogleNews(url);
      if (realUrl) actualUrl = realUrl;
      else return null;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(actualUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const html = await response.text();

    let match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

    if (match && match[1]) {
      let imageUrl = match[1].replace(/&amp;/g, '&');
      if (imageUrl.includes('googleusercontent.com') || imageUrl.includes('gstatic.com') || imageUrl.includes('google.com')) return null;
      if (imageUrl.includes('logo') || imageUrl.includes('icon') || imageUrl.includes('favicon')) return null;
      if (imageUrl.startsWith('http')) return imageUrl;
    }
    return null;
  } catch { return null; }
}

// ─── Article-extract helpers (preserved from extract-article.js) ──────────
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

function isBoilerplate(text, patterns) {
  const lower = text.toLowerCase();
  return patterns.some(b => lower.startsWith(b) || lower === b);
}

function extractArticleContent(html) {
  const containerPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*story-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*content-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];

  let articleHtml = '';
  for (const pattern of containerPatterns) {
    const match = html.match(pattern);
    if (match && match[1] && match[1].length > 200) {
      articleHtml = match[1];
      break;
    }
  }

  if (!articleHtml) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    articleHtml = bodyMatch ? bodyMatch[1] : html;
  }

  articleHtml = articleHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '');

  const boilerplate = [
    'table of contents', 'related players', 'tags', 'share this',
    'follow us', 'newsletter', 'sign up', 'subscribe',
    'feature image courtesy', 'related articles', 'advertisement',
    'you may also like', 'read more', 'more stories',
  ];

  let paragraphs = [];

  const headingRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let match;
  while ((match = headingRegex.exec(articleHtml)) !== null) {
    const text = stripHtml(match[1]).trim();
    if (text.length > 5 && !isBoilerplate(text, boilerplate)) {
      paragraphs.push({ type: 'heading', text, pos: match.index });
    }
  }

  const quoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
  while ((match = quoteRegex.exec(articleHtml)) !== null) {
    const text = stripHtml(match[1]).trim();
    if (text.length > 10) {
      paragraphs.push({ type: 'quote', text, pos: match.index });
    }
  }

  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  while ((match = pRegex.exec(articleHtml)) !== null) {
    const text = stripHtml(match[1]).trim();
    if (text.length > 15 && !isBoilerplate(text, boilerplate)) {
      paragraphs.push({ type: 'paragraph', text, pos: match.index });
    }
  }

  paragraphs.sort((a, b) => a.pos - b.pos);

  const seen = new Set();
  paragraphs = paragraphs.filter(p => {
    delete p.pos;
    const key = p.text.substring(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return paragraphs;
}

// ─── debug-extraction helpers (preserved from debug-extraction.js) ────────
function extractImage(item) {
  let contentEncodedImg = null;
  if (item['content:encoded']) {
    const imgMatch = item['content:encoded'].match(/<img[^>]+src=["']([^"']+)["']/i);
    contentEncodedImg = imgMatch ? imgMatch[1] : 'NO_MATCH';
  }
  const results = {
    hasEnclosure: !!item.enclosure,
    enclosureUrl: item.enclosure?.url,
    hasMediaContent: !!item['media:content'],
    mediaContentRaw: JSON.stringify(item['media:content']),
    hasMediaThumbnail: !!item['media:thumbnail'],
    mediaThumbnailRaw: JSON.stringify(item['media:thumbnail']),
    hasMediaGroup: !!item['media:group'],
    descriptionHasImg: item.description?.includes('<img'),
    contentHasImg: item.content?.includes('<img'),
    contentEncodedHasImg: item['content:encoded']?.includes('<img'),
    contentEncodedImgExtract: contentEncodedImg,
    contentEncodedSample: item['content:encoded']?.substring(0, 500),
    extractedUrl: null,
  };

  if (item.enclosure?.url) {
    results.extractedUrl = item.enclosure.url;
    results.extractedFrom = 'enclosure';
    return results;
  }

  if (item['media:content']) {
    const media = Array.isArray(item['media:content']) ? item['media:content'][0] : item['media:content'];
    if (media?.$?.url) { results.extractedUrl = media.$.url; results.extractedFrom = 'media:content.$'; return results; }
    if (media?.url) { results.extractedUrl = media.url; results.extractedFrom = 'media:content.url'; return results; }
  }
  if (item['media:thumbnail']) {
    const thumb = Array.isArray(item['media:thumbnail']) ? item['media:thumbnail'][0] : item['media:thumbnail'];
    if (thumb?.$?.url) { results.extractedUrl = thumb.$.url; results.extractedFrom = 'media:thumbnail.$'; return results; }
    if (thumb?.url) { results.extractedUrl = thumb.url; results.extractedFrom = 'media:thumbnail.url'; return results; }
  }
  if (item.description) {
    const imgMatch = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) { results.extractedUrl = imgMatch[1]; results.extractedFrom = 'description img'; return results; }
  }
  results.extractedFrom = 'none';
  return results;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
    /youtu\.be\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/news');

const secretAuth = async (c, next) => {
  const auth = c.req.header('authorization') || '';
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  await next();
};

const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

// ─── Routes ───────────────────────────────────────────────────────────────

// GET /api/news/articles — list news articles
app.get('/articles', async (c) => {
  const supabase = getSupabase();
  try {
    const category = safeQ(c.req.query('category'));
    const search = safeQ(c.req.query('search'));
    const limit = safeQ(c.req.query('limit')) || 20;
    const offset = safeQ(c.req.query('offset')) || 0;
    const featured = safeQ(c.req.query('featured'));

    let query = supabase
      .from('poker_news')
      .select('*')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(100);

    if (category && category !== 'all') {
      query = query.eq('category', category).limit(100);
    }

    if (search) {
      const sanitized = String(search).replace(/[,().]/g, ' ').trim();
      if (sanitized) {
        query = query.or(`title.ilike.%${sanitized}%,content.ilike.%${sanitized}%`);
      }
    }

    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }

    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data, error } = await query;
    if (error) throw error;

    c.header('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return c.json({ success: true, data });
  } catch (err) {
    console.warn('[news/articles GET]', err?.message);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/news/articles — increment view count
app.post('/articles', writeLimit, async (c) => {
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { id } = body;
    if (!id) return c.json({ success: false, error: 'Missing article ID' }, 400);

    const { error } = await supabase.rpc('increment_news_views', { news_id: id });
    if (error) throw error;
    return c.json({ success: true });
  } catch (err) {
    console.warn('[news/articles POST]', err?.message);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/news/cleanup-google — DELETE all articles
app.post('/cleanup-google', secretAuth, async (c) => {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from('poker_news')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id');

    if (error) {
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }
    return c.json({
      success: true,
      deleted: data?.length || 0,
      message: 'Deleted ALL articles. Run /api/cron/news-scraper to repopulate.',
    });
  } catch (err) {
    console.warn('[news/cleanup-google]', err?.message);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/news/debug-extraction — RSS feed inspection (dev-only)
app.get('/debug-extraction', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Not found' }, 404);
  }

  const rssParser = new Parser({
    customFields: { item: ['media:content', 'media:thumbnail', 'content:encoded', 'enclosure', 'media:group'] },
  });

  const testFeeds = [
    { name: 'PokerNews', url: 'https://www.pokernews.com/news.rss' },
    { name: 'Upswing', url: 'https://upswingpoker.com/feed/' },
    { name: 'Google News', url: 'https://news.google.com/rss/search?q=poker+news+today&hl=en-US&gl=US&ceid=US:en' },
  ];

  const results = [];
  for (const feed of testFeeds) {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      const item = parsed.items[0];
      results.push({
        source: feed.name,
        title: item.title?.substring(0, 60),
        link: item.link?.substring(0, 80),
        ...extractImage(item),
      });
    } catch (error) {
      results.push({ source: feed.name, error: error?.message });
    }
  }
  return c.json({ results });
});

// GET /api/news/events — upcoming events
app.get('/events', async (c) => {
  const supabase = getSupabase();
  try {
    const limit = parseInt(c.req.query('limit') || '5');
    const featured = c.req.query('featured');

    let query = supabase
      .from('poker_events')
      .select('*')
      .gte('event_date', new Date().toISOString().split('T')[0])
      .order('event_date', { ascending: true })
      .limit(limit);

    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }

    const { data, error } = await query;
    if (error || !data?.length) {
      return c.json({ success: true, data: FALLBACK_EVENTS.slice(0, limit) });
    }
    return c.json({ success: true, data });
  } catch {
    return c.json({ success: true, data: FALLBACK_EVENTS });
  }
});

// GET /api/news/extract-article — Microlink + regex parse
app.get('/extract-article', async (c) => {
  const url = safeQ(c.req.query('url'));
  if (!url) return c.json({ success: false, error: 'URL parameter required' }, 400);

  try {
    const targetUrl = url.startsWith('http') ? url : decodeURIComponent(url);

    let metadata = {};
    try {
      const metaRes = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(targetUrl));
      if (metaRes.ok) {
        const metaResult = await metaRes.json();
        if (metaResult.status === 'success' && metaResult.data) {
          metadata = {
            title: metaResult.data.title || '',
            description: metaResult.data.description || '',
            image: metaResult.data.image?.url || '',
            author: metaResult.data.author || '',
            publisher: metaResult.data.publisher || '',
            date: metaResult.data.date || '',
            logo: metaResult.data.logo?.url || '',
            url: metaResult.data.url || targetUrl,
          };
        }
      }
    } catch (e) {
      console.warn('[news/extract-article] Microlink metadata failed:', e?.message);
    }

    let paragraphs = [];
    try {
      const pageRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SmartPokerBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        paragraphs = extractArticleContent(html);
      }
    } catch (e) {
      console.warn('[news/extract-article] Direct fetch failed:', e?.message);
    }

    if (paragraphs.length === 0 && metadata.description) {
      paragraphs = [{ type: 'paragraph', text: metadata.description }];
    }

    c.header('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return c.json({
      success: true,
      data: { ...metadata, title: metadata.title || '', paragraphs },
    });
  } catch (err) {
    console.warn('[news/extract-article]', err?.message);
    return c.json({ success: false, error: err?.message }, 500);
  }
});

// POST /api/news/fix-images — set null images to category defaults
app.post('/fix-images', secretAuth, async (c) => {
  const supabase = getSupabase();
  try {
    const { data: articles, error: fetchError } = await supabase
      .from('poker_news')
      .select('id, category, image_url')
      .or('image_url.is.null,image_url.eq.')
      .limit(100);

    if (fetchError) throw fetchError;

    let updated = 0;
    const errors = [];

    for (const article of (articles || [])) {
      const imageUrl = DEFAULT_CATEGORY_IMAGES[article.category] || DEFAULT_CATEGORY_IMAGES.news;
      const { error: updateError } = await supabase
        .from('poker_news')
        .update({ image_url: imageUrl })
        .eq('id', article.id);

      if (updateError) errors.push({ id: article.id, error: updateError.message });
      else updated++;
    }

    return c.json({
      success: true,
      found: articles?.length || 0,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.warn('[news/fix-images]', err?.message);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/news/leaderboard — POTY leaderboard with fallback
app.get('/leaderboard', async (c) => {
  const supabase = getSupabase();
  try {
    const year = parseInt(c.req.query('year') || String(new Date().getFullYear()));
    const limit = parseInt(c.req.query('limit') || '10');

    const { data, error } = await supabase
      .from('poy_leaderboard')
      .select('*')
      .eq('year', year)
      .order('points', { ascending: false })
      .limit(limit);

    if (error || !data?.length) {
      return c.json({ success: true, data: FALLBACK_LEADERBOARD.slice(0, limit) });
    }
    return c.json({ success: true, data });
  } catch {
    return c.json({ success: true, data: FALLBACK_LEADERBOARD.slice(0, parseInt(c.req.query('limit') || '10')) });
  }
});

// GET /api/news/reels — social_reels read
app.get('/reels', async (c) => {
  const supabase = getSupabase();
  try {
    const limit = parseInt(safeQ(c.req.query('limit')) || '20');
    const featured = safeQ(c.req.query('featured'));
    const sort = safeQ(c.req.query('sort')) || 'recent';

    let query = supabase
      .from('social_reels')
      .select('*')
      .eq('is_public', true)
      .limit(100);

    if (sort === 'popular') {
      query = query.order('view_count', { ascending: false }).limit(100);
    } else {
      query = query.order('created_at', { ascending: false }).limit(100);
    }

    query = query.limit(limit);

    const { data, error } = await query;
    if (error || !data?.length) {
      return c.json({ success: true, data: FALLBACK_REELS.slice(0, limit) });
    }

    const authorIds = [...new Set(data.map(r => r.author_id).filter(Boolean))];
    let profilesMap = {};
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', authorIds)
        .limit(100);

      if (profiles) {
        profilesMap = profiles.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
      }
    }

    let result = data.map(reel => {
      const profile = profilesMap[reel.author_id];
      return {
        ...reel,
        title: reel.caption?.split('\n')[0]?.replace(/^🎬\s*/, '') || 'Poker Reel',
        channel_name: profile?.full_name || profile?.username || 'Smarter.Poker',
        profiles: profile,
        author: profile,
      };
    });

    if (sort === 'random') {
      result = result.sort(() => Math.random() - 0.5);
    }

    c.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return c.json({ success: true, data: result });
  } catch {
    return c.json({ success: true, data: FALLBACK_REELS });
  }
});

// POST /api/news/refetch-images — re-fetch og:image from source URLs
app.post('/refetch-images', secretAuth, async (c) => {
  const supabase = getSupabase();
  try {
    const { data: articles, error: fetchError } = await supabase
      .from('poker_news')
      .select('id, title, source_url, image_url, category')
      .order('published_at', { ascending: false })
      .limit(50);

    if (fetchError) throw fetchError;

    const articlesToUpdate = (articles || []).filter(a => {
      if (!a.image_url) return true;
      return DEFAULT_IMAGE_PATTERNS.some(pattern => a.image_url.includes(pattern));
    });

    let updated = 0;
    let failed = 0;
    const results = [];

    for (const article of articlesToUpdate) {
      const newImageUrl = await fetchOgImage(article.source_url);
      if (newImageUrl) {
        const { error: updateError } = await supabase
          .from('poker_news')
          .update({ image_url: newImageUrl })
          .eq('id', article.id);

        if (!updateError) {
          updated++;
          results.push({ id: article.id, title: article.title.substring(0, 40), newImage: newImageUrl.substring(0, 60) });
        } else {
          failed++;
        }
      } else {
        failed++;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    return c.json({
      success: true,
      total: articlesToUpdate.length,
      updated,
      failed,
      results,
    });
  } catch (err) {
    console.warn('[news/refetch-images]', err?.message);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/news/show-images — debug
app.get('/show-images', async (c) => {
  const supabase = getSupabase();
  try {
    const { data: articles } = await supabase
      .from('poker_news')
      .select('id, title, image_url, source_name, source_url')
      .order('published_at', { ascending: false })
      .limit(10);

    const summary = (articles || []).map(a => ({
      title: a.title?.substring(0, 50),
      source: a.source_name,
      image: a.image_url?.substring(0, 80),
      isDefault: a.image_url?.includes('unsplash') || a.image_url?.includes('pexels') || a.image_url?.includes('googleusercontent'),
      sourceUrl: a.source_url?.substring(0, 60),
    }));

    c.header('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return c.json({ articles: summary });
  } catch (err) {
    console.warn('[news/show-images]', err?.message);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/news/source-boxes — 6 articles, 1 per source
app.get('/source-boxes', async (c) => {
  const supabase = getSupabase();
  try {
    const boxArticles = [];

    for (const box of SOURCE_BOXES) {
      let { data: article } = await supabase
        .from('poker_news')
        .select('*')
        .eq('source_box', box.box)
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!article) {
        const { data: byName } = await supabase
          .from('poker_news')
          .select('*')
          .eq('source_name', box.source_name)
          .eq('is_published', true)
          .order('published_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        article = byName;
      }

      // MSPT cross-source fallback (preserved from source-boxes.js)
      if (box.box === 2 && article) {
        const articleAge = Date.now() - new Date(article.published_at).getTime();
        const twoHoursMs = 2 * 60 * 60 * 1000;
        if (articleAge > twoHoursMs) {
          const { data: crossSource } = await supabase
            .from('poker_news')
            .select('*')
            .ilike('title', '%MSPT%')
            .eq('is_published', true)
            .order('published_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (crossSource && new Date(crossSource.published_at) > new Date(article.published_at)) {
            article = crossSource;
          }
        }
      }

      if (article) {
        boxArticles.push({ ...article, _boxNumber: box.box, _sourceName: box.source_name });
      } else {
        boxArticles.push({
          id: `empty-box-${box.box}`,
          _boxNumber: box.box,
          _sourceName: box.source_name,
          _isEmpty: true,
          title: `Awaiting ${box.source_name} News`,
          source_name: box.source_name,
          image_url: box.fallback_image,
          published_at: new Date().toISOString(),
          views: 0,
        });
      }
    }

    return c.json({
      success: true,
      data: boxArticles,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[news/source-boxes]', err?.message);
    return c.json({
      success: false,
      error: err?.message,
      data: SOURCE_BOXES.map(box => ({
        id: `error-box-${box.box}`,
        _boxNumber: box.box,
        _sourceName: box.source_name,
        _isError: true,
        title: `${box.source_name} - Loading...`,
        source_name: box.source_name,
        image_url: box.fallback_image,
        published_at: new Date().toISOString(),
        views: 0,
      })),
    }, 500);
  }
});

// POST /api/news/subscribe — newsletter signup
app.post('/subscribe', writeLimit, async (c) => {
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { email, source = 'news_hub' } = body;

    if (!email || !email.includes('@')) {
      return c.json({ success: false, error: 'Valid email required' }, 400);
    }

    const { data: existing } = await supabase
      .from('newsletter_subscribers')
      .select('id, is_active')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing) {
      if (!existing.is_active) {
        await supabase
          .from('newsletter_subscribers')
          .update({ is_active: true, unsubscribed_at: null })
          .eq('id', existing.id);
        return c.json({ success: true, message: 'Subscription reactivated!' });
      }
      return c.json({ success: true, message: 'Already subscribed!' });
    }

    const { error } = await supabase
      .from('newsletter_subscribers')
      .insert({ email: email.toLowerCase(), source });

    if (error) throw error;

    return c.json({ success: true, message: 'Successfully subscribed!' });
  } catch (err) {
    console.warn('[news/subscribe]', err?.message);
    return c.json({ success: false, error: 'Subscription failed' }, 500);
  }
});

// GET /api/news/videos — social_reels reformatted
app.get('/videos', async (c) => {
  const supabase = getSupabase();
  try {
    const limit = parseInt(safeQ(c.req.query('limit')) || '20');
    const channel = safeQ(c.req.query('channel'));

    const { data, error } = await supabase
      .from('social_reels')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data?.length) {
      return c.json({ success: true, data: FALLBACK_VIDEOS.slice(0, limit) });
    }

    const videos = data.map(reel => {
      const youtubeId = extractYouTubeId(reel.video_url);
      const thumbnailUrl = reel.thumbnail_url
        || (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null);

      return {
        id: reel.id,
        title: reel.caption?.split('\n')[0]?.replace(/^🎬\s*/, '') || 'Poker Video',
        youtube_id: youtubeId,
        video_url: reel.video_url,
        thumbnail_url: thumbnailUrl,
        duration: reel.duration || '',
        views: reel.view_count || 0,
        channel: 'PokerNews',
        published_at: reel.created_at,
        scraped_at: reel.created_at,
      };
    });

    const filtered = channel
      ? videos.filter(v => v.channel?.toLowerCase().includes(channel.toLowerCase()))
      : videos;

    c.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return c.json({ success: true, data: filtered });
  } catch {
    return c.json({ success: true, data: FALLBACK_VIDEOS });
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[news] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[news] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
