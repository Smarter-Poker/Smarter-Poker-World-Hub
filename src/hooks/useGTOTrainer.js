/**
 * 🎰 USE MILLIONAIRE GAME — GTO Wizard-Style Training Flow Controller
 * ═══════════════════════════════════════════════════════════════════════════
 * Manages the training game with GTOW scoring integration:
 * - Fetches questions via API (PIO/CHART/SCENARIO engines)
 * - Tracks answers and enforces no-repeat logic
 * - Calculates GTOW Score, EV loss, and 5-tier move classification
 * - Exposes scoring metrics for GTO Wizard-style feedback UI
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getAuthUser, getSessionToken } from '../lib/authUtils';
import TRAINING_CONFIG, {
  checkLevelPassed,
  getRequiredCorrect,
  getDiamondReward,
} from '../config/trainingConfig';
import useGTOWScore, { simulateGTOFrequencies, classifyMove } from './useGTOWScore';
import { eventBus } from '../engine/EventBus';
import { getScoreGrade, getScoreColor } from '../engines/GTOScoreEngine';
import { trainingSounds } from '../utils/trainingSounds';
import { deterministicEngine } from '../engines/DeterministicGTOEngine';

// ═══ Phase GTO-CLONE: SessionTracker for Supabase persistence ═══
import { createSessionRecord, createMoveRecords, saveSession } from '../engines/SessionTracker';
// ═══ Phase GTO-CLONE: DifficultyEngine for Simple/Grouped/Standard modes ═══
import { simplifyActions, DIFFICULTY, toEngineDifficulty } from '../engines/DifficultyEngine';
// ═══ Phase GTO-CLONE: ActionTreeEngine for GTO action mapping + scoring ═══
import { scoreAction, mapToSolverAction } from '../engines/ActionTreeEngine';

/**
 * Apply difficulty-based option simplification (GTO Wizard Simple/Grouped/Standard)
 * Simple: Bet/Check/Fold (3 options max)
 * Grouped: Small/Medium/Large/Check/Fold (5 options max)
 * Standard: Full solver sizings (unchanged)
 */
function applyDifficultyToQuestion(question, difficultyMode) {
  if (!question || !question.options) return question;
  // GTOW parity #21: translate the UI vocabulary (beginner/standard/expert)
  // into the engine's (simple/grouped/standard) before doing anything. The
  // old code compared the RAW value against 'standard', which meant the UI's
  // middle tier skipped simplification entirely and 'expert' was simplified
  // MORE than it should have been.
  const engineMode = toEngineDifficulty(difficultyMode);
  if (engineMode === DIFFICULTY.STANDARD) return question;
  try {
    const potSize = question.scenario?.pot || 10;
    // Normalize each option to the canonical action token simplifyActions matches on
    // ('fold'|'check'|'call'|'bet'|'raise'|'allin') — raw ids like 'b33'/'x'/'f' or
    // display text like 'Bet 33%' would otherwise never match and get dropped.
    const tokenOf = (o) => {
      const id = String(o.id || '').toLowerCase();
      const text = String(o.text || '').toLowerCase();
      if (id === 'f' || id === 'fold' || id === 'simple_fold' || text.startsWith('fold')) return 'fold';
      if (id === 'x' || id === 'check' || text.startsWith('check')) return 'check';
      if (id === 'c' || id === 'call' || text.startsWith('call')) return 'call';
      if (id === 'allin' || id === 'push' || text.includes('all-in') || text.includes('all in') || text.startsWith('push') || text.startsWith('shove') || text.startsWith('jam')) return 'allin';
      if (/^r\d*$/.test(id) || id === 'raise' || text.startsWith('raise') || text.includes('3-bet') || text.includes('4-bet')) return 'raise';
      if (/^b\d*$/.test(id) || id === 'bet' || text.startsWith('bet')) return 'bet';
      return text.split(' ')[0] || id;
    };
    const enriched = question.options.map((o) => ({
      id: o.id,
      text: o.text,
      action: tokenOf(o),
      frequency: question.gtoFrequencies?.[o.id] || 0,
    }));
    const simplified = simplifyActions(enriched, engineMode, potSize);
    if (simplified && simplified.length > 0) {
      // simplifyActions returns { action, label, amount?, mappedFrom?, isSimplified }
      // where mappedFrom is an array of the original option objects it collapsed.
      // Passive entries (check/call/fold) carry no mappedFrom — recover their
      // original option ids via the canonical token.
      const idsByToken = {};
      for (const o of enriched) {
        if (!idsByToken[o.action]) idsByToken[o.action] = [];
        idsByToken[o.action].push(o.id);
      }
      const memberIds = (s) => {
        const fromMapped = (s.mappedFrom || [])
          .map((m) => (typeof m === 'string' ? m : m.id))
          .filter(Boolean);
        if (fromMapped.length) return fromMapped;
        if (s.isSimplified && (s.label === 'Raise' || s.label === 'Bet')) {
          return [
            ...(idsByToken.bet || []),
            ...(idsByToken.raise || []),
            ...(idsByToken.allin || []),
          ];
        }
        return idsByToken[s.action] || [];
      };
      const newOptions = simplified.map((s) => ({
        id: s.id || s.action,
        text: s.text || s.label,
      }));
      // Remap correctAnswer onto the simplified option that covers the original id
      const origCorrect = question.correctAnswer;
      let newCorrect = origCorrect;
      const owner = simplified.find(
        (s) =>
          memberIds(s).includes(origCorrect) || s.action === origCorrect || s.id === origCorrect
      );
      if (owner) newCorrect = owner.id || owner.action;
      // Fail-safe: if the correct answer cannot be mapped onto a simplified
      // option, serve the question unsimplified rather than unwinnable.
      if (!newOptions.some((o) => o.id === newCorrect)) return question;
      // Aggregate frequencies onto simplified ids
      let newFreqs = question.gtoFrequencies;
      if (question.gtoFrequencies) {
        newFreqs = {};
        for (const s of simplified) {
          const key = s.id || s.action;
          newFreqs[key] = memberIds(s).reduce(
            (sum, m) => sum + (question.gtoFrequencies[m] || 0),
            0
          );
        }
      }
      // GTOW parity #32: aggregate per-action EVs onto the simplified ids too.
      // Options, correctAnswer and gtoFrequencies were all remapped above, but
      // actionEVs was passed through untouched by the `...question` spread —
      // so after any Simple/Grouped simplification every EV lookup (the
      // per-button EV chips, the action-vs-optimal panel, and
      // calculateRealEVLoss) missed, because it was keyed by original solver
      // ids like 'b33' while the UI now asked for 'bet'.
      //
      // A grouped option means "play this group's mix", so its EV is the
      // frequency-weighted average of its members. When every member sits at
      // 0% there is no mix to weight, and the group's value is the best you
      // could do inside it — so fall back to the max.
      const remapEVs = (evs) => {
        if (!evs || typeof evs !== 'object') return evs;
        const out = {};
        for (const s of simplified) {
          const key = s.id || s.action;
          const members = memberIds(s).filter((m) => typeof evs[m] === 'number');
          if (members.length === 0) continue;
          let weighted = 0;
          let totalFreq = 0;
          let best = -Infinity;
          for (const m of members) {
            const f = question.gtoFrequencies?.[m] || 0;
            weighted += evs[m] * f;
            totalFreq += f;
            if (evs[m] > best) best = evs[m];
          }
          const value = totalFreq > 0 ? weighted / totalFreq : best;
          out[key] = Math.round(value * 100) / 100;
        }
        return out;
      };

      const newActionEVs = remapEVs(question.actionEVs);
      const newEvData = question.evData
        ? { ...question.evData, actionEVs: remapEVs(question.evData.actionEVs) }
        : question.evData;

      return {
        ...question,
        options: newOptions,
        correctAnswer: newCorrect,
        gtoFrequencies: newFreqs,
        actionEVs: newActionEVs,
        evData: newEvData,
        _originalOptions: question.options,
        _originalCorrect: origCorrect,
        _originalFrequencies: question.gtoFrequencies,
        _originalActionEVs: question.actionEVs,
        _difficultyApplied: difficultyMode,
      };
    }
  } catch (e) {
    console.warn('[App] Handled exception:', e?.message || e);
  }
  return question;
}


/**
 * roadmap #7 — HAND SELECTION.
 * GTO Wizard lets you filter out trivial spots, or drill only close decisions.
 * A trivial spot is one the solver plays almost purely (one action at ~100%):
 * you learn nothing from being told to fold 72o. A close decision is one where
 * the top two actions sit within a few points of each other -- the spots that
 * actually decide winrate.
 *
 * Applied to the preloaded batch so it costs nothing per hand. Never returns an
 * empty queue: if a filter would leave nothing, the unfiltered set is served
 * rather than stranding the player on an empty session.
 *
 *   'all'      -> everything (default)
 *   'no-trivial' -> drop spots whose top action is >= 95%
 *   'close'    -> keep only spots where the top two actions are within 20 pts
 */
export function applyHandSelection(questions, mode) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;
  if (!mode || mode === 'all') return questions;

  const sortedFreqs = (q) => {
    const f = q?.gtoFrequencies;
    if (!f || typeof f !== 'object') return [];
    return Object.values(f)
      .map((v) => Number(v) || 0)
      .sort((a, b) => b - a);
  };

  const filtered = questions.filter((q) => {
    const fr = sortedFreqs(q);
    if (fr.length < 2) return mode !== 'close'; // no distribution to judge
    const [top, second] = fr;
    if (mode === 'no-trivial') return top < 95;
    if (mode === 'close') return (top - second) <= 20;
    return true;
  });

  return filtered.length > 0 ? filtered : questions;
}


/**
 * roadmap #3 — GAME MODE.
 * GTO Wizard offers Full Hand (play the hand out across streets), Spot (a
 * single decision, then a fresh hand) and Street (drill one street only).
 * We only ever played the Full Hand behaviour: any flop/turn question silently
 * started a multi-street hand, so there was no way to drill isolated decisions.
 *
 *   'full'   -> continue across streets (previous behaviour, still the default)
 *   'spot'   -> one decision per hand, never continue
 *   'street' -> like spot, but restricted to questions on `targetStreet`
 *
 * Like hand selection, the street filter never returns an empty queue.
 */
export function applyStreetFilter(questions, gameMode, targetStreet) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;
  if (gameMode !== 'street' || !targetStreet) return questions;
  const want = String(targetStreet).toLowerCase();
  const filtered = questions.filter(
    (q) => String(q?.scenario?.street || '').toLowerCase() === want
  );
  return filtered.length > 0 ? filtered : questions;
}

const QUESTIONS_PER_LEVEL = TRAINING_CONFIG.questionsPerLevel;
const TOTAL_LEVELS = TRAINING_CONFIG.totalLevels; // 12 (from LevelRegistry)

// classifyMove returns lowercase classifications — compare in lowercase everywhere
const MISTAKE_CLASSES = ['inaccuracy', 'wrong', 'blunder'];

