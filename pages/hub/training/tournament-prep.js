// TRAIN-CSS-TOKENS-BATCH5-59 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// BUG FIX (TRAIN-TPP-A11Y-1): SVG icons replacing the bare back-arrow + 💡
// strategy-tip lightbulb. Strict build-safety rules from PR #362/#365/#369
// — no JSX comments inside conditional expressions, no emoji chars in
// legacy fallback strings. Same surface-specific a11y pattern as PR
// #320/#322/#324/#327-#361/#373/#375.
const _TPP_ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function TppBackArrowIcon({ size = 14 }) {
  return (
    <svg {..._TPP_ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}
function TppLightbulbIcon({ size = 14 }) {
  return (
    <svg {..._TPP_ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.65V17h8v-2.35A7 7 0 0 0 12 2z" />
    </svg>
  );
}


export default function TournamentPrepPlanner() {
  const router = useRouter();
  useTrainingBus('tournament-prep');

  const [buyIn, setBuyIn] = useState(109);
  const [startStack, setStartStack] = useState(10000);
  const [blindLevelLength, setBlindLevelLength] = useState(15);
  const [currentLevel, setCurrentLevel] = useState(1);

  // Derived states
  const bls = [
    { level: 1, sb: 25, bb: 50, ante: 5 },
    { level: 2, sb: 50, bb: 100, ante: 10 },
    { level: 3, sb: 75, bb: 150, ante: 15 },
    { level: 4, sb: 100, bb: 200, ante: 25 },
    { level: 5, sb: 150, bb: 300, ante: 40 },
    { level: 6, sb: 200, bb: 400, ante: 50 },
    { level: 7, sb: 250, bb: 500, ante: 60 },
    { level: 8, sb: 300, bb: 600, ante: 75 },
    { level: 9, sb: 400, bb: 800, ante: 100 },
    { level: 10, sb: 500, bb: 1000, ante: 125 },
    { level: 11, sb: 600, bb: 1200, ante: 150 },
    { level: 12, sb: 800, bb: 1600, ante: 200 },
  ];

  const currentBlindInfo = bls.find((b) => b.level === currentLevel) || bls[bls.length - 1];
  const mDenom = currentBlindInfo.sb + currentBlindInfo.bb + currentBlindInfo.ante * 9;
  const initialM = mDenom > 0 ? startStack / mDenom : 0;
  const initialBBs = currentBlindInfo.bb > 0 ? startStack / currentBlindInfo.bb : 0;

  const [activeTab, setActiveTab] = useState('structure');

  // Save session payload function standard
  const saveToSession = async () => {
    try {
      await authedFetch('/api/training/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: 'tournament-prep',
          stats: {
            buyIn,
            startStack,
            currentLevel,
          },
        }),
      });
    } catch (e) {
      console.warn('Failed to save session:', e);
    }
  };

  useEffect(() => {
    saveToSession();
  }, [buyIn, startStack, currentLevel]);

  return (
    <>
    <PageTransition>
      <Head>
        <title>Tournament Prep Planner | Smarter.Poker</title>
      </Head>
      <UniversalHeader pageDepth={2} hideLeftIcon />

      <div style={styles.container}>
        <div style={styles.header}>
          <button
            type="button"
            aria-label="Back to training hub"
            onClick={() => router.push('/hub/training')}
            style={styles.backButton}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <TppBackArrowIcon size={14} />
              Hub
            </span>
          </button>
          <div>
            <h1 style={styles.title}>TOURNAMENT PREP PLANNER</h1>
            <p style={styles.subtitle}>ICM-Aware Strategy & Structure Analysis</p>
          </div>
        </div>

        <div style={styles.content}>
          {/* LEFT COLUMN: Controls */}
          <div style={styles.sidebar}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Tournament Settings</h3>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Buy-In ($)</label>
                <input
                  type="number"
                  value={buyIn}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setBuyIn(Number.isFinite(v) && v >= 0 ? v : 0);
                  }}
                  style={styles.input}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Starting Stack</label>
                <input
                  type="number"
                  value={startStack}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStartStack(Number.isFinite(v) && v >= 0 ? v : 0);
                  }}
                  style={styles.input}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Blind Level Length (min)</label>
                <input
                  type="number"
                  value={blindLevelLength}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setBlindLevelLength(Number.isFinite(v) && v >= 1 ? v : 1);
                  }}
                  style={styles.input}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Current Level</label>
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={currentLevel}
                  onChange={(e) => setCurrentLevel(Number(e.target.value))}
                  style={styles.range}
                />
                <div style={styles.rangeLabels}>
                  <span>Lvl 1</span>
                  <span style={{ color: 'var(--sp-accent-cyan)', fontWeight: 'bold' }}>Level {currentLevel}</span>
                  <span>Lvl 12</span>
                </div>
              </div>
            </div>

            <div style={{ ...styles.card, marginTop: 16 }}>
              <h3 style={styles.cardTitle}>Current Status</h3>
              <div style={styles.statusRow}>
                <span style={styles.statusLabel}>Blinds</span>
                <span style={styles.statusValue}>
                  {currentBlindInfo.sb}/{currentBlindInfo.bb}
                </span>
              </div>
              <div style={styles.statusRow}>
                <span style={styles.statusLabel}>Ante</span>
                <span style={styles.statusValue}>{currentBlindInfo.ante}</span>
              </div>
              <div style={styles.statusRow}>
                <span style={styles.statusLabel}>Starting Stack in BBs</span>
                <span
                  style={{ ...styles.statusValue, color: initialBBs < 20 ? 'var(--sp-accent-red)' : 'var(--sp-accent-green)' }}
                >
                  {Number.isFinite(initialBBs) ? (Number.isFinite(Number(initialBBs)) ? Number(initialBBs) : 0).toFixed(1) : '0.0'} BB
                </span>
              </div>
              <div style={styles.statusRow}>
                <span style={styles.statusLabel}>Starting Stack M-Ratio</span>
                <span style={styles.statusValue}>
                  {Number.isFinite(initialM) ? (Number.isFinite(Number(initialM)) ? Number(initialM) : 0).toFixed(1) : '0.0'}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Analysis Display */}
          <div style={styles.main}>
            <div style={styles.tabs}>
              <button
                type="button"
                aria-label="View Structure Flow"
                aria-pressed={activeTab === 'structure'}
                onClick={() => setActiveTab('structure')}
                style={{
                  ...styles.tab,
                  borderBottom:
                    activeTab === 'structure' ? '2px solid #00d4ff' : '2px solid transparent',
                  color: activeTab === 'structure' ? '#fff' : 'var(--sp-fg-dim)',
                }}
              >
                Structure Flow
              </button>
              <button
                type="button"
                aria-label="View Push/Fold"
                aria-pressed={activeTab === 'pushfold'}
                onClick={() => setActiveTab('pushfold')}
                style={{
                  ...styles.tab,
                  borderBottom:
                    activeTab === 'pushfold' ? '2px solid #00d4ff' : '2px solid transparent',
                  color: activeTab === 'pushfold' ? '#fff' : 'var(--sp-fg-dim)',
                }}
              >
                Push/Fold Engine
              </button>
            </div>

            <div style={styles.tabContent}>
              {activeTab === 'structure' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <h3 style={{ color: '#fff', marginBottom: 16 }}>Blind Structure Projections</h3>
                  <div style={styles.table}>
                    <div style={styles.tableHeaderRow}>
                      <div style={styles.cellH}>Level</div>
                      <div style={styles.cellH}>Blinds</div>
                      <div style={styles.cellH}>Stack (If No Hands Played)</div>
                      <div style={styles.cellH}>Zone</div>
                    </div>
                    {bls.map((b) => {
                      const costPerOrbit = b.sb + b.bb + b.ante * 9;
                      // Rough estimation of stack drain assuming 3 orbits per level
                      let estStack = startStack;
                      for (let i = 1; i <= b.level; i++) {
                        const lvlInfo = bls[i - 1];
                        const drain = (lvlInfo.sb + lvlInfo.bb + lvlInfo.ante * 9) * 3;
                        if (i < b.level) estStack -= drain;
                      }
                      const bbCount = b.bb > 0 ? estStack / b.bb : 0;

                      let zone =
                        bbCount > 40
                          ? 'Green (Comfort)'
                          : bbCount > 20
                            ? 'Yellow (Active)'
                            : bbCount > 10
                              ? 'Orange (Steal)'
                              : 'Red (Push/Fold)';
                      let zColor =
                        bbCount > 40
                          ? 'var(--sp-accent-green)'
                          : bbCount > 20
                            ? 'var(--sp-accent-amber)'
                            : bbCount > 10
                              ? 'var(--sp-accent-orange)'
                              : 'var(--sp-accent-red)';

                      return (
                        <div
                          key={b.level}
                          style={{
                            ...styles.tableRow,
                            background:
                              currentLevel === b.level ? 'rgba(0,212,255,0.1)' : 'transparent',
                            borderLeft:
                              currentLevel === b.level
                                ? '3px solid #00d4ff'
                                : '3px solid transparent',
                          }}
                        >
                          <div style={styles.cell}>{b.level}</div>
                          <div style={styles.cell}>
                            {b.sb}/{b.bb} ({b.ante})
                          </div>
                          <div style={styles.cell}>
                            {Math.max(0, estStack)} ({Math.max(0, bbCount).toFixed(1)} BB)
                          </div>
                          <div style={{ ...styles.cell, color: zColor, fontWeight: 'bold' }}>
                            {estStack <= 0 ? 'BUSTED' : zone}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {activeTab === 'pushfold' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <h3 style={{ color: '#fff', marginBottom: 16 }}>Nash Equilibrium Push/Fold</h3>
                  <p style={{ color: 'var(--sp-fg-muted)', fontSize: 13, marginBottom: 20 }}>
                    Calculated for your estimated stack depth at Level {currentLevel} (
                    {Number.isFinite(initialBBs) ? (Number.isFinite(Number(initialBBs)) ? Number(initialBBs) : 0).toFixed(1) : '0.0'} BB initial,
                    currently ~
                    {currentBlindInfo.bb > 0
                      ? (Number.isFinite(Number(startStack / currentBlindInfo.bb)) ? Number(startStack / currentBlindInfo.bb) : 0).toFixed(1)
                      : '0.0'}{' '}
                    BB effective).
                  </p>

                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ ...styles.card, flex: 1 }}>
                      <h4 style={{ color: 'var(--sp-accent-cyan)', margin: '0 0 12px 0' }}>UTG/Early Position</h4>
                      <p style={{ color: 'var(--sp-fg)', fontSize: 13, lineHeight: 1.5 }}>
                        Push: 77+, A9s+, AJo+, KTs+, KQo
                        <br />
                        <span style={{ color: 'var(--sp-accent-red)' }}>Fold everything else.</span> The danger
                        of calling off with medium stacks is immense.
                      </p>
                    </div>
                    <div style={{ ...styles.card, flex: 1 }}>
                      <h4 style={{ color: 'var(--sp-accent-green)', margin: '0 0 12px 0' }}>BTN/Late Position</h4>
                      <p style={{ color: 'var(--sp-fg)', fontSize: 13, lineHeight: 1.5 }}>
                        Push: 22+, A2s+, A2o+, K2s+, K8o+, Q8s+, QTo+, J8s+, T8s+, 98s
                        <br />
                        <span style={{ color: 'var(--sp-accent-green)' }}>Expand shoving range</span> to exploit
                        tight blinds.
                      </p>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 20,
                      padding: 16,
                      background: 'rgba(0,212,255,0.05)',
                      borderRadius: 12,
                      border: '1px solid rgba(0,212,255,0.1)',
                    }}
                  >
                    <h4 style={{ color: '#fff', margin: '0 0 8px 0' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--sp-accent-amber)' }}>
                        <TppLightbulbIcon size={14} />
                        Strategy Tip (Level {currentLevel})
                      </span>
                    </h4>
                    <p style={{ color: 'var(--sp-fg-muted)', fontSize: 14, margin: 0 }}>
                      {initialBBs < 20
                        ? 'You are in the pure Push/Fold territory. Do not open-raise to fold. Only shove or fold preflop to maximize fold equity.'
                        : 'You have room to maneuver. Use smaller open sizes (2x - 2.2x) to preserve your stack while stealing blinds.'}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
    <ConnectionToast />
    </>
  );
}

const styles = {
  container: {
    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
    background: 'linear-gradient(180deg, #05050A 0%, #0A0A15 100%)',
    padding: '24px 4vw 80px',
    color: '#fff',
    fontFamily: "'Inter', sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginBottom: 32,
    paddingBottom: 24,
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  backButton: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: 28,
    fontWeight: 900,
    fontFamily: 'Orbitron, sans-serif',
    letterSpacing: 1,
    color: 'var(--sp-accent-cyan)',
  },
  subtitle: {
    margin: 0,
    color: 'var(--sp-fg-muted)',
    fontSize: 14,
  },
  content: {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
  },
  sidebar: {
    flex: '1 1 300px',
    maxWidth: 400,
  },
  main: {
    flex: '3 1 600px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 24,
  },
  card: {
    background: 'rgba(10, 15, 30, 0.6)',
    border: '1px solid rgba(0, 212, 255, 0.15)',
    borderRadius: 12,
    padding: 20,
  },
  cardTitle: {
    marginTop: 0,
    marginBottom: 16,
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'var(--sp-accent-cyan)',
    fontWeight: 700,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: 'var(--sp-fg-muted)',
    marginBottom: 6,
    fontWeight: 600,
  },
  input: {
    width: '100%',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '10px 12px',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
  },
  range: {
    width: '100%',
    accentColor: 'var(--sp-accent-cyan)',
    cursor: 'pointer',
  },
  rangeLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: 'var(--sp-fg-dim)',
    marginTop: 6,
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  statusLabel: {
    color: 'var(--sp-fg-muted)',
    fontSize: 13,
  },
  statusValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
  },
  tabs: {
    display: 'flex',
    gap: 24,
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    marginBottom: 24,
  },
  tab: {
    background: 'transparent',
    padding: '12px 4px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabContent: {
    minHeight: 400,
  },
  table: {
    width: '100%',
    fontSize: 13,
  },
  tableHeaderRow: {
    display: 'flex',
    background: 'rgba(255,255,255,0.05)',
    padding: '10px 16px',
    borderRadius: 8,
    fontWeight: 700,
    color: 'var(--sp-fg-muted)',
    marginBottom: 8,
  },
  tableRow: {
    display: 'flex',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
  },
  cellH: { flex: 1 },
  cell: { flex: 1, color: 'var(--sp-fg)' },
};