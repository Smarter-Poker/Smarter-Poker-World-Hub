/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE AD CLICK REDIRECT — /c/<code>
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /c/<code>   (rewritten to /api/c/<code> in next.config.js)
 *
 * A sponsor advertises in order to send a player to their OWN site. Every ad
 * destination on this platform is a rooted path on smarter.poker, checked in
 * four independent places, and all four of those checks are correct — so the
 * sponsor's address is never what travels. It lives on `ad_campaign`, the
 * campaign carries an opaque `click_code`, and the advert points here.
 *
 * ── WHY THIS CANNOT BECOME AN OPEN REDIRECT ────────────────────────────────
 * This route accepts NO URL. It takes an opaque code and asks the database for
 * the address that was approved against it. OWASP's rule for open redirects is
 * "never send a browser to a user-supplied address", and the way this obeys it
 * is by never accepting one: there is no `?url=`, no `?next=`, no `?return_to=`
 * to abuse. A code that does not exist gets nothing. A code that is guessed
 * still only reaches an address a human approved in the review queue.
 *
 * Every `Location` this route can ever emit is one of exactly two things:
 * the https address stored on an APPROVED, in-flight campaign, or a path on
 * this site.
 *
 * ── WHY THE CLICK IS COUNTED HERE AND NOT IN THE BROWSER ───────────────────
 * The page is being torn down at the moment the request leaves, which makes
 * the browser the least reliable place to record the one number an advertiser
 * has any reason to dispute. `fn_ad_click_redirect` writes the event in the
 * same call that resolves the address. The Club Arena rotator deliberately
 * does NOT log an external click, because counting in both places would bill
 * a sponsor for double the clicks they were given.
 *
 * ── WHO CLICKED: NOBODY, AND THAT IS DELIBERATE ────────────────────────────
 * This is a top-level navigation, so it carries no Authorization header, and
 * the Supabase session lives in localStorage rather than a cookie — the server
 * genuinely cannot tell who this is. The obvious workaround, letting the
 * client append the user id to the path, is refused twice over: it would be
 * trivially forged, and it would put a person's id in a URL that is then
 * handed to a third party. `ad_event.user_id` is nullable for exactly this;
 * the click counts, it just counts toward nobody.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

/** Where a player lands when the advert they tapped is no longer live. */
const FALLBACK = '/hub/club-arena';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) {
            // fn_ad_click_redirect is service_role only, on purpose: a browser
            // role could otherwise read every sponsor's destination and forge
            // clicks. Without the key this route cannot work, and saying so is
            // better than falling back to a role that will be refused anyway.
            console.warn('[ad-click] SUPABASE_SERVICE_ROLE_KEY missing - the redirect cannot resolve');
            return null;
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/**
 * The code is opaque and this route generated its shape: 16 hex characters.
 * Checking it here turns a hostile string into a cheap 302 instead of a
 * database round trip, and keeps anything strange away from the query.
 */
function readCode(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== 'string') return null;
    return /^[A-Za-z0-9_-]{6,40}$/.test(raw) ? raw : null;
}

/**
 * A player who taps a dead advert should land somewhere sensible rather than
 * read an error. The failure is still reported, so a campaign quietly serving
 * broken links is visible to us even though it is invisible to them.
 */
function sendHome(res) {
    res.setHeader('Location', FALLBACK);
    res.setHeader('Cache-Control', 'no-store');
    res.status(302).end();
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.setHeader('Allow', 'GET, HEAD');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // A click is a person tapping a picture. This is generous for that and
        // blunt about somebody hammering the endpoint to inflate a number an
        // advertiser is shown.
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const code = readCode(req.query?.code);
        if (!code) return sendHome(res);

        const supabase = getSupabase();
        if (!supabase) return sendHome(res);

        const { data, error } = await supabase.rpc('fn_ad_click_redirect', {
            p_click_code: code,
            p_user_id: null,
        });

        if (error) {
            reportApiError(error, req, { route: 'ad-click', code });
            return sendHome(res);
        }

        const result = data || {};
        if (result.ok !== true || typeof result.url !== 'string') {
            // Expired, withdrawn, never approved, or simply not a real code.
            // Not an error worth paging on; the player just goes to the lobby.
            return sendHome(res);
        }

        /* THE ONLY OUTSIDE ADDRESS THIS ROUTE EVER EMITS, AND IT CAME FROM THE
           DATABASE. Belt and braces on top of the column's own CHECK: if a
           value that is not https somehow reached this line, the player goes
           to the lobby rather than wherever it points. */
        if (!/^https:\/\/[A-Za-z0-9]/.test(result.url)) {
            reportApiError(new Error('ad click destination was not https'), req, {
                route: 'ad-click',
                code,
            });
            return sendHome(res);
        }

        // no-store because a cached redirect is a click that stops being
        // counted: the browser would stop asking and the advertiser's number
        // would quietly flatten.
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Location', result.url);
        return res.status(302).end();
    } catch (err) {
        reportApiError(err, req, { route: 'ad-click' });
        return sendHome(res);
    }
}
