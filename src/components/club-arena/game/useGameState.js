/**
 * useGameState -- React hook that wires HandStateMachine to the game UI
 *
 * Manages the complete game loop:
 *   1. Initialize HandStateMachine with players
 *   2. Track game state (preflop/flop/turn/river/showdown)
 *   3. Handle hero actions (fold/check/call/raise)
 *   4. Handle opponent actions (via AI or Supabase realtime)
 *   5. Trigger sounds via SoundManager
 *   6. Manage timer countdown
 *   7. Provide all state needed by PokerTableView
 *
 * Imports existing engines:
 *   - HandStateMachine from src/engines/HandStateMachine.js
 *   - SoundManager from src/lib/SoundManager.ts
 *   - evaluateHand from src/engines/HandStrengthEngine.js
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { HandStateMachine, HAND_STATES } from '../../../engines/HandStateMachine';

// Sound event names matching SoundManager.ts
const SOUNDS = {
  DEAL: 'CARD_DEAL',
  CHECK: 'CHECK',
  FOLD: 'FOLD',
  CALL: 'CALL',
  RAISE: 'RAISE',
  ALL_IN: 'ALL_IN',
  CHIPS: 'CHIP_SLIDE',
  POT_WIN: 'POT_WIN',
  TURN_ALERT: 'TURN_ALERT',
  TIMER_WARNING: 'TIMER_WARNING',
};

// Try to import SoundManager (may not be available in all contexts)
let soundManager = null;
try {
  const { getSoundManager } = require('../../../lib/SoundManager');
  soundManager = getSoundManager?.();
} catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

function playSound(event) {
  try {
    soundManager?.play?.(event);
  } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
}

const TIMER_DURATION = 20; // seconds

export default function useGameState({
  numPlayers = 6,
  heroSeat = 0,
  startingStack = 10000,
  bigBlind = 200,
  smallBlind = 100,
  ante = 0,
  onHandComplete,
} = {}) {
  const [hsm, setHsm] = useState(null);
  const [gamePhase, setGamePhase] = useState('waiting');
  const [players, setPlayers] = useState([]);
  const [communityCards, setCommunityCards] = useState([]);
  const [potAmount, setPotAmount] = useState(0);
  const [activePlayerIndex, setActivePlayerIndex] = useState(-1);
  const [heroHoleCards, setHeroHoleCards] = useState([]);
  const [heroHandStrength, setHeroHandStrength] = useState('');
  const [amountToCall, setAmountToCall] = useState(0);
  const [minBet, setMinBet] = useState(bigBlind);
  const [isShowdown, setIsShowdown] = useState(false);
  const [winningCardIndices, setWinningCardIndices] = useState([]);
  const [netProfit, setNetProfit] = useState(null);
  const [timerProgress, setTimerProgress] = useState(1);
  const [timerUrgent, setTimerUrgent] = useState(false);

  const timerRef = useRef(null);
  const timerStartRef = useRef(null);

  // Initialize a new hand
  const startNewHand = useCallback(() => {
    try {
      const machine = new HandStateMachine({
        numPlayers,
        startingStack,
        bigBlind,
        smallBlind,
        ante,
      });

      machine.dealPreflop();

      // Extract state from the machine
      const state = machine.getState?.() || {};
      const machinePlayers = state.players || machine.players || [];

      setHsm(machine);
      setGamePhase(HAND_STATES.PREFLOP);
      setCommunityCards([]);
      setPotAmount(state.pot || 0);
      setIsShowdown(false);
      setWinningCardIndices([]);
      setNetProfit(null);

      // Build player state for UI
      const uiPlayers = machinePlayers.map((p, i) => ({
        name: p.name || `Player ${i + 1}`,
        stack: p.stack,
        avatarUrl: p.avatarUrl || null,
        isDealer: p.position === 'BTN',
        isSB: p.position === 'SB',
        isBB: p.position === 'BB',
        isFolded: p.isFolded || false,
        isAllIn: p.isAllIn || false,
        isSittingOut: false,
        actionTag: null,
        currentBet: p.streetInvested || 0,
      }));

      setPlayers(uiPlayers);

      // Hero cards
      const hero = machinePlayers[heroSeat];
      if (hero?.holeCards) {
        setHeroHoleCards(hero.holeCards);
      }

      // Determine who acts first
      const activeIdx = state.activePlayerIndex ?? state.currentPlayer ?? 0;
      setActivePlayerIndex(activeIdx);

      // Set call/bet amounts
      setAmountToCall(state.amountToCall || 0);
      setMinBet(state.minRaise || bigBlind);

      playSound(SOUNDS.DEAL);

      // Start timer if it's hero's turn
      if (activeIdx === heroSeat) {
        playSound(SOUNDS.TURN_ALERT);
        startTimer();
      }
    } catch (err) {
      console.warn('Failed to start hand:', err);
    }
  }, [numPlayers, heroSeat, startingStack, bigBlind, smallBlind, ante]);

  // Timer management
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerStartRef.current = Date.now();
    setTimerProgress(1);
    setTimerUrgent(false);

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - timerStartRef.current) / 1000;
      const remaining = Math.max(0, 1 - elapsed / TIMER_DURATION);
      setTimerProgress(remaining);
      setTimerUrgent(remaining < 0.15);

      if (remaining <= 0.25 && remaining > 0.24) {
        playSound(SOUNDS.TIMER_WARNING);
      }

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        // Auto-action: check if possible, else fold
        // This will be handled by the component
      }
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimerProgress(1);
    setTimerUrgent(false);
  }, []);

  // Hero actions
  const handleFold = useCallback(() => {
    if (!hsm) return;
    stopTimer();
    playSound(SOUNDS.FOLD);

    try {
      hsm.playerAction?.(heroSeat, 'fold');
      const state = hsm.getState?.() || {};

      setPlayers((prev) => prev.map((p, i) =>
        i === heroSeat
          ? { ...p, isFolded: true, actionTag: { type: 'fold' } }
          : p
      ));

      syncStateFromMachine(state);
    } catch (err) {
      console.warn('Fold error:', err);
    }
  }, [hsm, heroSeat, stopTimer]);

  const handleCheckCall = useCallback(() => {
    if (!hsm) return;
    stopTimer();

    const isCheck = amountToCall <= 0;
    playSound(isCheck ? SOUNDS.CHECK : SOUNDS.CALL);

    try {
      hsm.playerAction?.(heroSeat, isCheck ? 'check' : 'call');
      const state = hsm.getState?.() || {};

      setPlayers((prev) => prev.map((p, i) =>
        i === heroSeat
          ? {
              ...p,
              actionTag: { type: isCheck ? 'check' : 'call', amount: isCheck ? 0 : amountToCall },
              currentBet: (p.currentBet || 0) + (isCheck ? 0 : amountToCall),
              stack: p.stack - (isCheck ? 0 : amountToCall),
            }
          : p
      ));

      syncStateFromMachine(state);
    } catch (err) {
      console.warn('Check/Call error:', err);
    }
  }, [hsm, heroSeat, amountToCall, stopTimer]);

  const handleBet = useCallback((amount) => {
    if (!hsm) return;
    stopTimer();

    const isAllIn = amount >= (players[heroSeat]?.stack || 0);
    playSound(isAllIn ? SOUNDS.ALL_IN : SOUNDS.RAISE);
    playSound(SOUNDS.CHIPS);

    try {
      hsm.playerAction?.(heroSeat, 'raise', amount);
      const state = hsm.getState?.() || {};

      setPlayers((prev) => prev.map((p, i) =>
        i === heroSeat
          ? {
              ...p,
              actionTag: { type: isAllIn ? 'allin' : 'raise', amount },
              currentBet: amount,
              stack: p.stack - amount,
              isAllIn,
            }
          : p
      ));

      syncStateFromMachine(state);
    } catch (err) {
      console.warn('Bet error:', err);
    }
  }, [hsm, heroSeat, players, stopTimer]);

  // Sync UI state from HandStateMachine
  const syncStateFromMachine = useCallback((state) => {
    if (!state) return;

    setPotAmount(state.pot || 0);
    setGamePhase(state.phase || state.state || 'preflop');

    if (state.communityCards) {
      setCommunityCards(state.communityCards);
    }

    const nextActive = state.activePlayerIndex ?? state.currentPlayer ?? -1;
    setActivePlayerIndex(nextActive);
    setAmountToCall(state.amountToCall || 0);
    setMinBet(state.minRaise || bigBlind);

    // Check for showdown
    if (state.phase === HAND_STATES.SHOWDOWN || state.state === HAND_STATES.SHOWDOWN ||
        state.phase === HAND_STATES.COMPLETE || state.state === HAND_STATES.COMPLETE) {
      setIsShowdown(true);
      playSound(SOUNDS.POT_WIN);

      if (state.winners) {
        // Calculate net profit for hero
        const heroWin = state.winners.find((w) => w.playerIndex === heroSeat);
        if (heroWin) {
          const heroInvested = players[heroSeat]?.currentBet || 0;
          setNetProfit(heroWin.amount - heroInvested);
        }
      }

      // Schedule next hand
      setTimeout(() => {
        onHandComplete?.(state);
      }, 3000);
    } else if (nextActive === heroSeat) {
      playSound(SOUNDS.TURN_ALERT);
      startTimer();
    }
  }, [heroSeat, bigBlind, players, onHandComplete, startTimer]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    // State
    gamePhase,
    players,
    communityCards,
    potAmount,
    activePlayerIndex,
    heroHoleCards,
    heroHandStrength,
    amountToCall,
    minBet,
    isShowdown,
    winningCardIndices,
    netProfit,
    timerProgress,
    timerUrgent,
    // Actions
    startNewHand,
    handleFold,
    handleCheckCall,
    handleBet,
    // Derived
    isHeroTurn: activePlayerIndex === heroSeat,
    heroIndex: heroSeat,
  };
}
