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
    '| **Lifetime VIP** | Permanent (Never Expires) | One-Time Card Or 50,000 Diamonds | Permanent VIP Access, Unlimited Throwables, Rabbit Hunts, Time Banks & All Cataloged Table Skins |',
    '',
    '## Compliance & Platform Policy',
    '- **No Real-Money Gambling**: Smarter.Poker Operates Zero Real-Money Gambling. Club Chips Are Play Credits With No Cash Value, And Diamonds Are A Promotional Rewards Currency.',
    `- **Canonical URL**: [${url}](${url})`,
    `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
    '',
  ].join('\n');
}

const CUSTOM_SURFACE_MARKDOWN = {
  '/hub/vip-membership': {
    title: 'Smarter.Poker VIP Membership Overview',
    lead: 'Smarter.Poker Is A 100% Free-To-Play Online Poker Training, Live Venue Discovery, And Private Club Platform. Optional VIP Membership Plans Unlock Cosmetic Table Skins, Unlimited Throwables, Rabbit Hunts, Time Banks, And Exclusive Championship Simulation Modes Using Card Or Promotional Diamond Settlement.',
    sections: [
      {
        heading: 'Available VIP Membership Plans',
        bullets: [
          '**Monthly VIP (`/hub/vip-membership/monthly`)**: 30 Days Of Full VIP Access Across Training, Trivia, And Club Arena Cosmetics.',
          '**Annual VIP (`/hub/vip-membership/yearly`)**: 365 Days Of Full VIP Access With Annual Billing Savings.',
          '**Lifetime VIP (`/hub/vip-membership/lifetime`)**: Permanent VIP Access With Zero Recurring Renewals (One-Time Card Or 50,000 Diamonds).',
          '**Compare All Plans (`/hub/vip-membership/compare`)**: Side-By-Side Feature Breakdown Of Free vs. Monthly, Annual, And Lifetime VIP Tiers.',
        ],
      },
    ],
  },
  '/hub/vip-membership/monthly': {
    title: 'Smarter.Poker Monthly VIP Membership Plan',
    lead: '30-Day Flexible VIP Membership Unlocking Unlimited Training Scenarios, Cosmetic Table Skins, Rabbit Hunts, Time Banks, And Throwables Across The Smarter.Poker World Hub.',
    sections: [
      {
        heading: 'Plan Specifications',
        bullets: [
          '**Billing Term**: 30 Days (Cancel Anytime)',
          '**Settlement Options**: Credit/Debit Card Or Promotional Diamonds (100 Diamonds Per $1)',
          '**Gift Option**: Available At `/hub/vip-membership/gift/monthly`',
        ],
      },
    ],
  },
  '/hub/vip-membership/yearly': {
    title: 'Smarter.Poker Annual VIP Membership Plan',
    lead: '365-Day Annual VIP Membership Delivering Full Access To GTO Training Simulators, Trivia Challenges, And Club Arena Cosmetics At Discounted Annual Pricing.',
    sections: [
      {
        heading: 'Plan Specifications',
        bullets: [
          '**Billing Term**: 365 Days',
          '**Settlement Options**: Credit/Debit Card Or Promotional Diamonds',
          '**Gift Option**: Available At `/hub/vip-membership/gift/yearly`',
        ],
      },
    ],
  },
  '/hub/vip-membership/lifetime': {
    title: 'Smarter.Poker Lifetime VIP Charter Membership',
    lead: 'Permanent One-Time VIP Charter Membership That Never Expires. Unlocks All Current And Future VIP Training Simulators, Cosmetic Table Skins, Unlimited Throwables, Rabbit Hunts, And Time Banks Forever.',
    sections: [
      {
        heading: 'Plan Specifications',
        bullets: [
          '**Billing Term**: Permanent (Never Expires, Zero Recurring Fees)',
          '**Settlement Options**: One-Time Card Payment Or 50,000 Promotional Diamonds',
          '**Gift Option**: Available At `/hub/vip-membership/gift/lifetime`',
        ],
      },
    ],
  },
  '/hub/vip-membership/gift/monthly': {
    title: 'Gift A 30-Day Smarter.Poker Monthly VIP Membership',
    lead: 'Send A 30-Day Smarter.Poker VIP Membership Gift Directly To Any Player Or Club Teammate On The World Hub.',
    sections: [],
  },
  '/hub/vip-membership/gift/yearly': {
    title: 'Gift A 365-Day Smarter.Poker Annual VIP Membership',
    lead: 'Send A Full Year Of Smarter.Poker VIP Access Directly To Any Player Or Study Group Partner.',
    sections: [],
  },
  '/hub/vip-membership/gift/lifetime': {
    title: 'Gift A Permanent Smarter.Poker Lifetime VIP Membership',
    lead: 'Send A Permanent, Never-Expiring Smarter.Poker Lifetime VIP Charter Membership To Any Player On The World Hub.',
    sections: [],
  },
  '/hub/diamond-store': {
    title: 'Smarter.Poker Diamond Store & Promotional Rewards Catalog',
    lead: 'Browse Promotional Diamond Bundles, VIP Membership Upgrades, Cosmetic Avatar Frames, Table Skins, And Tournament Access Passes Inside The Smarter.Poker Diamond Store. Diamonds Are A Promotional Platform Rewards Currency Earned Through Daily Logins, Trivia Streaks, Training Accuracy Milestones, And Free-To-Enter Diamond Freerolls.',
    sections: [
      {
        heading: 'Diamond Currency Rules & Compliance',
        bullets: [
          '**Zero Real-Money Gambling**: Smarter.Poker Operates Zero Real-Money Gambling. Club Chips Are Free Play Credits With No Cash Value.',
          '**Ways To Earn Free Diamonds**: Daily Login Streaks, Training Simulator Milestones, Trivia Leaderboards, Daily $2,000 Freerolls, And Mail-In AMOE (`/legal/official-rules`).',
        ],
      },
    ],
  },
  '/hub/smarter-rewards': {
    title: 'Smarter Rewards Loyalty & Achievement Program',
    lead: 'Track Daily Login Streaks, Training Simulator Mastery Badges, Trivia Accuracy Milestones, And Promotional Diamond Rewards Across The Smarter.Poker Ecosystem.',
    sections: [],
  },
  '/hub/merch-store': {
    title: 'Smarter.Poker Official Apparel & Merch Store',
    lead: 'Explore Official Smarter.Poker Apparel, Hoodies, Table Gear, Card Protectors, And Branded Accessories For Live And Online Grinders.',
    sections: [],
  },
  '/hub/club-shop': {
    title: 'Smarter.Poker Club Shop & Cosmetic Table Upgrades',
    lead: 'Customize Your Club Arena Experience With Exclusive Table Felts, 4-Color Deck Styles, Animated Throwables, And Club Branding Packages.',
    sections: [],
  },
  '/hub/tournaments/this-weekend': {
    title: 'Poker Tournaments This Weekend (Friday, Saturday & Sunday Schedule)',
    lead: 'Aggregate Directory Of Live Casino And Cardroom Poker Tournaments Running Friday, Saturday, And Sunday Across North America. Compare Buy-Ins, Guaranteed Prize Pools (GTD), Starting Stacks, And Blind Structures Across 324+ Verified Venues.',
    sections: [
      {
        heading: 'Weekend Tournament Discovery Features',
        bullets: [
          '**Multi-Day Schedule Aggregation**: Filter Friday Night Warm-Ups, Saturday Deepstack Majors, And Sunday Guaranteed Events In One Unified View.',
          '**State & Buy-In Filtering**: Narrow Weekend Tournaments By State (TX, CA, FL, NV, And More), Buy-In Bracket (Under $100 To $500+), Or Venue Name.',
          '**Connected Live Directories**: Pair With [Daily Poker Tournaments](/hub/daily-tournaments), [Poker Events Calendar](/hub/events-calendar), And [Poker Near Me](/hub/poker-near-me).',
        ],
      },
    ],
  },
  '/hub/commander/faq': {
    title: 'Club Commander Poker Room Software FAQ (25 Questions Answered)',
    lead: 'Complete Frequently Asked Questions For Club Commander Poker Room Management Software Covering Pricing ($199-$499/Mo Flat Rate), Hardware Compatibility (iPad, Android, FireOS, Windows, Mac), Live Waitlist Sync, Tournament Clock Management, And Bravo/PokerAtlas Migration.',
    sections: [
      {
        heading: 'Core Club Commander FAQ Highlights',
        bullets: [
          '**What Is Club Commander?**: A Cloud-Native Poker Room Management Platform Replacing Legacy Hardware Servers With Real-Time Waitlist, Tournament Clock, Floor Map, Staff Scheduling, And Accounting Software.',
          '**Does Club Commander Require Proprietary Hardware?**: No. It Runs On Off-The-Shelf iPads, Android Tablets, Amazon Fire Tablets, Smart TVs, And Existing Desktop Computers.',
          '**How Much Does Club Commander Cost?**: Transparent Flat-Rate Monthly Tiers Starting At $199/Month (Home Game & Charity Tier Free Forever; Commercial Rooms $199-$499/Month With Zero Long-Term Contracts).',
          '**How Does Live Waitlist Sync Work?**: Floor Updates Sync Instantaneously To Smarter.Poker And Poker Near Me So Players Can Join Waitlists Remotely Before Arriving.',
        ],
      },
    ],
  },
  '/hub/commander/responsible-gaming': {
    title: 'Club Commander Responsible Gaming & Player Protection Controls',
    lead: 'Player Protection Tools, Deposit/Buy-In Limits, Session Time Reminders, Cool-Off Periods, And Self-Exclusion Controls Available Across Smarter.Poker And Club Commander Venues.',
    sections: [
      {
        heading: 'Confidential Support & Helplines',
        bullets: [
          '**National Problem Gambling Helpline**: Call Or Text `1-800-MY-RESET` (`1-800-697-3738`) - 24/7, 100% Free And Confidential.',
          '**Self-Exclusion & Cool-Off Controls**: Request Immediate 24-Hour, 7-Day, 30-Day, 6-Month, Or Permanent Self-Exclusion Across All Connected Club Commander Venues.',
        ],
      },
    ],
  },
  '/hub/preflop-charts/leaderboard': {
    title: 'Preflop Range Mastery Leaderboard | Smarter.Poker',
    lead: 'Global And Weekly Leaderboards Tracking Player Accuracy, Speed, And Streak Multipliers Across Smarter.Poker GTO Preflop Range Drills.',
    sections: [],
  },
  '/hub/preflop-charts/tutorial': {
    title: 'How To Use The GTO Preflop Charts & Range Trainer | Smarter.Poker',
    lead: 'Step-By-Step Tutorial Explaining The 13x13 Hand Matrix, Mixed Strategy Frequency Bars, Position Selection (UTG Through BB), Stack-Depth Adjustments (15BB To 100BB), And Keyboard Shortcuts.',
    sections: [
      {
        heading: 'Core Preflop Matrix Concepts',
        bullets: [
          '**13x13 Hand Grid**: Pocket Pairs Run Down The Diagonal (`AA` To `22`), Suited Hands Sit Above The Diagonal (`AKs`), And Offsuit Hands Sit Below The Diagonal (`AKo`).',
          '**Mixed Frequencies**: Multi-Color Cells Show Exact Solver Split Percentages Between Raising, Calling, And Folding.',
          '**Keyboard Shortcuts**: Press `R` For Raise, `C` For Call, `F` For Fold, And `Space` To Advance To The Next Hand.',
        ],
      },
    ],
  },
  '/terms': {
    title: 'Terms Of Service | Smarter.Poker',
    lead: 'Official Terms Of Service Governing Access To Smarter.Poker, The World Hub, GTO Training Simulators, Poker Near Me Live Venue Directory, Club Arena Private Clubs, And Club Commander Venue Software.',
    sections: [
      {
        heading: 'Key Platform Terms',
        bullets: [
          '**Eligibility**: Users Must Be At Least 18 Years Of Age (Or The Age Of Majority In Their Jurisdiction).',
          '**Zero Real-Money Gambling**: Smarter.Poker Is A Free-To-Play Poker Training, Live Venue Discovery, And Social Club Platform. Virtual Chips Have Zero Monetary Value And Cannot Be Cashed Out.',
          '**Account Integrity**: Automated Bots, Real-Time Assistance (RTA) During Live Play, Multi-Accounting, And Collusion Are Strictly Prohibited.',
        ],
      },
    ],
  },
  '/privacy': {
    title: 'Privacy Policy | Smarter.Poker',
    lead: 'Official Privacy Policy Explaining How Smarter.Poker Collects, Protects, And Processes Account Data, Optional GPS Location Signals For Poker Near Me, And Training Analytics.',
    sections: [
      {
        heading: 'Privacy & Data Protection Principles',
        bullets: [
          '**Location Privacy**: Browser Geolocation For Poker Near Me And Home Games Near Me Is Opt-In Only, Never Sold To Third Parties, And Home Game Host Coordinates Are Jittered Until RSVP Approval.',
          '**Data Rights**: Users May Export Or Delete Their Account Data And Hand History Uploads At Any Time.',
        ],
      },
    ],
  },
  '/legal/official-rules': {
    title: 'Official Sweepstakes & Promotional Contest Rules (AMOE) | Smarter.Poker',
    lead: 'Official Rules, Eligibility Requirements, Odds Disclosure, And No-Purchase-Necessary Alternative Method Of Entry (AMOE) Instructions For Smarter.Poker Promotional Contests And Diamond Freerolls.',
    sections: [
      {
        heading: 'No Purchase Necessary (AMOE)',
        bullets: [
          '**Free Entry**: No Purchase Or Payment Of Any Kind Is Necessary To Enter Or Win Smarter.Poker Promotional Contests Or Freerolls. A Purchase Will Not Increase Your Chances Of Winning.',
          '**Online & Mail-In Entry**: Players May Enter Free Daily Tournaments At `/freerolls` Or Request Promotional Diamonds Via The Mail-In Alternative Method Of Entry Detailed On `/legal/official-rules`.',
        ],
      },
    ],
  },
  '/hub/home-games/in': {
    title: 'Private Poker Home Games By State | Smarter.Poker Directory',
    lead: 'State-By-State Directory Of Active, Publicly Listed Private Poker Home Games Across The United States. Browse Neighborhood Cash Games And Tournaments Or Host Your Own Free Club With Club Commander.',
    sections: [
      {
        heading: 'How Home Game Discovery Works',
        bullets: [
          '**Verified Active Groups**: Only Public Groups With Recent Host Activity Appear In The State And City Directories.',
          '**Host Privacy Protection**: Exact Street Addresses Remain Hidden Until The Host Approves A Player RSVP Request.',
          '**Explore Nearby**: Use [Home Games Near Me](/hub/home-games/near-me) Or Browse [Live Casino Poker Rooms By State](/hub/poker-near-me/in).',
        ],
      },
    ],
  },
  '/hub/home-games/near-me': {
    title: 'Poker Home Games Near Me | Local Cash Games & Tournaments',
    lead: 'Find Private Poker Home Games Near Your Location Using Privacy-Protected GPS Radius Search Or State And City Filters. View Stakes, Game Variants (NLH, PLO, Mixed), Scheduled Dates, And Request A Seat Directly From Local Hosts.',
    sections: [
      {
        heading: 'Privacy & Safety Model',
        bullets: [
          '**Coordinate Jittering**: Public Map Pins Are Jittered By ~0.3 Miles So Host Residences Remain Private Until An RSVP Is Confirmed.',
          '**Zero Platform Rake**: Smarter.Poker Charges Zero Rake On Private Home Game Listings And Seat Reservations.',
        ],
      },
    ],
  },
};

export function renderCustomSurfaceMarkdown(cleanPath, spec) {
  const url = `${SITE}${cleanPath}`;
  const lines = [
    `# ${spec.title}`,
    '',
    `> Source: [${spec.title}](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    spec.lead,
    '',
    '## Surface Specifications',
    `- **Platform**: Smarter.Poker World Hub (${SITE})`,
    `- **Canonical Route**: [${url}](${url})`,
    `- **Raw Markdown Feed**: [${url}.md](${url}.md)`,
    '- **Compliance**: 100% Free-To-Play Ecosystem (Zero Real-Money Gambling)',
  ];

  for (const section of spec.sections || []) {
    lines.push('', `## ${section.heading}`);
    for (const b of section.bullets || []) {
      lines.push(`- ${b}`);
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

export function renderHomeGameGeoMarkdown(cleanPath) {
  const match = cleanPath.match(/^\/hub\/home-games\/in\/([a-z-]+)(?:\/([a-z0-9-]+))?$/i);
  if (!match) return null;
  const stateParam = match[1].toLowerCase();
  const cityParam = match[2] ? match[2].toLowerCase() : null;
  const stateLabel = stateParam.length === 2 ? stateParam.toUpperCase() : stateParam.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const cityLabel = cityParam ? cityParam.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  const locLabel = cityLabel ? `${cityLabel}, ${stateLabel}` : stateLabel;
  const url = `${SITE}${cleanPath}`;

  return [
    `# Private Poker Home Games In ${locLabel} | Smarter.Poker`,
    '',
    `> Source: [Poker Home Games In ${locLabel}](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    `Browse Active, Publicly Listed Private Poker Home Games In ${locLabel} On Smarter.Poker. View Cash Game Stakes, Tournament Buy-Ins, Game Variants (No-Limit Hold'em, Pot-Limit Omaha, Mixed Games), And Request An RSVP Seat Directly From Verified Local Hosts.`,
    '',
    '## Directory Details & Privacy Safeguards',
    `- **Canonical URL**: [${url}](${url})`,
    `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
    `- **State Directory**: [${SITE}/hub/home-games/in/${stateParam}](${SITE}/hub/home-games/in/${stateParam})`,
    `- **National Home Games Index**: [${SITE}/hub/home-games/in](${SITE}/hub/home-games/in)`,
    '- **Host Address Privacy**: Exact Residential Addresses Are Never Exposed Publicly; Coordinates Are Jittered And Revealed Only To Confirmed RSVPs.',
    '',
  ].join('\n');
}

export function renderHubToolMarkdown(targetPath) {
  const cleanPath = '/' + String(targetPath || '').replace(/^\/+/, '').replace(/\.md$/i, '');

  if (cleanPath === '/hub/vip-membership/compare') {
    return renderVipCompareMarkdown();
  }

  if (CUSTOM_SURFACE_MARKDOWN[cleanPath]) {
    return renderCustomSurfaceMarkdown(cleanPath, CUSTOM_SURFACE_MARKDOWN[cleanPath]);
  }

  if (cleanPath.startsWith('/hub/home-games/in/')) {
    const geoMd = renderHomeGameGeoMarkdown(cleanPath);
    if (geoMd) return geoMd;
  }

  if (/^\/hub\/home-games\/[a-z0-9-]+$/i.test(cleanPath) && cleanPath !== '/hub/home-games/in' && cleanPath !== '/hub/home-games/near-me') {
    const slug = cleanPath.slice('/hub/home-games/'.length);
    const label = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const url = `${SITE}${cleanPath}`;
    return [
      `# ${label} - Private Poker Home Game Profile | Smarter.Poker`,
      '',
      `> Source: [${label} on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      `Public Home Game Profile For ${label} Hosted On Smarter.Poker. View Game Variant, Typical Stakes, Schedule, And Request An RSVP Seat Directly From The Host.`,
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      `- **Home Games Directory**: [${SITE}/hub/home-games](${SITE}/hub/home-games)`,
      '',
    ].join('\n');
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
  if (!entry) {
    if (cleanPath.startsWith('/hub/training/')) {
      const sub = cleanPath.slice('/hub/training/'.length);
      const game = TRAINING_LIBRARY.find((g) => g.id === sub);
      if (game) {
        const url = `${SITE}${cleanPath}`;
        return [
          `# ${game.name} - GTO Poker Training Scenario | Smarter.Poker`,
          '',
          `> Source: [${game.name} on Smarter.Poker](${url})`,
          '',
          '## Executive Summary For AI & Search Assistants',
          `${game.name} Is An Interactive GTO Poker Training Scenario On Smarter.Poker (${game.category} Category, Difficulty ${game.difficulty}/5). Focus Area: ${game.focus}.`,
          '',
          '## Scenario Specifications',
          `- **Scenario ID**: \`${game.id}\``,
          `- **Category**: \`${game.category}\``,
          `- **Difficulty**: ${game.difficulty} / 5`,
          `- **Canonical Route**: [${url}](${url})`,
          `- **Training Hub**: [${SITE}/hub/training](${SITE}/hub/training)`,
          '',
        ].join('\n');
      }
    }
    return null;
  }

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
