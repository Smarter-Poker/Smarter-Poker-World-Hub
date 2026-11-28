/**
 * handEvaluatorSimple.mjs · Everyday-Player Plain-English Poker Math Library
 * ===========================================================================
 * Pure deterministic ES module with zero external dependencies.
 * Provides:
 *  - evaluateHeroHandSimple(heroCards, boardCards): best made hand for 2-card
 *    NLH and 4/5/6-card PLO plus exact non-double-counted outs & draw odds.
 *  - describeStreetDelta({ prevEquity, currEquity, newCard, handEval, boardCards })
 *  - describeBetSizingPlain({ betBb, potBb, facingBetBb, stakesDisplay })
 *  - formatStakeAmount(bbValue, stakesDisplay)
 *  - COMMON_POKER_SPOTS: 5 curated everyday poker scenarios
 *  - buildRangeStringFromPercent(percent, activeGroups)
 *
 * 100% pure combinatorial math. Zero fabricated GTO grades or solver EV.
 */

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

const RANK_VAL = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const RANK_NAME = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven',
  8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

const RANK_PLURAL = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens',
  8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};

const FULL_DECK = [];
for (let r = RANKS.length - 1; r >= 0; r -= 1) {
  for (let s = 0; s < SUITS.length; s += 1) {
    FULL_DECK.push(`${RANKS[r]}${SUITS[s]}`);
  }
}

function normalizeCard(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const clean = trimmed.startsWith('10') ? `T${trimmed.slice(2)}` : trimmed;
  if (clean.length !== 2) return null;
  const rank = clean[0].toUpperCase();
  const suit = clean[1].toLowerCase();
  if (!RANK_VAL[rank] || !SUITS.includes(suit)) return null;
  return `${rank}${suit}`;
}

function parseCardObj(token) {
  const norm = normalizeCard(token);
  if (!norm) return null;
  const rank = norm[0];
  const suit = norm[1];
  return { token: norm, rank, suit, val: RANK_VAL[rank] };
}

function uniqueParsedCards(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const c = parseCardObj(item);
    if (!c || seen.has(c.token)) continue;
    seen.add(c.token);
    out.push(c);
  }
  return out;
}

function straightHighFromMask(mask) {
  let m = mask;
  if (m & (1 << 14)) m |= (1 << 1);
  for (let high = 14; high >= 5; high -= 1) {
    const need = (1 << high) | (1 << (high - 1)) | (1 << (high - 2)) | (1 << (high - 3)) | (1 << (high - 4));
    if ((m & need) === need) return high;
  }
  return 0;
}

function encodeScore(cat, tiebreaks) {
  let score = cat;
  for (let i = 0; i < 5; i += 1) {
    score = score * 16 + (tiebreaks[i] || 0);
  }
  return score;
}

/**
 * Evaluate exactly 5 parsed card objects into { category, tiebreaks, score, cards }.
 */
function evaluateFiveCards(five) {
  const rankCount = new Array(15).fill(0);
  let rankMask = 0;
  const firstSuit = five[0].suit;
  let allSameSuit = true;

  for (let i = 0; i < 5; i += 1) {
    const c = five[i];
    rankCount[c.val] += 1;
    rankMask |= (1 << c.val);
    if (c.suit !== firstSuit) allSameSuit = false;
  }

  const stHigh = straightHighFromMask(rankMask);
  if (allSameSuit && stHigh) {
    return { category: 8, tiebreaks: [stHigh], score: encodeScore(8, [stHigh]), cards: five };
  }

  const quads = [];
  const trips = [];
  const pairs = [];
  const singles = [];
  for (let v = 14; v >= 2; v -= 1) {
    const n = rankCount[v];
    if (n === 4) quads.push(v);
    else if (n === 3) trips.push(v);
    else if (n === 2) pairs.push(v);
    else if (n === 1) singles.push(v);
  }

  if (quads.length > 0) {
    const tb = [quads[0], singles[0] || 0];
    return { category: 7, tiebreaks: tb, score: encodeScore(7, tb), cards: five };
  }
  if (trips.length > 0 && pairs.length > 0) {
    const tb = [trips[0], pairs[0]];
    return { category: 6, tiebreaks: tb, score: encodeScore(6, tb), cards: five };
  }
  if (allSameSuit) {
    const tb = five.map((c) => c.val).sort((a, b) => b - a);
    return { category: 5, tiebreaks: tb, score: encodeScore(5, tb), cards: five };
  }
  if (stHigh) {
    return { category: 4, tiebreaks: [stHigh], score: encodeScore(4, [stHigh]), cards: five };
  }
  if (trips.length > 0) {
    const tb = [trips[0], singles[0] || 0, singles[1] || 0];
    return { category: 3, tiebreaks: tb, score: encodeScore(3, tb), cards: five };
  }
  if (pairs.length >= 2) {
    const tb = [pairs[0], pairs[1], singles[0] || 0];
    return { category: 2, tiebreaks: tb, score: encodeScore(2, tb), cards: five };
  }
  if (pairs.length === 1) {
    const tb = [pairs[0], singles[0] || 0, singles[1] || 0, singles[2] || 0];
    return { category: 1, tiebreaks: tb, score: encodeScore(1, tb), cards: five };
  }
  const tb = singles.slice(0, 5);
  return { category: 0, tiebreaks: tb, score: encodeScore(0, tb), cards: five };
}

