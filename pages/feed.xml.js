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
import { SITE_URL, sendSitemapXmlResponse } from '../src/lib/seo/sitemapBuilders.mjs';
import { xmlEscape } from '../src/lib/videoLibraryWatch.mjs';

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
