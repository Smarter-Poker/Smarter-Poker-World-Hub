/**
 * OTC TIER 6: DAY-3 VIP URGENCY DRIP & REAL SAVED SERIES EVENT REMINDERS FORTRESS (2026-11-28)
 * ============================================================================================
 * Permanent regression locks for Playbook Part 3.2 (Lines 153-154):
 *   1. `buildDay3VipUrgencyEmail`: crisp, zero-em-dash, zero-gold, zero-PII, Title-Case
 *      Day-3 urgency email across all 6 canonical tracks deep-linking to
 *      `${origin}/hub/verify-phone?welcome=1&src=organic-day3-vip` with track-contextualized
 *      benefits and 15-second claim messaging.
 *   2. `buildSeriesEventReminderEmail`: crisp, zero-em-dash, HTML-escaped tournament reminder
 *      email for `sp_saved_spots_v1` (`kind === 'series-reminder'`) with primary CTA back to
 *      `${origin}${safePath}` and secondary CTA `${origin}/hub/bankroll-manager?src=series-reminder`
 *      ("Log Your Buy-In & Track Your Session Free").
 *   3. `runOrganicWelcomeDrip` Phase C (Day-3 VIP urgency, 68h..168h, unverified, capped,
 *      idempotent `organic_day3_sent_at`) AND Phase D (saved series event reminders for ANY
 *      non-synthetic user inside `[nowMs, nowMs + reminderLeadHours * 3_600_000]`, stamping
 *      `reminded_at` onto that exact spot without clobbering sibling spots or metadata) in
 *      the SAME single bounded `listUsers({ page: 1, perPage: 100 })` pass while preserving
 *      100% of Phase A and Phase B behavior.
 *   4. `pages/api/cron/signup-welcome-back.js` wiring with ZERO net-new cron routes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ORGANIC_ACTIVATION_TRACKS,
  buildDay3VipUrgencyEmail,
  buildSeriesEventReminderEmail,
} from '../src/lib/seo/organicWelcomeDrip.mjs';
import {
  ORGANIC_DRIP_FROM,
  ORGANIC_DRIP_UNSUBSCRIBE_URL,
  runOrganicWelcomeDrip,
} from '../src/lib/seo/organicWelcomeDripRunner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BANNED_GOLD_RE = /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15|d4af37|d4a853|f2b84b)\b/i;

test('OTC TIER 6 LAW 1 — buildDay3VipUrgencyEmail covers all 6 tracks with deep link, 15s claim copy, track benefits, zero dashes, zero gold, and zero PII', () => {
  const seenCardBodies = new Set();

  for (const track of ORGANIC_ACTIVATION_TRACKS) {
    const email = buildDay3VipUrgencyEmail({
      track,
      firstName: 'Jordan',
      siteUrl: 'https://smarter.poker/extra-path-ignored/',
    });

    assert.equal(email.track, track);
    assert.equal(email.ctaUrl, 'https://smarter.poker/hub/verify-phone?welcome=1&src=organic-day3-vip');
    assert.ok(email.subject.length > 15, `subject must be non-empty for ${track}`);
    assert.ok(email.html.length > 250, `html must be non-empty for ${track}`);
    assert.ok(email.text.length > 120, `text must be non-empty for ${track}`);

    assert.match(email.subject, /Free 30-Day VIP \+ 500 Diamonds/i);
    assert.match(email.html, /15 seconds/i);
    assert.match(email.text, /15 seconds/i);
    assert.match(email.html, /Free 30-Day VIP \+ 500 Diamonds On Phone Verify/);
    assert.match(email.text, /Free 30-Day VIP \+ 500 Diamonds On Phone Verify/);
    assert.ok(
      email.html.includes('https://smarter.poker/hub/verify-phone?welcome=1&amp;src=organic-day3-vip'),
      `html must contain escaped Day-3 verify CTA for ${track}`,
    );
    assert.ok(email.text.includes(email.ctaUrl), `text must include ctaUrl for ${track}`);

    assert.doesNotMatch(email.subject, /[—–]/, `Day-3 subject for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(email.html, /[—–]/, `Day-3 html for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(email.text, /[—–]/, `Day-3 text for ${track} must have zero em/en dashes`);
    assert.doesNotMatch(email.html, BANNED_GOLD_RE, `Day-3 html for ${track} must have zero banned gold hexes`);

    seenCardBodies.add(email.text);
  }

  assert.equal(
    seenCardBodies.size,
    ORGANIC_ACTIVATION_TRACKS.length,
    'each of the 6 tracks must render distinct track-contextualized Day-3 benefit copy',
  );

  // Unknown track falls back safely to general-hub, and email-like firstName never leaks PII
  const fallback = buildDay3VipUrgencyEmail({
    track: 'unknown-track-xyz',
    firstName: 'secret-player@gmail.com',
  });
  assert.equal(fallback.track, 'general-hub');
  assert.doesNotMatch(fallback.html, /secret-player@gmail\.com/);
  assert.doesNotMatch(fallback.text, /secret-player@gmail\.com/);
  assert.match(fallback.text, /Hi Player,/);
});

test('OTC TIER 6 LAW 2 — buildSeriesEventReminderEmail renders safe CTAs, escapes untrusted HTML, strips em dashes, and links Bankroll Manager', () => {
  const email = buildSeriesEventReminderEmail({
    spot: {
      kind: 'series-reminder',
      label: 'Event #14: $1,500 NLH DeepStack — <script>alert("xss")</script>',
      path: '/hub/series/468?utm_hack=1',
      eventDate: '2026-11-28T14:00:00Z',
      venue: 'Venetian "Poker" Room & Lounge',
      seriesName: 'DeepStack Showdown — 2026',
    },
    firstName: '<b>Taylor</b>',
    siteUrl: 'https://smarter.poker/',
  });

  assert.equal(email.ctaUrl, 'https://smarter.poker/hub/series/468');
  assert.equal(email.bankrollUrl, 'https://smarter.poker/hub/bankroll-manager?src=series-reminder');
  assert.ok(email.html.includes('Log Your Buy-In &amp; Track Your Session Free'));
  assert.ok(email.text.includes('Log Your Buy-In & Track Your Session Free'));
  assert.ok(email.html.includes('https://smarter.poker/hub/series/468'));
  assert.ok(email.html.includes('https://smarter.poker/hub/bankroll-manager?src=series-reminder'));
  assert.ok(email.text.includes(email.ctaUrl));
  assert.ok(email.text.includes(email.bankrollUrl));

  // HTML escaping & zero-dash enforcement
  assert.doesNotMatch(email.html, /<script/i, 'must escape raw <script> tags in html');
  assert.match(email.html, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
  assert.match(email.html, /Venetian &quot;Poker&quot; Room &amp; Lounge/);
  assert.doesNotMatch(email.html, /<b>Taylor<\/b>/);
  assert.doesNotMatch(email.subject, /[—–]/);
  assert.doesNotMatch(email.html, /[—–]/);
  assert.doesNotMatch(email.text, /[—–]/);
  assert.doesNotMatch(email.html, BANNED_GOLD_RE);

  // Unsafe spot.path falls back to /hub/poker-series; startDate also works
  const unsafePathEmail = buildSeriesEventReminderEmail({
    spot: {
      kind: 'series-reminder',
      label: 'WPT Prime Main Event',
      path: 'javascript:alert(1)',
      startDate: '2026-11-28T16:30:00Z',
      seriesName: 'WPT Prime Championship',
    },
    firstName: 'private@example.com',
  });
  assert.equal(unsafePathEmail.ctaUrl, 'https://smarter.poker/hub/poker-series');
  assert.doesNotMatch(unsafePathEmail.html, /javascript:/i);
  assert.doesNotMatch(unsafePathEmail.html, /private@example\.com/);
  assert.match(unsafePathEmail.text, /WPT Prime Main Event/);
  assert.match(unsafePathEmail.text, /WPT Prime Championship/);
});

test('OTC TIER 6 LAW 3 — runOrganicWelcomeDrip Phase C (Day-3 VIP urgency) enforces 68h-168h window, phone_verified skip, idempotency, cap, metadata preservation, and single listUsers pass', async () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  const hoursAgo = (h) => new Date(now - h * 3_600_000).toISOString();

  const usersStore = [
    // Phase C eligible #1: exact lower boundary 68h, unverified, Day-1 already sent
    {
      id: 'd3-low-68h',
      email: 'day3-68h@gmail.com',
      created_at: hoursAgo(70),
      user_metadata: {
        first_name: 'Maya',
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(68),
        organic_welcome_track: 'gto-ranges',
        organic_day1_sent_at: hoursAgo(44),
        custom_keep: 'preserve-me',
      },
    },
    // Phase C eligible #2: exact upper boundary 168h, unverified, Day-1 already sent
    {
      id: 'd3-high-168h',
      email: 'day3-168h@gmail.com',
      created_at: hoursAgo(170),
      user_metadata: {
        full_name: 'Devon Grinder',
        unlock_key: 'gto-leak-finder',
        organic_welcome_sent_at: hoursAgo(168),
        organic_welcome_track: 'gto-leak-finder',
        organic_day1_sent_at: hoursAgo(140),
        phone_verified: false,
      },
    },
    // Phase C eligible #3: 90h -> capped when maxDay3Sends = 2
    {
      id: 'd3-capped-90h',
      email: 'day3-90h@gmail.com',
      created_at: hoursAgo(92),
      user_metadata: {
        username: 'LiamLive',
        acquisition_landing_path: '/hub/poker-near-me/lobby',
        organic_welcome_sent_at: hoursAgo(90),
        organic_welcome_track: 'live-venues',
        organic_day1_sent_at: hoursAgo(66),
      },
    },
    // Phase C skip: too early (67h < 68h)
    {
      id: 'd3-too-early',
      email: 'early-67h@gmail.com',
      created_at: hoursAgo(68),
      user_metadata: {
        first_name: 'Early',
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(67),
        organic_day1_sent_at: hoursAgo(43),
      },
    },
    // Phase C skip: too old (169h > 168h)
    {
      id: 'd3-too-old',
      email: 'old-169h@gmail.com',
      created_at: hoursAgo(172),
      user_metadata: {
        first_name: 'TooOld',
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(169),
        organic_day1_sent_at: hoursAgo(140),
      },
    },
    // Phase C skip: phone_verified === true
    {
      id: 'd3-verified',
      email: 'verified-d3@gmail.com',
      created_at: hoursAgo(80),
      user_metadata: {
        first_name: 'Verified',
        acquisition_landing_path: '/tools/poker-odds-calculator',
        organic_welcome_sent_at: hoursAgo(75),
        organic_day1_sent_at: hoursAgo(50),
        phone_verified: true,
      },
    },
    // Phase C skip: already sent organic_day3_sent_at
    {
      id: 'd3-already',
      email: 'already-d3@gmail.com',
      created_at: hoursAgo(85),
      user_metadata: {
        first_name: 'Done',
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(80),
        organic_day1_sent_at: hoursAgo(55),
        organic_day3_sent_at: hoursAgo(10),
      },
    },
    // Phase C skip: synthetic probe
    {
      id: 'd3-probe',
      email: 'probe-d3@gmail.com',
      created_at: hoursAgo(80),
      user_metadata: {
        signup_probe: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(75),
        organic_day1_sent_at: hoursAgo(50),
      },
    },
    // Phase C skip: @example.invalid
    {
      id: 'd3-invalid',
      email: 'synthetic-d3@example.invalid',
      created_at: hoursAgo(80),
      user_metadata: {
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(75),
        organic_day1_sent_at: hoursAgo(50),
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

  // Run 1: cap at maxDay3Sends = 2
  const run1 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxDay3Sends: 2,
    day3MinHours: 68,
    day3MaxHours: 168,
    now,
  });

  assert.equal(listCalls.length, 1, 'must execute in ONE bounded listUsers call');
  assert.deepEqual(listCalls[0], { page: 1, perPage: 100 });
  assert.equal(run1.sent, 0);
  assert.equal(run1.day1Sent, 0);
  assert.equal(run1.day3Sent, 2);
  assert.equal(run1.remindersSent, 0);
  assert.equal(run1.skipped, 7);
  assert.deepEqual(run1.errors, []);

  assert.deepEqual(
    sentEmails.map((m) => m.to[0]),
    ['day3-68h@gmail.com', 'day3-168h@gmail.com'],
  );
  assert.equal(sentEmails[0].from, ORGANIC_DRIP_FROM);
  assert.equal(sentEmails[0].idempotencyKey, 'organic-welcome-day3-d3-low-68h');
  assert.equal(sentEmails[1].idempotencyKey, 'organic-welcome-day3-d3-high-168h');
  assert.deepEqual(sentEmails[0].headers, { 'List-Unsubscribe': `<${ORGANIC_DRIP_UNSUBSCRIBE_URL}>` });
  assert.ok(sentEmails[0].text.includes('/hub/verify-phone?welcome=1&src=organic-day3-vip'));
  assert.doesNotMatch(sentEmails[0].html + sentEmails[0].text, /[—–]/);

  // Metadata stamped without clobbering prior fields
  const stamp0 = updateCalls.find((c) => c.id === 'd3-low-68h');
  assert.ok(stamp0);
  assert.equal(stamp0.payload.user_metadata.organic_day3_sent_at, '2026-11-28T12:00:00.000Z');
  assert.equal(stamp0.payload.user_metadata.organic_welcome_sent_at, hoursAgo(68));
  assert.equal(stamp0.payload.user_metadata.organic_day1_sent_at, hoursAgo(44));
  assert.equal(stamp0.payload.user_metadata.custom_keep, 'preserve-me');

  // Run 2: uncapped -> only d3-capped-90h sends
  const run2 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxDay3Sends: 20,
    day3MinHours: 68,
    day3MaxHours: 168,
    now,
  });
  assert.equal(listCalls.length, 2);
  assert.equal(run2.day3Sent, 1);
  assert.equal(sentEmails[2].to[0], 'day3-90h@gmail.com');
  assert.equal(sentEmails[2].idempotencyKey, 'organic-welcome-day3-d3-capped-90h');

  // Run 3: 100% idempotent no-op
  const run3 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxDay3Sends: 20,
    day3MinHours: 68,
    day3MaxHours: 168,
    now,
  });
  assert.equal(run3.day3Sent, 0);
  assert.equal(run3.skipped, usersStore.length);
  assert.deepEqual(run3.errors, []);

  // Failed Day-3 send must NOT stamp and must NEVER leak raw email
  let stampedDay3OnFail = false;
  const failDay3Sb = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              {
                id: 'fail-day3-u1',
                email: 'private-day3@gmail.com',
                created_at: hoursAgo(80),
                user_metadata: {
                  acquisition_landing_path: '/tools/preflop-ranges',
                  organic_welcome_sent_at: hoursAgo(75),
                  organic_day1_sent_at: hoursAgo(50),
                },
              },
            ],
          },
          error: null,
        }),
        updateUserById: async () => {
          stampedDay3OnFail = true;
          return { data: {}, error: null };
        },
      },
    },
  };
  const failRun = await runOrganicWelcomeDrip(failDay3Sb, {
    sendEmail: async () => ({ ok: false, error: 'resend 500 upstream' }),
    now,
  });
  assert.equal(failRun.day3Sent, 0);
  assert.equal(stampedDay3OnFail, false);
  assert.equal(failRun.errors.length, 1);
  assert.doesNotMatch(JSON.stringify(failRun), /private-day3@gmail\.com/);
});

test('OTC TIER 6 LAW 4 — runOrganicWelcomeDrip Phase D dispatches upcoming saved series reminders for ANY non-synthetic user, preserves sibling spots, enforces lead window/idempotency/cap, and shares the single listUsers pass', async () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  const hoursFromNow = (h) => new Date(now + h * 3_600_000).toISOString();
  const hoursAgo = (h) => new Date(now - h * 3_600_000).toISOString();

  const usersStore = [
    // Phase D #1: NON-ORGANIC + phone_verified user with T-2h upcoming reminder + sibling spots
    {
      id: 'rem-verified-direct',
      email: 'verified-direct@gmail.com',
      created_at: hoursAgo(200),
      user_metadata: {
        first_name: 'Riley',
        phone_verified: true,
        sp_saved_spots_v1: [
          {
            id: 'calc-spot-1',
            kind: 'calculator-spot',
            label: 'AA vs KK Equity',
            path: '/tools/odds/aa-vs-kk',
          },
          {
            id: 'wsop-ev-14',
            kind: 'series-reminder',
            label: 'WSOP Event #14 <script>bad()</script> — $1,500 NLH',
            path: '/hub/series/wsop-2026',
            eventDate: hoursFromNow(2),
            venue: 'Horseshoe Las Vegas',
            seriesName: 'WSOP 2026',
          },
          {
            id: 'wsop-ev-99-far',
            kind: 'series-reminder',
            label: 'WSOP Main Event Next Week',
            path: '/hub/series/wsop-2026',
            eventDate: hoursFromNow(72),
            venue: 'Horseshoe Las Vegas',
          },
          {
            id: 'wsop-ev-01-past',
            kind: 'series-reminder',
            label: 'Past Event Already Started',
            path: '/hub/series/wsop-2026',
            eventDate: hoursAgo(1),
          },
          {
            id: 'wsop-ev-05-done',
            kind: 'series-reminder',
            label: 'Already Reminded Event',
            path: '/hub/series/wsop-2026',
            eventDate: hoursFromNow(4),
            reminded_at: hoursAgo(2),
          },
        ],
      },
    },
    // Phase D #2 + Phase A in SAME pass: brand-new organic user with T-18h startDate reminder!
    {
      id: 'rem-and-day0',
      email: 'combo-user@gmail.com',
      created_at: hoursAgo(2),
      user_metadata: {
        first_name: 'Sasha',
        acquisition_landing_path: '/hub/series/468',
        sp_saved_spots_v1: [
          {
            id: 'venetian-468-e3',
            kind: 'series-reminder',
            label: 'DeepStack Event #3',
            path: '/hub/series/468',
            startDate: hoursFromNow(18),
            venue: 'Venetian Las Vegas',
          },
        ],
      },
    },
    // Phase D #3: already finished Day-0/1/3 organic user with T-6h reminder -> capped when maxReminderSends = 2
    {
      id: 'rem-capped',
      email: 'capped-rem@gmail.com',
      created_at: hoursAgo(180),
      user_metadata: {
        first_name: 'Chris',
        acquisition_landing_path: '/hub/series/wpt-prime',
        organic_welcome_sent_at: hoursAgo(178),
        organic_day1_sent_at: hoursAgo(150),
        organic_day3_sent_at: hoursAgo(100),
        sp_saved_spots_v1: [
          {
            id: 'wpt-prime-f1',
            kind: 'series-reminder',
            label: 'WPT Prime Flight 1A',
            path: '/hub/series/wpt-prime',
            eventDate: hoursFromNow(6),
            seriesName: 'WPT Prime',
          },
        ],
      },
    },
    // Phase D skip: synthetic probe with due reminder
    {
      id: 'rem-probe',
      email: 'probe-rem@gmail.com',
      created_at: hoursAgo(5),
      user_metadata: {
        signup_probe: true,
        sp_saved_spots_v1: [
          {
            id: 'probe-ev',
            kind: 'series-reminder',
            label: 'Probe Event',
            path: '/hub/series/1',
            eventDate: hoursFromNow(2),
          },
        ],
      },
    },
    // Phase D skip: @example.invalid with due reminder
    {
      id: 'rem-invalid',
      email: 'fake-rem@example.invalid',
      created_at: hoursAgo(5),
      user_metadata: {
        sp_saved_spots_v1: [
          {
            id: 'invalid-ev',
            kind: 'series-reminder',
            label: 'Invalid Event',
            path: '/hub/series/2',
            eventDate: hoursFromNow(2),
          },
        ],
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

  // Run 1: maxReminderSends = 2 -> sends rem-verified-direct (Phase D), rem-and-day0 (Phase A + Phase D), caps rem-capped
  const run1 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxSends: 20,
    maxReminderSends: 2,
    reminderLeadHours: 24,
    now,
  });

  assert.equal(listCalls.length, 1, 'Phases A, B, C, and D MUST share ONE single bounded listUsers call');
  assert.deepEqual(listCalls[0], { page: 1, perPage: 100 });
  assert.equal(run1.sent, 1, 'Phase A Day-0 still runs for combo user');
  assert.equal(run1.day1Sent, 0);
  assert.equal(run1.day3Sent, 0);
  assert.equal(run1.remindersSent, 2, 'Phase D must honor maxReminderSends=2');
  assert.equal(run1.skipped, 3, 'capped + synthetic probe + @example.invalid skipped cleanly');
  assert.deepEqual(run1.errors, []);

  // Verify reminder #1 HTML escaping, zero dashes, idempotencyKey, and Bankroll Manager CTA
  const rem1 = sentEmails.find((m) => m.to[0] === 'verified-direct@gmail.com');
  assert.ok(rem1);
  assert.equal(rem1.idempotencyKey, 'series-event-reminder-rem-verified-direct-wsop-ev-14');
  assert.doesNotMatch(rem1.html, /<script/i);
  assert.match(rem1.html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(rem1.subject + rem1.html + rem1.text, /[—–]/);
  assert.ok(rem1.text.includes('https://smarter.poker/hub/series/wsop-2026'));
  assert.ok(rem1.text.includes('https://smarter.poker/hub/bankroll-manager?src=series-reminder'));

  // Verify sibling spots & user metadata preserved intact on rem-verified-direct
  const user1Meta = usersStore[0].user_metadata;
  assert.equal(user1Meta.phone_verified, true);
  assert.equal(user1Meta.first_name, 'Riley');
  assert.equal(user1Meta.sp_saved_spots_v1.length, 5, 'must preserve ALL sibling spots');
  assert.equal(user1Meta.sp_saved_spots_v1[0].id, 'calc-spot-1');
  assert.equal(user1Meta.sp_saved_spots_v1[0].reminded_at, undefined);
  assert.equal(user1Meta.sp_saved_spots_v1[1].reminded_at, '2026-11-28T12:00:00.000Z');
  assert.equal(user1Meta.sp_saved_spots_v1[2].reminded_at, undefined, 'far-future spot must stay unreminded');
  assert.equal(user1Meta.sp_saved_spots_v1[3].reminded_at, undefined, 'past spot must stay unreminded');
  assert.equal(user1Meta.sp_saved_spots_v1[4].reminded_at, hoursAgo(2), 'prior reminded_at must stay untouched');

  // Verify combo user preserved BOTH Phase A organic_welcome_sent_at AND Phase D spot reminded_at!
  const comboMeta = usersStore[1].user_metadata;
  assert.equal(comboMeta.organic_welcome_sent_at, '2026-11-28T12:00:00.000Z');
  assert.equal(comboMeta.organic_welcome_track, 'series-reminder');
  assert.equal(comboMeta.sp_saved_spots_v1[0].reminded_at, '2026-11-28T12:00:00.000Z');

  // Run 2: uncapped -> only rem-capped sends
  const run2 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxReminderSends: 20,
    reminderLeadHours: 24,
    now,
  });
  assert.equal(listCalls.length, 2);
  assert.equal(run2.sent, 0);
  assert.equal(run2.remindersSent, 1);
  const rem3 = sentEmails[sentEmails.length - 1];
  assert.equal(rem3.to[0], 'capped-rem@gmail.com');
  assert.equal(rem3.idempotencyKey, 'series-event-reminder-rem-capped-wpt-prime-f1');

  // Run 3: 100% idempotent no-op
  const run3 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxReminderSends: 20,
    reminderLeadHours: 24,
    now,
  });
  assert.equal(run3.sent, 0);
  assert.equal(run3.day1Sent, 0);
  assert.equal(run3.day3Sent, 0);
  assert.equal(run3.remindersSent, 0);
  assert.equal(run3.skipped, usersStore.length);
  assert.deepEqual(run3.errors, []);

  // Failed Phase D send must NOT stamp reminded_at and must NEVER leak raw email
  let stampedRemOnFail = false;
  const failRemSb = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              {
                id: 'fail-rem-u1',
                email: 'secret-rem@gmail.com',
                created_at: hoursAgo(10),
                user_metadata: {
                  sp_saved_spots_v1: [
                    {
                      id: 'ev-fail-1',
                      kind: 'series-reminder',
                      label: 'Main Event',
                      path: '/hub/series/999',
                      eventDate: hoursFromNow(2),
                    },
                  ],
                },
              },
            ],
          },
          error: null,
        }),
        updateUserById: async () => {
          stampedRemOnFail = true;
          return { data: {}, error: null };
        },
      },
    },
  };
  const failRun = await runOrganicWelcomeDrip(failRemSb, {
    sendEmail: async () => {
      throw new Error('smtp timeout');
    },
    now,
  });
  assert.equal(failRun.remindersSent, 0);
  assert.equal(stampedRemOnFail, false, 'must NOT stamp reminded_at when reminder send throws');
  assert.equal(failRun.errors.length, 1);
  assert.doesNotMatch(JSON.stringify(failRun), /secret-rem@gmail\.com/);
});

test('OTC TIER 6 LAW 5 — signup-welcome-back.js wires Day-3 and Series Reminder options inside isolated try/catch with ZERO net-new cron routes and zero em dashes', () => {
  const cronSrc = read('pages/api/cron/signup-welcome-back.js');
  assert.match(cronSrc, /maxDay3Sends:\s*20/);
  assert.match(cronSrc, /day3MinHours:\s*68/);
  assert.match(cronSrc, /day3MaxHours:\s*168/);
  assert.match(cronSrc, /maxReminderSends:\s*20/);
  assert.match(cronSrc, /reminderLeadHours:\s*24/);
  assert.match(cronSrc, /let organicDrip = null;\s*try\s*\{[\s\S]*?maxDay3Sends:\s*20[\s\S]*?reminderLeadHours:\s*24[\s\S]*?\}\s*catch\s*\(/);

  // Zero net-new cron routes (CLAUDE.md section 11)
  const cronDirFiles = fs.readdirSync(path.join(ROOT, 'pages/api/cron'));
  assert.ok(
    !cronDirFiles.some((f) => /day3|series-reminder|organic.*drip/i.test(f)),
    'must ride inside signup-welcome-back.js with ZERO net-new cron routes',
  );
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(
    !(vercel.crons || []).some((c) => /day3|series-reminder|organic.*drip/i.test(String(c.path || ''))),
    'vercel.json must not register any net-new drip or series-reminder cron route',
  );

  // Zero em/en dashes across all owned runtime source files
  for (const rel of [
    'src/lib/seo/organicWelcomeDrip.mjs',
    'src/lib/seo/organicWelcomeDripRunner.mjs',
    'pages/api/cron/signup-welcome-back.js',
  ]) {
    assert.doesNotMatch(read(rel), /[—–]/, `${rel} must contain zero em or en dashes`);
  }
});