function chooseKIndices(n, k) {
  const out = [];
  const curr = [];
  function rec(start) {
    if (curr.length === k) {
      out.push([...curr]);
      return;
    }
    for (let i = start; i <= n - (k - curr.length); i += 1) {
      curr.push(i);
      rec(i + 1);
      curr.pop();
    }
  }
  rec(0);
  return out;
}

/**
 * Find the best 5-card hand for NLH (2 hole cards, any 5 of hero+board)
 * or PLO (4/5/6 hole cards: exact 2 from hero + exact 3 from board).
 */
function findBestHand(hero, board) {
  const isPlo = hero.length >= 4;
  let best = null;

  if (isPlo) {
    const heroPairs = chooseKIndices(hero.length, 2);
    const boardTriples = chooseKIndices(board.length, 3);
    for (const hp of heroPairs) {
      const h2 = [hero[hp[0]], hero[hp[1]]];
      for (const bt of boardTriples) {
        const b3 = [board[bt[0]], board[bt[1]], board[bt[2]]];
        const res = evaluateFiveCards([...h2, ...b3]);
        if (!best || res.score > best.score) {
          best = { ...res, usedHero: h2, usedBoard: b3 };
        }
      }
    }
    return best;
  }

  const combined = [...hero, ...board];
  if (combined.length < 5) return null;
  const heroSet = new Set(hero.map((c) => c.token));
  const fives = chooseKIndices(combined.length, 5);
  for (const idxs of fives) {
    const five = idxs.map((i) => combined[i]);
    const res = evaluateFiveCards(five);
    if (!best || res.score > best.score) {
      best = {
        ...res,
        usedHero: five.filter((c) => heroSet.has(c.token)),
        usedBoard: five.filter((c) => !heroSet.has(c.token)),
      };
    }
  }
  return best;
}

