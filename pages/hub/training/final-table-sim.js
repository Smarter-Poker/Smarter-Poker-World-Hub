import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

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

  const totalChips = players.reduce((sum, p) => sum + (Number(p.stack) || 0), 0) || 1;

  // Naive ICM calculation implementation details (Independent Chip Model approximation)
  const calculateICM = () => {
    // This is a simplified ICM approximation for UI demonstration
    // Actual Malmuth-Harville requires deep permutation recursion
    let updated = players.map((p) => {
      const equityShare = p.stack / totalChips;
      // First place probability is roughly their chip percentage
      const p1 = equityShare;
      // Very rough approximation of total $ equity
      const icmValue = p1 * payouts[0] + (1 - p1) * (equityShare * payouts[1] * 2);
      return {
        ...p,
        icmValue: Math.max(0, icmValue),
      };
    });

    // Normalize to pool
    const totalPayout = payouts.reduce((a, b) => a + b, 0);
    const calcTotal = updated.reduce((a, p) => a + p.icmValue, 0);
    if (calcTotal > 0) {
      updated = updated.map((p) => ({
        ...p,
        icmValue: (p.icmValue / calcTotal) * totalPayout,
      }));
    }

    return updated;
  };

  const icmResults = calculateICM();

  const handleSaveSession = async () => {
    try {
      await fetch('/api/training/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: 'final-table-sim',
          stats: {
            players: players.length,
            totalChips,
          },
        }),
      });
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  };

  useEffect(() => {
    const t = setTimeout(handleSaveSession, 1000);
    return () => clearTimeout(t);
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
    <PageTransition>
      <Head>
        <title>Final Table Simulator | Smarter.Poker</title>
      </Head>
      <UniversalHeader />

      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => router.push('/hub/training')} style={styles.backButton}>
            ← Hub
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
                        color: p.name === 'Hero' ? '#00d4ff' : '#e2e8f0',
                      }}
                    >
                      {p.name}
                    </div>
                    <input
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
                  color: '#fbbf24',
                  fontSize: 24,
                  margin: '0 0 24px 0',
                }}
              >
                ICM $Equity Results
              </h2>

              <table style={styles.resultsTable}>
                <thead>
                  <tr>
                    <th style={styles.th}>Player</th>
                    <th style={styles.th}>Chip %</th>
                    <th style={styles.th}>Real $Equity (ICM)</th>
                  </tr>
                </thead>
                <tbody>
                  {icmResults
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
                            color: p.name === 'Hero' ? '#00d4ff' : '#fff',
                            fontWeight: p.name === 'Hero' ? 'bold' : 'normal',
                          }}
                        >
                          {p.name}
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            {formatNumber(p.stack)} chips
                          </div>
                        </td>
                        <td style={styles.td}>
                          {totalChips > 0 ? ((p.stack / totalChips) * 100).toFixed(1) : '0.0'}%
                        </td>
                        <td
                          style={{
                            ...styles.td,
                            color: '#4ade80',
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
                <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
                  Players often make deals using ICM numbers. If everyone agreed to chop the prize
                  pool right now based on skill equity:
                </p>
                <button style={styles.dealBtn}>Generate Deal Proposal</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
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
    color: '#fbbf24', // Gold theme for ICM/Money
  },
  subtitle: {
    margin: 0,
    color: '#94a3b8',
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
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 600,
  },
  payoutAmount: {
    color: '#4ade80',
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
    color: '#94a3b8',
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
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
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
