import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HOUSE ADS — the write path for smarter.poker's own promotions
 * ═══════════════════════════════════════════════════════════════════════════
 * GET                      the catalog, its placements, and performance
 * POST                     create an ad (+ its first placement)
 * PATCH                    update an ad, or toggle it on and off
 * DELETE ?id=              remove an ad and its placements
 * POST   ?kind=placement   add a placement to an existing ad
 * PATCH  ?kind=placement   change a placement's slot, audience, cap or state
 * DELETE ?kind=placement&id=  remove one placement, leaving the ad
 *
 * The placement verbs were added on 2026-08-28. Before them an advert could be
 * given one placement at birth and never moved: no second surface, no cap
 * change, no pausing one surface while another kept running. Every multi-slot
 * placement in production had been written by an agent in a migration.
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

/**
 * A PLACEMENT IS WHERE AND TO WHOM, AND UNTIL NOW IT COULD ONLY BE BORN.
 *
 * POST created exactly one placement and PATCH never touched ad_placement at
 * all, so the panel could make a campaign live on one surface and then never
 * move it: no second surface, no cap change, no pausing one surface while
 * leaving another running. Every multi-slot placement in production was
 * written by an agent in a migration.
 *
 * These read the three fields a placement actually carries.
 *
 * AN UNKNOWN SLOT IS REFUSED, NOT DEFAULTED. The first version of this file
 * fell back to 'lobby_strip' and 'all', on the reasoning that the panel only
 * ever sends values from its own selects, so defaulting was kinder than a save
 * that fails on a field the operator cannot see. That reasoning is wrong, and
 * on PATCH it is dangerous: a request naming a slot this server does not know
 * would MOVE A LIVE PLACEMENT TO A SURFACE NOBODY ASKED FOR, answer "Saved",
 * and show the operator a panel that disagrees with the database. Silently
 * writing something other than what was asked for is the single failure shape
 * this estate keeps paying for.
 *
 * The kindness argument also had it backwards. A refusal names the field and
 * the value; a default is discovered weeks later as an advert on the wrong
 * screen. If the panel ever does send a bad value, a 400 is how we find out.
 *
 * Returning null for "not acceptable" keeps the two callers honest, because
 * null cannot be written to a NOT NULL column by accident.
 */
