import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * DELETE ACCOUNT API
 * DELETE /api/auth/delete-account
 * Auth: Bearer token required
 *
 * Closes the caller's account: the person is removed, the books are kept.
 * Called by the World Hub settings page and by the Club Arena app.
 *
 * [2026-09-29] NOBODY COULD DELETE THEIR ACCOUNT. This endpoint used to
 * hard-delete rows with the service role and then hard-delete the Auth user.
 * The database had since made two things true that it was never taught:
 *   1. service_role has no write privilege on cashout_requests, so the first
 *      write ("cancel pending cashouts") failed with 42501 for every account;
 *   2. financial journals are append-only, every account is born with one
 *      (The Mint's signup grant in diamond_transactions), and that journal
 *      references profiles AND auth.users ON DELETE CASCADE - so deleting
 *      either is refused (P0403) for every account.
 * Found from the Club Arena app on the Android emulator (Close My Account ->
 * 500). Apple (App Review 5.1.1(v)) and Google Play require in-app deletion.
 *
 * Now: the database closes the account in one transaction
 * (public.fn_close_account, Club Arena migration 20260929051751: refuses
 * while money or authority remains, leaves every club the way the club's own
 * departure path does, deletes personal non-financial rows, scrubs the person
 * from the profile, records gdpr_deletion_requests), then the person's
 * picture files are removed through the Storage API, then the Auth user is
 * SOFT-deleted (email and phone obfuscated, identities and sessions removed,
 * the row kept so nothing cascades into the journals), then the erasure
 * request is marked completed. Financial journals stay, keyed by an id that
 * no longer points at anyone. There is no grace window and no recovery.
 *
 * [2026-09-29] THE PICTURES STAYED. Closing cleared the links to the person's
 * pictures but left the files, and anyone can list social-media avatars/%
 * (the preset gallery's policy), so a closed account's uploaded photo stayed
 * findable by its id. fn_close_account now also deletes the rows that point
 * at pictures (Club Arena migration 20260929065410), and this handler removes
 * the files: see theirPictures below.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { rateLimit } from '../../../src/lib/apiRateLimit';
import { requireRecentMfa } from '../../../src/lib/mfaGate';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/**
 * What each refusal from fn_close_account tells the player. Both callers show
 * `error` as it is, so each one is the whole instruction. A reason missing
 * here answers 500 "contact support" and closes nothing.
 */
export const REFUSALS = {
    seated: 'You are still seated at a table. Leave the table, then close your account.',
    tournament_entry: 'You are registered or playing in a tournament. Unregister or finish it, then close your account.',
    pending_cashout: 'A cashout request is still in progress. Wait for your club to finish or decline it, then close your account.',
    escrow: 'Some of your chips are held in escrow. Wait for your club to release them, then close your account.',
    chip_request: 'A chip request is still pending. Cancel it or wait for your club to answer, then close your account.',
    club_chips: 'You still hold chips, credit or a balance in a club. Cash out or settle it with your agent, then close your account.',
    wallet_balance: 'Your wallet still holds a balance. Settle it, then close your account.',
    open_ticket: 'You hold an unused tournament ticket. Use it or ask your club to cancel it, then close your account.',
    club_agent: 'You are an agent in a club. Ask the club owner to remove your agent role, then close your account.',
    downline: 'Players in a club are still assigned to you. Ask the club owner to move them, then close your account.',
    club_owner: 'You own a club. Transfer it or close it, then close your account.',
    club_staff: 'You are staff in a club. Ask the owner to change your role to player, then close your account.',
    union_owner: 'You own a union. Transfer it, then close your account.',
    financial: 'Something in a club still holds value for you, such as a rakeback payout or unclaimed commission. Settle it with your club, then close your account.',
};

/**
 * Where the Hub keeps a person's pictures. fn_close_account clears the links
 * and deletes the rows that point at them (user_avatars, user_media,
 * user_albums); a stored file can only be removed through the Storage API, so
 * this handler removes the files once the database has answered ok.
 *   - social-media avatars/<id>/ and covers/<id>/: the profile photo and the
 *     cover they uploaded (pages/api/social/upload-url.js, upload.js).
 *   - user-media <id>/photos/ and <id>/videos/: the profile editor's media
 *     library (src/components/social/MediaLibrary.js). Not <id>/messages/ or
 *     <id>/bankroll/: those belong to conversations and records that stay.
 *   - avatars <id>/: an avatar generated for the account.
 *   - custom-avatars generated/: avatars made from their photo, their words
 *     or an edit (pages/api/avatar/*), each named with their id.
 * `prefix` is a file-name prefix inside `folder`. The Storage search matches
 * it loosely (case-insensitive, `_` is a wildcard), so every name is checked
 * against it exactly before anything is removed.
 */
export function theirPictures(userId) {
    return [
        { bucket: 'social-media', folder: `avatars/${userId}` },
        { bucket: 'social-media', folder: `covers/${userId}` },
        { bucket: 'user-media', folder: `${userId}/photos` },
        { bucket: 'user-media', folder: `${userId}/videos` },
        { bucket: 'avatars', folder: userId },
        { bucket: 'custom-avatars', folder: 'generated', prefix: `likeness_${userId}_` },
        { bucket: 'custom-avatars', folder: 'generated', prefix: `${userId}_` },
        { bucket: 'custom-avatars', folder: 'generated', prefix: `edited_${userId}_` },
    ];
}

const PICTURE_PAGE = 100;
const PICTURE_PAGES_MAX = 50;

/**
 * Removes every file in each place in theirPictures(userId). Answers how many
 * went and, per place, what could not be listed or removed. Never throws.
 */
async function removeTheirPictures(storage, userId) {
    let removed = 0;
    const failures = [];
    for (const place of theirPictures(userId)) {
        const where = `${place.bucket}:${place.folder}/${place.prefix ? `${place.prefix}*` : ''}`;
        try {
            const bucket = storage.from(place.bucket);
            let offset = 0;
            let finished = false;
            for (let page = 0; page < PICTURE_PAGES_MAX; page += 1) {
                const { data, error } = await bucket.list(place.folder, {
                    limit: PICTURE_PAGE,
                    offset,
                    ...(place.prefix ? { search: place.prefix } : {}),
                });
                if (error) {
                    failures.push(`${where} could not be listed: ${error.message || error}`);
                    finished = true;
                    break;
                }
                const entries = Array.isArray(data) ? data : [];
                // A file has an id; a sub-folder does not and is left alone.
                const names = entries
                    .filter((entry) => entry && entry.id && typeof entry.name === 'string' && entry.name !== '')
                    .filter((entry) => !place.prefix || entry.name.startsWith(place.prefix))
                    .map((entry) => `${place.folder}/${entry.name}`);
                if (names.length > 0) {
                    const { error: removeError } = await bucket.remove(names);
                    if (removeError) {
                        failures.push(`${where} could not be removed: ${removeError.message || removeError}`);
                        finished = true;
                        break;
                    }
                    removed += names.length;
                }
                if (entries.length < PICTURE_PAGE) {
                    finished = true;
                    break;
                }
                // Removed files leave the listing; what was kept moves the page on.
                offset += entries.length - names.length;
            }
            if (!finished) failures.push(`${where} holds more than ${PICTURE_PAGE * PICTURE_PAGES_MAX} entries`);
        } catch (err) {
            failures.push(`${where} failed: ${err?.message || err}`);
        }
    }
    return { removed, failures };
}

export default async function handler(req, res) {
  const rl = rateLimit(req, { max: 3, windowMs: 3600000 }); // 3 per hour
  if (!rl.ok) return res.status(429).json({ error: 'Too many requests', retryAfter: rl.retryAfter });
  try {
      if (req.method !== 'DELETE') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // ── AUTH CHECK ──
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Not authenticated' });
      }

      const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
      if (authErr || !user) {
          return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // ── [Phase 6.1.27] Step-up MFA gate ─────────────────────────────────
      // Closing an account cannot be undone. A stolen 12h mfa_session cookie
      // can't be allowed to trigger it - require a fresh (within-5-min)
      // second-factor confirmation.
      //
      // If the user has no MFA enrolled at all, the rate limit is the gate
      // (they can still close, just more slowly). This prevents soft-locking
      // accounts that never enrolled a second factor.
      {
          const { data: factor } = await getSupabase()
              .from('user_mfa_factors')
              .select('enabled')
              .eq('user_id', user.id)
              .maybeSingle();
          if (factor?.enabled) {
              const gate = await requireRecentMfa(req, getSupabase(), user);
              if (!gate.ok) {
                  return res.status(gate.status || 403).json({
                      error: gate.reason || 'Step-up confirmation required',
                      requiresMfa: true,
                      requiresStepUp: gate.requiresStepUp === true,
                      maxAgeSec: gate.maxAgeSec,
                  });
              }
          }
      }

      const userId = user.id;

      // ── 1. The database closes the account, in one transaction ──
      const { data: closed, error: closeErr } = await getSupabase().rpc('fn_close_account', {
          p_user_id: userId,
      });
      if (closeErr) {
          console.error('[delete-account] CRITICAL: fn_close_account failed:', closeErr.message);
          return res.status(500).json({
              success: false,
              error: 'Your account could not be closed. Nothing was changed. Please try again, or contact support.',
          });
      }
      if (!closed?.ok) {
          const refusal = Object.prototype.hasOwnProperty.call(REFUSALS, closed?.reason)
              ? REFUSALS[closed.reason]
              : null;
          if (refusal) {
              return res.status(400).json({
                  success: false,
                  error: refusal,
                  reason: closed.reason,
                  ...(Array.isArray(closed.blockers) ? { blockers: closed.blockers } : {}),
              });
          }
          console.error('[delete-account] CRITICAL: fn_close_account refused with an unknown reason:', closed?.reason);
          return res.status(500).json({
              success: false,
              error: 'Your account could not be closed. Nothing was changed. Please contact support.',
          });
      }

      // ── 2. Their pictures leave with them ──
      // The database has cleared the links and deleted the rows that point at
      // the files; the files go through the Storage API. Also on a retry
      // (already_closed), so a retry finishes this step too. A file that
      // cannot be removed does not keep the account open: the closure goes
      // on, the failure is reported, and the erasure request stays
      // 'anonymized' so support can see it and finish.
      const pictures = await removeTheirPictures(getSupabase().storage, userId);
      const picturesRemoved = pictures.failures.length === 0;
      if (!picturesRemoved) {
          console.error('[delete-account] pictures not all removed; request stays anonymized:', closed.request_id, pictures.failures.join(' | '));
          try {
              reportApiError(new Error(`delete-account: ${pictures.failures.length} picture place(s) not cleared for erasure request ${closed.request_id}`), req);
          } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
      }

      // ── 3. Soft-delete the Auth user ──
      // Soft, on purpose: a hard delete removes the auth.users row, which
      // cascades into the append-only financial journals and is refused.
      // Soft-delete obfuscates the email and phone, removes the identities
      // and sessions, and keeps the row, so the login is gone for good.
      const { error: deleteError } = await getSupabase().auth.admin.deleteUser(userId, true);
      if (deleteError) {
          console.error('[delete-account] CRITICAL: auth soft-delete failed AFTER the profile was scrubbed:', deleteError.message);
          return res.status(500).json({
              success: false,
              error: 'Your personal data was removed, but your login could not be closed. Please contact support so this can be completed.',
              dataRemoved: true,
              loginRemoved: false,
          });
      }

      // ── 4. The erasure record says it finished ──
      // Best effort: the account IS closed either way. A request left at
      // 'anonymized' is visible to support in gdpr_deletion_requests - and is
      // left there on purpose while a picture could not be removed.
      if (closed.request_id && picturesRemoved) {
          try {
              const { error: markErr } = await getSupabase().rpc('fn_mark_gdpr_completed', {
                  p_request_id: closed.request_id,
              });
              if (markErr) {
                  console.warn('[delete-account] fn_mark_gdpr_completed failed; request stays anonymized:', closed.request_id, markErr.message);
              }
          } catch (markErr) {
              console.warn('[delete-account] fn_mark_gdpr_completed threw; request stays anonymized:', closed.request_id, markErr?.message || markErr);
          }
      }

      console.info('[delete-account] Account closed.');
      return res.status(200).json({
          success: true,
          message: 'Your account has been closed and your personal data removed.',
          picturesRemoved,
      });
  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
