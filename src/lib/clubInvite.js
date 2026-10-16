/**
 * CLUB INVITE ATTRIBUTION (Dan 2026-10-15)
 * ═══════════════════════════════════════════════════════════════════════════
 * A Share & Invite link is smarter.poker/i/<CODE>. The code belongs to one
 * player in one club (public.club_invite_links), so whoever sends it is the
 * one credited. Between the first click and the club join the player may:
 *   - sign up (this tab),
 *   - confirm their email (often another tab or another device),
 *   - verify their phone (or skip it).
 * The code has to survive all of that, so it is kept in three places:
 *   1. a first-party cookie `sp_club_invite` (set by the /i/ page's server
 *      response, 30 days, first link wins),
 *   2. localStorage `sp-club-invite` (same origin as Club Arena),
 *   3. the new account's user_metadata (`club_invite_code`), written at
 *      signUp(), which is the copy that crosses devices.
 * Whichever copy reaches /auth/callback first calls fn_club_invite_claim,
 * which is first-wins on the server too, so the order does not matter.
 *
 * Nothing here decides credit. The database does (attribution, self-referral
 * checks, phone verification, downline placement). This module only carries
 * the code to it.
 */
import { resolveAnonKey, SUPABASE_URL_FALLBACK } from './supabaseKeys.js';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL_FALLBACK).trim();
const SUPABASE_ANON_KEY = resolveAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).key;

export const CLUB_INVITE_STORAGE_KEY = 'sp-club-invite';
export const CLUB_INVITE_COOKIE = 'sp_club_invite';
export const DEVICE_ID_STORAGE_KEY = 'sp-device-id';
export const CLUB_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CLUB_ARENA_PREFIX = '/hub/club-arena/';

const CODE_RE = /^[A-HJ-NP-Z2-9]{7}$/;

/** The 7-character code alphabet the database issues (no I, O, 0 or 1). */
export function isInviteCode(value) {
    return typeof value === 'string' && CODE_RE.test(value.trim().toUpperCase());
}

export function normalizeInviteCode(value) {
    return isInviteCode(value) ? value.trim().toUpperCase() : null;
}

/**
 * A same-origin relative path, safe to navigate to. Browsers strip tab and
 * newline characters while parsing a URL, so "/\t/evil.com" would become
 * "//evil.com" and leave the site: any control character, space or backslash
 * is refused, and the result must resolve on this origin.
 */
export function isSafeRelativePath(path) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false;
    if (/[\u0000-\u0020\u007f\\]/.test(path)) return false;
    try {
        return new URL(path, 'https://same.origin.invalid').origin === 'https://same.origin.invalid';
    } catch {
        return false;
    }
}

/** Only ever a Club Arena path on this origin: never an open redirect. */
export function safeClubArenaPath(path) {
    if (typeof path !== 'string') return null;
    if (!isSafeRelativePath(path)) return null;
    if (!path.startsWith(CLUB_ARENA_PREFIX) || path.startsWith('//') || path.includes('\\')) return null;
    // No dot segments, plain or encoded: /hub/club-arena/../x would resolve outside Club Arena.
    if (/(^|\/)(\.|%2e){2}(\/|\?|#|$)/i.test(path)) return null;
    return path;
}

/** `CODE.1739999999999` -> { code, firstSeen } ; anything else -> null. */
export function parseInviteCookieValue(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let decoded;
    try {
        decoded = decodeURIComponent(raw);
    } catch {
        return null; // a malformed cookie is no invite, never a crash
    }
    const [codePart, tsPart] = decoded.split('.');
    const code = normalizeInviteCode(codePart);
    const firstSeen = Number(tsPart);
    if (!code || !Number.isFinite(firstSeen) || firstSeen <= 0) return null;
    return { code, firstSeen };
}

export function inviteCookieValue(code, firstSeen) {
    return `${code}.${Math.floor(firstSeen)}`;
}

export function isInviteFresh(invite, now = Date.now()) {
    return !!invite && now - invite.firstSeen < CLUB_INVITE_TTL_MS && invite.firstSeen <= now + 60_000;
}

/** Read a cookie value from a raw Cookie header (server) or document.cookie (client). */
export function readCookie(header, name) {
    if (!header) return null;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
    }
    return null;
}

function readStoredInvite() {
    try {
        const raw = window.localStorage.getItem(CLUB_INVITE_STORAGE_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw);
        const code = normalizeInviteCode(v?.code);
        const firstSeen = Number(v?.firstSeen);
        return code && Number.isFinite(firstSeen) ? { code, firstSeen } : null;
    } catch {
        return null;
    }
}

/** The invite this browser is carrying, if any is still inside its 30 days. */
export function readPendingInvite() {
    if (typeof window === 'undefined') return null;
    const stored = readStoredInvite();
    if (isInviteFresh(stored)) return stored;
    const fromCookie = parseInviteCookieValue(readCookie(document.cookie, CLUB_INVITE_COOKIE));
    return isInviteFresh(fromCookie) ? fromCookie : null;
}

/**
 * Remember an invite in this browser. First link wins: a second link opened
 * inside the first one's 30 days does not replace it.
 */
export function rememberInvite(code, firstSeen = Date.now()) {
    if (typeof window === 'undefined') return null;
    const normalized = normalizeInviteCode(code);
    if (!normalized) return null;
    const current = readPendingInvite();
    if (current) return current;
    const value = { code: normalized, firstSeen };
    try {
        window.localStorage.setItem(CLUB_INVITE_STORAGE_KEY, JSON.stringify(value));
    } catch {
        /* private browsing: the cookie and the account metadata still carry it */
    }
    try {
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${CLUB_INVITE_COOKIE}=${encodeURIComponent(inviteCookieValue(normalized, firstSeen))}; Max-Age=${Math.floor(CLUB_INVITE_TTL_MS / 1000)}; Path=/; SameSite=Lax${secure}`;
    } catch {
        /* ignore */
    }
    return value;
}

export function clearPendingInvite() {
    if (typeof window === 'undefined') return;
    try { window.localStorage.removeItem(CLUB_INVITE_STORAGE_KEY); } catch { /* ignore */ }
    try { document.cookie = `${CLUB_INVITE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`; } catch { /* ignore */ }
}

/** A stable random id for this browser. Same key Club Arena reads (same origin). */
export function getDeviceId() {
    if (typeof window === 'undefined') return null;
    try {
        let id = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
        if (!id) {
            id = (window.crypto?.randomUUID && window.crypto.randomUUID()) ||
                `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
        }
        return id;
    } catch {
        return null;
    }
}

async function rpc(name, body, accessToken) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        // The publishable key is not a JWT, so a signed-out call sends only
        // `apikey`; a signed-in call adds the player's own access token.
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${name} ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
}

