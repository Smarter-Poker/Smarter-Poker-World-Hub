/**
 * Comprehensive Poker Brain Decision Engine
 * Supports: No-Limit Hold'em, PLO, PLO Hi-Lo, PLO5, PLO6, Tournament mode
 * Pure JavaScript ES Module for browser use
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

  const shuffleDeck = (deck) => {
    const copy = [...deck];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
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

  const getValidOmahaHoleCardCombos = (holeCards, numFromHole = 2) => {
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

      // Check regular straight
      if (values[0] - values[4] === 4 &&
          new Set(values).size === 5) {
        return { straight: true, high: values[0] };
      }

      // Check A-2-3-4-5 (wheel)
      if (values[0] === 14 && values[1] === 5 && values[2] === 4 &&
          values[3] === 3 && values[4] === 2) {
        return { straight: true, high: 5 };
      }

      return false;
    };

    const getRanks = () => sorted.map(c => RANK_VALUE[c.rank]);

    const countRanks = () => {
      const counts = {};
      getRanks().forEach(v => {
        counts[v] = (counts[v] || 0) + 1;
      });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || b[0] - a[0])
        .map(([rank, count]) => ({ rank: parseInt(rank), count }));
    };

    const flush = isFlush();
    const straight = isStraight();
    const ranked = countRanks();

    let score, name;

    // Royal Flush
    if (flush && straight && straight.high === 14) {
      score = 10000000;
      name = 'Royal Flush';
    }
    // Straight Flush
    else if (flush && straight) {
      score = 9000000 + straight.high * 1000;
      name = 'Straight Flush';
    }
    // Four of a Kind
    else if (ranked[0].count === 4) {
      score = 8000000 + ranked[0].rank * 1000 + ranked[1].rank;
      name = 'Four of a Kind';
    }
    // Full House
    else if (ranked[0].count === 3 && ranked[1].count === 2) {
      score = 7000000 + ranked[0].rank * 1000 + ranked[1].rank;
      name = 'Full House';
    }
    // Flush
    else if (flush) {
      score = 6000000 + getRanks().reduce((a, b, i) => a + b * Math.pow(1000, 4 - i), 0);
      name = 'Flush';
    }
    // Straight
    else if (straight) {
      score = 5000000 + straight.high * 1000;
      name = 'Straight';
    }
    // Three of a Kind
    else if (ranked[0].count === 3) {
      score = 4000000 + ranked[0].rank * 1000 + ranked[1].rank * 100 + ranked[2].rank;
      name = 'Three of a Kind';
    }
    // Two Pair
    else if (ranked[0].count === 2 && ranked[1].count === 2) {
      score = 3000000 + Math.max(ranked[0].rank, ranked[1].rank) * 1000 +
              Math.min(ranked[0].rank, ranked[1].rank) * 100 + ranked[2].rank;
      name = 'Two Pair';
    }
    // One Pair
    else if (ranked[0].count === 2) {
      score = 2000000 + ranked[0].rank * 1000 +
              ranked[1].rank * 100 + ranked[2].rank * 10 + ranked[3].rank;
      name = 'One Pair';
    }
    // High Card
    else {
      score = 1000000 + getRanks().reduce((a, b, i) => a + b * Math.pow(1000, 4 - i), 0);
      name = 'High Card';
    }

    return { rank: name, name, score };
  };

  // ============================================================================
  // LOW HAND EVALUATOR (for Hi-Lo games)
  // ============================================================================

  const evaluateLow = (cards) => {
    // Low qualifier: 8 or better (A-2-3-4-5 through 8-7-6-5-4)
    const values = cards.map(c => {
      const v = RANK_VALUE[c.rank];
      return c.rank === 'A' ? 1 : v; // Ace is low in lo hands
    }).sort((a, b) => a - b);

    // Check if qualifies (8-or-better)
    if (values[4] > 8) return null;

    // Calculate low score (lower is better)
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

  // ============================================================================
  // HAND EVALUATOR WRAPPERS
  // ============================================================================

  const getBestFiveCard = (sevenCards) => {
    const best = [];
    for (let i = 0; i < 21; i++) {
      best.push(evaluateHand([
        sevenCards[i % 7],
        sevenCards[(i * 2) % 7],
        sevenCards[(i * 3) % 7],
        sevenCards[(i * 4) % 7],
        sevenCards[(i * 5) % 7]
      ]));
    }
    return best.reduce((a, b) => (a.score > b.score ? a : b));
  };

  const getBestFiveCardFromCards = (cards) => {
    if (cards.length === 5) return evaluateHand(cards);
    if (cards.length < 5) return null;

    const combos = [];
    const generateCombos = (start, current) => {
      if (current.length === 5) {
        const result = evaluateHand(current);
        if (result) combos.push(result);
        return;
      }
      for (let i = start; i < cards.length; i++) {
        generateCombos(i + 1, [...current, cards[i]]);
      }
    };
    generateCombos(0, []);
    return combos.length ? combos.reduce((a, b) => (a.score > b.score ? a : b)) : null;
  };

  const getBestLowFromCards = (cards) => {
    if (cards.length < 5) return null;

    const combos = [];
    const generateCombos = (start, current) => {
      if (current.length === 5) {
        const result = evaluateLow(current);
        if (result) combos.push(result);
        return;
      }
      for (let i = start; i < cards.length; i++) {
        generateCombos(i + 1, [...current, cards[i]]);
      }
    };
    generateCombos(0, []);

    if (!combos.length) return null;
    return combos.reduce((a, b) => (a.score < b.score ? a : b));
  };

  // ============================================================================
  // EQUITY CALCULATOR
  // ============================================================================

  const calculateEquity = (holeCards, boardCards, numOpponents = 1, gameType = 'nlhe', iterations = 2000) => {
    const isOmaha = gameType.includes('plo');
    const isHiLo = gameType.includes('hilo');

    let wins = 0;
    let ties = 0;
    let lows = 0;
    let highWins = 0;
    let lowWins = 0;

    const usedCards = [...holeCards, ...boardCards];
    const availableDeck = createDeck().filter(c =>
      !usedCards.some(uc => cardsEqual(uc, c))
    );

    const cardsNeeded = 5 - boardCards.length;

    for (let iter = 0; iter < iterations; iter++) {
      const shuffled = shuffleDeck(availableDeck);
      let runoutCards = shuffled.slice(0, cardsNeeded);
      const runoutBoard = [...boardCards, ...runoutCards];

      // For Omaha, need to check best 5 from exactly 2 hole + 3 board
      const getOmahaHands = (holes) => {
        const combos = getValidOmahaHoleCardCombos(holes, 2);
        const allHands = [];
        for (const [h1, h2] of combos) {
          for (let i = 0; i < runoutBoard.length; i++) {
            for (let j = i + 1; j < runoutBoard.length; j++) {
              for (let k = j + 1; k < runoutBoard.length; k++) {
                allHands.push(evaluateHand([h1, h2, runoutBoard[i], runoutBoard[j], runoutBoard[k]]));
              }
            }
          }
        }
        return allHands.length ? allHands.reduce((a, b) => (a.score > b.score ? a : b)) : null;
      };

      let playerHand, oppHands = [];

      if (isOmaha) {
        playerHand = getOmahaHands(holeCards);

        for (let o = 0; o < numOpponents; o++) {
          const oppStartIdx = cardsNeeded + (o * 4);
          if (oppStartIdx + 4 <= shuffled.length) {
            const oppCards = [
              shuffled[oppStartIdx],
              shuffled[oppStartIdx + 1],
              shuffled[oppStartIdx + 2],
              shuffled[oppStartIdx + 3]
            ];
            oppHands.push(getOmahaHands(oppCards));
          }
        }
      } else {
        // Hold'em
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
        if (playerScore > oppHand.score) beats++;
        else if (playerScore < oppHand.score) beaten++;
      }

      if (beaten === 0) {
        if (beats === oppHands.length) wins++;
        else ties++;
      }

      // Hi-Lo analysis
      if (isHiLo) {
        const playerLow = isOmaha ?
          getBestLowFromCards([...holeCards.slice(0, 2), ...runoutBoard]) :
          getBestLowFromCards([...holeCards, ...runoutBoard]);

        if (playerLow) {
          lows++;
          lowWins++;
        }

        if (beats === oppHands.length) {
          highWins++;
        }
      }
    }

    const equity = (wins + ties * 0.5) / iterations * 100;

    return {
      equity: Math.round(equity * 100) / 100,
      highEquity: isHiLo ? Math.round((highWins / iterations) * 10000) / 100 : equity,
      lowEquity: isHiLo ? Math.round((lowWins / iterations) * 10000) / 100 : 0,
      wins,
      ties,
      iterations
    };
  };

  // ============================================================================
  // STARTING HAND CHARTS
  // ============================================================================

  const STARTING_HANDS = {
    early: {
      premium: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AK'],
      strong: ['99', '88', 'AQ', 'AJ', 'KQ', 'KJ'],
      weak: ['ATs', 'KTs', 'QTs']
    },
    middle: {
      premium: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AK', '99', '88', 'AQ'],
      strong: ['AJ', 'KQ', 'KJ', '77', '66'],
      weak: ['AT', 'KT', 'ATs', 'KTs', 'QTs']
    },
    late: {
      premium: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AK', '99', '88', '77', '66', 'AQ', 'AJ', 'KQ'],
      strong: ['KJ', 'AT', 'KT', '55', '44', '33', '22'],
      weak: ['QJ', 'ATs', 'KTs', 'QTs', 'JTs', 'A9s', 'K9s']
    },
    sb: {
      premium: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AK', '99', '88', '77', '66'],
      strong: ['AQ', 'AJ', 'KQ', 'KJ', '55', '44'],
      weak: ['AT', 'KT', 'QT', 'JT', 'A9s', 'K9s', 'Q9s']
    },
    bb: {
      premium: [],
      strong: [],
      weak: []
    }
  };

  const getHandType = (hole1, hole2) => {
    const v1 = RANK_VALUE[hole1.rank];
    const v2 = RANK_VALUE[hole2.rank];
    const isPair = hole1.rank === hole2.rank;
    const isSuited = hole1.suit === hole2.suit;
    const isConnected = Math.abs(v1 - v2) === 1;

    if (isPair) return `${hole1.rank}${hole2.rank}`;

    const sorted = [v1, v2].sort((a, b) => b - a);
    const ranks = [hole1.rank, hole2.rank].sort((a, b) =>
      RANK_VALUE[b] - RANK_VALUE[a]
    );

    let str = ranks[0] + ranks[1];
    if (isSuited) str += 's';
    return str;
  };

  // ============================================================================
  // POT ODDS & STACK ANALYSIS
  // ============================================================================

  const calculatePotOdds = (betToCall, potSize) => {
    if (potSize === 0) return 0;
    return (betToCall / (potSize + betToCall)) * 100;
  };

  const calculateImpliedOdds = (equity, potOdds) => {
    if (equity === 0) return 0;
    return (equity - potOdds) / potOdds * 100;
  };

  const calculateStackToPot = (stackSize, potSize) => {
    if (potSize === 0) return Infinity;
    return stackSize / potSize;
  };

  // ============================================================================
  // DECISION ENGINE
  // ============================================================================

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
      istournament = false,
      tournamentStage = 'early'
    } = gameState;

    const isOmaha = gameType.includes('plo');
    const isHiLo = gameType.includes('hilo');
    let equity = 0;
    let potOdds = 0;
    let action = 'FOLD';
    let raiseAmount = 0;
    let confidence = 0;
    let reasoning = '';

    // ========== PREFLOP ==========
    if (street === 'preflop') {
      if (holeCards.length < 2) {
        return { action: 'FOLD', raiseAmount: 0, confidence: 0, reasoning: 'Not enough hole cards', equity: 0, potOdds: 0 };
      }

      const handType = getHandType(holeCards[0], holeCards[1]);
      const chart = STARTING_HANDS[position] || STARTING_HANDS.middle;

      // Check if hand is in chart
      const isPremium = chart.premium.some(h =>
        h === handType || h === handType.replace('s', '')
      );
      const isStrong = chart.strong.some(h =>
        h === handType || h === handType.replace('s', '')
      );
      const isWeak = chart.weak.some(h =>
        h === handType || h === handType.replace('s', '')
      );

      potOdds = calculatePotOdds(betToCall, potSize);

      if (isPremium) {
        action = 'RAISE';
        confidence = 90;
        raiseAmount = Math.max(potSize * 3, betToCall + potSize);
        reasoning = `Premium hand (${handType}) from ${position}`;
      } else if (isStrong) {
        if (betToCall <= potSize * 0.5) {
          action = 'RAISE';
          confidence = 75;
          raiseAmount = Math.max(potSize * 2, betToCall + potSize);
          reasoning = `Strong hand (${handType}) with good pot odds`;
        } else {
          action = 'CALL';
          confidence = 70;
          reasoning = `Strong hand (${handType}) but expensive`;
        }
      } else if (isWeak) {
        if (betToCall <= potSize * 0.25) {
          action = 'CALL';
          confidence = 50;
          reasoning = `Weak hand (${handType}) but minimal investment`;
        } else {
          action = 'FOLD';
          confidence = 60;
          reasoning = `Weak hand (${handType}), too expensive`;
        }
      } else {
        action = 'FOLD';
        confidence = 70;
        reasoning = `Not in position range for ${position}`;
      }

      // Tournament adjustments
      if (istournament) {
        const stp = calculateStackToPot(stackSize, potSize);

        if (stp < 8 && (isPremium || isStrong)) {
          if (action !== 'FOLD') {
            action = 'RAISE';
            raiseAmount = stackSize;
            confidence = Math.min(95, confidence + 10);
            reasoning += ' (ICM push)';
          }
        } else if (stp < 4) {
          action = 'FOLD';
          confidence = 80;
          reasoning = 'Stack too short, fold equity needed';
        }
      }
    }
    // ========== POSTFLOP ==========
    else {
      if (holeCards.length < 2 || boardCards.length < 3) {
        return { action: 'FOLD', raiseAmount: 0, confidence: 0, reasoning: 'Not enough cards for evaluation', equity: 0, potOdds: 0 };
      }

      const equityResult = calculateEquity(
        holeCards,
        boardCards,
        Math.max(1, numPlayers - 1),
        gameType,
        1500
      );
      equity = equityResult.equity;
      potOdds = calculatePotOdds(betToCall, potSize);

      const stp = calculateStackToPot(stackSize, potSize);

      // Decision logic
      if (betToCall === 0) {
        // Check scenario
        if (equity > 55) {
          action = 'RAISE';
          raiseAmount = potSize * 0.6;
          confidence = Math.min(85, Math.round(equity / 2));
          reasoning = `Strong equity (${Math.round(equity)}%) from position`;
        } else if (equity > 40) {
          action = 'CALL';
          confidence = 50;
          reasoning = 'Moderate equity, check to see further cards';
        } else {
          action = 'CALL';
          confidence = 40;
          reasoning = 'Weak hand, check for pot control';
        }
      } else {
        // Facing a bet
        if (equity >= potOdds + 5) {
          if (equity > 70) {
            action = 'RAISE';
            raiseAmount = Math.min(stackSize * 0.5, betToCall + potSize * 1.5);
            confidence = Math.min(90, Math.round(equity / 2));
            reasoning = `Very strong equity (${Math.round(equity)}%) and positive odds`;
          } else {
            action = 'CALL';
            confidence = Math.min(75, Math.round(equity / 2));
            reasoning = `Equity (${Math.round(equity)}%) exceeds pot odds (${Math.round(potOdds)}%)`;
          }
        } else {
          // Check for draws
          if (street === 'flop' && equity > 35 && stp > 3) {
            action = 'CALL';
            confidence = 45;
            reasoning = `Potential draw with implied odds (equity: ${Math.round(equity)}%)`;
          } else if (equity > potOdds - 3 && betToCall < stackSize * 0.25) {
            action = 'CALL';
            confidence = 40;
            reasoning = `Marginal call with position`;
          } else {
            action = 'FOLD';
            confidence = Math.min(85, 100 - Math.round(equity / 2));
            reasoning = `Insufficient equity (${Math.round(equity)}%) for pot odds (${Math.round(potOdds)}%)`;
          }
        }
      }

      // Tournament adjustments
      if (istournament && stp < 10) {
        if (action === 'FOLD' && equity > 30) {
          action = 'CALL';
          confidence = 60;
          reasoning = 'Tournament - call with reasonable equity';
        } else if (action === 'CALL' && stp < 5 && equity > 40) {
          action = 'RAISE';
          raiseAmount = stackSize;
          confidence = 70;
          reasoning = 'Tournament - shove with draw/moderate equity';
        }
      }
    }

    return {
      action,
      raiseAmount: Math.round(raiseAmount),
      confidence: Math.round(confidence),
      reasoning,
      equity: Math.round(equity * 100) / 100,
      potOdds: Math.round(potOdds * 100) / 100
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

    // Decision making
    getDecision,

    // Utilities
    getHandName,
    calculatePotOdds,
    calculateImpliedOdds,
    calculateStackToPot,
    getHandType
  };
})();

export default PokerBrainEngine;
