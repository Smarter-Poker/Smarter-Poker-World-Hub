/**
 * Shared Club Arena tables & Lightning pools:
 *   - smarter.poker/g/<tableId>    (live cash / heads-up / seated table)
 *   - smarter.poker/l/<clusterId>  (Lightning fast-fold pool)
 *
 * Mirrors src/lib/sharedTournamentLink.js:
 * Reads safe public lobby-card facts via anon-callable read-only RPCs
 * (`fn_ca_table_share_preview` and `fn_ca_lightning_share_preview`).
 * Private, hidden, or non-public-club games answer `{ found: false }`,
 * identical to a missing UUID. If an RPC is unavailable or not yet installed
 * (404/400/5xx or network error), readers return `{ status: 'unknown' }` so
 * SSR pages and OG cards degrade gracefully without ever crashing.
 *
 * Amounts are always chips (or diamonds for platform Diamond arenas): never a
 * currency sign ($). Copy is Title Case with zero em-dashes.
 */
import { resolveAnonKey, SUPABASE_URL_FALLBACK } from './supabaseKeys.js';
import { safeClubArenaPath } from './clubInvite.js';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL_FALLBACK).trim();

export const GAME_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const INVITE_CODE_PARAM_RE = /^[A-Za-z0-9]{4,24}$/;
export const INVITE_TOKEN_PARAM_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function normalizeGameId(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    return GAME_ID_RE.test(v) ? v : null;
}

function firstParam(value) {
    return Array.isArray(value) ? value[0] : value;
}

/**
 * Sanitize optional share query parameters (`i`, `cluster`, `invite`).
 * Rejects any malformed, injected, or out-of-range value cleanly.
 */
export function sanitizeShareParams(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};

    const rawI = firstParam(src.i);
    let i = null;
    if (typeof rawI === 'string') {
        const trimmed = rawI.trim();
        if (INVITE_CODE_PARAM_RE.test(trimmed)) i = trimmed.toUpperCase();
    }

    const cluster = normalizeGameId(firstParam(src.cluster));

    const rawInvite = firstParam(src.invite);
    let invite = null;
    if (typeof rawInvite === 'string') {
        const trimmed = rawInvite.trim();
        if (INVITE_TOKEN_PARAM_RE.test(trimmed)) invite = trimmed;
    }

    return { i, cluster, invite };
}

/** Canonical Club Arena destination for a shared table link. */
export function clubArenaTablePath(id, params) {
    const cleanId = normalizeGameId(id);
    if (!cleanId) return '/hub/club-arena';
    const safe = sanitizeShareParams(params);
    const qs = new URLSearchParams();
    if (safe.i) qs.set('i', safe.i);
    if (safe.cluster) qs.set('cluster', safe.cluster);
    if (safe.invite) qs.set('invite', safe.invite);
    const query = qs.toString();
    return query ? `/hub/club-arena/table/${cleanId}?${query}` : `/hub/club-arena/table/${cleanId}`;
}

/** Canonical Club Arena destination for a shared Lightning fast-fold pool link. */
export function clubArenaLightningPath(id, params) {
    const cleanId = normalizeGameId(id);
    if (!cleanId) return '/hub/club-arena';
    const safe = sanitizeShareParams(params);
    const qs = new URLSearchParams();
    if (safe.i) qs.set('i', safe.i);
    const query = qs.toString();
    return query ? `/hub/club-arena/lightning/${cleanId}?${query}` : `/hub/club-arena/lightning/${cleanId}`;
}

/**
 * Signup path for a signed-out friend invited to a table or Lightning game.
 * Preserves the sender's invite attribution code (?invite=) and safe Club
 * Arena return target (?redirect=) so they return straight to the game.
 */
export function clubInviteSignupPath(targetPath, inviteCode) {
    const safeTarget = safeClubArenaPath(targetPath) || '/hub/club-arena';
    const safe = sanitizeShareParams({ i: inviteCode });
    if (safe.i) {
        return `/auth/signup?invite=${encodeURIComponent(safe.i)}&redirect=${encodeURIComponent(safeTarget)}`;
    }
    return `/auth/signup?redirect=${encodeURIComponent(safeTarget)}`;
}

