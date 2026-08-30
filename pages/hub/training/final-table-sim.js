// TRAIN-CSS-TOKENS-BATCH5-14 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-11 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// BUG FIX (TRAIN-FTS-A11Y-1): SVG back-arrow + button hardening for the
// final-table simulator. Page was already emoji-free in rendered output.
// Same surface-specific a11y pattern as PR #320/#322/#324/#327-#359.
const _FTS_ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function FtsBackArrowIcon({ size=14 }) {
  return (
    <svg {..._FTS_ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}


export default function FinalTableSimulator() {
  const router = useRouter();
  useTrainingBus('final-table-sim');

  const [players, setPlayers] = useState([
    { id: 1, name: 'Hero', stack: 500000 },
    { id: 2, name: 'Villain 1', stack: 1200000 },
    { id: 3, name: 'Villain 2', stack: 800000 },
    { id: 4, name: 'Villain 3', stack: 200000 },
    { id: 5, name: 'Villain 4', stack: 450000 },
  ]);

  const [payouts, setPayouts] = useState([5000, 3000, 2000, 1500, 1000]);
  const [icmResults, setIcmResults] = useState([]);
  const [calculating, setCalculating] = useState(true);
  const [calculationError, setCalculationError] = useState('');
  const [showDealProposal, setShowDealProposal] = useState(false);

  const totalChips = players.reduce((sum, p) => sum + (Number(p.stack) || 0), 0) || 1;

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setCalculating(true);
      setCalculationError('');
      setShowDealProposal(false);
      try {
        const response = await authedFetch('/api/training/icm-calc', {
          method: 'POST',
          body: JSON.stringify({ stacks: players.map((p) => p.stack), prizes: payouts }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success || !Array.isArray(payload.results)) {
          throw new Error(payload.error || `ICM Request Failed (${response.status})`);
        }
        if (!cancelled) {
          setIcmResults(players.map((player, index) => ({
            ...player,
            chipPct: payload.results[index]?.chipPct || 0,
            icmValue: payload.results[index]?.icmDollars || 0,
            icmDifference: payload.results[index]?.difference || 0,
          })));
        }
      } catch (error) {
        if (!cancelled) {
          setIcmResults([]);
          setCalculationError(error.message || 'Unable To Calculate ICM Equity.');
        }
      } finally {
        if (!cancelled) setCalculating(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [players, payouts]);

  const updateStack = (id, newStack) => {
    const val = Number(newStack);
    setPlayers(
      players.map((p) =>
        p.id === id ? { ...p, stack: Number.isFinite(val) && val >= 0 ? val : 0 } : p
      )
    );
  };

  const formatCurrency = (val) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  const formatNumber = (val) => new Intl.NumberFormat('en-US').format(val);

  return (
    <>
    <PageTransition>
      <Head>
        <title>Final Table Simulator | Smarter.Poker</title>
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
            {/* TRAIN-FTS-A11Y-1: SVG back arrow + visible label */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FtsBackArrowIcon size={14} />
              Hub
            </span>
          </button>
          <div>
            <h1 style={styles.title}>FINAL TABLE SIMULATOR</h1>
            <p style={styles.subtitle}>Independent Chip Model (ICM) Pressure Analysis</p>
          </div>
        </div>

        <div style={styles.content}>
          <div style={styles.leftCol}>
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Players & Stacks</h2>
              <div style={styles.playersList}>
                {players.map((p) => (
                  <div key={p.id} style={styles.playerRow}>
                    <div
                      style={{
                        ...styles.playerName,
                        color: p.name === 'Hero' ? 'var(--sp-accent-cyan)' : 'var(--sp-fg)',
                      }}
                    >
                      {p.name}
                    </div>
                    <input
                      aria-label={`${p.name} Stack`}
                      type="number"
                      value={p.stack}
                      onChange={(e) => updateStack(p.id, e.target.value)}
                      style={styles.playerInput}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Payout Structure</h2>
              <div style={styles.payoutsList}>
                {payouts.map((amount, i) => (
                  <div key={i} style={styles.payoutRow}>
                    <div style={styles.payoutPlace}>
                      {i + 1}
                      {i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} Place
                    </div>
                    <div style={styles.payoutAmount}>{formatCurrency(amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.rightCol}>
            <div style={styles.card}>
              <h2
                style={{
                  ...styles.cardTitle,
                  color: 'var(--sp-accent-amber)',
                  fontSize: 24,
                  margin: '0 0 24px 0',
                }}
              >
                ICM $Equity Results
              </h2>

              {calculating && <div style={{ color: 'var(--sp-accent-cyan)', fontSize: 12, marginBottom: 14 }}>Calculating Exact Malmuth-Harville ICM…</div>}
              {calculationError && <div role="alert" style={{ color: 'var(--sp-accent-red)', fontSize: 12, marginBottom: 14 }}>{calculationError}</div>}

              <table style={styles.resultsTable}>
                <thead>
                  <tr>
                    <th style={styles.th}>Player</th>
                    <th style={styles.th}>Chip %</th>
                    <th style={styles.th}>Real $Equity (ICM)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...icmResults]
                    .sort((a, b) => b.stack - a.stack)
                    .map((p) => (
                      <tr
                        key={p.id}
                        style={{
                          background: p.name === 'Hero' ? 'rgba(0,212,255,0.1)' : 'transparent',
                        }}
                      >
                        <td
                          style={{
                            ...styles.td,
                            color: p.name === 'Hero' ? 'var(--sp-accent-cyan)' : '#fff',
                            fontWeight: p.name === 'Hero' ? 'bold' : 'normal',
                          }}
                        >
                          {p.name}
                          <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>
                            {formatNumber(p.stack)} chips
                          </div>
                        </td>
                        <td style={styles.td}>
                          {Number(p.chipPct || 0).toFixed(1)}%
                        </td>
                        <td
                          style={{
                            ...styles.td,
                            color: 'var(--sp-accent-green)',
                            fontWeight: 'bold',
                            fontSize: 18,
                          }}
                        >
                          {formatCurrency(p.icmValue)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <div style={styles.dealBox}>
                <h3>Chip Chop (Deal-Making Tool)</h3>
                <p style={{ color: 'var(--sp-fg-muted)', fontSize: 13, marginBottom: 16 }}>
                  Players often make deals using ICM numbers. If everyone agreed to chop the prize
                  pool right now based on skill equity:
                </p>
                <button
                  type="button"
                  onClick={() => setShowDealProposal((visible) => !visible)}
                  disabled={calculating || icmResults.length === 0}
                  style={{ ...styles.dealBtn, opacity: calculating || icmResults.length === 0 ? 0.5 : 1, cursor: calculating || icmResults.length === 0 ? 'not-allowed' : 'pointer' }}
                >
                  {showDealProposal ? 'Hide ICM Deal Proposal' : 'Generate ICM Deal Proposal'}
                </button>
                {showDealProposal && (
                  <div style={{ marginTop: 14, border: '1px solid rgba(251,191,36,.22)', background: 'rgba(0,0,0,.22)', padding: 14 }}>
                    {[...icmResults].sort((a, b) => b.icmValue - a.icmValue).map((player) => (
                      <div key={player.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', color: 'var(--sp-fg-muted)', fontSize: 12 }}>
                        <span>{player.name}</span>
                        <strong style={{ color: 'var(--sp-accent-green)' }}>{formatCurrency(player.icmValue)}</strong>
                      </div>
                    ))}
                    <div style={{ marginTop: 8, color: 'var(--sp-fg-faint)', fontSize: 10, lineHeight: 1.5 }}>Strategic training output only. A real deal requires every player’s agreement and tournament approval.</div>
                  </div>
                )}
              </div>
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
    fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
    letterSpacing: 1,
    color: 'var(--sp-accent-amber)', // Gold theme for ICM/Money
  },
  subtitle: {
    margin: 0,
    color: 'var(--sp-fg-muted)',
    fontSize: 14,
  },
  content: {
    display: 'flex',
    gap: 24,
    alignItems: 'flex-start',
  },
  leftCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  rightCol: {
    flex: 2,
  },
  card: {
    background: 'rgba(10, 15, 30, 0.6)',
    border: '1px solid rgba(251, 191, 36, 0.2)',
    borderRadius: 16,
    padding: 24,
  },
  cardTitle: {
    margin: '0 0 16px 0',
    color: '#fff',
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(0,0,0,0.3)',
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.05)',
  },
  playerName: {
    fontWeight: 600,
    fontSize: 14,
  },
  playerInput: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    padding: '6px 12px',
    borderRadius: 6,
    width: 120,
    textAlign: 'right',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  payoutsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  payoutRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  payoutPlace: {
    color: 'var(--sp-fg-muted)',
    fontSize: 14,
    fontWeight: 600,
  },
  payoutAmount: {
    color: 'var(--sp-accent-green)',
    fontWeight: 'bold',
  },
  resultsTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: 32,
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    color: 'var(--sp-fg-muted)',
    borderBottom: '2px solid rgba(255,255,255,0.1)',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  td: {
    padding: '16px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    verticalAlign: 'middle',
  },
  dealBox: {
    background: 'rgba(0,0,0,0.3)',
    padding: 24,
    borderRadius: 12,
    border: '1px dashed rgba(251, 191, 36, 0.3)',
  },
  dealBtn: {
    background: 'linear-gradient(135deg, rgba(var(--sp-accent-amber-rgb), 1), #f59e0b)',
    color: '#000',
    padding: '12px 24px',
    border: 'none',
    borderRadius: 8,
    fontWeight: 800,
    fontSize: 14,
    cursor: 'pointer',
    width: '100%',
    textTransform: 'uppercase',
  },
};