export default function useGTOTrainer(
  gameId,
  engineType = 'PIO',
  initialLevel = 1,
  trainerConfig = null
) {
  // If custom trainer config provided, use its questions count
  const baseQuestionsPerLevel = trainerConfig?.questionsCount || QUESTIONS_PER_LEVEL;
  const [effectiveQuestionsPerLevel, setEffectiveQuestionsPerLevel] =
    useState(baseQuestionsPerLevel);
  // Game state
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [level, setLevel] = useState(initialLevel);
  // ═══ 2026-07-19 AUDIT FIX (wave-1 regression sweep): adaptive difficulty
  // mutates `level` mid-session (crushing 5 in a row bumps it +1), which then
  // leaked into progress persistence, pass thresholds, and UI labels — a user
  // who SELECTED Level 1 could get their completion recorded as Level 2 and
  // see "Retry Level 2". `selectedLevel` is the immutable level the user
  // entered with: use it for persistence/thresholds/labels; keep `level` as
  // the adaptive CONTENT difficulty only. ═══
  const [selectedLevel] = useState(initialLevel);
  const [loading, setLoading] = useState(true); // Start true until pre-load completes
  const [error, setError] = useState(null);

  // 🚀 PRE-LOADED QUESTIONS - All 25 fetched at once
  const [preloadedQuestions, setPreloadedQuestions] = useState([]);
  const [preloadComplete, setPreloadComplete] = useState(false);

  // Score tracking
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  // XP system removed — diamonds are the only reward currency
  const totalXP = 0; // legacy compatibility stub

  // Feedback state
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState(null); // 'correct' | 'wrong'
  const [explanation, setExplanation] = useState('');
  // Phase 251: Structured explanation object
  const [structuredExplanation, setStructuredExplanation] = useState(null);

  // Game completion state
  const [gameComplete, setGameComplete] = useState(false);
  const [levelPassed, setLevelPassed] = useState(false);

  // GTOW scoring integration
  const gtowScoring = useGTOWScore();
  const [lastMoveClassification, setLastMoveClassification] = useState(null);
  const [lastEVLoss, setLastEVLoss] = useState(0);
  const [lastGTOFrequencies, setLastGTOFrequencies] = useState(null);

  // ═══ MULTI-STREET STATE ═══
  const [currentStreet, setCurrentStreet] = useState('flop');
  const [isMultiStreetActive, setIsMultiStreetActive] = useState(false);
  const [handSummary, setHandSummary] = useState(null);
  const [lastSelectedAction, setLastSelectedAction] = useState(null);
  const multiStreetHandRef = useRef(null);

  // ═══ MISTAKE REPLAY STATE ═══
  const mistakeQuestionsRef = useRef([]);

  // ═══ ADAPTIVE DIFFICULTY STATE ═══
  const [adaptiveLevelChange, setAdaptiveLevelChange] = useState(null); // { from, to, direction }
  const adaptiveCheckpointRef = useRef(5); // Check every 5 questions

  // ═══ PHASE 14: NEXT-LEVEL PREFETCH STATE ═══
  const nextLevelCacheRef = useRef(null); // { level, questions } — prefetched next level
  const prefetchTriggeredRef = useRef(false);

  // Get user ID for no-repeat tracking
  const userId = getAuthUser()?.id;

  /**
   * ═══ PHASE 14: Background prefetch for next level ═══
   * Fires when player is ~60% through current level
   * Ensures zero loading time when advancing to next level
   */
  const prefetchNextLevel = useCallback(async () => {
    if (prefetchTriggeredRef.current) return;
    if (level >= TOTAL_LEVELS) return; // Max level, nothing to prefetch
    if (trainerConfig) return; // Custom trainers don't auto-advance

    prefetchTriggeredRef.current = true;
    const nextLevel = level + 1;

    try {
      const token = getSessionToken();
      const params = new URLSearchParams({
        gameId,
        level: nextLevel.toString(),
        count: effectiveQuestionsPerLevel.toString(),
      });

      const response = await fetch(`/api/training/batch-preload?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const textResponse = await response.text();
      const data = JSON.parse(textResponse);

      if (response.ok && data.questions && data.questions.length > 0) {
        nextLevelCacheRef.current = { level: nextLevel, questions: data.questions };
        console.debug(
          `[GTOTrainer] 🚀 Prefetched ${data.questions.length} questions for level ${nextLevel}`
        );
      }
    } catch (err) {
      console.warn('[App] Handled exception:', err?.message || err);
    }
  }, [gameId, level, effectiveQuestionsPerLevel, trainerConfig]);

  /**
   * Resolve the active difficulty mode (Simple/Grouped/Standard) —
   * same resolution order used everywhere a question is served.
   */
  const resolveDifficultyMode = useCallback(() => {
    return (
      trainerConfig?.difficultyMode ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('gma_difficulty') : null) ||
      'standard'
    );
  }, [trainerConfig]);

  /**
   * FALLBACK: Fetch single question via deterministic batch-preload (count=1)
   * Eliminates all Grok AI dependency — pure solver data only
   */
  const fetchSingleQuestion = useCallback(async (levelOverride = null) => {
    if (!gameId) return;

    const effectiveLevel = levelOverride ?? level;
    setLoading(true);
    setError(null);
    setShowFeedback(false);

    try {
      const params = new URLSearchParams({
        gameId,
        level: effectiveLevel.toString(),
        count: '1',
      });

      const token = getSessionToken();
      const response = await fetch(`/api/training/batch-preload?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      // Safe JSON parsing
      let data;
      const textResponse = await response.text();
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        if (response.status === 401) throw new Error('Auth required');
        throw new Error(`Server error (${response.status})`);
      }

      if (!response.ok || !data.questions || data.questions.length === 0) {
        throw new Error(data.error || 'No solver data available');
      }

      setCurrentQuestion(applyDifficultyToQuestion(data.questions[0], resolveDifficultyMode()));
    } catch (err) {
      console.warn('[GTOTrainer] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [gameId, level, resolveDifficultyMode]);

  /**
   * 🚀 BATCH PRE-LOAD ALL QUESTIONS AT ONCE
   * Fetches all 25 questions when game starts
   * No more individual loading - instant question serving
   */
  const preloadAllQuestions = useCallback(async (levelOverride = null) => {
    if (!gameId) return;

    // levelOverride avoids stale-closure fetches when callers change the
    // level state and preload in the same tick (startNextLevel/resetGame)
    const effectiveLevel = levelOverride ?? level;
    setLoading(true);
    setError(null);

    try {
      const token = getSessionToken();
      let apiUrl;
      let params;

      if (trainerConfig) {
        // CUSTOM TRAINER MODE — use custom-train API with detailed config
        params = new URLSearchParams({
          gameType: trainerConfig.gameType || 'cash',
          stackDepth: (trainerConfig.stackDepth || 100).toString(),
          count: (trainerConfig.questionsCount || effectiveQuestionsPerLevel).toString(),
        });
        if (trainerConfig.position && trainerConfig.position !== 'any') {
          params.set('position', trainerConfig.position);
        }
        if (trainerConfig.villainPosition) {
          params.set('villainPosition', trainerConfig.villainPosition);
        }
        if (trainerConfig.actionScenario) {
          params.set('actionScenario', trainerConfig.actionScenario);
        }
        if (trainerConfig.street) {
          params.set('street', trainerConfig.street);
        }
        if (trainerConfig.handClass) {
          params.set('handClass', trainerConfig.handClass);
        }
        // GTOW parity #8 — board-texture targeting. TrainerConfigModal has
        // offered a Board Texture row (Dry Rainbow / Monotone / Two-Tone /
        // Paired / Connected / Broadway) since it shipped, and the value was
        // collected, stored on trainerConfig and then dropped right here: it
        // was the one config field never forwarded to the API, so picking
        // "Monotone" trained you on exactly the same boards as picking
        // nothing. The modal already normalises 'any' to null, so a plain
        // truthiness check is the whole guard needed.
        if (trainerConfig.boardTexture) {
          params.set('boardTexture', trainerConfig.boardTexture);
        }
        apiUrl = `/api/training/custom-train?${params}`;
        console.debug(`[GTOTrainer] Custom trainer: ${trainerConfig.label || 'custom config'}`);
      } else {
        // STANDARD MODE — use batch-preload
        params = new URLSearchParams({
          gameId,
          level: effectiveLevel.toString(),
          count: effectiveQuestionsPerLevel.toString(),
        });

        // ═══ PHASE 15: Pass weak-spot targeting hints if available ═══
        const weakSpots = getWeakSpots();
        if (weakSpots.length > 0) {
          // Extract the weakest positions and streets
          const weakPositions = [...new Set(weakSpots.map((s) => s.position))].slice(0, 3);
          if (weakPositions.length > 0) {
            params.set('targetPositions', weakPositions.join(','));
          }
          // If the top weak spot has a clear street pattern, target that
          if (weakSpots[0].street && weakSpots[0].mistakeRate >= 0.5) {
            params.set('targetStreet', weakSpots[0].street);
          }
          console.debug(
            `[GTOTrainer] 🎯 Targeting weak spots: positions=${weakPositions.join(',')} street=${weakSpots[0].street || 'any'}`
          );
        }

        // ═══ PHASE 19: Pass difficulty hint if set in localStorage ═══
        if (typeof window !== 'undefined') {
          const diff = localStorage.getItem('gma_difficulty');
          if (diff && diff !== 'standard') params.set('difficulty', diff);
        }

        apiUrl = `/api/training/batch-preload?${params}`;
        console.debug(
          `[GTOTrainer] Pre-loading ${effectiveQuestionsPerLevel} questions for ${gameId} level ${effectiveLevel}`
        );
      }

      const response = await fetch(apiUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      // Safe JSON parsing to prevent Unexpected Token '<' HTML crash
      let data;
      const textResponse = await response.text();
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        console.warn('[GTOTrainer] Non-JSON response:', textResponse.substring(0, 100));
        if (response.status === 401) throw new Error('Auth required');
        throw new Error(`Server error (${response.status})`);
      }

      if (!response.ok || !data.questions || data.questions.length === 0) {
        console.warn('[GTOTrainer] Pre-load failed, using single-question mode');
        setPreloadComplete(false);
        setLoading(false);
        return fetchSingleQuestion(effectiveLevel);
      }

      console.debug(`[GTOTrainer] ✅ Pre-loaded ${data.questions.length} questions`);

      // roadmap #7 — hand selection filter, applied once to the batch.
      const selected = applyStreetFilter(
        applyHandSelection(data.questions, trainerConfig?.handSelection),
        trainerConfig?.gameMode,
        trainerConfig?.targetStreet
      );
      if (selected.length !== data.questions.length) {
        console.debug(`[GTOTrainer] hand selection '${trainerConfig?.handSelection}': ${data.questions.length} -> ${selected.length}`);
      }

      setPreloadedQuestions(selected);
      setPreloadComplete(true);
      // Apply difficulty simplification to the first question too (later
      // questions get it in nextQuestion)
      setCurrentQuestion(applyDifficultyToQuestion(selected[0], resolveDifficultyMode()));

      // Bug 5 fix: Cap question count at actual returned count to prevent game never ending
      if (data.questions.length < effectiveQuestionsPerLevel) {
        console.warn(
          `[GTOTrainer] API returned ${data.questions.length}/${effectiveQuestionsPerLevel} questions, capping`
        );
        setEffectiveQuestionsPerLevel(data.questions.length);
      }

      setLoading(false);
    } catch (err) {
      console.warn('[GTOTrainer] Pre-load error:', err);
      setPreloadComplete(false);
      setLoading(false);
      return fetchSingleQuestion(effectiveLevel);
    }
  }, [
    gameId,
    level,
    trainerConfig,
    effectiveQuestionsPerLevel,
    fetchSingleQuestion,
    resolveDifficultyMode,
  ]);

  // ═══ PHASE 14: WEAK-SPOT ANALYSIS STATE ═══
  // Tracks per-position, per-street, per-spotType accuracy for smart targeting
  const weakSpotMapRef = useRef({});

  /**
   * Derive the spot type from scenario context
   * e.g., 'facing_cbet', 'open_raise', '3bet_defense', 'check_raise', etc.
   */
  const deriveSpotType = useCallback((scenario) => {
    if (!scenario) return 'unknown';
    // 2026-07-19 AUDIT FIX (E2E defect D4b): scenario.context sometimes
    // arrives as a non-string (object) — calling .toLowerCase() threw an
    // unhandled TypeError repeatedly during live play. Coerce defensively.
    const ctx = (typeof scenario.context === 'string' ? scenario.context : '').toLowerCase();
    const title = (typeof scenario.title === 'string' ? scenario.title : '').toLowerCase();
    const combined = ctx + ' ' + title;

    if (combined.includes('3-bet') || combined.includes('3bet')) return '3bet_defense';
    if (combined.includes('4-bet') || combined.includes('4bet')) return '4bet_pot';
    if (
      combined.includes('c-bet') ||
      combined.includes('cbet') ||
      combined.includes('continuation')
    )
      return 'facing_cbet';
    if (
      combined.includes('check-raise') ||
      combined.includes('checkraise') ||
      combined.includes('check raise')
    )
      return 'check_raise';
    if (combined.includes('donk')) return 'donk_bet';
    if (combined.includes('squeeze')) return 'squeeze';
    if (combined.includes('open') || combined.includes('raise first')) return 'open_raise';
    if (combined.includes('blind') && combined.includes('defend')) return 'blind_defense';
    // Infer from position
    const hero = scenario.heroPosition || '';
    if (hero === 'BB') return 'bb_defense';
    if (hero === 'SB') return 'sb_play';
    if (hero === 'BTN') return 'btn_play';
    return 'general';
  }, []);

  /**
   * Update weak-spot map with a new data point
   */
  const updateWeakSpotMap = useCallback((position, street, spotType, classification) => {
    const map = weakSpotMapRef.current;
    const key = `${position}_${street}_${spotType}`;
    if (!map[key]) {
      map[key] = { total: 0, mistakes: 0, position, street, spotType };
    }
    map[key].total++;
    if (MISTAKE_CLASSES.includes((classification || '').toLowerCase())) {
      map[key].mistakes++;
    }
  }, []);

  /**
   * Get the player's weakest spots (sorted by mistake rate, min 3 samples)
   */
  const getWeakSpots = useCallback(() => {
    const map = weakSpotMapRef.current;
    return Object.values(map || {})
      .filter((s) => s.total >= 3) // Need min sample
      .map((s) => ({ ...s, mistakeRate: s.mistakes / s.total }))
      .sort((a, b) => b.mistakeRate - a.mistakeRate)
      .slice(0, 5); // Top 5 weak spots
  }, []);

  /**
   * Record answer to API (for no-repeat tracking + weak-spot metadata)
   */
  const recordAnswer = useCallback(
    async (questionId, selectedAnswer, isCorrect, spotMeta = {}) => {
      if (!userId || !gameId) return;

      try {
        const token = getSessionToken();
        await fetch('/api/training/record-question', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            userId,
            gameId,
            questionId,
            selectedAnswer,
            isCorrect,
            level,
            // ═══ PHASE 14: Spot metadata for weak-spot targeting ═══
            heroPosition: spotMeta.heroPosition || null,
            villainPosition: spotMeta.villainPosition || null,
            street: spotMeta.street || null,
            classification: spotMeta.classification || null,
            evLoss: spotMeta.evLoss || 0,
            spotType: spotMeta.spotType || null,
          }),
        });
      } catch (err) {
        console.warn('[App] Handled exception:', err?.message || err);
      }
    },
    [userId, gameId, level]
  );

  /**
   * Submit answer and show feedback
   */
  const submitAnswer = useCallback(
    async (selectedOptionId, meta) => {
      if (!currentQuestion || showFeedback) return;

      const solverCorrectAnswer = currentQuestion.correctAnswer;
      const options = currentQuestion.options || [];
      const scenario = currentQuestion.scenario || {};
      const selectedText = options.find((o) => o.id === selectedOptionId)?.text || selectedOptionId;

      // ═══ PREFER REAL PIO DATA, FALL BACK TO SIMULATED ═══
      const hasPIOData =
        currentQuestion.gtoFrequencies &&
        Object.keys(currentQuestion.gtoFrequencies || {}).length > 0;
      // ORDERING MATTERS: the simulated distribution must be seeded from the
      // SOLVER's answer, never the dice's. The table built its 1-100 bands from
      // this exact distribution before the player acted; reseeding it here would
      // shift the bands out from under a roll that has already been shown.
      const frequencies = hasPIOData
        ? currentQuestion.gtoFrequencies // Real PIO solver frequencies (0-100%)
        : simulateGTOFrequencies(options, solverCorrectAnswer, level);

      // GTOW parity #38 — with the randomiser live, the action the dice landed
      // on is what "Best" means for this hand; that is the entire point of the
      // tool. The id is validated against the real option list so a stale or
      // malformed meta can never silently redirect grading at nothing. Ignoring
      // the dice is still safe: classifyMove awards BEST to any action the
      // solver plays at >=20%, so following the solver is never punished.
      const rngTargetId = meta && meta.rngTargetActionId;
      const correctAnswer =
        rngTargetId && options.some((o) => (o?.id ?? o) === rngTargetId)
          ? rngTargetId
          : solverCorrectAnswer;
      const correctText = options.find((o) => o.id === correctAnswer)?.text || correctAnswer;

      // Classify the move — pass real PIO data for accurate EV loss when available
      const moveResult = classifyMove(
        selectedOptionId,
        correctAnswer,
        frequencies,
        level,
        hasPIOData ? currentQuestion.evData : null, // Real EV data (or null)
        hasPIOData ? currentQuestion.rawFrequencies : null, // Full PIO frequency matrix
        currentQuestion.heroHand || scenario.heroHand, // Hero hand for EV lookup
        scenario.pot // Pot size for scaling
      );

      // Mixed-strategy grading: when solver frequencies exist, any action the
      // solver plays at meaningful frequency grades as correct — derive from
      // the classification instead of exact-id match.
      const isCorrect = moveResult
        ? ['best', 'correct'].includes((moveResult.classification || '').toLowerCase())
        : selectedOptionId === correctAnswer;

      // ═══ Phase GTO-CLONE: ActionTreeEngine score for solver-node accuracy ═══
      let actionTreeScore = null;
      try {
        if (frequencies && Object.keys(frequencies || {}).length > 0) {
          const gtoStrategy = Object.entries(frequencies || {}).map(([id, freq]) => ({
            id,
            text: options.find((o) => o.id === id)?.text || id,
            frequency: freq,
          }));
          actionTreeScore = scoreAction(
            { id: selectedOptionId, text: selectedText },
            gtoStrategy,
            scenario.pot || 10
          );
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // Store for UI consumption
      setLastMoveClassification(moveResult.classification);
      setLastEVLoss(moveResult.evLoss);
      setLastGTOFrequencies(frequencies);

      // Record to GTOW scoring engine
      gtowScoring.recordMove({
        classification: moveResult.classification,
        evLoss: moveResult.evLoss,
        frequencyDiff: moveResult.frequencyDiff,
        isRealData: moveResult.isRealData || false,
        handData: {
          // Stable per-hand id so multi-street decisions count as ONE hand
          handId: currentQuestion.id || `q_${level}_${questionNumber}`,
          heroCards: currentQuestion.heroCards || scenario.heroHand,
          board: scenario.board,
          heroPosition: scenario.heroPosition || scenario.position,
          pot: scenario.pot,
          action: selectedText,
          correctAction: correctText,
          question: currentQuestion.question || currentQuestion.text,
          source: currentQuestion.source || 'UNKNOWN',
          gtoFrequencies: frequencies || {},
          // ═══ PHASE 20: Raw solver matrix for RangeGrid display ═══
          rawFrequencies: currentQuestion.rawFrequencies || null,
          heroHand: currentQuestion.heroHand || scenario.heroHand || null,
          street: scenario.street || null,
          scenarioHash: scenario.scenarioHash || null,
          // ═══ PHASE 21: EV data for RangeGrid EV overlay ═══
          evData: currentQuestion.evData || null,
          // ═══ PHASE 27: Explanation text for hand replay review ═══
          explanation: currentQuestion.explanation || null,
          // ═══ Phase GTO-CLONE: ActionTreeEngine solver-node score ═══
          actionTreeScore: actionTreeScore || null,
          // ═══ PHASE 51: Hand categorization for replay display ═══
          handCategory: currentQuestion.handCategory || null,
        },
      });

      // Save full question for mistake replay
      const isMistakeMove = MISTAKE_CLASSES.includes(
        (moveResult?.classification || '').toLowerCase()
      );
      if (isMistakeMove) {
        mistakeQuestionsRef.current.push({
          ...currentQuestion,
          _mistakeMeta: {
            classification: moveResult.classification,
            evLoss: moveResult.evLoss || 0,
            chosenAction: selectedOptionId,
          },
        });
      }

      // Phase 75: Update adaptive difficulty tracking
      try {
        deterministicEngine.updateSessionDifficulty(isCorrect);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // Phase 76: Record mistake pattern for dynamic explanation depth
      try {
        deterministicEngine.recordMistakePattern({
          isCorrect,
          street: scenario.street || 'flop',
          handCategory: currentQuestion.handCategory || '',
          correctAction: correctAnswer,
          chosenAction: selectedOptionId,
          spotType: deriveSpotType(scenario),
          nodeType: scenario.nodeType || '',
          classification: moveResult.classification,
        });
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 140: GTO deviation detection ═══
      try {
        const deviationNote = deterministicEngine.detectGTODeviation(
          selectedOptionId,
          correctAnswer,
          currentQuestion.frequencies?.[correctAnswer] || 0,
          scenario.street || 'flop',
          currentQuestion.handCategory || ''
        );
        if (deviationNote && !isCorrect) {
          // Append deviation warning to explanation
          const prevExpl = currentQuestion.explanation || '';
          if (deviationNote && !prevExpl.includes('Deviation:')) {
            currentQuestion._deviationNote = deviationNote;
          }
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 143: Auto-difficulty adjustment ═══
      try {
        deterministicEngine.recordRecentResult(isCorrect);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 144: Concept mastery tracking ═══
      try {
        const concept = deterministicEngine.deriveConceptFromContext(
          scenario.nodeType || '',
          scenario.street || 'flop',
          correctAnswer,
          currentQuestion.handCategory || ''
        );
        deterministicEngine.recordConceptExposure(concept, isCorrect);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 146: Spaced repetition for missed scenarios ═══
      try {
        if (!isCorrect) {
          deterministicEngine.recordMissedScenario(scenario, moveResult.classification);
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 153: EV graph data ═══
      try {
        const evLossData = deterministicEngine.estimateEVLoss(
          selectedOptionId,
          correctAnswer,
          currentQuestion.actionEVs || {},
          currentQuestion.estimatedPot || 0
        );
        deterministicEngine.recordEVDataPoint(
          deterministicEngine._getSessionQuestionCount(),
          isCorrect,
          evLossData ? parseFloat(evLossData.evLossBB) : 0,
          scenario.street || 'flop'
        );
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 158: Aggression tracking ═══
      try {
        deterministicEngine.recordAggressionAction(selectedOptionId, scenario.street || 'flop');
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 159: VPIP/PFR tracking ═══
      try {
        if (scenario.street === 'preflop') {
          deterministicEngine.recordPreflopAction(selectedOptionId, scenario.nodeType || '');
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 160: Positional awareness ═══
      try {
        deterministicEngine.recordPositionalDecision(scenario.heroPosition || '', isCorrect);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 180: Question type diversity ═══
      try {
        deterministicEngine.recordQuestionType(
          `${scenario.street || 'flop'}:${scenario.nodeType || 'general'}`
        );
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 185: User vs solver frequency ═══
      try {
        deterministicEngine.recordUserAction(
          selectedOptionId,
          correctAnswer,
          scenario.street || 'flop',
          scenario.nodeType || ''
        );
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 190: Hand history replay ═══
      try {
        deterministicEngine.recordHandForReplay(
          scenario,
          currentQuestion.heroHand || '',
          currentQuestion.board || [],
          selectedOptionId,
          correctAnswer,
          currentQuestion.explanation || ''
        );
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 227: Deviation cost tracking ═══
      try {
        const evLossForCost = deterministicEngine.estimateEVLoss(
          selectedOptionId,
          correctAnswer,
          currentQuestion.actionEVs || {},
          currentQuestion.estimatedPot || 0
        );
        if (evLossForCost && !isCorrect) {
          deterministicEngine.recordDeviationCost(parseFloat(evLossForCost.evLossBB) || 0);
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 241: Training calendar ═══
      try {
        deterministicEngine.recordDailyTraining();
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 179: Session bests tracking ═══
      try {
        if (isCorrect) {
          const recentResults = deterministicEngine._recentResults || [];
          const currentStreakVal = recentResults.reduce((acc, r) => (r ? acc + 1 : 0), 0);
          deterministicEngine.recordSessionBest('streak', currentStreakVal);
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // Update legacy scores
      // Multi-street: questionNumber only advances once per hand, so only the
      // FIRST street answer of a hand may credit correctCount. Continuation
      // streets (recordAction already called at least once on the active hand)
      // must not inflate the numerator past the question denominator.
      const isStreetContinuation =
        multiStreetHandRef.current &&
        !multiStreetHandRef.current.isComplete &&
        (multiStreetHandRef.current.streetActions?.length || 0) > 0;
      let currentStreakCount = (prevStreak) => prevStreak; // fallback
      if (isCorrect) {
        if (!isStreetContinuation) {
          setCorrectCount((prev) => prev + 1);
        }
        setStreak((prev) => {
          const newStreak = prev + 1;
          if (newStreak > bestStreak) setBestStreak(newStreak);
          if (newStreak % 5 === 0) trainingSounds.play('streak'); // Streak milestone
          return newStreak;
        });
      } else {
        setStreak(0);
      }

      // Audio Feedback for Move Quality
      const cls = moveResult.classification;
      if (cls === 'blunder' || cls === 'wrong' || cls === 'inaccuracy') {
        trainingSounds.play('incorrect');
      } else {
        trainingSounds.play('correct');
      }

      // Show feedback
      setFeedbackResult(isCorrect ? 'correct' : 'wrong');

      // Phase 80: Append frequency deviation note when player picks a secondary action
      let fullExplanation = currentQuestion.explanation || '';
      if (!isCorrect && selectedOptionId !== correctAnswer) {
        try {
          const deviationNote = deterministicEngine.getFrequencyDeviationNote(
            selectedOptionId,
            correctAnswer,
            currentQuestion.frequencies || {},
            currentQuestion.handCategory || '',
            scenario.street || 'flop',
            null, // texture not easily available here
            scenario.nodeType || ''
          );
          if (deviationNote) {
            fullExplanation = fullExplanation
              ? `${fullExplanation} ${deviationNote}`
              : deviationNote;
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }

        // ═══ PHASE 140: Append GTO deviation note ═══
        try {
          if (currentQuestion._deviationNote) {
            fullExplanation = `${fullExplanation} ${currentQuestion._deviationNote}`;
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }

        // ═══ PHASE 147: EV loss quantification ═══
        try {
          const evLoss = deterministicEngine.estimateEVLoss(
            selectedOptionId,
            correctAnswer,
            currentQuestion.actionEVs || {},
            currentQuestion.estimatedPot || 0
          );
          if (evLoss && evLoss.message) {
            fullExplanation = `${fullExplanation} ${evLoss.message}`;
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }
      }

      // ═══ PHASE 150: Coaching message ═══
      try {
        const coachMsg = deterministicEngine.getCoachingMessage(
          moveResult.classification,
          deterministicEngine._getSessionQuestionCount()
        );
        if (coachMsg) {
          fullExplanation = coachMsg + ' ' + fullExplanation;
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 249: Tilt detection ═══
      try {
        const tiltStatus = deterministicEngine.detectTilt();
        if (tiltStatus && tiltStatus.message) {
          fullExplanation = `${fullExplanation} ${tiltStatus.message}`;
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 198: Mental game note ═══
      try {
        const mentalNote = deterministicEngine.getMentalGameNote();
        if (mentalNote) {
          fullExplanation = `${fullExplanation} ${mentalNote}`;
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      // ═══ PHASE 225: Smart recap ═══
      try {
        const recap = deterministicEngine.generateSmartRecap(
          deterministicEngine._getSessionQuestionCount()
        );
        if (recap) {
          const recapText = recap.sections.map((s) => `${s.title}: ${s.content}`).join(' | ');
          fullExplanation = `${fullExplanation} 📊 Session recap — ${recapText}`;
        }
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }

      setExplanation(fullExplanation);

      // ═══ PHASE 251: Generate structured explanation for rich UI rendering ═══
      try {
        const structured = deterministicEngine.generateStructuredExplanation(
          selectedOptionId,
          correctAnswer,
          currentQuestion.frequencies || {},
          currentQuestion.handCategory || '',
          scenario.street || 'flop',
          scenario.nodeType || '',
          scenario,
          fullExplanation
        );
        // Phase 256: Attach spot difficulty estimation
        try {
          structured.spotDifficulty = deterministicEngine.estimateSpotDifficulty(
            currentQuestion.frequencies || {},
            scenario.street || 'flop',
            scenario.stackDepth,
            scenario.nodeType || ''
          );
        } catch (_e) {
          console.warn('[App] Handled exception:', _e?.message || _e);
        }
        setStructuredExplanation(structured);
      } catch (e) {
        setStructuredExplanation(null);
      }

      setShowFeedback(true);

      // Store the selected action for multi-street advance
      setLastSelectedAction(selectedOptionId);

      // ═══ ADAPTIVE DIFFICULTY: Auto-adjust level every 5 questions ═══
      // Also identifies weak spots and emits them for targeted practice
      const answeredSoFar = questionNumber; // 1-based, this is the Nth answer
      if (
        answeredSoFar >= adaptiveCheckpointRef.current &&
        answeredSoFar < effectiveQuestionsPerLevel
      ) {
        const windowSize = 5;
        const recentHistory = gtowScoring.handHistory.slice(-windowSize);
        const recentCorrect = recentHistory.filter(
          (h) => h.classification === 'best' || h.classification === 'correct'
        ).length;
        const recentAccuracy = (recentCorrect / windowSize) * 100;

        if (recentAccuracy >= 90 && level < 10) {
          // Player is crushing it → increase difficulty
          const newLevel = Math.min(10, level + 1);
          setLevel(newLevel);
          setAdaptiveLevelChange({ from: level, to: newLevel, direction: 'up' });
          try {
            eventBus.emit('adaptiveDifficultyChange', {
              from: level,
              to: newLevel,
              direction: 'up',
            });
          } catch (_) {
            console.warn('[App] Handled exception:', _?.message || _);
          }
          console.debug(
            `[GTOTrainer] 📈 Adaptive: Level ${level} → ${newLevel} (accuracy ${recentAccuracy}%)`
          );
        } else if (recentAccuracy < 50 && level > 1) {
          // Player struggling → decrease difficulty
          const newLevel = Math.max(1, level - 1);
          setLevel(newLevel);
          setAdaptiveLevelChange({ from: level, to: newLevel, direction: 'down' });
          try {
            eventBus.emit('adaptiveDifficultyChange', {
              from: level,
              to: newLevel,
              direction: 'down',
            });
          } catch (_) {
            console.warn('[App] Handled exception:', _?.message || _);
          }
          console.debug(
            `[GTOTrainer] 📉 Adaptive: Level ${level} → ${newLevel} (accuracy ${recentAccuracy}%)`
          );
        }

        // ═══ PHASE 14: Emit weak-spot analysis for UI consumption ═══
        const weakSpots = getWeakSpots();
        if (weakSpots.length > 0) {
          try {
            eventBus.emit('weakSpotAnalysis', {
              weakSpots,
              topWeakSpot: weakSpots[0],
              checkpoint: answeredSoFar,
            });
          } catch (_) {
            console.warn('[App] Handled exception:', _?.message || _);
          }
          console.debug(
            `[GTOTrainer] 🎯 Weak spots detected:`,
            weakSpots
              .map(
                (s) =>
                  `${s.position}/${s.street}/${s.spotType} (${Math.round(s.mistakeRate * 100)}%)`
              )
              .join(', ')
          );
        }

        adaptiveCheckpointRef.current = answeredSoFar + 5; // Next checkpoint
      }

      // ═══ MULTI-STREET: Record action on current hand ═══
      if (multiStreetHandRef.current && !multiStreetHandRef.current.isComplete) {
        multiStreetHandRef.current.recordAction(
          selectedOptionId,
          moveResult.classification,
          moveResult.evLoss
        );
      }

      // ═══ PHASE 14: Trigger background prefetch at 60% through level ═══
      const progress = questionNumber / effectiveQuestionsPerLevel;
      if (progress >= 0.6 && !prefetchTriggeredRef.current) {
        prefetchNextLevel();
      }

      // ═══ PHASE 14: Track weak spots + record with spot metadata ═══
      const spotType = deriveSpotType(scenario);
      const heroPos = scenario.heroPosition || 'BTN';
      const streetName = scenario.street || 'flop';
      updateWeakSpotMap(heroPos, streetName, spotType, moveResult.classification);

      // Record to backend (async, non-blocking) — now with spot metadata
      recordAnswer(currentQuestion.id, selectedOptionId, isCorrect, {
        heroPosition: heroPos,
        villainPosition: scenario.villainPosition || 'BB',
        street: streetName,
        classification: moveResult.classification,
        evLoss: moveResult.evLoss,
        spotType,
      });
    },
    [
      currentQuestion,
      showFeedback,
      bestStreak,
      recordAnswer,
      level,
      gtowScoring,
      questionNumber,
      effectiveQuestionsPerLevel,
      deriveSpotType,
      updateWeakSpotMap,
    ]
  );

  /**
   * ═══ MULTI-STREET: Advance to next street within same hand ═══
   * Called by nextQuestion() when multi-street hand is active.
   * Queries API for next-street solver data.
   */
  const advanceToNextStreet = useCallback(async () => {
    const hand = multiStreetHandRef.current;
    if (!hand || hand.isComplete) return false;

    try {
      setLoading(true);

      // Call API endpoint to get next-street question
      const token = getSessionToken();
      const params = new URLSearchParams({
        gameId,
        heroHand: hand.heroHand,
        boardCards: hand.boardCards.join(','),
        street: hand.nextStreetName,
        pot: Math.round(hand.pot).toString(),
        stackDepth: hand.stackDepth.toString(),
      });
      // Pass hero's actual cards so the server deals a consistent runout
      if (Array.isArray(hand.heroCards) && hand.heroCards.length > 0) {
        params.set('heroCards', hand.heroCards.join(','));
      }

      const response = await fetch(`/api/training/next-street?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (response.ok) {
        const data = await response.json();
        if (data.question) {
          // Update MultiStreetHand state with the new card from API
          const advancingToStreet = hand.nextStreetName; // 'turn' or 'river'
          const newCard = data.newCard;
          if (newCard) {
            hand.boardCards.push(newCard);
            hand.deadCards.add(newCard.toLowerCase());
          }
          hand.streetIndex++;
          hand.currentStreet = advancingToStreet || data.street || 'done';

          // Track street data in MultiStreetHand
          hand.streetData.push({
            street: data.street || hand.currentStreet,
            boardCards: [...hand.boardCards],
            pot: hand.pot,
            newCard: newCard,
          });

          // Enrich question with multi-street context
          const nextQ = data.question;
          nextQ.scenario = {
            ...nextQ.scenario,
            isMultiStreet: true,
            streetNumber: hand.streetData.length,
            previousActions: hand.streetActions,
            pot: Math.round(hand.pot),
            board: hand.boardCards.join(' '),
            street: data.street || hand.currentStreet,
            heroPosition: hand.heroPosition,
            villainPosition: hand.villainPosition,
            heroHand: hand.heroHand,
          };
          nextQ.heroCards = hand.heroCards;
          nextQ.heroHand = hand.heroHand;
          hand.currentQuestion = nextQ;

          // ═══ Phase GTO-CLONE: Apply difficulty mode ═══
          const diffMode2 =
            trainerConfig?.difficultyMode ||
            (typeof localStorage !== 'undefined' ? localStorage.getItem('gma_difficulty') : null) ||
            'standard';
          setCurrentQuestion(applyDifficultyToQuestion(nextQ, diffMode2));
          setCurrentStreet(data.street || hand.currentStreet);
          setShowFeedback(false);
          setLoading(false);
          return true;
        }
      }

      // Next street failed — end the hand
      setIsMultiStreetActive(false);
      setHandSummary(hand.getHandSummary());
      multiStreetHandRef.current = null;
      setLoading(false);
      return false;
    } catch (err) {
      console.warn('[GTOTrainer] Multi-street advance error:', err);
      setIsMultiStreetActive(false);
      multiStreetHandRef.current = null;
      setLoading(false);
      return false;
    }
  }, [gameId]);

  /**
   * ═══ PHASE 14: Save mistakes to spaced repetition system ═══
   * Called on session complete. Sends mistake hand signatures to the SR API.
   */
  const saveMistakesToSpacedRepetition = useCallback(async () => {
    const mistakes = mistakeQuestionsRef.current;
    if (!mistakes || mistakes.length === 0) return;

    try {
      const token = getSessionToken();
      if (!token) return;

      const mistakePayloads = mistakes.map((q) => {
        const scenario = q.scenario || {};
        return {
          gameId,
          heroPosition: scenario.heroPosition || 'BTN',
          villainPosition: scenario.villainPosition || 'BB',
          street: scenario.street || 'flop',
          spotType: deriveSpotType(scenario),
          classification: q._mistakeMeta?.classification?.toUpperCase() || 'WRONG',
          evLoss: q._mistakeMeta?.evLoss || 0,
          heroHand: q.heroCards ? q.heroCards.join('') : scenario.heroHand || '',
          board: q.boardCards ? q.boardCards.join(' ') : scenario.board || '',
          correctAction: q.correctAnswerText || q.correctAnswer || '',
          chosenAction: q._mistakeMeta?.chosenAction || '',
        };
      });

      await fetch('/api/training/spaced-repetition', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mistakes: mistakePayloads }),
      });

      console.debug(
        `[GTOTrainer] 🔄 Saved ${mistakePayloads.length} mistakes to spaced repetition`
      );
    } catch (err) {
      console.warn('[GTOTrainer] Spaced repetition save error (non-critical):', err.message);
    }
  }, [gameId, deriveSpotType]);

  /**
   * Save progress to database
   */
  // ═══ MASTERY GATE: Store mastery token from server response ═══
  const [masteryToken, setMasteryToken] = useState(null);
  const [masteryStatus, setMasteryStatus] = useState(null); // server-verified mastery result

  const saveProgress = useCallback(
    async (passed, accuracy) => {
      if (!userId || !gameId) return;

      try {
        const token = getSessionToken();
        const headers = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        // Calculate diamond rewards using LevelRegistry multipliers
        // 2026-07-19: persist against the level the user SELECTED, not the
        // adaptive content level; denominator honors the actual question count
        const diamondsEarned = getDiamondReward(
          selectedLevel,
          correctCount,
          bestStreak > 5 ? 2 : 0,
          effectiveQuestionsPerLevel
        );

        const response = await fetch('/api/training/save-progress', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId,
            gameId,
            level: selectedLevel,
            questionsAnswered: effectiveQuestionsPerLevel,
            questionsCorrect: correctCount,
            accuracy,
            passed,
            streak: bestStreak,
            diamondsEarned,
            timeSpentSeconds: 0,
          }),
        });

        // ═══ MASTERY GATE: Handle server-verified mastery response ═══
        try {
          const data = await response.json();
          if (data.mastery) {
            setMasteryStatus(data.mastery);
            if (data.mastery.masteryToken) {
              setMasteryToken(data.mastery.masteryToken);
              console.debug(
                `[GTOTrainer] 🏆 Mastery token received — next level: ${data.mastery.nextLevelUnlocked}`
              );
            }
            // Server overrides client pass/fail
            if (data.mastery.passed !== passed) {
              console.debug(
                `[GTOTrainer] ⚠️ Server mastery override: client=${passed} server=${data.mastery.passed}`
              );
              setLevelPassed(data.mastery.passed);
            }
          }
        } catch (parseErr) {
          console.warn('[App] Handled exception:', parseErr?.message || parseErr);
        }

        // ═══ PHASE 14: Save mistakes to spaced repetition ═══
        saveMistakesToSpacedRepetition();

        // Emit progress-saved event so useTrainingProgress can re-hydrate
        try {
          eventBus.emit(
            'training:session-saved',
            {
              gameId: gameId,
              gtowScore: gtowScoring.gtowScore,
              handsPlayed: gtowScoring.handsPlayed,
            },
            'useGTOTrainer'
          );
        } catch (busErr) {
          console.warn('[GTOTrainer] Bus emit failed (non-critical):', busErr.message);
        }

        // ═══ Phase GTO-CLONE: Save session + moves via SessionTracker ═══
        try {
          if (gtowScoring.sessionScorer && userId) {
            const summary = gtowScoring.sessionScorer.getSummary();
            const sessionRecord = createSessionRecord({
              userId,
              gameId,
              level,
              summary,
            });
            const moveRecords = createMoveRecords(
              'session_' + Date.now(),
              gtowScoring.sessionScorer.moves || []
            );
            // BUG FIX (2026-05-08, MAX-RIGOR audit round 3):
            // SessionTracker.saveSession signature is
            // `(supabase, sessionRecord, moveRecords)`. The previous
            // call passed only 2 args, so `supabase` arg received
            // `sessionRecord` (an object). Inside saveSession,
            // `supabase.from(...)` then threw TypeError; the catch
            // fell through to `_saveToLocalStorage(sessionRecord,
            // moveRecords)` where `sessionRecord` was actually
            // `moveRecords` (the array), so localStorage received
            // garbage on every game completion. Pass `null` as the
            // first arg so saveSession bypasses the broken Supabase
            // write and goes straight to the localStorage fallback
            // with correctly ordered args. (Server-side persistence
            // already happens via /api/training/save-session in the
            // saveSession.js utility — this localStorage path is the
            // dev/offline backup only.)
            await saveSession(null, sessionRecord, moveRecords).catch((e) =>
              console.warn('[GTOTrainer] SessionTracker save non-critical error:', e.message)
            );
          }
        } catch (stErr) {
          console.warn('[GTOTrainer] SessionTracker integration non-critical:', stErr.message);
        }
      } catch (err) {
        console.warn('[GTOTrainer] Save progress error:', err);
      }
    },
    [
      userId,
      gameId,
      level,
      correctCount,
      bestStreak,
      gtowScoring,
      effectiveQuestionsPerLevel,
      saveMistakesToSpacedRepetition,
    ]
  );

  /**
   * Advance to next question or complete level
   * 🚀 MULTI-STREET: First tries to advance the street within same hand
   * If no next street → advance to next hand from pre-loaded array
   */
  const nextQuestion = useCallback(async () => {
    setShowFeedback(false);

    // ═══ MULTI-STREET: Try advancing street first ═══
    if (
      isMultiStreetActive &&
      multiStreetHandRef.current &&
      !multiStreetHandRef.current.isComplete
    ) {
      // Hero didn't fold — try to advance to next street
      const isFold = ['f', 'fold', 'simple_fold'].includes(lastSelectedAction);
      if (!isFold) {
        const advanced = await advanceToNextStreet();
        if (advanced) return; // Successfully moved to next street
      }

      // Multi-street hand is done — save summary (persists until next hand feedback dismisses it)
      // 2026-07-19 AUDIT FIX (E2E defect D4a): advanceToNextStreet is async —
      // by the time it resolves, another code path may have already cleared
      // multiStreetHandRef, and calling getHandSummary() on null threw an
      // unhandled TypeError 19 times in one live session. Re-check the ref.
      const finishedHand = multiStreetHandRef.current;
      if (finishedHand && typeof finishedHand.getHandSummary === 'function') {
        setHandSummary(finishedHand.getHandSummary());
      }
      setIsMultiStreetActive(false);
      multiStreetHandRef.current = null;
    } else {
      // Only clear hand summary when starting a fresh hand (not when finishing multi-street)
      setHandSummary(null);
    }

    // Reset street state for new hand
    setCurrentStreet('flop');

    if (questionNumber >= effectiveQuestionsPerLevel) {
      // Level complete
      const accuracy = Math.min(
        100,
        Math.round((correctCount / effectiveQuestionsPerLevel) * 100)
      );
      const passed = checkLevelPassed(selectedLevel, correctCount, effectiveQuestionsPerLevel);

      setLevelPassed(passed);
      setGameComplete(true);

      // Audio feedback for level completion
      if (passed) {
        if (accuracy === 100) trainingSounds.play('mastery');
        else trainingSounds.play('levelUp');
      } else {
        trainingSounds.play('incorrect');
      }

      // Save progress to database
      saveProgress(passed, accuracy);
    } else {
      if (preloadComplete && preloadedQuestions[questionNumber]) {
        // Serve next question from pre-loaded array (INSTANT)
        // ═══ Phase GTO-CLONE: Apply difficulty mode to simplify options ═══
        const diffMode =
          trainerConfig?.difficultyMode ||
          (typeof localStorage !== 'undefined' ? localStorage.getItem('gma_difficulty') : null) ||
          'standard';
        const nextQ = applyDifficultyToQuestion(preloadedQuestions[questionNumber], diffMode);
        setCurrentQuestion(nextQ);
        setQuestionNumber((prev) => prev + 1);

        // ═══ START MULTI-STREET HAND if this is a postflop question ═══
        const scenario = nextQ.scenario || {};
        const street = scenario.street || '';
        // roadmap #3 — only Full Hand mode plays the hand out. 'spot' and
        // 'street' are single-decision modes, so a multi-street hand must never
        // start; previously ANY flop/turn question began one regardless.
        const gameMode = trainerConfig?.gameMode || 'full';
        // Removed 'DETERMINISTIC_SOLVER' source restriction to enable multi-street for all 100+ games
        if (gameMode === 'full' && (street === 'flop' || street === 'turn')) {
          try {
            const { MultiStreetHand } = await import('../engines/MultiStreetHandManager');
            multiStreetHandRef.current = new MultiStreetHand(nextQ);
            setIsMultiStreetActive(true);
            setCurrentStreet(street);
          } catch (e) {
            console.warn('[GTOTrainer] MultiStreetHand import failed:', e);
          }
        }
      } else {
        // Fallback to single-question mode
        setQuestionNumber((prev) => prev + 1);
        fetchSingleQuestion();
      }
    }
  }, [
    questionNumber,
    correctCount,
    level,
    preloadComplete,
    preloadedQuestions,
    saveProgress,
    fetchSingleQuestion,
    isMultiStreetActive,
    advanceToNextStreet,
    lastSelectedAction,
    effectiveQuestionsPerLevel,
  ]);

  /**
   * Start next level (if passed)
   * 🚀 Uses prefetched cache if available, otherwise fetches fresh
   */
  const startNextLevel = useCallback(() => {
    if (!levelPassed || level >= TOTAL_LEVELS) return;

    const nextLevel = level + 1;
    setLevel(nextLevel);
    setQuestionNumber(1);
    setCorrectCount(0);
    setStreak(0);
    setGameComplete(false);
    setLevelPassed(false);
    prefetchTriggeredRef.current = false; // Reset for next level

    // ═══ PHASE 14: Use prefetched cache if available for INSTANT level transition ═══
    const cache = nextLevelCacheRef.current;
    if (cache && cache.level === nextLevel && cache.questions.length > 0) {
      console.debug(
        `[GTOTrainer] ⚡ Using prefetched cache for level ${nextLevel} (${cache.questions.length} questions)`
      );
      setPreloadedQuestions(cache.questions);
      setPreloadComplete(true);
      setCurrentQuestion(applyDifficultyToQuestion(cache.questions[0], resolveDifficultyMode()));
      if (cache.questions.length < effectiveQuestionsPerLevel) {
        setEffectiveQuestionsPerLevel(cache.questions.length);
      }
      setLoading(false);
      nextLevelCacheRef.current = null; // Clear used cache
    } else {
      setPreloadComplete(false);
      // Pass nextLevel explicitly — the level state update above hasn't
      // committed yet, so the closure's `level` would be stale
      preloadAllQuestions(nextLevel);
    }
  }, [
    levelPassed,
    level,
    preloadAllQuestions,
    effectiveQuestionsPerLevel,
    resolveDifficultyMode,
  ]);

  /**
   * Retry current level
   * 🚀 Pre-loads fresh set of questions
   */
  const retryLevel = useCallback(() => {
    setQuestionNumber(1);
    setCorrectCount(0);
    setStreak(0);
    setGameComplete(false);
    setLevelPassed(false);
    setPreloadComplete(false);
    setEffectiveQuestionsPerLevel(baseQuestionsPerLevel); // Reset to original count
    // Reset per-session scoring + tracking state
    gtowScoring.resetScore();
    mistakeQuestionsRef.current = [];
    adaptiveCheckpointRef.current = 5;
    prefetchTriggeredRef.current = false;
    preloadAllQuestions();
  }, [preloadAllQuestions, baseQuestionsPerLevel, gtowScoring]);

  /**
   * Retrain only the hands the player got wrong.
   * Injects saved mistake questions directly into the queue.
   */
  const retrainMistakes = useCallback(() => {
    const mistakes = mistakeQuestionsRef.current;
    if (!mistakes || mistakes.length === 0) return;

    // Shuffle mistake questions for varied practice.
    // Phase 62: Fisher-Yates instead of biased sort(()=>Math.random()-0.5).
    const shuffled = [...mistakes];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    setQuestionNumber(1);
    setCorrectCount(0);
    setStreak(0);
    setGameComplete(false);
    setLevelPassed(false);
    setShowFeedback(false);
    setPreloadedQuestions(shuffled);
    setPreloadComplete(true);
    setEffectiveQuestionsPerLevel(shuffled.length);
    setCurrentQuestion(shuffled[0]);
    setLoading(false);

    // Reset scoring for the retrain session
    gtowScoring.resetScore();
    // Clear the mistakes ref so this retrain session tracks fresh mistakes
    mistakeQuestionsRef.current = [];

    console.debug(`[GTOTrainer] Retraining ${shuffled.length} mistake hands`);
  }, [gtowScoring]);

  /**
   * Reset entire game
   * 🚀 Pre-loads questions for level 1
   */
  const resetGame = useCallback(() => {
    setLevel(1);
    setQuestionNumber(1);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setGameComplete(false);
    setLevelPassed(false);
    setPreloadComplete(false);
    setEffectiveQuestionsPerLevel(baseQuestionsPerLevel); // Reset to original count
    // Reset per-session scoring + tracking state
    gtowScoring.resetScore();
    mistakeQuestionsRef.current = [];
    adaptiveCheckpointRef.current = 5;
    prefetchTriggeredRef.current = false;
    // Pass level 1 explicitly — setLevel(1) hasn't committed yet
    preloadAllQuestions(1);
  }, [preloadAllQuestions, baseQuestionsPerLevel, gtowScoring]);

  // 🚀 Pre-load all questions on mount / gameId change ONLY.
  // Ref pattern: preloadAllQuestions changes identity whenever level or
  // effectiveQuestionsPerLevel change (e.g. adaptive difficulty mid-game),
  // and having it in the dep array re-fired the effect mid-game, wiping the
  // in-progress question set. Level transitions call preloadAllQuestions
  // explicitly (startNextLevel/retryLevel/resetGame), so no re-fire is needed.
  const preloadRef = useRef(preloadAllQuestions);
  preloadRef.current = preloadAllQuestions;
  useEffect(() => {
    if (gameId) {
      preloadRef.current();
    }
  }, [gameId]);

  return {
    // Current state
    currentQuestion,
    questionNumber,
    totalQuestions: effectiveQuestionsPerLevel,
    // 2026-07-19: `level` = the user-selected level (stable, for UI labels +
    // persistence); `contentLevel` = adaptive difficulty actually being served
    level: selectedLevel,
    contentLevel: level,
    loading,
    error,

    // Pre-load state
    preloadComplete,

    // Score state
    correctCount,
    streak,
    bestStreak,
    totalXP,
    requiredCorrect: getRequiredCorrect(selectedLevel, effectiveQuestionsPerLevel),
    passThreshold: TRAINING_CONFIG.passThresholds[selectedLevel],
    totalLevels: TOTAL_LEVELS,

    // ═══ MASTERY GATE: Server-verified mastery state ═══
    masteryToken,
    masteryStatus,

    // Feedback state
    showFeedback,
    feedbackResult,
    explanation,

    // GTOW scoring state
    moveClassification: lastMoveClassification,
    evLoss: lastEVLoss,
    gtoFrequencies: lastGTOFrequencies,
    gtowScore: gtowScoring.gtowScore,
    totalEVLoss: gtowScoring.totalEVLoss,
    sessionMistakes: gtowScoring.mistakeCount,
    handHistory: gtowScoring.handHistory,
    avgEVLossPerHand: gtowScoring.avgEVLossPerHand,
    avgEVLossPerMistake: gtowScoring.avgEVLossPerMistake,
    avgFrequencyDiff: gtowScoring.avgFrequencyDiff,

    // Phase 37: Enhanced session metrics from useGTOWScore
    classificationCounts: gtowScoring.classificationCounts,
    currentStreak: gtowScoring.currentStreak,
    bestGTOWStreak: gtowScoring.bestStreak,
    lastClassification: gtowScoring.lastClassification,
    gtowAccuracy: gtowScoring.accuracy,

    // Phase 38: Position & street accuracy
    positionAccuracy: gtowScoring.positionAccuracy,
    streetAccuracy: gtowScoring.streetAccuracy,
    weakestPosition: gtowScoring.weakestPosition,

    // Phase 40: Mistake patterns
    mistakePatterns: gtowScoring.mistakePatterns,
    // Phase 59: Hand type performance
    handTypePerformance: gtowScoring.handTypePerformance,

    // Multi-street state
    currentStreet,
    isMultiStreetActive,
    handSummary,

    // Completion state
    gameComplete,
    levelPassed,

    // Adaptive difficulty
    adaptiveLevelChange,

    // ═══ PHASE 14: Weak-spot targeting ═══
    getWeakSpots,
    weakSpotMap: weakSpotMapRef.current,

    // ═══ PHASE 90: Session weakness summary ═══
    getSessionSummary: () => {
      try {
        return deterministicEngine.generateSessionSummary();
      } catch (e) {
        return null;
      }
    },
    getMistakeTrackerData: () => {
      try {
        return deterministicEngine.getMistakeTrackerData();
      } catch (e) {
        return {};
      }
    },
    // ═══ PHASE 94: Milestone coaching ═══
    getMilestoneCoaching: (qNum) => {
      try {
        return deterministicEngine.getMilestoneCoaching(qNum);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 124: Performance trend tracking ═══
    getPerformanceTrend: () => {
      try {
        return deterministicEngine.getPerformanceTrend();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 125: Engine stats ═══
    getEngineStats: () => {
      try {
        return deterministicEngine.getEngineStats();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 140: GTO deviation summary ═══
    getDeviationSummary: () => {
      try {
        return deterministicEngine.getDeviationSummary();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 143: Auto-adjusted difficulty ═══
    getAutoAdjustedDifficulty: () => {
      try {
        return deterministicEngine.getAutoAdjustedDifficulty();
      } catch (e) {
        return 'standard';
      }
    },
    // ═══ PHASE 144: Concept mastery ═══
    getConceptMastery: () => {
      try {
        return deterministicEngine.getConceptMastery();
      } catch (e) {
        return {};
      }
    },
    // ═══ PHASE 145: Weakness targets ═══
    getWeaknessTargets: () => {
      try {
        return deterministicEngine.getWeaknessTargets();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 146: Spaced repetition ═══
    getSpacedRepetitionDue: () => {
      try {
        return deterministicEngine.getSpacedRepetitionDue();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 148: Optimal play comparison ═══
    getOptimalPlayComparison: () => {
      try {
        return deterministicEngine.getOptimalPlayComparison();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 149: Detailed session report ═══
    generateDetailedSessionReport: () => {
      try {
        return deterministicEngine.generateDetailedSessionReport();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 151: Range grid data ═══
    generateRangeGridData: (handActions, nodeType) => {
      try {
        return deterministicEngine.generateRangeGridData(handActions, nodeType);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 152: Action heatmap ═══
    generateActionHeatmap: () => {
      try {
        return deterministicEngine.generateActionHeatmap();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 153: EV graph data ═══
    getEVGraphData: () => {
      try {
        return deterministicEngine.getEVGraphData();
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 158: Aggression factors ═══
    getAggressionFactors: () => {
      try {
        return deterministicEngine.getAggressionFactors();
      } catch (e) {
        return {};
      }
    },
    // ═══ PHASE 159: Preflop stats ═══
    getPreflopStats: () => {
      try {
        return deterministicEngine.getPreflopStats();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 160: Positional awareness ═══
    getPositionalAwarenessScore: () => {
      try {
        return deterministicEngine.getPositionalAwarenessScore();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 178: Streak messages ═══
    getStreakMessage: (streak) => {
      try {
        return deterministicEngine.getStreakMessage(streak);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 181-183: Quiz generators ═══
    generateTextureQuiz: (board) => {
      try {
        return deterministicEngine.generateTextureQuiz(board);
      } catch (e) {
        return null;
      }
    },
    generateRangeQuiz: (position) => {
      try {
        return deterministicEngine.generateRangeQuiz(position);
      } catch (e) {
        return null;
      }
    },
    generatePotOddsQuiz: () => {
      try {
        return deterministicEngine.generatePotOddsQuiz();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 185: Frequency comparison ═══
    getFrequencyComparison: () => {
      try {
        return deterministicEngine.getFrequencyComparison();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 187: Leak finder ═══
    generateLeakFinderReport: () => {
      try {
        return deterministicEngine.generateLeakFinderReport();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 188: Timing analysis ═══
    getTimingAnalysis: () => {
      try {
        return deterministicEngine.getTimingAnalysis();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 190: Hand history ═══
    getHandHistory: (filter) => {
      try {
        return filter
          ? deterministicEngine.getFilteredHandHistory(filter)
          : deterministicEngine.getHandHistory();
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 191: Custom drills ═══
    createCustomDrill: (config) => {
      try {
        return deterministicEngine.createCustomDrill(config);
      } catch (e) {
        return null;
      }
    },
    getCustomDrills: () => {
      try {
        return deterministicEngine.getCustomDrills();
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 192: Progressive level ═══
    getProgressiveLevel: () => {
      try {
        return deterministicEngine.getProgressiveLevelDescription();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 196: Thought prompts ═══
    generateThoughtPrompts: (scenario, heroHand, board) => {
      try {
        return deterministicEngine.generateThoughtPrompts(scenario, heroHand, board);
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 198: Mental game ═══
    getMentalGameNote: () => {
      try {
        return deterministicEngine.getMentalGameNote();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 200: Engine health ═══
    getEngineHealth: () => {
      try {
        return deterministicEngine.getEngineHealth();
      } catch (e) {
        return null;
      }
    },
    resetSession: () => {
      try {
        deterministicEngine.resetSession();
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }
    },
    // ═══ PHASE 203: Board coverage ═══
    generateBoardCoverageData: (board, heroPos, isPFR) => {
      try {
        return deterministicEngine.generateBoardCoverageData(board, heroPos, isPFR);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 204: Nut combos ═══
    countNutCombos: (board) => {
      try {
        return deterministicEngine.countNutCombos(board);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 213: Action clusters ═══
    getActionClusters: () => {
      try {
        return deterministicEngine.getActionClusters();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 214: Tagging ═══
    tagScenario: (handId, tag) => {
      try {
        deterministicEngine.tagScenario(handId, tag);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }
    },
    getTaggedScenarios: (tag) => {
      try {
        return deterministicEngine.getTaggedScenarios(tag);
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 216: Explanation ratings ═══
    rateExplanation: (handId, rating, feedback) => {
      try {
        deterministicEngine.rateExplanation(handId, rating, feedback);
      } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
      }
    },
    // ═══ PHASE 218: Frequency-weighted scoring ═══
    calculateFrequencyWeightedScore: (chosen, handActions) => {
      try {
        return deterministicEngine.calculateFrequencyWeightedScore(chosen, handActions);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 219: Challenge mode ═══
    initChallengeMode: (config) => {
      try {
        return deterministicEngine.initChallengeMode(config);
      } catch (e) {
        return null;
      }
    },
    recordChallengeAnswer: (isCorrect, timeMs) => {
      try {
        return deterministicEngine.recordChallengeAnswer(isCorrect, timeMs);
      } catch (e) {
        return null;
      }
    },
    getChallengeResults: () => {
      try {
        return deterministicEngine.getChallengeResults();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 220: Achievements ═══
    checkAchievements: () => {
      try {
        return deterministicEngine.checkAchievements();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 221-222: Concept tree & drill recommendations ═══
    getConceptDependencyTree: () => {
      try {
        return deterministicEngine.getConceptDependencyTree();
      } catch (e) {
        return {};
      }
    },
    getRecommendedDrills: () => {
      try {
        return deterministicEngine.getRecommendedDrills();
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 224: Frequency balance ═══
    getExpectedFrequencyBalance: () => {
      try {
        return deterministicEngine.getExpectedFrequencyBalance();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 225: Smart recap ═══
    generateSmartRecap: (qNum) => {
      try {
        return deterministicEngine.generateSmartRecap(qNum);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 227: Cumulative deviation cost ═══
    getCumulativeDeviationCost: () => {
      try {
        return deterministicEngine.getCumulativeDeviationCost();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 229: Runout simulation ═══
    simulateRunouts: (board, handStrength, street) => {
      try {
        return deterministicEngine.simulateRunouts(board, handStrength, street);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 230: 3-bet defense matrix ═══
    get3BetDefenseMatrix: () => {
      try {
        return deterministicEngine.get3BetDefenseMatrix();
      } catch (e) {
        return {};
      }
    },
    // ═══ PHASE 232: Sizing optimizer ═══
    recommendBetSizing: (handStrength, street, texture, pot, stack) => {
      try {
        return deterministicEngine.recommendBetSizing(handStrength, street, texture, pot, stack);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 236: Draw equity ═══
    calculateDrawEquity: (handStrength, street) => {
      try {
        return deterministicEngine.calculateDrawEquity(handStrength, street);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 237: Fold equity ═══
    calculateFoldEquity: (betSize, potSize) => {
      try {
        return deterministicEngine.calculateFoldEquity(betSize, potSize);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 238: EV calculator ═══
    calculateActionEV: (action, equity, potSize, betSize, foldEquity) => {
      try {
        return deterministicEngine.calculateActionEV(action, equity, potSize, betSize, foldEquity);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 239: Bluff ratio ═══
    calculateOptimalBluffRatio: (betSizePct) => {
      try {
        return deterministicEngine.calculateOptimalBluffRatio(betSizePct);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 240: Leaderboard ═══
    getLeaderboardEntry: () => {
      try {
        return deterministicEngine.getLeaderboardEntry();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 241: Training calendar ═══
    getTrainingCalendar: () => {
      try {
        return deterministicEngine.getTrainingCalendar();
      } catch (e) {
        return {};
      }
    },
    getTrainingStreak: () => {
      try {
        return deterministicEngine.getTrainingStreak();
      } catch (e) {
        return 0;
      }
    },
    // ═══ PHASE 242: Flashcards ═══
    generateFlashcards: (category) => {
      try {
        return deterministicEngine.generateFlashcards(category);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 243: Quick-fire ═══
    generateQuickFireQuestion: (scenario, heroHand, correctAction) => {
      try {
        return deterministicEngine.generateQuickFireQuestion(scenario, heroHand, correctAction);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 244: Board texture classification ═══
    classifyBoardTexture: (board) => {
      try {
        return deterministicEngine.classifyBoardTexture(board);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 245: Action tree ═══
    generateActionTree: (handActions, heroHand) => {
      try {
        return deterministicEngine.generateActionTree(handActions, heroHand);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 246: Range vs range ═══
    getRangeVsRangeEquity: (heroRange, villainRange, boardType) => {
      try {
        return deterministicEngine.getRangeVsRangeEquity(heroRange, villainRange, boardType);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 249: Tilt detection ═══
    detectTilt: () => {
      try {
        return deterministicEngine.detectTilt();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 250: Training dashboard ═══
    getTrainingDashboard: () => {
      try {
        return deterministicEngine.getTrainingDashboard();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 251: Structured explanation ═══
    structuredExplanation,
    // ═══ PHASE 254: Leak report ═══
    generateLeakReport: () => {
      try {
        return deterministicEngine.generateLeakReport();
      } catch (e) {
        return { leaks: [], summary: '' };
      }
    },
    // ═══ PHASE 255: Session grade ═══
    getSessionGrade: () => {
      // 2026-07-19 AUDIT FIX (wave-1 E2E): the review screen graded via TWO
      // systems at once — this returned deterministicEngine's internal grade
      // while other panels graded gtowScore, so one screen showed "C-" and
      // "D" simultaneously. Single source of truth: grade the GTOW score.
      try {
        const score = Number(gtowScoring.gtowScore) || 0;
        const GRADE_LABELS = {
          S: 'GTO Master', 'A+': 'Elite', A: 'Excellent', 'B+': 'Strong',
          B: 'Solid', 'C+': 'Developing', C: 'Learning', D: 'Struggling',
          F: 'Review Fundamentals',
        };
        const g = getScoreGrade(score);
        return { grade: g, label: GRADE_LABELS[g] || '', color: getScoreColor(score) };
      } catch (e) {
        return { grade: '-', label: 'N/A', color: '#64748b' };
      }
    },
    // ═══ PHASE 256: Spot difficulty ═══
    estimateSpotDifficulty: (frequencies, street, stackDepth, nodeType) => {
      try {
        return deterministicEngine.estimateSpotDifficulty(
          frequencies,
          street,
          stackDepth,
          nodeType
        );
      } catch (e) {
        return { difficulty: 3, label: 'Intermediate' };
      }
    },
    // ═══ PHASE 257: Improvement velocity ═══
    getImprovementVelocity: () => {
      try {
        return deterministicEngine.getImprovementVelocity();
      } catch (e) {
        return { velocity: 0, trend: 'INSUFFICIENT_DATA' };
      }
    },
    // ═══ PHASE 258: Drill prescription ═══
    prescribeDrills: () => {
      try {
        return deterministicEngine.prescribeDrills();
      } catch (e) {
        return [];
      }
    },
    // ═══ PHASE 259: Frequency mastery ═══
    getFrequencyMasteryScore: () => {
      try {
        return deterministicEngine.getFrequencyMasteryScore();
      } catch (e) {
        return { score: 0, label: 'No data' };
      }
    },
    // ═══ PHASE 260: Full session report ═══
    generateSessionReport: () => {
      try {
        return deterministicEngine.generateSessionReport();
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 261-270: Deep coaching intelligence ═══
    getTeachingPrinciple: (street, nodeType, correctAction, handStrength, texture) => {
      try {
        return deterministicEngine.getTeachingPrinciple(
          street,
          nodeType,
          correctAction,
          handStrength,
          texture
        );
      } catch (e) {
        return null;
      }
    },
    getPositionReminder: (heroPosition, street, nodeType) => {
      try {
        return deterministicEngine.getPositionReminder(heroPosition, street, nodeType);
      } catch (e) {
        return null;
      }
    },
    getTextureStrategyGuide: (texture, street, heroPosition, villainPosition) => {
      try {
        return deterministicEngine.getTextureStrategyGuide(
          texture,
          street,
          heroPosition,
          villainPosition
        );
      } catch (e) {
        return null;
      }
    },
    getSPRStrategyGuide: (estimatedPot, stackDepth) => {
      try {
        return deterministicEngine.getSPRStrategyGuide(estimatedPot, stackDepth);
      } catch (e) {
        return null;
      }
    },
    getVillainRangeNarration: (street, nodeType, villainActions) => {
      try {
        return deterministicEngine.getVillainRangeNarration(street, nodeType, villainActions);
      } catch (e) {
        return null;
      }
    },
    getMultiStreetPlanningGuide: (
      street,
      handStrength,
      optimalAction,
      estimatedPot,
      stackDepth
    ) => {
      try {
        return deterministicEngine.getMultiStreetPlanningGuide(
          street,
          handStrength,
          optimalAction,
          estimatedPot,
          stackDepth
        );
      } catch (e) {
        return null;
      }
    },
    getFrequencyCorrectionPrompt: () => {
      try {
        return deterministicEngine.getFrequencyCorrectionPrompt();
      } catch (e) {
        return null;
      }
    },
    getTiltRecoveryAdvice: () => {
      try {
        return deterministicEngine.getTiltRecoveryAdvice();
      } catch (e) {
        return null;
      }
    },
    getSessionPacingAnalysis: () => {
      try {
        return deterministicEngine.getSessionPacingAnalysis();
      } catch (e) {
        return null;
      }
    },
    estimateSpotDifficultyEnhanced: (
      frequencies,
      street,
      stackDepth,
      nodeType,
      heroPosition,
      villainPosition,
      handStrength,
      texture
    ) => {
      try {
        return deterministicEngine.estimateSpotDifficultyEnhanced(
          frequencies,
          street,
          stackDepth,
          nodeType,
          heroPosition,
          villainPosition,
          handStrength,
          texture
        );
      } catch (e) {
        return { difficulty: 3, label: 'Intermediate' };
      }
    },
    // ═══ PHASE 271-280: Advanced coaching + analytics ═══
    classifyHandStrength: (handCategory, boardTexture, street) => {
      try {
        return deterministicEngine.classifyHandStrength(handCategory, boardTexture, street);
      } catch (e) {
        return null;
      }
    },
    estimateEquityVsRange: (handCategory, street, nodeType, heroPosition, villainPosition) => {
      try {
        return deterministicEngine.estimateEquityVsRange(
          handCategory,
          street,
          nodeType,
          heroPosition,
          villainPosition
        );
      } catch (e) {
        return null;
      }
    },
    getActionEVComparison: (frequencies, correctAction, selectedAction) => {
      try {
        return deterministicEngine.getActionEVComparison(
          frequencies,
          correctAction,
          selectedAction
        );
      } catch (e) {
        return null;
      }
    },
    getSolverLineComparison: (selectedAction, correctAction, frequencies, street, nodeType) => {
      try {
        return deterministicEngine.getSolverLineComparison(
          selectedAction,
          correctAction,
          frequencies,
          street,
          nodeType
        );
      } catch (e) {
        return null;
      }
    },
    getConceptMasteryReport: () => {
      try {
        return deterministicEngine.getConceptMasteryReport();
      } catch (e) {
        return { concepts: [], overallMastery: 0 };
      }
    },
    generateHints: (frequencies, street, nodeType, handCategory, heroPosition, texture) => {
      try {
        return deterministicEngine.generateHints(
          frequencies,
          street,
          nodeType,
          handCategory,
          heroPosition,
          texture
        );
      } catch (e) {
        return { hints: [], currentLevel: 0, maxLevel: 0 };
      }
    },
    getRunoutImpactPreview: (handCategory, street, correctAction, boardTexture) => {
      try {
        return deterministicEngine.getRunoutImpactPreview(
          handCategory,
          street,
          correctAction,
          boardTexture
        );
      } catch (e) {
        return null;
      }
    },
    getMixedFrequencyDrillData: () => {
      try {
        return deterministicEngine.getMixedFrequencyDrillData();
      } catch (e) {
        return { mixedSpots: [], needsPractice: false };
      }
    },
    getHandCategoryBreakdown: () => {
      try {
        return deterministicEngine.getHandCategoryBreakdown();
      } catch (e) {
        return { categories: [] };
      }
    },
    getSessionComparison: (previousSessionData) => {
      try {
        return deterministicEngine.getSessionComparison(previousSessionData);
      } catch (e) {
        return null;
      }
    },
    // ═══ PHASE 281-290: Advanced analytics + coaching ═══
    getPreDecisionPreview: (handCategory, street, nodeType, heroPosition, frequencies) => {
      try {
        return deterministicEngine.getPreDecisionPreview(
          handCategory,
          street,
          nodeType,
          heroPosition,
          frequencies
        );
      } catch (e) {
        return null;
      }
    },
    getRunningActionFrequencies: () => {
      try {
        return deterministicEngine.getRunningActionFrequencies();
      } catch (e) {
        return null;
      }
    },
    getMistakeClusters: () => {
      try {
        return deterministicEngine.getMistakeClusters();
      } catch (e) {
        return { clusters: [], totalMistakes: 0 };
      }
    },
    getBoardCoverageAnalysis: () => {
      try {
        return deterministicEngine.getBoardCoverageAnalysis();
      } catch (e) {
        return null;
      }
    },
    getBluffToValueRatio: () => {
      try {
        return deterministicEngine.getBluffToValueRatio();
      } catch (e) {
        return null;
      }
    },
    getEVLossHeatmap: () => {
      try {
        return deterministicEngine.getEVLossHeatmap();
      } catch (e) {
        return null;
      }
    },
    getQuickFireReviewCards: () => {
      try {
        return deterministicEngine.getQuickFireReviewCards();
      } catch (e) {
        return [];
      }
    },
    generateFrequencyQuizQuestion: () => {
      try {
        return deterministicEngine.generateFrequencyQuizQuestion();
      } catch (e) {
        return null;
      }
    },
    getPositionLeaderboard: () => {
      try {
        return deterministicEngine.getPositionLeaderboard();
      } catch (e) {
        return null;
      }
    },
    generateCoachingSummary: () => {
      try {
        return deterministicEngine.generateCoachingSummary();
      } catch (e) {
        return { summary: '', tips: [] };
      }
    },

    // Phase 291-300: Advanced Training Intelligence II
    getStreakAnalysis: () => {
      try {
        return deterministicEngine.getStreakAnalysis();
      } catch (e) {
        return null;
      }
    },
    getTimePressureAnalysis: () => {
      try {
        return deterministicEngine.getTimePressureAnalysis();
      } catch (e) {
        return null;
      }
    },
    getRangeConstructionDrill: (position, nodeType) => {
      try {
        return deterministicEngine.getRangeConstructionDrill(position, nodeType);
      } catch (e) {
        return null;
      }
    },
    getExploitativeAdjustments: () => {
      try {
        return deterministicEngine.getExploitativeAdjustments();
      } catch (e) {
        return null;
      }
    },
    getICMPressureAnalysis: (stackSize, avgStack, playersLeft, payoutSpots) => {
      try {
        return deterministicEngine.getICMPressureAnalysis(
          stackSize,
          avgStack,
          playersLeft,
          payoutSpots
        );
      } catch (e) {
        return null;
      }
    },
    getMultiGameTypeStats: () => {
      try {
        return deterministicEngine.getMultiGameTypeStats();
      } catch (e) {
        return null;
      }
    },
    getBettingSizeAnalysis: () => {
      try {
        return deterministicEngine.getBettingSizeAnalysis();
      } catch (e) {
        return null;
      }
    },
    getHandReadingDrill: (street, villainActions) => {
      try {
        return deterministicEngine.getHandReadingDrill(street, villainActions);
      } catch (e) {
        return null;
      }
    },
    getVarianceSimulator: (winRate, sampleSize) => {
      try {
        return deterministicEngine.getVarianceSimulator(winRate, sampleSize);
      } catch (e) {
        return null;
      }
    },
    getPerformanceTrendAnalysis: () => {
      try {
        return deterministicEngine.getPerformanceTrendAnalysis();
      } catch (e) {
        return null;
      }
    },

    // Phase 301-310: Advanced Training Intelligence III
    getOptimalLineNarration: (
      correctAction,
      frequencies,
      street,
      nodeType,
      heroPosition,
      handCategory
    ) => {
      try {
        return deterministicEngine.getOptimalLineNarration(
          correctAction,
          frequencies,
          street,
          nodeType,
          heroPosition,
          handCategory
        );
      } catch (e) {
        return null;
      }
    },
    getStreetTransitionAnalysis: () => {
      try {
        return deterministicEngine.getStreetTransitionAnalysis();
      } catch (e) {
        return null;
      }
    },
    getDefenseFrequencyCheck: () => {
      try {
        return deterministicEngine.getDefenseFrequencyCheck();
      } catch (e) {
        return null;
      }
    },
    getPolarizationIndex: () => {
      try {
        return deterministicEngine.getPolarizationIndex();
      } catch (e) {
        return null;
      }
    },
    getMistakeRecoveryRate: () => {
      try {
        return deterministicEngine.getMistakeRecoveryRate();
      } catch (e) {
        return null;
      }
    },
    getConceptQuiz: () => {
      try {
        return deterministicEngine.getConceptQuiz();
      } catch (e) {
        return null;
      }
    },
    getSessionMilestones: () => {
      try {
        return deterministicEngine.getSessionMilestones();
      } catch (e) {
        return [];
      }
    },
    getAdaptiveDrillRecommendation: () => {
      try {
        return deterministicEngine.getAdaptiveDrillRecommendation();
      } catch (e) {
        return null;
      }
    },
    getCriticalHandHighlights: () => {
      try {
        return deterministicEngine.getCriticalHandHighlights();
      } catch (e) {
        return null;
      }
    },
    getComprehensiveSessionReport: () => {
      try {
        return deterministicEngine.getComprehensiveSessionReport();
      } catch (e) {
        return null;
      }
    },

    // Phase 311-320: Training Edge Features
    getNodeTypeBreakdown: () => {
      try {
        return deterministicEngine.getNodeTypeBreakdown();
      } catch (e) {
        return null;
      }
    },
    getActionTimeline: () => {
      try {
        return deterministicEngine.getActionTimeline();
      } catch (e) {
        return null;
      }
    },
    getStreetSpecificLeaks: () => {
      try {
        return deterministicEngine.getStreetSpecificLeaks();
      } catch (e) {
        return null;
      }
    },
    getOverbetAnalysis: () => {
      try {
        return deterministicEngine.getOverbetAnalysis();
      } catch (e) {
        return null;
      }
    },
    getCheckRaiseAnalysis: () => {
      try {
        return deterministicEngine.getCheckRaiseAnalysis();
      } catch (e) {
        return null;
      }
    },
    getCBetAnalysis: () => {
      try {
        return deterministicEngine.getCBetAnalysis();
      } catch (e) {
        return null;
      }
    },
    getPositionPairAnalysis: () => {
      try {
        return deterministicEngine.getPositionPairAnalysis();
      } catch (e) {
        return null;
      }
    },
    getFrequencyConvergenceTracker: () => {
      try {
        return deterministicEngine.getFrequencyConvergenceTracker();
      } catch (e) {
        return null;
      }
    },
    getSmartSessionLength: () => {
      try {
        return deterministicEngine.getSmartSessionLength();
      } catch (e) {
        return null;
      }
    },
    getTrainingPlan: () => {
      try {
        return deterministicEngine.getTrainingPlan();
      } catch (e) {
        return null;
      }
    },

    // Phase 321-330: Polish & Competitive Edge
    getHandStrengthDistribution: () => {
      try {
        return deterministicEngine.getHandStrengthDistribution();
      } catch (e) {
        return null;
      }
    },
    getAggressionProfile: () => {
      try {
        return deterministicEngine.getAggressionProfile();
      } catch (e) {
        return null;
      }
    },
    getWinRateByHandCategory: () => {
      try {
        return deterministicEngine.getWinRateByHandCategory();
      } catch (e) {
        return null;
      }
    },
    getTightLooseProfile: () => {
      try {
        return deterministicEngine.getTightLooseProfile();
      } catch (e) {
        return null;
      }
    },
    getBluffSpotAnalysis: () => {
      try {
        return deterministicEngine.getBluffSpotAnalysis();
      } catch (e) {
        return null;
      }
    },
    getValueBetAnalysis: () => {
      try {
        return deterministicEngine.getValueBetAnalysis();
      } catch (e) {
        return null;
      }
    },
    getSessionSummaryCard: () => {
      try {
        return deterministicEngine.getSessionSummaryCard();
      } catch (e) {
        return null;
      }
    },
    getDifficultyProgression: () => {
      try {
        return deterministicEngine.getDifficultyProgression();
      } catch (e) {
        return null;
      }
    },
    getWeaknessHeatmap: () => {
      try {
        return deterministicEngine.getWeaknessHeatmap();
      } catch (e) {
        return null;
      }
    },
    getGTOComplianceScore: () => {
      try {
        return deterministicEngine.getGTOComplianceScore();
      } catch (e) {
        return null;
      }
    },

    // Phase 331-340: Ultimate Training Intelligence
    getRangeBalanceScore: () => {
      try {
        return deterministicEngine.getRangeBalanceScore();
      } catch (e) {
        return null;
      }
    },
    getCheckBackAnalysis: () => {
      try {
        return deterministicEngine.getCheckBackAnalysis();
      } catch (e) {
        return null;
      }
    },
    getDonkBetAnalysis: () => {
      try {
        return deterministicEngine.getDonkBetAnalysis();
      } catch (e) {
        return null;
      }
    },
    getMultiWayPotAnalysis: () => {
      try {
        return deterministicEngine.getMultiWayPotAnalysis();
      } catch (e) {
        return null;
      }
    },
    getThinValueFrequency: () => {
      try {
        return deterministicEngine.getThinValueFrequency();
      } catch (e) {
        return null;
      }
    },
    getProtectionBetAnalysis: () => {
      try {
        return deterministicEngine.getProtectionBetAnalysis();
      } catch (e) {
        return null;
      }
    },
    getShowdownAnalysis: () => {
      try {
        return deterministicEngine.getShowdownAnalysis();
      } catch (e) {
        return null;
      }
    },
    getRiverDecisionQuality: () => {
      try {
        return deterministicEngine.getRiverDecisionQuality();
      } catch (e) {
        return null;
      }
    },
    getPreFlopLeaks: () => {
      try {
        return deterministicEngine.getPreFlopLeaks();
      } catch (e) {
        return null;
      }
    },
    getSessionProgressionChart: () => {
      try {
        return deterministicEngine.getSessionProgressionChart();
      } catch (e) {
        return null;
      }
    },

    // Phase 341-350: Mastery & Deep Analysis
    getEquityRealizationAnalysis: () => {
      try {
        return deterministicEngine.getEquityRealizationAnalysis();
      } catch (e) {
        return null;
      }
    },
    getPotControlAnalysis: () => {
      try {
        return deterministicEngine.getPotControlAnalysis();
      } catch (e) {
        return null;
      }
    },
    getBoardTextureQuiz: () => {
      try {
        return deterministicEngine.getBoardTextureQuiz();
      } catch (e) {
        return null;
      }
    },
    getStackDepthStrategy: (effectiveStack) => {
      try {
        return deterministicEngine.getStackDepthStrategy(effectiveStack);
      } catch (e) {
        return null;
      }
    },
    getMixedStrategyAccuracy: () => {
      try {
        return deterministicEngine.getMixedStrategyAccuracy();
      } catch (e) {
        return null;
      }
    },
    getEndgameReport: () => {
      try {
        return deterministicEngine.getEndgameReport();
      } catch (e) {
        return null;
      }
    },
    getPlaystyleEvolution: () => {
      try {
        return deterministicEngine.getPlaystyleEvolution();
      } catch (e) {
        return null;
      }
    },
    getKeyConceptReminders: (street, nodeType, heroPosition) => {
      try {
        return deterministicEngine.getKeyConceptReminders(street, nodeType, heroPosition);
      } catch (e) {
        return null;
      }
    },
    getNextSessionPrep: () => {
      try {
        return deterministicEngine.getNextSessionPrep();
      } catch (e) {
        return null;
      }
    },
    getUltimatePlayerRating: () => {
      try {
        return deterministicEngine.getUltimatePlayerRating();
      } catch (e) {
        return null;
      }
    },

    // Phase 355-356: Hand History Import + Game Tree
    importHandToTrainingQuestion: (parsedHand, targetStreet) => {
      try {
        return deterministicEngine.importHandToTrainingQuestion(parsedHand, targetStreet);
      } catch (e) {
        return null;
      }
    },
    buildDetailedGameTree: (spotData, heroHand, heroPosition, villainPosition, street) => {
      try {
        return deterministicEngine.buildDetailedGameTree(
          spotData,
          heroHand,
          heroPosition,
          villainPosition,
          street
        );
      } catch (e) {
        return null;
      }
    },

    // Actions
    submitAnswer,
    nextQuestion,
    startNextLevel,
    retryLevel,
    retrainMistakes,
    resetGame,
  };
}
