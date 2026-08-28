/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HUB ADS — the World Hub's half of the house-ad system
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phase 1 (2026-08-27) built the whole spine in Club Arena and wired exactly
 * one surface, the lobby strip. The World Hub had no ad surface of any kind.
 * This is the Hub's client for the `hub_promotions` slot.
 *
 * ── WHY THIS IS A SEPARATE FILE FROM CLUB ARENA'S AdService ────────────────
 * Club Arena is a different repository. Importing across the two would couple
 * a Next.js app to a Vite SPA's TypeScript service and give the estate one
 * more thing that breaks in a way nobody can see. The two clients are
 * deliberately small and deliberately identical in behaviour; what they must
 * agree on is not code, it is the CONTRACT — the same `fn_resolve_ads` RPC,
 * the same `ad_event` table, so both surfaces are comparable in one place.
 *
 * ── THE THREE LAWS THIS FILE INHERITS ──────────────────────────────────────
 * 1. TARGETING IS SERVER-SIDE. Every eligibility rule lives in
 *    `fn_resolve_ads`. This client renders what it is handed and reports what
 *    happened. If you ever find yourself filtering ads here, stop: the day a
 *    paying advertiser arrives, a browser-decided impression is a billing
 *    dispute.
 * 2. IMPRESSIONS DE-DUPLICATE PER PAGE LOAD, NOT PER RENDER. The strip
 *    rotates on a timer and React re-renders for unrelated reasons; counting
 *    renders would divide every campaign's click-through rate by a number
 *    that means nothing.
 * 3. TRACKING FAILURES ARE NEVER SILENT. This product shipped eleven
 *    promotional surfaces and not one of them recorded an impression or a
 *    click. A tracking system that quietly stops is worse than none, because
 *    it produces confident zeroes.
 *
 * ── VIP MEMBERS SEE ADS ────────────────────────────────────────────────────
 * Dan 2026-08-27: "even vips will see ads remove that for now." There is no
 * VIP suppression here and none in the resolver. If that ever reverses it
 * changes in `fn_resolve_ads`, not here.
 */

import { supabase } from './supabase';
import { getAuthUser } from './authUtils';

/** Mirrors the CHECK on `ad_placement.slot`. */
export const HUB_SLOT = 'hub_promotions';

/**
 * Impressions already logged this page load, keyed `adId:slot`.
 * See law 2 above. Module scope is deliberate: it is the page load's lifetime.
 */
const seenThisLoad = new Set();

/** Exported for tests only — a fresh page load is a fresh Set. */
export function _resetSeenThisLoad() {
    seenThisLoad.clear();
}

/**
 * What should this viewer see in the Hub slot right now?
 *
 * Returns [] on any failure. An advert is the one thing that must never break
 * a page or render an error in its place — but the failure is reported, so an
 * ad system that has quietly stopped serving looks different from "no
 * campaigns are running".
 */
export async function resolveHubAds(limit = 3) {
    try {
        const { data, error } = await supabase.rpc('fn_resolve_ads', {
            p_slot: HUB_SLOT,
            p_club_id: null,
            p_limit: limit,
        });
        if (error) {
            console.warn('[hubAds] resolve failed:', error.message || error);
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
        console.warn('[hubAds] resolve threw:', e?.message || e);
        return [];
    }
}

/**
 * The write. `user_id` comes from the session because RLS demands it match
 * `auth.uid()` — a signed-out viewer simply does not log, which is correct: we
 * cannot frequency-cap somebody we cannot identify, and an anonymous
 * impression row would only inflate the denominator.
 *
 * The identity is read with `getAuthUser()`, never through the Supabase
 * client's own session accessors: those throw AbortError in this app and a
 * pre-commit hook blocks them by name. It is the same identity either way —
 * `getAuthUser` parses the very `smarter-poker-auth` storage key the client
 * itself writes — so the id this sends is the id `auth.uid()` will see when
 * RLS checks the row.
 */
export async function logHubAdEvent(adId, eventType) {
    try {
        const userId = getAuthUser()?.id;
        if (!userId) return;
        const { error } = await supabase.from('ad_event').insert({
            ad_id: adId,
            user_id: userId,
            slot: HUB_SLOT,
            event_type: eventType,
            club_id: null,
        });
        if (error) console.warn('[hubAds] log failed:', eventType, error.message || error);
    } catch (e) {
        console.warn('[hubAds] log threw:', eventType, e?.message || e);
    }
}

/** Record that an ad was actually shown. De-duplicated per page load (law 2). */
export function logHubImpression(adId) {
    if (!adId) return;
    const key = `${adId}:${HUB_SLOT}`;
    if (seenThisLoad.has(key)) return;
    seenThisLoad.add(key);
    void logHubAdEvent(adId, 'impression');
}

/** A tap. Not de-duplicated — a viewer clicking twice really did click twice. */
export function logHubClick(adId) {
    if (!adId) return;
    void logHubAdEvent(adId, 'click');
}

/**
 * Is this destination one we are willing to send a viewer to?
 *
 * The resolver already guarantees `hub_promotions` destinations are
 * Hub-absolute — the migration asserts every one starts `/hub/` and refuses to
 * apply otherwise. This is the second lock, at the point of navigation: a
 * same-origin path only, never a protocol, never a protocol-relative `//host`
 * that a browser reads as another site. An ad destination is data, and data
 * that decides where a browser goes is checked before it is obeyed.
 */
export function isSafeHubDestination(url) {
    if (typeof url !== 'string') return false;
    if (!url.startsWith('/')) return false;
    if (url.startsWith('//')) return false;
    return true;
}
