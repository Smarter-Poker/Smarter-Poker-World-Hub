/**
 * Live Idempotent Day-0, Day-1, Day-3, Day-7, Day-21, Day-25 VIP & Series Reminder Organic Drip Runner
 * ====================================================================================================
 * Rides inside the existing hourly `/api/cron/signup-welcome-back` job
 * (CLAUDE.md section 11 forbids adding a net-new cron route).
 *
 * Performs a single bounded `listUsers({ page: 1, perPage: 100 })` pass,
 * filters out synthetic probes and invalid addresses, and executes six phases
 * in that same pass:
 *   - Phase A (Day-0 welcome): composes the intent-personalized Day-0
 *     activation email via `buildOrganicWelcomeEmail`, dispatches via the
 *     injected sender (capped at `maxSends`), and stamps
 *     `organic_welcome_sent_at` plus `organic_welcome_track` onto
 *     `user_metadata` for strict idempotency.
 *   - Phase B (Day-1 behavioral re-engagement nudge): targets unverified
 *     organic users (`phone_verified !== true`) whose `organic_welcome_sent_at`
 *     is between `day1MinHours` (20h) and `day1MaxHours` (96h) old and who have
 *     not yet received `organic_day1_sent_at`. Composes the Day-1 nudge via
 *     `buildDay1ActivationNudgeEmail`, dispatches via `sendEmail` (capped at
 *     `maxDay1Sends`), and stamps `organic_day1_sent_at` idempotently.
 *   - Phase C (Day-3 unverified VIP urgency nudge): targets unverified organic
 *     users (`phone_verified !== true`) who completed Day-0 and Day-1, have
 *     not yet received `organic_day3_sent_at`, and whose `organic_welcome_sent_at`
 *     is between `day3MinHours` (68h) and `day3MaxHours` (168h) old. Composes
 *     the urgency nudge via `buildDay3VipUrgencyEmail`, dispatches via
 *     `sendEmail` (capped at `maxDay3Sends`), and stamps `organic_day3_sent_at`
 *     idempotently without clobbering metadata.
 *   - Phase D (Real saved series event reminders + optional Web Push mirror):
 *     inspects `sp_saved_spots_v1` for ANY non-synthetic user (even if verified
 *     or past Day-0/1/3) for entries with `kind === 'series-reminder'`, no
 *     `reminded_at`, and a valid `eventDate || startDate` within
 *     `[nowMs, nowMs + reminderLeadHours * 3_600_000]` (default 24h so T-2h is
 *     caught reliably on the hourly cron). Dispatches
 *     `buildSeriesEventReminderEmail` (capped at `maxReminderSends`), stamps
 *     `reminded_at` onto that exact spot entry without clobbering sibling spots
 *     or other metadata, and when `sendPush` is provided mirrors the alert via
 *     an isolated non-blocking Web Push call.
 *   - Phase E (Day-7 & Day-21 Habit Digests): targets phone-verified organic
 *     users (`phone_verified === true`) with `organic_welcome_sent_at`:
 *       - Day-7 (`day7MinHours = 144` / 6d to `day7MaxHours = 336` / 14d)
 *         without `organic_day7_sent_at`: dispatches `buildHabitDigestEmail`
 *         (`phase: 'day7'`, capped at `maxDay7Sends`) and stamps
 *         `organic_day7_sent_at` idempotently.
 *       - Day-21 (`day21MinHours = 480` / 20d to `day21MaxHours = 576` / 24d)
 *         without `organic_day21_sent_at`: dispatches `buildHabitDigestEmail`
 *         (`phase: 'day21'`, capped at `maxDay21Sends`) and stamps
 *         `organic_day21_sent_at` idempotently.
 *   - Phase F (Day-25 VIP Trial Graduation): targets phone-verified organic
 *     users (`phone_verified === true`) whose signup/welcome is between
 *     `day25VipMinHours` (576h / 24d) and `day25VipMaxHours` (696h / 29d) old
 *     without `organic_day25_vip_sent_at`: dispatches
 *     `buildVipTrialGraduationEmail` (capped at `maxDay25VipSends`) and stamps
 *     `organic_day25_vip_sent_at` idempotently.
 *
 * Never throws; always returns
 * `{ sent, day1Sent, day3Sent, day7Sent, day21Sent, day25VipSent, remindersSent, reminderPushesSent, skipped, errors, tracks }`.
 */

import {
  buildDay1ActivationNudgeEmail,
  buildDay3VipUrgencyEmail,
  buildHabitDigestEmail,
  buildOrganicWelcomeEmail,
  buildSeriesEventReminderEmail,
  buildVipTrialGraduationEmail,
  resolveOrganicActivationTrack,
} from './organicWelcomeDrip.mjs';

export const ORGANIC_DRIP_FROM = 'Smarter.Poker <noreply@smarter.poker>';
export const ORGANIC_DRIP_UNSUBSCRIBE_URL = 'https://smarter.poker/hub/email-preferences';

