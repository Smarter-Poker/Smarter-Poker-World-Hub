/**
 * Live Spot Quick Logger · pure helpers.
 *
 * buildLiveSpotHandHistory(spot)  -> clean PokerStars-format NLHE hand text built ONLY from what the
 *                                    player typed (Hero cards, position, format, stack, action, board).
 *                                    It never invents cards, never lets two cards collide and never
 *                                    guesses a result. The hand ends at Hero's decision.
 * detectExternalHandFormat(text)  -> which site wrote a pasted hand history and whether it is NLHE.
 *                                    Non-NLHE variants (PLO, Short Deck, Limit, Stud...) are flagged
 *                                    honestly so the UI never pretends it can audit them.
 *
 * Zero dependencies and no I/O so the Node test runner can import this file directly.
 */

export const LIVE_SPOT_POSITIONS = Object.freeze(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']);
export const LIVE_SPOT_FORMATS = Object.freeze(['cash', 'tournament']);
export const LIVE_SPOT_FACING = Object.freeze(['unopened', 'open_raise', 'three_bet', 'facing_bet']);
export const LIVE_SPOT_ACTIONS = Object.freeze(['fold', 'call', 'raise']);

export const LIVE_SPOT_FACING_LABELS = Object.freeze({
  unopened: 'Folded To Me',
  open_raise: 'Facing An Open Raise',
  three_bet: 'Facing A 3-Bet',
  facing_bet: 'Facing A Postflop Bet',
});

export const LIVE_SPOT_ACTION_LABELS = Object.freeze({
  fold: 'Fold',
  call: 'Call',
  raise: 'Raise',
});

export const LIVE_SPOT_MIN_STACK_BB = 2;
export const LIVE_SPOT_MAX_STACK_BB = 500;

// 6-max seat map. The Seat 1 button layout makes the existing parser derive the
// same position labels the player picked (BTN, SB, BB, UTG, MP, CO).
const SEAT_BY_POSITION = Object.freeze({ BTN: 1, SB: 2, BB: 3, UTG: 4, MP: 5, CO: 6 });
const PREFLOP_ORDER = Object.freeze(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']);
const POSTFLOP_ORDER = Object.freeze(['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN']);

const SUIT_SYMBOLS = Object.freeze({ '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' });
const CARD_TOKEN = /(10|[2-9TJQKA])([shdc♠♥♦♣])/gi;

/**
 * Parse "As Kd", "AsKd", "as,kd", "A♠ K♦" or an array into canonical cards.
 * Returns { cards, valid } where valid is false when ANY leftover characters
 * remain, so a typo can never silently turn into a different hand.
 */
export function parseLiveSpotCards(input) {
  if (input == null || input === '') return { cards: [], valid: true };
  const raw = Array.isArray(input) ? input.join(' ') : String(input);
  const compact = raw.replace(/[\s,;|/-]+/g, '');
  if (!compact) return { cards: [], valid: true };
  const cards = [];
  let consumed = 0;
  CARD_TOKEN.lastIndex = 0;
  let match = CARD_TOKEN.exec(compact);
  while (match) {
    if (match.index !== consumed) return { cards, valid: false };
    const rank = match[1] === '10' ? 'T' : match[1].toUpperCase();
    const suitRaw = match[2];
    const suit = SUIT_SYMBOLS[suitRaw] || suitRaw.toLowerCase();
    cards.push(`${rank}${suit}`);
    consumed = match.index + match[0].length;
    match = CARD_TOKEN.exec(compact);
  }
  return { cards, valid: consumed === compact.length };
}

/** Cards that appear more than once across every list passed in. */
export function findDuplicateCards(...lists) {
  const seen = new Set();
  const duplicates = new Set();
  for (const list of lists) {
    for (const card of list || []) {
      if (seen.has(card)) duplicates.add(card);
      seen.add(card);
    }
  }
  return [...duplicates];
}

/** The actions Hero can legally log for a facing situation. */
export function allowedLiveSpotActions(facing) {
  return LIVE_SPOT_FACING.includes(facing) ? [...LIVE_SPOT_ACTIONS] : [];
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function hashSpot(spot) {
  const text = JSON.stringify(spot);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function formatClock(date) {
  const d = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date(0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ET`;
}

/**
 * Validate and normalise a quick spot. Never throws.
 * @returns {{ ok: boolean, errors: string[], spot: object|null }}
 */
export function validateLiveSpot(rawSpot) {
  const errors = [];
  const spot = rawSpot && typeof rawSpot === 'object' ? rawSpot : {};

  const hero = parseLiveSpotCards(spot.heroCards ?? spot.hero);
  if (!hero.valid) errors.push('Hero Cards Are Not Valid. Use Two Cards Like As Kd.');
  else if (hero.cards.length !== 2) errors.push('Enter Exactly Two Hero Cards.');

  const board = parseLiveSpotCards(spot.board);
  if (!board.valid) errors.push('Board Cards Are Not Valid. Use Cards Like 7h 2d Tc.');
  else if (![0, 3, 4, 5].includes(board.cards.length)) errors.push('Board Needs 3, 4 Or 5 Cards, Or Leave It Empty.');

  const duplicates = findDuplicateCards(hero.cards, board.cards);
  if (duplicates.length > 0) errors.push(`Duplicate Card${duplicates.length === 1 ? '' : 's'}: ${duplicates.join(' ')}. Every Card Can Appear Only Once.`);

  const position = String(spot.position || '').toUpperCase();
  if (!LIVE_SPOT_POSITIONS.includes(position)) errors.push('Choose Your Position.');

  const format = String(spot.format || '').toLowerCase();
  if (!LIVE_SPOT_FORMATS.includes(format)) errors.push('Choose Cash Or Tournament.');

  const stackBb = Number(spot.stackBb);
  if (!Number.isFinite(stackBb) || stackBb < LIVE_SPOT_MIN_STACK_BB || stackBb > LIVE_SPOT_MAX_STACK_BB) {
    errors.push(`Stack Must Be Between ${LIVE_SPOT_MIN_STACK_BB} And ${LIVE_SPOT_MAX_STACK_BB} BB.`);
  }

  const facing = String(spot.facing || '');
  if (!LIVE_SPOT_FACING.includes(facing)) errors.push('Choose What You Are Facing.');

  const action = String(spot.action || '').toLowerCase();
  if (!LIVE_SPOT_ACTIONS.includes(action)) errors.push('Choose Your Action.');

  if (LIVE_SPOT_FACING.includes(facing)) {
    if (facing === 'facing_bet' && board.cards.length < 3) errors.push('A Postflop Bet Needs At Least A 3-Card Flop.');
    if (facing !== 'facing_bet' && board.cards.length > 0) errors.push('Remove The Board Or Choose Facing A Postflop Bet.');
    if (facing === 'unopened' && position === 'BB') errors.push('The Big Blind Cannot Be Folded To. Choose Another Situation.');
    if (facing === 'open_raise' && position === 'UTG') errors.push('UTG Acts First, So It Cannot Face An Open Raise.');
    if (facing === 'three_bet' && position === 'BB') errors.push('The Big Blind Cannot Have Opened. Choose Another Situation.');
  }

  if (errors.length > 0) return { ok: false, errors, spot: null };
  return {
    ok: true,
    errors: [],
    spot: {
      heroCards: hero.cards,
      board: board.cards,
      position,
      format,
      stackBb,
      facing,
      action,
    },
  };
}

/**
 * Build clean PokerStars-format NLHE hand text for a quick live spot.
 *
 * @param {object} spot  { heroCards, position, format, stackBb, facing, action, board? }
 * @param {object} [options] { now: Date, handId: string }
 * @returns {{ ok: boolean, errors: string[], text: string, handId: string|null, street: string|null,
 *            heroCards: string[], board: string[] }}
 */
export function buildLiveSpotHandHistory(spot, options = {}) {
  const checked = validateLiveSpot(spot);
  if (!checked.ok) {
    return { ok: false, errors: checked.errors, text: '', handId: null, street: null, heroCards: [], board: [] };
  }
  const s = checked.spot;
  const isTournament = s.format === 'tournament';
  const stack = s.stackBb;
  const handId = String(options.handId || `7${String(hashSpot(s)).padStart(11, '0')}`).replace(/\D/g, '') || '7000000000001';

  const nameOf = (pos) => (pos === s.position ? 'Hero' : `Villain_${pos}`);
  const money = (bb) => {
    const value = round2(bb);
    if (isTournament) return String(Math.round(value * 100));
    return `$${Number.isInteger(value) ? String(value) : value.toFixed(2)}`;
  };

  const committed = {}; // this street
  const totals = {}; // whole hand
  let currentBet = 0;
  let pot = 0;
  const lines = [];

  const put = (pos, toTotalThisStreet) => {
    const already = committed[pos] || 0;
    const cap = stack - (totals[pos] || 0) + already;
    const to = Math.min(toTotalThisStreet, cap);
    const add = round2(to - already);
    committed[pos] = to;
    totals[pos] = round2((totals[pos] || 0) + add);
    pot = round2(pot + add);
    if (to > currentBet) currentBet = to;
    return { to, add, allIn: round2(totals[pos]) >= stack };
  };
  const allInTag = (allIn) => (allIn ? ' and is all-in' : '');
  const fold = (pos) => lines.push(`${nameOf(pos)}: folds`);
  const check = (pos) => lines.push(`${nameOf(pos)}: checks`);
  const call = (pos) => {
    const r = put(pos, currentBet);
    lines.push(`${nameOf(pos)}: calls ${money(r.add)}${allInTag(r.allIn)}`);
  };
  const raiseTo = (pos, to) => {
    const before = currentBet;
    const cap = stack - (totals[pos] || 0) + (committed[pos] || 0);
    if (Math.min(to, cap) <= before) {
      // Short stack: the raise is really a call of an all-in shove.
      call(pos);
      return;
    }
    const r = put(pos, to);
    lines.push(`${nameOf(pos)}: raises ${money(r.to - before)} to ${money(r.to)}${allInTag(r.allIn)}`);
  };
  const bet = (pos, amount) => {
    const r = put(pos, amount);
    lines.push(`${nameOf(pos)}: bets ${money(r.add)}${allInTag(r.allIn)}`);
  };
  const act = (pos, action, raiseSize) => {
    if (action === 'fold') fold(pos);
    else if (action === 'call') call(pos);
    else raiseTo(pos, raiseSize);
  };

  // Blinds
  const sbPos = 'SB';
  const bbPos = 'BB';
  const sbBlind = put(sbPos, 0.5);
  const bbBlind = put(bbPos, 1);
  const blindLines = [
    `${nameOf(sbPos)}: posts small blind ${money(sbBlind.add)}`,
    `${nameOf(bbPos)}: posts big blind ${money(bbBlind.add)}`,
  ];
  currentBet = 1;

  const heroIdx = PREFLOP_ORDER.indexOf(s.position);
  const foldBefore = (idx) => {
    for (let i = 0; i < idx; i += 1) fold(PREFLOP_ORDER[i]);
  };
  const BTN_IDX = PREFLOP_ORDER.indexOf('BTN');

  let street = 'preflop';

  if (s.facing === 'unopened') {
    foldBefore(heroIdx);
    act(s.position, s.action, s.position === 'SB' ? 3 : 2.5);
  } else if (s.facing === 'open_raise') {
    const openerIdx = heroIdx >= BTN_IDX ? BTN_IDX : heroIdx - 1;
    foldBefore(openerIdx);
    raiseTo(PREFLOP_ORDER[openerIdx], 2.5);
    for (let i = openerIdx + 1; i < heroIdx; i += 1) {
      if (PREFLOP_ORDER[i] === bbPos) break;
      fold(PREFLOP_ORDER[i]);
    }
    const inPosition = ['MP', 'CO', 'BTN'].includes(s.position);
    act(s.position, s.action, inPosition ? 7.5 : 10);
  } else if (s.facing === 'three_bet') {
    foldBefore(heroIdx);
    raiseTo(s.position, s.position === 'SB' ? 3 : 2.5);
    const villainPos = PREFLOP_ORDER[heroIdx + 1];
    const isBlind = villainPos === 'SB' || villainPos === 'BB';
    raiseTo(villainPos, isBlind ? 11 : 8);
    act(s.position, s.action, 21);
  } else {
    // Single raised heads-up pot, then check down to the street Hero faces a bet on.
    const heroIsBlind = s.position === 'BB';
    const raiser = heroIsBlind ? 'BTN' : s.position;
    const caller = 'BB';
    const villain = heroIsBlind ? 'BTN' : 'BB';
    const raiserIdx = PREFLOP_ORDER.indexOf(raiser);
    foldBefore(raiserIdx);
    raiseTo(raiser, raiser === 'SB' ? 3 : 2.5);
    for (let i = raiserIdx + 1; i < PREFLOP_ORDER.length; i += 1) {
      const pos = PREFLOP_ORDER[i];
      if (pos === caller) break;
      fold(pos);
    }
    call(caller);
    const board = s.board;
    const streets = [
      { name: 'flop', cards: board.slice(0, 3), header: `*** FLOP *** [${board.slice(0, 3).join(' ')}]` },
    ];
    if (board.length >= 4) streets.push({ name: 'turn', cards: [board[3]], header: `*** TURN *** [${board.slice(0, 3).join(' ')}] [${board[3]}]` });
    if (board.length === 5) streets.push({ name: 'river', cards: [board[4]], header: `*** RIVER *** [${board.slice(0, 4).join(' ')}] [${board[4]}]` });
    const heroFirst = POSTFLOP_ORDER.indexOf(s.position) < POSTFLOP_ORDER.indexOf(villain);
    const firstActor = heroFirst ? s.position : villain;
    const secondActor = heroFirst ? villain : s.position;
    street = streets[streets.length - 1].name;
    streets.forEach((st, index) => {
      lines.push(st.header);
      for (const pos of Object.keys(committed)) committed[pos] = 0;
      currentBet = 0;
      const isLast = index === streets.length - 1;
      if (!isLast) {
        check(firstActor);
        check(secondActor);
        return;
      }
      if (heroFirst) check(s.position);
      const betSize = Math.max(0.5, round2(pot / 2));
      bet(villain, betSize);
      act(s.position, s.action, round2(currentBet * 3));
    });
  }

  const preflopBody = lines.splice(0, lines.length);
  const header = isTournament
    ? `PokerStars Hand #${handId}: Tournament #${handId.slice(-8)}, $10+$1 USD Hold'em No Limit - Level I (50/100) - ${formatClock(options.now instanceof Date ? options.now : new Date())}`
    : `PokerStars Hand #${handId}: Hold'em No Limit ($0.50/$1.00 USD) - ${formatClock(options.now instanceof Date ? options.now : new Date())}`;
  const tableLine = `Table '${isTournament ? `${handId.slice(-8)} 1` : 'Quick Spot'}' 6-max Seat #1 is the button`;
  const seatLines = [];
  for (const pos of ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO']) {
    seatLines.push(`Seat ${SEAT_BY_POSITION[pos]}: ${nameOf(pos)} (${money(stack)} in chips)`);
  }

  // Street headers were pushed into `lines` while building postflop; split the preflop body
  // from the postflop section so the hole-cards block sits between blinds and first action.
  const firstStreetIdx = preflopBody.findIndex((line) => line.startsWith('*** FLOP ***'));
  const preflopActions = firstStreetIdx === -1 ? preflopBody : preflopBody.slice(0, firstStreetIdx);
  const postflopLines = firstStreetIdx === -1 ? [] : preflopBody.slice(firstStreetIdx);

  const text = [
    header,
    tableLine,
    ...seatLines,
    ...blindLines,
    '*** HOLE CARDS ***',
    `Dealt to Hero [${s.heroCards.join(' ')}]`,
    ...preflopActions,
    ...postflopLines,
    '*** SUMMARY ***',
    `Total pot ${money(pot)} | Rake ${money(0)}`,
    '',
  ].join('\n');

  return { ok: true, errors: [], text, handId, street, heroCards: s.heroCards, board: s.board };
}

const SITE_LABELS = Object.freeze({
  pokerstars: 'PokerStars',
  ggpoker: 'GGPoker',
  clubgg: 'ClubGG',
  acr: 'ACR',
  '888poker': '888poker',
  unknown: 'Unknown Site',
});

const VARIANT_LABELS = Object.freeze({
  nlhe: 'No-Limit Hold\u2019em',
  plo: 'Pot-Limit Omaha',
  short_deck: 'Short Deck',
  limit_holdem: 'Limit Hold\u2019em',
  other: 'Other Game',
  unknown: 'Unknown Game',
});

function classifyVariant(text) {
  const t = String(text || '');
  if (/short[\s-]?deck|6\s?\+\s?hold'?em|six\s?plus/i.test(t)) return 'short_deck';
  if (/omaha|\bplo\d?\b|\bpl\s?omaha/i.test(t)) return 'plo';
  if (/\bstud\b|razz|draw|badugi|\b2-7\b|\bhorse\b|\bofc\b|chinese poker/i.test(t)) return 'other';
  const holdem = /hold'?em|holdem/i.test(t);
  if (holdem && /no[\s-]?limit|\bNL\b/i.test(t)) return 'nlhe';
  if (holdem && /pot[\s-]?limit/i.test(t)) return 'other';
  if (holdem && /\blimit\b|\bfl\b/i.test(t)) return 'limit_holdem';
  return 'unknown';
}

const HAND_HEADER_LINE = /^\s*(?:\*{5}\s*888poker Hand History for Game\s+\d+|(?:PokerStars\s+(?:Zoom\s+)?(?:Hand|Game)\s+#|Poker Hand\s+#|(?:Game\s+)?Hand\s+#)\S*)/i;

/**
 * Identify the site and game of a pasted hand history. Never throws.
 * @returns {{ site, label, variant, variantLabel, supported: boolean|null, handCount,
 *            unsupportedHandCount, mixed: boolean, reason: string|null }}
 */
export function detectExternalHandFormat(rawText) {
  const text = typeof rawText === 'string' ? rawText : '';
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      site: 'unknown', label: SITE_LABELS.unknown, variant: 'unknown', variantLabel: VARIANT_LABELS.unknown,
      supported: null, handCount: 0, unsupportedHandCount: 0, mixed: false, reason: null,
    };
  }

  let site = 'unknown';
  if (/club\s?gg/i.test(trimmed)) site = 'clubgg';
  else if (/ggpoker|gg\s?poker|^\s*Poker Hand\s+#(?:HD|TM|RC|OM|SD|[A-Z]{2})\d+/im.test(trimmed)) site = 'ggpoker';
  else if (/888\.?\s?poker|\*{5}\s*888/i.test(trimmed)) site = '888poker';
  else if (/americas?\s*cardroom|\bacr\s*poker|winning poker network|\bWPN\b|^\s*(?:Game\s+)?Hand\s+#\d+\s*-\s*(?:Holdem|Hold'em|Omaha)/im.test(trimmed)) site = 'acr';
  else if (/pokerstars/i.test(trimmed)) site = 'pokerstars';

  const headerLines = trimmed.split(/\r?\n/).filter((line) => HAND_HEADER_LINE.test(line));
  const perHand = headerLines.map((line) => classifyVariant(line));
  let handCount = headerLines.length;
  let variant;
  let unsupportedHandCount = 0;
  let mixed = false;

  if (perHand.length === 0) {
    variant = classifyVariant(trimmed.slice(0, 4000));
    handCount = site === 'unknown' && variant === 'unknown' ? 0 : 1;
    unsupportedHandCount = variant === 'nlhe' || variant === 'unknown' ? 0 : handCount;
  } else {
    const nlhe = perHand.filter((v) => v === 'nlhe').length;
    const unknown = perHand.filter((v) => v === 'unknown').length;
    const other = perHand.filter((v) => v !== 'nlhe' && v !== 'unknown');
    unsupportedHandCount = other.length;
    if (nlhe > 0 && other.length > 0) {
      variant = 'nlhe';
      mixed = true;
    } else if (other.length > 0) {
      variant = other[0];
    } else if (nlhe > 0) {
      variant = 'nlhe';
    } else {
      variant = unknown > 0 ? classifyVariant(trimmed.slice(0, 4000)) : 'unknown';
    }
  }

  let supported = null;
  let reason = null;
  if (variant === 'nlhe') {
    supported = true;
    if (mixed) reason = `${unsupportedHandCount} Non-NLHE Hand${unsupportedHandCount === 1 ? '' : 's'} Will Be Skipped Honestly.`;
  } else if (variant !== 'unknown') {
    supported = false;
    reason = `${VARIANT_LABELS[variant]} Is Not Audited Yet. Only No-Limit Hold\u2019em Hands Can Be Checked Against Solver Evidence.`;
  } else if (site === 'unknown') {
    reason = trimmed.length > 0 ? 'This Text Does Not Look Like A Supported Hand History Yet.' : null;
  }

  return {
    site,
    label: SITE_LABELS[site],
    variant,
    variantLabel: VARIANT_LABELS[variant],
    supported,
    handCount,
    unsupportedHandCount,
    mixed,
    reason,
  };
}

function finiteOrNull(value) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) ? n : null;
}

/**
 * Reduce an /api/training/audit-hand-history response to what the UI may honestly
 * show. A decision is only "verified" when the server says solverVerified === true;
 * everything else stays unpriced and carries NO solver action or EV claim.
 */
export function summarizeLiveSpotAudit(payload) {
  const analyses = Array.isArray(payload?.analyses) ? payload.analyses : [];
  const decisions = [];
  let drillHref = null;
  for (const analysis of analyses) {
    if (!drillHref && typeof analysis?.drillHref === 'string' && /^\/hub\/[A-Za-z0-9/_\-?=&%.:+,]*$/.test(analysis.drillHref)) {
      drillHref = analysis.drillHref;
    }
    for (const decision of Array.isArray(analysis?.decisions) ? analysis.decisions : []) {
      const verified = decision?.solverVerified === true;
      decisions.push({
        street: String(decision?.street || 'preflop').toLowerCase(),
        position: decision?.heroPosition || null,
        playerAction: decision?.playerAction || null,
        solverAction: verified ? (decision?.solverAction || null) : null,
        classification: verified ? (decision?.classification || null) : 'unpriced',
        evLoss: verified && decision?.evLossMeasured === true ? finiteOrNull(decision?.evLoss) : null,
        verified,
      });
    }
  }
  const verifiedCount = decisions.filter((d) => d.verified).length;
  return {
    handsParsed: finiteOrNull(payload?.handsParsed) ?? analyses.length,
    decisionsAnalyzed: decisions.length,
    verifiedCount,
    unpricedCount: decisions.length - verifiedCount,
    decisions: decisions.slice(0, 6),
    drillHref,
    hasVerifiedAdvice: verifiedCount > 0,
    complete: payload?.complete !== false,
  };
}
