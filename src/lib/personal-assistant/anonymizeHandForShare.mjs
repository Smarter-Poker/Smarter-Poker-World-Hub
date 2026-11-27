/**
 * Privacy-Safe Hand Anonymizer & Share Builder
 *
 * Browser-safe pure ESM helper (zero Node-only dependencies) used by Review My Play
 * and tests to prepare a saved hand for external sharing.
 *
 * Privacy invariants:
 * - Strips ALL opponent usernames, display names, UUIDs, club IDs, and table names.
 * - Strips ALL hidden opponent hole cards (and any folded/mucked opponent cards).
 * - Strips private review notes unless `{ includeNotes: true }` is explicitly passed.
 * - Produces a clean `/share/hand?view=review&anon=1&...` URL matching `pages/share/hand.js`
 *   plus a concise, copyable plain-text summary.
 */

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['c', 'd', 'h', 's'];
const CARD_CODE_RE = /^(10|[2-9TJQKA])([shdc])$/i;
const UUID_GLOBAL_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const MAX_SHARE_NOTES = 4000;

function normalizeCardCode(raw) {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 51) {
    return `${RANKS[raw % 13]}${SUITS[Math.floor(raw / 13)]}`;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = trimmed.match(CARD_CODE_RE);
  if (!match) return null;
  const rank = match[1].toUpperCase() === '10' ? 'T' : match[1].toUpperCase();
  const suit = match[2].toLowerCase();
  return `${rank}${suit}`;
}

function normalizeCardList(input, max = 6) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const item of input) {
    const code = normalizeCardCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= max) break;
  }
  return out;
}

function finiteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanShortText(value, max = 48) {
  return String(value || '')
    .replace(UUID_GLOBAL_RE, '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeVariant(raw) {
  const clean = cleanShortText(raw, 24);
  if (!clean) return 'NLH';
  const low = clean.toLowerCase();
  if (low === 'holdem' || low === 'nlhe' || low === 'nlh' || low === 'no_limit_holdem' || low === 'texas_holdem') return 'NLH';
  if (low.includes('plo6')) return 'PLO6';
  if (low.includes('plo5')) return 'PLO5';
  if (low.includes('plo8')) return 'PLO8';
  if (low.includes('plo') || low.includes('omaha')) return 'PLO';
  return clean;
}

function inferFormat(savedHand, handData) {
  const explicit = String(handData?.format || savedHand?.format || '').trim().toLowerCase();
  if (explicit === 'tournament' || explicit === 'mtt' || explicit === 'sng') return 'tournament';
  if (explicit === 'cash') return 'cash';
  if (handData?.tournamentId || handData?.tournament_id || savedHand?.tournament_id) return 'tournament';
  return 'cash';
}

function inferFinalStreet(board, streets) {
  const names = Array.isArray(streets)
    ? streets.map((s) => String(s?.name || '').trim().toLowerCase())
    : [];
  if (names.includes('river') || board.length >= 5) return 'river';
  if (names.includes('turn') || board.length === 4) return 'turn';
  if (names.includes('flop') || board.length >= 3) return 'flop';
  return 'preflop';
}

function sanitizeTags(rawTags) {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set();
  const out = [];
  for (const tag of rawTags) {
    if (typeof tag !== 'string') continue;
    const cleaned = tag.replace(/[^a-zA-Z0-9 -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32).trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * Anonymize a saved hand for privacy-safe sharing.
 *
 * @param {object} savedHand - Decorated or raw saved hand row (or hand_data object)
 * @param {object} [options]
 * @param {boolean} [options.includeNotes=false] - Whether to include private review notes
 * @param {string} [options.origin=''] - Optional origin prefix (e.g. 'https://smarter.poker')
 * @returns {{
 *   anonymizedHand: object,
 *   sharePath: string,
 *   shareUrl: string,
 *   url: string,
 *   summaryText: string,
 *   text: string,
 * }}
 */
export function anonymizeHandForShare(savedHand, { includeNotes = false, origin = '' } = {}) {
  const row = savedHand && typeof savedHand === 'object' ? savedHand : {};
  const handData = row.hand_data && typeof row.hand_data === 'object' ? row.hand_data : row;
  const review = (row.review && typeof row.review === 'object' ? row.review : null)
    || (handData.review && typeof handData.review === 'object' ? handData.review : {});

  const variant = normalizeVariant(row.variant || handData.variant || handData.gameVariant);
  const format = inferFormat(row, handData);
  const formatLabel = format === 'tournament' ? 'Tournament' : 'Cash';

  const smallBlind = finiteNumber(row.small_blind ?? handData.smallBlind, 0);
  const bigBlind = finiteNumber(row.big_blind ?? handData.bigBlind, 0);
  const stakes = bigBlind > 0 ? `${smallBlind}/${bigBlind}` : null;
  const potTotal = finiteNumber(row.pot_total ?? handData.potTotal ?? handData.pot, 0);

  // Build anonymized player roster & mapping from original names -> anonymized labels.
  const rawPlayers = Array.isArray(handData.players) ? handData.players : [];
  const nameToAnonLabel = new Map();
  let villainCounter = 0;

  const anonymizedPlayers = rawPlayers.map((p, idx) => {
    const isHero = Boolean(p?.isHero) || (rawPlayers.length === 1 && !p?.name);
    const label = isHero ? 'Hero' : `Villain ${++villainCounter}`;
    const rawName = String(p?.name || p?.username || p?.displayName || '').trim();
    if (rawName) {
      nameToAnonLabel.set(rawName.toLowerCase(), label);
    }
    const folded = Boolean(p?.folded);
    const mucked = Boolean(p?.mucked);
    const explicitlyShown = !isHero
      && p?.showedCards === true
      && p?.cardsVisibility === 'shown'
      && !folded
      && !mucked;

    const visibleCards = isHero
      ? normalizeCardList(p?.holeCards, 6)
      : explicitlyShown
        ? normalizeCardList(p?.holeCards, 6)
        : [];

    return {
      label,
      seatIndex: finiteNumber(p?.seatIndex ?? p?.seat, idx + 1),
      position: p?.position ? cleanShortText(String(p.position).toUpperCase(), 8) : null,
      stack: finiteNumber(p?.stack, 0),
      netResult: finiteNumber(p?.netResult, 0),
      folded,
      mucked,
      isHero,
      showedCards: isHero ? Boolean(p?.showedCards) : (explicitlyShown && visibleCards.length > 0),
      holeCards: visibleCards,
    };
  });

  const heroEntry = anonymizedPlayers.find((p) => p.isHero) || null;
  const heroCards = normalizeCardList(
    Array.isArray(handData.heroCards) && handData.heroCards.length > 0
      ? handData.heroCards
      : (heroEntry?.holeCards || []),
    6,
  );
  const heroPosition = cleanShortText(
    String(handData.heroPosition || heroEntry?.position || '').toUpperCase(),
    8,
  ) || null;
  const heroNet = finiteNumber(handData.heroNet ?? heroEntry?.netResult, 0);

  const primaryBoard = normalizeCardList(
    handData.communityCards || handData.boards?.[0]?.cards || handData.board || [],
    5,
  );
  const boards = Array.isArray(handData.boards) && handData.boards.length > 0
    ? handData.boards
      .map((b, idx) => ({
        index: b?.index ?? idx + 1,
        label: cleanShortText(b?.label || `Board ${idx + 1}`, 24) || `Board ${idx + 1}`,
        cards: normalizeCardList(b?.cards, 5),
      }))
      .filter((b) => b.cards.length > 0)
    : (primaryBoard.length > 0 ? [{ index: 1, label: 'Board 1', cards: primaryBoard }] : []);

  const resolveAnonActor = (rawName, isHeroFlag) => {
    if (isHeroFlag) return 'Hero';
    const key = String(rawName || '').trim().toLowerCase();
    if (key && nameToAnonLabel.has(key)) {
      return nameToAnonLabel.get(key);
    }
    if (key === 'you' || key === 'hero') return 'Hero';
    return 'Villain';
  };

  const rawStreets = Array.isArray(handData.streets) ? handData.streets : [];
  const anonymizedStreets = rawStreets.map((st) => ({
    name: cleanShortText(String(st?.name || 'street').toLowerCase(), 24) || 'street',
    cards: normalizeCardList(st?.cards, 5),
    actions: (Array.isArray(st?.actions) ? st.actions : []).map((act) => {
      const isHero = Boolean(act?.isHero);
      return {
        playerLabel: resolveAnonActor(act?.playerName, isHero),
        position: act?.position ? cleanShortText(String(act.position).toUpperCase(), 8) : null,
        action: cleanShortText(String(act?.action || 'action').toLowerCase(), 24) || 'action',
        amount: act?.amount !== null && act?.amount !== undefined && Number.isFinite(Number(act.amount))
          ? Number(act.amount)
          : null,
        isHero,
      };
    }),
  }));

  const rawWinners = Array.isArray(handData.winners) ? handData.winners : [];
  const anonymizedWinners = rawWinners.map((w) => ({
    playerLabel: resolveAnonActor(w?.playerName || w?.name, Boolean(w?.isHero)),
    amount: finiteNumber(w?.amount, 0),
    hand: w?.hand ? cleanShortText(w.hand, 60) : null,
    isHero: Boolean(w?.isHero),
  }));

  const street = inferFinalStreet(primaryBoard, anonymizedStreets);
  const tags = sanitizeTags(review.tags);

  const rawNotes = typeof review.notes === 'string' ? review.notes.trim().slice(0, MAX_SHARE_NOTES) : '';
  const notes = includeNotes && rawNotes ? rawNotes : null;

  // Build `/share/hand?...` URL strictly matching `pages/share/hand.js` review mode whitelist:
  // ['view', 'hero', 'board', 'street', 'position', 'stakes', 'venue', 'hand', 'anon']
  const params = new URLSearchParams();
  params.set('view', 'review');
  params.set('anon', '1');
  if (heroCards.length > 0) params.set('hero', heroCards.join(','));
  if (primaryBoard.length > 0) params.set('board', primaryBoard.join(','));
  if (street) params.set('street', street);
  if (heroPosition) params.set('position', heroPosition);
  if (stakes) params.set('stakes', stakes);
  params.set('venue', formatLabel);
  const handTitle = cleanShortText(`${variant} ${formatLabel} Hand`, 60);
  if (handTitle) params.set('hand', handTitle);

  const sharePath = `/share/hand?${params.toString()}`;
  const cleanOrigin = typeof origin === 'string' ? origin.trim().replace(/\/+$/, '') : '';
  const shareUrl = cleanOrigin ? `${cleanOrigin}${sharePath}` : sharePath;

  // Build concise, privacy-safe copyable summary text (zero opponent names, UUIDs, club/table names, or hidden cards).
  const lines = [];
  const headerParts = [variant, formatLabel];
  if (stakes) headerParts.push(`(${stakes})`);
  if (heroPosition) headerParts.push(`Hero ${heroPosition}`);
  lines.push(`Smarter.Poker Anonymized Hand · ${headerParts.join(' · ')}`);

  if (heroCards.length > 0) {
    lines.push(`Hero Cards: ${heroCards.join(' ')}`);
  }
  if (boards.length > 1) {
    for (const b of boards) {
      lines.push(`${b.label}: ${b.cards.join(' ')}`);
    }
  } else if (primaryBoard.length > 0) {
    lines.push(`Board: ${primaryBoard.join(' ')}`);
  }

  lines.push(`Pot: ${potTotal} | Hero Net: ${heroNet >= 0 ? `+${heroNet}` : heroNet}`);

  for (const st of anonymizedStreets) {
    if (!st.actions.length) continue;
    const stTitle = st.name.charAt(0).toUpperCase() + st.name.slice(1);
    const actText = st.actions
      .map((a) => {
        const pos = a.position ? ` (${a.position})` : '';
        const amt = a.amount !== null ? ` ${a.amount}` : '';
        return `${a.playerLabel}${pos} ${a.action}${amt}`;
      })
      .join(', ');
    lines.push(`${stTitle}: ${actText}`);
  }

  const shownOpponents = anonymizedPlayers.filter((p) => !p.isHero && p.showedCards && p.holeCards.length > 0);
  if (shownOpponents.length > 0) {
    lines.push(
      `Showdown: ${shownOpponents.map((p) => `${p.label} showed ${p.holeCards.join(' ')}`).join(' · ')}`,
    );
  }

  if (tags.length > 0) {
    lines.push(`Tags: ${tags.join(', ')}`);
  }
  if (notes) {
    lines.push(`Notes: ${notes}`);
  }
  lines.push(`Review Link: ${shareUrl}`);

  const summaryText = lines.join('\n');

  const anonymizedHand = {
    variant,
    format,
    stakes,
    potTotal,
    heroPosition,
    heroCards,
    heroNet,
    board: primaryBoard,
    boards,
    street,
    players: anonymizedPlayers,
    streets: anonymizedStreets,
    winners: anonymizedWinners,
    tags,
    notes,
  };

  return {
    anonymizedHand,
    sharePath,
    shareUrl,
    url: shareUrl,
    summaryText,
    text: summaryText,
  };
}

export default { anonymizeHandForShare };