function describeMadeHand(best, hero, board) {
  const cat = best.category;
  const tb = best.tiebreaks;
  const sortedBoardRanks = [...new Set(board.map((c) => c.val))].sort((a, b) => b - a);
  const topBoard = sortedBoardRanks[0] || 0;
  const secondBoard = sortedBoardRanks[1] || 0;
  const lowBoard = sortedBoardRanks[sortedBoardRanks.length - 1] || 0;

  const heroRankCounts = {};
  hero.forEach((c) => { heroRankCounts[c.val] = (heroRankCounts[c.val] || 0) + 1; });
  const boardRankCounts = {};
  board.forEach((c) => { boardRankCounts[c.val] = (boardRankCounts[c.val] || 0) + 1; });

  if (cat === 8) {
    if (tb[0] === 14) {
      return { rankLabel: 'Royal Flush', detailLabel: 'Ace-High Straight Flush', tier: 9, category: 'straight_flush' };
    }
    return {
      rankLabel: 'Straight Flush',
      detailLabel: `${RANK_NAME[tb[0]]}-High Straight Flush`,
      tier: 9,
      category: 'straight_flush',
    };
  }
  if (cat === 7) {
    return {
      rankLabel: 'Four Of A Kind',
      detailLabel: `Quad ${RANK_PLURAL[tb[0]]}`,
      tier: 8,
      category: 'four_of_a_kind',
    };
  }
  if (cat === 6) {
    return {
      rankLabel: 'Full House',
      detailLabel: `${RANK_PLURAL[tb[0]]} Full Of ${RANK_PLURAL[tb[1]]}`,
      tier: 7,
      category: 'full_house',
    };
  }
  if (cat === 5) {
    return {
      rankLabel: 'Flush',
      detailLabel: `${RANK_NAME[tb[0]]}-High Flush`,
      tier: 6,
      category: 'flush',
    };
  }
  if (cat === 4) {
    return {
      rankLabel: 'Straight',
      detailLabel: `${RANK_NAME[tb[0]]}-High Straight`,
      tier: 5,
      category: 'straight',
    };
  }
  if (cat === 3) {
    const tripVal = tb[0];
    const inHero = heroRankCounts[tripVal] || 0;
    const inBoard = boardRankCounts[tripVal] || 0;
    const kind = inHero >= 2 && inBoard >= 1 ? 'Set' : inHero >= 1 && inBoard >= 2 ? 'Trips' : 'Three Of A Kind';
    return {
      rankLabel: 'Three Of A Kind',
      detailLabel: `${kind} Of ${RANK_PLURAL[tripVal]}`,
      tier: 4,
      category: 'three_of_a_kind',
    };
  }
  if (cat === 2) {
    const hi = tb[0];
    const lo = tb[1];
    const isTopTwo = hi === topBoard && lo === secondBoard;
    return {
      rankLabel: 'Two Pair',
      detailLabel: isTopTwo
        ? `Top Two Pair (${RANK_PLURAL[hi]} And ${RANK_PLURAL[lo]})`
        : `${RANK_PLURAL[hi]} And ${RANK_PLURAL[lo]}`,
      tier: 3,
      category: 'two_pair',
    };
  }
  if (cat === 1) {
    const pairVal = tb[0];
    const inHero = heroRankCounts[pairVal] || 0;
    const inBoard = boardRankCounts[pairVal] || 0;
    const kickerVal = tb[1] || 0;
    const kickerName = RANK_NAME[kickerVal] || '';

    // Hero holds a pocket pair
    if (inHero >= 2 && inBoard === 0) {
      if (pairVal > topBoard) {
        return {
          rankLabel: `Overpair · ${RANK_PLURAL[pairVal]}`,
          detailLabel: `Pocket ${RANK_PLURAL[pairVal]} Above The Board`,
          tier: 2,
          category: 'one_pair',
        };
      }
      if (pairVal < lowBoard) {
        return {
          rankLabel: `Underpair · ${RANK_PLURAL[pairVal]}`,
          detailLabel: `Pocket ${RANK_PLURAL[pairVal]} Below The Board`,
          tier: 2,
          category: 'one_pair',
        };
      }
      return {
        rankLabel: `Pocket Pair · ${RANK_PLURAL[pairVal]}`,
        detailLabel: `Middle Pocket Pair (${RANK_PLURAL[pairVal]})`,
        tier: 2,
        category: 'one_pair',
      };
    }

    // Hero paired a board card
    if (inHero >= 1 && inBoard >= 1) {
      const heroKickers = hero.filter((c) => c.val !== pairVal).map((c) => c.val).sort((a, b) => b - a);
      const bestHeroKicker = heroKickers[0] || kickerVal;
      const heroKickerName = RANK_NAME[bestHeroKicker] || kickerName;
      if (pairVal === topBoard) {
        return {
          rankLabel: heroKickerName ? `Top Pair · ${heroKickerName} Kicker` : 'Top Pair',
          detailLabel: `Pair Of ${RANK_PLURAL[pairVal]} With ${heroKickerName || 'Board'} Kicker`,
          tier: 2,
          category: 'one_pair',
        };
      }
      if (pairVal === secondBoard) {
        return {
          rankLabel: heroKickerName ? `Second Pair · ${heroKickerName} Kicker` : 'Second Pair',
          detailLabel: `Pair Of ${RANK_PLURAL[pairVal]}`,
          tier: 2,
          category: 'one_pair',
        };
      }
      return {
        rankLabel: `Bottom Pair · ${RANK_PLURAL[pairVal]}`,
        detailLabel: `Pair Of ${RANK_PLURAL[pairVal]}`,
        tier: 2,
        category: 'one_pair',
      };
    }

    // Only the board is paired
    return {
      rankLabel: 'High Card',
      detailLabel: `${RANK_NAME[tb[1] || 14]} High On Paired Board`,
      tier: 1,
      category: 'high_card',
    };
  }

  return {
    rankLabel: 'High Card',
    detailLabel: `${RANK_NAME[tb[0]]} High`,
    tier: 1,
    category: 'high_card',
  };
}

