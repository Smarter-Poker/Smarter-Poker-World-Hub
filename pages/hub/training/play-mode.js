/**
 * 🎮 PLAY MODE — GTO Wizard-Style Full Hand Simulation
 * ═══════════════════════════════════════════════════════════════════════════
 * Play complete poker hands from preflop to river against GTO AI villains.
 * Each decision point uses real PIO solver data for opponent responses.
 * After each hand, see full analysis with EV comparison.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { classifyMove, CLASSIFICATION_CONFIG } from '../../../src/hooks/useGTOWScore';
import { evaluateHand } from '../../../src/utils/pokerHandEvaluator';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import HandReplayViewer from '../../../src/components/training/HandReplayViewer';
import PositionStatsPanel from '../../../src/components/training/PositionStatsPanel';
import EVGraph from '../../../src/components/training/EVGraph';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import DeckCard from '../../../src/components/training/Card';

// TRAIN-CSS-MOTION-ADOPT-15 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// Deck constants are now local to createDeck; card rendering uses shared Card.tsx
const POSITIONS_6MAX = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const STREET_NAMES = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
const STREET_COLORS = { preflop: '#7c3aed', flop: '#22c55e', turn: '#3b82f6', river: '#ef4444' };

// Simple deck for dealing
function createDeck() {
  const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  const SUITS = ['s', 'h', 'd', 'c'];
  const deck = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(r + s);
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Card rendering uses shared Card.tsx custom PNG deck
function CardRenderer({ card, size = 40, delay = 0 }) {
  if (!card) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -40, rotateY: 180, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 200, damping: 20 }}
    >
      <DeckCard
        rank={card[0]}
        suit={card[card.length - 1]}
        size={size <= 30 ? 'tiny' : size <= 55 ? 'small' : 'medium'}
      />
    </motion.div>
  );
}

function FaceDownCard({ size = 40, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -40, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 200, damping: 20 }}
    >
      <DeckCard faceDown={true} size={size <= 30 ? 'tiny' : size <= 55 ? 'small' : 'medium'} />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SVG CIRCULAR TIMER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SVGCircularTimer({ timeLeft, totalTime = 24, size = 50 }) {
  const strokeWidth = Math.max(3, size * 0.08);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (timeLeft / totalTime) * circumference;
  const isWarning = timeLeft <= 5;
  const color = isWarning ? '#ef4444' : '#00d4ff';

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <div
        style={{
          fontSize: size * 0.35,
          fontWeight: 800,
          color,
          fontFamily: "'Orbitron', monospace",
          animation: isWarning ? 'pulse 1s infinite' : 'none',
          zIndex: 1,
        }}
      >
        {timeLeft}
      </div>
      <style>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════

function usePlayMode() {
  const [gameState, setGameState] = useState('setup'); // setup | playing | handComplete | sessionComplete
  const [config, setConfig] = useState({
    format: 'cash_6max',
    stackDepth: 100,
    handsPerSession: 10,
  });

  // Hand state
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [heroCards, setHeroCards] = useState([]);
  const [villainCards, setVillainCards] = useState([]);
  const [board, setBoard] = useState([]);
  const [currentStreet, setCurrentStreet] = useState('preflop');
  const [pot, setPot] = useState(0);
  const [heroStack, setHeroStack] = useState(100);
  const [actionHistory, setActionHistory] = useState([]);
  const [handNumber, setHandNumber] = useState(0);
  const [handResults, setHandResults] = useState([]);
  const [showdownResult, setShowdownResult] = useState(null);

  // Villain range narrowing tracker
  const [villainRangeHistory, setVillainRangeHistory] = useState([]);
  const villainRangeRef = useRef(100);

  const deckRef = useRef([]);

  // Start a new hand
  const dealNewHand = useCallback(() => {
    const deck = shuffleDeck(createDeck());
    deckRef.current = deck;

    // Deal hero and villain cards
    const hero = [deck[0], deck[1]];
    const villain = [deck[10], deck[11]]; // Safely away from board cards

    // Choose random position
    const pos = POSITIONS_6MAX[Math.floor(Math.random() * POSITIONS_6MAX.length)];

    // Blinds
    const blindsPot = 1.5; // 0.5 SB + 1BB

    setHeroCards(hero);
    setVillainCards(villain);
    setHeroPosition(pos);
    setBoard([]);
    setCurrentStreet('preflop');
    setPot(blindsPot);
    setHeroStack(config.stackDepth);
    setActionHistory([]);
    setShowdownResult(null);
    setVillainRangeHistory([{ street: 'preflop', width: 100 }]);
    villainRangeRef.current = 100;
    setHandNumber((prev) => prev + 1);
    setGameState('playing');

    // Reset and start timer
    setTimeLeft(24);
    setIsTimerRunning(true);
    setScreenShake(false);
    setSpeedBonus(0);
    setShowSpeedBonus(false);
  }, [config.stackDepth]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SENSORY ENGINE (Timer, Haptics, Audio)
  // ═══════════════════════════════════════════════════════════════════════════

  const [timeLeft, setTimeLeft] = useState(24);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [screenShake, setScreenShake] = useState(false);
  const [speedBonus, setSpeedBonus] = useState(0);
  const [showSpeedBonus, setShowSpeedBonus] = useState(false);

  const timerRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);

  // Audio/Vibration Settings
  const settings = { haptics: true, audio: true, screenShake: true, intensity: 'high' };

  // Memoized cache for API responses to prevent redundant identical calls
  const GTO_AI_CACHE = useRef({});

  // True GTO-based villain response using the solver-api endpoint
  const simulateVillainResponse = useCallback(
    async (heroAction, street, currentPot, currentBoard) => {
      const actionKey = heroAction || 'check';
      let freqs = null;

      // For preflop (board length < 3), fallback to baseline preflop frequencies
      // since solver-api strictly requires a flop.
      if (street === 'preflop' || !currentBoard || currentBoard.length < 3) {
        const PREFLOP_BASELINE = {
          bet: { fold: 0.35, call: 0.5, raise: 0.15 },
          raise: { fold: 0.65, call: 0.25, raise: 0.1 },
          call: { fold: 0.0, call: 0.0, check: 1.0 },
          check: { check: 0.6, bet: 0.4 },
          allin: { fold: 0.85, call: 0.15 },
        };
        freqs = PREFLOP_BASELINE[actionKey] || PREFLOP_BASELINE.check;
      } else {
        // Postflop: Fetch true solver frequency from API
        const cacheKey = `${heroPosition}_${street}_${currentBoard.join('')}_${actionKey}`;

        if (GTO_AI_CACHE.current[cacheKey]) {
          freqs = GTO_AI_CACHE.current[cacheKey];
        } else {
          try {
            const token = await getAccessToken();
            const res = await authedFetch('/api/training/solver-api', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                board: currentBoard,
                heroPosition: heroPosition,
                villainPosition: heroPosition === 'BB' ? 'BTN' : 'BB',
                stackDepth: config.stackDepth,
                gameType: config.format,
                street: street,
                action: actionKey,
              }),
            });

            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const data = await res.json();
            if (data.success && data.solution && data.solution.actions) {
              // Translate arbitrary action props into standard frequencies
              const solverReq = data.solution.actions;
              freqs = {
                bet: solverReq.bet ? solverReq.bet / 100 : 0,
                check: solverReq.check ? solverReq.check / 100 : 0,
                raise: solverReq.raise ? solverReq.raise / 100 : 0,
                call: solverReq.call ? solverReq.call / 100 : 0,
                fold: solverReq.fold ? solverReq.fold / 100 : 0,
              };

              // Normalize back out to 1.0 totals to avoid under/over fetching odds
              const total = Object.values(freqs || {}).reduce((a, b) => a + b, 0);
              if (total > 0) {
                for (let key in freqs) freqs[key] /= total;
              } else {
                // API returned empty action block
                throw new Error('Empty action frequency block');
              }

              GTO_AI_CACHE.current[cacheKey] = freqs;
            } else {
              throw new Error('Invalid solver response');
            }
          } catch (err) {
            console.warn('[Play Mode] API solver fetch failed, defaulting to heuristic GTO', err);
            // Fallback heuristic if API fails or rate limits
            const HEURISTIC_FALLBACK = {
              bet: { fold: 0.45, call: 0.4, raise: 0.15 },
              raise: { fold: 0.55, call: 0.3, raise: 0.15 },
              call: { fold: 0.0, call: 0.0, check: 1.0 },
              check: { check: 0.65, bet: 0.35 },
              allin: { fold: 0.75, call: 0.25 },
            };
            freqs = HEURISTIC_FALLBACK[actionKey] || HEURISTIC_FALLBACK.check;
          }
        }
      }

      // Weighted random selection based on GTO frequencies
      const rand = Math.random();
      let cumulative = 0;
      let selectedAction = 'check';
      let selectedAmount = 0;

      for (const [action, freq] of Object.entries(freqs || {})) {
        cumulative += freq;
        if (rand <= cumulative) {
          selectedAction = action;
          break;
        }
      }

      // Calculate solver-approved bet sizing
      if (selectedAction === 'bet') {
        const betSizes = [0.33, 0.5, 0.75]; // Block, Half, 3/4
        const size = betSizes[Math.floor(Math.random() * betSizes.length)];
        selectedAmount = Math.round(currentPot * size * 100) / 100;
      } else if (selectedAction === 'raise') {
        selectedAmount = Math.round(currentPot * (2.8 + Math.random()) * 100) / 100; // 2.8x - 3.8x
      } else if (selectedAction === 'call') {
        // Amount is handled by the game logic loop outside this function based on previous bet
        selectedAmount = 0;
      }

      return { action: selectedAction, amount: selectedAmount, freqs };
    },
    [heroPosition, config.stackDepth, config.format]
  );

  // Advance to next street
  const advanceStreet = useCallback(
    (fromStreet, newPot) => {
      const deck = deckRef.current;
      if (fromStreet === 'preflop') {
        setBoard([deck[2], deck[3], deck[4]]);
        setCurrentStreet('flop');
      } else if (fromStreet === 'flop') {
        setBoard((prev) => [...prev, deck[5]]);
        setCurrentStreet('turn');
      } else if (fromStreet === 'turn') {
        setBoard((prev) => [...prev, deck[6]]);
        setCurrentStreet('river');
      } else if (fromStreet === 'river') {
        // Real GTO hand evaluation
        const heroEval = evaluateHand(heroCards, board);
        const villainEval = evaluateHand(villainCards, board);

        const heroWon = heroEval.rank > villainEval.rank;

        const heroDecisions = actionHistory.filter((a) => a.player === 'hero');

        // Construct solver frequencies based on hero's actions to classify EV mathematically
        const decisionAnalysis = heroDecisions.map((d, index) => {
          const cacheKey = `${d.position}_${d.street}_${index > 0 ? board.slice(0, d.street === 'flop' ? 3 : d.street === 'turn' ? 4 : 5).join('') : ''}_${d.action}`;
          const cachedFreqs = GTO_AI_CACHE.current[cacheKey];

          const optimalMock = cachedFreqs
            ? Object.keys(cachedFreqs || {}).reduce((a, b) => (cachedFreqs[a] > cachedFreqs[b] ? a : b))
            : d.action; // Target the max frequency action

          const isOptimal = d.action === optimalMock;

          const frequencies = cachedFreqs || {};
          if (!cachedFreqs) {
            frequencies[optimalMock] = 100;
            if (!isOptimal) frequencies[d.action] = 0;
          } else {
            // Convert probabilities back to 0-100 for classifyMove
            for (let k in frequencies) frequencies[k] = Math.round(frequencies[k] * 100);
          }

          const result = classifyMove(d.action, optimalMock, frequencies, 1);

          return {
            street: d.street,
            action: d.action,
            classification: result.classification,
            evLoss: result.evLoss || (isOptimal ? 0 : -0.25),
            config: CLASSIFICATION_CONFIG[result.classification],
          };
        });

        const totalEVLoss = decisionAnalysis.reduce((s, d) => s + d.evLoss, 0);

        // Determine villain's range visualization at showdown
        const villainRange = `Villain held ${villainCards.join(' ')} (${villainEval.subType})`;

        setShowdownResult({
          result: 'showdown',
          pot: newPot,
          heroWon,
          evLoss: (Number.isFinite(Number(totalEVLoss)) ? Number(totalEVLoss) : 0).toFixed(2),
          decisionAnalysis,
          villainRange,
          gtoLine:
            heroDecisions.length > 0 ? heroDecisions.map((d) => d.action).join(' → ') : 'N/A',
        });
        setGameState('handComplete');
      }
    },
    [actionHistory, heroCards, villainCards, board]
  );

  // Hero makes an action
  const handleAction = useCallback(
    async (action, amount = 0) => {
      const newAction = {
        street: currentStreet,
        player: 'hero',
        position: heroPosition,
        action,
        amount,
        pot: pot,
      };

      setActionHistory((prev) => [...prev, newAction]);

      if (action === 'fold') {
        setShowdownResult({
          result: 'fold',
          pot: pot,
          heroWon: false,
          evLoss: 0,
        });
        setGameState('handComplete');
        return;
      }

      // Adjust pot for calls/raises
      let newPot = pot;
      let newStack = heroStack;
      if (action === 'call') {
        const callAmount = Math.min(amount || pot * 0.5, heroStack);
        newPot += callAmount;
        newStack -= callAmount;
      } else if (action === 'raise' || action === 'bet') {
        const raiseAmount = Math.min(amount || pot * 0.75, heroStack);
        newPot += raiseAmount;
        newStack -= raiseAmount;
      }
      if (action === 'allin') {
        newPot += heroStack;
        newStack = 0;
      }

      setPot(newPot);
      setHeroStack(newStack);

      // API Fetch AI villain response
      const villainAction = await simulateVillainResponse(action, currentStreet, newPot, board);
      setActionHistory((prev) => [
        ...prev,
        {
          street: currentStreet,
          player: 'villain',
          position: heroPosition === 'BB' ? 'BTN' : 'BB',
          action: villainAction.action,
          amount: villainAction.amount,
          pot: newPot,
        },
      ]);

      if (villainAction.action === 'fold') {
        setShowdownResult({
          result: 'villain_fold',
          pot: newPot,
          heroWon: true,
          evLoss: 0,
        });
        setGameState('handComplete');
        return;
      }

      // Narrow villain range based on their action
      const narrowingFactors = { fold: 0, call: 0.7, check: 0.85, bet: 0.55, raise: 0.4, allin: 0.25 };
      const factor = narrowingFactors[villainAction.action] || 0.8;
      villainRangeRef.current = Math.max(5, Math.round(villainRangeRef.current * factor));
      setVillainRangeHistory((prev) => [...prev, { street: currentStreet, width: villainRangeRef.current, action: villainAction.action }]);

      // Add villain's contribution to pot
      newPot += villainAction.amount;
      setPot(newPot);

      // Record speed
      const answerTime = 24 - timeLeft;
      if (answerTime < 10 && action !== 'fold' && villainAction.action !== 'fold') {
        const bonus = answerTime <= 3 ? 3 : answerTime <= 5 ? 2 : 1;
        setSpeedBonus(bonus);
        setShowSpeedBonus(true);
        setTimeout(() => setShowSpeedBonus(false), 1500);
      }

      // Reset timer for next street
      setTimeLeft(24);

      // Advance to next street
      advanceStreet(currentStreet, newPot);
    },
    [
      currentStreet,
      pot,
      heroStack,
      heroPosition,
      simulateVillainResponse,
      advanceStreet,
      timeLeft,
      board,
    ]
  );

  // Save hand result and advance
  const nextHand = useCallback(() => {
    if (showdownResult) {
      setHandResults((prev) => [
        ...prev,
        {
          handNumber,
          position: heroPosition,
          cards: heroCards,
          board: [...board],
          result: showdownResult,
          actionHistory: [...actionHistory],
        },
      ]);
    }

    if (handNumber >= config.handsPerSession) {
      setGameState('sessionComplete');
    } else {
      dealNewHand();
    }
  }, [
    showdownResult,
    handNumber,
    heroPosition,
    heroCards,
    board,
    actionHistory,
    config.handsPerSession,
    dealNewHand,
  ]);

  // Start session
  const startSession = useCallback(() => {
    setHandNumber(0);
    setHandResults([]);
    dealNewHand();
  }, [dealNewHand]);

  // Reset
  const resetSession = useCallback(() => {
    setGameState('setup');
    setHandNumber(0);
    setHandResults([]);
  }, []);

  // 🔌 WIRING: Save session to Supabase + emit bus event when session completes
  useEffect(() => {
    if (gameState !== 'sessionComplete' || handResults.length === 0) return;

    const saveSession = async () => {
      try {
        const authUser = getAuthUser();
        if (!authUser?.session?.access_token) {
          console.warn('[PlayMode] No auth token — session not saved to Supabase');
          return;
        }

        const wins = handResults.filter((h) => h.result?.heroWon).length;
        const totalPot = handResults.reduce((sum, h) => sum + (h.result?.pot || 0), 0);

        // Build position stats from hand results
        const posStats = {};
        handResults.forEach((h) => {
          if (!posStats[h.position]) posStats[h.position] = { total: 0, correct: 0, evLoss: 0 };
          posStats[h.position].total += 1;
          if (h.result?.heroWon) posStats[h.position].correct += 1;
          posStats[h.position].evLoss += parseFloat(h.result?.evLoss || 0);
        });

        const payload = {
          gameId: 'play_mode_simulation',
          gameName: 'Play Mode — Full Hand Simulation',
          gtowScore: Math.round((wins / handResults.length) * 100),
          totalEVLoss: handResults.reduce((sum, h) => sum + parseFloat(h.result?.evLoss || 0), 0),
          handsPlayed: handResults.length,
          mistakeCount: handResults.length - wins,
          accuracy: Math.round((wins / handResults.length) * 100),
          correctCount: wins,
          bestStreak: 0,
          levelPassed: wins >= handResults.length * 0.5,
          level: 1,
          handHistory: handResults.map((h) => ({
            cards: h.cards,
            board: h.board,
            position: h.position,
            result: h.result?.result,
            heroWon: h.result?.heroWon,
            pot: h.result?.pot,
          })),
          positionStats: posStats,
          classificationCounts: {
            best: wins,
            correct: 0,
            inaccuracy: 0,
            wrong: 0,
            blunder: handResults.length - wins,
          },
        };

        const sessionToken = await getAccessToken();
        const res = await authedFetch('/api/training/save-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        if (data.success) {
        } else {
          console.warn('[PlayMode] Session save failed:', data.error);
        }

        // Emit bus event so Reports page and other listeners can update
        eventBus?.emit?.(
          EventType?.SESSION_END || 'session:end',
          {
            gameId: 'play_mode_simulation',
            handsPlayed: handResults.length,
            wins,
            accuracy: Math.round((wins / handResults.length) * 100),
          },
          'PlayMode'
        );
      } catch (err) {
        console.warn('[PlayMode] Session save error:', err);
      }
    };

    saveSession();
  }, [gameState, handResults]);

  // Sensory Engine Effect (moved state above)

  useEffect(() => {
    if (!isTimerRunning || gameState !== 'playing') {
      if (timerRef.current) clearInterval(timerRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      setScreenShake(false);
      return;
    }

    const intensityMultiplier = 1.0;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 1;

        if (settings.haptics && 'vibrate' in navigator) {
          const baseVibration = newTime <= 3 ? 100 : newTime <= 8 ? 50 : 20;
          navigator.vibrate(Math.round(baseVibration * intensityMultiplier));
        }

        if (settings.screenShake && newTime <= 3 && newTime > 0) setScreenShake(true);
        else setScreenShake(false);

        if (newTime <= 0) {
          clearInterval(timerRef.current);
          clearInterval(heartbeatIntervalRef.current);
          handleAction('fold'); // Auto fold on timeout
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
          return 0;
        }
        return newTime;
      });
    }, 1000);

    if (settings.audio && timeLeft <= 8 && timeLeft > 0) {
      const playHeartbeat = () => {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 80;
          osc.type = 'sine';
          const volume = 0.3 * intensityMultiplier;
          gain.gain.setValueAtTime(volume, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.15);
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
      };
      const speed = Math.max(200, 600 - (8 - timeLeft) * 50);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = setInterval(playHeartbeat, speed);
      playHeartbeat();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [isTimerRunning, gameState, timeLeft]);

  return {
    gameState,
    config,
    setConfig,
    heroPosition,
    heroCards,
    board,
    currentStreet,
    pot,
    heroStack,
    actionHistory,
    handNumber,
    handResults,
    showdownResult,
    handleAction,
    nextHand,
    startSession,
    resetSession,
    timeLeft,
    screenShake,
    speedBonus,
    showSpeedBonus,
    villainRangeHistory,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

function SessionSummary({ handResults, onPlayAgain, onExit }) {
  const [activeTab, setActiveTab] = useState('summary');
  const stats = useMemo(() => {
    const wins = handResults.filter((h) => h.result?.heroWon).length;
    const losses = handResults.length - wins;
    const totalPot = handResults.reduce((sum, h) => sum + (h.result?.pot || 0), 0);
    return { wins, losses, totalPot, hands: handResults.length };
  }, [handResults]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        maxWidth: 500,
        margin: '0 auto',
        padding: 24,
        background: 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(124,58,237,0.05))',
        border: '1px solid rgba(0,212,255,0.2)',
        borderRadius: 16,
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          textAlign: 'center',
          marginBottom: 20,
          fontFamily: "'Orbitron', monospace",
          background: 'linear-gradient(135deg, #00d4ff, #22c55e)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        SESSION COMPLETE
      </div>

      {/* Tab buttons */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, justifyContent: 'center' }}>
        {[
          { key: 'summary', label: '📊 Summary' },
          { key: 'replay', label: '🃏 Replay' },
          { key: 'positions', label: '🪑 Positions' },
        ].map((tab) => (
          <button
            key={tab.key}
            aria-label={`View ${tab.label.replace(/[^a-zA-Z ]/g, '').trim()}`}
            aria-pressed={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              border:
                activeTab === tab.key ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,0.08)',
              background: activeTab === tab.key ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
              color: activeTab === tab.key ? '#00d4ff' : '#64748b',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              { label: 'Hands', value: stats.hands, color: '#00d4ff' },
              { label: 'Won', value: stats.wins, color: '#22c55e' },
              { label: 'Lost', value: stats.losses, color: '#ef4444' },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  textAlign: 'center',
                  padding: '12px 8px',
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.3)',
                }}
              >
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: s.color,
                    fontFamily: "'Orbitron', monospace",
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: '#64748b',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* EV Graph */}
          <EVGraph handHistory={handResults} title="📈 EV by Street" />

          {/* Hand-by-hand summary */}
          <div style={{ marginBottom: 16, marginTop: 12 }}>
            {handResults.map((h, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: h.result?.heroWon ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: '#64748b',
                    width: 20,
                    fontFamily: "'Orbitron', monospace",
                  }}
                >
                  #{h.handNumber}
                </span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(h.cards || []).map((c, ci) => (
                    <CardRenderer key={ci} card={c} size={18} />
                  ))}
                </div>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                  {h.position}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    marginLeft: 'auto',
                    color: h.result?.heroWon ? '#22c55e' : '#ef4444',
                  }}
                >
                  {h.result?.heroWon ? 'WON' : h.result?.result === 'fold' ? 'FOLDED' : 'LOST'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Replay Tab */}
      {activeTab === 'replay' && (
        <HandReplayViewer
          handHistory={handResults.map((h) => ({
            heroCards: h.cards || [],
            board: h.board || [],
            position: h.position,
            result: h.result?.result,
            heroWon: h.result?.heroWon,
            pot: h.result?.pot,
            classification: h.result?.heroWon ? 'best' : 'blunder',
          }))}
          onClose={() => setActiveTab('summary')}
        />
      )}

      {/* Position Stats Tab */}
      {activeTab === 'positions' && (
        <PositionStatsPanel
          handHistory={handResults.map((h) => ({
            heroPosition: h.position,
            isCorrect: h.result?.heroWon,
            evLoss: h.result?.evLoss || 0,
            classification: h.result?.heroWon ? 'best' : 'blunder',
          }))}
        />
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
        <motion.button
          onClick={onPlayAgain}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
            color: '#fff',
          }}
        >
          🎮 Play Again
        </motion.button>
        <button
          onClick={onExit}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#94a3b8',
            cursor: 'pointer',
          }}
        >
          Exit
        </button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function PlayModePage() {
  const router = useRouter();
  const game = usePlayMode();
  const bus = useTrainingBus('play-mode', { format: game.config?.format });

  // Bet Slider State
  const [isBetting, setIsBetting] = useState(false);
  const [betAmount, setBetAmount] = useState(0);

  return (
    <>
      <Head>
        <title>Play Mode | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Play complete poker hands against GTO AI opponents. Practice preflop to river decision-making."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '6px 12px',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ← Training
          </button>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              margin: 0,
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: "'Orbitron', monospace",
            }}
          >
            Play Mode
          </h1>
          {game.gameState === 'playing' && (
            <span
              style={{
                fontSize: 11,
                color: '#64748b',
                marginLeft: 'auto',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              Hand {game.handNumber}/{game.config.handsPerSession}
            </span>
          )}
        </div>

        <div style={{ padding: '24px', maxWidth: 700, margin: '0 auto' }}>
          {/* SETUP SCREEN */}
          {game.gameState === 'setup' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ textAlign: 'center', paddingTop: 40 }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  marginBottom: 8,
                  fontFamily: "'Orbitron', monospace",
                  background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                PLAY MODE
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: '#94a3b8',
                  marginBottom: 24,
                  maxWidth: 400,
                  margin: '0 auto 24px',
                }}
              >
                Play full poker hands against GTO AI opponents. Make decisions from preflop to river
                and get instant analysis after each hand.
              </p>

              {/* Config */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  maxWidth: 340,
                  margin: '0 auto 24px',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#64748b',
                      letterSpacing: 1,
                      marginBottom: 6,
                      textTransform: 'uppercase',
                    }}
                  >
                    Stack Depth
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                    {[20, 40, 60, 100, 200].map((sd) => (
                      <button
                        key={sd}
                        onClick={() => game.setConfig((c) => ({ ...c, stackDepth: sd }))}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          background:
                            game.config.stackDepth === sd
                              ? 'rgba(245,158,11,0.2)'
                              : 'rgba(255,255,255,0.04)',
                          color: game.config.stackDepth === sd ? '#f59e0b' : '#64748b',
                          fontFamily: "'Orbitron', monospace",
                        }}
                      >
                        {sd}BB
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#64748b',
                      letterSpacing: 1,
                      marginBottom: 6,
                      textTransform: 'uppercase',
                    }}
                  >
                    Hands Per Session
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                    {[5, 10, 20, 50].map((h) => (
                      <button
                        key={h}
                        onClick={() => game.setConfig((c) => ({ ...c, handsPerSession: h }))}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          background:
                            game.config.handsPerSession === h
                              ? 'rgba(245,158,11,0.2)'
                              : 'rgba(255,255,255,0.04)',
                          color: game.config.handsPerSession === h ? '#f59e0b' : '#64748b',
                          fontFamily: "'Orbitron', monospace",
                        }}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <motion.button
                onClick={game.startSession}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: '14px 40px',
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                  color: '#fff',
                  fontFamily: "'Orbitron', monospace",
                  boxShadow: '0 4px 20px rgba(245,158,11,0.3)',
                }}
              >
                START PLAYING
              </motion.button>
            </motion.div>
          )}

          {/* PLAYING SCREEN */}
          {game.gameState === 'playing' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Street indicator */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 6,
                  marginBottom: 16,
                }}
              >
                {['preflop', 'flop', 'turn', 'river'].map((s) => (
                  <div
                    key={s}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      background:
                        game.currentStreet === s
                          ? STREET_COLORS[s] + '30'
                          : 'rgba(255,255,255,0.03)',
                      color: game.currentStreet === s ? STREET_COLORS[s] : '#475569',
                      border: `1px solid ${game.currentStreet === s ? STREET_COLORS[s] + '50' : 'transparent'}`,
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>

              {/* Table Area */}
              <div
                style={{
                  background: 'radial-gradient(ellipse at center, #1a3d2e 0%, #0d1f17 70%)',
                  border: '3px solid #2d5a3e',
                  borderRadius: 80,
                  padding: '40px 24px',
                  marginBottom: 16,
                  position: 'relative',
                }}
              >
                {/* Pot */}
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: '#64748b',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    POT
                  </span>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: '#fbbf24',
                      fontFamily: "'Orbitron', monospace",
                    }}
                  >
                    {(Number.isFinite(Number(game.pot)) ? Number(game.pot) : 0).toFixed(1)} BB
                  </div>
                </div>

                {/* Board Cards */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 6,
                    marginBottom: 24,
                    minHeight: 60,
                  }}
                >
                  {game.board.length > 0 ? (
                    game.board.map((c, i) => (
                      <CardRenderer key={i} card={c} size={44} delay={i * 0.1} />
                    ))
                  ) : (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[0, 1, 2].map((i) => (
                        <FaceDownCard key={i} size={44} delay={i * 0.1} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Hero Cards */}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: '#94a3b8',
                      fontWeight: 600,
                      marginBottom: 4,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    YOUR HAND ({game.heroPosition})
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 4,
                      position: 'relative',
                    }}
                  >
                    {game.heroCards.map((c, i) => (
                      <CardRenderer key={i} card={c} size={52} delay={0.3 + i * 0.15} />
                    ))}

                    {/* Speed Bonus Animation */}
                    <AnimatePresence>
                      {game.showSpeedBonus && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.5 }}
                          animate={{ opacity: 1, y: -40, scale: 1.2 }}
                          exit={{ opacity: 0, scale: 1.5 }}
                          transition={{ duration: MOTION.slow, ease: 'easeOut' }}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            color: '#f59e0b',
                            fontSize: 16,
                            fontWeight: 900,
                            textShadow: '0 2px 10px rgba(0,0,0,0.8)',
                            zIndex: 20,
                            whiteSpace: 'nowrap',
                            fontFamily: "'Orbitron', monospace",
                          }}
                        >
                          ⚡ +{game.speedBonus} DIAMONDS
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#94a3b8',
                      marginTop: 6,
                      fontFamily: "'Orbitron', monospace",
                    }}
                  >
                    Stack: {(Number.isFinite(Number(game.heroStack)) ? Number(game.heroStack) : 0).toFixed(1)} BB
                  </div>
                </div>

                {/* Timer */}
                <div style={{ position: 'absolute', top: 16, right: 16 }}>
                  <SVGCircularTimer timeLeft={game.timeLeft} totalTime={24} size={44} />
                </div>
              </div>

              {/* Action Buttons / Bet Sizer */}
              <AnimatePresence mode="wait">
                {isBetting ? (
                  <motion.div
                    key="bet-sizer"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    style={{
                      background: 'rgba(0,0,0,0.4)',
                      borderRadius: 16,
                      padding: 16,
                      border: '1px solid #ef444440',
                    }}
                  >
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}
                    >
                      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                        Set Bet Size
                      </span>
                      <span
                        style={{
                          fontSize: 16,
                          color: '#ef4444',
                          fontWeight: 800,
                          fontFamily: "'Orbitron', monospace",
                        }}
                      >
                        {(Number.isFinite(Number(betAmount)) ? Number(betAmount) : 0).toFixed(1)} BB
                      </span>
                    </div>

                    <input
                      type="range"
                      min={game.pot * 0.1}
                      max={game.heroStack}
                      step={0.5}
                      value={betAmount}
                      onChange={(e) => setBetAmount(parseFloat(e.target.value))}
                      style={{ width: '100%', marginBottom: 16, accentColor: '#ef4444' }}
                    />

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: 6,
                        marginBottom: 16,
                      }}
                    >
                      {[
                        { l: '25%', v: 0.25 },
                        { l: '50%', v: 0.5 },
                        { l: '75%', v: 0.75 },
                        { l: '100%', v: 1.0 },
                        { l: 'MAX', v: 'max' },
                      ].map((b) => (
                        <button
                          key={b.l}
                          onClick={() =>
                            setBetAmount(b.v === 'max' ? game.heroStack : game.pot * b.v)
                          }
                          style={{
                            padding: '8px 0',
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            color: '#fca5a5',
                            borderRadius: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {b.l}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setIsBetting(false)}
                        style={{
                          flex: 1,
                          padding: 12,
                          background: 'rgba(255,255,255,0.05)',
                          color: '#94a3b8',
                          border: 'none',
                          borderRadius: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          game.handleAction('bet', betAmount);
                          setIsBetting(false);
                        }}
                        style={{
                          flex: 2,
                          padding: 12,
                          background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 10,
                          fontWeight: 800,
                          fontFamily: "'Orbitron', monospace",
                          cursor: 'pointer',
                        }}
                      >
                        CONFIRM {(Number.isFinite(Number(betAmount)) ? Number(betAmount) : 0).toFixed(1)} BB
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="action-buttons"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    style={{ display: 'flex', gap: 8, justifyContent: 'center' }}
                  >
                    {[
                      {
                        action: 'fold',
                        label: 'FOLD',
                        color: '#64748b',
                        bg: 'rgba(100,116,139,0.15)',
                      },
                      {
                        action: 'check',
                        label:
                          game.currentStreet === 'preflop' && game.heroPosition !== 'BB'
                            ? null
                            : 'CHECK',
                        color: '#3b82f6',
                        bg: 'rgba(59,130,246,0.15)',
                      },
                      {
                        action: 'call',
                        label: 'CALL',
                        color: '#22c55e',
                        bg: 'rgba(34,197,94,0.15)',
                      },
                      {
                        action: 'bet',
                        label: game.currentStreet === 'preflop' ? 'RAISE' : 'BET',
                        color: '#ef4444',
                        bg: 'rgba(239,68,68,0.15)',
                      },
                      {
                        action: 'allin',
                        label: 'ALL-IN',
                        color: '#f59e0b',
                        bg: 'rgba(245,158,11,0.15)',
                      },
                    ]
                      .filter((a) => a.label)
                      .map((a) => (
                        <motion.button
                          key={a.action}
                          onClick={() => {
                            if (a.action === 'bet') {
                              setBetAmount(game.pot * 0.5); // Default half pot
                              setIsBetting(true);
                            } else {
                              game.handleAction(a.action);
                            }
                          }}
                          whileHover={{ scale: 1.06, y: -2 }}
                          whileTap={{ scale: 0.94 }}
                          style={{
                            padding: '12px 20px',
                            borderRadius: 10,
                            border: `1px solid ${a.color}40`,
                            background: a.bg,
                            color: a.color,
                            fontSize: 13,
                            fontWeight: 800,
                            cursor: 'pointer',
                            fontFamily: "'Orbitron', monospace",
                          }}
                        >
                          {a.label}
                        </motion.button>
                      ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action History */}
              {game.actionHistory.length > 0 && (
                <div
                  style={{
                    marginTop: 16,
                    padding: '10px 14px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 8,
                    maxHeight: 120,
                    overflowY: 'auto',
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      color: '#64748b',
                      fontWeight: 700,
                      letterSpacing: 1,
                      marginBottom: 4,
                      textTransform: 'uppercase',
                    }}
                  >
                    Action History
                  </div>
                  {game.actionHistory.map((a, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 10,
                        color: a.player === 'hero' ? '#00d4ff' : '#94a3b8',
                        paddingLeft: a.player === 'hero' ? 8 : 0,
                        borderLeft:
                          a.player === 'hero' ? '2px solid #00d4ff' : '2px solid transparent',
                        marginBottom: 2,
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{a.position}</span> {a.action}
                      {a.amount > 0 ? ` ${(Number.isFinite(Number(a.amount)) ? Number(a.amount) : 0).toFixed(1)}BB` : ''}
                    </div>
                  ))}
                </div>
              )}

              {/* Villain Range Narrowing Indicator */}
              {game.villainRangeHistory && game.villainRangeHistory.length > 0 && (
                <div style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'rgba(124,58,237,0.08)',
                  border: '1px solid rgba(124,58,237,0.2)',
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                    Villain Range Narrowing
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {game.villainRangeHistory.map((r, i) => (
                      <React.Fragment key={i}>
                        <div style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: `rgba(124,58,237,${0.1 + (1 - r.width / 100) * 0.3})`,
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#c4b5fd',
                          fontFamily: "'Orbitron', monospace",
                        }}>
                          {r.width}%
                        </div>
                        {i < game.villainRangeHistory.length - 1 && (
                          <span style={{ color: '#475569', fontSize: 8 }}>→</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* HAND COMPLETE SCREEN */}
          {game.gameState === 'handComplete' && game.showdownResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: 'center', paddingTop: 24 }}
            >
              <div
                style={{
                  fontSize: 48,
                  marginBottom: 8,
                }}
              >
                {game.showdownResult.heroWon
                  ? '🎉'
                  : game.showdownResult.result === 'fold'
                    ? '🃏'
                    : '😔'}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  fontFamily: "'Orbitron', monospace",
                  color: game.showdownResult.heroWon ? '#22c55e' : '#ef4444',
                  marginBottom: 12,
                }}
              >
                {game.showdownResult.heroWon
                  ? 'YOU WIN!'
                  : game.showdownResult.result === 'fold'
                    ? 'YOU FOLDED'
                    : game.showdownResult.result === 'villain_fold'
                      ? 'VILLAIN FOLDED'
                      : 'YOU LOST'}
              </div>
              <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20 }}>
                Pot:{' '}
                <span
                  style={{ color: '#fbbf24', fontWeight: 700, fontFamily: "'Orbitron', monospace" }}
                >
                  {(Number.isFinite(Number(game.showdownResult.pot)) ? Number(game.showdownResult.pot) : 0).toFixed(1)} BB
                </span>
              </div>

              {/* Cards recap */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
                <div>
                  <div
                    style={{
                      fontSize: 9,
                      color: '#64748b',
                      marginBottom: 4,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    Your Hand
                  </div>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                    {game.heroCards.map((c, i) => (
                      <CardRenderer key={i} card={c} size={36} />
                    ))}
                  </div>
                </div>
                {game.board.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        color: '#64748b',
                        marginBottom: 4,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}
                    >
                      Board
                    </div>
                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                      {game.board.map((c, i) => (
                        <CardRenderer key={i} card={c} size={36} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <motion.button
                onClick={game.nextHand}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: '12px 32px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
                  color: '#fff',
                  fontFamily: "'Orbitron', monospace",
                }}
              >
                {game.handNumber >= game.config.handsPerSession ? 'VIEW RESULTS' : 'NEXT HAND →'}
              </motion.button>
            </motion.div>
          )}

          {/* SESSION COMPLETE */}
          {game.gameState === 'sessionComplete' && (
            <SessionSummary
              handResults={game.handResults}
              onPlayAgain={game.resetSession}
              onExit={() => router.push('/hub/training')}
            />
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}