/** Login path preserving safe Club Arena return target and optional invite code. */
export function clubInviteLoginPath(targetPath, inviteCode) {
    const safeTarget = safeClubArenaPath(targetPath) || '/hub/club-arena';
    const safe = sanitizeShareParams({ i: inviteCode });
    if (safe.i) {
        return `/auth/login?invite=${encodeURIComponent(safe.i)}&redirect=${encodeURIComponent(safeTarget)}`;
    }
    return `/auth/login?redirect=${encodeURIComponent(safeTarget)}`;
}

async function readSharedGameRpc(rpcName, payload, fallbackKind, fetchImpl) {
    const { key } = resolveAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    let res;
    try {
        res = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key },
            body: JSON.stringify(payload),
        });
    } catch {
        return { status: 'unknown' };
    }
    if (!res || !res.ok) return { status: 'unknown' };
    let data;
    try {
        data = await res.json();
    } catch {
        return { status: 'unknown' };
    }
    if (!data?.found) return { status: 'missing' };
    return {
        status: 'found',
        preview: cleanGamePreview({ ...data, kind: data.kind || fallbackKind }),
    };
}

/**
 * Server reader for smarter.poker/g/<tableId>.
 * Returns { status: 'found', preview } | { status: 'missing' } | { status: 'unknown' }.
 */
export async function readSharedTable(id, fetchImpl = fetch) {
    const tableId = normalizeGameId(id);
    if (!tableId) return { status: 'missing' };
    return readSharedGameRpc('fn_ca_table_share_preview', { p_table_id: tableId }, 'table', fetchImpl);
}

/**
 * Server reader for smarter.poker/l/<clusterId>.
 * Returns { status: 'found', preview } | { status: 'missing' } | { status: 'unknown' }.
 */
export async function readSharedLightning(id, fetchImpl = fetch) {
    const clusterId = normalizeGameId(id);
    if (!clusterId) return { status: 'missing' };
    return readSharedGameRpc('fn_ca_lightning_share_preview', { p_cluster_id: clusterId }, 'lightning', fetchImpl);
}

const TEXT_FIELDS = ['name', 'game', 'stakes', 'status', 'club'];
const NUMBER_FIELDS = ['smallBlind', 'bigBlind', 'maxPlayers', 'currentPlayers', 'minBuyIn', 'maxBuyIn'];
const FLAG_FIELDS = ['isAllInOrFold', 'isBombPot', 'isStraddle'];

/** Strip unknown/PII fields and sanitize known lobby-card facts. */
export function cleanGamePreview(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;

    const kindRaw = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
    if (kindRaw === 'table' || kindRaw === 'lightning') out.kind = kindRaw;

    const assetRaw = typeof raw.asset === 'string' ? raw.asset.trim().toLowerCase() : '';
    if (assetRaw === 'chips' || assetRaw === 'diamonds') out.asset = assetRaw;

    const clusterId = normalizeGameId(raw.clusterId);
    if (clusterId) out.clusterId = clusterId;

    for (const k of TEXT_FIELDS) {
        const v = typeof raw[k] === 'string' ? raw[k].trim().slice(0, 80) : '';
        if (v) out[k] = k === 'stakes' ? v.replace(/\$/g, '').trim() : v;
    }
    if (out.stakes === '') delete out.stakes;

    for (const k of NUMBER_FIELDS) {
        const rawVal = raw[k];
        if (rawVal === null || rawVal === undefined || rawVal === '') continue;
        const v = Number(rawVal);
        if (Number.isFinite(v) && v >= 0) out[k] = v;
    }

    for (const k of FLAG_FIELDS) {
        if (raw[k] === true) out[k] = true;
    }

    return out;
}

