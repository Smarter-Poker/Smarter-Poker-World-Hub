/**
 * Shared Club Arena tournaments: smarter.poker/t/<id> (2026-11-15).
 *
 * A shared tournament used to travel as /hub/club-arena/tournaments/<id>. A
 * chat app drew the generic Poker Arena card for it, and a friend who was not
 * signed in landed on a bare sign-in page with no idea what they had been
 * invited to. The page and the preview image here read the invitation through
 * fn_ca_tournament_share_preview (Club Arena migration 20261115161427): the
 * facts any lobby card shows, and nothing for a private, VIP-only or
 * non-public-club event, which answers exactly like a missing one.
 *
 * The function is granted to anon, so the publishable key is enough: no
 * service role, nothing secret. Amounts are chips: never a currency sign.
 */
import { resolveAnonKey, SUPABASE_URL_FALLBACK } from './supabaseKeys.js';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL_FALLBACK).trim();

export const TOURNAMENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function normalizeTournamentId(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    return TOURNAMENT_ID_RE.test(v) ? v : null;
}

/** Where a person goes: Club Arena's tournament page (sign-in and return as usual). */
export function clubArenaTournamentPath(id) {
    return `/hub/club-arena/tournaments/${id}`;
}

/** found | missing, or a thrown error when the database could not be asked. */
export async function readSharedTournament(id, fetchImpl = fetch) {
    const t = normalizeTournamentId(id);
    if (!t) return { status: 'missing' };
    const { key } = resolveAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/fn_ca_tournament_share_preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ p_tournament_id: t }),
    });
    if (!res.ok) throw new Error(`fn_ca_tournament_share_preview ${res.status}`);
    const data = await res.json();
    if (!data?.found) return { status: 'missing' };
    return { status: 'found', preview: cleanTournamentPreview(data) };
}

const TEXT = ['name', 'game', 'format', 'status', 'bounty', 'club'];
const NUMBERS = ['buyIn', 'fee', 'guarantee', 'lateRegMinutes', 'startingChips', 'maxPlayers'];
const FLAGS = ['freeBuy', 'turbo', 'rebuys'];

/** Only the known facts survive, trimmed and typed. */
export function cleanTournamentPreview(raw) {
    const out = {};
    for (const k of TEXT) {
        const v = raw && typeof raw[k] === 'string' ? raw[k].trim().slice(0, 80) : '';
        if (v) out[k] = v;
    }
    for (const k of NUMBERS) {
        const v = raw ? Number(raw[k]) : NaN;
        if (raw && raw[k] !== null && raw[k] !== undefined && Number.isFinite(v) && v >= 0) out[k] = v;
    }
    for (const k of FLAGS) if (raw && raw[k] === true) out[k] = true;
    const start = raw && typeof raw.startTime === 'string' ? Date.parse(raw.startTime) : NaN;
    if (Number.isFinite(start)) out.startTime = new Date(start).toISOString();
    return out;
}

