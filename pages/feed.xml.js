/**
 * RSS 2.0 SYNDICATION FEED - /feed.xml
 *
 * Google Discover, Google News, Feedly, and AI search crawlers poll RSS feeds
 * declared via <link rel="alternate" type="application/rss+xml"> to discover
 * strategy guides, software comparisons, and interactive tools between full
 * sitemap crawls.
 */
import { LESSONS, LEARN_MODIFIED, lessonPath } from '../src/content/learn/lessons.js';
import { COMPARE_PAGES, AS_OF as COMPARE_AS_OF, comparePath } from '../src/content/compare/pages.js';
import { GLOSSARY_TERMS, glossaryTermPath } from '../src/content/glossary/terms.js';
import { SITE_URL, sendSitemapXmlResponse } from '../src/lib/seo/sitemapBuilders.mjs';
import { xmlEscape } from '../src/lib/videoLibraryWatch.mjs';

const FEATURE_ITEMS = [
    {
        title: 'Smarter.Poker Platform Features & Tools Directory',
        link: `${SITE_URL}/features`,
        description: 'Explore Smarter.Poker Free Platform Verticals: Form W-2G Tax Ledger, Dealer Toke Tracker, Jarvis AI Coach, Virtual Sandbox, Club Commander, FaceTime Calls, And Solvers.',
    },
    {
        title: 'Poker Bankroll & Form W-2G Tax Ledger',
        link: `${SITE_URL}/features/bankroll-tax-tracker`,
        description: 'Track Session Wins And Losses, Scan Receipts, Log Form W-2G Jackpots, And Export IRS Schedule C CSV Spreadsheets For Your Certified Public Accountant.',
    },
    {
        title: 'Poker Dealer Toke Tracker & Shift Scheduling',
        link: `${SITE_URL}/features/poker-dealer-toke-tracker`,
        description: 'Log Cash And Tournament Downs, Track Tip Rates ($/hr And $/down), Manage Multi-Casino Shift Calendars, And Estimate Year-End Taxes.',
    },
    {
        title: 'PokerBrain & Jarvis AI Tactical Coach',
        link: `${SITE_URL}/features/poker-ai-coach`,
        description: 'Analyze Hands In Conversational Plain English, Automatically Detect Hidden Strategic Leaks, And Practice GTO Solver Equilibrium Lines.',
    },
    {
        title: 'Virtual Poker Table Sandbox & Runout Simulator',
        link: `${SITE_URL}/features/virtual-poker-sandbox`,
        description: 'Construct Custom Scenarios, Assign Stacks And Positions, Calculate Multiway Side Pots, And Simulate Thousands Of Turn And River Runouts.',
    },
    {
        title: 'Club Commander Live Poker Room Management',
        link: `${SITE_URL}/features/club-commander`,
        description: 'Modern Cardroom Operations Featuring Live Digital Waitlists, Multi-Screen TV Displays, Automated Two-Way Player SMS Alerts, And Tournament Clocks.',
    },
    {
        title: 'Live Poker Messenger & FaceTime Video Table Calls',
        link: `${SITE_URL}/features/poker-messenger-video-calls`,
        description: 'Connect Over Encrypted Multi-Peer Video Table Calls, Spatial Voice Audio, Direct Messaging, And Instant Hand History Replay Links With Zero App Downloads.',
    },
    {
        title: 'Multiplayer Poker Trivia & Brain Training',
        link: `${SITE_URL}/features/poker-trivia`,
        description: 'Sharpen Pot Odds Math, GTO Frequencies, And Poker Lore Across Survival Mode (3 Lives), 60-Second Blitz Attacks, And Global Daily Leaderboards.',
    },
    {
        title: 'GTO Poker Training Games & Decision Drills',
        link: `${SITE_URL}/features/poker-training-games`,
        description: 'Interactive Multi-Street Scenarios Across Multi-Table Tournaments, Deep Cash Games, Spins, And SNGs Graded With Instant Solver EV Loss Feedback.',
    },
    {
        title: 'Verified Home Poker Game Directory & Host Tools',
        link: `${SITE_URL}/features/home-poker-games`,
        description: 'Discover Safe, Vetted Home Poker Games Near You, Inspect Blind Structures And Host Reputation Badges, Or Host Games With Free Tournament Clocks.',
    },
    {
        title: 'Interactive Video Coaching Masterclasses & Pause Quizzes',
        link: `${SITE_URL}/features/interactive-video-coaching`,
        description: 'Watch Professional Video Masterclasses With Interactive Mid-Hand Pause Quizzes Prompting Strategic Choices Before Solution Reveals.',
    },
    {
        title: 'Live Poker Near Me & Cardroom Directory',
        link: `${SITE_URL}/features/poker-near-me`,
        description: 'Explore 324+ Verified Live Poker Rooms, 4,500+ Weekly Tournaments, WSOP/WPT Series Schedules, Real-Time Cash Games, And Waitlists With Instant GPS Directions.',
    },
    {
        title: 'Private Poker Clubs & Union Hosting Arena',
        link: `${SITE_URL}/features/private-poker-clubs`,
        description: 'Create And Host Online Poker Clubs, Multi-Club Unions, Ring Games, And Multi-Table Tournaments With Real-Time Rakeback Tracking And WebRTC Video Calls.',
    },
    {
        title: 'Poker Reels & Social Video Feed Network',
        link: `${SITE_URL}/features/poker-reels-social-feed`,
        description: 'Stream Short-Form Video Reels Of Hero Calls And Bad Beats, Attach Replay Links, And Earn Diamond Creator Rewards.',
    },
    {
        title: 'GTO Preflop Charts & Range Matrix',
        link: `${SITE_URL}/features/preflop-charts-matrix`,
        description: 'Solver-Grade 169-Hand Preflop Range Matrices Across 15BB To 100BB Stack Depths With Color-Coded Mixed Action Frequencies.',
    },
    {
        title: 'Poker Equity & Tournament ICM Calculator Suite',
        link: `${SITE_URL}/features/poker-equity-calculators`,
        description: 'High-Precision Multiway Equity Engine Supporting Six Games (Holdem, PLO4/5/6, Stud, Razz) And Malmuth-Harville ICM Payout Solvers.',
    },
];