function evaluatePreflopHand(hero) {
  if (hero.length >= 4) {
    const rankCounts = {};
    const suitCounts = {};
    hero.forEach((c) => {
      rankCounts[c.val] = (rankCounts[c.val] || 0) + 1;
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });
    const doubleSuited = Object.values(suitCounts).filter((n) => n >= 2).length >= 2;
    const hasPair = Object.values(rankCounts).some((n) => n >= 2);
    const notes = [];
    if (hasPair) notes.push('Pocket Pair');
    if (doubleSuited) notes.push('Double Suited');
    return {
      rankLabel: `${hero.length}-Card Omaha Hand`,
      detailLabel: notes.length > 0 ? notes.join(' · ') : 'Preflop Starting Hand',
      tier: hasPair ? 2 : 1,
      category: 'preflop',
      draws: { outs: 0, drawLabels: [], turnPct: 0, riverPct: 0, outCards: [] },
    };
  }

  const sorted = [...hero].sort((a, b) => b.val - a.val);
  const hi = sorted[0];
  const lo = sorted[1];
  if (hi.val === lo.val) {
    return {
      rankLabel: `Pocket ${RANK_PLURAL[hi.val]}`,
      detailLabel: hi.val >= 11 ? 'Premium Pocket Pair' : hi.val >= 7 ? 'Medium Pocket Pair' : 'Small Pocket Pair',
      tier: hi.val >= 11 ? 3 : 2,
      category: 'pocket_pair',
      draws: { outs: 0, drawLabels: [], turnPct: 0, riverPct: 0, outCards: [] },
    };
  }
  const suited = hi.suit === lo.suit;
  const bothBroadway = hi.val >= 10 && lo.val >= 10;
  const connected = hi.val - lo.val === 1;
  const detail = bothBroadway
    ? (suited ? 'Suited Broadway Hand' : 'Big Broadway Hand')
    : suited && connected
      ? 'Suited Connectors'
      : suited
        ? 'Suited Starting Hand'
        : 'Offsuit Starting Hand';
  return {
    rankLabel: `${RANK_NAME[hi.val]} ${RANK_NAME[lo.val]} ${suited ? 'Suited' : 'Offsuit'}`,
    detailLabel: detail,
    tier: bothBroadway ? 2 : 1,
    category: 'preflop',
    draws: { outs: 0, drawLabels: [], turnPct: 0, riverPct: 0, outCards: [] },
  };
}

/**
 * Exact remaining-deck draw & out evaluation for 3-card flop or 4-card turn.
 * Guarantees zero double-counting of outs via a unified Set of out card tokens.
 */
function computeExactDrawsAndOuts(hero, board, currentBest) {
  if (board.length !== 3 && board.length !== 4) {
    return { outs: 0, drawLabels: [], turnPct: 0, riverPct: 0, outCards: [] };
  }

  const used = new Set([...hero.map((c) => c.token), ...board.map((c) => c.token)]);
  const remaining = FULL_DECK.filter((tok) => !used.has(tok)).map(parseCardObj);
  const remCount = remaining.length;
  if (remCount === 0) {
    return { outs: 0, drawLabels: [], turnPct: 0, riverPct: 0, outCards: [] };
  }

  const flushOutSet = new Set();
  const straightOutSet = new Set();
  const straightOutRanks = new Set();

  const currentCat = currentBest ? currentBest.category : 0;

  for (const nextCard of remaining) {
    const nextBoard = [...board, nextCard];
    const nextBest = findBestHand(hero, nextBoard);
    if (!nextBest) continue;

    // Flush draw out: hero improves to Flush or Straight Flush using at least 1 hero card of that suit
    if (currentCat < 5 && (nextBest.category === 5 || nextBest.category === 8)) {
      const flushSuit = nextBest.cards[0].suit;
      const heroContributesSuit = nextBest.usedHero.some((c) => c.suit === flushSuit);
      if (heroContributesSuit) {
        flushOutSet.add(nextCard.token);
      }
    }

    // Straight draw out: hero improves to Straight (or Straight Flush) using at least 1 hero card
    if (currentCat < 4 && (nextBest.category === 4 || nextBest.category === 8)) {
      const boardOnlyMask = nextBoard.reduce((m, c) => m | (1 << c.val), 0);
      const boardOnlyStraight = straightHighFromMask(boardOnlyMask);
      const heroImprovesStraight = nextBest.usedHero.length > 0
        && (nextBest.tiebreaks[0] > boardOnlyStraight || boardOnlyStraight === 0);
      if (heroImprovesStraight) {
        straightOutSet.add(nextCard.token);
        straightOutRanks.add(nextCard.val);
      }
    }
  }

  const drawLabels = [];
  const unifiedOuts = new Set();

  if (flushOutSet.size >= 7) {
    drawLabels.push('Flush Draw');
    flushOutSet.forEach((tok) => unifiedOuts.add(tok));
  }

  if (straightOutSet.size >= 3) {
    if (straightOutSet.size >= 12) {
      drawLabels.push('Wrap Straight Draw');
    } else if (straightOutRanks.size >= 2) {
      // Distinguish true open-ended (2 ranks flanking a 4-card sequence) vs double gutshot
      const ranksArr = [...straightOutRanks].sort((a, b) => a - b);
      let isOpenEnded = false;
      for (let i = 0; i < ranksArr.length; i += 1) {
        for (let j = i + 1; j < ranksArr.length; j += 1) {
          if (ranksArr[j] - ranksArr[i] === 5) isOpenEnded = true;
        }
      }
      drawLabels.push(isOpenEnded ? 'Open-Ended Straight Draw' : 'Double Gutshot Straight Draw');
    } else {
      drawLabels.push('Gutshot Straight Draw');
    }
    straightOutSet.forEach((tok) => unifiedOuts.add(tok));
  }

  const outs = unifiedOuts.size;
  const outCards = [...unifiedOuts];

  const turnPct = outs > 0 ? Math.round((outs / remCount) * 1000) / 10 : 0;
  let riverPct = turnPct;
  if (board.length === 3 && outs > 0 && remCount > 1) {
    const missBoth = ((remCount - outs) / remCount) * ((remCount - 1 - outs) / (remCount - 1));
    riverPct = Math.round((1 - missBoth) * 1000) / 10;
  }

  return { outs, drawLabels, turnPct, riverPct, outCards };
}