/** 1000 -> "1,000"; 1.9 -> "1.90"; whole chips print whole. */
export function chipAmount(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '';
    return Number.isInteger(v)
        ? v.toLocaleString('en-US')
        : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const FORMAT_WORDS = {
    freezeout: '',
    bounty: 'Bounty',
    progressive_bounty: 'PKO',
    mystery_bounty: 'Mystery Bounty',
    satellite: 'Satellite',
    sng: 'Sit & Go',
    sit_and_go: 'Sit & Go',
    sng_satellite: 'Sit & Go Satellite',
    spin: 'Spin',
    spin_and_go: 'Spin',
    rebuy: 'Rebuy',
};

const SEAT_BASED_FORMATS = new Set(['spin', 'sng', 'spin_and_go', 'sit_and_go', 'sng_satellite']);
const SEAT_BASED_NAME_RE = /\b(?:spin(?:\s*(?:&|and)\s*go)?|sit\s*(?:&|and)\s*go|sng|heads[-\s]?up)\b/i;

/**
 * Spins and Sit & Go's (including SNG satellites and Heads-Up SNGs) launch
 * when the required seats fill, never at a scheduled clock time.
 *
 * Defensively detects seat-based rows even when stored as generic format
 * 'satellite' (with a fixed SNG seat cap 2 <= maxPlayers <= 9, since scheduled
 * MTT satellites have maxPlayers null or >= 10) or when the event name
 * explicitly identifies a Spin / Sit & Go / Heads-Up table with maxPlayers <= 9.
 */
export function isSeatBasedTournament(p) {
    if (!p || typeof p !== 'object') return false;
    const fmt = String(p.format || '').trim().toLowerCase();
    if (SEAT_BASED_FORMATS.has(fmt)) return true;

    const seats = Number(p.maxPlayers);
    const hasSmallSeatCap = Number.isFinite(seats) && seats >= 2 && seats <= 9;
    if (!hasSmallSeatCap) return false;

    if (fmt === 'satellite') return true;
    const name = typeof p.name === 'string' ? p.name : '';
    return SEAT_BASED_NAME_RE.test(name);
}

/** "When Full (3 Players)" or "When Full" for Spins/SNGs; empty for scheduled MTTs. */
export function seatStartWords(p) {
    if (!isSeatBasedTournament(p)) return '';
    const seats = Number(p?.maxPlayers);
    if (Number.isFinite(seats) && seats > 0) {
        return `When Full (${chipAmount(seats)} Players)`;
    }
    return 'When Full';
}

export function startingStackWords(p) {
    const stack = Number(p?.startingChips);
    return Number.isFinite(stack) && stack > 0 ? `${chipAmount(stack)} Chips` : '';
}

export function seatsCountWords(p) {
    const seats = Number(p?.maxPlayers);
    return Number.isFinite(seats) && seats > 0 ? `${chipAmount(seats)} Players` : '';
}

/**
 * "NLH PKO", "PLO5 Sit & Go": the game, then what kind of event it is. Speed
 * is left to the event's own name: Club Arena names a structure by its level
 * clock, and a stored turbo flag can disagree with it.
 */
export function gameLine(p) {
    const fmtKey = typeof p?.format === 'string' ? p.format.trim().toLowerCase() : '';
    const kind = p?.bounty || (fmtKey && FORMAT_WORDS[fmtKey] !== undefined ? FORMAT_WORDS[fmtKey] : '');
    return [p?.game, kind].filter(Boolean).join(' ');
}

export function buyInWords(p) {
    if (p.freeBuy) return 'Free Entry';
    const total = (p.buyIn || 0) + (p.fee || 0);
    return total > 0 ? `Buy-In ${chipAmount(total)} Chips` : 'Free Entry';
}

export function guaranteeWords(p) {
    return p.guarantee ? `${chipAmount(p.guarantee)} Chips GTD` : '';
}

/** "Tue Nov 17, 7:00 PM CT". The platform runs on Chicago time. */
export function startWords(iso) {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return '';
    const s = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(t));
    // "Tue, Nov 17, 7:00 PM" -> "Tue Nov 17, 7:00 PM"
    return `${s.replace(/^(\w{3}),\s/, '$1 ')} CT`;
}

/** What the event is doing, in a player's words. */
export function statusWords(p, now = Date.now()) {
    const s = String(p.status || '').toUpperCase();
    if (s === 'CANCELLED') return 'Cancelled';
    if (s === 'COMPLETED' || s === 'FINISHED') return 'Finished';
    if (s === 'RUNNING' || s === 'BREAK' || s === 'PAUSED' || s === 'FINAL_TABLE') {
        if (isSeatBasedTournament(p)) return 'Running Now';
        const start = Date.parse(p.startTime || '');
        const lateEnds = Number.isFinite(start) && p.lateRegMinutes ? start + p.lateRegMinutes * 60_000 : NaN;
        return Number.isFinite(lateEnds) && now < lateEnds ? 'Running, Late Registration Open' : 'Running Now';
    }
    return 'Registration Open';
}

