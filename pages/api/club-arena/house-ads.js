import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HOUSE ADS — the write path for smarter.poker's own promotions
 * ═══════════════════════════════════════════════════════════════════════════
 * GET    ?stats=1   list the catalog with impression / click rollups
 * POST             create an ad (+ its lobby placement)
 * PATCH            update an ad, or toggle it on and off
 * DELETE ?id=      remove an ad and its placements
 *
 * ── WHY THIS LIVES UNDER /api/club-arena AND NOT /api/admin ────────────────
 * The World Hub's edge middleware requires an MFA session cookie for any
 * non-GET under /api/admin/*. The Club Arena SPA has no MFA flow, so an admin
 * screen there would authenticate perfectly and then be refused at the edge on
 * every save. This route therefore sits with the other Club Arena endpoints
 * and does its own authorization, which is stricter than club admin:
 *
 *   PLATFORM ADMIN ONLY — profiles.role IN ('admin','super_admin').
 *
 * That is deliberate and worth stating plainly: house ads run in EVERY club's
 * lobby. A club owner may write their own announcements (that is what
 * /api/club-arena/announcements is for); nobody but smarter.poker staff may
 * put a message into somebody else's lobby.
 *
 * ── THE DATABASE IS THE SECOND LOCK ────────────────────────────────────────
 * `ad_catalog` and `ad_placement` have a SELECT policy and no write policy at
 * all, so RLS refuses every browser write regardless of this route. The
 * service-role client below is the only writer. A UI check alone is a
 * suggestion; this pairing is the rule.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn('[house-ads] SUPABASE_SERVICE_ROLE_KEY missing — writes will be blocked by RLS');
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const CATEGORIES = new Set([
    'vip', 'diamonds', 'spins', 'tournaments', 'bbj', 'mystery_bounty',
    'referral', 'feature', 'club', 'event', 'other',
]);
const SLOTS = new Set([
    'lobby_strip', 'session_summary', 'empty_state', 'hub_promotions', 'table_between_hands',
]);
const AUDIENCES = new Set(['all', 'non_vip', 'vip', 'new_player', 'returning']);

/** Trim, collapse newlines, and cap. Ad copy is one line in a 375px strip. */
function clean(value, max) {
    if (value == null) return null;
    const s = String(value).replace(/\s+/g, ' ').trim();
    if (!s) return null;
    return s.slice(0, max);
}

/**
 * EMOJI ARE A BUILD BREAK, NOT A STYLE PREFERENCE.
 * Both repos ban emoji in source because they break the SWC compiler; ad copy
 * is authored by a human in a form and stored in the database, so the compiler
 * is safe — but the house style is glyphs, and copy written here ends up
 * rendered beside glyph icons. Strip the pictographic ranges rather than
 * rejecting the save and losing what they typed.
 */
function stripEmoji(value) {
    if (value == null) return null;
    return String(value).replace(
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu,
        ''
    );
}