/**
 * Evaluate Hero's best current made hand plus exact draws & outs (zero double-counting).
 * Supports both 2-card NLH and 4/5/6-card PLO.
 */
export function evaluateHeroHandSimple(heroCards, boardCards) {
  const hero = uniqueParsedCards(heroCards);
  const heroSet = new Set(hero.map((c) => c.token));
  const board = uniqueParsedCards(boardCards).filter((c) => !heroSet.has(c.token)).slice(0, 5);

  if (hero.length < 2) {
    return {
      rankLabel: 'Choose Your Cards',
      detailLabel: 'Tap Your Cards On The Table To Begin',
      tier: 0,
      category: 'none',
      draws: { outs: 0, drawLabels: [], turnPct: 0, riverPct: 0, outCards: [] },
    };
  }

  if (board.length < 3) {
    return evaluatePreflopHand(hero);
  }

  const best = findBestHand(hero, board);
  if (!best) {
    return {
      rankLabel: 'High Card',
      detailLabel: 'Unpaired Hand',
      tier: 1,
      category: 'high_card',
      draws: { outs: 0, drawLabels: [], turnPct: 0, riverPct: 0, outCards: [] },
    };
  }

  const made = describeMadeHand(best, hero, board);
  const draws = computeExactDrawsAndOuts(hero, board, best);
  return { ...made, draws };
}

/**
 * Return a single plain-English "What Just Changed?" sentence when a Turn or River card is dealt.
 */