const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractMetadata(user) {
  if (user && typeof user.user_metadata === 'object' && user.user_metadata !== null) {
    return user.user_metadata;
  }
  if (user && typeof user.raw_user_meta_data === 'object' && user.raw_user_meta_data !== null) {
    return user.raw_user_meta_data;
  }
  return {};
}

function isPhoneVerified(meta) {
  return meta?.phone_verified === true || String(meta?.phone_verified || '').toLowerCase() === 'true';
}

function isSyntheticOrInvalidEmail(email, meta) {
  if (meta?.signup_probe === true || String(meta?.signup_probe || '').toLowerCase() === 'true') {
    return true;
  }
  if (typeof email !== 'string') return true;
  const trimmed = email.trim();
  if (!trimmed || !BASIC_EMAIL_RE.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  if (lower.endsWith('@example.invalid')) return true;
  return false;
}

function extractFirstName(meta) {
  if (!meta || typeof meta !== 'object') return '';
  if (typeof meta.first_name === 'string' && meta.first_name.trim()) {
    return meta.first_name.trim();
  }
  if (typeof meta.full_name === 'string' && meta.full_name.trim()) {
    return meta.full_name.trim().split(/\s+/)[0];
  }
  if (typeof meta.name === 'string' && meta.name.trim()) {
    return meta.name.trim().split(/\s+/)[0];
  }
  if (typeof meta.username === 'string' && meta.username.trim()) {
    return meta.username.trim();
  }
  return '';
}

function buildSpotKey(spot, index) {
  const direct =
    (typeof spot?.id === 'string' && spot.id.trim()) ||
    (typeof spot?.key === 'string' && spot.key.trim()) ||
    '';
  const raw =
    direct ||
    [spot?.path, spot?.label, spot?.eventDate || spot?.startDate]
      .filter((v) => typeof v === 'string' && v.trim())
      .join('-') ||
    `spot-${index}`;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || `spot-${index}`;
}

/**
 * Dispatch personalized Day-0 welcome emails (Phase A), Day-1 behavioral
 * re-engagement nudges (Phase B), Day-3 VIP urgency nudges (Phase C),
 * upcoming saved series event reminders with optional Web Push mirror
 * (Phase D), Day-7 & Day-21 habit digests (Phase E), and Day-25 VIP trial
 * graduation emails (Phase F) in a single bounded user pass, strictly
 * idempotent via `user_metadata`.
 *
 * @param {object} sb - Supabase service-role client with `auth.admin`
 * @param {object} [options]
 * @param {Function} options.sendEmail - Email transport returning `{ ok, id?, error? }`
 * @param {Function|null} [options.sendPush=null] - Optional non-blocking Web Push mirror for Phase D
 * @param {number} [options.maxSends=20] - Hard cap on Phase A Day-0 emails dispatched per run
 * @param {number} [options.maxDay1Sends=20] - Hard cap on Phase B Day-1 nudges dispatched per run
 * @param {number} [options.maxDay3Sends=20] - Hard cap on Phase C Day-3 VIP nudges dispatched per run
 * @param {number} [options.maxDay7Sends=20] - Hard cap on Phase E Day-7 habit digests per run
 * @param {number} [options.maxDay21Sends=20] - Hard cap on Phase E Day-21 habit digests per run
 * @param {number} [options.maxDay25VipSends=20] - Hard cap on Phase F Day-25 VIP graduation emails per run
 * @param {number} [options.maxReminderSends=20] - Hard cap on Phase D series event reminders per run
 * @param {number} [options.windowHours=48] - Phase A signup lookback window in hours
 * @param {number} [options.day1MinHours=20] - Minimum hours after Day-0 welcome before Day-1 nudge
 * @param {number} [options.day1MaxHours=96] - Maximum hours after Day-0 welcome for Day-1 nudge
 * @param {number} [options.day3MinHours=68] - Minimum hours after Day-0 welcome before Day-3 VIP nudge
 * @param {number} [options.day3MaxHours=168] - Maximum hours after Day-0 welcome for Day-3 VIP nudge
 * @param {number} [options.day7MinHours=144] - Minimum hours after Day-0 welcome before Day-7 habit digest
 * @param {number} [options.day7MaxHours=336] - Maximum hours after Day-0 welcome for Day-7 habit digest
 * @param {number} [options.day21MinHours=480] - Minimum hours after Day-0 welcome before Day-21 habit digest
 * @param {number} [options.day21MaxHours=576] - Maximum hours after Day-0 welcome for Day-21 habit digest
 * @param {number} [options.day25VipMinHours=576] - Minimum hours after signup/welcome before Day-25 VIP graduation
 * @param {number} [options.day25VipMaxHours=696] - Maximum hours after signup/welcome for Day-25 VIP graduation
 * @param {number} [options.reminderLeadHours=24] - Lookahead window in hours for upcoming saved series reminders
 * @param {number} [options.now=Date.now()] - Reference timestamp in ms
 * @param {string} [options.siteUrl='https://smarter.poker'] - Public site origin
 * @param {string} [options.from] - Sender header passed to `sendEmail`
 * @param {number} [options.deadline] - Optional epoch ms deadline to stop early
 * @param {Function} [options.log] - Optional non-PII logger
 * @returns {Promise<{ sent: number, day1Sent: number, day3Sent: number, day7Sent: number, day21Sent: number, day25VipSent: number, remindersSent: number, reminderPushesSent: number, skipped: number, errors: string[], tracks: Record<string, number> }>}
 */
export async function runOrganicWelcomeDrip(
  sb,
  {
    sendEmail,
    sendPush = null,
    maxSends = 20,
    maxDay1Sends = 20,
    maxDay3Sends = 20,
    maxDay7Sends = 20,
    maxDay21Sends = 20,
    maxDay25VipSends = 20,
    maxReminderSends = 20,
    windowHours = 48,
    day1MinHours = 20,
    day1MaxHours = 96,
    day3MinHours = 68,
    day3MaxHours = 168,
    day7MinHours = 144,
    day7MaxHours = 336,
    day21MinHours = 480,
    day21MaxHours = 576,
    day25VipMinHours = 576,
    day25VipMaxHours = 696,
    reminderLeadHours = 24,
    now = Date.now(),
    siteUrl = 'https://smarter.poker',
    from = ORGANIC_DRIP_FROM,
    deadline = null,
    log = () => {},
  } = {},
) {
  const summary = {
    sent: 0,
    day1Sent: 0,
    day3Sent: 0,
    day7Sent: 0,
    day21Sent: 0,
    day25VipSent: 0,
    remindersSent: 0,
    reminderPushesSent: 0,
    skipped: 0,
    errors: [],
    tracks: {},
  };

  if (!sb?.auth?.admin || typeof sb.auth.admin.listUsers !== 'function') {
    summary.errors.push('supabase auth.admin.listUsers unavailable');
    return summary;
  }
  if (typeof sendEmail !== 'function') {
    summary.errors.push('sendEmail transport unavailable');
    return summary;
  }

  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const safeMaxSends = Math.max(0, Math.floor(Number(maxSends) || 0));
  const safeMaxDay1Sends = Math.max(0, Math.floor(Number(maxDay1Sends) || 0));
  const safeMaxDay3Sends = Math.max(0, Math.floor(Number(maxDay3Sends) || 0));
  const safeMaxDay7Sends = Math.max(0, Math.floor(Number(maxDay7Sends) || 0));
  const safeMaxDay21Sends = Math.max(0, Math.floor(Number(maxDay21Sends) || 0));
  const safeMaxDay25VipSends = Math.max(0, Math.floor(Number(maxDay25VipSends) || 0));
  const safeMaxReminderSends = Math.max(0, Math.floor(Number(maxReminderSends) || 0));
  const safeWindowHours = Math.max(1, Number(windowHours) || 48);
  const safeDay1MinHours = Number.isFinite(Number(day1MinHours))
    ? Math.max(0, Number(day1MinHours))
    : 20;
  const safeDay1MaxHours = Number.isFinite(Number(day1MaxHours))
    ? Math.max(safeDay1MinHours, Number(day1MaxHours))
    : 96;
  const safeDay3MinHours = Number.isFinite(Number(day3MinHours))
    ? Math.max(0, Number(day3MinHours))
    : 68;
  const safeDay3MaxHours = Number.isFinite(Number(day3MaxHours))
    ? Math.max(safeDay3MinHours, Number(day3MaxHours))
    : 168;
  const safeDay7MinHours = Number.isFinite(Number(day7MinHours))
    ? Math.max(0, Number(day7MinHours))
    : 144;
  const safeDay7MaxHours = Number.isFinite(Number(day7MaxHours))
    ? Math.max(safeDay7MinHours, Number(day7MaxHours))
    : 336;
  const safeDay21MinHours = Number.isFinite(Number(day21MinHours))
    ? Math.max(0, Number(day21MinHours))
    : 480;
  const safeDay21MaxHours = Number.isFinite(Number(day21MaxHours))
    ? Math.max(safeDay21MinHours, Number(day21MaxHours))
    : 576;
  const safeDay25VipMinHours = Number.isFinite(Number(day25VipMinHours))
    ? Math.max(0, Number(day25VipMinHours))
    : 576;
  const safeDay25VipMaxHours = Number.isFinite(Number(day25VipMaxHours))
    ? Math.max(safeDay25VipMinHours, Number(day25VipMaxHours))
    : 696;
  const safeReminderLeadHours = Number.isFinite(Number(reminderLeadHours))
    ? Math.max(0, Number(reminderLeadHours))
    : 24;

  const cutoffMs = nowMs - safeWindowHours * 3_600_000;
  const day1MinMs = safeDay1MinHours * 3_600_000;
  const day1MaxMs = safeDay1MaxHours * 3_600_000;
  const day3MinMs = safeDay3MinHours * 3_600_000;
  const day3MaxMs = safeDay3MaxHours * 3_600_000;
  const day7MinMs = safeDay7MinHours * 3_600_000;
  const day7MaxMs = safeDay7MaxHours * 3_600_000;
  const day21MinMs = safeDay21MinHours * 3_600_000;
  const day21MaxMs = safeDay21MaxHours * 3_600_000;
  const day25VipMinMs = safeDay25VipMinHours * 3_600_000;
  const day25VipMaxMs = safeDay25VipMaxHours * 3_600_000;
  const reminderHorizonMs = nowMs + safeReminderLeadHours * 3_600_000;

  let users = [];
  try {
    const listRes = await sb.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (listRes?.error) {
      summary.errors.push(`listUsers: ${String(listRes.error.message || listRes.error).slice(0, 160)}`);
      return summary;
    }
    users = Array.isArray(listRes?.data?.users) ? listRes.data.users : [];
  } catch (err) {
    summary.errors.push(`listUsers threw: ${String(err?.message || err).slice(0, 160)}`);
    return summary;
  }

  const sentAtIso = new Date(nowMs).toISOString();
  const unsubscribeHeaders = { 'List-Unsubscribe': `<${ORGANIC_DRIP_UNSUBSCRIBE_URL}>` };

  for (const user of users) {
    if (typeof deadline === 'number' && Date.now() >= deadline) {
      summary.skipped += 1;
      continue;
    }

    const initialMeta = extractMetadata(user);
    if (isSyntheticOrInvalidEmail(user?.email, initialMeta)) {
      summary.skipped += 1;
      continue;
    }

    let currentMeta = initialMeta;
    let userHandled = false;
    let hadError = false;

    const userId = String(user?.id || 'unknown');
    const firstName = extractFirstName(currentMeta);
    const landingPath =
      typeof currentMeta.acquisition_landing_path === 'string'
        ? currentMeta.acquisition_landing_path.trim()
        : '';
    const unlockKey =
      typeof currentMeta.unlock_key === 'string'
        ? currentMeta.unlock_key.trim()
        : '';
    const isOrganic = Boolean(landingPath || unlockKey);

    // Phases A, B, C: Organic signup activation drip sequence (Day-0 -> Day-1 -> Day-3).
    if (isOrganic) {
      if (currentMeta.organic_welcome_sent_at) {
        const welcomeSentMs = Date.parse(currentMeta.organic_welcome_sent_at || '');
        const elapsedMs = nowMs - welcomeSentMs;
        const verified = isPhoneVerified(currentMeta);

        if (!currentMeta.organic_day1_sent_at) {
          // Phase B: Day-1 behavioral re-engagement nudge for unverified users
          // whose Day-0 welcome was sent between day1MinHours and day1MaxHours ago.
          if (
            !verified &&
            Number.isFinite(welcomeSentMs) &&
            elapsedMs >= day1MinMs &&
            elapsedMs <= day1MaxMs &&
            summary.day1Sent < safeMaxDay1Sends
          ) {
            const resolvedTrack = resolveOrganicActivationTrack({ unlockKey, landingPath });
            const preferredTrack =
              typeof currentMeta.organic_welcome_track === 'string' && currentMeta.organic_welcome_track.trim()
                ? currentMeta.organic_welcome_track.trim()
                : resolvedTrack;
            const day1Msg = buildDay1ActivationNudgeEmail({
              track: preferredTrack,
              firstName,
              siteUrl,
            });
            const finalTrack = day1Msg.track || resolvedTrack;

            let day1SendRes;
            let day1SendOk = false;
            try {
              day1SendRes = await sendEmail({
                to: [user.email.trim()],
                subject: day1Msg.subject,
                html: day1Msg.html,
                text: day1Msg.text,
                idempotencyKey: `organic-welcome-day1-${userId}`,
                from,
                headers: unsubscribeHeaders,
              });
              if (!day1SendRes || day1SendRes.ok === false) {
                summary.errors.push(`day1 send ${userId}: ${String(day1SendRes?.error || 'send failed').slice(0, 160)}`);
                hadError = true;
              } else {
                day1SendOk = true;
              }
            } catch (err) {
              summary.errors.push(`day1 send ${userId}: ${String(err?.message || err).slice(0, 160)}`);
              hadError = true;
            }

            if (day1SendOk) {
              const nextMeta = {
                ...currentMeta,
                organic_day1_sent_at: sentAtIso,
              };
              if (typeof sb.auth.admin.updateUserById === 'function' && user?.id) {
                try {
                  const updateRes = await sb.auth.admin.updateUserById(user.id, {
                    user_metadata: nextMeta,
                  });
                  if (updateRes?.error) {
                    summary.errors.push(`day1 stamp ${userId}: ${String(updateRes.error.message || updateRes.error).slice(0, 160)}`);
                  }
                } catch (err) {
                  summary.errors.push(`day1 stamp ${userId}: ${String(err?.message || err).slice(0, 160)}`);
                }
              }
              currentMeta = nextMeta;
              summary.day1Sent += 1;
              summary.tracks[finalTrack] = (summary.tracks[finalTrack] || 0) + 1;
              userHandled = true;
              log(`[organic-welcome-drip] day1 sent user=${userId} track=${finalTrack}`);
            }
          }
        } else if (!currentMeta.organic_day3_sent_at) {
          // Phase C: Day-3 VIP urgency nudge for unverified users who completed
          // Day-0 and Day-1 and are between day3MinHours and day3MaxHours after welcome.
          if (
            !verified &&
            Number.isFinite(welcomeSentMs) &&
            elapsedMs >= day3MinMs &&
            elapsedMs <= day3MaxMs &&
            summary.day3Sent < safeMaxDay3Sends
          ) {
            const resolvedTrack = resolveOrganicActivationTrack({ unlockKey, landingPath });
            const preferredTrack =
              typeof currentMeta.organic_welcome_track === 'string' && currentMeta.organic_welcome_track.trim()
                ? currentMeta.organic_welcome_track.trim()
                : resolvedTrack;
            const day3Msg = buildDay3VipUrgencyEmail({
              track: preferredTrack,
              firstName,
              siteUrl,
            });
            const finalTrack = day3Msg.track || resolvedTrack;

            let day3SendRes;
            let day3SendOk = false;
            try {
              day3SendRes = await sendEmail({
                to: [user.email.trim()],
                subject: day3Msg.subject,
                html: day3Msg.html,
                text: day3Msg.text,
                idempotencyKey: `organic-welcome-day3-${userId}`,
                from,
                headers: unsubscribeHeaders,
              });
              if (!day3SendRes || day3SendRes.ok === false) {
                summary.errors.push(`day3 send ${userId}: ${String(day3SendRes?.error || 'send failed').slice(0, 160)}`);
                hadError = true;
              } else {
                day3SendOk = true;
              }
            } catch (err) {
              summary.errors.push(`day3 send ${userId}: ${String(err?.message || err).slice(0, 160)}`);
              hadError = true;
            }

            if (day3SendOk) {
              const nextMeta = {
                ...currentMeta,
                organic_day3_sent_at: sentAtIso,
              };
              if (typeof sb.auth.admin.updateUserById === 'function' && user?.id) {
                try {
                  const updateRes = await sb.auth.admin.updateUserById(user.id, {
                    user_metadata: nextMeta,
                  });
                  if (updateRes?.error) {
                    summary.errors.push(`day3 stamp ${userId}: ${String(updateRes.error.message || updateRes.error).slice(0, 160)}`);
                  }
                } catch (err) {
                  summary.errors.push(`day3 stamp ${userId}: ${String(err?.message || err).slice(0, 160)}`);
                }
              }
              currentMeta = nextMeta;
              summary.day3Sent += 1;
              summary.tracks[finalTrack] = (summary.tracks[finalTrack] || 0) + 1;
              userHandled = true;
              log(`[organic-welcome-drip] day3 sent user=${userId} track=${finalTrack}`);
            }
          }
        }

        // Phase E (Day-7 & Day-21 Habit Digests) and Phase F (Day-25 VIP Trial Graduation)
        // for phone-verified organic users with organic_welcome_sent_at.
        if (verified && Number.isFinite(welcomeSentMs)) {
          const savedSpotCount = Array.isArray(currentMeta.sp_saved_spots_v1)
            ? currentMeta.sp_saved_spots_v1.length
            : 0;
          const resolvedTrack = resolveOrganicActivationTrack({ unlockKey, landingPath });
          const preferredTrack =
            typeof currentMeta.organic_welcome_track === 'string' && currentMeta.organic_welcome_track.trim()
              ? currentMeta.organic_welcome_track.trim()
              : resolvedTrack;

          if (
            !currentMeta.organic_day7_sent_at &&
            elapsedMs >= day7MinMs &&
            elapsedMs <= day7MaxMs &&
            summary.day7Sent < safeMaxDay7Sends
          ) {
            const day7Msg = buildHabitDigestEmail({
              phase: 'day7',
              track: preferredTrack,
              firstName,
              savedSpotCount,
              siteUrl,
            });
            const finalTrack = day7Msg.track || resolvedTrack;

            let day7SendRes;
            let day7SendOk = false;
            try {
              day7SendRes = await sendEmail({
                to: [user.email.trim()],
                subject: day7Msg.subject,
                html: day7Msg.html,
                text: day7Msg.text,
                idempotencyKey: `organic-habit-day7-${userId}`,
                from,
                headers: unsubscribeHeaders,
              });
              if (!day7SendRes || day7SendRes.ok === false) {
                summary.errors.push(`day7 send ${userId}: ${String(day7SendRes?.error || 'send failed').slice(0, 160)}`);
                hadError = true;
              } else {
                day7SendOk = true;
              }
            } catch (err) {
              summary.errors.push(`day7 send ${userId}: ${String(err?.message || err).slice(0, 160)}`);
              hadError = true;
            }

            if (day7SendOk) {
              const nextMeta = {
                ...currentMeta,
                organic_day7_sent_at: sentAtIso,
              };
              if (typeof sb.auth.admin.updateUserById === 'function' && user?.id) {
                try {
                  const updateRes = await sb.auth.admin.updateUserById(user.id, {
                    user_metadata: nextMeta,
                  });
                  if (updateRes?.error) {
                    summary.errors.push(`day7 stamp ${userId}: ${String(updateRes.error.message || updateRes.error).slice(0, 160)}`);
                  }
                } catch (err) {
                  summary.errors.push(`day7 stamp ${userId}: ${String(err?.message || err).slice(0, 160)}`);
                }
              }
              currentMeta = nextMeta;
              summary.day7Sent += 1;
              summary.tracks[finalTrack] = (summary.tracks[finalTrack] || 0) + 1;
              userHandled = true;
              log(`[organic-welcome-drip] day7 sent user=${userId} track=${finalTrack}`);
            }
          } else if (
            !currentMeta.organic_day21_sent_at &&
            elapsedMs >= day21MinMs &&
            elapsedMs <= day21MaxMs &&
            summary.day21Sent < safeMaxDay21Sends
          ) {
            const day21Msg = buildHabitDigestEmail({
              phase: 'day21',
              track: preferredTrack,
              firstName,
              savedSpotCount,
              siteUrl,
            });
            const finalTrack = day21Msg.track || resolvedTrack;

            let day21SendRes;
            let day21SendOk = false;
            try {
              day21SendRes = await sendEmail({
                to: [user.email.trim()],
                subject: day21Msg.subject,
                html: day21Msg.html,
                text: day21Msg.text,
                idempotencyKey: `organic-habit-day21-${userId}`,
                from,
                headers: unsubscribeHeaders,
              });
              if (!day21SendRes || day21SendRes.ok === false) {
                summary.errors.push(`day21 send ${userId}: ${String(day21SendRes?.error || 'send failed').slice(0, 160)}`);
                hadError = true;
              } else {
                day21SendOk = true;
              }
            } catch (err) {
              summary.errors.push(`day21 send ${userId}: ${String(err?.message || err).slice(0, 160)}`);
              hadError = true;
            }

            if (day21SendOk) {
              const nextMeta = {
                ...currentMeta,
                organic_day21_sent_at: sentAtIso,
              };
              if (typeof sb.auth.admin.updateUserById === 'function' && user?.id) {
                try {
                  const updateRes = await sb.auth.admin.updateUserById(user.id, {
                    user_metadata: nextMeta,
                  });
                  if (updateRes?.error) {
                    summary.errors.push(`day21 stamp ${userId}: ${String(updateRes.error.message || updateRes.error).slice(0, 160)}`);
                  }
                } catch (err) {
                  summary.errors.push(`day21 stamp ${userId}: ${String(err?.message || err).slice(0, 160)}`);
                }
              }
              currentMeta = nextMeta;
              summary.day21Sent += 1;
              summary.tracks[finalTrack] = (summary.tracks[finalTrack] || 0) + 1;
              userHandled = true;
              log(`[organic-welcome-drip] day21 sent user=${userId} track=${finalTrack}`);
            }
          } else if (
            !currentMeta.organic_day25_vip_sent_at &&
            elapsedMs >= day25VipMinMs &&
            elapsedMs <= day25VipMaxMs &&
            summary.day25VipSent < safeMaxDay25VipSends
          ) {
            const vipMsg = buildVipTrialGraduationEmail({
              firstName,
              savedSpotCount,
              siteUrl,
            });

            let vipSendRes;
            let vipSendOk = false;
            try {
              vipSendRes = await sendEmail({
                to: [user.email.trim()],
                subject: vipMsg.subject,
                html: vipMsg.html,
                text: vipMsg.text,
                idempotencyKey: `organic-vip-day25-${userId}`,
                from,
                headers: unsubscribeHeaders,
              });
              if (!vipSendRes || vipSendRes.ok === false) {
                summary.errors.push(`day25 vip send ${userId}: ${String(vipSendRes?.error || 'send failed').slice(0, 160)}`);
                hadError = true;
              } else {
                vipSendOk = true;
              }
            } catch (err) {
              summary.errors.push(`day25 vip send ${userId}: ${String(err?.message || err).slice(0, 160)}`);
              hadError = true;
            }

            if (vipSendOk) {
              const nextMeta = {
                ...currentMeta,
                organic_day25_vip_sent_at: sentAtIso,
              };
              if (typeof sb.auth.admin.updateUserById === 'function' && user?.id) {
                try {
                  const updateRes = await sb.auth.admin.updateUserById(user.id, {
                    user_metadata: nextMeta,
                  });
                  if (updateRes?.error) {
                    summary.errors.push(`day25 vip stamp ${userId}: ${String(updateRes.error.message || updateRes.error).slice(0, 160)}`);
                  }
                } catch (err) {
                  summary.errors.push(`day25 vip stamp ${userId}: ${String(err?.message || err).slice(0, 160)}`);
                }
              }
              currentMeta = nextMeta;
              summary.day25VipSent += 1;
              summary.tracks[preferredTrack] = (summary.tracks[preferredTrack] || 0) + 1;
              userHandled = true;
              log(`[organic-welcome-drip] day25-vip sent user=${userId}`);
            }
          }
        }
      } else {
        // Phase A: Day-0 organic activation welcome email within windowHours.
        const createdMs = Date.parse(user?.created_at || '');
        if (Number.isFinite(createdMs) && createdMs >= cutoffMs && summary.sent < safeMaxSends) {
          const track = resolveOrganicActivationTrack({ unlockKey, landingPath });
          const msg = buildOrganicWelcomeEmail({
            track,
            firstName,
            landingPath,
            siteUrl,
          });

          let sendRes;
          let sendOk = false;
          try {
            sendRes = await sendEmail({
              to: [user.email.trim()],
              subject: msg.subject,
              html: msg.html,
              text: msg.text,
              idempotencyKey: `organic-welcome-day0-${userId}`,
              from,
              headers: unsubscribeHeaders,
            });
            if (!sendRes || sendRes.ok === false) {
              summary.errors.push(`send ${userId}: ${String(sendRes?.error || 'send failed').slice(0, 160)}`);
              hadError = true;
            } else {
              sendOk = true;
            }
          } catch (err) {
            summary.errors.push(`send ${userId}: ${String(err?.message || err).slice(0, 160)}`);
            hadError = true;
          }

          if (sendOk) {
            const nextMeta = {
              ...currentMeta,
              organic_welcome_sent_at: sentAtIso,
              organic_welcome_track: track,
            };
            if (typeof sb.auth.admin.updateUserById === 'function' && user?.id) {
              try {
                const updateRes = await sb.auth.admin.updateUserById(user.id, {
                  user_metadata: nextMeta,
                });
                if (updateRes?.error) {
                  summary.errors.push(`stamp ${userId}: ${String(updateRes.error.message || updateRes.error).slice(0, 160)}`);
                }
              } catch (err) {
                summary.errors.push(`stamp ${userId}: ${String(err?.message || err).slice(0, 160)}`);
              }
            }
            currentMeta = nextMeta;
            summary.sent += 1;
            summary.tracks[track] = (summary.tracks[track] || 0) + 1;
            userHandled = true;
            log(`[organic-welcome-drip] sent user=${userId} track=${track}`);
          }
        } else if (
          isPhoneVerified(currentMeta) &&
          !currentMeta.organic_day25_vip_sent_at &&
          Number.isFinite(createdMs) &&
          nowMs - createdMs >= day25VipMinMs &&
          nowMs - createdMs <= day25VipMaxMs &&
          summary.day25VipSent < safeMaxDay25VipSends
        ) {
          // Phase F fallback: verified organic user signed up 24d-29d ago without Day-0 welcome stamp.
          const savedSpotCount = Array.isArray(currentMeta.sp_saved_spots_v1)
            ? currentMeta.sp_saved_spots_v1.length
            : 0;
          const resolvedTrack = resolveOrganicActivationTrack({ unlockKey, landingPath });
          const vipMsg = buildVipTrialGraduationEmail({
            firstName,
            savedSpotCount,
            siteUrl,
          });

          let vipSendRes;
          let vipSendOk = false;
          try {
            vipSendRes = await sendEmail({
              to: [user.email.trim()],
              subject: vipMsg.subject,
              html: vipMsg.html,
              text: vipMsg.text,
              idempotencyKey: `organic-vip-day25-${userId}`,
              from,
              headers: unsubscribeHeaders,
            });
            if (!vipSendRes || vipSendRes.ok === false) {
              summary.errors.push(`day25 vip send ${userId}: ${String(vipSendRes?.error || 'send failed').slice(0, 160)}`);
              hadError = true;
            } else {
              vipSendOk = true;
            }
          } catch (err) {
            summary.errors.push(`day25 vip send ${userId}: ${String(err?.message || err).slice(0, 160)}`);
            hadError = true;
          }

          if (vipSendOk) {
            const nextMeta = {
              ...currentMeta,
              organic_day25_vip_sent_at: sentAtIso,
            };
            if (typeof sb.auth.admin.updateUserById === 'function' && user?.id) {
              try {
                const updateRes = await sb.auth.admin.updateUserById(user.id, {
                  user_metadata: nextMeta,
                });
                if (updateRes?.error) {
                  summary.errors.push(`day25 vip stamp ${userId}: ${String(updateRes.error.message || updateRes.error).slice(0, 160)}`);
                }
              } catch (err) {
                summary.errors.push(`day25 vip stamp ${userId}: ${String(err?.message || err).slice(0, 160)}`);
              }
            }
            currentMeta = nextMeta;
            summary.day25VipSent += 1;
            summary.tracks[resolvedTrack] = (summary.tracks[resolvedTrack] || 0) + 1;
            userHandled = true;
            log(`[organic-welcome-drip] day25-vip sent user=${userId}`);
          }
        }
      }
    }

    // Phase D: Real saved series event reminders for ANY non-synthetic user
    // (even verified users or users who already completed Day-0/Day-1/Day-3).
    if (Array.isArray(currentMeta.sp_saved_spots_v1) && currentMeta.sp_saved_spots_v1.length > 0) {
      let spots = currentMeta.sp_saved_spots_v1;
      for (let i = 0; i < spots.length; i += 1) {
        if (typeof deadline === 'number' && Date.now() >= deadline) break;
        if (summary.remindersSent >= safeMaxReminderSends) break;

        const spot = spots[i];
        if (!spot || typeof spot !== 'object') continue;
        if (spot.kind !== 'series-reminder') continue;
        if (spot.reminded_at) continue;

        const rawEventDate = spot.eventDate || spot.startDate || '';
        const eventMs = Date.parse(rawEventDate);
        if (!Number.isFinite(eventMs) || eventMs < nowMs || eventMs > reminderHorizonMs) {
          continue;
        }

        const spotKey = buildSpotKey(spot, i);
        const reminderMsg = buildSeriesEventReminderEmail({
          spot,
          firstName,
          siteUrl,
        });

        let reminderSendRes;
        let reminderSendOk = false;
        try {
          reminderSendRes = await sendEmail({
            to: [user.email.trim()],
            subject: reminderMsg.subject,
            html: reminderMsg.html,
            text: reminderMsg.text,
            idempotencyKey: `series-event-reminder-${userId}-${spotKey}`,
            from,
            headers: unsubscribeHeaders,
          });
          if (!reminderSendRes || reminderSendRes.ok === false) {
            summary.errors.push(`reminder send ${userId}: ${String(reminderSendRes?.error || 'send failed').slice(0, 160)}`);
            hadError = true;
          } else {
            reminderSendOk = true;
          }
        } catch (err) {
          summary.errors.push(`reminder send ${userId}: ${String(err?.message || err).slice(0, 160)}`);
          hadError = true;
        }

        if (reminderSendOk) {
          const nextSpots = spots.map((entry, idx) =>
            idx === i ? { ...entry, reminded_at: sentAtIso } : entry,
          );
          const nextMeta = {
            ...currentMeta,
            sp_saved_spots_v1: nextSpots,
          };
          if (typeof sb.auth.admin.updateUserById === 'function' && user?.id) {
            try {
              const updateRes = await sb.auth.admin.updateUserById(user.id, {
                user_metadata: nextMeta,
              });
              if (updateRes?.error) {
                summary.errors.push(`reminder stamp ${userId}: ${String(updateRes.error.message || updateRes.error).slice(0, 160)}`);
              }
            } catch (err) {
              summary.errors.push(`reminder stamp ${userId}: ${String(err?.message || err).slice(0, 160)}`);
            }
          }
          spots = nextSpots;
          currentMeta = nextMeta;
          summary.remindersSent += 1;
          userHandled = true;
          log(`[organic-welcome-drip] series-reminder sent user=${userId} spot=${spotKey}`);

          // Phase D Web Push Mirror: strictly isolated non-blocking best-effort mirror
          // so a push failure NEVER fails email delivery or prevents stamping reminded_at.
          if (typeof sendPush === 'function') {
            try {
              const pushRes = await sendPush({
                userId,
                title: reminderMsg.subject,
                body: reminderMsg.previewText || reminderMsg.subject,
                url: reminderMsg.ctaUrl,
                spotId: spotKey,
              });
              const pushSucceeded =
                pushRes === undefined ||
                pushRes === true ||
                (typeof pushRes === 'object' &&
                  pushRes !== null &&
                  pushRes.ok !== false &&
                  pushRes.sent !== false &&
                  pushRes.skipped !== true);
              if (pushSucceeded) {
                summary.reminderPushesSent += 1;
                log(`[organic-welcome-drip] series-reminder push sent user=${userId} spot=${spotKey}`);
              } else if (
                pushRes &&
                typeof pushRes === 'object' &&
                pushRes.skipped !== true &&
                pushRes.error
              ) {
                summary.errors.push(`reminder push ${userId}: ${String(pushRes.error).slice(0, 160)}`);
              }
            } catch (err) {
              summary.errors.push(`reminder push ${userId}: ${String(err?.message || err).slice(0, 160)}`);
            }
          }
        }
      }
    }

    if (!userHandled && !hadError) {
      summary.skipped += 1;
    }
  }

  return summary;
}