/** 1000 -> "1,000"; 0.5 -> "0.50"; whole numbers print whole. Never a $. */
export function chipAmount(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return '';
    return Number.isInteger(v)
        ? v.toLocaleString('en-US')
        : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const GAME_VARIANT_WORDS = {
    nlh: 'NLH',
    nlhe: 'NLH',
    texas_holdem: 'NLH',
    holdem: 'NLH',
    flh: 'Limit Hold\'em',
    limit_holdem: 'Limit Hold\'em',
    plo: 'PLO4',
    plo4: 'PLO4',
    omaha: 'PLO4',
    plo5: 'PLO5',
    plo6: 'PLO6',
    plo8: 'PLO8',
    plo_hilo: 'PLO8',
    omaha_hilo: 'PLO8',
    short_deck: 'Short Deck',
    '6plus': 'Short Deck',
    ofc: 'OFC',
    pineapple: 'OFC Pineapple',
    mixed: 'Mixed Game',
};

/** Human-readable poker variant + special table format tags (Title Case, no em-dash). */
export function gameVariantWords(p) {
    if (!p || typeof p !== 'object') return '';
    const rawGame = typeof p.game === 'string' ? p.game.trim() : '';
    const key = rawGame.toLowerCase().replace(/[\s-]+/g, '_');
    const base = GAME_VARIANT_WORDS[key] || rawGame;
    const tags = [];
    if (p.kind === 'lightning') tags.push('Lightning');
    if (p.isAllInOrFold) tags.push('All-In Or Fold');
    if (p.isBombPot) tags.push('Bomb Pot');
    if (p.isStraddle) tags.push('Straddle');
    return [base, ...tags].filter(Boolean).join(' ');
}

/** Blinds / stakes formatted without any currency symbol (e.g. "1/2", "0.25/0.50"). */
export function stakesWords(p) {
    if (!p || typeof p !== 'object') return '';
    const sb = Number(p.smallBlind);
    const bb = Number(p.bigBlind);
    if (Number.isFinite(sb) && Number.isFinite(bb) && (sb > 0 || bb > 0)) {
        return `${chipAmount(sb)}/${chipAmount(bb)}`;
    }
    if (typeof p.stakes === 'string' && p.stakes.trim()) {
        return p.stakes.replace(/\$/g, '').replace(/—/g, '-').trim();
    }
    return '';
}

function unitWord(p) {
    return p?.asset === 'diamonds' ? 'Diamonds' : 'Chips';
}

/** Buy-in range formatted in Chips or Diamonds, never a currency sign ($). */
export function buyInRangeWords(p) {
    if (!p || typeof p !== 'object') return '';
    const unit = unitWord(p);
    const min = Number(p.minBuyIn);
    const max = Number(p.maxBuyIn);
    const hasMin = Number.isFinite(min) && min > 0;
    const hasMax = Number.isFinite(max) && max > 0;
    if (hasMin && hasMax) {
        if (min === max) return `${chipAmount(min)} ${unit}`;
        return `${chipAmount(min)} To ${chipAmount(max)} ${unit}`;
    }
    if (hasMin) return `Min ${chipAmount(min)} ${unit}`;
    if (hasMax) return `Up To ${chipAmount(max)} ${unit}`;
    return '';
}

/** Seat count or fast-fold format label (Title Case, no em-dash). */
export function seatsWords(p) {
    if (!p || typeof p !== 'object') return '';
    const max = Number(p.maxPlayers);
    const cur = Number(p.currentPlayers);
    const hasMax = Number.isFinite(max) && max > 0;
    const hasCur = Number.isFinite(cur) && cur >= 0;
    if (p.kind === 'lightning') {
        return hasMax ? `${max}-Max Fast-Fold` : 'Fast-Fold Pool';
    }
    if (hasCur && hasMax) return `${cur}/${max} Seated`;
    if (hasMax) return max === 2 ? 'Heads-Up (2-Max)' : `${max}-Max`;
    return '';
}

/** Preview headline and description for OpenGraph / Twitter cards. Zero $ and zero em-dash. */
export function gamePreviewText(p, fallbackKind = 'table') {
    const preview = p && typeof p === 'object' ? p : {};
    const kind = preview.kind === 'lightning' || fallbackKind === 'lightning' ? 'lightning' : 'table';
    const headline =
        (typeof preview.name === 'string' && preview.name.trim()) ||
        (kind === 'lightning' ? 'A Club Arena Lightning Game' : 'A Club Arena Table');

    const parts = [];
    const variant = gameVariantWords({ ...preview, kind });
    if (variant) parts.push(variant);
    const stakes = stakesWords(preview);
    if (stakes) parts.push(`${stakes} ${unitWord(preview)}`);
    const buyIn = buyInRangeWords(preview);
    if (buyIn) parts.push(`Buy-In ${buyIn}`);
    const seats = seatsWords({ ...preview, kind });
    if (seats) parts.push(seats);
    if (preview.club) parts.push(preview.club);

    const cta =
        kind === 'lightning'
            ? 'Play Lightning Poker On Smarter.Poker.'
            : 'Open Table On Smarter.Poker.';
    const description = parts.length
        ? `${parts.join(' | ')}. ${cta}`
        : kind === 'lightning'
          ? 'Play Lightning Fast-Fold Poker In Private Clubs On Smarter.Poker.'
          : 'Play Live Poker Tables In Private Clubs On Smarter.Poker.';

    return { headline, description };
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