export function describeStreetDelta({ prevEquity, currEquity, newCard, handEval, boardCards = null, street = null } = {}) {
  const parsed = parseCardObj(newCard);
  if (!parsed) return null;

  const board = uniqueParsedCards(boardCards);
  const streetWord = street
    ? (String(street).toLowerCase() === 'river' ? 'River' : 'Turn')
    : (board.length >= 5 ? 'River' : 'Turn');

  const cardText = parsed.token;
  const hasPrev = prevEquity != null && Number.isFinite(Number(prevEquity));
  const hasCurr = currEquity != null && Number.isFinite(Number(currEquity));
  const prevPct = hasPrev ? Math.round(Number(prevEquity)) : null;
  const currPct = hasCurr ? Math.round(Number(currEquity)) : null;
  const delta = prevPct != null && currPct != null ? currPct - prevPct : 0;

  // Inspect board events caused by the new card when boardCards are supplied
  let boardFlushCompleted = false;
  let boardPaired = false;
  let boardStraightConnected = false;

  if (board.length >= 4) {
    const suitCount = board.filter((c) => c.suit === parsed.suit).length;
    const prevSuitCount = board.slice(0, -1).filter((c) => c.suit === parsed.suit).length;
    if (suitCount >= 3 && prevSuitCount === 2) boardFlushCompleted = true;

    const prevRankMatch = board.slice(0, -1).some((c) => c.val === parsed.val);
    if (prevRankMatch) boardPaired = true;

    const mask = board.reduce((m, c) => m | (1 << c.val), 0);
    let m2 = mask;
    if (m2 & (1 << 14)) m2 |= (1 << 1);
    for (let high = 14; high >= 5; high -= 1) {
      let hits = 0;
      for (let k = 0; k < 5; k += 1) {
        if (m2 & (1 << (high - k))) hits += 1;
      }
      if (hits >= 4) {
        boardStraightConnected = true;
        break;
      }
    }
  }

  const madeLabel = handEval?.rankLabel || 'A Stronger Hand';
  const heroHasFlush = handEval?.category === 'flush' || handEval?.category === 'straight_flush';

  if (delta >= 8) {
    const moveText = prevPct != null
      ? `Your Win Chance Jumped From ${prevPct}% To ${currPct}%.`
      : `Your Win Chance Jumped To ${currPct}%.`;
    return `${streetWord} ${cardText} Gave You ${madeLabel}. ${moveText}`;
  }

  if (delta <= -8) {
    let reason = 'Brought A Dangerous Card';
    if (boardFlushCompleted && !heroHasFlush) reason = 'Completed A Possible Flush';
    else if (boardPaired) reason = 'Paired The Board';
    else if (boardStraightConnected) reason = 'Completed A Possible Straight';
    return `${streetWord} ${cardText} ${reason}. Your Win Chance Moved From ${prevPct}% To ${currPct}%.`;
  }

  if (delta >= 2 && prevPct != null && currPct != null) {
    return `${streetWord} ${cardText} Improved Your Spot (${madeLabel}). Your Win Chance Moved From ${prevPct}% To ${currPct}%.`;
  }

  if (delta <= -2 && prevPct != null && currPct != null) {
    const reason = boardFlushCompleted && !heroHasFlush
      ? 'Added A Possible Flush Card'
      : boardPaired
        ? 'Paired The Board'
        : 'Tightened The Board';
    return `${streetWord} ${cardText} ${reason}. Your Win Chance Moved From ${prevPct}% To ${currPct}%.`;
  }

  if (currPct != null) {
    return `${streetWord} ${cardText} Kept You At ${madeLabel}. Your Win Chance Stands At ${currPct}%.`;
  }

  return `${streetWord} ${cardText} Kept You At ${madeLabel}.`;
}

/**
 * Format a BB value as BB, $1/$2 cash ($2 per BB), or $2/$5 cash ($5 per BB).
 */
export function formatStakeAmount(bbValue, stakesDisplay = 'bb') {
  const num = Number(bbValue);
  const safe = Number.isFinite(num) ? num : 0;

  if (stakesDisplay === '1_2' || stakesDisplay === '2_5') {
    const multiplier = stakesDisplay === '2_5' ? 5 : 2;
    const dollars = Math.round(safe * multiplier * 100) / 100;
    const isWhole = Math.abs(dollars - Math.round(dollars)) < 0.005;
    return isWhole ? `$${Math.round(dollars)}` : `$${dollars.toFixed(2)}`;
  }

  const rounded = Math.round(safe * 10) / 10;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 0.005;
  return isWhole ? `${Math.round(rounded)} BB` : `${rounded.toFixed(1)} BB`;
}

/**
 * Crisp 1-line plain-English bet-sizing helper explanation.
 */
export function describeBetSizingPlain({ betBb, potBb, facingBetBb = 0, stakesDisplay = 'bb' } = {}) {
  const bet = Math.max(0, Number(betBb) || 0);
  const pot = Math.max(0.5, Number(potBb) || 0);
  const facing = Math.max(0, Number(facingBetBb) || 0);

  if (bet <= 0) {
    return 'Check Or Choose A Bet Size To See Opponent Pot Odds';
  }

  const pctOfPot = Math.round((bet / pot) * 100);
  const isRaise = facing > 0;
  const actionWord = isRaise ? 'Raise' : 'Bet';

  let sizeLabel;
  if (pctOfPot <= 38) sizeLabel = `Small ${actionWord} (${pctOfPot}% Pot)`;
  else if (pctOfPot <= 62) sizeLabel = `Medium ${actionWord} (${pctOfPot}% Pot)`;
  else if (pctOfPot <= 88) sizeLabel = `Strong ${actionWord} (${pctOfPot}% Pot)`;
  else if (pctOfPot <= 115) sizeLabel = `Big ${actionWord} (Pot)`;
  else sizeLabel = `Overbet (${pctOfPot}% Pot)`;

  let oppNeed = 0;
  if (isRaise) {
    const extraToCall = Math.max(0, bet - facing);
    const totalAfterCall = pot + bet + extraToCall;
    oppNeed = totalAfterCall > 0 ? Math.round((extraToCall / totalAfterCall) * 100) : 0;
  } else {
    const totalAfterCall = pot + bet + bet;
    oppNeed = totalAfterCall > 0 ? Math.round((bet / totalAfterCall) * 100) : 0;
  }

  const stakeNote = stakesDisplay && stakesDisplay !== 'bb'
    ? ` (${formatStakeAmount(bet, stakesDisplay)})`
    : '';

  return `${sizeLabel}${stakeNote} · Opponent Needs ${oppNeed}% To Call`;
}

