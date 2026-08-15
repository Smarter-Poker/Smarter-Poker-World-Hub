/**
 * MULTI-TABLE PRACTICE — Train on 2-4 Tables Simultaneously
 * ═══════════════════════════════════════════════════════════════════════════
 * Render multiple independent GodModeArena instances in a grid layout.
 * Combined stats across all tables. GTO Wizard-style multi-tabling.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-32 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-24 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// Dynamic import to avoid SSR issues with the Arena
const GodModeArena = dynamic(() => import('../../../src/components/training/GodModeArena'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--sp-fg-dim)' }}>Loading table...</div>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════
// GAME PRESETS FOR MULTI-TABLE
// ═══════════════════════════════════════════════════════════════════════════

// The timebank vocabulary, mirrored from SessionSetupModal's TIMER_OPTIONS and
// GodModeArena's TIMER_DURATIONS. Kept here as a whitelist so a stray or stale
// `?timer=` in a bookmarked URL cannot reach the arena as an unknown key.
const TIMER_MODES = { relaxed: 1, standard: 1, quick: 1, blitz: 1 };

// Same treatment for the other two setup-modal vocabularies that reach the
// arena through the query string. SPEED_OPTIONS and FEEDBACK_OPTIONS in
// SessionSetupModal are the source of these id sets.
const SPEED_MODES = { normal: 1, fast: 1, turbo: 1 };
const FEEDBACK_RULES = { every: 1, mistakes: 1 };

const MULTI_TABLE_GAMES = [
  { id: 'cash-002', name: '3-Bet Pots' },
  { id: 'cash-003', name: 'Continuation Betting' },
  { id: 'cash-004', name: 'Check-Raise Defense' },
  { id: 'cash-005', name: 'Blind Defense' },
  { id: 'mtt-001', name: 'ICM Preflop' },
  { id: 'mtt-002', name: 'Short Stack Play' },
  { id: 'mtt-003', name: 'Bubble Play' },
  { id: 'cash-006', name: 'River Decisions' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function MultiTablePage() {
  const router = useRouter();
  useTrainingBus('multi-table');
  const [tableCount, setTableCount] = useState(2);
  const [isStarted, setIsStarted] = useState(false);
  const [selectedGames, setSelectedGames] = useState([
    'cash-002',
    'cash-003',
    'cash-004',
    'cash-005',
  ]);
  const [combinedStats, setCombinedStats] = useState({
    totalHands: 0,
    totalCorrect: 0,
    totalEVLoss: 0,
    tablesCompleted: 0,
  });
  const [isAutoAdvance, setIsAutoAdvance] = useState(false);
  const [completedTables, setCompletedTables] = useState(new Set());
  const [showSummary, setShowSummary] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | 'error'
  const hasSavedRef = React.useRef(false);
  // #10: which tables have already contributed to combinedStats. See the
  // SESSION_END listener below for why this is a ref and not derived state.
  const reportedTablesRef = React.useRef(new Set());

  // #10: exactly one table owns the keyboard and the confetti canvas at a time.
  // Both are viewport-global in GodModeArena — the key handler is bound to
  // `window` and the confetti is position:fixed — so without a focus owner one
  // keypress answered every table and one table's win animation covered the
  // rest. Clicking a table makes it the owner; the first table owns it on load
  // so the keyboard works before the player has clicked anything.
  const [focusedGameId, setFocusedGameId] = useState(null);

  // #10: a phone cannot show two felts side by side.
  //
  // GodModeArena sizes itself from `window.innerWidth`, not from the box it is
  // actually rendered into -- isMobile, isNarrow and the whole scale-lock in
  // UniversalDynamicTable all read the viewport. In a 2-up grid on a 375px
  // phone each cell is 187px wide while the arena inside it still lays out for
  // 375. Measured on production: the board cards overlapped each other and the
  // hero's hole cards, the pot pill sat on top of the board, the drill-name
  // watermark ran through the cards, the EV LOSS / MISTAKES / STREAK /
  // DIFFICULTY strip ran its four labels together with no gap, and table one's
  // header chips were clipped by the cell boundary.
  //
  // Fixing this inside the arena means making a component every training game
  // depends on measure its own container instead of the viewport -- a change
  // with far more blast radius than this screen is worth. The real parity
  // answer is the one GTOW uses anyway: phones do not tile felts. Below the
  // break we show ONE table at a time and put the others behind a switcher.
  // Every arena stays mounted, so the hidden tables keep their hand, their
  // clock and their session; only their visibility changes.
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const check = () => setIsPhone(window.innerWidth < 700);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // #10: identifies one multi-table run. Each arena gets `<runId>-<gameId>` as
  // its sessionId; previously none of them got a sessionId at all.
  const [runId, setRunId] = useState('mt-0');

  // #10: the arena needs a real user id. This page never passed one, so every
  // table mounted with `userId` undefined — the question APIs authenticate by
  // Bearer token so questions still loaded, but per-user progress, mastery and
  // achievement writes had no subject.
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    try {
      setUserId(getAuthUser()?.id || null);
    } catch (e) {
      setUserId(null);
    }
  }, []);

  // #10: the setup modal on /hub/training now routes here when the player picks
  // more than one table, and forwards the drill and preferences it collected.
  // Honour them rather than making the player choose all over again.
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    const requested = parseInt(q.tables, 10);
    if (Number.isFinite(requested) && requested >= 2 && requested <= 4) {
      setTableCount(requested);
    }
    if (q.autoAdvance === '1') setIsAutoAdvance(true);
    if (typeof q.game === 'string' && q.game) {
      // Lead with the drill the player actually clicked, then fill the
      // remaining slots from the preset list without repeating it.
      setSelectedGames((prev) => {
        const rest = MULTI_TABLE_GAMES.map((g) => g.id).filter((id) => id !== q.game);
        return [q.game, ...rest];
      });
    }
  }, [router.isReady, router.query]);

  // #10: passed to every arena so none of them shows its own splash screen
  // asking for difficulty and timer a second time. Four tables meant four
  // splashes, each of which had to be dismissed before that table would deal.
  const arenaInitialConfig = useMemo(() => ({
    // #10 residual, shared prefs: N arenas share the 'gma_difficulty'
    // localStorage key, and useGTOTrainer re-reads it at question-serve time,
    // so one table's mid-game difficulty change used to bleed into every other
    // table's engine on its next deal. prefsScope: 'table' tells useGTOTrainer
    // to resolve difficulty from THIS config and ignore the shared key.
    //
    // Per-pref decisions:
    //   - difficulty: PER-TABLE (it shapes that table's questions) -- isolated
    //     here via prefsScope.
    //   - timer / speed / feedbackRule / handSelection / autoAdvance: already
    //     per-table -- each flows through this config or per-mount state, with
    //     no live-read of shared storage.
    //   - the 'gma_difficulty' / 'gma_timer' localStorage keys remain a
    //     cross-SESSION "last used" default read once at single-table mount;
    //     that is genuinely global and intentionally left shared.
    //
    // Deferred to the GodModeArena.jsx owner (file under concurrent perf
    // work; do not edit here) -- two changes to complete per-table behaviour:
    //   1. src/components/training/GodModeArena.jsx, difficulty-persist effect
    //      (currently `useEffect(() => { if (typeof window !== 'undefined')
    //      localStorage.setItem('gma_difficulty', difficulty); },
    //      [difficulty]);`): add
    //      `setTrainerConfig((c) => (c ? { ...c, difficulty } : c));`
    //      before the closing brace so a mid-game settings-panel change
    //      reaches the table's own engine through trainerConfig (the hook now
    //      prefers it under prefsScope: 'table').
    //   2. Same file, 'adaptiveDifficultyChange' listener ("Phase 8" effect):
    //      change `const { from, to, direction } = eventData || {};` to
    //      `const { from, to, direction, gameId: fromGameId } = eventData || {};
    //      if (fromGameId && String(fromGameId) !== String(gameId)) return;`
    //      and the effect deps from [] to [gameId]. useGTOTrainer now stamps
    //      gameId on the emission; without the filter every mounted table
    //      still toasts table A's adaptive level change.
    prefsScope: 'table',
    difficulty: typeof router.query.difficulty === 'string' ? router.query.difficulty : 'standard',
    // GTOW parity #4: 'off' is a value from the AUTO-ADVANCE vocabulary, not
    // the timebank one, which runs 'relaxed' | 'standard' | 'quick' | 'blitz'.
    // Handing it to the arena missed every entry in TIMER_DURATIONS and landed
    // on a 60-second fallback -- four times GTOW's longest timebank, and the
    // exact tier #4 removed. Measured live on the multi-table screen. Anything
    // unrecognised now means no timer, which is what 'off' was reaching for.
    timer: Object.prototype.hasOwnProperty.call(TIMER_MODES, router.query.timer)
      ? router.query.timer
      : 'relaxed',
    mode: 'standard',
    autoAdvance: isAutoAdvance,
    // GTOW parity #7: the hand-selection filter has to survive the hop through
    // the query string too, otherwise picking "Close only" and then 2 tables
    // silently reverted to the unfiltered set.
    handSelection: typeof router.query.handSelection === 'string' ? router.query.handSelection : 'all',
    // GTOW parity #9 and #6: the game-speed and feedback-rule choices were the
    // last two setup-modal settings that did not survive the hop to this route.
    // The single-table path forwards both; this one forwarded neither, so
    // picking Turbo and "Every action" and then 2 tables silently reverted to
    // Normal and "On mistakes". Same shape as the hand-selection defect above:
    // the control exists, the engine reads it, and the value never arrives.
    // Both are whitelisted rather than passed through, because speed resolves
    // to a DELAY -- an unknown key would land on the 3000ms Normal branch by
    // accident rather than by decision.
    speed: Object.prototype.hasOwnProperty.call(SPEED_MODES, router.query.speed)
      ? router.query.speed
      : 'normal',
    feedbackRule: Object.prototype.hasOwnProperty.call(FEEDBACK_RULES, router.query.feedbackRule)
      ? router.query.feedbackRule
      : 'mistakes',
    // Deliberately NOT `tables` — each arena here is a single table. The
    // wrapper's own multi-table branch was removed in this same change because
    // it rendered N identical copies of one drill.
  }), [router.query.difficulty, router.query.timer, router.query.handSelection,
       router.query.speed, router.query.feedbackRule, isAutoAdvance]);

  // The tables actually on screen, and which one currently owns the keyboard
  // and the confetti canvas. `focusedGameId` starts null so that it does not
  // have to be re-synced every time the table count or the drill list changes;
  // falling back to the first visible table here means the keyboard is live
  // from the first deal, before the player has clicked anything, and a focused
  // table that is removed from the grid hands focus back to table 1 instead of
  // stranding it on a game nobody can see.
  const visibleGames = useMemo(
    () => selectedGames.slice(0, tableCount),
    [selectedGames, tableCount],
  );
  const activeGameId =
    focusedGameId && visibleGames.includes(focusedGameId) ? focusedGameId : visibleGames[0];

  // Listen for session-complete events from each table (NOT from ourselves)
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (event) => {
      // CRITICAL: ignore our own emitted events to prevent infinite loop
      // EventBus passes entire event object: { type, payload, timestamp, source }
      const detail = event?.payload || event;
      const source = event?.source;
      if (source === 'MultiTable') return;

      const finishedId = detail?.gameId;
      if (!finishedId) return;

      // Only completions from OUR OWN run count. The bus mirrors every emit
      // across tabs, and `source` stays 'GodModeArena' on the far side, so a
      // second tab's finished table used to be folded into this run's totals
      // and could trip the all-tables-done auto-save -- writing a session row
      // for hands nobody played here. An arena mounted by this route always
      // carries `<runId>-<gameId>`; an arena from anywhere else carries a
      // sessionId that does not match, and one from an older build carries
      // none at all, which is equally not ours.
      if (String(detail?.sessionId || '') !== `${runId}-${finishedId}`) return;

      // GTOW parity #10 — payload key mismatch. This block used to read
      // `totalQuestions`, `handsPlayed` and `correctCount`, none of which
      // GodModeArena has ever emitted: its SESSION_END payload carries
      // `totalHands` / `questionsAnswered` and `questionsCorrect`. Every
      // lookup fell through to the `|| 0` default, so the combined stats bar,
      // the grade on the summary screen and the row written to
      // training_sessions all read zero no matter how well the player did.
      // Canonical keys first, older aliases kept as fallbacks.
      const hands = Number(
        detail?.totalHands ?? detail?.questionsAnswered ?? detail?.totalQuestions ?? detail?.handsPlayed ?? 0,
      );
      const correct = Number(detail?.questionsCorrect ?? detail?.correctCount ?? 0);
      const evLoss = Number(detail?.totalEVLoss ?? detail?.evLoss ?? 0);

      // A table that has already reported must not be counted twice.
      // GodModeArena emits SESSION_END once, but `onExit` ALSO marks a table
      // complete, so a player who finishes a table and then closes it hit both
      // paths — inflating `tablesCompleted` past the table count and
      // double-adding that table's hands. The guard is a ref rather than a
      // check inside the setState updater because React invokes updaters more
      // than once (StrictMode, concurrent re-render), and accumulating stats
      // from inside one would double-count on exactly the renders that are
      // hardest to reproduce.
      if (reportedTablesRef.current.has(finishedId)) return;
      reportedTablesRef.current.add(finishedId);

      setCompletedTables((prev) => new Set([...prev, finishedId]));
      setCombinedStats((s) => ({
        totalHands: s.totalHands + (Number.isFinite(hands) ? hands : 0),
        totalCorrect: s.totalCorrect + (Number.isFinite(correct) ? correct : 0),
        totalEVLoss: s.totalEVLoss + (Number.isFinite(evLoss) ? evLoss : 0),
        tablesCompleted: s.tablesCompleted + 1,
      }));
    });
    return unsub;
    // runId identifies the run this listener belongs to; re-subscribe when it
    // changes so a restarted run does not keep matching against the old id.
  }, [runId]);

  // Auto-save combined session when all tables complete
  useEffect(() => {
    if (completedTables.size >= tableCount && isStarted && !hasSavedRef.current) {
      hasSavedRef.current = true; // Prevent double save
      setSaveStatus('saving');
      const saveMultiSession = async () => {
        try {
          const user = getAuthUser();
          if (!user?.session?.access_token) {
            setSaveStatus('error');
            return;
          }

          const accuracy =
            combinedStats.totalHands > 0
              ? Math.round((combinedStats.totalCorrect / combinedStats.totalHands) * 100)
              : 0;

          await authedFetch('/api/training/save-session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              gameId: 'multi-table',
              gameName: `Multi-Table (${tableCount} tables)`,
              gtowScore: accuracy,
              totalEVLoss: combinedStats.totalEVLoss,
              handsPlayed: combinedStats.totalHands,
              mistakeCount: combinedStats.totalHands - combinedStats.totalCorrect,
              accuracy,
              correctCount: combinedStats.totalCorrect,
              bestStreak: 0,
              levelPassed: accuracy >= 60,
              level: tableCount,
              handHistory: [],
            }),
          });
          setSaveStatus('saved');

          eventBus?.emit?.(
            EventType?.SESSION_END || 'session:end',
            {
              gameId: 'multi-table',
              handsPlayed: combinedStats.totalHands,
              accuracy,
            },
            'MultiTable'
          );
        } catch (err) {
          console.warn('[MultiTable] Save error:', err);
          setSaveStatus('error');
        }
      };
      saveMultiSession();
      setShowSummary(true);
    }
  }, [completedTables.size, tableCount, isStarted, combinedStats]);

  // One column on a phone -- see the isPhone note. The tiled layout is only
  // ever used where a cell is wide enough for the arena to lay out into.
  const gridCols = isPhone ? '1fr' : 'repeat(2, 1fr)';
  const gridRows = isPhone || tableCount <= 2 ? '1fr' : 'repeat(2, 1fr)';

  return (
    <>
      <Head>
        <title>Multi-Table Practice | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Practice GTO decisions across 2-4 tables simultaneously. Build speed and accuracy under pressure."
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
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {showSummary ? (
          /* Results Summary Screen */
          <div
            style={{ padding: '40px 20px', maxWidth: 500, margin: '0 auto', textAlign: 'center' }}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              {(() => {
                const accuracy =
                  combinedStats.totalHands > 0
                    ? Math.round((combinedStats.totalCorrect / combinedStats.totalHands) * 100)
                    : 0;
                const grade =
                  accuracy >= 90
                    ? 'A'
                    : accuracy >= 80
                      ? 'B'
                      : accuracy >= 70
                        ? 'C'
                        : accuracy >= 60
                          ? 'D'
                          : 'F';
                const gradeColor = {
                  A: 'var(--sp-accent-green)',
                  B: 'var(--sp-accent-blue)',
                  C: 'var(--sp-accent-amber)',
                  D: 'var(--sp-accent-orange)',
                  F: 'var(--sp-accent-red)',
                }[grade];
                return (
                  <>
                    <div
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: '50%',
                        margin: '0 auto 20px',
                        background: `linear-gradient(135deg, ${gradeColor}30, ${gradeColor}15)`,
                        border: `3px solid ${gradeColor}60`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 48,
                        fontWeight: 900,
                        color: gradeColor,
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      }}
                    >
                      {grade}
                    </div>
                    <h2
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: 'var(--sp-fg)',
                        marginBottom: 4,
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      }}
                    >
                      SESSION COMPLETE
                    </h2>
                    <p style={{ fontSize: 12, color: 'var(--sp-fg-muted)', marginBottom: 24 }}>
                      {tableCount} tables · {combinedStats.totalHands} total decisions
                    </p>

                    {/* Save Status Indicator */}
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        marginBottom: 12,
                        color:
                          saveStatus === 'saved'
                            ? 'var(--sp-accent-green)'
                            : saveStatus === 'error'
                              ? 'var(--sp-accent-red)'
                              : 'var(--sp-fg-dim)',
                      }}
                    >
                      {saveStatus === 'saving' && 'Saving session...'}
                      {saveStatus === 'saved' && 'Saved to profile'}
                      {saveStatus === 'error' && 'Save failed — results still shown'}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 10,
                        marginBottom: 24,
                      }}
                    >
                      {[
                        { label: 'Accuracy', value: `${accuracy}%`, color: gradeColor },
                        {
                          label: 'EV Loss',
                          value: `${(Number.isFinite(combinedStats.totalEVLoss) ? combinedStats.totalEVLoss : 0).toFixed(1)}bb`,
                          color: (combinedStats.totalEVLoss || 0) < 5 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                        },
                        {
                          label: 'Correct',
                          value: `${combinedStats.totalCorrect}/${combinedStats.totalHands}`,
                          color: 'var(--sp-accent-cyan)',
                        },
                        {
                          label: 'Tables Done',
                          value: `${combinedStats.tablesCompleted}/${tableCount}`,
                          color: 'var(--sp-accent-purple)',
                        },
                      ].map((s, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 + i * 0.1 }}
                          style={{
                            padding: '14px 10px',
                            borderRadius: 12,
                            textAlign: 'center',
                            background: 'rgba(0,0,0,0.25)',
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 22,
                              fontWeight: 800,
                              color: s.color,
                              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}
                          >
                            {s.value}
                          </div>
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: 'var(--sp-fg-dim)',
                              textTransform: 'uppercase',
                              letterSpacing: 1,
                              marginTop: 4,
                            }}
                          >
                            {s.label}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setShowSummary(false);
                          // #10: a fresh run needs a fresh run id and a fresh
                          // reported-tables set, or the second run's tables are
                          // all treated as already-counted and contribute
                          // nothing to the combined stats.
                          setRunId(`mt-${Date.now()}`);
                          reportedTablesRef.current = new Set();
                          setCompletedTables(new Set());
                          setCombinedStats({
                            totalHands: 0,
                            totalCorrect: 0,
                            totalEVLoss: 0,
                            tablesCompleted: 0,
                          });
                          hasSavedRef.current = false;
                        }}
                        style={{
                          flex: 1,
                          padding: '14px',
                          borderRadius: 12,
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 800,
                          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                          background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-purple-rgb), 1))',
                          color: '#fff',
                          boxShadow: '0 4px 20px rgba(0,212,255,0.3)',
                        }}
                      >
                        PLAY AGAIN
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setShowSummary(false);
                          setIsStarted(false);
                          reportedTablesRef.current = new Set();
                          setCompletedTables(new Set());
                          setCombinedStats({
                            totalHands: 0,
                            totalCorrect: 0,
                            totalEVLoss: 0,
                            tablesCompleted: 0,
                          });
                          hasSavedRef.current = false;
                        }}
                        style={{
                          flex: 1,
                          padding: '14px',
                          borderRadius: 12,
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 700,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'var(--sp-fg-muted)',
                        }}
                      >
                        CHANGE CONFIG
                      </motion.button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        ) : !isStarted ? (
          /* Setup Screen */
          <div
            style={{ padding: '60px 20px', maxWidth: 500, margin: '0 auto', textAlign: 'center' }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>◆</div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                margin: '0 0 8px',
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-purple-rgb), 1))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Multi-Table Practice
            </h1>
            <p style={{ fontSize: 13, color: 'var(--sp-fg-muted)', marginBottom: 32 }}>
              Train on multiple tables simultaneously to build speed and accuracy under pressure.
            </p>

            {/* Table Count Selector */}
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                NUMBER OF TABLES
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                {[2, 3, 4].map((n) => (
                  <motion.button
                    key={n}
                    aria-label={`Select ${n} tables`}
                    aria-pressed={tableCount === n}
                    onClick={() => setTableCount(n)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 12,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 22,
                      fontWeight: 800,
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      background:
                        tableCount === n
                          ? 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-purple-rgb), 1))'
                          : 'rgba(255,255,255,0.04)',
                      color: tableCount === n ? '#fff' : 'var(--sp-fg-dim)',
                      border: tableCount === n ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {n}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Auto-Advance Toggle */}
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                BLITZ MODE
              </div>
              <div
                onClick={() => setIsAutoAdvance(!isAutoAdvance)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: isAutoAdvance ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isAutoAdvance ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: isAutoAdvance ? 'var(--sp-accent-green)' : 'var(--sp-fg)',
                    }}
                  >
                    Auto-Advance Hands
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>
                    Automatically deal next hand after answering
                  </div>
                </div>
                <div style={{ fontSize: 18 }}>{isAutoAdvance ? '⌁' : '↻'}</div>
              </div>
            </div>

            {/* Game Selection Grid */}
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                DRILLS (SELECT {tableCount})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {MULTI_TABLE_GAMES.map((g) => {
                  const isSelected =
                    selectedGames.indexOf(g.id) < tableCount && selectedGames.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() => {
                        setSelectedGames((prev) => {
                          if (prev.includes(g.id)) return prev.filter((x) => x !== g.id);
                          if (prev.length >= tableCount) return [...prev.slice(1), g.id];
                          return [...prev, g.id];
                        });
                      }}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 600,
                        textAlign: 'left',
                        background: isSelected ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
                        color: isSelected ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-muted)',
                        border: `1px solid ${isSelected ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <motion.button
              onClick={() => {
                // #10: one run id per START press. Each arena derives its own
                // sessionId from it, so the four tables in a run write four
                // distinct rows instead of colliding on one, and a PLAY AGAIN
                // starts a genuinely new run rather than appending to the last.
                setRunId(`mt-${Date.now()}`);
                reportedTablesRef.current = new Set();
                setIsStarted(true);
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: '14px 40px',
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 800,
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-purple-rgb), 1))',
                color: '#fff',
                boxShadow: '0 4px 20px rgba(0,212,255,0.3)',
              }}
            >
              START {tableCount} TABLES
            </motion.button>

            <button
              onClick={() => router.push('/hub/training')}
              style={{
                display: 'block',
                margin: '16px auto 0',
                padding: '8px 20px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'var(--sp-fg-dim)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ← Back to Training
            </button>
          </div>
        ) : (
          /* Playing Screen — Multi Table Grid */
          <>
            {/* Top Stats Bar */}
            <div
              style={{
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.3)',
              }}
            >
              <button
                onClick={() => {
                  setIsStarted(false);
                  reportedTablesRef.current = new Set();
                  setCompletedTables(new Set());
                  setCombinedStats({
                    totalHands: 0,
                    totalCorrect: 0,
                    totalEVLoss: 0,
                    tablesCompleted: 0,
                  });
                }}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  color: 'var(--sp-fg-muted)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                ← Exit
              </button>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sp-accent-cyan)',
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                {tableCount}-TABLE MODE
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 10 }}>
                <span style={{ color: 'var(--sp-accent-green)' }}>Hands: {combinedStats.totalHands}</span>
                <span style={{ color: 'var(--sp-accent-amber)' }}>Correct: {combinedStats.totalCorrect}</span>
                <span style={{ color: 'var(--sp-accent-red)' }}>
                  EV Loss:{' '}
                  {(Number.isFinite(combinedStats.totalEVLoss)
                    ? combinedStats.totalEVLoss
                    : 0
                  ).toFixed(1)}
                  bb
                </span>
                <span style={{ color: 'var(--sp-accent-purple)' }}>
                  Done: {completedTables.size}/{tableCount}
                </span>
              </div>
            </div>

            {/* Table switcher — phones only. See the isPhone note: below the
                break exactly one felt is on screen, so the player needs a way
                to reach the others. A completed table keeps its slot rather
                than disappearing, so the tab positions never shift under a
                thumb mid-session. */}
            {isPhone && visibleGames.length > 1 && (
              <div
                role="tablist"
                aria-label="Tables"
                style={{
                  display: 'flex',
                  gap: 6,
                  padding: '6px 10px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(0,0,0,0.25)',
                  overflowX: 'auto',
                }}
              >
                {visibleGames.map((gameId, i) => {
                  const isActive = gameId === activeGameId;
                  const isDone = completedTables.has(gameId);
                  return (
                    <button
                      key={gameId}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setFocusedGameId(gameId)}
                      style={{
                        flex: '0 0 auto',
                        minHeight: 34,
                        padding: '6px 14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        background: isActive
                          ? 'rgba(var(--sp-accent-cyan-rgb), 0.18)'
                          : 'rgba(255,255,255,0.05)',
                        color: isActive ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-muted)',
                        border: `1px solid ${
                          isDone
                            ? 'rgba(34,197,94,0.45)'
                            : isActive
                              ? 'rgba(var(--sp-accent-cyan-rgb), 0.55)'
                              : 'rgba(255,255,255,0.08)'
                        }`,
                      }}
                    >
                      TABLE {i + 1}
                      {isDone ? ' - DONE' : ''}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Table Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                gridTemplateRows: gridRows,
                height: `calc(100vh - ${isPhone && visibleGames.length > 1 ? 92 : 45}px)`,
                gap: 2,
              }}
            >
              {visibleGames.map((gameId, i) => (
                <div
                  key={gameId}
                  // #10: clicking anywhere in a table makes it the focus owner.
                  // Capture phase, because the arena's own controls sit on top
                  // and stop propagation on some of their handlers — without
                  // capture, clicking an action button would answer the wrong
                  // table's question without ever transferring focus to it.
                  onClickCapture={() => setFocusedGameId(gameId)}
                  style={{
                    // Hidden, not unmounted. Unmounting would restart the
                    // hidden table's drill from question one every time the
                    // player switched tabs; `display: none` keeps the arena's
                    // hand, clock and session intact. The felt's ResizeObserver
                    // ignores zero-sized entries, so it does not clobber its
                    // measured geometry while hidden and re-measures on return.
                    display: isPhone && gameId !== activeGameId ? 'none' : undefined,
                    overflow: 'hidden',
                    borderRadius: 0,
                    border: completedTables.has(gameId)
                      ? '2px solid rgba(34,197,94,0.3)'
                      : gameId === activeGameId
                        ? '2px solid rgba(var(--sp-accent-cyan-rgb), 0.55)'
                        : '1px solid rgba(255,255,255,0.04)',
                    position: 'relative',
                  }}
                >
                  {/* Table Number Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      zIndex: 10,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'rgba(0,212,255,0.2)',
                      border: '1px solid rgba(0,212,255,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      color: 'var(--sp-accent-cyan)',
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    }}
                  >
                    {i + 1}
                  </div>

                  {/* The 0.85 down-scale exists to fit a tiled cell. On a
                      phone the cell IS the viewport, so scaling it down just
                      shrinks the type for no reason -- and the arena has
                      already sized itself for this width. */}
                  <div
                    style={
                      isPhone
                        ? { width: '100%', height: '100%' }
                        : {
                            transform: 'scale(0.85)',
                            transformOrigin: 'top left',
                            width: '117.6%',
                            height: '117.6%',
                          }
                    }
                  >
                    <GodModeArena
                      gameId={gameId}
                      gameName={MULTI_TABLE_GAMES.find((g) => g.id === gameId)?.name || gameId}
                      level={1}
                      // #10: all four of these were missing. Without `userId`
                      // the arena had no subject to write progress for; without
                      // `sessionId` the tables could not be told apart; without
                      // `initialConfig` every table showed its own difficulty /
                      // timer splash that had to be dismissed before it dealt;
                      // and without `isFocused` one keypress answered all four
                      // tables at once and any table's win covered the screen.
                      userId={userId}
                      sessionId={`${runId}-${gameId}`}
                      initialConfig={arenaInitialConfig}
                      isFocused={gameId === activeGameId}
                      autoAdvance={isAutoAdvance}
                      onComplete={() => {}}
                      onExit={() => setCompletedTables((prev) => new Set([...prev, gameId]))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <ConnectionToast />
    </>
  );
}
