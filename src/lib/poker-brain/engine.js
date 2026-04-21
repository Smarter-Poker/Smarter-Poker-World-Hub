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
        .map(([rank, count]) => ({ rank: parseInt(rank, 10), count }));
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
      const r = getRanks();
      score = 6000000 + r[0] * 10000 + r[1] * 1000 + r[2] * 100 + r[3] * 10 + r[4];
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
      const r = getRanks();
      score = 1000000 + r[0] * 10000 + r[1] * 1000 + r[2] * 100 + r[3] * 10 + r[4];
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

      // Omaha Hi-Lo: best qualifying low using 2-from-hole + 3-from-board.
      // Returns null if no qualifying low exists for these hole cards
      // against this runout.
      const getOmahaLowBest = (holes) => {
        // Fast reject: must have at least 2 hole cards <= 8 and at least
        // 3 board cards <= 8, otherwise a qualifying low is impossible.
        const lowHoles = holes.filter(c => {
          const v = RANK_VALUE[c.rank];
          return c.rank === 'A' || (v >= 2 && v <= 8);
        });
        if (lowHoles.length < 2) return null;
        const lowBoard = runoutBoard.filter(c => {
          const v = RANK_VALUE[c.rank];
          return c.rank === 'A' || (v >= 2 && v <= 8);
        });
        if (lowBoard.length < 3) return null;

        let best = null;
        // Enumerate 2-hole / 3-board combos restricted to the low pool
        for (let a = 0; a < lowHoles.length; a++) {
          for (let b = a + 1; b < lowHoles.length; b++) {
            for (let i = 0; i < lowBoard.length; i++) {
              for (let j = i + 1; j < lowBoard.length; j++) {
                for (let k = j + 1; k < lowBoard.length; k++) {
                  const candidate = [lowHoles[a], lowHoles[b], lowBoard[i], lowBoard[j], lowBoard[k]];
                  const result = evaluateLow(candidate);
                  if (result && (!best || result.score < best.score)) best = result;
                }
              }
            }
          }
        }
        return best;
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
        // Track high-side wins separately so callers can distinguish
        // a scoop (win high + low) from a quartered pot.
        if (beats === oppHands.length) highWins++;

        // Player's best qualifying low. Omaha uses the 2-from-hole /
        // 3-from-board constraint; non-Omaha Hi-Lo variants (rare) use
        // the plain 5-of-7 combo selector.
        const playerLow = isOmaha
          ? getOmahaLowBest(holeCards)
          : getBestLowFromCards([...holeCards, ...runoutBoard]);

        // Semantic: lowEquity = P(hero claims the low half of the pot).
        // If hero has no qualifying low, they claim 0 of the low half.
        // If hero has a low and no opponent has one, hero takes the
        // entire low half (+1). If both have lows, compare scores;
        // ties add 0.5.
        if (playerLow) {
          let oppBestLowScore = null;
          let oppLowTies = 0;
          for (let o = 0; o < numOpponents; o++) {
            const oppStartIdx = cardsNeeded + (o * (isOmaha ? omahaHoleSize : 2));
            if (oppStartIdx + (isOmaha ? omahaHoleSize : 2) > shuffled.length) continue;
            const oppHoles = isOmaha
              ? shuffled.slice(oppStartIdx, oppStartIdx + omahaHoleSize)
              : shuffled.slice(oppStartIdx, oppStartIdx + 2);
            const oppLow = isOmaha
              ? getOmahaLowBest(oppHoles)
              : getBestLowFromCards([...oppHoles, ...runoutBoard]);
            if (oppLow) {
              if (oppBestLowScore == null || oppLow.score < oppBestLowScore) {
                oppBestLowScore = oppLow.score;
                oppLowTies = (oppLow.score === playerLow.score) ? 1 : 0;
              } else if (oppLow.score === oppBestLowScore) {
                if (oppLow.score === playerLow.score) oppLowTies++;
              }
            }
          }
          lowsCounted++;
          if (oppBestLowScore == null || playerLow.score < oppBestLowScore) {
            // Hero has the best low (or is the only one with a low).
            lowWins++;
          } else if (playerLow.score === oppBestLowScore) {
            // Tie with one or more opponents - quarter/sixth/etc.
            lowWins += 1 / (oppLowTies + 1);
          }
          // else: an opponent has a better low - zero.
        }
      }
    }

    const equity = (wins + ties * 0.5) / iterations * 100;

    // lowPossible: fraction of iterations where ANY player had a qualifying low.
    // Used for exact Hi-Lo scoop equity computation.
    const lowPossible = isHiLo && iterations > 0
      ? Math.round((lowsCounted / iterations) * 1000) / 1000
      : 0;

    const result = {
      equity: Math.round(equity * 100) / 100,
      highEquity: isHiLo ? Math.round((highWins / iterations) * 10000) / 100 : equity,
      lowEquity: isHiLo ? Math.round((lowWins / iterations) * 10000) / 100 : 0,
      lowPossible,
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
  // RANGE EXPANSION + RANGE-VS-RANGE EQUITY
  // ============================================================================

  // Turn a hand code ("AKs", "QQ", "T9o") into an array of 2-card combos,
  // filtered to avoid cards already in the dead deck.
  const expandHandCode = (code, deadCards) => {
    const inDead = (rank, suit) =>
      deadCards.some(c => c.rank === rank && c.suit === suit);
    const combos = [];
    if (code.length === 2) {
      // Pair
      const r = code[0];
      for (let i = 0; i < SUITS.length; i++) {
        for (let j = i + 1; j < SUITS.length; j++) {
          if (!inDead(r, SUITS[i]) && !inDead(r, SUITS[j])) {
            combos.push([{ rank: r, suit: SUITS[i] }, { rank: r, suit: SUITS[j] }]);
          }
        }
      }
    } else if (code.length === 3) {
      const [r1, r2, tag] = code;
      if (tag === 's') {
        for (const s of SUITS) {
          if (!inDead(r1, s) && !inDead(r2, s)) {
            combos.push([{ rank: r1, suit: s }, { rank: r2, suit: s }]);
          }
        }
      } else {
        for (const s1 of SUITS) {
          for (const s2 of SUITS) {
            if (s1 === s2) continue;
            if (!inDead(r1, s1) && !inDead(r2, s2)) {
              combos.push([{ rank: r1, suit: s1 }, { rank: r2, suit: s2 }]);
            }
          }
        }
      }
    }
    return combos;
  };

  // Expand an entire hand-code Set to a flat pool of combos given dead cards.
  const expandRange = (rangeSet, deadCards) => {
    const pool = [];
    for (const code of rangeSet) {
      for (const combo of expandHandCode(code, deadCards)) {
        pool.push(combo);
      }
    }
    return pool;
  };

  // Equity of holeCards vs a single villain sampled from rangeSet.
  // Uses seeded RNG for determinism and shares the equity cache.
  const calculateEquityVsRange = (holeCards, boardCards, rangeSet, gameType = 'nlhe', iterations = 1200) => {
    if (!rangeSet || rangeSet.size === 0) {
      return calculateEquity(holeCards, boardCards, 1, gameType, iterations);
    }
    const rangeId = Array.from(rangeSet).sort().join(',');
    const key = makeCacheKey(holeCards, boardCards, 1, gameType + ':' + rangeId, iterations);
    if (equityCache.has(key)) {
      const hit = equityCache.get(key);
      equityCache.delete(key);
      equityCache.set(key, hit);
      return hit;
    }

    const rng = makeRng(keyToSeed(key));
    const dead = [...holeCards, ...boardCards];
    const villainPool = expandRange(rangeSet, dead);
    if (villainPool.length === 0) {
      return calculateEquity(holeCards, boardCards, 1, gameType, iterations);
    }

    let wins = 0;
    let ties = 0;
    const cardsNeeded = 5 - boardCards.length;

    for (let iter = 0; iter < iterations; iter++) {
      const villain = villainPool[Math.floor(rng() * villainPool.length)];
      // Dead = hero + board + villain
      const iterDead = [...dead, ...villain];
      const freshDeck = createDeck().filter(c =>
        !iterDead.some(d => cardsEqual(d, c))
      );
      const shuffled = shuffleDeck(freshDeck, rng);
      const runout = shuffled.slice(0, cardsNeeded);
      const fullBoard = [...boardCards, ...runout];

      const heroHand = getBestFiveCardFromCards([...holeCards, ...fullBoard]);
      const vilHand = getBestFiveCardFromCards([...villain, ...fullBoard]);
      if (!heroHand || !vilHand) continue;
      if (heroHand.score > vilHand.score) wins++;
      else if (heroHand.score === vilHand.score) ties++;
    }

    const equity = (wins + ties * 0.5) / iterations * 100;
    const result = {
      equity: Math.round(equity * 100) / 100,
      wins,
      ties,
      iterations,
      vsRange: true,
      poolSize: villainPool.length,
    };
    equityCache.set(key, result);
    if (equityCache.size > EQUITY_CACHE_LIMIT) {
      const firstKey = equityCache.keys().next().value;
      equityCache.delete(firstKey);
    }
    return result;
  };

  // ============================================================================
  // OUTS COUNTER (flop/turn drawing analysis)
  // ============================================================================

  // Count cards that improve hero's hand rank on the next street.
  // Returns { outs, improves, fromRank, toRank }.
  const countOuts = (holeCards, boardCards) => {
    if (boardCards.length < 3 || boardCards.length > 4) {
      return { outs: 0, improves: [], fromRank: null, toRank: null };
    }
    const current = getBestFiveCardFromCards([...holeCards, ...boardCards]);
    if (!current) return { outs: 0, improves: [], fromRank: null, toRank: null };

    const dead = [...holeCards, ...boardCards];
    const deck = createDeck().filter(c => !dead.some(d => cardsEqual(d, c)));
    const improves = new Set();
    let outs = 0;

    for (const next of deck) {
      const nextBoard = [...boardCards, next];
      const nextBest = getBestFiveCardFromCards([...holeCards, ...nextBoard]);
      if (nextBest && nextBest.score > current.score) {
        outs++;
        improves.add(nextBest.name);
      }
    }
    return {
      outs,
      improves: Array.from(improves),
      fromRank: current.name,
      // Rough "rule of 2 & 4" equity estimate from outs
      approxEquity: boardCards.length === 3 ? outs * 4 : outs * 2,
    };
  };

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

  // ============================================================================
  // VARIANT UTILITIES
  // ============================================================================

  /**
   * Required hole-card count per game variant. Used by both the engine
   * (to reject invalid inputs) and the bridge (to gate the HUD).
   */
  const expectedHoleCount = (gameType) => {
    const g = String(gameType || 'nlhe').toLowerCase();
    if (g.includes('plo6')) return 6;
    if (g.includes('plo5')) return 5;
    if (g.includes('plo')) return 4;  // plo, plo_hilo, plo8
    return 2;                          // nlhe, tournament nlhe
  };

  /**
   * True if the variant splits the pot between high and low hands.
   */
  const isHiLoVariant = (gameType) =>
    String(gameType || '').toLowerCase().includes('hilo') ||
    String(gameType || '').toLowerCase().includes('plo8');

  /**
   * Rough nut-low potential for an Omaha Hi-Lo starting hand. Returns 0..1
   * where 1 means a guaranteed nut low draw (A-2 in hand).
   */
  const nutLowPotential = (holeCards) => {
    if (!Array.isArray(holeCards) || holeCards.length < 2) return 0;
    const lows = holeCards.filter(c => {
      const v = RANK_VALUE[c.rank];
      return c.rank === 'A' || (v >= 2 && v <= 8);
    });
    if (lows.length < 2) return 0;
    const hasAce = holeCards.some(c => c.rank === 'A');
    const hasDeuce = holeCards.some(c => c.rank === '2');
    const hasThree = holeCards.some(c => c.rank === '3');
    if (hasAce && hasDeuce) return 1.0;
    if (hasAce && hasThree) return 0.85;
    if (hasDeuce && hasThree) return 0.7;
    if (hasAce && lows.length >= 3) return 0.75;
    return Math.min(0.6, lows.length * 0.2);
  };

  // ============================================================================
  // TOURNAMENT / ICM UTILITIES
  // ============================================================================

  /**
   * Condensed push/fold (Nash) chart for unopened pots in tournament play.
   * Keyed by effective stack in BBs (rounded down). Values are hand codes
   * the ENTIRE range from any position. These are approximations for a
   * heads-up / short-handed final-table context and err toward tight.
   *
   * Sources: Sage / Nash equilibrium for heads-up + conventional ITM charts.
   */
  const PUSH_RANGE_BY_BB = {
    5:  set(PAIRS, [
      'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
      'KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s',
      'QJs','QTs','Q9s','Q8s','JTs','J9s','J8s','T9s','T8s','98s','87s',
      'AKo','AQo','AJo','ATo','A9o','A8o','A7o','A6o','A5o','A4o','A3o','A2o',
      'KQo','KJo','KTo','K9o','QJo','QTo','Q9o','JTo','J9o','T9o'
    ]),
    10: set(PAIRS.slice(1), [ // 33+
      'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
      'KQs','KJs','KTs','K9s','QJs','QTs','JTs','T9s',
      'AKo','AQo','AJo','ATo','KQo','KJo','QJo'
    ]),
    15: set(PAIRS.slice(3), [ // 55+
      'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','KQs','KJs','QJs','JTs',
      'AKo','AQo','AJo','KQo'
    ]),
    20: set(PAIRS.slice(5), [ // 77+
      'AKs','AQs','AJs','ATs','KQs','KJs','QJs',
      'AKo','AQo','AJo'
    ]),
  };

  /**
   * Given an effective stack in BBs, return the set of hand codes that
   * should be shoved from first-in. Uses the next higher threshold.
   */
  const getPushFoldRange = (bbStack) => {
    if (bbStack <= 5) return PUSH_RANGE_BY_BB[5];
    if (bbStack <= 10) return PUSH_RANGE_BY_BB[10];
    if (bbStack <= 15) return PUSH_RANGE_BY_BB[15];
    if (bbStack <= 20) return PUSH_RANGE_BY_BB[20];
    return null; // no push-fold territory, play postflop
  };

  /**
   * Harrington-style M ratio (stack divided by cost of one orbit).
   * Assumes 6-handed default if numPlayers isn't supplied. antes are ignored
   * because detection of ante is noisy in the HUD.
   */
  const calculateM = (stackSize, bigBlind, numPlayers = 6) => {
    if (!bigBlind || bigBlind <= 0) return null;
    const sbBb = bigBlind * 1.5;                 // SB + BB
    return stackSize / (sbBb + bigBlind * 0);    // ignore antes
  };

  /**
   * Rough bubble-factor: how much more painful a bust is vs the chip value
   * of a call in the current tournament stage. 1.0 = no ICM pressure,
   * 1.5 = bubble, 1.2 = in-the-money climbing, 1.1 = early.
   */
  const bubbleFactorForStage = (tournamentStage) => {
    switch ((tournamentStage || 'early').toLowerCase()) {
      case 'bubble':     return 1.5;
      case 'itm':        return 1.25;
      case 'ft':
      case 'finaltable': return 1.35;
      case 'middle':     return 1.1;
      case 'early':
      default:           return 1.0;
    }
  };

  /**
   * Compute ICM bubble factor with stack-size awareness and optional
   * full tournament data (players remaining, paid spots).
   * @param {object} opts
   * @param {number} [opts.heroStack] - hero stack in chips
   * @param {number} [opts.avgStack] - average stack in chips
   * @param {number} [opts.playersRemaining] - players still alive
   * @param {number} [opts.paidSpots] - how many spots are paid
   * @param {string} [opts.stage] - tournament stage string fallback
   * @param {number} [opts.bbSize] - big blind size (for BB calculation)
   * @returns {number} bubble factor >= 1.0
   */
  const computeICMBubbleFactor = (opts = {}) => {
    try {
      const { heroStack, avgStack, playersRemaining, paidSpots, stage, bbSize } = opts;

      // Calculate BB stack for stack-size adjustments
      const bbStack = (heroStack && bbSize && bbSize > 0) ? heroStack / bbSize : null;
      const stackMultiplier = bbStack != null
        ? (bbStack < 15 ? 1.15 : bbStack > 40 ? 0.85 : 1.0)
        : 1.0;

      // Full ICM path: when we have players remaining and paid spots
      if (playersRemaining && paidSpots && playersRemaining > 0 && paidSpots > 0) {
        const ratio = paidSpots / playersRemaining;
        const isShortStack = heroStack && avgStack && heroStack < avgStack * 0.6;
        const isBigStack = heroStack && avgStack && heroStack > avgStack * 1.8;

        // On the actual bubble (1 away from the money)
        if (playersRemaining === paidSpots + 1) {
          const baseFactor = isShortStack ? 1.8 : isBigStack ? 1.4 : 1.6;
          return baseFactor * stackMultiplier;
        }

        // Near bubble (within 20% of paid spots)
        if (playersRemaining <= paidSpots * 1.2) {
          const proximity = 1 - ((playersRemaining - paidSpots) / (paidSpots * 0.2));
          const baseFactor = 1.3 + (proximity * 0.3);
          return baseFactor * stackMultiplier;
        }

        // In the money
        if (playersRemaining <= paidSpots) {
          // Final table (9 or fewer, or top 15% of paid spots)
          if (playersRemaining <= 9 || playersRemaining <= paidSpots * 0.15) {
            const ftFactor = 1.25 + (0.15 * (9 / Math.max(2, playersRemaining)));
            return ftFactor * stackMultiplier;
          }
          // General ITM
          const itmFactor = 1.15 + (0.1 * ratio);
          return Math.min(1.4, itmFactor) * stackMultiplier;
        }

        // Pre-bubble: scale gently with proximity
        const preBubbleFactor = 1.0 + (ratio * 0.3);
        return Math.min(1.3, preBubbleFactor) * stackMultiplier;
      }

      // Fallback: stage-based with stack-size adjustment
      const baseFactor = bubbleFactorForStage(stage);
      return baseFactor * stackMultiplier;
    } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
  };

  /**
   * Estimate a PLO hand's all-in equity vs a random PLO range.
   * Scores hand quality features and maps to approximate equity %.
   * @param {Array} holeCards - array of {rank, suit} objects (4-6 cards)
   * @returns {{ equity: number, features: string[] }}
   */
  const estimatePloHandEquityVsRandom = (holeCards) => {
    if (!holeCards || holeCards.length < 4) return { equity: 25, features: [] };
    const features = [];
    let score = 0;

    // Suitedness check
    const suitCounts = {};
    for (const c of holeCards) {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    }
    const suitPairs = Object.values(suitCounts).filter(v => v >= 2).length;
    if (suitPairs >= 2) {
      score += 15;
      features.push('double-suited');
    } else if (suitPairs === 1) {
      score += 8;
      features.push('single-suited');
    }

    // Pair check
    const rankCounts = {};
    for (const c of holeCards) {
      rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    }
    const hasPair = Object.values(rankCounts).some(v => v >= 2);
    if (hasPair) {
      score += 12;
      features.push('pair');
    }

    // Connectivity: all cards within 4 ranks of each other
    const vals = holeCards.map(c => RANK_VALUE[c.rank]).sort((a, b) => a - b);
    const spread = vals[vals.length - 1] - vals[0];
    if (spread <= 4) {
      score += 10;
      features.push('connected');
    } else if (spread <= 6) {
      score += 5;
      features.push('semi-connected');
    }

    // Broadway count (T+)
    const broadways = holeCards.filter(c => RANK_VALUE[c.rank] >= 10).length;
    score += broadways * 5;
    if (broadways >= 3) features.push(`${broadways} broadways`);

    // Middling cards (7-9)
    const middling = holeCards.filter(c => RANK_VALUE[c.rank] >= 7 && RANK_VALUE[c.rank] < 10).length;
    score += middling * 3;

    // Aces bonus
    if (rankCounts['A'] >= 1) {
      score += 5;
      if (rankCounts['A'] >= 2) {
        score += 10;
        features.push('double aces');
      }
    }

    // Normalize: raw score ranges ~0-70, map to 25-65% equity
    const equity = Math.max(25, Math.min(65, 25 + (score / 70) * 40));
    return { equity: Math.round(equity * 10) / 10, features };
  };

  /**
   * ICM-adjusted call EV. Raw EV is in chips; we scale the risk side by
   * the bubble factor so marginal calls near the bubble get rejected.
   */
  const icmAdjustedEV = (rawEvChips, bubbleFactor) => {
    if (rawEvChips >= 0) return rawEvChips;          // winning calls unchanged
    return rawEvChips * bubbleFactor;                // losing calls hurt more
  };

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
    const isHiLo = isHiLoVariant(gameType);
    const requiredHoleCount = expectedHoleCount(gameType);
    let equity = 0;
    let lowEquity = 0;
    let highEquity = 0;
    let potOdds = calculatePotOdds(betToCall, potSize);
    let action = 'FOLD';
    let raiseAmount = 0;
    let confidence = 0;
    let reasoning = '';
    const bbStackCalc = (bigBlind > 0 ? stackSize / bigBlind : null);
    const bubbleFactor = istournament ? computeICMBubbleFactor({
      heroStack: stackSize, avgStack: null, playersRemaining: numPlayers,
      paidSpots: null, stage: tournamentStage, bbSize: bigBlind
    }) : 1.0;
    let variantNote = '';

    // Variant hole-card validation. Reject hands that don't have the
    // expected number of hole cards for the requested variant. Engine
    // refuses to guess.
    if (holeCards.length > 0 && holeCards.length !== requiredHoleCount) {
      return {
        action: 'WAIT',
        raiseAmount: 0,
        confidence: 0,
        reasoning: `Need ${requiredHoleCount} hole cards for ${gameType.toUpperCase()}, got ${holeCards.length}`,
        equity: 0,
        potOdds: 0,
        highEquity: 0,
        lowEquity: 0,
        bubbleFactor,
      };
    }

    // Normalize legacy position names
    const posMap = {
      early: 'utg', utg: 'utg',
      middle: 'mp', mp: 'mp',
      co: 'co', cutoff: 'co',
      late: 'btn', btn: 'btn', button: 'btn',
      sb: 'sb', smallblind: 'sb',
      bb: 'bb', bigblind: 'bb',
    };
    const pos = posMap[String(position).toLowerCase()] || 'mp';

    // ========== PREFLOP ==========
    if (street === 'preflop') {
      if (holeCards.length < 2) {
        return { action: 'FOLD', raiseAmount: 0, confidence: 0,
                 reasoning: 'Not enough hole cards', equity: 0, potOdds: 0 };
      }

      // PLO preflop uses heuristic evaluation (169-hand chart is NLHE only)
      if (isOmaha) {
        // PLO starting-hand heuristic: count broadways, pairs, and suits.
        // Hi-Lo boosts hands with nut-low potential (A-2, A-3, 2-3).
        const highCount = holeCards.filter(c => RANK_VALUE[c.rank] >= 11).length;
        const suitCount = new Set(holeCards.map(c => c.suit)).size;
        const doubleSuited = suitCount === 2 && holeCards.length >= 4;
        const singleSuited = suitCount < holeCards.length;
        const rankCounts = {};
        holeCards.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
        const pairs = Object.values(rankCounts).filter(n => n >= 2).length;
        const lowPot = isHiLo ? nutLowPotential(holeCards) : 0;

        // Premium: 2+ broadways AND (double suited OR pair among broadways)
        // Or Hi-Lo: A-2 / A-3 with any high card
        const hasPremiumBroadway = highCount >= 2 && (doubleSuited || pairs >= 1);
        const hasNutLowLock = isHiLo && lowPot >= 0.85;

        if (hasPremiumBroadway || hasNutLowLock) {
          action = 'RAISE';
          confidence = 80;
          raiseAmount = Math.max(bigBlind * 3, potSize * 1.5, betToCall * 3);
          reasoning = hasNutLowLock
            ? `${gameType.toUpperCase()} nut-low premium (${highCount} broadway, low ${(lowPot*100).toFixed(0)}%)`
            : `${gameType.toUpperCase()} premium (${highCount} broadway, ${doubleSuited ? 'double-suited' : singleSuited ? 'suited' : 'rainbow'}${pairs ? ', pair' : ''})`;
        } else if (highCount >= 2 || pairs >= 1 || (isHiLo && lowPot >= 0.6)) {
          action = betToCall <= bigBlind * 3 ? 'CALL' : 'FOLD';
          confidence = 60;
          reasoning = `${gameType.toUpperCase()} speculative (${highCount}B, ${pairs}P${isHiLo ? `, low ${(lowPot*100).toFixed(0)}%` : ''})`;
        } else if (highCount >= 1 && singleSuited) {
          action = betToCall <= bigBlind * 2 ? 'CALL' : 'FOLD';
          confidence = 50;
          reasoning = `${gameType.toUpperCase()} marginal connector`;
        } else {
          action = 'FOLD';
          confidence = 70;
          reasoning = `${gameType.toUpperCase()} hand too weak`;
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

      // Tournament ICM + push/fold adjustments
      if (istournament && !isOmaha) {
        const bbStack = bbStackCalc != null ? bbStackCalc : 100;
        const handCode = holeCards.length >= 2 ? getHandType(holeCards[0], holeCards[1]) : '';
        const pushRange = getPushFoldRange(bbStack);

        // Push/fold territory: stack <= 20bb and we're first-in or vs a limp
        if (pushRange && (preflopAction === 'rfi' || preflopAction === 'vs_limp' || preflopAction == null)) {
          if (inRange(handCode, pushRange)) {
            action = 'RAISE';
            raiseAmount = stackSize;
            confidence = Math.min(92, 70 + Math.round((20 - bbStack) * 1.5));
            reasoning = `Push-fold shove ${handCode} @ ${bbStack.toFixed(1)}bb`;
            variantNote = ` [ICM ${bubbleFactor.toFixed(2)}x]`;
          } else {
            action = 'FOLD';
            confidence = 82;
            reasoning = `${handCode} outside push range @ ${bbStack.toFixed(1)}bb`;
            variantNote = ` [ICM ${bubbleFactor.toFixed(2)}x]`;
          }
        } else if (bbStack < 25 && bubbleFactor >= 1.35 && action === 'CALL') {
          // Bubble / FT ICM: tighten marginal calls
          action = 'FOLD';
          confidence = 75;
          reasoning = `ICM fold (${tournamentStage}, ${bbStack.toFixed(1)}bb, bubble ${bubbleFactor.toFixed(2)}x)`;
        } else if (bbStack >= 25 && bubbleFactor >= 1.35 && action === 'RAISE' && !inRange(handCode, THREEBET_RANGE)) {
          // Big stack near bubble: avoid speculative 3bets
          action = 'CALL';
          confidence = Math.max(55, confidence - 10);
          reasoning += ` (bubble discipline ${bubbleFactor.toFixed(2)}x)`;
        }
      }

      // PLO tournament: equity-vs-random shove heuristic
      if (istournament && isOmaha && bbStackCalc != null && bbStackCalc <= 15 && action !== 'FOLD') {
        try {
          const ploEst = estimatePloHandEquityVsRandom(holeCards);
          const threshold = bbStackCalc <= 8 ? 35 : bbStackCalc <= 12 ? 42 : 50;
          if (ploEst.equity >= threshold) {
            action = 'RAISE';
            raiseAmount = stackSize;
            confidence = Math.max(confidence, Math.min(85, Math.round(ploEst.equity + 10)));
            const featureStr = ploEst.features.length > 0 ? ploEst.features.join(', ') : 'marginal';
            reasoning += ` (PLO shove: ${featureStr}, ~${ploEst.equity}% equity vs random at ${Math.round(bbStackCalc)}BB)`;
          } else if (bbStackCalc <= 8 && ploEst.equity >= 30) {
            // Desperate: 8BB or less, still shove semi-playable hands
            action = 'RAISE';
            raiseAmount = stackSize;
            confidence = Math.max(confidence, 60);
            reasoning += ` (PLO desperation shove at ${Math.round(bbStackCalc)}BB, ~${ploEst.equity}% equity)`;
          }
        } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
        }
      }

      // ── Preflop equity calculation ──────────────────────────────
      // Compute all-in equity vs random so the HUD displays a meaningful
      // equity percentage even on preflop streets. Use a smaller iteration
      // budget (800) to keep the HUD responsive — preflop equity is
      // supplementary info, not the decision driver.
      if (holeCards.length >= 2) {
        try {
          const villainCount = Math.max(1, numPlayers - 1);
          const preflopEquity = calculateEquity(
            holeCards, boardCards, villainCount, gameType, 800
          );
          equity = preflopEquity.equity;
          highEquity = preflopEquity.highEquity != null ? preflopEquity.highEquity : equity;
          lowEquity = preflopEquity.lowEquity || 0;
        } catch (_eqErr) { console.warn('[App] Handled exception:', _eqErr?.message || _eqErr); }
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

      // If we had a preflop action signal, estimate villain's range and run
      // range-vs-range equity (much more accurate than "random hand").
      // Heads-up only (numPlayers - 1 === 1); multiway falls back to random.
      let equityResult;
      const villainCount = Math.max(1, numPlayers - 1);
      const effectiveRange = !isOmaha && villainCount === 1
        ? (preflopAction === 'vs_3bet' ? FOURBET_RANGE
            : preflopAction === 'vs_raise' ? THREEBET_RANGE
            : preflopAction === 'rfi' ? (RFI[pos] || RFI.mp)
            : null)
        : null;
      if (effectiveRange) {
        equityResult = calculateEquityVsRange(
          holeCards, boardCards, effectiveRange, gameType, iterBudget
        );
      } else {
        equityResult = calculateEquity(
          holeCards, boardCards, villainCount, gameType, iterBudget
        );
      }
      equity = equityResult.equity;
      highEquity = equityResult.highEquity != null ? equityResult.highEquity : equity;
      lowEquity = equityResult.lowEquity || 0;

      // Hi-Lo: exact expected share using lowPossible probability.
      // pot_share = P(low exists) * (0.5*highEq + 0.5*lowEq) + P(no low) * highEq
      if (isHiLo && lowEquity > 0) {
        const pLow = equityResult.lowPossible != null ? equityResult.lowPossible : 0.6;
        equity = Math.min(100,
          pLow * (0.5 * highEquity + 0.5 * lowEquity) +
          (1 - pLow) * highEquity
        );
        variantNote = ` [hi ${Math.round(highEquity)}%, lo ${Math.round(lowEquity)}%, low possible ${Math.round(pLow * 100)}%]`;
      }

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
      reasoning: reasoning + variantNote,
      equity: Math.round(equity * 100) / 100,
      potOdds: Math.round(potOdds * 100) / 100,
      highEquity: Math.round(highEquity * 100) / 100,
      lowEquity: Math.round(lowEquity * 100) / 100,
      bubbleFactor,
      bbStack: bbStackCalc != null ? Math.round(bbStackCalc * 10) / 10 : null,
      variant: gameType,
      isHiLo,
      isOmaha,
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

    // Range-based analysis
    calculateEquityVsRange,
    expandRange,
    expandHandCode,
    countOuts,
    RANGES: { RFI, BB_DEFEND, THREEBET_RANGE, FOURBET_RANGE },

    // Decision making
    getDecision,
    inferPreflopAction,

    // Variant + tournament utilities
    expectedHoleCount,
    isHiLoVariant,
    nutLowPotential,
    getPushFoldRange,
    calculateM,
    bubbleFactorForStage,
    computeICMBubbleFactor,
    estimatePloHandEquityVsRandom,
    icmAdjustedEV,
    PUSH_RANGE_BY_BB,

    // Utilities
    getHandName,
    calculatePotOdds,
    calculateImpliedOdds,
    calculateStackToPot,
    getHandType,
  };
})();

export default PokerBrainEngine;
