import { createHmac, timingSafeEqual } from 'node:crypto';

const DELETE_SCOPES = new Set(['coaching', 'analysis', 'sandbox', 'all']);
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function signingSecret(explicit) {
  const value = String(explicit || process.env.PA_DATA_LIFECYCLE_SECRET || process.env.NEXTAUTH_SECRET || '').trim();
  if (value.length < 24) throw new Error('Data Lifecycle Signing Is Not Configured.');
  return value;
}

function signature(payload, secret) {
  return createHmac('sha256', signingSecret(secret)).update(payload).digest('base64url');
}

function assertScope(scope) {
  const normalized = String(scope || '').toLowerCase();
  if (!DELETE_SCOPES.has(normalized)) throw new TypeError('Deletion Scope Is Invalid.');
  return normalized;
}

export function sealDeletionChallenge({ userId, scope, now = Date.now(), secret } = {}) {
  const owner = String(userId || '').trim();
  if (!owner) throw new TypeError('Deletion Owner Is Required.');
  const normalizedScope = assertScope(scope);
  const payload = Buffer.from(JSON.stringify({ u: owner, s: normalizedScope, e: now + CHALLENGE_TTL_MS })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function openDeletionChallenge(token, { userId, scope, now = Date.now(), secret } = {}) {
  try {
    const [payload, suppliedSignature, extra] = String(token || '').split('.');
    if (!payload || !suppliedSignature || extra) throw new Error('shape');
    const expected = signature(payload, secret);
    const supplied = Buffer.from(suppliedSignature);
    const trusted = Buffer.from(expected);
    if (supplied.length !== trusted.length || !timingSafeEqual(supplied, trusted)) throw new Error('signature');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const expectedScope = assertScope(scope);
    if (decoded.u !== String(userId || '') || decoded.s !== expectedScope) throw new Error('owner');
    if (!Number.isFinite(decoded.e) || decoded.e < now) throw new RangeError('Expired Deletion Challenge.');
    return { userId: decoded.u, scope: decoded.s, expiresAt: decoded.e };
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new TypeError('Invalid Deletion Challenge.');
  }
}

export function retentionDays(value) {
  if (value === null || value === undefined || value === '' || value === 'forever') return null;
  const days = Number(value);
  if (![30, 90, 180, 365].includes(days)) throw new TypeError('Retention Period Is Invalid.');
  return days;
}

export function sanitizeExportHandRow(row, userId) {
  if (!row || typeof row !== 'object') return row;
  const uid = String(userId || '');
  const shownIds = new Set();
  const isShownPlayer = (player) => Boolean(
    player?.showed === true
    || player?.shown === true
    || player?.showedCards === true
    || player?.showed_cards === true
    || player?.wentToShowdown === true
  );
  const sanitizePlayer = (player) => {
    if (!player || typeof player !== 'object') return player;
    const pid = String(player.userId ?? player.user_id ?? player.id ?? player.playerId ?? '');
    const isOwner = Boolean(uid && pid === uid);
    const showed = isShownPlayer(player);
    if (showed && pid) shownIds.add(pid);
    if (isOwner || showed) return player;
    const clean = { ...player };
    delete clean.cards;
    delete clean.hole_cards;
    delete clean.holeCards;
    delete clean.heroCards;
    return clean;
  };
  const sanitizeHoleCardsMap = (mapObj) => {
    if (!mapObj || typeof mapObj !== 'object' || Array.isArray(mapObj)) return mapObj;
    const cleanMap = {};
    for (const [key, val] of Object.entries(mapObj)) {
      if ((uid && String(key) === uid) || shownIds.has(String(key))) {
        cleanMap[key] = val;
      }
    }
    return cleanMap;
  };
  const sanitizeSummaryObject = (summaryObj) => {
    if (!summaryObj || typeof summaryObj !== 'object') return summaryObj;
    const cleanSum = { ...summaryObj };
    if (Array.isArray(cleanSum.players)) {
      cleanSum.players = cleanSum.players.map(sanitizePlayer);
    }
    if (cleanSum.hole_cards && typeof cleanSum.hole_cards === 'object') {
      cleanSum.hole_cards = sanitizeHoleCardsMap(cleanSum.hole_cards);
    }
    if (cleanSum.holeCards && typeof cleanSum.holeCards === 'object') {
      cleanSum.holeCards = sanitizeHoleCardsMap(cleanSum.holeCards);
    }
    return cleanSum;
  };

  const next = { ...row };
  if (Array.isArray(row.players)) next.players = row.players.map(sanitizePlayer);
  if (row.hand_data && typeof row.hand_data === 'object') {
    const cleanHandData = { ...row.hand_data };
    if (Array.isArray(cleanHandData.players)) {
      cleanHandData.players = cleanHandData.players.map(sanitizePlayer);
    }
    if (cleanHandData.hole_cards && typeof cleanHandData.hole_cards === 'object') {
      cleanHandData.hole_cards = sanitizeHoleCardsMap(cleanHandData.hole_cards);
    }
    next.hand_data = cleanHandData;
  }
  if (row.summary && typeof row.summary === 'object') {
    next.summary = sanitizeSummaryObject(row.summary);
  } else if (typeof row.summary === 'string' && row.summary.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(row.summary);
      next.summary = JSON.stringify(sanitizeSummaryObject(parsed));
    } catch (_) {
      // Non-JSON summary string — leave intact
    }
  }
  if (row.hole_cards && typeof row.hole_cards === 'object') {
    next.hole_cards = sanitizeHoleCardsMap(row.hole_cards);
  }
  return next;
}

export default { sealDeletionChallenge, openDeletionChallenge, retentionDays, sanitizeExportHandRow };
