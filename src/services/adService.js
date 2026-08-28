/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AD SERVICE (WORLD HUB) — the Hub half of the house-ad event log
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Club Arena has its own copy of this at src/services/AdService.ts. They are
 * deliberately SEPARATE FILES IN SEPARATE REPOS and neither imports the other:
 * Club Arena is a Vite SPA, the Hub is Next.js, and a cross-repo import would
 * couple two build systems together to save forty lines. What they share is
 * the thing that actually matters — the same `fn_resolve_ads` resolver and the
 * same `ad_event` table — so one query answers "which slot converts best"
 * across both surfaces. If you change the event shape here, change it there.
 *
 * ── WHY THE RESOLVER IS AN RPC AND NOT A QUERY ─────────────────────────────
 * Targeting is an entitlement question. Audience, club scoping, flight dates,
 * weight order and the per-user 24h frequency cap all live inside
 * `fn_resolve_ads` so the browser cannot disagree with the database about who
 * was eligible, and so a future paid advertiser cannot be billed for
 * impressions a browser decided to serve itself. This file renders what it is
 * handed and reports what happened. It decides nothing.
 *
 * ── VIP MEMBERS SEE ADS ────────────────────────────────────────────────────
 * Dan, 2026-08-27: "even vips will see ads remove that for now." There is no
 * VIP suppression here and there must not be. If that ever reverses it changes
 * in `fn_resolve_ads`, not in a client.
 *
 * ── TRACKING IS THE POINT ──────────────────────────────────────────────────
 * Eleven promotional surfaces shipped in this product before any of them
 * recorded a single impression or click, so nobody could answer "did anyone
 * even look at it". Logging here is best-effort but never silent: a failed
 * write is warned about, because a tracking system that quietly stops is worse
 * than none — it produces confident zeroes that an operator will act on.
 */

import { supabase } from '../lib/supabase';

/**
 * Impressions already logged this page-load, keyed `adId:slot`.
 *
 * React re-renders for reasons that have nothing to do with a player looking
 * at an advert. Without this, one player sitting on the promotions page would
 * log a fresh "impression" every render and every campaign's click-through
 * rate would be divided by a number that means nothing. One view per ad per
 * slot per page-load is the honest unit, and it matches what Club Arena
 * counts, which is what makes the two surfaces comparable at all.
 */
const seenThisLoad = new Set();

/** Surfaces an ad can occupy. Mirrors the CHECK on `ad_placement.slot`. */
export const AD_SLOTS = [
    'lobby_strip',
    'session_summary',
    'empty_state',
    'hub_promotions',
    'table_between_hands',
];

function warn(scope, err, extra) {
    // The Hub's own idiom for a handled exception. Deliberately not silent.
    console.warn(`[adService] ${scope} failed:`, err, extra || '');
}

/**
 * What should this viewer see in this slot right now?
 *
 * Returns [] on any failure. An advert is the one thing that must never break
 * a page or render an error in its place — but the failure is reported, so an
 * ad system that has quietly stopped serving looks different from "no
 * campaigns are running".
 */
export async function resolveAds(slot, clubId = null, limit = 3) {
    try {
        const { data, error } = await supabase.rpc('fn_resolve_ads', {
            p_slot: slot,
            p_club_id: clubId,
            p_limit: limit,
        });
        if (error) {
            warn('resolveAds', error, { slot });
            return [];
        }
        return (data || []).map((r) => ({
            adId: String(r.ad_id),
            adKey: String(r.ad_key),
            category: String(r.category),
            headline: String(r.headline ?? ''),
            body: r.body == null ? null : String(r.body),
            glyph: r.glyph == null ? null : String(r.glyph),
            targetUrl: r.target_url == null ? null : String(r.target_url),
            ctaLabel: r.cta_label == null ? null : String(r.cta_label),
        }));
    } catch (e) {
        warn('resolveAds', e, { slot });
        return [];
    }
}

/** Record that an ad was actually shown. De-duplicated per page-load. */
export function logImpression(adId, slot, clubId = null) {
    if (!adId) return;
    const key = `${adId}:${slot}`;
    if (seenThisLoad.has(key)) return;
    seenThisLoad.add(key);
    void logAdEvent(adId, slot, 'impression', clubId);
}

/** A tap. Not de-duplicated — a player who clicked twice really did click twice. */
export function logClick(adId, slot, clubId = null) {
    if (!adId) return;
    void logAdEvent(adId, slot, 'click', clubId);
}

export function logDismiss(adId, slot, clubId = null) {
    if (!adId) return;
    void logAdEvent(adId, slot, 'dismiss', clubId);
}

/**
 * The write.
 *
 * `user_id` comes from the session because RLS on `ad_event` demands it match
 * `auth.uid()` — a signed-out viewer simply does not log, which is correct: we
 * cannot frequency-cap somebody we cannot identify, and an anonymous row would
 * only inflate the denominator.
 *
 * Callers must fire this BEFORE navigating and must navigate client-side
 * (next/link or router.push). A full document navigation would kill the
 * in-flight insert and the click would be lost, which is precisely the failure
 * mode that makes a metrics surface lie.
 */
export async function logAdEvent(adId, slot, eventType, clubId = null) {
    try {
        const { data: auth } = await supabase.auth.getSession();
        const userId = auth?.session?.user?.id;
        if (!userId) return;
        const { error } = await supabase.from('ad_event').insert({
            ad_id: adId,
            user_id: userId,
            slot,
            event_type: eventType,
            club_id: clubId,
        });
        if (error) warn('logAdEvent', error, { slot, eventType });
    } catch (e) {
        warn('logAdEvent', e, { slot, eventType });
    }
}

export default { resolveAds, logImpression, logClick, logDismiss, logAdEvent, AD_SLOTS };