/**
 * 5 ready-to-play everyday poker scenarios for 1-tap loading.
 */
export const COMMON_POKER_SPOTS = Object.freeze([
  {
    id: 'top_pair',
    label: 'Top Pair',
    subtitle: 'Top Pair Ace Kicker On A Dry Flop',
    heroHand: { card1: 'Ah', card2: 'Kd' },
    board: { flop: ['Kh', '7c', '2d'], turn: '', river: '' },
    heroPosition: 'BTN',
    heroStack: 100,
    potBase: 6.5,
    gameType: 'cash',
    villains: [
      { id: 0, position: 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 100, range: '' },
    ],
    actionHistory: [],
  },
  {
    id: 'flush_draw',
    label: 'Flush Draw',
    subtitle: 'Facing A 4 BB Bet With 9 Clean Outs',
    heroHand: { card1: 'Qh', card2: 'Jh' },
    board: { flop: ['Ah', '8h', '3c'], turn: '', river: '' },
    heroPosition: 'BTN',
    heroStack: 100,
    potBase: 8,
    gameType: 'cash',
    villains: [
      { id: 0, position: 'BB', archetype: { id: 'tag', name: 'TAG' }, stack: 100, range: '' },
    ],
    actionHistory: [
      {
        street: 'flop',
        actorKey: 'villain',
        actor: 'villain',
        isVillain: true,
        position: 'BB',
        action: 'bet',
        amount: 4,
        label: 'Bet 4 BB',
      },
    ],
  },
  {
    id: 'pocket_aces',
    label: 'Pocket Aces',
    subtitle: 'Overpair In An 18 BB 3-Bet Pot',
    heroHand: { card1: 'As', card2: 'Ac' },
    board: { flop: ['Qs', '9d', '4c'], turn: '', river: '' },
    heroPosition: 'BTN',
    heroStack: 100,
    potBase: 18,
    gameType: 'cash',
    villains: [
      { id: 0, position: 'BB', archetype: { id: 'tag', name: 'TAG' }, stack: 100, range: '' },
    ],
    actionHistory: [],
  },
  {
    id: 'scary_board',
    label: 'Scary Board',
    subtitle: 'Set Of Sevens On A Connected Flop',
    heroHand: { card1: '7s', card2: '7h' },
    board: { flop: ['Jc', '9c', '7d'], turn: '', river: '' },
    heroPosition: 'BTN',
    heroStack: 100,
    potBase: 12,
    gameType: 'cash',
    villains: [
      { id: 0, position: 'BB', archetype: { id: 'lag', name: 'LAG' }, stack: 100, range: '' },
    ],
    actionHistory: [],
  },
  {
    id: 'short_stack',
    label: 'Short Stack',
    subtitle: '20 BB Tournament Preflop Decision',
    heroHand: { card1: 'Ad', card2: 'Ts' },
    board: { flop: [], turn: '', river: '' },
    heroPosition: 'BTN',
    heroStack: 20,
    potBase: 2.5,
    gameType: 'tournament',
    villains: [
      { id: 0, position: 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 20, range: '' },
    ],
    actionHistory: [],
  },
]);

