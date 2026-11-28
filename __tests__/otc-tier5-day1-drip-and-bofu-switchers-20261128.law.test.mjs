/**
 * OTC TIER 5: LIVE DAY-1 BEHAVIORAL ACTIVATION DRIP & 5 BOFU TOOL SWITCHERS FORTRESS (2026-11-28)
 * ===============================================================================================
 * Permanent regression locks for:
 *   1. `runOrganicWelcomeDrip` Phase B Day-1 behavioral re-engagement nudge inside
 *      the SAME bounded `listUsers({ page: 1, perPage: 100 })` pass (zero extra listUsers
 *      calls, zero net-new cron routes):
 *      - Dispatches `buildDay1ActivationNudgeEmail` to unverified organic users
 *        (`phone_verified !== true`) whose `organic_welcome_sent_at` is 20h-96h old.
 *      - Skips `phone_verified: true`, already-sent `organic_day1_sent_at`, `< 20h`
 *        too-early users, `> 96h` too-old users, synthetic probes, `@example.invalid`,
 *        and non-organic users.
 *      - Honors `maxDay1Sends` independently of `maxSends`, stamps `organic_day1_sent_at`
 *        idempotently without clobbering existing metadata, never stamps failed sends,
 *        never leaks raw emails, and preserves Phase A Day-0 counts cleanly.
 *   2. 3 upgraded BOFU tool switchers (`smarter-poker-vs-flopzilla`,
 *      `smarter-poker-vs-icmizer`, `smarter-poker-vs-piosolver`) + 2 brand-new
 *      high-intent BOFU switchers (`smarter-poker-vs-pokercode`,
 *      `smarter-poker-vs-cardschat`):
 *      - SEO/GEO (40+ word opener, <= 60 char title, 70..158 char description),
 *        4+ FAQs matching `FAQPage` JSON-LD, verified HTTPS citations, Title Case,
 *        zero em/en dashes, zero banned gold hexes, zero blanket Verified room claims,
 *        and 100% `public/llms-full.txt` parity.
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
import { fitsInAResult } from '../src/lib/seo/titleFit.js';
import { syncLlmsFull } from '../scripts/generate-llms-full.mjs';
import {
  ORGANIC_DRIP_FROM,
  ORGANIC_DRIP_UNSUBSCRIBE_URL,
  runOrganicWelcomeDrip,
} from '../src/lib/seo/organicWelcomeDripRunner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const TIER5_BOFU_SLUGS = [
  'smarter-poker-vs-flopzilla',
  'smarter-poker-vs-icmizer',
  'smarter-poker-vs-piosolver',
  'smarter-poker-vs-pokercode',
  'smarter-poker-vs-cardschat',
];

const BANNED_GOLD_RE = /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15|d4af37|d4a853|f2b84b)\b/i;

test('OTC TIER 5 LAW 1 — runOrganicWelcomeDrip Phase B Day-1 nudge sends to 20h-96h unverified organic users, enforces gates/caps/idempotency, and preserves Phase A Day-0 counts in one bounded pass', async () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  const hoursAgo = (h) => new Date(now - h * 3_600_000).toISOString();

  const usersStore = [
    // Phase A eligible Day-0 user (signed up 3h ago, no welcome sent yet)
    {
      id: 'day0-1',
      email: 'fresh@gmail.com',
      created_at: hoursAgo(3),
      user_metadata: {
        first_name: 'Fresh',
        acquisition_landing_path: '/tools/preflop-ranges',
      },
    },
    // Phase B eligible Day-1 #1: welcome sent 24h ago, unverified, gto-ranges track
    {
      id: 'day1-1',
      email: 'unverified-24h@gmail.com',
      created_at: hoursAgo(25),
      user_metadata: {
        first_name: 'Elena',
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(24),
        organic_welcome_track: 'gto-ranges',
      },
    },
    // Phase B eligible Day-1 #2: signed up 62h ago (>48h windowHours!), welcome sent 60h ago (<=96h), unverified
    {
      id: 'day1-2',
      email: 'unverified-60h@gmail.com',
      created_at: hoursAgo(62),
      user_metadata: {
        full_name: 'Marcus Grinder',
        unlock_key: 'calc-save-odds',
        organic_welcome_sent_at: hoursAgo(60),
        organic_welcome_track: 'odds-calculator',
        phone_verified: false,
      },
    },
    // Phase B eligible Day-1 #3: welcome sent 36h ago, unverified -> capped when maxDay1Sends = 2
    {
      id: 'day1-3',
      email: 'unverified-36h@gmail.com',
      created_at: hoursAgo(37),
      user_metadata: {
        username: 'NadiaLive',
        acquisition_landing_path: '/hub/poker-near-me/lobby',
        organic_welcome_sent_at: hoursAgo(36),
        organic_welcome_track: 'live-venues',
      },
    },
    // Phase B skip: phone_verified === true
    {
      id: 'verified-1',
      email: 'verified@gmail.com',
      created_at: hoursAgo(30),
      user_metadata: {
        first_name: 'Victor',
        acquisition_landing_path: '/tools/poker-odds-calculator',
        organic_welcome_sent_at: hoursAgo(28),
        organic_welcome_track: 'odds-calculator',
        phone_verified: true,
      },
    },
    // Phase B skip: already sent organic_day1_sent_at
    {
      id: 'already-day1',
      email: 'already-day1@gmail.com',
      created_at: hoursAgo(40),
      user_metadata: {
        first_name: 'Sam',
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(38),
        organic_day1_sent_at: hoursAgo(12),
        organic_welcome_track: 'gto-ranges',
      },
    },
    // Phase B skip: too early (< 20h after welcome)
    {
      id: 'too-early-1',
      email: 'too-early@gmail.com',
      created_at: hoursAgo(19),
      user_metadata: {
        first_name: 'Early',
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(18),
        organic_welcome_track: 'gto-ranges',
      },
    },
    // Phase B skip: too old (> 96h after welcome)
    {
      id: 'too-old-1',
      email: 'too-old@gmail.com',
      created_at: hoursAgo(105),
      user_metadata: {
        first_name: 'Old',
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(100),
        organic_welcome_track: 'gto-ranges',
      },
    },
    // Phase B skip: synthetic probe
    {
      id: 'probe-day1',
      email: 'probe-d1@gmail.com',
      created_at: hoursAgo(30),
      user_metadata: {
        signup_probe: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(28),
      },
    },
    // Phase B skip: @example.invalid
    {
      id: 'invalid-day1',
      email: 'synthetic-d1@example.invalid',
      created_at: hoursAgo(30),
      user_metadata: {
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(28),
      },
    },
    // Phase B skip: non-organic (no acquisition_landing_path or unlock_key)
    {
      id: 'non-organic-day1',
      email: 'direct-d1@gmail.com',
      created_at: hoursAgo(30),
      user_metadata: {
        first_name: 'Direct',
        organic_welcome_sent_at: hoursAgo(28),
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

  // Run 1: maxDay1Sends = 2 -> sends 1 Day-0 + 2 Day-1 (day1-1, day1-2), caps day1-3
  const run1 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxSends: 20,
    maxDay1Sends: 2,
    windowHours: 48,
    day1MinHours: 20,
    day1MaxHours: 96,
    now,
  });

  assert.equal(listCalls.length, 1, 'must execute Phase A and Phase B in a SINGLE bounded listUsers call');
  assert.deepEqual(listCalls[0], { page: 1, perPage: 100 });
  assert.equal(run1.sent, 1, 'Phase A Day-0 count must be preserved');
  assert.equal(run1.day1Sent, 2, 'Phase B Day-1 count must honor maxDay1Sends=2');
  assert.equal(run1.skipped, 8, 'all ineligible + capped users must be skipped cleanly');
  assert.deepEqual(run1.errors, []);

  assert.deepEqual(
    sentEmails.map((m) => m.to[0]),
    ['fresh@gmail.com', 'unverified-24h@gmail.com', 'unverified-60h@gmail.com'],
  );

  // Verify Day-1 email formatting, subject, headers & idempotency key
  const day1Email1 = sentEmails[1];
  assert.equal(day1Email1.from, ORGANIC_DRIP_FROM);
  assert.equal(day1Email1.idempotencyKey, 'organic-welcome-day1-day1-1');
  assert.deepEqual(day1Email1.headers, { 'List-Unsubscribe': `<${ORGANIC_DRIP_UNSUBSCRIBE_URL}>` });
  assert.match(day1Email1.subject, /1-Minute Challenge: Beat The Solver On This BTN 3-Bet Spot/);
  assert.match(day1Email1.html, /Free 30-Day VIP \+ 500 Diamonds On Phone Verify/);
  assert.doesNotMatch(day1Email1.html + day1Email1.text, /[—–]/);

  // Verify metadata stamped with organic_day1_sent_at while preserving organic_welcome_sent_at & prior keys
  const day1Stamp1 = updateCalls.find((c) => c.id === 'day1-1');
  assert.ok(day1Stamp1, 'day1-1 must be stamped via updateUserById');
  assert.equal(day1Stamp1.payload.user_metadata.organic_day1_sent_at, '2026-11-28T12:00:00.000Z');
  assert.equal(day1Stamp1.payload.user_metadata.organic_welcome_sent_at, hoursAgo(24));
  assert.equal(day1Stamp1.payload.user_metadata.first_name, 'Elena');

  // Run 2: uncapped -> day1-1 and day1-2 skipped idempotently, day1-3 now sends!
  const run2 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxSends: 20,
    maxDay1Sends: 20,
    windowHours: 48,
    day1MinHours: 20,
    day1MaxHours: 96,
    now,
  });
  assert.equal(listCalls.length, 2, 'run 2 issues exactly 1 bounded listUsers call');
  assert.equal(run2.sent, 0);
  assert.equal(run2.day1Sent, 1, 'only previously capped day1-3 should send on run 2');
  assert.equal(sentEmails.length, 4);
  assert.equal(sentEmails[3].to[0], 'unverified-36h@gmail.com');
  assert.equal(sentEmails[3].idempotencyKey, 'organic-welcome-day1-day1-3');

  // Run 3: 100% idempotent no-op
  const run3 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxSends: 20,
    maxDay1Sends: 20,
    windowHours: 48,
    day1MinHours: 20,
    day1MaxHours: 96,
    now,
  });
  assert.equal(run3.sent, 0);
  assert.equal(run3.day1Sent, 0);
  assert.equal(run3.skipped, usersStore.length);
  assert.deepEqual(run3.errors, []);

  // Failed Day-1 send must NOT stamp organic_day1_sent_at and must NEVER leak raw email
  let stampedDay1OnFail = false;
  const failDay1Sb = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              {
                id: 'fail-day1-u1',
                email: 'private-day1@gmail.com',
                created_at: hoursAgo(30),
                user_metadata: {
                  acquisition_landing_path: '/tools/preflop-ranges',
                  organic_welcome_sent_at: hoursAgo(24),
                },
              },
            ],
          },
          error: null,
        }),
        updateUserById: async () => {
          stampedDay1OnFail = true;
          return { data: {}, error: null };
        },
      },
    },
  };
  const failRun = await runOrganicWelcomeDrip(failDay1Sb, {
    sendEmail: async () => ({ ok: false, error: 'resend 429 rate limited' }),
    now,
  });
  assert.equal(failRun.sent, 0);
  assert.equal(failRun.day1Sent, 0);
  assert.equal(stampedDay1OnFail, false, 'must NOT stamp organic_day1_sent_at on failed send');
  assert.equal(failRun.errors.length, 1);
  assert.doesNotMatch(JSON.stringify(failRun), /private-day1@gmail\.com/, 'must never leak raw email in errors');
});

test('OTC TIER 5 LAW 2 — signup-welcome-back.js passes Day-1 options to runOrganicWelcomeDrip without adding any net-new cron route', () => {
  const cronSrc = read('pages/api/cron/signup-welcome-back.js');
  assert.match(cronSrc, /maxDay1Sends:\s*20/);
  assert.match(cronSrc, /day1MinHours:\s*20/);
  assert.match(cronSrc, /day1MaxHours:\s*96/);
  const cronDirFiles = fs.readdirSync(path.join(ROOT, 'pages/api/cron'));
  assert.ok(
    !cronDirFiles.some((f) => /day1|organic.*drip/i.test(f)),
    'must ride inside signup-welcome-back.js with ZERO net-new cron routes',
  );
});

test('OTC TIER 5 LAW 3 — All 5 upgraded/new BOFU tool switchers satisfy SEO, GEO, 4-FAQ, HTTPS citation, zero-dash & llms-full.txt parity laws', () => {
  assert.ok(
    COMPARE_PAGES.length >= 38,
    `COMPARE_PAGES must contain >= 38 entries (got ${COMPARE_PAGES.length})`,
  );
  const routes = compareRoutes();
  const llmsFull = read('public/llms-full.txt');
  const seenSlugs = new Set(COMPARE_PAGES.map((p) => p.slug));
  assert.equal(seenSlugs.size, COMPARE_PAGES.length, 'COMPARE_PAGES slugs must remain 100% unique');

  for (const slug of TIER5_BOFU_SLUGS) {
    const page = getComparePage(slug);
    assert.ok(page, `Tier 5 BOFU switcher "${slug}" must exist in COMPARE_PAGES`);
    assert.ok(routes.includes(`/compare/${slug}`), `/compare/${slug} must appear in compareRoutes()`);
    assert.ok(fitsInAResult(page.title), `${slug} title "${page.title}" must fit <= 60 chars`);
    assert.ok(
      page.description.length >= 70 && page.description.length <= 158,
      `${slug} description length ${page.description.length} must be 70..158`,
    );

    const summaryWords = page.summary.text.trim().split(/\s+/).length;
    assert.ok(summaryWords >= 40, `${slug} GEO opener must be >= 40 words (got ${summaryWords})`);
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