export default async function handler(req, res) {
    try {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }

        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        // ── Platform admin only. See the header for why this is not club admin.
        const { data: profile, error: roleErr } = await getSupabase()
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        if (roleErr) {
            console.warn('[house-ads] role read failed:', roleErr.message);
            return res.status(500).json({ success: false, error: 'Could not verify your access' });
        }
        if (!['admin', 'super_admin'].includes(profile?.role)) {
            return res.status(403).json({
                success: false,
                error: 'House ads are managed by smarter.poker staff only',
            });
        }

        // ── GET: the catalog, with performance ────────────────────────────
        if (req.method === 'GET') {
            const { data: ads, error: adsErr } = await getSupabase()
                .from('ad_catalog')
                .select('id, ad_key, category, headline, body, glyph, target_url, cta_label, is_active, starts_at, ends_at, weight, created_at')
                .order('weight', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(200);
            if (adsErr) {
                console.warn('[house-ads] catalog read failed:', adsErr.message);
                return res.status(500).json({ success: false, error: 'Could not load the ad catalog' });
            }

            const { data: placements, error: plErr } = await getSupabase()
                .from('ad_placement')
                .select('id, ad_id, slot, club_id, audience, daily_cap, is_active')
                .limit(1000);
            if (plErr) console.warn('[house-ads] placement read failed:', plErr.message);

            /* Rollups. A failed stats read must NOT fail the page: the editor
               is still usable without numbers, and rendering zeroes would be
               worse than rendering nothing — a confident zero reads as "this
               campaign got no clicks" rather than "we could not count". */
            /* COUNTED IN POSTGRES, AND BROKEN DOWN BY SLOT (2026-08-28).
             *
             * This used to read `.from('ad_event').select(...).limit(50000)`
             * and tally in JavaScript. Two problems, both of the same species
             * as everything else this system exists to end.
             *
             * The limit was a silent ceiling. This table logs an impression
             * per ad per page load, so 50,000 arrives; PostgREST would return
             * the first 50,000 and this route would report the total with
             * complete confidence, under-counting a little more every day and
             * never saying so.
             *
             * And the tally was keyed on ad_id alone, which was right when one
             * slot existed. `bbj_running` now runs on four surfaces, so one
             * blended number told an operator nothing about which of them is
             * working - and the obvious action on a bad blended number (turn
             * the campaign off) can be exactly wrong.
             *
             * fn_ad_stats does both in the database: no ceiling, and a row per
             * ad per slot. `last_event_at` is there so a surface that has
             * STOPPED reporting is as visible as one that never started.
             *
             * `stats` stays null on any failure. A confident zero reads as
             * "this campaign got no clicks" when the truth is "we could not
             * count", which is the exact class of lie this panel exists to
             * avoid. */
            let stats = null;
            let statsBySlot = null;
            const { data: rows, error: evErr } = await getSupabase().rpc('fn_ad_stats');
            if (evErr) {
                console.warn('[house-ads] stats read failed:', evErr.message);
            } else {
                stats = {};
                statsBySlot = {};
                for (const r of rows || []) {
                    const total = (stats[r.ad_id] ||= { impressions: 0, clicks: 0, dismisses: 0 });
                    total.impressions += Number(r.impressions) || 0;
                    total.clicks += Number(r.clicks) || 0;
                    total.dismisses += Number(r.dismisses) || 0;

                    const perAd = (statsBySlot[r.ad_id] ||= {});
                    perAd[r.slot] = {
                        impressions: Number(r.impressions) || 0,
                        clicks: Number(r.clicks) || 0,
                        dismisses: Number(r.dismisses) || 0,
                        lastEventAt: r.last_event_at || null,
                    };
                }
            }

            /* WHY A SURFACE IS QUIET (2026-08-28).
             *
             * Views and clicks say what happened. They cannot say what did NOT
             * happen, and a silent surface has three completely different
             * causes: no placement, no audience match, or everybody already
             * capped out for the day. Until now those were one silence.
             *
             * fn_ad_suppression counts PEOPLE per placement over the rolling
             * 24h window - reached, and no longer reachable. Its predecessor
             * counted the caller's own impressions, which is the right unit
             * for a player debugging their own screen and useless to the only
             * person who ever asks: this panel is staff-only, so that version
             * would have answered "is this one staff member capped".
             *
             * Same null-means-could-not-count rule as the stats above. */
            let suppression = null;
            const { data: supRows, error: supErr } = await getSupabase().rpc('fn_ad_suppression');
            if (supErr) {
                console.warn('[house-ads] suppression read failed:', supErr.message);
            } else {
                suppression = {};
                for (const r of supRows || []) {
                    const perAd = (suppression[r.ad_id] ||= {});
                    perAd[r.slot] = {
                        dailyCap: r.daily_cap == null ? null : Number(r.daily_cap),
                        servedUsers24h: Number(r.served_users_24h) || 0,
                        cappedUsers24h: Number(r.capped_users_24h) || 0,
                    };
                }
            }

            /* DID THE ADVERT WORK (2026-08-28).
             *
             * A click is attention, not a result. `vip_upsell` has clicks; did
             * anybody buy VIP? Until now the panel showed the same two numbers
             * for a campaign that converts a third of its clicks and one that
             * converts none, and turning the wrong one off is an easy mistake
             * to make from a rate alone.
             *
             * fn_ad_conversions asks whether the SAME PLAYER did the thing the
             * campaign promotes within 24 hours of clicking. That is
             * correlation inside a window and not proof of cause - a player
             * who was going to subscribe anyway is counted - which is why the
             * field is called clicksFollowedBy rather than conversions.
             *
             * `conversionRule` is null for a campaign with no defined outcome
             * (bbj_running: reading a jackpot page is not a database event).
             * Its count is null too, never 0: a confident zero would read as
             * "converts nobody" when the truth is "success is undefined here". */
            let conversions = null;
            const { data: convRows, error: convErr } =
                await getSupabase().rpc('fn_ad_conversions', { p_window_hours: 24 });
            if (convErr) {
                console.warn('[house-ads] conversion read failed:', convErr.message);
            } else {
                conversions = {};
                for (const r of convRows || []) {
                    const perAd = (conversions[r.ad_id] ||= {});
                    perAd[r.slot] = {
                        clicks: Number(r.clicks) || 0,
                        clicksFollowedBy:
                            r.clicks_followed_by == null ? null : Number(r.clicks_followed_by),
                        conversionRule: r.conversion_rule || null,
                    };
                }
            }

            return res.status(200).json({
                success: true,
                ads: ads || [],
                placements: placements || [],
                stats, // null means "could not count", NOT "zero"
                statsBySlot, // { adId: { slot: { impressions, clicks, dismisses, lastEventAt } } }
                suppression, // { adId: { slot: { dailyCap, servedUsers24h, cappedUsers24h } } }
                conversions, // { adId: { slot: { clicks, clicksFollowedBy, conversionRule } } }
            });
        }

        // ── POST: create ──────────────────────────────────────────────────
        if (req.method === 'POST') {
            const b = req.body || {};
            const adKey = clean(b.ad_key, 64)?.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            const headline = stripEmoji(clean(b.headline, 120));
            const category = String(b.category || 'other');

            if (!adKey) return res.status(400).json({ success: false, error: 'A key is required' });
            if (!headline) return res.status(400).json({ success: false, error: 'A headline is required' });
            if (!CATEGORIES.has(category)) {
                return res.status(400).json({ success: false, error: 'Unknown category' });
            }

            const weight = Number.isFinite(Number(b.weight))
                ? Math.max(0, Math.min(1000, Math.round(Number(b.weight))))
                : 100;

            const { data: created, error: insErr } = await getSupabase()
                .from('ad_catalog')
                .insert({
                    ad_key: adKey,
                    category,
                    headline,
                    body: stripEmoji(clean(b.body, 240)),
                    glyph: stripEmoji(clean(b.glyph, 4)),
                    target_url: clean(b.target_url, 300),
                    cta_label: stripEmoji(clean(b.cta_label, 40)),
                    is_active: b.is_active !== false,
                    starts_at: b.starts_at || null,
                    ends_at: b.ends_at || null,
                    weight,
                    created_by: user.id,
                })
                .select('id')
                .maybeSingle();

            if (insErr) {
                // A duplicate key is a person's mistake, not a server fault.
                if (String(insErr.code) === '23505') {
                    return res.status(409).json({ success: false, error: 'That ad key is already in use' });
                }
                console.warn('[house-ads] insert failed:', insErr.message);
                return res.status(500).json({ success: false, error: 'Could not create that ad' });
            }

            // An ad with no placement runs nowhere, which is the commonest way
            // to "publish" something and see nothing happen. Default it into
            // the lobby strip unless the caller says otherwise.
            const slot = SLOTS.has(String(b.slot)) ? String(b.slot) : 'lobby_strip';
            const audience = AUDIENCES.has(String(b.audience)) ? String(b.audience) : 'all';
            const dailyCap = Number.isFinite(Number(b.daily_cap)) && Number(b.daily_cap) > 0
                ? Math.round(Number(b.daily_cap))
                : null;

            const { error: plInsErr } = await getSupabase().from('ad_placement').insert({
                ad_id: created.id,
                slot,
                club_id: b.club_id || null,
                audience,
                daily_cap: dailyCap,
                is_active: true,
            });
            if (plInsErr) {
                /* The ad row exists but has no placement, which means it runs
                   NOWHERE. Reporting a bare success here would be the exact
                   failure this whole system was built to stop: you publish, and
                   nothing happens, and nothing tells you why. Keep the ad (the
                   copy is not lost) and say plainly that it is not live. */
                console.warn('[house-ads] placement insert failed:', plInsErr.message);
                return res.status(200).json({
                    success: true,
                    id: created.id,
                    placed: false,
                    // Title Case: this string renders in the Club Arena admin
                    // banner alongside the house-style notices.
                    warning: 'The Ad Was Saved But Is Not Running Anywhere Yet. Set Its Placement And Try Again.',
                });
            }

            return res.status(200).json({ success: true, id: created.id, placed: true });
        }

        // ── PATCH: update / toggle ────────────────────────────────────────
        if (req.method === 'PATCH') {
            const b = req.body || {};
            const id = clean(b.id, 64);
            if (!id) return res.status(400).json({ success: false, error: 'Which ad?' });

            const patch = { updated_at: new Date().toISOString() };
            if (b.headline !== undefined) patch.headline = stripEmoji(clean(b.headline, 120));
            if (b.body !== undefined) patch.body = stripEmoji(clean(b.body, 240));
            if (b.glyph !== undefined) patch.glyph = stripEmoji(clean(b.glyph, 4));
            if (b.target_url !== undefined) patch.target_url = clean(b.target_url, 300);
            if (b.cta_label !== undefined) patch.cta_label = stripEmoji(clean(b.cta_label, 40));
            if (b.is_active !== undefined) patch.is_active = b.is_active === true;
            if (b.starts_at !== undefined) patch.starts_at = b.starts_at || null;
            if (b.ends_at !== undefined) patch.ends_at = b.ends_at || null;
            if (b.category !== undefined && CATEGORIES.has(String(b.category))) {
                patch.category = String(b.category);
            }
            if (b.weight !== undefined && Number.isFinite(Number(b.weight))) {
                patch.weight = Math.max(0, Math.min(1000, Math.round(Number(b.weight))));
            }
            if (!patch.headline && Object.keys(patch).length === 1) {
                return res.status(400).json({ success: false, error: 'Nothing to change' });
            }

            /* .select() IS NOT DECORATION HERE. Without it PostgREST answers a
               zero-row match with { error: null }, so editing an ad that was
               deleted in another tab would report "Saved" and change nothing.
               Ask which row was touched and say so honestly. */
            const { data: updated, error: updErr } = await getSupabase()
                .from('ad_catalog')
                .update(patch)
                .eq('id', id)
                .select('id');
            if (updErr) {
                console.warn('[house-ads] update failed:', updErr.message);
                return res.status(500).json({ success: false, error: 'Could not save that change' });
            }
            if (!updated || updated.length === 0) {
                return res.status(404).json({ success: false, error: 'That ad no longer exists' });
            }
            return res.status(200).json({ success: true });
        }

        // ── DELETE ────────────────────────────────────────────────────────
        if (req.method === 'DELETE') {
            const id = clean(req.query?.id, 64);
            if (!id) return res.status(400).json({ success: false, error: 'Which ad?' });
            // ad_placement and ad_event cascade on the FK.
            // .select() for the same reason as PATCH above: deleting nothing
            // must not report a successful delete.
            const { data: deleted, error: delErr } = await getSupabase()
                .from('ad_catalog')
                .delete()
                .eq('id', id)
                .select('id');
            if (delErr) {
                console.warn('[house-ads] delete failed:', delErr.message);
                return res.status(500).json({ success: false, error: 'Could not delete that ad' });
            }
            if (!deleted || deleted.length === 0) {
                return res.status(404).json({ success: false, error: 'That ad no longer exists' });
            }
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
        console.warn('[house-ads] error:', err?.message || err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
