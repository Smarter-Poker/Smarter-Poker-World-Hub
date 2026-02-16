/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DYNAMIC SITEMAP GENERATOR — /sitemap.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Generates a complete XML sitemap for smarter.poker with all public pages.
 * Serves at https://smarter.poker/sitemap.xml
 */

const SITE_URL = 'https://smarter.poker';

// ─── Static Pages ────────────────────────────────────────────────────────────
const staticPages = [
    // Landing
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/terms', priority: '0.3', changefreq: 'yearly' },
    { path: '/legal/official-rules', priority: '0.3', changefreq: 'yearly' },

    // Hub — Core
    { path: '/hub', priority: '0.9', changefreq: 'daily' },
    { path: '/hub/poker-near-me', priority: '0.9', changefreq: 'daily' },
    { path: '/hub/training', priority: '0.9', changefreq: 'weekly' },
    { path: '/hub/news', priority: '0.9', changefreq: 'hourly' },
    { path: '/hub/video-library', priority: '0.8', changefreq: 'daily' },
    { path: '/hub/diamond-store', priority: '0.8', changefreq: 'weekly' },
    { path: '/hub/bankroll-manager', priority: '0.8', changefreq: 'weekly' },
    { path: '/hub/memory-games', priority: '0.7', changefreq: 'weekly' },
    { path: '/hub/diamond-arcade', priority: '0.7', changefreq: 'weekly' },
    { path: '/hub/events-calendar', priority: '0.8', changefreq: 'daily' },
    { path: '/hub/daily-tournaments', priority: '0.7', changefreq: 'daily' },
    { path: '/hub/social-media', priority: '0.7', changefreq: 'daily' },
    { path: '/hub/leaderboards', priority: '0.7', changefreq: 'daily' },
    { path: '/hub/friends', priority: '0.5', changefreq: 'weekly' },
    { path: '/hub/club-arena', priority: '0.8', changefreq: 'weekly' },
    { path: '/hub/diamond-arena', priority: '0.7', changefreq: 'weekly' },
    { path: '/hub/promotions', priority: '0.6', changefreq: 'weekly' },
    { path: '/hub/reels', priority: '0.7', changefreq: 'daily' },
    { path: '/hub/lives', priority: '0.6', changefreq: 'daily' },
    { path: '/hub/messenger', priority: '0.4', changefreq: 'weekly' },
    { path: '/hub/notifications', priority: '0.3', changefreq: 'weekly' },
    { path: '/hub/help', priority: '0.5', changefreq: 'monthly' },
    { path: '/hub/settings', priority: '0.3', changefreq: 'monthly' },
    { path: '/hub/profile', priority: '0.4', changefreq: 'weekly' },
    { path: '/hub/profile-edit', priority: '0.3', changefreq: 'monthly' },
    { path: '/hub/avatars', priority: '0.4', changefreq: 'monthly' },
    { path: '/hub/article', priority: '0.6', changefreq: 'daily' },
    { path: '/hub/pages', priority: '0.5', changefreq: 'weekly' },

    // Hub — Trivia
    { path: '/hub/trivia', priority: '0.8', changefreq: 'weekly' },
    { path: '/hub/trivia/endless', priority: '0.7', changefreq: 'weekly' },
    { path: '/hub/trivia/survival', priority: '0.7', changefreq: 'weekly' },
    { path: '/hub/trivia/time-attack', priority: '0.7', changefreq: 'weekly' },
    { path: '/hub/trivia/mixed', priority: '0.7', changefreq: 'weekly' },
    { path: '/hub/trivia/pvp', priority: '0.7', changefreq: 'weekly' },
    { path: '/hub/trivia/tournaments', priority: '0.7', changefreq: 'daily' },
    { path: '/hub/trivia/leaderboard', priority: '0.6', changefreq: 'daily' },
    { path: '/hub/trivia/achievements', priority: '0.5', changefreq: 'weekly' },
    { path: '/hub/trivia/stats', priority: '0.5', changefreq: 'weekly' },
    { path: '/hub/trivia/settings', priority: '0.3', changefreq: 'monthly' },

    // Hub — Training sub-pages
    { path: '/hub/training/achievements', priority: '0.5', changefreq: 'weekly' },
    { path: '/hub/training/challenges', priority: '0.6', changefreq: 'daily' },
    { path: '/hub/training/leaderboard', priority: '0.6', changefreq: 'daily' },
    { path: '/hub/training/progress', priority: '0.5', changefreq: 'weekly' },
    { path: '/hub/training/streaks', priority: '0.5', changefreq: 'daily' },
    { path: '/hub/training/tournaments', priority: '0.6', changefreq: 'daily' },
    { path: '/hub/training/jarvis', priority: '0.6', changefreq: 'weekly' },

    // Hub — Diamond Store sub-pages
    { path: '/hub/diamond-store/cart', priority: '0.5', changefreq: 'weekly' },
    { path: '/hub/diamond-store/orders', priority: '0.4', changefreq: 'weekly' },
    { path: '/hub/diamond-store/wishlist', priority: '0.4', changefreq: 'weekly' },

    // Hub — Diamond Arcade sub-pages
    { path: '/hub/diamond-arcade/achievements', priority: '0.5', changefreq: 'weekly' },
    { path: '/hub/diamond-arcade/leaderboard', priority: '0.5', changefreq: 'daily' },
    { path: '/hub/diamond-arcade/prizes', priority: '0.5', changefreq: 'weekly' },
    { path: '/hub/diamond-arcade/stats', priority: '0.4', changefreq: 'weekly' },
    { path: '/hub/diamond-arcade/winnings', priority: '0.4', changefreq: 'weekly' },

    // Hub — Memory Games sub-pages
    { path: '/hub/memory-games/achievements', priority: '0.5', changefreq: 'weekly' },
    { path: '/hub/memory-games/leaderboard', priority: '0.5', changefreq: 'daily' },
    { path: '/hub/memory-games/stats', priority: '0.4', changefreq: 'weekly' },
    { path: '/hub/memory-games/tutorial', priority: '0.5', changefreq: 'monthly' },

    // Hub — Reels sub-pages
    { path: '/hub/reels/saved', priority: '0.4', changefreq: 'weekly' },
    { path: '/hub/reels/my-reels', priority: '0.4', changefreq: 'weekly' },

    // Hub — News sub-pages
    { path: '/hub/news/sources', priority: '0.5', changefreq: 'weekly' },

    // Hub — Bankroll Manager sub-pages
    { path: '/hub/bankroll-manager/export', priority: '0.4', changefreq: 'monthly' },

    // Hub — Social Pages
    { path: '/hub/social-pages', priority: '0.5', changefreq: 'weekly' },
    { path: '/hub/social-pages/create', priority: '0.4', changefreq: 'monthly' },

    // Horses
    { path: '/horses', priority: '0.7', changefreq: 'daily' },
];

function generateSitemapXml(urls) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls
            .map(
                (url) => `  <url>
    <loc>${SITE_URL}${url.path}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
            )
            .join('\n')}
</urlset>`;
}

export async function getServerSideProps({ res }) {
    const sitemap = generateSitemapXml(staticPages);

    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200');
    res.write(sitemap);
    res.end();

    return { props: {} };
}

export default function Sitemap() {
    return null;
}