// Complete 169-hand preflop strength ranking (strongest to weakest, zero duplicates)
const ORDERED_169_HANDS = [
  'AA', 'KK', 'QQ', 'JJ', 'AKs', 'TT', 'AQs', 'AJs', 'KQs', 'AKo',
  '99', 'ATs', 'KJs', 'QJs', 'JTs', 'AQo', '88', 'KTs', 'QTs', 'AJo',
  'KQo', 'A9s', '77', 'T9s', 'A8s', 'K9s', 'Q9s', 'J9s', 'ATo', 'A7s',
  'A5s', '66', 'KJo', 'QJo', '98s', 'A6s', 'A4s', 'A3s', 'K8s', '55',
  'A2s', '87s', 'KTo', 'QTo', 'JTo', 'T8s', 'Q8s', 'J8s', 'K7s', '76s',
  '44', '97s', 'K6s', 'A9o', '65s', 'K5s', 'Q7s', '86s', '33', '54s',
  'K4s', 'J7s', 'T7s', 'A8o', '75s', 'K3s', 'Q6s', '22', 'K9o', 'Q9o',
  'J9o', 'T9o', '64s', 'K2s', 'A7o', 'Q5s', '96s', 'A5o', '53s', '85s',
  'Q4s', 'A6o', 'A4o', '74s', 'J6s', 'Q3s', 'T6s', 'A3o', '98o', '43s',
  'Q2s', '63s', 'J5s', 'A2o', '87o', '52s', 'J4s', '95s', 'K8o', '84s',
  'T5s', 'J3s', '76o', '73s', 'K7o', 'Q8o', 'J8o', 'T8o', 'J2s', '42s',
  '65o', 'T4s', '62s', 'K6o', '97o', '86o', 'T3s', '54o', '94s', 'K5o',
  'T2s', 'Q7o', '32s', '93s', '83s', '75o', 'K4o', '72s', '92s', '82s',
  'Q6o', 'K3o', 'J7o', 'T7o', '64o', 'K2o', 'Q5o', '53o', '85o', '96o',
  'Q4o', '74o', 'J6o', 'Q3o', 'T6o', '43o', 'Q2o', '63o', 'J5o', '52o',
  'J4o', '95o', '84o', 'T5o', 'J3o', '73o', 'J2o', '42o', 'T4o', '62o',
  'T3o', '94o', 'T2o', '32o', '93o', '83o', '72o', '92o', '82o',
];

function combosForNotation(hand) {
  if (hand.length === 2) return 6;
  return hand.endsWith('s') ? 4 : 12;
}

const TOTAL_COMBOS = 1326;

const GROUP_PREDICATES = {
  pairs: (h) => h.length === 2,
  aces: (h) => h[0] === 'A',
  suited: (h) => h.endsWith('s'),
  broadway: (h) => RANK_VAL[h[0]] >= 10 && RANK_VAL[h[1]] >= 10,
};

function parseActiveGroups(activeGroups) {
  if (!activeGroups) return [];
  if (Array.isArray(activeGroups)) {
    return activeGroups.filter((g) => Boolean(GROUP_PREDICATES[g]));
  }
  if (typeof activeGroups === 'object') {
    return Object.keys(GROUP_PREDICATES).filter((g) => Boolean(activeGroups[g]));
  }
  return [];
}

/**
 * Convert a 10-100% Tight-to-Loose slider + optional group toggles
 * ('pairs', 'aces', 'suited', 'broadway') into a comma-separated range string
 * compatible with expandRangeToCombos().
 */
export function buildRangeStringFromPercent(percent = 25, activeGroups = null) {
  const numericPct = Number(percent);
  const clampedPct = Number.isFinite(numericPct) ? Math.max(10, Math.min(100, Math.round(numericPct))) : 25;
  const targetCombos = Math.round((clampedPct / 100) * TOTAL_COMBOS);

  const selected = new Set();
  let runningCombos = 0;

  for (const hand of ORDERED_169_HANDS) {
    const c = combosForNotation(hand);
    if (selected.size === 0 || runningCombos < targetCombos) {
      selected.add(hand);
      runningCombos += c;
    } else {
      break;
    }
  }

  const enabledGroups = parseActiveGroups(activeGroups);
  if (enabledGroups.length > 0) {
    for (const hand of ORDERED_169_HANDS) {
      if (enabledGroups.some((g) => GROUP_PREDICATES[g](hand))) {
        selected.add(hand);
      }
    }
  }

  const orderedSelected = ORDERED_169_HANDS.filter((h) => selected.has(h));
  const comboCount = orderedSelected.reduce((sum, h) => sum + combosForNotation(h), 0);
  const actualPercent = Math.min(100, Math.round((comboCount / TOTAL_COMBOS) * 100));

  const effectivePct = enabledGroups.length > 0 ? actualPercent : clampedPct;
  let styleLabel = 'Typical';
  if (effectivePct <= 14) styleLabel = 'Only Best Hands';
  else if (effectivePct <= 25) styleLabel = 'Tight';
  else if (effectivePct <= 45) styleLabel = 'Typical';
  else if (effectivePct <= 84) styleLabel = 'Loose';
  else styleLabel = 'Any Two Cards';

  return {
    rangeString: orderedSelected.join(','),
    percentLabel: `${effectivePct}% Of Hands`,
    styleLabel,
    actualPercent,
    comboCount,
    handCount: orderedSelected.length,
  };
}