/**
 * SERVER ONLY. The landing page (getServerSideProps) and the link preview
 * read an invite with the service role: fn_club_invite_resolve counts opens,
 * so no anonymous browser may call it (Club Arena's definer-authorization
 * gate). The key is never NEXT_PUBLIC_, so this cannot run in a browser.
 */
export async function resolveInviteServer(code, { countClick = true } = {}) {
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!key) throw new Error('fn_club_invite_resolve: SUPABASE_SERVICE_ROLE_KEY is not configured');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_club_invite_resolve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: key,
            // A legacy service JWT also goes in Authorization; a modern secret
            // key (sb_secret_...) is not a JWT and travels as apikey alone.
            ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({ p_code: code, p_count_click: countClick }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`fn_club_invite_resolve ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
}

/**
 * Attach the signed-in account to the invite it came from. Returns the
 * database's answer (status, join_path) or null when there is nothing to claim.
 */
export async function claimInvite(accessToken, invite) {
    const pending = invite || readPendingInvite();
    if (!accessToken || !pending?.code) return null;
    const result = await rpc(
        'fn_club_invite_claim',
        {
            p_code: pending.code,
            p_device_id: getDeviceId(),
            p_first_clicked_at: new Date(pending.firstSeen || Date.now()).toISOString(),
        },
        accessToken
    );
    return result || null;
}

/**
 * The club join page this signed-in account still owes a visit to, or null.
 * Asks fn_club_invite_pending (the account's own claim, server side), so it
 * works on a device that never saw the /i/ link. Never throws.
 */
export async function fetchPendingJoinPath(accessToken) {
    return (await lookupPendingJoinPath(accessToken)) ?? null;
}

/**
 * Like fetchPendingJoinPath, but tells "nothing pending" (null) apart from
 * "could not ask" (undefined), so a once-per-session forward only spends its
 * slot on a real answer. Never throws.
 */
export async function lookupPendingJoinPath(accessToken) {
    if (!accessToken) return undefined;
    try {
        const result = await rpc('fn_club_invite_pending', {}, accessToken);
        return result?.pending ? safeClubArenaPath(result.join_path) : null;
    } catch {
        return undefined;
    }
}

/**
 * Switching between /auth/signup and /auth/login keeps where the player was
 * going (?redirect=) and the invite code (?invite=), so an invited player who
 * picks the other form still lands on the club.
 */
export function authSwitchHref(path, query) {
    const first = (v) => (Array.isArray(v) ? v[0] : v);
    const params = new URLSearchParams();
    const redirect = first(query?.redirect);
    const invite = first(query?.invite);
    if (typeof redirect === 'string' && redirect) params.set('redirect', redirect);
    if (typeof invite === 'string' && invite) params.set('invite', invite);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}

/** Crawlers that fetch a link to draw its preview are not people opening it. */
export function isLinkPreviewBot(userAgent) {
    return /bot|crawl|spider|facebookexternalhit|whatsapp|telegram|slack|discord|twitter|linkedin|embedly|preview|skype|vkshare|pinterest|google-?structured|bingpreview|iMessage|Applebot/i.test(
        String(userAgent || '')
    );
}
