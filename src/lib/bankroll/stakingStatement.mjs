// Backer share links and the public staking statement (2026-11-28).
//
// A staked player can give their backer a read-only link to one deal's
// statement. The link is a row in staking_share_links (owner-only RLS,
// installed 2026-11-28, migration 20261128100600_staking_share_links); its
// random v4 UUID token is the bearer secret. The public page
// /staking/statement/<token> calls fn_staking_statement(p_token), which is
// SECURITY DEFINER, granted to anon, and returns ONLY entry_date, category,
// gross_result, player_share, backer_share, makeup_before and makeup_after,
// in played order, for a valid, unrevoked, unexpired token, and zero rows
// otherwise. Revoked, expired and never-existed look the same on purpose.
//
// Money here is US dollars (the ledger's unit), totalled in whole cents.

import { resolveAnonKey, SUPABASE_URL_FALLBACK } from '../supabaseKeys.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SHARE_LINK_DAYS = 30;
export const STATEMENT_PATH = '/staking/statement/';
export const SITE_ORIGIN = 'https://smarter.poker';

/** A token in canonical lower-case form, or null if it is not a UUID. */
export function normalizeStatementToken(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    return UUID_RE.test(v) ? v : null;
}

/** The URL a backer opens. */
export function statementUrl(token, origin = SITE_ORIGIN) {
    const t = normalizeStatementToken(token);
    return t ? `${origin}${STATEMENT_PATH}${t}` : null;
}

/** active | expired | revoked for a staking_share_links row. */
export function shareLinkStatus(link, now = new Date()) {
    if (!link) return 'revoked';
    if (link.revoked_at) return 'revoked';
    const expires = Date.parse(link.expires_at);
    if (!Number.isFinite(expires) || expires <= now.getTime()) return 'expired';
    return 'active';
}

/** Links newest first, active ones before the rest. */
export function sortShareLinks(links, now = new Date()) {
    const rank = (l) => (shareLinkStatus(l, now) === 'active' ? 0 : 1);
    return [...(links || [])].sort((a, b) => rank(a) - rank(b) || String(b.created_at).localeCompare(String(a.created_at)));
}

const toCents = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Only the seven fields the function returns; anything else is dropped. */
export function cleanStatementRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
        .filter((r) => r && typeof r === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(r.entry_date || '')))
        .map((r) => ({
            entry_date: String(r.entry_date),
            category: typeof r.category === 'string' ? r.category : null,
            gross_result: Number(r.gross_result) || 0,
            player_share: Number(r.player_share) || 0,
            backer_share: Number(r.backer_share) || 0,
            makeup_before: Number(r.makeup_before) || 0,
            makeup_after: Number(r.makeup_after) || 0,
        }));
}

/**
 * Statement totals in cents. Makeup is path dependent, so the current makeup
 * is the last played session's makeup_after, never a sum.
 */
export function statementTotals(rows) {
    const clean = cleanStatementRows(rows);
    let gross = 0, player = 0, backer = 0, wins = 0;
    for (const r of clean) {
        const g = toCents(r.gross_result);
        gross += g;
        player += toCents(r.player_share);
        backer += toCents(r.backer_share);
        if (g > 0) wins += 1;
    }
    const last = clean[clean.length - 1];
    return {
        sessions: clean.length,
        wins,
        grossCents: gross,
        playerCents: player,
        backerCents: backer,
        makeupCents: last ? toCents(last.makeup_after) : 0,
        firstDay: clean[0]?.entry_date || null,
        lastDay: last?.entry_date || null,
    };
}

/**
 * Read a statement with the publishable key (server side).
 * Returns { status: 'found', rows } | { status: 'empty' } (a live link on a
 * deal with no sessions linked yet) | { status: 'unavailable' } (the link is
 * revoked, expired or never existed). Throws when the database could
 * not be asked, so the page can say "could not load" instead of "expired".
 */
export async function readStakingStatement(token, fetchImpl = fetch, env = process.env) {
    const t = normalizeStatementToken(token);
    if (!t) return { status: 'unavailable', rows: [] };
    const url = (env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL_FALLBACK).trim();
    const { key } = resolveAnonKey(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const res = await fetchImpl(`${url}/rest/v1/rpc/fn_staking_statement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Accept: 'application/json' },
        body: JSON.stringify({ p_token: t }),
    });
    if (!res.ok) throw new Error(`fn_staking_statement ${res.status}`);
    const rows = cleanStatementRows(await res.json());
    if (rows.length) return { status: 'found', rows };
    // No rows: either the link is not live, or it is live on a deal with no
    // sessions linked yet. fn_staking_link_is_active (migration
    // 20261128120608) answers only that yes/no, so a fresh link no longer
    // reads as expired and revoked/expired/never-existed stay indistinguishable.
    const active = await fetchImpl(`${url}/rest/v1/rpc/fn_staking_link_is_active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Accept: 'application/json' },
        body: JSON.stringify({ p_token: t }),
    });
    if (!active.ok) throw new Error(`fn_staking_link_is_active ${active.status}`);
    return (await active.json()) === true ? { status: 'empty', rows: [] } : { status: 'unavailable', rows: [] };
}
