/**
 * Comprehensive Poker Brain Decision Engine
 * Supports: No-Limit Hold'em, PLO, PLO Hi-Lo, PLO5, PLO6, Tournament mode
 * Pure JavaScript ES Module for browser use
 *
 * v5 upgrades:
 *   - Full 169-hand preflop ranges per position per action mode
 *     (RFI / vs_limp / vs_raise / vs_3bet / vs_4bet)
 *   - Seeded xorshift32 RNG for deterministic equity within a hand
 *   - Per-call equity memoization
 *   - Board texture classifier (paired / monotone / two-tone / rainbow /
 *     connected / high card)
 *   - SPR-aware, texture-aware postflop sizing
 *   - Proper BB defense range (was empty in v4 - BB auto-folded)
 *   - Preserves the entire v4 public API
 */

const PokerBrainEngine = (() => {
  // ============================================================================
  // CARD UTILITIES
  // ============================================================================

  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const SUITS = ['h', 'd', 'c', 's'];
  const RANK_VALUE = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };

  const parseCards = (str) => {
    const cleaned = str.trim().replace(/\s+/g, ' ');
    const matches = cleaned.match(/([2-9TJQKA])([hdcs])/gi);
    if (!matches) return [];
    return matches.map(card => ({
      rank: card[0].toUpperCase(),
      suit: card[1].toLowerCase()
    }));
  };

  const createDeck = () => {
    const deck = [];
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        deck.push({ rank, suit });
      }
    }
    return deck;
  };

  // xorshift32 seeded RNG — deterministic within a hand so equity calculations
  // are stable when the same holeCards/board reappear frame-to-frame.
  const makeRng = (seed) => {
    let s = (seed | 0) || 0xdeadbeef;
    return () => {
      s ^= s << 13; s |= 0;
      s ^= s >>> 17;
      s ^= s << 5; s |= 0;
      // Map to [0, 1)
      return ((s >>> 0) % 0xffffffff) / 0xffffffff;
    };
  };

  // If no rng provided, falls back to Math.random for backwards compat.
  const shuffleDeck = (deck, rng) => {
    const copy = [...deck];
    const rand = rng || Math.random;
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const cardToString = (card) => `${card.rank}${card.suit}`;

  const cardsEqual = (card1, card2) =>
    card1.rank === card2.rank && card1.suit === card2.suit;

  const cardInArray = (card, array) =>
    array.some(c => cardsEqual(c, card));

  const removeCard = (card, deck) =>
    deck.filter(c => !cardsEqual(c, card));

  const getValidOmahaHoleCardCombos = (holeCards) => {
    const combos = [];
    const n = holeCards.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        combos.push([holeCards[i], holeCards[j]]);
      }
    }
    return combos;
  };

  // ============================================================================
  // HAND EVALUATOR
  // ============================================================================

  const evaluateHand = (cards) => {
    if (cards.length !== 5) return null;

    const sorted = [...cards].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);

    const isFlush = () => {
      const suits = sorted.map(c => c.suit);
      return suits[0] === suits[1] && suits[1] === suits[2] &&
             suits[2] === suits[3] && suits[3] === suits[4];
    };

    const isStraight = () => {
      const values = sorted.map(c => RANK_VALUE[c.rank]);
      if (values[0] - values[4] === 4 && new Set(values).size === 5) {
        return { straight: true, high: values[0] };
      }
      if (values[0] === 14 && values[1] === 5 && values[2] === 4 &&
          values[3] === 3 && values[4] === 2) {
        return { straight: true, high: 5 };
      }
      return false;
    };

    const getRanks = () => sorted.map(c => RANK_VALUE[c.rank]);

    const countRanks = () => {
      const counts = {};
      getRanks().forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || b[0] - a[0])
        .map(([rank, count]) => ({ rank: parseInt(rank), count }));
    };

    const flush = isFlush();
    const straight = isStraight();
    const ranked = countRanks();

    let score, name;

    if (flush && straight && straight.high === 14) {
      score = 10000000; name = 'Royal Flush';
    } else if (flush && straight) {
      score = 9000000 + straight.high * 1000; name = 'Straight Flush';
    } else if (ranked[0].count === 4) {
      score = 8000000 + ranked[0].rank * 1000 + ranked[1].rank;
      name = 'Four of a Kind';
    } else if (ranked[0].count === 3 && ranked[1].count === 2) {
      score = 7000000 + ranked[0].rank * 1000 + ranked[1].rank;
      name = 'Full House';
    } else if (flush) {
      score = 6000000 + getRanks().reduce((a, b, i) => a + b * Math.pow(1000, 4 - i), 0);
      name = 'Flush';
    } else if (straight) {
      score = 5000000 + straight.high * 1000; name = 'Straight';
    } else if (ranked[0].count === 3) {
      score = 4000000 + ranked[0].rank * 1000 + ranked[1].rank * 100 + ranked[2].rank;
      name = 'Three of a Kind';
    } else if (ranked[0].count === 2 && ranked[1].count === 2) {
      score = 3000000 + Math.max(ranked[0].rank, ranked[1].rank) * 1000 +
              Math.min(ranked[0].rank, ranked[1].rank) * 100 + ranked[2].rank;
      name = 'Two Pair';
    } else if (ranked[0].count === 2) {
      score = 2000000 + ranked[0].rank * 1000 +
              ranked[1].rank * 100 + ranked[2].rank * 10 + ranked[3].rank;
      name = 'One Pair';
    } else {
      score = 1000000 + getRanks().reduce((a, b, i) => a + b * Math.pow(1000, 4 - i), 0);
      name = 'High Card';
    }

    return { rank: name, name, score };
  };

  // ============================================================================
  // LOW HAND EVALUATOR (for Hi-Lo games)
  // ============================================================================

  const evaluateLow = (cards) => {
    const values = cards.map(c => {
      const v = RANK_VALUE[c.rank];
      return c.rank === 'A' ? 1 : v;
    }).sort((a, b) => a - b);

    if (values[4] > 8) return null;
    // Must have 5 distinct ranks for a qualifying low
    if (new Set(values).size !== 5) return null;

    let score = 0;
    for (let i = 0; i < 5; i++) {
      score += values[i] * Math.pow(100, 4 - i);
    }
    return {
      qualifying: true,
      rank: `Low: ${values.map(v => v === 1 ? 'A' : v).join('-')}`,
      score
    };
  };

  const getBestFiveCardFromCards = (cards) => {
    if (cards.length === 5) return evaluateHand(cards);
    if (cards.length < 5) return null;

    let best = null;
    const gen = (start, current) => {
      if (current.length === 5) {
        const result = evaluateHand(current);
        if (result && (!best || result.score > best.score)) best = result;
        return;
      }
      for (let i = start; i < cards.length; i++) {
        current.push(cards[i]);
        gen(i + 1, current);
        current.pop();
      }
    };
    gen(0, []);
    return best;
  };

  const getBestLowFromCards = (cards) => {
    if (cards.length < 5) return null;
    let best = null;
    const gen = (start, current) => {
      if (current.length === 5) {
        const result = evaluateLow(current);
        if (result && (!best || result.score < best.score)) best = result;
        return;
      }
      for (let i = start; i < cards.length; i++) {
        current.push(cards[i]);
        gen(i + 1, current);
        current.pop();
      }
    };
    gen(0, []);
    return best;
  };

  // ============================================================================
  // EQUITY CALCULATOR (with memoization)
  // ============================================================================

  // Memoize per-session. Cache key includes the exact sample budget so that
  // callers can override iterations without colliding.
  const equityCache = new Map();
  const EQUITY_CACHE_LIMIT = 256;

  const makeCacheKey = (hole, board, numOpponents, gameType, iterations) => {
    const h = hole.map(cardToString).sort().join('');
    const b = board.map(cardToString).sort().join('');
    return `${gameType}|${numOpponents}|${iterations}|${h}|${b}`;
  };

  // Stable seed derived from key so same inputs → same result.
  const keyToSeed = (key) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 1;
  };

  const calculateEquity = (holeCards, boardCards, numOpponents = 1, gameType = 'nlhe', iterations = 2000) => {
    const isOmaha = gameType.includes('plo');
    const isHiLo = gameType.includes('hilo');

    const key = makeCacheKey(holeCards, boardCards, numOpponents, gameType, iterations);
    if (equityCache.has(key)) {
      const hit = equityCache.get(key);
      // LRU: re-insert
      equityCache.delete(key);
      equityCache.set(key, hit);
      return hit;
    }

    const rng = makeRng(keyToSeed(key));

    let wins = 0;
    let ties = 0;
    let highWins = 0;
    let lowWins = 0;
    let lowsCounted = 0;

    const usedCards = [...holeCards, ...boardCards];
    const availableDeck = createDeck().filter(c =>
      !usedCards.some(uc => cardsEqual(uc, c))
    );
    const cardsNeeded = 5 - boardCards.length;

    for (let iter = 0; iter < iterations; iter++) {
      const shuffled = shuffleDeck(availableDeck, rng);
      const runoutCards = shuffled.slice(0, cardsNeeded);
      const runoutBoard = [...boardCards, ...runoutCards];

      const getOmahaBest = (holes) => {
        const combos = getValidOmahaHoleCardCombos(holes);
        let top = null;
        for (const [h1, h2] of combos) {
          for (let i = 0; i < runoutBoard.length; i++) {
            for (let j = i + 1; j < runoutBoard.length; j++) {
              for (let k = j + 1; k < runoutBoard.length; k++) {
                const hand = evaluateHand([h1, h2, runoutBoard[i], runoutBoard[j], runoutBoard[k]]);
                if (hand && (!top || hand.score > top.score)) top = hand;
              }
            }
          }
        }
        return top;
      };

      let playerHand;
      const oppHands = [];
      const omahaHoleSize = gameType.includes('plo5') ? 5 : gameType.includes('plo6') ? 6 : 4;

      if (isOmaha) {
        playerHand = getOmahaBest(holeCards);
        for (let o = 0; o < numOpponents; o++) {
          const oppStartIdx = cardsNeeded + (o * omahaHoleSize);
          if (oppStartIdx + omahaHoleSize <= shuffled.length) {
            const oppCards = shuffled.slice(oppStartIdx, oppStartIdx + omahaHoleSize);
            oppHands.push(getOmahaBest(oppCards));
          }
        }
      } else {
        const allCards = [...holeCards, ...runoutBoard];
        playerHand = getBestFiveCardFromCards(allCards);
        for (let o = 0; o < numOpponents; o++) {
          const oppStartIdx = cardsNeeded + (o * 2);
          if (oppStartIdx + 2 <= shuffled.length) {
            const allOppCards = [
              shuffled[oppStartIdx],
              shuffled[oppStartIdx + 1],
              ...runoutBoard
            ];
            oppHands.push(getBestFiveCardFromCards(allOppCards));
          }
        }
      }

      if (!playerHand || oppHands.length === 0) continue;

      const playerScore = playerHand.score;
      let beats = 0;
      let beaten = 0;
      for (const oppHand of oppHands) {
        if (!oppHand) continue;
        if (playerScore > oppHand.score) beats++;
        else if (playerScore < oppHand.score) beaten++;
      }

      if (beaten === 0) {
        if (beats === oppHands.length) wins++;
        else ties++;
      }

      if (isHiLo) {
        const lowCards = isOmaha
          ? null // Omaha Hi-Lo low logic needs 2-from-hole constraint; keep simple for now
          : [...holeCards, ...runoutBoard];
        if (lowCards) {
          const playerLow = getBestLowFromCards(lowCards);
          if (playerLow) {
            lowsCounted++;
            lowWins++;
          }
        }
        if (beats === oppHands.length) highWins++;
      }
    }

    const equity = (wins + ties * 0.5) / iterations * 100;

    const result = {
      equity: Math.round(equity * 100) / 100,
      highEquity: isHiLo ? Math.round((highWins / iterations) * 10000) / 100 : equity,
      lowEquity: isHiLo ? Math.round((lowWins / iterations) * 10000) / 100 : 0,
      wins,
      ties,
      iterations
    };

    equityCache.set(key, result);
    if (equityCache.size > EQUITY_CACHE_LIMIT) {
      const firstKey = equityCache.keys().next().value;
      equityCache.delete(firstKey);
    }
    return result;
  };

  const clearEquityCache = () => { equityCache.clear(); };

  // ============================================================================
  // 169-HAND PREFLOP RANGE SYSTEM
  // ============================================================================

  // Encodes a 169-hand matrix as a Set of hand codes ("AKs", "AKo", "AA").
  // Ranges are representative GTO-ish open ranges by position. They are NOT
  // intended to be solver-perfect - they are designed to give sensible,
  // consistent recommendations rather than always-fold nonsense.

  const PAIRS = ['22','33','44','55','66','77','88','99','TT','JJ','QQ','KK','AA'];

  const set = (...codes) => new Set(codes.flat());

  // Position RFI (open-raise when action folds to hero)
  const RFI = {
    utg: set(
      PAIRS.slice(4), // 66+
      ['AKs','AQs','AJs','ATs','KQs','KJs','QJs','JTs','T9s','AKo','AQo']
    ),
    mp: set(
      PAIRS.slice(3), // 55+
      ['AKs','AQs','AJs','ATs','A9s','KQs','KJs','KTs','QJs','QTs','JTs','T9s','98s',
       'AKo','AQo','AJo','KQo']
    ),
    co: set(
      PAIRS.slice(1), // 33+
      ['AKs','AQs','AJs','ATs','A9s','A8s','A7s','A5s','A4s','A3s','A2s',
       'KQs','KJs','KTs','K9s','QJs','QTs','Q9s','JTs','J9s','T9s','T8s','98s','87s','76s',
       'AKo','AQo','AJo','ATo','KQo','KJo','QJo']
    ),
    btn: set(
      PAIRS, // 22+
      ['AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
       'KQs','KJs','KTs','K9s','K8s','K7s','QJs','QTs','Q9s','Q8s','JTs','J9s','J8s',
       'T9s','T8s','T7s','98s','97s','87s','86s','76s','75s','65s','54s',
       'AKo','AQo','AJo','ATo','A9o','KQo','KJo','KTo','QJo','QTo','JTo']
    ),
    sb: set(
      PAIRS,
      ['AKs','AQs','AJs','ATs','A9s','A8s','A5s','A4s','KQs','KJs','KTs','K9s',
       'QJs','QTs','Q9s','JTs','J9s','T9s','98s','87s','76s','65s',
       'AKo','AQo','AJo','ATo','KQo','KJo','QJo']
    ),
    // BB never opens (no one to open-raise), but we encode BB 3bet range here
    // for completeness. It is referenced by the 3bet mode below.
    bb: set(
      PAIRS.slice(4), // 66+
      ['AKs','AQs','AJs','ATs','KQs','KJs','QJs','JTs','AKo','AQo']
    ),
  };

  // BB defense vs a single raise - wide flat + 3bet mix.
  // (Everything in RFI.btn roughly, minus the fringe hands.)
  const BB_DEFEND = set(
    PAIRS,
    ['AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
     'KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s',
     'QJs','QTs','Q9s','Q8s','Q7s','JTs','J9s','J8s','J7s',
     'T9s','T8s','T7s','98s','97s','87s','86s','76s','75s','65s','64s','54s','53s','43s',
     'AKo','AQo','AJo','ATo','A9o','A8o','KQo','KJo','KTo','K9o','QJo','QTo','Q9o','JTo','J9o','T9o','98o']
  );

  // 3bet range vs RFI (positionally agnostic polarized default).
  const THREEBET_RANGE = set(
    ['AA','KK','QQ','JJ','TT','99','AKs','AQs','AKo','A5s','A4s','KQs','76s','T9s']
  );

  const FOURBET_RANGE = set(['AA','KK','QQ','AKs','AKo']);

  const getHandType = (hole1, hole2) => {
    const v1 = RANK_VALUE[hole1.rank];
    const v2 = RANK_VALUE[hole2.rank];
    if (hole1.rank === hole2.rank) return `${hole1.rank}${hole2.rank}`;
    const hi = v1 >= v2 ? hole1 : hole2;
    const lo = v1 >= v2 ? hole2 : hole1;
    const suitedTag = hole1.suit === hole2.suit ? 's' : 'o';
    return `${hi.rank}${lo.rank}${suitedTag}`;
  };

  // Legacy-friendly wrapper: also accept the old "XXs"/"XX" format by mapping
  // "XX" (unsuited, no tag) to the offsuit variant.
  const normalizeHandCode = (code) => {
    if (code.length === 2) return code; // pair
    if (code.length === 3 && (code[2] === 's' || code[2] === 'o')) return code;
    return code + 'o';
  };

  const inRange = (handCode, rangeSet) => rangeSet.has(normalizeHandCode(handCode));

  // ============================================================================
  // BOARD TEXTURE CLASSIFIER
  // ============================================================================

  const classifyTexture = (boardCards) => {
    if (!boardCards || boardCards.length < 3) {
      return { paired: false, monotone: false, twoTone: false, rainbow: false,
               connected: 0, highCard: 0, flushDraw: false, straightDraw: false };
    }
    const suits = boardCards.map(c => c.suit);
    const vals = boardCards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
    const uniqueRanks = new Set(boardCards.map(c => c.rank));
    const suitCounts = {};
    for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
    const maxSuit = Math.max(...Object.values(suitCounts));

    const paired = uniqueRanks.size < boardCards.length;
    const monotone = maxSuit >= boardCards.length;
    const twoTone = maxSuit === boardCards.length - 1 && !monotone;
    const rainbow = maxSuit === 1 && boardCards.length >= 3;
    const flushDraw = maxSuit >= 3 && !monotone;

    // Count consecutive gaps among top cards for straight potential
    let connected = 0;
    for (let i = 0; i < vals.length - 1; i++) {
      if (vals[i] - vals[i + 1] <= 2) connected++;
    }
    const straightDraw = connected >= 2;

    return {
      paired, monotone, twoTone, rainbow,
      connected, highCard: vals[0],
      flushDraw, straightDraw,
    };
  };

  // ============================================================================
  // POT ODDS & STACK ANALYSIS
  // ============================================================================

  const calculatePotOdds = (betToCall, potSize) => {
    if (potSize === 0 && betToCall === 0) return 0;
    return (betToCall / (potSize + betToCall)) * 100;
  };

  const calculateImpliedOdds = (equity, potOdds) => {
    if (potOdds === 0) return 0;
    return (equity - potOdds) / potOdds * 100;
  };

  const calculateStackToPot = (stackSize, potSize) => {
    if (potSize === 0) return Infinity;
    return stackSize / potSize;
  };

  // ============================================================================
  // DECISION ENGINE
  // ============================================================================

  const inferPreflopAction = (betToCall, bigBlind, potSize) => {
    if (!bigBlind || bigBlind <= 0) {
      // Fall back to pot-relative inference
      if (betToCall === 0) return 'rfi';
      if (betToCall <= potSize * 0.5) return 'vs_limp';
      if (betToCall <= potSize * 1.5) return 'vs_raise';
      return 'vs_3bet';
    }
    const ratio = betToCall / bigBlind;
    if (ratio < 1.5) return 'rfi';         // no real raise yet
    if (ratio < 4) return 'vs_limp';       // tiny raise / limped
    if (ratio < 10) return 'vs_raise';     // standard 2.5-4x open
    if (ratio < 25) return 'vs_3bet';      // 3bet
    return 'vs_4bet';
  };

  const getDecision = (gameState) => {
    const {
      gameType = 'nlhe',
      holeCards = [],
      boardCards = [],
      potSize = 0,
      betToCall = 0,
      stackSize = 0,
      position = 'middle',
      numPlayers = 6,
      street = 'preflop',
      blindLevel = 1,
      bigBlind = 0,
      preflopAction = null,
      istournament = false,
      tournamentStage = 'early',
    } = gameState;

    const isOmaha = gameType.includes('plo');
    let equity = 0;
    let potOdds = calculatePotOdds(betToCall, potSize);
    let action = 'FOLD';
    let raiseAmount = 0;
    let confidence = 0;
    let reasoning = '';

    // Normalize legacy position names
    const posMap = {
      early: 'utg', utg: 'utg',
      middle: 'mp', mp: 'mp',
      co: 'co', cutoff: 'co',
      late: 'btn', btn: 'btn', button: 'btn',
      sb: 'sb', smallblind: 'sb',
      bb: 'bb', bigblind: 'bb',
    };
    const pos = posMap[position] || 'mp';

    // ========== PREFLOP ==========
    if (street === 'preflop') {
      if (holeCards.length < 2) {
        return { action: 'FOLD', raiseAmount: 0, confidence: 0,
                 reasoning: 'Not enough hole cards', equity: 0, potOdds: 0 };
      }

      // PLO preflop uses equity-based evaluation (169-hand chart is NLHE only)
      if (isOmaha) {
        // Rough PLO open heuristic: high-card double-suited or connected = raise
        const highCount = holeCards.filter(c => RANK_VALUE[c.rank] >= 11).length;
        const suited = new Set(holeCards.map(c => c.suit)).size <= 2;
        if (highCount >= 2 && suited) {
          action = 'RAISE';
          confidence = 75;
          raiseAmount = Math.max(bigBlind * 3, potSize * 1.5, betToCall * 3);
          reasoning = `PLO premium (${highCount} broadway, ${suited ? 'suited' : 'rainbow'})`;
        } else if (highCount >= 1) {
          action = betToCall <= bigBlind * 3 ? 'CALL' : 'FOLD';
          confidence = 55;
          reasoning = 'PLO speculative hand';
        } else {
          action = 'FOLD';
          confidence = 65;
          reasoning = 'PLO hand too weak';
        }
      } else {
        const handCode = getHandType(holeCards[0], holeCards[1]);
        const mode = preflopAction || inferPreflopAction(betToCall, bigBlind, potSize);

        // vs 4bet → only call/raise elite
        if (mode === 'vs_4bet') {
          if (inRange(handCode, FOURBET_RANGE)) {
            action = 'RAISE';
            confidence = 92;
            raiseAmount = stackSize; // 5-bet shove
            reasoning = `5-bet shove ${handCode} vs 4bet`;
          } else {
            action = 'FOLD';
            confidence = 88;
            reasoning = `${handCode} folds to 4bet`;
          }
        }
        // vs 3bet → call with IP speculatives + premiums, 4bet elite
        else if (mode === 'vs_3bet') {
          if (inRange(handCode, FOURBET_RANGE)) {
            action = 'RAISE';
            confidence = 88;
            raiseAmount = Math.max(betToCall * 2.3, potSize * 0.75);
            reasoning = `4bet ${handCode} vs 3bet`;
          } else if (inRange(handCode, RFI.utg)) {
            action = 'CALL';
            confidence = 72;
            reasoning = `Call 3bet with ${handCode} (premium)`;
          } else {
            action = 'FOLD';
            confidence = 80;
            reasoning = `${handCode} folds to 3bet`;
          }
        }
        // vs an open raise → 3bet or call or fold
        else if (mode === 'vs_raise') {
          const isDefense = pos === 'bb' && inRange(handCode, BB_DEFEND);
          if (inRange(handCode, THREEBET_RANGE)) {
            action = 'RAISE';
            confidence = 82;
            raiseAmount = Math.max(betToCall * 3, potSize * 0.8);
            reasoning = `3bet ${handCode} vs open`;
          } else if (isDefense || inRange(handCode, RFI[pos] || RFI.mp)) {
            action = 'CALL';
            confidence = 68;
            reasoning = `Flat ${handCode} in ${pos}`;
          } else {
            action = 'FOLD';
            confidence = 72;
            reasoning = `${handCode} not in ${pos} defense range`;
          }
        }
        // vs limp → isolate with RFI range
        else if (mode === 'vs_limp') {
          if (inRange(handCode, RFI[pos] || RFI.mp)) {
            action = 'RAISE';
            confidence = 78;
            raiseAmount = Math.max(bigBlind * 4, potSize * 1.2);
            reasoning = `Iso-raise ${handCode} vs limp`;
          } else if (pos === 'bb' || pos === 'sb') {
            action = 'CALL';
            confidence = 50;
            reasoning = `Check/complete ${handCode}`;
          } else {
            action = 'FOLD';
            confidence = 60;
            reasoning = `${handCode} too weak to iso`;
          }
        }
        // RFI (folded to hero) - fire the position's open range
        else {
          const range = RFI[pos] || RFI.mp;
          if (inRange(handCode, range)) {
            action = 'RAISE';
            confidence = pos === 'btn' || pos === 'co' ? 78 : 85;
            raiseAmount = Math.max(bigBlind * 2.5, potSize * 1.2);
            reasoning = `Open ${handCode} from ${pos}`;
          } else if (pos === 'bb' && betToCall === 0) {
            action = 'CALL'; // free check in BB
            confidence = 60;
            reasoning = 'BB checks option';
          } else {
            action = 'FOLD';
            confidence = 82;
            reasoning = `${handCode} folds from ${pos}`;
          }
        }
      }

      // Tournament ICM adjustments
      if (istournament) {
        const bbStack = bigBlind > 0 ? stackSize / bigBlind : 100;
        if (bbStack < 12 && (action === 'CALL' || action === 'RAISE')) {
          action = 'RAISE';
          raiseAmount = stackSize;
          confidence = Math.min(92, confidence + 5);
          reasoning += ' (short-stack shove)';
        } else if (bbStack < 7) {
          // Only top of range should be played
          const handCode = holeCards.length >= 2 ? getHandType(holeCards[0], holeCards[1]) : '';
          if (!inRange(handCode, RFI.utg)) {
            action = 'FOLD';
            confidence = 80;
            reasoning = 'Ultra-short, fold to preserve';
          }
        }
      }
    }
    // ========== POSTFLOP ==========
    else {
      if (holeCards.length < 2 || boardCards.length < 3) {
        return { action: 'FOLD', raiseAmount: 0, confidence: 0,
                 reasoning: 'Not enough cards for evaluation', equity: 0, potOdds: 0 };
      }

      // Cheaper iteration count on flop/turn to keep HUD responsive
      const iterBudget = street === 'river' ? 2000 : street === 'turn' ? 1500 : 1200;
      const equityResult = calculateEquity(
        holeCards,
        boardCards,
        Math.max(1, numPlayers - 1),
        gameType,
        iterBudget
      );
      equity = equityResult.equity;

      const spr = calculateStackToPot(stackSize, potSize);
      const texture = classifyTexture(boardCards);
      const committed = spr < 3; // if we call, we are basically pot-committed

      // Texture-based confidence adjustments
      const textureNote =
        texture.monotone ? ' (monotone, be careful)' :
        texture.paired ? ' (paired board)' :
        texture.flushDraw && texture.straightDraw ? ' (wet board)' :
        texture.flushDraw ? ' (flush draw possible)' :
        texture.rainbow && !texture.straightDraw ? ' (dry board)' : '';

      // Position-aware raise sizing
      const ipBonus = (pos === 'btn' || pos === 'co') ? 0.15 : 0;

      if (betToCall === 0) {
        // Check scenario
        if (equity > 65) {
          action = 'RAISE';
          raiseAmount = potSize * (0.66 + ipBonus);
          confidence = Math.min(92, Math.round(equity));
          reasoning = `Strong made hand (${Math.round(equity)}%)${textureNote}`;
        } else if (equity > 50) {
          action = 'RAISE';
          raiseAmount = potSize * (0.5 + ipBonus);
          confidence = Math.min(80, Math.round(equity));
          reasoning = `Value bet (${Math.round(equity)}%)${textureNote}`;
        } else if (equity > 38 && (texture.flushDraw || texture.straightDraw)) {
          action = 'RAISE';
          raiseAmount = potSize * 0.4;
          confidence = 55;
          reasoning = `Semi-bluff with draw (${Math.round(equity)}%)${textureNote}`;
        } else if (equity > 30) {
          action = 'CALL';
          confidence = 50;
          reasoning = `Check behind / pot control (${Math.round(equity)}%)${textureNote}`;
        } else {
          action = 'CALL'; // check
          confidence = 45;
          reasoning = `Give up, check (${Math.round(equity)}%)${textureNote}`;
        }
      } else {
        // Facing a bet
        const minEquityToCall = potOdds + (texture.monotone ? 6 : texture.paired ? 4 : 3);

        if (equity >= 80) {
          action = 'RAISE';
          raiseAmount = Math.min(stackSize, betToCall + potSize * (1.5 + ipBonus));
          confidence = Math.min(95, Math.round(equity));
          reasoning = `Raise for value (${Math.round(equity)}%)${textureNote}`;
        } else if (equity >= 65) {
          action = committed ? 'RAISE' : 'CALL';
          raiseAmount = committed ? stackSize : 0;
          confidence = Math.min(85, Math.round(equity));
          reasoning = committed
            ? `Committed with strong hand (${Math.round(equity)}%, SPR ${spr.toFixed(1)})`
            : `Call for value (${Math.round(equity)}%)${textureNote}`;
        } else if (equity >= minEquityToCall) {
          action = 'CALL';
          confidence = Math.min(75, Math.round(equity));
          reasoning = `Equity ${Math.round(equity)}% > pot odds ${Math.round(potOdds)}%${textureNote}`;
        } else if (
          street === 'flop' &&
          (texture.flushDraw || texture.straightDraw) &&
          equity > 25 && spr > 3
        ) {
          action = 'CALL';
          confidence = 50;
          reasoning = `Drawing hand with implied odds (${Math.round(equity)}%)${textureNote}`;
        } else {
          action = 'FOLD';
          confidence = Math.min(85, Math.round(100 - equity));
          reasoning = `Insufficient equity ${Math.round(equity)}% vs odds ${Math.round(potOdds)}%${textureNote}`;
        }
      }

      // Tournament short-stack postflop
      if (istournament && spr < 2.5 && equity > 35) {
        action = 'RAISE';
        raiseAmount = stackSize;
        confidence = Math.max(confidence, 72);
        reasoning += ' (short-stack jam)';
      }
    }

    return {
      action,
      raiseAmount: Math.round(raiseAmount),
      confidence: Math.round(confidence),
      reasoning,
      equity: Math.round(equity * 100) / 100,
      potOdds: Math.round(potOdds * 100) / 100,
    };
  };

  // ============================================================================
  // HAND RANKING UTILITIES
  // ============================================================================

  const getHandName = (score) => {
    if (score >= 10000000) return 'Royal Flush';
    if (score >= 9000000) return 'Straight Flush';
    if (score >= 8000000) return 'Four of a Kind';
    if (score >= 7000000) return 'Full House';
    if (score >= 6000000) return 'Flush';
    if (score >= 5000000) return 'Straight';
    if (score >= 4000000) return 'Three of a Kind';
    if (score >= 3000000) return 'Two Pair';
    if (score >= 2000000) return 'One Pair';
    return 'High Card';
  };

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    // Card utilities
    parseCards,
    createDeck,
    shuffleDeck,
    cardToString,
    cardsEqual,
    cardInArray,
    removeCard,

    // Hand evaluation
    evaluateHand,
    evaluateLow,
    getBestFiveCardFromCards,
    getBestLowFromCards,

    // Equity calculation
    calculateEquity,
    clearEquityCache,

    // Texture analysis
    classifyTexture,

    // Decision making
    getDecision,
    inferPreflopAction,

    // Utilities
    getHandName,
    calculatePotOdds,
    calculateImpliedOdds,
    calculateStackToPot,
    getHandType,
  };
})();

export default PokerBrainEngine;
