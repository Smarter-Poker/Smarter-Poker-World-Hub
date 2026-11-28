/**
 * Live Idempotent Day-0, Day-1, Day-3 & Series Reminder Organic Drip Runner
 * =========================================================================
 * Rides inside the existing hourly `/api/cron/signup-welcome-back` job
 * (CLAUDE.md section 11 forbids adding a net-new cron route).
 *
 * Performs a single bounded `listUsers({ page: 1, perPage: 100 })` pass,
 * filters out synthetic probes and invalid addresses, and executes four phases
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
 *   - Phase D (Real saved series event reminders): inspects `sp_saved_spots_v1`
 *     for ANY non-synthetic user (even if verified or past Day-0/1/3) for
 *     entries with `kind === 'series-reminder'`, no `reminded_at`, and a valid
 *     `eventDate || startDate` within `[nowMs, nowMs + reminderLeadHours * 3_600_000]`
 *     (default 24h so T-2h is caught reliably on the hourly cron). Dispatches
 *     `buildSeriesEventReminderEmail` (capped at `maxReminderSends`) and stamps
 *     `reminded_at` onto that exact spot entry without clobbering sibling spots
 *     or other metadata.
 *
 * Never throws; always returns `{ sent, day1Sent, day3Sent, remindersSent, skipped, errors, tracks }`.
 */

import {
  buildDay1ActivationNudgeEmail,
  buildDay3VipUrgencyEmail,
  buildOrganicWelcomeEmail,
  buildSeriesEventReminderEmail,
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
 * re-engagement nudges (Phase B), Day-3 VIP urgency nudges (Phase C), and
 * upcoming saved series event reminders (Phase D) in a single bounded user
 * pass, strictly idempotent via `user_metadata`.
 *
 * @param {object} sb - Supabase service-role client with `auth.admin`
 * @param {object} [options]
 * @param {Function} options.sendEmail - Email transport returning `{ ok, id?, error? }`
 * @param {number} [options.maxSends=20] - Hard cap on Phase A Day-0 emails dispatched per run
 * @param {number} [options.maxDay1Sends=20] - Hard cap on Phase B Day-1 nudges dispatched per run
 * @param {number} [options.maxDay3Sends=20] - Hard cap on Phase C Day-3 VIP nudges dispatched per run
 * @param {number} [options.maxReminderSends=20] - Hard cap on Phase D series event reminders per run
 * @param {number} [options.windowHours=48] - Phase A signup lookback window in hours
 * @param {number} [options.day1MinHours=20] - Minimum hours after Day-0 welcome before Day-1 nudge
 * @param {number} [options.day1MaxHours=96] - Maximum hours after Day-0 welcome for Day-1 nudge
 * @param {number} [options.day3MinHours=68] - Minimum hours after Day-0 welcome before Day-3 VIP nudge
 * @param {number} [options.day3MaxHours=168] - Maximum hours after Day-0 welcome for Day-3 VIP nudge
 * @param {number} [options.reminderLeadHours=24] - Lookahead window in hours for upcoming saved series reminders
 * @param {number} [options.now=Date.now()] - Reference timestamp in ms
 * @param {string} [options.siteUrl='https://smarter.poker'] - Public site origin
 * @param {string} [options.from] - Sender header passed to `sendEmail`
 * @param {number} [options.deadline] - Optional epoch ms deadline to stop early
 * @param {Function} [options.log] - Optional non-PII logger
 * @returns {Promise<{ sent: number, day1Sent: number, day3Sent: number, remindersSent: number, skipped: number, errors: string[], tracks: Record<string, number> }>}
 */
export async function runOrganicWelcomeDrip(
  sb,
  {
    sendEmail,
    maxSends = 20,
    maxDay1Sends = 20,
    maxDay3Sends = 20,
    maxReminderSends = 20,
    windowHours = 48,
    day1MinHours = 20,
    day1MaxHours = 96,
    day3MinHours = 68,
    day3MaxHours = 168,
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
    remindersSent: 0,
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
  const safeReminderLeadHours = Number.isFinite(Number(reminderLeadHours))
    ? Math.max(0, Number(reminderLeadHours))
    : 24;

  const cutoffMs = nowMs - safeWindowHours * 3_600_000;
  const day1MinMs = safeDay1MinHours * 3_600_000;
  const day1MaxMs = safeDay1MaxHours * 3_600_000;
  const day3MinMs = safeDay3MinHours * 3_600_000;
  const day3MaxMs = safeDay3MaxHours * 3_600_000;
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
        }
      }
    }

    if (!userHandled && !hadError) {
      summary.skipped += 1;
    }
  }

  return summary;
}
