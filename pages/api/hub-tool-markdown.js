/**
 * World Hub Tool, Simulator & Surface Raw Markdown Endpoint
 *
 * Serves structured, token-efficient Markdown (`text/markdown; charset=utf-8`)
 * for all World Hub interactive tools, training simulators, trivia challenges,
 * community directories, and VIP membership comparison routes.
 *
 * Reads directly from HUB_PAGE_SUMMARIES, SCHEMA_ROUTES, and TRAINING_LIBRARY
 * so the Markdown mirror never drifts from the server-rendered HTML copy.
 */
import { getHubPageSummaries } from '../../src/lib/seo/hubPageSummariesData.js';
import { SCHEMA_ROUTES } from '../../src/lib/seo/summarySchema.js';
import { TRAINING_LIBRARY } from '../../src/data/TRAINING_LIBRARY.js';

const SITE = 'https://smarter.poker';

const PATH_TO_SUMMARY_KEY = {
  '/hub': 'hub',
  '/hub/home-games': 'home-games',
  '/hub/poker-tours': 'poker-tours',
  '/hub/poker-series': 'poker-series',
  '/hub/training': 'training',
  '/hub/bankroll-manager': 'bankroll-manager',
  '/hub/news': 'news',
  '/hub/news/sources': 'news-sources',
  '/hub/video-library': 'video-library',
  '/hub/preflop-charts': 'preflop-charts',
  '/hub/poker-tools': 'poker-tools',
  '/hub/poker-near-me': 'poker-near-me',
  '/hub/poker-near-me/lobby': 'poker-near-me',
  '/hub/commander': 'commander',
  '/hub/commander/venues': 'commander-venues',
  '/hub/commander/tournaments': 'commander-tournaments',
  '/hub/commander/home-games': 'commander-home-games',
  '/hub/commander/leagues': 'commander-leagues',
  '/hub/social-media': 'social-media',
  '/hub/reels': 'reels',
  '/hub/lives': 'lives',
  '/hub/social-pages': 'social-pages',
  '/hub/pages': 'pages',
  '/hub/leaderboards': 'leaderboards',
  '/hub/promotions': 'promotions',
  '/hub/help': 'help',
  '/hub/trivia': 'trivia',
  '/hub/trivia/endless': 'trivia-endless',
  '/hub/trivia/survival-game': 'trivia-survival',
  '/hub/trivia/time-attack': 'trivia-time-attack',
  '/hub/trivia/mixed': 'trivia-mixed',
  '/hub/trivia/pvp': 'trivia-pvp',
  '/hub/trivia/tournaments': 'trivia-tournaments',
  '/hub/trivia/leaderboard': 'trivia-leaderboard',
  '/hub/training/challenges': 'training-challenges',
  '/hub/training/leaderboard': 'training-leaderboard',
  '/hub/training/tournaments': 'training-tournaments',
  '/hub/training/jarvis': 'training-jarvis',
  '/hub/training/hand-history-upload': 'training-hand-history-upload',
  '/hub/training/solutions': 'training-solutions',
  '/hub/personal-assistant': 'personal-assistant',
  '/hub/personal-assistant/leaks': 'personal-assistant-leaks',
  '/hub/personal-assistant/sandbox': 'personal-assistant-sandbox',
  '/hub/install': 'install',
};

for (const [key, route] of Object.entries(SCHEMA_ROUTES)) {
  if (route?.path && !PATH_TO_SUMMARY_KEY[route.path]) {
    PATH_TO_SUMMARY_KEY[route.path] = key;
  }
}

export function renderVipCompareMarkdown() {
  const url = `${SITE}/hub/vip-membership/compare`;
  return [
    '# Compare Smarter.Poker VIP Membership Plans',
    '',
    `> Source: [Compare Smarter.Poker VIP Membership Plans](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'Smarter.Poker Is A 100% Free-To-Play Online Poker Training, Live Venue Discovery, And Private Club Platform. Optional VIP Membership Plans Unlock Cosmetic Table Skins, Unlimited Throwables, Rabbit Hunts, Time Banks, And Exclusive Championship Simulation Modes Using Card Or Promotional Diamond Settlement.',
    '',
    '## VIP Membership Tiers',
    '',
    '| Plan | Billing Term | Settlement Options | Core Entitlements |',
    '| :--- | :--- | :--- | :--- |',
    '| **Monthly VIP** | 30 Days | Card Or Diamonds (100 Diamonds Per $1) | Full VIP Access Across Training, Trivia & Cosmetics |',
    '| **Annual VIP** | 365 Days | Card Or Diamonds | 365 Days Of Full VIP Access With Annual Billing Savings |',
    '| **Lifetime VIP** | Permanent (Never Expires) | One-Time Card Or 49,900 Diamonds | Permanent VIP Access, Unlimited Throwables, Rabbit Hunts, Time Banks & All Cataloged Table Skins |',
    '',
    '## Compliance & Platform Policy',
    '- **No Real-Money Gambling**: Smarter.Poker Operates Zero Real-Money Gambling. Club Chips Are Play Credits With No Cash Value, And Diamonds Are A Promotional Rewards Currency.',
    `- **Canonical URL**: [${url}](${url})`,
    `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
    '',
  ].join('\n');
}

