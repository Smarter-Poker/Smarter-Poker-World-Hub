#!/usr/bin/env node
/**
 * Read-Only Live Production Sitemap, Dark-Social OG Card, Rich-Snippet & OAuth Probe
 * ===================================================================================
 * Usage:
 *   node scripts/seo/verify-live-conversion-and-sitemaps.mjs [--base https://smarter.poker]
 *
 * Zero writes, zero credentials required (reads public endpoints only).
 */

const baseArgIdx = process.argv.indexOf('--base');
const BASE = (baseArgIdx >= 0 && process.argv[baseArgIdx + 1]
  ? process.argv[baseArgIdx + 1]
  : 'https://smarter.poker'
).replace(/\/+$/, '');

const SITEMAPS = [
  '/sitemap.xml',
  '/sitemap-tools.xml',
  '/sitemap-compare.xml',
  '/sitemap-venues.xml',
  '/sitemap-videos.xml',
];

const OG_CARDS = [
  '/api/og/tool-card?tool=leak-finder&score=84&leak=Turn+Barrels&bb100=3.4',
  '/api/og/tool-card?tool=gto-drill&hand=AQs&pos=BTN&action=3-Bet&grade=Optimal',
  '/api/og/tool-card?tool=odds&title=Poker+Odds+Calculator',
  '/api/og/series-card?name=The+Gardens+Winter+Series',
];

const SAMPLED_PAGES = [
  { path: '/tools/gto-leak-finder', schema: 'SoftwareApplication' },
  { path: '/tools/bankroll-calculator', schema: 'SoftwareApplication' },
  { path: '/tools/preflop-ranges/btn', schema: 'SoftwareApplication' },
  { path: '/tools/embeds', schema: 'ItemList' },
  { path: '/hub/tournaments/this-weekend', schema: 'Event' },
  { path: '/compare/smarter-poker-vs-pokercode', schema: 'FAQPage' },
  { path: '/tools/odds/ak-vs-qq-short-deck', schema: 'FAQPage' },
  { path: '/glossary/pot-odds', schema: 'DefinedTerm' },
  { path: '/rules/texas-holdem', schema: 'FAQPage' },
  { path: '/poker-rooms/states/texas', schema: 'FAQPage' },
];

async function run() {
  const report = {
    checkedAt: new Date().toISOString(),
    base: BASE,
    sitemaps: [],
    ogCards: [],
    sampledPages: [],
    oauthAuthorize: [],
    allPassed: false,
  };

  for (const smPath of SITEMAPS) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}${smPath}`, { headers: { Accept: 'application/xml,text/xml' } });
    const text = await res.text();
    const validXml = text.includes('<urlset') || text.includes('<sitemapindex');
    const urlCount = (text.match(/<loc>/g) || []).length;
    const extraCheck = smPath === '/sitemap-tools.xml'
      ? text.includes('/tools/odds/ak-vs-qq-short-deck') && text.includes('/tools/gto-leak-finder')
      : true;
    report.sitemaps.push({
      path: smPath,
      status: res.status,
      validXml,
      urlCount,
      extraCheck,
      ms: Date.now() - t0,
      pass: res.status === 200 && validXml && urlCount > 0 && extraCheck,
    });
  }

  for (const ogPath of OG_CARDS) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}${ogPath}`);
    const contentType = res.headers.get('content-type') || '';
    const buf = await res.arrayBuffer();
    const isPng = contentType.includes('image/png') && buf.byteLength > 2000;
    report.ogCards.push({
      path: ogPath,
      status: res.status,
      contentType,
      bytes: buf.byteLength,
      ms: Date.now() - t0,
      pass: res.status === 200 && isPng,
    });
  }

  for (const pageSpec of SAMPLED_PAGES) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}${pageSpec.path}`);
    const html = await res.text();
    const hasJsonLd = html.includes('application/ld+json');
    const hasExpectedSchema = html.includes(`"${pageSpec.schema}"`);
    const hasOgImage = /property=["']og:image["']/.test(html);
    report.sampledPages.push({
      path: pageSpec.path,
      status: res.status,
      hasJsonLd,
      hasExpectedSchema,
      hasOgImage,
      ms: Date.now() - t0,
      pass: res.status === 200 && hasJsonLd && hasExpectedSchema && hasOgImage,
    });
  }

  // Probe live Supabase OAuth authorize endpoints via public signup page's configured Supabase host
  const signupHtml = await fetch(`${BASE}/auth/signup`).then((r) => r.text()).catch(() => '');
  const sbHostMatch = signupHtml.match(/https:\/\/[a-z0-9-]+\.supabase\.co/);
  const supabaseOrigin = sbHostMatch ? sbHostMatch[0] : 'https://kuklfnapbkmacvwxktbh.supabase.co';
  for (const provider of ['google', 'facebook']) {
    const url = `${supabaseOrigin}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(`${BASE}/auth/callback`)}`;
    const res = await fetch(url, { redirect: 'manual' });
    const location = res.headers.get('location') || '';
    const expectedHost = provider === 'google' ? 'accounts.google.com' : 'facebook.com';
    report.oauthAuthorize.push({
      provider,
      status: res.status,
      redirectsToExpectedProvider: location.includes(expectedHost),
      pass: (res.status === 302 || res.status === 303) && location.includes(expectedHost),
    });
  }

  const allChecks = [
    ...report.sitemaps,
    ...report.ogCards,
    ...report.sampledPages,
    ...report.oauthAuthorize,
  ];
  report.summary = {
    passed: allChecks.filter((c) => c.pass).length,
    total: allChecks.length,
  };
  report.allPassed = report.summary.passed === report.summary.total;
  console.log(JSON.stringify(report, null, 2));
  if (!report.allPassed) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