const TOOL_ITEMS = [
    {
        title: 'Free Poker Odds & Equity Calculator',
        link: `${SITE_URL}/tools/poker-odds-calculator`,
        description: 'Calculate Exact Texas Holdem And Omaha Hand Equity, Outs, And Pot Odds Instantly.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Free ICM & Tournament Payout Calculator',
        link: `${SITE_URL}/tools/icm-calculator`,
        description: 'Compute Malmuth-Harville Independent Chip Model Tournament Equity And Final Table Deal Numbers.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Interactive 169-Hand GTO Preflop Range Matrix',
        link: `${SITE_URL}/tools/preflop-ranges`,
        description: 'Study Opening, 3-Bet, And Big Blind Defense Preflop Charts Across Stack Depths And Positions.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Free Poker Webmaster Widgets & Embed Center',
        link: `${SITE_URL}/tools/embeds`,
        description: 'Embed Free Responsive Poker Odds Calculators, ICM Solvers, And GTO Preflop Charts On Any Website Or Blog.',
        category: 'Poker Tools',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Daily $2,000 Poker Freerolls & Diamond Freerolls',
        link: `${SITE_URL}/freerolls`,
        description: 'Compete In 100% Free Daily Poker Tournaments With $2,000 In Guaranteed Daily Cash Prizes And Diamond Freerolls. Zero Deposit Required.',
        category: 'Poker Freerolls',
        pubDate: LEARN_MODIFIED,
    },
    {
        title: 'Poker Software & Freeroll Platform Comparisons',
        link: `${SITE_URL}/compare`,
        description: 'Compare Smarter.Poker Free GTO Calculators, Equity Solvers, And Daily Freerolls Against Paid Software And Legacy Networks.',
        category: 'Poker Software Comparison',
        pubDate: COMPARE_AS_OF,
    },
    {
        title: 'Smarter.Poker AI Agent OpenAPI Specification',
        link: `${SITE_URL}/api/openapi.json`,
        description: 'Public OpenAPI 3.1.0 Machine-Readable API Specification For Autonomous AI Agents, MCP Tools, And Custom GPTs.',
        category: 'Developer APIs',
        pubDate: LEARN_MODIFIED,
    },
];