function readSlot(value) {
    const s = String(value);
    return SLOTS.has(s) ? s : null;
}
function readAudience(value) {
    const s = String(value);
    return AUDIENCES.has(s) ? s : null;
}
/** A cap of 0 means nothing. NULL means uncapped; a positive integer caps. */
function normaliseDailyCap(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * AN AD IMAGE IS A URL EVERY VIEWER'S BROWSER WILL FETCH.
 *
 * A destination is checked before a browser is sent to it; an image is the
 * same question one step earlier, and worse, because the fetch happens without
 * the viewer doing anything. An external host would mean every player's IP and
 * user agent handed to a third party chosen by whoever typed the URL into this
 * panel. Same-origin paths only, and the database carries the same CHECK so
 * this is the courteous refusal rather than the lock.
 */
/**
 * A ROOTED, SAME-ORIGIN PATH, OR A REFUSAL THAT SAYS SO.
 *
 * Two problems this fixes at once, and it replaces `cleanImageUrl`, which had
 * the first of them.
 *
 * `cleanImageUrl` called itself "the courteous refusal" and refused nothing:
 * an outside host returned null, the row saved, the panel said "Saved.", and
 * the field came back empty. The operator was left to guess. That is the same
 * silent-write shape readSlot's comment was written to end.
 *
 * `target_url` had no check on this side at all. Every client has one -
 * isSafeAdTarget in Club Arena, isSafeHubDestination on the Hub - so an
 * `https://` destination typed into this panel was stored, served, rendered,
 * and then refused at the last moment by the browser that got it. The ad
 * looked live everywhere an operator could see it and was dead everywhere a
 * player could.
 *
 * The rule is the clients' rule, so that what this accepts is exactly what
 * they will follow: starts with `/`, is not protocol-relative, and carries no
 * backslash (browsers normalise `/\evil.example` toward `//evil.example`).
 *
 * Three return values, and the callers must tell them apart:
 *   null   - absent. Leave it alone, or clear it. Not an error.
 *   string - acceptable, and this is what to store.
 *   false  - present and refused. The caller returns 400 naming the value.
 */
function readSitePath(value) {
    const url = clean(value, 300);
    if (!url) return null;
    if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return false;
    return url;
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
            /* THE LAST TWO SILENT CEILINGS (2026-08-28).
             *
             * The stats read used to carry .limit(50000) and report the total
             * with complete confidence once it passed it; that one is gone,
             * counted in Postgres. These two are the same shape, further away:
             * a catalog of 201 adverts, or a 1001st placement, would simply
             * stop being mentioned, and the panel would look complete.
             *
             * Asking PostgREST for an exact count costs one header and turns a
             * silent truncation into a stated one. The limits stay - loading
             * ten thousand rows into an editor helps nobody - but the page now
             * says when it is showing you a subset instead of pretending it is
             * everything. */
            const { data: ads, error: adsErr, count: adsTotal } = await getSupabase()
                .from('ad_catalog')
                .select(
                    'id, ad_key, category, headline, body, glyph, target_url, cta_label, is_active, starts_at, ends_at, weight, created_at',
                    { count: 'exact' }
                )
                .order('weight', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(200);
            if (adsErr) {
                console.warn('[house-ads] catalog read failed:', adsErr.message);
                return res.status(500).json({ success: false, error: 'Could not load the ad catalog' });
            }

            const { data: placements, error: plErr, count: placementsTotal } = await getSupabase()
                .from('ad_placement')
                .select('id, ad_id, slot, club_id, audience, daily_cap, is_active', {
                    count: 'exact',
                })
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
                        /* PEOPLE, NOT EVENTS (2026-08-28). The lobby logs one
                           impression per advert per page load, so a player who
                           reloads thirty times is thirty impressions and one
                           person. Production today: spins_jackpot has 65
                           impressions on lobby_strip and 5 viewers. Read as
                           reach, 65 is a campaign doing well; 5 is the truth.
                           Both are shown, because the ratio between them is
                           frequency. */
                        viewers: Number(r.viewers) || 0,
                        clickers: Number(r.clickers) || 0,
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

            /* A CAMPAIGN CAN DECAY AND EVERY LIFETIME TOTAL STAYS FINE
             * (2026-08-28).
             *
             * Everything else here is a lifetime figure, so a campaign that
             * worked for three weeks and has done nothing since looks the same
             * as one working today - the averages absorb the decline, and the
             * longer it runs the more inertia its own history gives it.
             * `lastEventAt` catches a surface that stopped dead; it says
             * nothing about one that is quietly halving.
             *
             * Fourteen days is enough to see a direction without turning the
             * response into a report. Same null-means-could-not-count rule. */
            let daily = null;
            const { data: dayRows, error: dayErr } =
                await getSupabase().rpc('fn_ad_daily', { p_days: 14 });
            if (dayErr) {
                console.warn('[house-ads] daily read failed:', dayErr.message);
            } else {
                daily = {};
                for (const r of dayRows || []) {
                    const perAd = (daily[r.ad_id] ||= {});
                    const perSlot = (perAd[r.slot] ||= []);
                    perSlot.push({
                        day: r.day,
                        impressions: Number(r.impressions) || 0,
                        clicks: Number(r.clicks) || 0,
                        viewers: Number(r.viewers) || 0,
                    });
                }
                // Oldest first, so a caller can read it left to right.
                for (const perAd of Object.values(daily)) {
                    for (const series of Object.values(perAd)) {
                        series.sort((a, b) => String(a.day).localeCompare(String(b.day)));
                    }
                }
            }

            /* RETENTION, BECAUSE A DELETE NOBODY CAN SEE IS NOT A POLICY.
             *
             * fn_prune_ad_events has existed since 20260828100000 with no
             * caller: a loaded delete, unscheduled and unpreviewable. It could
             * not be scheduled either - CLAUDE.md section 11 makes Open Claw
             * the only sanctioned scheduler, and 11.3 fails CI on a net-new
             * pages/api/cron/ file - so it goes in the operator's hands
             * instead, with the blast radius shown BEFORE the button.
             *
             * Same null rule as everything else here: null is "could not
             * read", never "nothing to prune". */
            let retention = null;
            const { data: retRows, error: retErr } =
                await getSupabase().rpc('fn_ad_retention_status');
            if (retErr) {
                console.warn('[house-ads] retention read failed:', retErr.message);
            } else {
                const r = (retRows || [])[0];
                if (r) {
                    retention = {
                        retentionDays: Number(r.retention_days) || 0,
                        cutoff: r.cutoff || null,
                        totalEvents: Number(r.total_events) || 0,
                        prunableEvents: Number(r.prunable_events) || 0,
                        oldestEvent: r.oldest_event || null,
                        newestEvent: r.newest_event || null,
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
                /* null where the count could not be read; a number only when
                   the list really is a subset. The panel says so rather than
                   presenting a partial catalog as the whole one. */
                daily, // { adId: { slot: [ { day, impressions, clicks, viewers } ] } }
                truncated: {
                    ads: adsTotal != null && (ads || []).length < adsTotal ? adsTotal : null,
                    placements:
                        placementsTotal != null && (placements || []).length < placementsTotal
                            ? placementsTotal
                            : null,
                },
                conversions, // { adId: { slot: { clicks, clicksFollowedBy, conversionRule } } }
                retention, // { retentionDays, cutoff, totalEvents, prunableEvents, ... }
            });
        }

        // ── POST: create ──────────────────────────────────────────────────
        /* ── PLACEMENTS ────────────────────────────────────────────────────
         *
         * A placement is where a campaign runs and to whom. Until now one
         * could be created with the advert and never touched again, so the
         * ordinary operational actions - run this on the Hub too, lower that
         * cap, stop it in the lobby but leave it on Session Complete - all
         * required an agent and a migration.
         *
         * Addressed by `?kind=placement` rather than a separate route: the
         * authorization, the rate limit and the service-role client above are
         * the same, and a second file would be a second place for them to
         * drift. The GET already returns placements alongside the catalog.
         */
        if (req.method === 'POST' && String(req.query.kind) === 'placement') {
            const b = req.body || {};
            const adId = clean(b.ad_id, 64);
            if (!adId) return res.status(400).json({ success: false, error: 'Which ad?' });

            /* The ad must exist. Without this the FK error surfaces as a 500
               and the operator is told the server broke when they picked a
               campaign somebody deleted in another tab. */
            const { data: parent, error: parentErr } = await getSupabase()
                .from('ad_catalog')
                .select('id')
                .eq('id', adId)
                .maybeSingle();
            if (parentErr) {
                console.warn('[house-ads] placement parent read failed:', parentErr.message);
                return res.status(500).json({ success: false, error: 'Could not check that ad' });
            }
            if (!parent) {
                return res.status(404).json({ success: false, error: 'That ad no longer exists' });
            }

            /* Refuse before writing. A placement whose slot this server does
               not recognise cannot be resolved by fn_resolve_ads either, so
               accepting one only produces an invisible advert. */
            const newSlot = readSlot(b.slot);
            if (!newSlot) {
                return res.status(400).json({
                    success: false,
                    error: `Not A Known Slot: ${clean(b.slot, 40) || '(empty)'}`,
                });
            }
            const newAudience = readAudience(b.audience);
            if (!newAudience) {
                return res.status(400).json({
                    success: false,
                    error: `Not A Known Audience: ${clean(b.audience, 40) || '(empty)'}`,
                });
            }

            const { data: placed, error: plErr } = await getSupabase()
                .from('ad_placement')
                .insert({
                    ad_id: adId,
                    slot: newSlot,
                    club_id: clean(b.club_id, 64) || null,
                    audience: newAudience,
                    daily_cap: normaliseDailyCap(b.daily_cap),
                    is_active: b.is_active !== false,
                })
                .select('id')
                .maybeSingle();

            if (plErr) {
                /* (ad_id, slot, club_id) is unique. Running the same campaign
                   twice on one surface is not a thing somebody means to do,
                   and "already there" is a far more useful answer than 500. */
                if (String(plErr.code) === '23505') {
                    return res.status(409).json({
                        success: false,
                        error: 'That ad already has a placement on that slot',
                    });
                }
                /* A club_id that is not a club. The foreign key added in
                   20260828100000 is what turns this from a placement that
                   silently never resolves into a refusal at the point of
                   entry. */
                if (String(plErr.code) === '23503') {
                    return res.status(400).json({ success: false, error: 'That club does not exist' });
                }
                console.warn('[house-ads] placement insert failed:', plErr.message);
                return res.status(500).json({ success: false, error: 'Could not add that placement' });
            }

            return res.status(200).json({ success: true, id: placed?.id || null });
        }

        if (req.method === 'PATCH' && String(req.query.kind) === 'placement') {
            const b = req.body || {};
            const id = clean(b.id, 64);
            if (!id) return res.status(400).json({ success: false, error: 'Which placement?' });

            const patch = {};
            /* The dangerous pair. Defaulting either one here would relocate a
               live placement to a surface the operator never named and report
               success, so both refuse instead. */
            if (b.slot !== undefined) {
                const slot = readSlot(b.slot);
                if (!slot) {
                    return res.status(400).json({
                        success: false,
                        error: `Not A Known Slot: ${clean(b.slot, 40) || '(empty)'}`,
                    });
                }
                patch.slot = slot;
            }
            if (b.audience !== undefined) {
                const audience = readAudience(b.audience);
                if (!audience) {
                    return res.status(400).json({
                        success: false,
                        error: `Not A Known Audience: ${clean(b.audience, 40) || '(empty)'}`,
                    });
                }
                patch.audience = audience;
            }
            if (b.daily_cap !== undefined) patch.daily_cap = normaliseDailyCap(b.daily_cap);
            if (b.is_active !== undefined) patch.is_active = b.is_active === true;
            if (b.club_id !== undefined) patch.club_id = clean(b.club_id, 64) || null;
            if (Object.keys(patch).length === 0) {
                return res.status(400).json({ success: false, error: 'Nothing to change' });
            }

            /* .select() for the same reason as the catalog update: PostgREST
               answers a zero-row match with { error: null }, so editing a
               placement deleted in another tab would report "Saved" and change
               nothing. */
            const { data: updated, error: updErr } = await getSupabase()
                .from('ad_placement')
                .update(patch)
                .eq('id', id)
                .select('id');
            if (updErr) {
                if (String(updErr.code) === '23505') {
                    return res.status(409).json({
                        success: false,
                        error: 'That ad already has a placement on that slot',
                    });
                }
                if (String(updErr.code) === '23503') {
                    return res.status(400).json({ success: false, error: 'That club does not exist' });
                }
                console.warn('[house-ads] placement update failed:', updErr.message);
                return res.status(500).json({ success: false, error: 'Could not save that placement' });
            }
            if (!updated || updated.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'That placement no longer exists. Reload and try again.',
                });
            }
            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE' && String(req.query.kind) === 'placement') {
            const id = clean(req.query.id, 64);
            if (!id) return res.status(400).json({ success: false, error: 'Which placement?' });

            /* Deleting the LAST placement leaves the campaign running nowhere,
               which is the commonest way to publish something and see nothing
               happen. It is allowed - an operator may well want exactly that -
               but the answer says so, and the panel repeats it. */
            const { data: sibling } = await getSupabase()
                .from('ad_placement')
                .select('id, ad_id')
                .eq('id', id)
                .maybeSingle();

            const { data: removed, error: delErr } = await getSupabase()
                .from('ad_placement')
                .delete()
                .eq('id', id)
                .select('id');
            if (delErr) {
                console.warn('[house-ads] placement delete failed:', delErr.message);
                return res.status(500).json({ success: false, error: 'Could not remove that placement' });
            }
            if (!removed || removed.length === 0) {
                return res.status(404).json({ success: false, error: 'That placement was already gone' });
            }

            let orphaned = false;
            if (sibling?.ad_id) {
                const { count } = await getSupabase()
                    .from('ad_placement')
                    .select('id', { count: 'exact', head: true })
                    .eq('ad_id', sibling.ad_id);
                orphaned = (count || 0) === 0;
            }
            return res.status(200).json({ success: true, orphaned });
        }

        if (req.method === 'POST' && String(req.query.kind) === 'prune') {
            /* THE ONLY CALLER fn_prune_ad_events WILL EVER HAVE.
               It deletes ad_event rows older than the retention policy. The
               panel shows the exact count first and asks, because a delete
               whose size you learn afterwards is not a policy, it is an
               accident waiting for a slow afternoon.
               The function reads the policy itself - there is deliberately no
               "how many days" parameter on this route, so the number in the
               confirmation and the number the delete uses cannot diverge. */
            const { data: pruned, error: pruneErr } =
                await getSupabase().rpc('fn_prune_ad_events');
            if (pruneErr) {
                console.warn('[house-ads] prune failed:', pruneErr.message);
                return res
                    .status(500)
                    .json({ success: false, error: 'Could not prune those events' });
            }
            const row = (pruned || [])[0] || {};
            return res.status(200).json({
                success: true,
                deleted: Number(row.deleted) || 0,
                cutoff: row.cutoff || null,
            });
        }

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

            /* Floor of 1, matching the PATCH clamp forty lines down and the
               database's own ad_catalog_weight_positive. A 0 here reached that
               constraint and came back "Could not create that ad" without ever
               naming the field - and a cleared number box sends 0, because
               Number('') is 0 and Number.isFinite(0) is true. */
            const weight = Number.isFinite(Number(b.weight))
                ? Math.max(1, Math.min(1000, Math.round(Number(b.weight))))
                : 100;

            /* THE DESTINATION AND THE IMAGE ARE CHECKED BEFORE THE AD IS
               WRITTEN, for the same reason the placement is: a refusal after
               ad_catalog has been written leaves a live row behind a 400. */
            const targetUrl = readSitePath(b.target_url);
            if (targetUrl === false) {
                return res.status(400).json({
                    success: false,
                    error: `Not A Site Path: ${clean(b.target_url, 60)}`,
                });
            }
            const imageUrl = readSitePath(b.image_url);
            if (imageUrl === false) {
                return res.status(400).json({
                    success: false,
                    error: `Not A Site Path: ${clean(b.image_url, 60)}`,
                });
            }

            /* THE PLACEMENT IS VALIDATED BEFORE THE AD IS WRITTEN.
               Absent means "use the default" and is fine - an ad with no
               placement runs nowhere, which is the commonest way to publish
               something and see nothing happen. Present-but-unknown is a
               refusal, for the same reason as the placement routes above.
               It has to be checked HERE rather than beside the placement
               insert forty lines down: refusing after ad_catalog has been
               written would leave a live ad row with no placement and hand
               the operator a 400 for a campaign that was in fact half
               created. */
            const slot = b.slot === undefined ? 'lobby_strip' : readSlot(b.slot);
            if (!slot) {
                return res.status(400).json({
                    success: false,
                    error: `Not A Known Slot: ${clean(b.slot, 40) || '(empty)'}`,
                });
            }
            const audience = b.audience === undefined ? 'all' : readAudience(b.audience);
            if (!audience) {
                return res.status(400).json({
                    success: false,
                    error: `Not A Known Audience: ${clean(b.audience, 40) || '(empty)'}`,
                });
            }
            const dailyCap = normaliseDailyCap(b.daily_cap);

            const { data: created, error: insErr } = await getSupabase()
                .from('ad_catalog')
                .insert({
                    ad_key: adKey,
                    category,
                    headline,
                    body: stripEmoji(clean(b.body, 240)),
                    glyph: stripEmoji(clean(b.glyph, 4)),
                    target_url: targetUrl,
                    cta_label: stripEmoji(clean(b.cta_label, 40)),
                    image_url: imageUrl,
                    experiment_key: clean(b.experiment_key, 64),
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
            /* .maybeSingle() answers a row this connection cannot read back as
               { data: null, error: null }. Reading created.id from that threw a
               TypeError, and the catch at the bottom turned an ad that may well
               have been written into a bare "Internal server error" - the one
               answer that tells the operator nothing about what to do next. */
            if (!created?.id) {
                console.warn('[house-ads] insert returned no row');
                return res.status(500).json({
                    success: false,
                    error: 'The ad may have been created but could not be read back. Check the list before retrying.',
                });
            }

            // slot, audience and dailyCap were read and validated above, before
            // ad_catalog was written.
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
            if (b.target_url !== undefined) {
                const t = readSitePath(b.target_url);
                if (t === false) {
                    return res.status(400).json({
                        success: false,
                        error: `Not A Site Path: ${clean(b.target_url, 60)}`,
                    });
                }
                patch.target_url = t;
            }
            if (b.cta_label !== undefined) patch.cta_label = stripEmoji(clean(b.cta_label, 40));
            if (b.is_active !== undefined) patch.is_active = b.is_active === true;
            if (b.starts_at !== undefined) patch.starts_at = b.starts_at || null;
            if (b.ends_at !== undefined) patch.ends_at = b.ends_at || null;
            if (b.category !== undefined && CATEGORIES.has(String(b.category))) {
                patch.category = String(b.category);
            }
            if (b.weight !== undefined && Number.isFinite(Number(b.weight))) {
                /* Floor of 1, not 0: weight is the share of voice and the
                   database now refuses a zero (ad_catalog_weight_positive).
                   Clamping here means the panel says "1" rather than the save
                   failing on a constraint the operator cannot see. */
                patch.weight = Math.max(1, Math.min(1000, Math.round(Number(b.weight))));
            }
            if (b.image_url !== undefined) {
                const img = readSitePath(b.image_url);
                if (img === false) {
                    return res.status(400).json({
                        success: false,
                        error: `Not A Site Path: ${clean(b.image_url, 60)}`,
                    });
                }
                patch.image_url = img;
            }
            if (b.experiment_key !== undefined) patch.experiment_key = clean(b.experiment_key, 64);
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
