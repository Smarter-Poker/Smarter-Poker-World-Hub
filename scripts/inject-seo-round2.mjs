/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SEO INJECTION — ROUND 2: Remaining pages
 * ═══════════════════════════════════════════════════════════════════════════════
 * Handles hub/commander/* pages and other pages skipped in round 1.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, '..', 'pages');

// ─── Additional SEO configs for remaining pages ──────────────────────────────
const ADDITIONAL_CONFIG = {
    // hub/commander/* (all player-facing commander pages under hub scope)
    'hub/commander/check-in/[venueId].js': { title: 'Check In — Poker Venue', noindex: true },
    'hub/commander/faq.js': { title: 'Commander FAQ', noindex: true },
    'hub/commander/hand-history/[handId].js': { title: 'Hand History', noindex: true },
    'hub/commander/hand-history/index.js': { title: 'Hand History', noindex: true },
    'hub/commander/history/index.js': { title: 'Commander History', noindex: true },
    'hub/commander/home-games/[id]/manage.js': { title: 'Manage Home Game', noindex: true },
    'hub/commander/home-games/[id].js': { title: 'Home Game Details', noindex: true },
    'hub/commander/home-games/create.js': { title: 'Create Home Game', noindex: true },
    'hub/commander/home-games/index.js': { title: 'Home Games', noindex: true },
    'hub/commander/index.js': { title: 'Club Commander', noindex: true },
    'hub/commander/leaderboard/[venueId].js': { title: 'Venue Leaderboard', noindex: true },
    'hub/commander/leagues/[id].js': { title: 'League Details', noindex: true },
    'hub/commander/leagues/index.js': { title: 'Poker Leagues', noindex: true },
    'hub/commander/notifications/index.js': { title: 'Commander Notifications', noindex: true },
    'hub/commander/player-card.js': { title: 'Player Card', noindex: true },
    'hub/commander/profile/achievements.js': { title: 'Player Achievements', noindex: true },
    'hub/commander/profile/edit.js': { title: 'Edit Profile', noindex: true },
    'hub/commander/profile/index.js': { title: 'Player Profile', noindex: true },
    'hub/commander/profile/settings.js': { title: 'Profile Settings', noindex: true },
    'hub/commander/rate-table.js': { title: 'Rate Table', noindex: true },
    'hub/commander/responsible-gaming/index.js': { title: 'Responsible Gaming', noindex: true },
    'hub/commander/rewards/index.js': { title: 'Rewards', noindex: true },
    'hub/commander/services/index.js': { title: 'Commander Services', noindex: true },
    'hub/commander/squads/[id].js': { title: 'Squad Details', noindex: true },
    'hub/commander/squads/create.js': { title: 'Create Squad', noindex: true },
    'hub/commander/squads/index.js': { title: 'Squads', noindex: true },
    'hub/commander/squads/join/[code].js': { title: 'Join Squad', noindex: true },
    'hub/commander/tournament/[id]/clock.js': { title: 'Tournament Clock', noindex: true },
    'hub/commander/tournament/[id]/register.js': { title: 'Tournament Registration', noindex: true },
    'hub/commander/tournaments/index.js': { title: 'Tournaments', noindex: true },
    'hub/commander/venue/[id].js': { title: 'Venue Details', noindex: true },
    'hub/commander/venues/[id].js': { title: 'Venue Details', noindex: true },
    'hub/commander/venues/index.js': { title: 'Venues', noindex: true },
    'hub/commander/waitlist/[venueId].js': { title: 'Waitlist', noindex: true },

    // Diamond Arena sub-pages
    'hub/diamond-arena/history.js': { title: 'Diamond Arena — Game History', noindex: true },
    'hub/diamond-arena/leaderboard.js': { title: 'Diamond Arena Leaderboard', canonical: '/hub/diamond-arena/leaderboard' },
    'hub/diamond-arena/schedule.js': { title: 'Diamond Arena Schedule', canonical: '/hub/diamond-arena/schedule' },
    'hub/diamond-arena/stats.js': { title: 'Diamond Arena Stats', noindex: true },
    'hub/diamond-arena/table-settings.js': { title: 'Diamond Arena Table Settings', noindex: true },

    // Training dynamic routes
    'hub/training/arena/[gameId].js': { title: 'Training Arena — Play Game', noindex: true },
    'hub/training/category/[categoryId].js': { title: 'Training Category', noindex: true },
    'hub/training/clinic/[clinicId].js': { title: 'Training Clinic', noindex: true },
    'hub/training/play/[gameId].js': { title: 'Play Training Game', noindex: true },

    // Series
    'hub/series/[id].js': { title: 'Poker Series Details', noindex: true },

    // Social page management
    'hub/social-pages/[pageId]/manage.js': { title: 'Manage Social Page', noindex: true },
};

function getRelativePath(filePath) {
    return path.relative(PAGES_DIR, filePath).replace(/\\/g, '/');
}

function processFile(filePath) {
    const relPath = getRelativePath(filePath);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already has SEOHead
    if (content.includes('SEOHead')) return false;

    // Must have Head import
    if (!content.includes("import Head from 'next/head'")) return false;

    const config = ADDITIONAL_CONFIG[relPath];
    if (!config) return false;

    const desc = config.desc || 'Smarter.Poker — The Future of the Game.';
    const depth = relPath.split('/').length - 1;
    const prefix = depth === 0 ? './' : '../'.repeat(depth);
    const importPath = `${prefix}src/components/seo/SEOHead`;

    // Replace Head import
    content = content.replace(
        /import Head from ['"]next\/head['"];?/,
        `import SEOHead from '${importPath}';`
    );

    // Build attrs
    const attrs = [];
    attrs.push(`title="${config.title}"`);
    attrs.push(`description="${desc}"`);
    if (config.canonical) attrs.push(`canonical="${config.canonical}"`);
    if (config.noindex) attrs.push(`noindex={true}`);

    const seoTag = `<SEOHead\n                ${attrs.join('\n                ')}\n            />`;

    // Replace <Head>...</Head> blocks
    const headBlockRegex = /<Head>([\s\S]*?)<\/Head>/;
    const match = content.match(headBlockRegex);
    if (match) {
        const innerContent = match[1];
        const fontLinks = innerContent.match(/<link[^>]*fonts[^>]*>/g);

        if (fontLinks && fontLinks.length > 0) {
            const seoWithChildren = `<SEOHead\n                ${attrs.join('\n                ')}\n            >\n                ${fontLinks.join('\n                ')}\n            </SEOHead>`;
            content = content.replace(headBlockRegex, seoWithChildren);
        } else {
            content = content.replace(headBlockRegex, seoTag);
        }

        fs.writeFileSync(filePath, content);
        console.log(`  ✅ ${relPath} — SEO injected`);
        return true;
    }

    console.log(`  ⚠  ${relPath} — no Head block found`);
    return false;
}

// Walk all pages
function walkDir(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (['node_modules', 'api', 'auth', 'demo'].includes(entry.name)) continue;
            results.push(...walkDir(fullPath));
        } else if (entry.name.endsWith('.js') && !entry.name.startsWith('_')) {
            results.push(fullPath);
        }
    }
    return results;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  SEO INJECTION — ROUND 2: Remaining pages');
console.log('═══════════════════════════════════════════════════════════════\n');

const allPages = walkDir(PAGES_DIR);
let injected = 0;

for (const page of allPages) {
    const result = processFile(page);
    if (result) injected++;
}

console.log(`\n  ROUND 2 COMPLETE: ${injected} additional pages injected`);