export function isOpenForEntry(p, now = Date.now()) {
    const words = statusWords(p, now);
    return words === 'Registration Open' || words === 'Running, Late Registration Open';
}

/**
 * Facts grid for the /t/[id] landing card. Spins and Sit & Go's never emit a
 * clock start time or a "Guarantee: None" placeholder; they show real seat/stack
 * facts and "When Full".
 */
export function tournamentLandingFacts(p, now = Date.now()) {
    if (!p) return [];
    const seatBased = isSeatBasedTournament(p);
    const gtd = guaranteeWords(p).replace(/ GTD$/, '');
    const stack = startingStackWords(p);
    const seats = seatsCountWords(p);
    const secondFact = gtd
        ? ['Guarantee', gtd]
        : stack
          ? ['Starting Stack', stack]
          : seats
            ? ['Seats', seats]
            : seatBased
              ? null
              : ['Guarantee', 'None'];
    const startFact = seatBased
        ? ['Starts', seatStartWords(p)]
        : ['Starts', startWords(p.startTime) || 'Soon'];
    return [
        ['Buy-In', buyInWords(p).replace(/^Buy-In /, '')],
        secondFact,
        startFact,
        ['Status', statusWords(p, now)],
    ].filter(Boolean);
}

/**
 * Stat bays for the 1200x630 /api/og/club-tournament image. Same seat-based
 * contract: Spins and Sit & Go's never emit a scheduled clock start time.
 */
export function tournamentOgFacts(p, now = Date.now()) {
    if (!p) return [];
    const seatBased = isSeatBasedTournament(p);
    const status = statusWords(p, now);
    const gtd = guaranteeWords(p).replace(/ GTD$/, '');
    const stack = startingStackWords(p);
    const seats = seatsCountWords(p);
    const secondFact = gtd
        ? { label: 'GUARANTEE', value: gtd }
        : stack
          ? { label: 'STARTING STACK', value: stack }
          : seatBased && seats
            ? { label: 'SEATS', value: seats }
            : null;
    const thirdFact = seatBased
        ? status === 'Registration Open'
            ? { label: 'STARTS', value: seatStartWords(p) }
            : { label: 'STATUS', value: status }
        : status === 'Registration Open' && startWords(p.startTime)
          ? { label: 'STARTS', value: startWords(p.startTime) }
          : { label: 'STATUS', value: status };
    return [
        { label: 'BUY-IN', value: buyInWords(p).replace(/^Buy-In /, '') },
        secondFact,
        thirdFact,
    ].filter(Boolean);
}

/** The words a messaging app shows. Chips, never a currency sign. */
export function tournamentPreviewText(p, now = Date.now()) {
    const preview = p || {};
    const headline = preview.name || 'A Club Arena Tournament';
    const parts = [];
    const game = gameLine(preview);
    if (game) parts.push(game);
    parts.push(buyInWords(preview));
    const gtd = guaranteeWords(preview);
    if (gtd) parts.push(gtd);
    const seatBased = isSeatBasedTournament(preview);
    const status = statusWords(preview, now);
    if (seatBased) {
        if (status === 'Registration Open') parts.push(`Starts ${seatStartWords(preview)}`);
        else parts.push(status);
    } else {
        const when = startWords(preview.startTime);
        if (status === 'Registration Open' && when) parts.push(`Starts ${when}`);
        else parts.push(status);
    }
    if (preview.club) parts.push(preview.club);
    const cta = isOpenForEntry(preview, now) ? 'Register On Smarter.Poker.' : 'Play Poker Tournaments On Smarter.Poker.';
    return { headline, description: `${parts.join(' | ')}. ${cta}` };
}

/** A signed-in browser holds the shared Supabase session under this key. */
export function hasSignedInSession(storage) {
    try {
        const raw = storage?.getItem('smarter-poker-auth');
        if (!raw) return false;
        const session = JSON.parse(raw);
        return Boolean(session?.access_token && session?.user?.id);
    } catch {
        return false;
    }
}
