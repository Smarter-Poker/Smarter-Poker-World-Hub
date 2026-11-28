/**
 * OTC TIER 4: 100 HAND MATCHUPS, 3 BOFU SWITCHERS & LIVE IDEMPOTENT ORGANIC DRIP FORTRESS (2026-11-27)
 * ====================================================================================================
 * Permanent regression locks for:
 *   1. 100 verified programmatic /tools/odds/[matchup] entries across NLHE, PLO4 & PLO5:
 *      unique slugs & titles, exact equity math (<= 0.02% tolerance), title <= 60 chars,
 *      description 70..158 chars, >= 3 FAQs, zero em/en dashes, full sitemap-tools.xml parity.
 *   2. 3 Tier 4 BOFU competitor switchers (smarter-poker-vs-run-it-once,
 *      smarter-poker-vs-pokercoaching, smarter-poker-vs-hendon-mob):
 *      SEO/GEO/FAQPage/citation/Title Case/zero-dash/no-blanket-verified laws & llms-full.txt sync.
 *   3. Live idempotent `runOrganicWelcomeDrip` runner wired inside existing
 *      `pages/api/cron/signup-welcome-back.js` without adding any net-new cron route:
 *      personalized tracks, probe/@example.invalid/out-of-window/non-organic skips,
 *      strict `organic_welcome_sent_at` idempotency, `maxSends` cap, non-throwing errors.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPARE_PAGES,
  PRODUCTS,
  compareJsonLd,
  compareRoutes,
  getComparePage,
  pageSources,
} from '../src/content/compare/pages.js';
import {
  TOOL_HAND_MATCHUPS,
  getToolHandMatchup,
  toolMatchupPath,
} from '../src/content/tools/handMatchups.js';
import { fitsInAResult } from '../src/lib/seo/titleFit.js';
import { generateSitemapXml } from '../src/lib/seo/sitemapBuilders.mjs';
import { TOOLS_SITEMAP_URLS } from '../pages/sitemap-tools.xml.js';
import { syncLlmsFull } from '../scripts/generate-llms-full.mjs';
import {
  ORGANIC_DRIP_FROM,
  ORGANIC_DRIP_UNSUBSCRIBE_URL,
  runOrganicWelcomeDrip,
} from '../src/lib/seo/organicWelcomeDripRunner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const TIER4_BOFU_SLUGS = [
  'smarter-poker-vs-run-it-once',
  'smarter-poker-vs-pokercoaching',
  'smarter-poker-vs-hendon-mob',
];

const TIER4_REQUIRED_NEW_MATCHUPS = [
  'aa-vs-tt',
  'aa-vs-99',
  'kk-vs-tt',
  'kk-vs-99',
  'qq-vs-tt',
  'qq-vs-99',
  'jj-vs-99',
  '99-vs-88',
  '88-vs-77',
  '77-vs-66',
  '66-vs-55',
  '55-vs-44',
  'aa-vs-ajs',
  'kk-vs-ajs',
  'qq-vs-ajs',
  'jj-vs-ajs',
  'tt-vs-ajs',
  '99-vs-aqo',
  '88-vs-aks',
  '77-vs-aks',
  '66-vs-aks',
  '55-vs-aks',
  '44-vs-ako',
  '33-vs-aks',
  '22-vs-aks',
  'aqs-vs-kqs',
  'aqs-vs-kjs',
  'ajs-vs-kqo',
  'kqs-vs-qjs',
  'kjs-vs-qts',
  'ats-vs-kjs',
  'a9s-vs-kqs',
  'k9s-vs-qts',
  't9s-vs-aa',
  '87s-vs-kk',
  '65s-vs-qq',
  '54s-vs-aa',
  'aakk-vs-qqjj-plo4',
  'aa98-vs-kkqj-plo4',
  'aakqj-vs-jt987-plo5',
];

const BANNED_GOLD_RE = /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15|d4af37|d4a853|f2b84b)\b/i;

test('OTC TIER 4 LAW 1 — Programmatic hand matchups scale to >= 100 verified NLHE, PLO4 & PLO5 pages with exact <=0.02% equity math', () => {
  assert.ok(
    TOOL_HAND_MATCHUPS.length >= 100,
    `TOOL_HAND_MATCHUPS must contain >= 100 matchups (got ${TOOL_HAND_MATCHUPS.length})`,
  );

  const seenSlugs = new Set();
  const seenTitles = new Set();
  const gameCounts = { nlhe: 0, plo4: 0, plo5: 0 };

  for (const m of TOOL_HAND_MATCHUPS) {
    assert.ok(!seenSlugs.has(m.slug), `duplicate matchup slug "${m.slug}"`);
    seenSlugs.add(m.slug);
    assert.equal(getToolHandMatchup(m.slug), m, `lookup resolves ${m.slug}`);
    assert.equal(m.path, toolMatchupPath(m.slug), `path matches slug for ${m.slug}`);

    assert.ok(!seenTitles.has(m.title), `duplicate matchup title "${m.title}"`);
    seenTitles.add(m.title);
    assert.ok(fitsInAResult(m.title), `${m.slug} title "${m.title}" must fit <= 60 chars with brand`);
    assert.ok(
      m.description.length >= 70 && m.description.length <= 158,
      `${m.slug} description length ${m.description.length} must be 70..158`,
    );
    assert.doesNotMatch(JSON.stringify(m), /[—–]/, `${m.slug} must contain zero em or en dashes`);

    const outcomeSum = m.winA + m.winB + m.tie;
    const equitySum = m.equityA + m.equityB;
    assert.ok(
      Math.abs(outcomeSum - 100) <= 0.02,
      `${m.slug} winA+winB+tie=${outcomeSum.toFixed(2)} must equal 100.00 (+/- 0.02)`,
    );
    assert.ok(
      Math.abs(equitySum - 100) <= 0.02,
      `${m.slug} equityA+equityB=${equitySum.toFixed(2)} must equal 100.00 (+/- 0.02)`,
    );
    assert.ok(
      Math.abs(m.winA + m.tie / 2 - m.equityA) <= 0.02,
      `${m.slug} equityA (${m.equityA}) must equal winA + tie/2 (+/- 0.02)`,
    );
    assert.ok(
      Math.abs(m.winB + m.tie / 2 - m.equityB) <= 0.02,
      `${m.slug} equityB (${m.equityB}) must equal winB + tie/2 (+/- 0.02)`,
    );

    assert.ok(m.faqs.length >= 3, `${m.slug} must have >= 3 FAQs`);
    assert.ok(m.flopHitNotes.length >= 3, `${m.slug} must have >= 3 flop hit notes`);
    assert.ok(m.strategicTakeaways.length >= 3, `${m.slug} must have >= 3 strategic takeaways`);
    assert.match(
      m.calculatorUrl,
      /^\/tools\/poker-odds-calculator\?game=(nlhe|plo4|plo5)&h0=/,
      `${m.slug} calculatorUrl must preload cards for nlhe, plo4, or plo5`,
    );

    for (const rel of m.relatedSlugs) {
      assert.ok(getToolHandMatchup(rel), `${m.slug} related slug "${rel}" must resolve`);
      assert.notEqual(rel, m.slug, `${m.slug} must not self-link`);
    }

    if (m.game in gameCounts) gameCounts[m.game] += 1;
  }

  for (const slug of TIER4_REQUIRED_NEW_MATCHUPS) {
    assert.ok(getToolHandMatchup(slug), `Tier 4 matchup "${slug}" must exist`);
  }
  assert.ok(gameCounts.nlhe >= 90, `Expected >= 90 NLHE matchups (got ${gameCounts.nlhe})`);
  assert.ok(gameCounts.plo4 >= 7, `Expected >= 7 PLO4 matchups (got ${gameCounts.plo4})`);
  assert.ok(gameCounts.plo5 >= 2, `Expected >= 2 PLO5 matchups (got ${gameCounts.plo5})`);

  const xml = generateSitemapXml(TOOLS_SITEMAP_URLS);
  for (const matchup of TOOL_HAND_MATCHUPS) {
    assert.ok(
      xml.includes(`<loc>https://smarter.poker/tools/odds/${matchup.slug}</loc>`),
      `sitemap-tools.xml must register /tools/odds/${matchup.slug}`,
    );
  }
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length, 'sitemap-tools.xml must have zero duplicate <loc> entries');
});

test('OTC TIER 4 LAW 2 — All 3 new/upgraded BOFU switchers satisfy SEO, GEO, FAQPage, citation, zero-dash & llms-full.txt laws', () => {
  const routes = compareRoutes();
  const llmsFull = read('public/llms-full.txt');
  const seenSlugs = new Set(COMPARE_PAGES.map((p) => p.slug));
  assert.equal(seenSlugs.size, COMPARE_PAGES.length, 'COMPARE_PAGES slugs must remain 100% unique');

  for (const slug of TIER4_BOFU_SLUGS) {
    const page = getComparePage(slug);
    assert.ok(page, `Tier 4 BOFU switcher "${slug}" must exist in COMPARE_PAGES`);
    assert.ok(routes.includes(`/compare/${slug}`), `/compare/${slug} must appear in compareRoutes()`);
    assert.ok(fitsInAResult(page.title), `${slug} title "${page.title}" must fit <= 60 chars`);
    assert.ok(
      page.description.length >= 70 && page.description.length <= 158,
      `${slug} description length ${page.description.length} must be 70..158`,
    );

    const summaryWords = page.summary.text.trim().split(/\s+/).length;
    assert.ok(summaryWords >= 38, `${slug} GEO opener must be ~40+ words (got ${summaryWords})`);
    assert.ok(Array.isArray(page.faq) && page.faq.length >= 4, `${slug} must include >= 4 FAQs`);
    assert.ok(page.table && page.table.products.length >= 2, `${slug} must include a side-by-side table`);
    assert.ok(page.table.columns.length >= 6, `${slug} table must compare >= 6 attributes`);

    for (const productId of page.table.products) {
      assert.ok(PRODUCTS[productId], `${slug} references valid product "${productId}"`);
    }

    const sources = pageSources(page);
    assert.ok(sources.length >= 3, `${slug} must cite >= 3 verified sources`);
    for (const src of sources) {
      assert.match(src.url, /^https:\/\/[^\s]+$/, `${slug} source "${src.key}" must be https`);
    }
    assert.ok(sources.some((s) => s.kind !== 'own'), `${slug} must cite an external competitor source`);
    assert.ok(sources.some((s) => s.key === 'spHome'), `${slug} must cite spHome disclosure`);

    const jsonLd = compareJsonLd(page);
    const faqNode = jsonLd.find((n) => n['@type'] === 'FAQPage');
    assert.ok(faqNode && faqNode.mainEntity.length >= 4, `${slug} FAQPage JSON-LD must carry >= 4 questions`);
    assert.ok(jsonLd.some((n) => n['@type'] === 'Article'), `${slug} must emit Article JSON-LD`);
    assert.ok(jsonLd.some((n) => n['@type'] === 'BreadcrumbList'), `${slug} must emit BreadcrumbList JSON-LD`);

    const serialized = JSON.stringify(page);
    assert.doesNotMatch(serialized, /[—–]/, `${slug} must contain zero em or en dashes`);
    assert.doesNotMatch(serialized, BANNED_GOLD_RE, `${slug} must contain zero banned gold hexes`);
    assert.doesNotMatch(
      serialized,
      /\bVerified\s+(?:Live\s+)?(?:US\s+)?(?:Poker\s+)?(?:Rooms|Venues|Cardrooms)\b/i,
      `${slug} must never make blanket Verified room claims`,
    );

    assert.ok(
      llmsFull.includes(`https://smarter.poker/compare/${slug}`),
      `public/llms-full.txt must include https://smarter.poker/compare/${slug}`,
    );
    assert.ok(
      llmsFull.includes(`https://smarter.poker/compare/${slug}.md`),
      `public/llms-full.txt must include https://smarter.poker/compare/${slug}.md`,
    );
  }

  const { inSync } = syncLlmsFull({ write: false });
  assert.ok(inSync, 'public/llms-full.txt must stay in 100% sync with scripts/generate-llms-full.mjs');
});

test('OTC TIER 4 LAW 3 — runOrganicWelcomeDrip dispatches personalized track emails idempotently, skips probes/invalid/already-sent, honors maxSends, and never throws', async () => {
  const now = Date.parse('2026-11-28T05:00:00Z');
  const usersStore = [
    // Eligible organic #1: gto-ranges track via acquisition_landing_path
    {
      id: 'org-1',
      email: 'alice@gmail.com',
      created_at: '2026-11-28T03:00:00Z',
      user_metadata: {
        first_name: 'Alice',
        acquisition_landing_path: '/tools/preflop-ranges',
      },
    },
    // Eligible organic #2: odds-calculator track via unlock_key
    {
      id: 'org-2',
      email: 'bob@gmail.com',
      created_at: '2026-11-27T12:00:00Z',
      user_metadata: {
        full_name: 'Bob Grinder',
        unlock_key: 'calc-save-odds',
        acquisition_landing_path: '/tools/odds/aa-vs-tt',
      },
    },
    // Eligible organic #3: gto-leak-finder track
    {
      id: 'org-3',
      email: 'carol@gmail.com',
      created_at: '2026-11-28T01:00:00Z',
      user_metadata: {
        username: 'CarolPro',
        unlock_key: 'gto-leak-finder',
      },
    },
    // Eligible organic #4: should be skipped when maxSends = 3
    {
      id: 'org-4',
      email: 'dave@gmail.com',
      created_at: '2026-11-28T02:00:00Z',
      user_metadata: {
        first_name: 'Dave',
        acquisition_landing_path: '/hub/poker-near-me/in/nv',
      },
    },
    // Synthetic probe -> skipped
    {
      id: 'probe-1',
      email: 'probe@gmail.com',
      created_at: '2026-11-28T04:00:00Z',
      user_metadata: {
        signup_probe: true,
        acquisition_landing_path: '/tools/poker-odds-calculator',
      },
    },
    // @example.invalid -> skipped
    {
      id: 'invalid-1',
      email: 'synthetic-test@example.invalid',
      created_at: '2026-11-28T04:00:00Z',
      user_metadata: {
        acquisition_landing_path: '/tools/poker-odds-calculator',
      },
    },
    // Already sent -> skipped idempotently
    {
      id: 'already-1',
      email: 'already@gmail.com',
      created_at: '2026-11-28T02:00:00Z',
      user_metadata: {
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: '2026-11-28T02:30:00.000Z',
        organic_welcome_track: 'gto-ranges',
      },
    },
    // Outside 48h window -> skipped
    {
      id: 'old-1',
      email: 'old@gmail.com',
      created_at: '2026-11-20T02:00:00Z',
      user_metadata: {
        acquisition_landing_path: '/tools/preflop-ranges',
      },
    },
    // Non-organic (no acquisition_landing_path or unlock_key) -> skipped
    {
      id: 'direct-1',
      email: 'direct@gmail.com',
      created_at: '2026-11-28T04:00:00Z',
      user_metadata: {
        first_name: 'Direct',
      },
    },
  ];

  const listCalls = [];
  const updateCalls = [];
  const mockSb = {
    auth: {
      admin: {
        listUsers: async (opts) => {
          listCalls.push(opts);
          return { data: { users: usersStore }, error: null };
        },
        updateUserById: async (id, payload) => {
          updateCalls.push({ id, payload });
          const target = usersStore.find((u) => u.id === id);
          if (target) target.user_metadata = payload.user_metadata;
          return { data: { user: target }, error: null };
        },
      },
    },
  };

  const sentEmails = [];
  const sendEmail = async (msg) => {
    sentEmails.push(msg);
    return { ok: true, id: `em_${sentEmails.length}` };
  };

  // Run 1 with maxSends = 3 -> sends org-1, org-2, org-3; caps org-4
  const run1 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxSends: 3,
    windowHours: 48,
    now,
  });

  assert.deepEqual(listCalls[0], { page: 1, perPage: 100 }, 'must issue bounded listUsers(page:1, perPage:100)');
  assert.equal(run1.sent, 3);
  assert.equal(run1.skipped, 6);
  assert.deepEqual(run1.errors, []);
  assert.deepEqual(run1.tracks, {
    'gto-ranges': 1,
    'odds-calculator': 1,
    'gto-leak-finder': 1,
  });
  assert.deepEqual(
    sentEmails.map((m) => m.to[0]),
    ['alice@gmail.com', 'bob@gmail.com', 'carol@gmail.com'],
  );
  assert.equal(sentEmails[0].from, ORGANIC_DRIP_FROM);
  assert.equal(sentEmails[0].idempotencyKey, 'organic-welcome-day0-org-1');
  assert.deepEqual(sentEmails[0].headers, { 'List-Unsubscribe': `<${ORGANIC_DRIP_UNSUBSCRIBE_URL}>` });
  assert.match(sentEmails[0].subject, /GTO Preflop Ranges/i);
  assert.match(sentEmails[1].subject, /Odds Calculations/i);
  assert.match(sentEmails[2].subject, /GTO Leak Audit/i);

  // Verify metadata stamped with organic_welcome_sent_at & organic_welcome_track while preserving prior keys
  assert.equal(updateCalls.length, 3);
  assert.equal(updateCalls[0].id, 'org-1');
  assert.equal(updateCalls[0].payload.user_metadata.organic_welcome_sent_at, '2026-11-28T05:00:00.000Z');
  assert.equal(updateCalls[0].payload.user_metadata.organic_welcome_track, 'gto-ranges');
  assert.equal(updateCalls[0].payload.user_metadata.first_name, 'Alice');

  // Run 2 -> org-1/2/3 skipped idempotently; org-4 now sends!
  const run2 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxSends: 20,
    windowHours: 48,
    now,
  });
  assert.equal(run2.sent, 1, 'only uncapped org-4 should send on run 2');
  assert.deepEqual(run2.tracks, { 'live-venues': 1 });
  assert.equal(sentEmails.length, 4);
  assert.equal(sentEmails[3].to[0], 'dave@gmail.com');

  // Run 3 -> 100% idempotent no-op
  const run3 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxSends: 20,
    windowHours: 48,
    now,
  });
  assert.equal(run3.sent, 0);
  assert.equal(run3.skipped, usersStore.length);
  assert.deepEqual(run3.errors, []);

  // Non-throwing behavior on listUsers error and failed send (never stamps failed send, never leaks email)
  const failingSb = {
    auth: {
      admin: {
        listUsers: async () => {
          throw new Error('auth upstream 503');
        },
      },
    },
  };
  const errRun = await runOrganicWelcomeDrip(failingSb, { sendEmail });
  assert.equal(errRun.sent, 0);
  assert.equal(errRun.errors.length, 1);
  assert.match(errRun.errors[0], /listUsers threw: auth upstream 503/);

  let stampedOnFail = false;
  const failSendSb = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              {
                id: 'fail-u1',
                email: 'secret-user@gmail.com',
                created_at: '2026-11-28T04:00:00Z',
                user_metadata: { acquisition_landing_path: '/tools/preflop-ranges' },
              },
            ],
          },
          error: null,
        }),
        updateUserById: async () => {
          stampedOnFail = true;
          return { data: {}, error: null };
        },
      },
    },
  };
  const failSendRun = await runOrganicWelcomeDrip(failSendSb, {
    sendEmail: async () => ({ ok: false, error: 'resend 429 rate limited' }),
    now,
  });
  assert.equal(failSendRun.sent, 0);
  assert.equal(stampedOnFail, false, 'must NOT stamp organic_welcome_sent_at when email send fails');
  assert.equal(failSendRun.errors.length, 1);
  assert.doesNotMatch(JSON.stringify(failSendRun), /secret-user@gmail\.com/, 'must never leak raw email in error summary');
});

test('OTC TIER 4 LAW 4 — pages/api/cron/signup-welcome-back.js wires runOrganicWelcomeDrip in isolated try/catch without adding a new cron route', () => {
  const cronSrc = read('pages/api/cron/signup-welcome-back.js');
  assert.match(cronSrc, /import \{ runOrganicWelcomeDrip \} from '\.\.\/\.\.\/\.\.\/src\/lib\/seo\/organicWelcomeDripRunner\.mjs'/);
  assert.match(cronSrc, /organicDrip\s*=\s*await runOrganicWelcomeDrip\(sb,\s*\{[\s\S]*?sendEmail:\s*sendBulkEmail/);
  assert.match(cronSrc, /let organicDrip = null;\s*try\s*\{[\s\S]*?catch\s*\(/);
  assert.match(cronSrc, /res\.status\(200\)\.json\(\{[^}]*organicDrip[^}]*\}\)/);
  assert.match(cronSrc, /res\.status\(503\)\.json\(\{[^}]*organicDrip[^}]*\}\)/);

  // CLAUDE.md section 11: zero net-new cron routes for organic drip
  const cronDirFiles = fs.readdirSync(path.join(ROOT, 'pages/api/cron'));
  assert.ok(
    !cronDirFiles.some((f) => /organic.*drip/i.test(f)),
    'must ride inside signup-welcome-back.js and never add a net-new organic-drip cron route',
  );
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(
    !(vercel.crons || []).some((c) => /organic.*drip/i.test(String(c.path || ''))),
    'vercel.json must not add a net-new organic drip cron entry',
  );
});