export function renderHubToolMarkdown(targetPath) {
  const cleanPath = '/' + String(targetPath || '').replace(/^\/+/, '').replace(/\.md$/i, '');

  if (cleanPath === '/hub/vip-membership/compare') {
    return renderVipCompareMarkdown();
  }

  const summaries = getHubPageSummaries();
  let summaryKey = PATH_TO_SUMMARY_KEY[cleanPath];
  if (!summaryKey && cleanPath.startsWith('/hub/training/')) {
    const sub = cleanPath.slice('/hub/training/'.length);
    if (summaries[`training-${sub}`]) {
      summaryKey = `training-${sub}`;
    }
  } else if (!summaryKey && cleanPath.startsWith('/hub/personal-assistant/')) {
    const sub = cleanPath.slice('/hub/personal-assistant/'.length);
    if (summaries[`personal-assistant-${sub}`]) {
      summaryKey = `personal-assistant-${sub}`;
    }
  } else if (!summaryKey && cleanPath.startsWith('/hub/trivia/')) {
    const sub = cleanPath.slice('/hub/trivia/'.length);
    if (summaries[`trivia-${sub}`]) {
      summaryKey = `trivia-${sub}`;
    }
  }

  const entry = summaryKey ? summaries[summaryKey] : null;
  if (!entry) return null;

  const routeMeta = SCHEMA_ROUTES[summaryKey];
  const url = `${SITE}${cleanPath}`;
  const cleanTitle = entry.heading.replace(/^About (The )?/i, '');
  const category = routeMeta?.category || 'GameApplication';

  const lines = [
    `# ${cleanTitle} | Smarter.Poker`,
    '',
    `> Source: [${cleanTitle} on Smarter.Poker](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    entry.lead,
    '',
    '## Tool & Surface Specifications',
    `- **Platform**: Smarter.Poker World Hub (${SITE})`,
    `- **Canonical Route**: [${url}](${url})`,
    `- **Raw Markdown Feed**: [${url}.md](${url}.md)`,
    `- **Schema.org Category**: \`${category}\``,
    '- **Pricing & Access**: 100% Free To Access (Zero Real-Money Gambling; Play Credits Only)',
    '',
    '## Connected World Hub Tools & Strategy Guides',
  ];

  for (const link of entry.links || []) {
    const fullHref = link.href.startsWith('http') ? link.href : `${SITE}${link.href}`;
    lines.push(`- **[${link.name}](${fullHref})**: ${link.text}`);
  }

  if (cleanPath === '/hub/training' || cleanPath.startsWith('/hub/training/')) {
    const slug = cleanPath.startsWith('/hub/training/') ? cleanPath.slice('/hub/training/'.length) : '';
    const matchedGames = TRAINING_LIBRARY.filter(
      (g) => g.id === slug || (slug && g.tags?.some((t) => slug.includes(t)))
    ).slice(0, 8);
    if (matchedGames.length > 0) {
      lines.push('', '## Related Interactive Training Scenarios');
      for (const g of matchedGames) {
        lines.push(
          `- **${g.name}** (\`${g.id}\` | Category: ${g.category} | Difficulty: ${g.difficulty}/5): ${g.focus}`
        );
      }
    }
  }

  lines.push(
    '',
    '## Verification & Provenance',
    `- **Verification Methodology**: [${SITE}/verification-methodology](${SITE}/verification-methodology)`,
    `- **Full AI Corpus**: [${SITE}/llms-full.txt](${SITE}/llms-full.txt)`,
    `- **Unified Knowledge Graph**: [${SITE}/knowledge-graph.jsonld](${SITE}/knowledge-graph.jsonld)`,
    ''
  );

  return lines.join('\n');
}

export default function handler(req, res) {
  const { path: queryPath, section, slug } = req.query;
  let targetPath = '';

  if (queryPath) {
    targetPath = Array.isArray(queryPath) ? queryPath.join('/') : String(queryPath);
  } else if (section && slug) {
    targetPath = `/hub/${section}/${slug}`;
  } else if (section) {
    targetPath = `/hub/${section}`;
  }

  const md = renderHubToolMarkdown(targetPath);
  if (!md) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('World Hub tool Markdown representation not found');
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Vary', 'Accept');
  return res.status(200).send(md);
}
