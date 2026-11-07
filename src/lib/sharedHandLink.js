/**
 * Shared Club Arena hands: smarter.poker/h/<token> (2026-11-06).
 *
 * Club Arena reserves an 8-character token for a hand a player shares
 * (migration 20261107021555, table ca_shared_hands). This page and the preview
 * image read it through fn_ca_shared_hand_open with p_count=false, so drawing
 * a preview is never counted as a view; the person who taps the link is
 * counted by Club Arena's own /hub/club-arena/h/<token> page.
 *
 * fn_ca_shared_hand_open is granted to anon, so the publishable key is enough
 * here: no service role, nothing secret. The preview facts are what the whole
 * table saw (hand number, table, stakes, pot, board, the sender's name), never
 * a player's hole cards.
 */
import { resolveAnonKey, SUPABASE_URL_FALLBACK } from './supabaseKeys.js';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL_FALLBACK).trim();

export const HAND_TOKEN_RE = /^[A-HJ-NP-Za-km-z2-9]{8}$/;

export function normalizeHandToken(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    return HAND_TOKEN_RE.test(v) ? v : null;
}

/** Where a person lands: Club Arena's replay for this token. */
export function clubArenaHandPath(token) {
    return `/hub/club-arena/h/${token}`;
}

/** found | revoked | missing, or a thrown error when the database could not be asked. */
export async function readSharedHand(token, fetchImpl = fetch) {
    const t = normalizeHandToken(token);
    if (!t) return { status: 'missing' };
    const { key } = resolveAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/fn_ca_shared_hand_open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ p_token: t, p_count: false }),
    });
    if (!res.ok) throw new Error(`fn_ca_shared_hand_open ${res.status}`);
    const data = await res.json();
    if (!data?.found) return { status: 'missing' };
    if (data.revoked) return { status: 'revoked' };
    return { status: 'found', preview: cleanPreview(data.preview) };
}

const FIELDS = ['handNumber', 'tableName', 'stakes', 'pot', 'board', 'senderName', 'variant'];

export function cleanPreview(raw) {
    const out = {};
    for (const k of FIELDS) {
        const v = raw && typeof raw[k] === 'string' ? raw[k].trim().slice(0, 80) : '';
        if (v) out[k] = v;
    }
    return out;
}

/** "9h Jh 3c Ah 6s" -> [{rank:'9',suit:'h'}, ...]; anything else is dropped. */
export function boardCards(board) {
    return String(board || '')
        .split(/\s+/)
        .map(c => /^([2-9TJQKA])([hdcs])$/i.exec(c))
        .filter(Boolean)
        .map(m => ({ rank: m[1].toUpperCase(), suit: m[2].toLowerCase() }))
        .slice(0, 5);
}

/** The words a messaging app shows. Amounts are chips: no currency sign. */
export function handPreviewText(preview) {
    const p = preview || {};
    const who = p.senderName ? `${p.senderName}'s Hand` : 'A Club Arena Hand';
    const headline = p.handNumber ? `${who} #${p.handNumber}` : who;
    const parts = [];
    if (p.tableName) parts.push(p.tableName);
    else if (p.stakes) parts.push(`${p.stakes}${p.variant ? ` ${p.variant}` : ''}`);
    if (p.pot) parts.push(`Pot ${p.pot} Chips`);
    if (p.board) parts.push(`Board ${p.board}`);
    const description = `${parts.length ? `${parts.join(' | ')}. ` : ''}Watch The Replay On Smarter.Poker.`;
    return { headline, description };
}
