/**
 * OTC TIER 7: DAY-7 / DAY-21 HABIT DIGESTS, DAY-25 VIP TRIAL GRADUATION & PHASE D WEB PUSH MIRROR (2026-11-28)
 * =============================================================================================================
 * Permanent regression locks for:
 *   1. `buildHabitDigestEmail`: Day-7 ("Your 7-Day Smarter.Poker Study Progress & Next GTO Challenge")
 *      and Day-21 ("Your 21-Day Poker Study Check-In & Upcoming Local Games") across all 6 canonical
 *      tracks with safe HTML escaping, honest `savedSpotCount` (zero fabricated stats), Title Case,
 *      zero em/en dashes, zero banned gold hexes, and zero PII.
 *   2. `buildVipTrialGraduationEmail`: Day-25 VIP trial graduation email linking cleanly to
 *      `${origin}/hub/vip?src=vip-trial-day25` with honest `savedSpotCount`, zero fabricated stats,
 *      Title Case, zero em/en dashes, zero banned gold, and zero PII.
 *   3. `runOrganicWelcomeDrip` Phase E (Day-7 144h-336h, Day-21 480h-576h) and Phase F (Day-25 VIP
 *      576h-696h) for phone-verified organic users in the SAME single bounded
 *      `listUsers({ page: 1, perPage: 100 })` pass while 100% preserving Phases A-D.
 *   4. `runOrganicWelcomeDrip` Phase D Web Push Mirror (`sendPush({ userId, title, body, url, spotId })`)
 *      running in an isolated non-blocking `try/catch` where push success increments
 *      `summary.reminderPushesSent` and push failure NEVER fails email delivery or prevents stamping
 *      `reminded_at`.
 *   5. `pages/api/cron/signup-welcome-back.js` wiring with Phase E/F caps & windows + non-blocking
 *      Web Push mirror via `src/lib/notify.js` and ZERO net-new cron routes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ORGANIC_ACTIVATION_TRACKS,
  buildHabitDigestEmail,
  buildVipTrialGraduationEmail,
} from '../src/lib/seo/organicWelcomeDrip.mjs';
import {
  ORGANIC_DRIP_FROM,
  ORGANIC_DRIP_UNSUBSCRIBE_URL,
  runOrganicWelcomeDrip,
} from '../src/lib/seo/organicWelcomeDripRunner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BANNED_GOLD_RE = /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15|d4af37|d4a853|f2b84b|f5c542)\b/i;

test('OTC TIER 7 LAW 1 - buildHabitDigestEmail renders Day-7 and Day-21 digests across all 6 tracks with honest savedSpotCount, safe escaping, zero dashes, zero gold, and zero PII', () => {
  for (const phase of ['day7', 'day21']) {
    const seenCtas = new Set();
    const seenBodies = new Set();
    const expectedSubject =
      phase === 'day7'
        ? 'Your 7-Day Smarter.Poker Study Progress & Next GTO Challenge'
        : 'Your 21-Day Poker Study Check-In & Upcoming Local Games';

    for (const track of ORGANIC_ACTIVATION_TRACKS) {
      const email = buildHabitDigestEmail({
        phase,
        track,
        firstName: 'Jordan',
        savedSpotCount: 3,
        siteUrl: 'https://smarter.poker/ignored-path/',
      });

      assert.equal(email.phase, phase);
      assert.equal(email.track, track);
      assert.equal(email.subject, expectedSubject);
      assert.ok(email.html.length > 250, `${phase} html must be non-empty for ${track}`);
      assert.ok(email.text.length > 120, `${phase} text must be non-empty for ${track}`);
      assert.match(email.ctaUrl, new RegExp(`^https://smarter\\.poker/.*src=habit-${phase}&track=${track}$`));
      assert.ok(email.text.includes(email.ctaUrl), `${phase} text must include ctaUrl for ${track}`);
      assert.ok(email.text.includes('3 saved spots'), `${phase} must include honest savedSpotCount when > 0`);
      assert.ok(email.html.includes('3 saved spots'), `${phase} html must include honest savedSpotCount when > 0`);

      assert.doesNotMatch(email.subject, /[—–]/, `${phase} subject for ${track} must have zero em/en dashes`);
      assert.doesNotMatch(email.html, /[—–]/, `${phase} html for ${track} must have zero em/en dashes`);
      assert.doesNotMatch(email.text, /[—–]/, `${phase} text for ${track} must have zero em/en dashes`);
      assert.doesNotMatch(email.html, BANNED_GOLD_RE, `${phase} html for ${track} must have zero banned gold`);

      seenCtas.add(email.ctaUrl);
      seenBodies.add(email.text);
    }

    assert.equal(seenCtas.size, ORGANIC_ACTIVATION_TRACKS.length, `${phase} must produce distinct track-contextual CTAs`);
    assert.equal(seenBodies.size, ORGANIC_ACTIVATION_TRACKS.length, `${phase} must produce distinct track copy`);
  }

  // Zero saved spots: never fabricates counts or stats; singular 1 saved spot works cleanly
  const zeroEmail = buildHabitDigestEmail({
    phase: 'day7',
    track: 'gto-ranges',
    firstName: '<script>alert(1)</script>',
    savedSpotCount: 0,
  });
  assert.doesNotMatch(zeroEmail.html, /<script/i, 'must sanitize/escape raw HTML tags in firstName');
  assert.doesNotMatch(zeroEmail.text, /\b0 saved spots\b/i, 'must not emit awkward 0 saved spots copy');
  assert.doesNotMatch(zeroEmail.text, /\b\d+\s+(?:hands played|drills completed|day streak)\b/i, 'must never fabricate stats');

  const singularEmail = buildHabitDigestEmail({
    phase: 'day21',
    track: 'unknown-track',
    firstName: 'private-user@gmail.com',
    savedSpotCount: 1,
  });
  assert.equal(singularEmail.track, 'general-hub');
  assert.match(singularEmail.text, /\b1 saved spot\b/);
  assert.doesNotMatch(singularEmail.html + singularEmail.text, /private-user@gmail\.com/);
  assert.match(singularEmail.text, /Hi Player,/);
});

test('OTC TIER 7 LAW 2 - buildVipTrialGraduationEmail links to /hub/vip?src=vip-trial-day25 with honest savedSpotCount, zero fabricated stats, zero dashes, zero gold, and zero PII', () => {
  const email = buildVipTrialGraduationEmail({
    firstName: '<b>Alex</b>',
    savedSpotCount: 5,
    siteUrl: 'https://smarter.poker/extra/',
  });

  assert.equal(
    email.subject,
    'Your 30-Day Free VIP Access Wraps Up Soon - Keep Unlimited GTO & Live Tools',
  );
  assert.equal(email.ctaUrl, 'https://smarter.poker/hub/vip?src=vip-trial-day25');
  assert.ok(email.html.includes('https://smarter.poker/hub/vip?src=vip-trial-day25'));
  assert.ok(email.text.includes('https://smarter.poker/hub/vip?src=vip-trial-day25'));
  assert.ok(email.html.includes('5 saved spots'));
  assert.ok(email.text.includes('5 saved spots'));
  assert.doesNotMatch(email.html, /<b>Alex<\/b>/i);
  assert.doesNotMatch(email.subject + email.html + email.text, /[—–]/);
  assert.doesNotMatch(email.html, BANNED_GOLD_RE);

  const zeroEmail = buildVipTrialGraduationEmail({
    firstName: 'secret@example.com',
    savedSpotCount: 0,
  });
  assert.doesNotMatch(zeroEmail.html + zeroEmail.text, /secret@example\.com/);
  assert.match(zeroEmail.text, /Hi Player,/);
  assert.doesNotMatch(zeroEmail.text, /\b0 saved spots\b/i);
  assert.doesNotMatch(zeroEmail.text, /\b\d+\s+(?:hands played|drills completed|day streak)\b/i);
});

test('OTC TIER 7 LAW 3 - runOrganicWelcomeDrip Phase E (Day-7 & Day-21 Habit Digests) enforces windows, verified scoping, caps, idempotency, savedSpotCount, and single listUsers pass', async () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  const hoursAgo = (h) => new Date(now - h * 3_600_000).toISOString();

  const usersStore = [
    // Day-7 eligible #1: exact lower boundary 144h, verified, 2 saved spots
    {
      id: 'd7-low-144h',
      email: 'day7-144h@gmail.com',
      created_at: hoursAgo(146),
      user_metadata: {
        first_name: 'Maya',
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(144),
        organic_welcome_track: 'gto-ranges',
        sp_saved_spots_v1: [{ id: 's1' }, { id: 's2' }],
        keep_field: 'intact-d7',
      },
    },
    // Day-7 eligible #2: exact upper boundary 336h, verified, 0 saved spots
    {
      id: 'd7-high-336h',
      email: 'day7-336h@gmail.com',
      created_at: hoursAgo(340),
      user_metadata: {
        full_name: 'Devon Grinder',
        phone_verified: true,
        unlock_key: 'gto-leak-finder',
        organic_welcome_sent_at: hoursAgo(336),
        organic_welcome_track: 'gto-leak-finder',
      },
    },
    // Day-7 eligible #3: 200h -> capped when maxDay7Sends = 2
    {
      id: 'd7-capped-200h',
      email: 'day7-200h@gmail.com',
      created_at: hoursAgo(202),
      user_metadata: {
        username: 'LiamLive',
        phone_verified: true,
        acquisition_landing_path: '/hub/poker-near-me/lobby',
        organic_welcome_sent_at: hoursAgo(200),
        organic_welcome_track: 'live-venues',
      },
    },
    // Day-7 skip: unverified at 200h
    {
      id: 'd7-unverified',
      email: 'unverified-200h@gmail.com',
      created_at: hoursAgo(202),
      user_metadata: {
        phone_verified: false,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(200),
      },
    },
    // Day-7 skip: too early (143h)
    {
      id: 'd7-early-143h',
      email: 'early-143h@gmail.com',
      created_at: hoursAgo(145),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(143),
      },
    },
    // Day-7 skip: too old (337h)
    {
      id: 'd7-old-337h',
      email: 'old-337h@gmail.com',
      created_at: hoursAgo(340),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(337),
      },
    },
    // Day-7 skip: already stamped organic_day7_sent_at
    {
      id: 'd7-already',
      email: 'already-d7@gmail.com',
      created_at: hoursAgo(220),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(210),
        organic_day7_sent_at: hoursAgo(40),
      },
    },
    // Day-21 eligible #1: exact lower boundary 480h, verified, 4 saved spots
    {
      id: 'd21-low-480h',
      email: 'day21-480h@gmail.com',
      created_at: hoursAgo(482),
      user_metadata: {
        first_name: 'Nora',
        phone_verified: true,
        acquisition_landing_path: '/tools/poker-odds-calculator',
        organic_welcome_sent_at: hoursAgo(480),
        organic_welcome_track: 'odds-calculator',
        organic_day7_sent_at: hoursAgo(300),
        sp_saved_spots_v1: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      },
    },
    // Day-21 eligible #2: exact upper boundary 576h -> capped when maxDay21Sends = 1
    {
      id: 'd21-high-576h',
      email: 'day21-576h@gmail.com',
      created_at: hoursAgo(580),
      user_metadata: {
        first_name: 'Owen',
        phone_verified: true,
        acquisition_landing_path: '/hub/poker-series',
        organic_welcome_sent_at: hoursAgo(576),
        organic_welcome_track: 'series-reminder',
        organic_day7_sent_at: hoursAgo(400),
      },
    },
    // Day-21 skip: too early (479h)
    {
      id: 'd21-early-479h',
      email: 'early-479h@gmail.com',
      created_at: hoursAgo(482),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(479),
      },
    },
    // Skip: synthetic probe and @example.invalid
    {
      id: 'd7-probe',
      email: 'probe-d7@gmail.com',
      created_at: hoursAgo(200),
      user_metadata: {
        signup_probe: true,
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(190),
      },
    },
    {
      id: 'd21-invalid',
      email: 'fake-d21@example.invalid',
      created_at: hoursAgo(500),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(495),
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

  // Run 1: maxDay7Sends = 2, maxDay21Sends = 1
  const run1 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxDay7Sends: 2,
    maxDay21Sends: 1,
    maxDay25VipSends: 0,
    now,
  });

  assert.equal(listCalls.length, 1, 'Phase E MUST share ONE bounded listUsers call');
  assert.deepEqual(listCalls[0], { page: 1, perPage: 100 });
  assert.equal(run1.sent, 0);
  assert.equal(run1.day1Sent, 0);
  assert.equal(run1.day3Sent, 0);
  assert.equal(run1.day7Sent, 2);
  assert.equal(run1.day21Sent, 1);
  assert.equal(run1.day25VipSent, 0);
  assert.equal(run1.remindersSent, 0);
  assert.equal(run1.reminderPushesSent, 0);
  assert.equal(run1.skipped, 9);
  assert.deepEqual(run1.errors, []);

  assert.deepEqual(
    sentEmails.map((m) => m.to[0]),
    ['day7-144h@gmail.com', 'day7-336h@gmail.com', 'day21-480h@gmail.com'],
  );
  assert.equal(sentEmails[0].idempotencyKey, 'organic-habit-day7-d7-low-144h');
  assert.equal(sentEmails[0].from, ORGANIC_DRIP_FROM);
  assert.deepEqual(sentEmails[0].headers, { 'List-Unsubscribe': `<${ORGANIC_DRIP_UNSUBSCRIBE_URL}>` });
  assert.match(sentEmails[0].text, /2 saved spots/);
  assert.equal(sentEmails[1].idempotencyKey, 'organic-habit-day7-d7-high-336h');
  assert.doesNotMatch(sentEmails[1].text, /\b0 saved spots\b/i);
  assert.equal(sentEmails[2].idempotencyKey, 'organic-habit-day21-d21-low-480h');
  assert.match(sentEmails[2].text, /4 saved spots/);

  const stampD7 = updateCalls.find((c) => c.id === 'd7-low-144h');
  assert.equal(stampD7.payload.user_metadata.organic_day7_sent_at, '2026-11-28T12:00:00.000Z');
  assert.equal(stampD7.payload.user_metadata.keep_field, 'intact-d7');

  // Run 2: uncapped -> d7-capped-200h and d21-high-576h send cleanly
  const run2 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxDay7Sends: 20,
    maxDay21Sends: 20,
    maxDay25VipSends: 0,
    now,
  });
  assert.equal(listCalls.length, 2);
  assert.equal(run2.day7Sent, 1);
  assert.equal(run2.day21Sent, 1);
  assert.equal(sentEmails[3].idempotencyKey, 'organic-habit-day7-d7-capped-200h');
  assert.equal(sentEmails[4].idempotencyKey, 'organic-habit-day21-d21-high-576h');

  // Run 3: 100% idempotent no-op
  const run3 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxDay7Sends: 20,
    maxDay21Sends: 20,
    maxDay25VipSends: 0,
    now,
  });
  assert.equal(run3.day7Sent, 0);
  assert.equal(run3.day21Sent, 0);
  assert.equal(run3.skipped, usersStore.length);
  assert.deepEqual(run3.errors, []);

  // Failed Day-7 send must NOT stamp and must NEVER leak raw email
  let stampedFail = false;
  const failSb = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              {
                id: 'fail-d7-u1',
                email: 'secret-d7@gmail.com',
                created_at: hoursAgo(200),
                user_metadata: {
                  phone_verified: true,
                  acquisition_landing_path: '/tools/preflop-ranges',
                  organic_welcome_sent_at: hoursAgo(180),
                },
              },
            ],
          },
          error: null,
        }),
        updateUserById: async () => {
          stampedFail = true;
          return { data: {}, error: null };
        },
      },
    },
  };
  const failRun = await runOrganicWelcomeDrip(failSb, {
    sendEmail: async () => ({ ok: false, error: 'resend 503' }),
    now,
  });
  assert.equal(failRun.day7Sent, 0);
  assert.equal(stampedFail, false);
  assert.equal(failRun.errors.length, 1);
  assert.doesNotMatch(JSON.stringify(failRun), /secret-d7@gmail\.com/);
});

test('OTC TIER 7 LAW 4 - runOrganicWelcomeDrip Phase F (Day-25 VIP Trial Graduation) enforces 576h-696h window, phone_verified===true, cap, idempotency, and welcome/created_at fallback', async () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  const hoursAgo = (h) => new Date(now - h * 3_600_000).toISOString();

  const usersStore = [
    // Eligible #1: exact lower boundary 576h, verified, Day-21 already sent
    {
      id: 'vip-low-576h',
      email: 'vip-576h@gmail.com',
      created_at: hoursAgo(578),
      user_metadata: {
        first_name: 'Claire',
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(576),
        organic_day7_sent_at: hoursAgo(400),
        organic_day21_sent_at: hoursAgo(60),
        sp_saved_spots_v1: [{ id: 'spot-1' }, { id: 'spot-2' }, { id: 'spot-3' }],
        preserve_vip: 'yes',
      },
    },
    // Eligible #2: exact upper boundary 696h via created_at fallback (no organic_welcome_sent_at)
    {
      id: 'vip-high-696h',
      email: 'vip-696h@gmail.com',
      created_at: hoursAgo(696),
      user_metadata: {
        first_name: 'Marcus',
        phone_verified: true,
        unlock_key: 'gto-leak-finder',
      },
    },
    // Eligible #3: 620h -> capped when maxDay25VipSends = 2
    {
      id: 'vip-capped-620h',
      email: 'vip-620h@gmail.com',
      created_at: hoursAgo(622),
      user_metadata: {
        first_name: 'Priya',
        phone_verified: true,
        acquisition_landing_path: '/hub/poker-series',
        organic_welcome_sent_at: hoursAgo(620),
        organic_day21_sent_at: hoursAgo(100),
      },
    },
    // Skip: unverified at 620h
    {
      id: 'vip-unverified',
      email: 'unverified-620h@gmail.com',
      created_at: hoursAgo(622),
      user_metadata: {
        phone_verified: false,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(620),
      },
    },
    // Skip: too early (575h, Day-21 already sent)
    {
      id: 'vip-early-575h',
      email: 'early-575h@gmail.com',
      created_at: hoursAgo(577),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(575),
        organic_day21_sent_at: hoursAgo(60),
      },
    },
    // Skip: too old (697h)
    {
      id: 'vip-old-697h',
      email: 'old-697h@gmail.com',
      created_at: hoursAgo(700),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(697),
      },
    },
    // Skip: already stamped organic_day25_vip_sent_at
    {
      id: 'vip-already',
      email: 'already-vip@gmail.com',
      created_at: hoursAgo(630),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(625),
        organic_day25_vip_sent_at: hoursAgo(10),
      },
    },
    // Skip: non-organic verified user at 620h
    {
      id: 'vip-non-organic',
      email: 'direct-620h@gmail.com',
      created_at: hoursAgo(620),
      user_metadata: {
        phone_verified: true,
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

  // Run 1: cap maxDay25VipSends = 2
  const run1 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxDay25VipSends: 2,
    now,
  });

  assert.equal(listCalls.length, 1);
  assert.equal(run1.day25VipSent, 2);
  assert.equal(run1.skipped, 6);
  assert.deepEqual(run1.errors, []);

  assert.deepEqual(
    sentEmails.map((m) => m.to[0]),
    ['vip-576h@gmail.com', 'vip-696h@gmail.com'],
  );
  assert.equal(sentEmails[0].idempotencyKey, 'organic-vip-day25-vip-low-576h');
  assert.equal(
    sentEmails[0].subject,
    'Your 30-Day Free VIP Access Wraps Up Soon - Keep Unlimited GTO & Live Tools',
  );
  assert.ok(sentEmails[0].text.includes('https://smarter.poker/hub/vip?src=vip-trial-day25'));
  assert.ok(sentEmails[0].text.includes('3 saved spots'));
  assert.equal(sentEmails[1].idempotencyKey, 'organic-vip-day25-vip-high-696h');

  const stampVip = updateCalls.find((c) => c.id === 'vip-low-576h');
  assert.equal(stampVip.payload.user_metadata.organic_day25_vip_sent_at, '2026-11-28T12:00:00.000Z');
  assert.equal(stampVip.payload.user_metadata.preserve_vip, 'yes');

  // Run 2: uncapped -> vip-capped-620h sends
  const run2 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxDay25VipSends: 20,
    now,
  });
  assert.equal(run2.day25VipSent, 1);
  assert.equal(sentEmails[2].idempotencyKey, 'organic-vip-day25-vip-capped-620h');

  // Run 3: 100% idempotent no-op
  const run3 = await runOrganicWelcomeDrip(mockSb, {
    sendEmail,
    maxDay25VipSends: 20,
    now,
  });
  assert.equal(run3.day25VipSent, 0);
  assert.equal(run3.skipped, usersStore.length);
  assert.deepEqual(run3.errors, []);
});

test('OTC TIER 7 LAW 5 - Phase D Web Push Mirror tracks reminderPushesSent on success, isolates push failures without blocking email or reminded_at, and executes all Phases A-F in ONE listUsers pass', async () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  const hoursFromNow = (h) => new Date(now + h * 3_600_000).toISOString();
  const hoursAgo = (h) => new Date(now - h * 3_600_000).toISOString();

  // Case 1: Push mirror succeeds
  const storeSuccess = [
    {
      id: 'push-ok-u1',
      email: 'push-ok@gmail.com',
      created_at: hoursAgo(10),
      user_metadata: {
        first_name: 'Sam',
        phone_verified: true,
        sp_saved_spots_v1: [
          {
            id: 'wsop-ev-42',
            kind: 'series-reminder',
            label: 'WSOP Event #42 NLH Freezeout',
            path: '/hub/series/wsop-2026',
            eventDate: hoursFromNow(3),
            venue: 'Horseshoe Las Vegas',
            seriesName: 'WSOP 2026',
          },
        ],
      },
    },
  ];
  const pushedPayloads = [];
  const makeSb = (users) => {
    const calls = [];
    return {
      calls,
      sb: {
        auth: {
          admin: {
            listUsers: async (opts) => {
              calls.push(opts);
              return { data: { users }, error: null };
            },
            updateUserById: async (id, payload) => {
              const target = users.find((u) => u.id === id);
              if (target) target.user_metadata = payload.user_metadata;
              return { data: { user: target }, error: null };
            },
          },
        },
      },
    };
  };

  const okCtx = makeSb(storeSuccess);
  const okRun = await runOrganicWelcomeDrip(okCtx.sb, {
    sendEmail: async () => ({ ok: true, id: 'em_ok' }),
    sendPush: async (payload) => {
      pushedPayloads.push(payload);
      return { ok: true };
    },
    now,
  });

  assert.equal(okRun.remindersSent, 1);
  assert.equal(okRun.reminderPushesSent, 1);
  assert.deepEqual(okRun.errors, []);
  assert.equal(pushedPayloads.length, 1);
  assert.equal(pushedPayloads[0].userId, 'push-ok-u1');
  assert.equal(pushedPayloads[0].spotId, 'wsop-ev-42');
  assert.equal(pushedPayloads[0].url, 'https://smarter.poker/hub/series/wsop-2026');
  assert.match(pushedPayloads[0].title, /WSOP Event #42 NLH Freezeout/);
  assert.ok(pushedPayloads[0].body.length > 10);
  assert.equal(storeSuccess[0].user_metadata.sp_saved_spots_v1[0].reminded_at, '2026-11-28T12:00:00.000Z');

  // Case 2: Push throws -> isolated non-blocking! Email STILL counts, reminded_at STILL stamped, zero PII leaked!
  const storeFail = [
    {
      id: 'push-throw-u2',
      email: 'private-push-fail@gmail.com',
      created_at: hoursAgo(10),
      user_metadata: {
        first_name: 'Pat',
        sp_saved_spots_v1: [
          {
            id: 'wpt-ev-7',
            kind: 'series-reminder',
            label: 'WPT Prime Main Event',
            path: '/hub/series/wpt-prime',
            eventDate: hoursFromNow(2),
          },
        ],
      },
    },
  ];
  const failCtx = makeSb(storeFail);
  const failRun = await runOrganicWelcomeDrip(failCtx.sb, {
    sendEmail: async () => ({ ok: true, id: 'em_2' }),
    sendPush: async () => {
      throw new Error('vapid push gateway 502');
    },
    now,
  });

  assert.equal(failRun.remindersSent, 1, 'push failure MUST NEVER fail reminder email count');
  assert.equal(failRun.reminderPushesSent, 0);
  assert.equal(
    storeFail[0].user_metadata.sp_saved_spots_v1[0].reminded_at,
    '2026-11-28T12:00:00.000Z',
    'push failure MUST NEVER prevent stamping reminded_at',
  );
  assert.equal(failRun.errors.length, 1);
  assert.match(failRun.errors[0], /reminder push push-throw-u2: vapid push gateway 502/);
  assert.doesNotMatch(JSON.stringify(failRun), /private-push-fail@gmail\.com/);

  // Case 3: Push returns { ok: false, skipped: true } (opted out) -> clean zero errors, zero push count
  const storeOptOut = [
    {
      id: 'push-optout-u3',
      email: 'optout@gmail.com',
      created_at: hoursAgo(10),
      user_metadata: {
        sp_saved_spots_v1: [
          {
            id: 'mspt-ev-1',
            kind: 'series-reminder',
            label: 'MSPT Main Event',
            path: '/hub/series/mspt',
            eventDate: hoursFromNow(4),
          },
        ],
      },
    },
  ];
  const optOutCtx = makeSb(storeOptOut);
  const optOutRun = await runOrganicWelcomeDrip(optOutCtx.sb, {
    sendEmail: async () => ({ ok: true, id: 'em_3' }),
    sendPush: async () => ({ ok: false, skipped: true, reason: 'opted_out' }),
    now,
  });
  assert.equal(optOutRun.remindersSent, 1);
  assert.equal(optOutRun.reminderPushesSent, 0);
  assert.deepEqual(optOutRun.errors, []);
  assert.equal(storeOptOut[0].user_metadata.sp_saved_spots_v1[0].reminded_at, '2026-11-28T12:00:00.000Z');

  // Case 4: Full Phases A + B + C + D(push) + E(day7 & day21) + F(day25 VIP) in ONE single listUsers call!
  const allPhasesUsers = [
    {
      id: 'u-day0',
      email: 'u0@gmail.com',
      created_at: hoursAgo(2),
      user_metadata: { acquisition_landing_path: '/tools/preflop-ranges' },
    },
    {
      id: 'u-day1',
      email: 'u1@gmail.com',
      created_at: hoursAgo(30),
      user_metadata: {
        acquisition_landing_path: '/tools/poker-odds-calculator',
        organic_welcome_sent_at: hoursAgo(26),
      },
    },
    {
      id: 'u-day3',
      email: 'u3@gmail.com',
      created_at: hoursAgo(90),
      user_metadata: {
        unlock_key: 'gto-leak-finder',
        organic_welcome_sent_at: hoursAgo(80),
        organic_day1_sent_at: hoursAgo(50),
      },
    },
    {
      id: 'u-day7',
      email: 'u7@gmail.com',
      created_at: hoursAgo(170),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/tools/preflop-ranges',
        organic_welcome_sent_at: hoursAgo(168),
      },
    },
    {
      id: 'u-day21',
      email: 'u21@gmail.com',
      created_at: hoursAgo(510),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/hub/poker-near-me/lobby',
        organic_welcome_sent_at: hoursAgo(504),
        organic_day7_sent_at: hoursAgo(330),
      },
    },
    {
      id: 'u-day25',
      email: 'u25@gmail.com',
      created_at: hoursAgo(610),
      user_metadata: {
        phone_verified: true,
        acquisition_landing_path: '/hub/poker-series',
        organic_welcome_sent_at: hoursAgo(600),
        organic_day21_sent_at: hoursAgo(90),
        sp_saved_spots_v1: [
          {
            id: 'combo-ev-1',
            kind: 'series-reminder',
            label: 'Combo Series Event #1',
            path: '/hub/series/combo',
            eventDate: hoursFromNow(5),
          },
        ],
      },
    },
  ];
  const allCtx = makeSb(allPhasesUsers);
  const allRun = await runOrganicWelcomeDrip(allCtx.sb, {
    sendEmail: async () => ({ ok: true, id: 'em_all' }),
    sendPush: async () => ({ ok: true }),
    now,
  });

  assert.equal(allCtx.calls.length, 1, 'Phases A-F MUST execute in ONE single bounded listUsers call');
  assert.deepEqual(allCtx.calls[0], { page: 1, perPage: 100 });
  assert.equal(allRun.sent, 1);
  assert.equal(allRun.day1Sent, 1);
  assert.equal(allRun.day3Sent, 1);
  assert.equal(allRun.day7Sent, 1);
  assert.equal(allRun.day21Sent, 1);
  assert.equal(allRun.day25VipSent, 1);
  assert.equal(allRun.remindersSent, 1);
  assert.equal(allRun.reminderPushesSent, 1);
  assert.equal(allRun.skipped, 0);
  assert.deepEqual(allRun.errors, []);
});

test('OTC TIER 7 LAW 6 - signup-welcome-back.js wires Phase E/F caps & windows + non-blocking Web Push mirror with ZERO net-new cron routes and clean hygiene', () => {
  const cronSrc = read('pages/api/cron/signup-welcome-back.js');
  assert.match(cronSrc, /import \{ notify \} from '\.\.\/\.\.\/\.\.\/src\/lib\/notify'/);
  assert.match(cronSrc, /sendPush:\s*sendSeriesReminderPush/);
  assert.match(cronSrc, /maxDay7Sends:\s*20/);
  assert.match(cronSrc, /maxDay21Sends:\s*20/);
  assert.match(cronSrc, /maxDay25VipSends:\s*20/);
  assert.match(cronSrc, /day7MinHours:\s*144/);
  assert.match(cronSrc, /day7MaxHours:\s*336/);
  assert.match(cronSrc, /day21MinHours:\s*480/);
  assert.match(cronSrc, /day21MaxHours:\s*576/);
  assert.match(cronSrc, /day25VipMinHours:\s*576/);
  assert.match(cronSrc, /day25VipMaxHours:\s*696/);
  assert.match(cronSrc, /type:\s*'tournament_starting'/);

  // Zero net-new cron routes
  const cronDirFiles = fs.readdirSync(path.join(ROOT, 'pages/api/cron'));
  assert.ok(
    !cronDirFiles.some((f) => /day7|day21|day25|habit|vip.*grad|organic.*drip/i.test(f)),
    'must ride inside signup-welcome-back.js with ZERO net-new cron routes',
  );
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(
    !(vercel.crons || []).some((c) => /day7|day21|day25|habit|vip.*grad|organic.*drip/i.test(String(c.path || ''))),
    'vercel.json must not register any net-new habit or vip-graduation cron route',
  );

  // Zero em/en dashes across all owned runtime files, and zero banned gold in executable source
  for (const rel of [
    'src/lib/seo/organicWelcomeDrip.mjs',
    'src/lib/seo/organicWelcomeDripRunner.mjs',
    'pages/api/cron/signup-welcome-back.js',
  ]) {
    const src = read(rel);
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /[—–]/, `${rel} must contain zero em or en dashes`);
    assert.doesNotMatch(codeOnly, BANNED_GOLD_RE, `${rel} executable source must contain zero banned gold hexes`);
  }
});
