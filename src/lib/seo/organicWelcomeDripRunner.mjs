/**
 * Live Idempotent Day-0 & Day-1 Organic Welcome Drip Runner
 * =========================================================
 * Rides inside the existing hourly `/api/cron/signup-welcome-back` job
 * (CLAUDE.md section 11 forbids adding a net-new cron route).
 *
 * Performs a single bounded read of recent auth signups, filters out synthetic
 * probes and non-organic accounts, and executes two phases in the same pass:
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
 *
 * Never throws; always returns `{ sent, day1Sent, skipped, errors, tracks }`.
 */

import {
  buildDay1ActivationNudgeEmail,
  buildOrganicWelcomeEmail,
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

/**
 * Dispatch personalized Day-0 organic activation emails (Phase A) and Day-1
 * behavioral re-engagement nudges (Phase B) in a single bounded user pass,
 * strictly idempotent via `user_metadata.organic_welcome_sent_at` and
 * `user_metadata.organic_day1_sent_at`.
 *
 * @param {object} sb - Supabase service-role client with `auth.admin`
 * @param {object} [options]
 * @param {Function} options.sendEmail - Email transport returning `{ ok, id?, error? }`
 * @param {number} [options.maxSends=20] - Hard cap on Phase A Day-0 emails dispatched per run
 * @param {number} [options.maxDay1Sends=20] - Hard cap on Phase B Day-1 nudges dispatched per run
 * @param {number} [options.windowHours=48] - Phase A signup lookback window in hours
 * @param {number} [options.day1MinHours=20] - Minimum hours after Day-0 welcome before Day-1 nudge
 * @param {number} [options.day1MaxHours=96] - Maximum hours after Day-0 welcome for Day-1 nudge
 * @param {number} [options.now=Date.now()] - Reference timestamp in ms
 * @param {string} [options.siteUrl='https://smarter.poker'] - Public site origin
 * @param {string} [options.from] - Sender header passed to `sendEmail`
 * @param {number} [options.deadline] - Optional epoch ms deadline to stop early
 * @param {Function} [options.log] - Optional non-PII logger
 * @returns {Promise<{ sent: number, day1Sent: number, skipped: number, errors: string[], tracks: Record<string, number> }>}
 */
export async function runOrganicWelcomeDrip(
  sb,
  {
    sendEmail,
    maxSends = 20,
    maxDay1Sends = 20,
    windowHours = 48,
    day1MinHours = 20,
    day1MaxHours = 96,
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
  const safeWindowHours = Math.max(1, Number(windowHours) || 48);
  const safeDay1MinHours = Number.isFinite(Number(day1MinHours))
    ? Math.max(0, Number(day1MinHours))
    : 20;
  const safeDay1MaxHours = Number.isFinite(Number(day1MaxHours))
    ? Math.max(safeDay1MinHours, Number(day1MaxHours))
    : 96;
  const cutoffMs = nowMs - safeWindowHours * 3_600_000;
  const day1MinMs = safeDay1MinHours * 3_600_000;
  const day1MaxMs = safeDay1MaxHours * 3_600_000;

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

    const meta = extractMetadata(user);
    if (isSyntheticOrInvalidEmail(user?.email, meta)) {
      summary.skipped += 1;
      continue;
    }

    const landingPath =
      typeof meta.acquisition_landing_path === 'string'
        ? meta.acquisition_landing_path.trim()
        : '';
    const unlockKey =
      typeof meta.unlock_key === 'string'
        ? meta.unlock_key.trim()
        : '';
    if (!landingPath && !unlockKey) {
      summary.skipped += 1;
      continue;
    }

    const userId = String(user?.id || 'unknown');
    const firstName = extractFirstName(meta);

    // Phase B: Day-1 behavioral re-engagement nudge for unverified users
    // whose Day-0 welcome was sent between day1MinHours and day1MaxHours ago.
    if (meta.organic_welcome_sent_at) {
      if (meta.organic_day1_sent_at) {
        summary.skipped += 1;
        continue;
      }

      if (meta.phone_verified === true || String(meta.phone_verified || '').toLowerCase() === 'true') {
        summary.skipped += 1;
        continue;
      }

      const welcomeSentMs = Date.parse(meta.organic_welcome_sent_at || '');
      const elapsedMs = nowMs - welcomeSentMs;
      if (!Number.isFinite(welcomeSentMs) || elapsedMs < day1MinMs || elapsedMs > day1MaxMs) {
        summary.skipped += 1;
        continue;
      }

      if (summary.day1Sent >= safeMaxDay1Sends) {
        summary.skipped += 1;
        continue;
      }

      const resolvedTrack = resolveOrganicActivationTrack({ unlockKey, landingPath });
      const preferredTrack =
        typeof meta.organic_welcome_track === 'string' && meta.organic_welcome_track.trim()
          ? meta.organic_welcome_track.trim()
          : resolvedTrack;
      const day1Msg = buildDay1ActivationNudgeEmail({
        track: preferredTrack,
        firstName,
        siteUrl,
      });
      const finalTrack = day1Msg.track || resolvedTrack;

      let day1SendRes;
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
      } catch (err) {
        summary.errors.push(`day1 send ${userId}: ${String(err?.message || err).slice(0, 160)}`);
        continue;
      }

      if (!day1SendRes || day1SendRes.ok === false) {
        summary.errors.push(`day1 send ${userId}: ${String(day1SendRes?.error || 'send failed').slice(0, 160)}`);
        continue;
      }

      if (typeof sb.auth.admin.updateUserById === 'function' && user?.id) {
        try {
          const updateRes = await sb.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...meta,
              organic_day1_sent_at: sentAtIso,
            },
          });
          if (updateRes?.error) {
            summary.errors.push(`day1 stamp ${userId}: ${String(updateRes.error.message || updateRes.error).slice(0, 160)}`);
          }
        } catch (err) {
          summary.errors.push(`day1 stamp ${userId}: ${String(err?.message || err).slice(0, 160)}`);
        }
      }

      summary.day1Sent += 1;
      summary.tracks[finalTrack] = (summary.tracks[finalTrack] || 0) + 1;
      log(`[organic-welcome-drip] day1 sent user=${userId} track=${finalTrack}`);
      continue;
    }

    // Phase A: Day-0 organic activation welcome email within windowHours.
    const createdMs = Date.parse(user?.created_at || '');
    if (!Number.isFinite(createdMs) || createdMs < cutoffMs) {
      summary.skipped += 1;
      continue;
    }

    if (summary.sent >= safeMaxSends) {
      summary.skipped += 1;
      continue;
    }

    const track = resolveOrganicActivationTrack({ unlockKey, landingPath });
    const msg = buildOrganicWelcomeEmail({
      track,
      firstName,
      landingPath,
      siteUrl,
    });

    let sendRes;
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
    } catch (err) {
      summary.errors.push(`send ${userId}: ${String(err?.message || err).slice(0, 160)}`);
      continue;
    }

    if (!sendRes || sendRes.ok === false) {
      summary.errors.push(`send ${userId}: ${String(sendRes?.error || 'send failed').slice(0, 160)}`);
      continue;
    }

    if (typeof sb.auth.admin.updateUserById === 'function' && user?.id) {
      try {
        const updateRes = await sb.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...meta,
            organic_welcome_sent_at: sentAtIso,
            organic_welcome_track: track,
          },
        });
        if (updateRes?.error) {
          summary.errors.push(`stamp ${userId}: ${String(updateRes.error.message || updateRes.error).slice(0, 160)}`);
        }
      } catch (err) {
        summary.errors.push(`stamp ${userId}: ${String(err?.message || err).slice(0, 160)}`);
      }
    }

    summary.sent += 1;
    summary.tracks[track] = (summary.tracks[track] || 0) + 1;
    log(`[organic-welcome-drip] sent user=${userId} track=${track}`);
  }

  return summary;
}