export function buildRssFeedXml() {
    const learnDate = new Date(`${LEARN_MODIFIED}T00:00:00Z`).toUTCString();
    const compareDate = new Date(`${COMPARE_AS_OF}T00:00:00Z`).toUTCString();
    const latestTime = Math.max(
        new Date(`${LEARN_MODIFIED}T00:00:00Z`).getTime(),
        new Date(`${COMPARE_AS_OF}T00:00:00Z`).getTime()
    );
    const lastBuildDate = new Date(latestTime).toUTCString();

    const items = [
        ...TOOL_ITEMS.map((item) => ({
            title: item.title,
            link: item.link,
            guid: item.link,
            description: item.description,
            category: item.category,
            pubDate: learnDate,
        })),
        ...LESSONS.map((lesson) => {
            const url = `${SITE_URL}${lessonPath(lesson.slug)}`;
            return {
                title: lesson.title || lesson.h1,
                link: url,
                guid: url,
                description: lesson.summary || lesson.metaDescription || '',
                category: lesson.category || 'Poker Strategy',
                pubDate: learnDate,
            };
        }),
        ...COMPARE_PAGES.map((page) => {
            const url = `${SITE_URL}${comparePath(page.slug)}`;
            return {
                title: page.title || page.h1,
                link: url,
                guid: url,
                description: page.description || '',
                category: 'Poker Software Comparison',
                pubDate: compareDate,
            };
        }),
        ...FEATURE_ITEMS.map((item) => ({
            title: item.title,
            link: item.link,
            guid: item.link,
            description: item.description,
            category: 'Poker Platform Features',
            pubDate: learnDate,
        })),
        ...GLOSSARY_TERMS.map((term) => {
            const url = `${SITE_URL}${glossaryTermPath(term.slug)}`;
            return {
                title: `${term.term} - Poker Glossary Definition`,
                link: url,
                guid: url,
                description: term.definition || '',
                category: `Poker Glossary (${term.category})`,
                pubDate: learnDate,
            };
        }),
    ];

    const itemsXml = items
        .map(
            (item) => `    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(item.link)}</link>
      <guid isPermaLink="true">${xmlEscape(item.guid)}</guid>
      <description>${xmlEscape(item.description)}</description>
      <category>${xmlEscape(item.category)}</category>
      <pubDate>${xmlEscape(item.pubDate)}</pubDate>
    </item>`
        )
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Smarter.Poker Strategy, Tools &amp; Comparisons</title>
    <link>${SITE_URL}</link>
    <description>GTO Poker Strategy Lessons, Interactive Equity &amp; ICM Calculators, And Verified Poker Platform Comparisons From Smarter.Poker.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
}

export async function getServerSideProps({ req, res }) {
    const xml = buildRssFeedXml();
    const latestTime = Math.max(
        new Date(`${LEARN_MODIFIED}T00:00:00Z`).getTime(),
        new Date(`${COMPARE_AS_OF}T00:00:00Z`).getTime()
    );
    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    sendSitemapXmlResponse(req, res, xml, {
        cacheControl: 'public, s-maxage=3600, stale-while-revalidate=86400',
        lastModified: new Date(latestTime).toUTCString(),
    });
    return { props: {} };
}

export default function RssFeed() {
    return null;
}
