/**
 * ICM SIMULATOR — Final Table Math
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Independent Chip Model equity calculator. Maps chips to real $.
 *
 * Route: /hub/training/icm-simulator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-25 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-21 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';

// Simple exact ICM calculation for up to 6 players
function calculateICM(stacks, payouts) {
  const n = stacks.length;
  let equities = new Array(n).fill(0);
  const totalChips = stacks.reduce((a, b) => a + b, 0);
  if (totalChips === 0) return equities;

  // Helper for combinations
  function getPermutations(arr) {
    if (arr.length <= 1) return [arr];
    let perms = [];
    for (let i = 0; i < arr.length; i++) {
      const first = arr[i];
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      getPermutations(rest).forEach((subPerm) => perms.push([first, ...subPerm]));
    }
    return perms;
  }

  // Limit to top 3 payouts for performance in UI mock if needed, but exact handles 6!
  const numPayouts = Math.min(n, payouts.length);
  const validPayouts = payouts.slice(0, numPayouts);

  if (n <= 6) {
    // Exact Malmuth-Weitzman via Permutations for small sets
    const indices = stacks.map((_, i) => i);
    const perms = getPermutations(indices);

    perms.forEach((perm) => {
      let prob = 1.0;
      let currentTotal = totalChips;
      let pEquity = new Array(n).fill(0);

      for (let place = 0; place < numPayouts; place++) {
        const playerIdx = perm[place];
        const p = stacks[playerIdx] / currentTotal;
        prob *= p;
        currentTotal -= stacks[playerIdx];
        pEquity[playerIdx] += validPayouts[place];
      }

      pEquity.forEach((e, idx) => {
        equities[idx] += prob * e;
      });
    });
  } else {
    // Fallback for N>6 (not used in this UI, but safeguards) - using chip EV
    stacks.forEach((s, i) => {
      equities[i] = (s / totalChips) * validPayouts.reduce((a, b) => a + b, 0);
    });
  }

  return equities;
}

export default function IcmSimulatorPage() {
  const router = useRouter();
  useTrainingBus('icm-simulator');

  const [players, setPlayers] = useState([
    { id: 1, name: 'Hero', stack: 500000 },
    { id: 2, name: 'Villain A', stack: 1200000 },
    { id: 3, name: 'Villain B', stack: 300000 },
    { id: 4, name: 'Villain C', stack: 850000 },
  ]);

  const [payouts, setPayouts] = useState([5000, 3000, 1500, 500]);
  const [equities, setEquities] = useState([]);
  const [calculating, setCalculating] = useState(false);



  const runSim = () => {
    setCalculating(true);
    setTimeout(() => {
      const stacks = players.map((p) => Number(p.stack) || 0);
      const pays = payouts.map((p) => Number(p) || 0);
      const res = calculateICM(stacks, pays);
      setEquities(res);
      setCalculating(false);

      // Persist session with auth
      const token = getAccessToken();
      if (token) {
        authedFetch('/api/training/save-session', {
          method: 'POST',
          body: JSON.stringify({ game_id: 'icm-simulator', hands_played: 1, accuracy: 100 }),
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      }
    }, 500);
  };

  const totalPrizePool = payouts.reduce((a, b) => a + (Number(b) || 0), 0);
  const totalChips = players.reduce((a, b) => a + (Number(b.stack) || 0), 0);

  return (
    <>
      <Head>
        <title>ICM Simulator | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: '#0a0a1a',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              marginRight: 16,
            }}
          >
            ←
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>ICM Simulator</div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Final Table Math & Deal Calculator</div>
          </div>
        </div>

        <div
          style={{
            maxWidth: 800,
            margin: '40px auto',
            display: 'flex',
            gap: 32,
            padding: '0 20px',
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Inputs */}
          <div style={{ flex: '1 1 300px' }}>
            <div
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 16,
                padding: 24,
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--sp-accent-cyan)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 16,
                }}
              >
                Prize Pool Structure
              </div>
              {payouts.map((p, i) => (
                <div
                  key={`payout-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 8,
                    background: 'rgba(255,255,255,0.02)',
                    padding: '8px 12px',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ width: 40, fontSize: 12, fontWeight: 700, color: 'var(--sp-fg-muted)' }}>
                    {i + 1}
                    {i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--sp-accent-green)', marginRight: 8 }}>$</div>
                  <input
                    type="number"
                    value={p}
                    onChange={(e) => {
                      const arr = [...payouts];
                      arr[i] = e.target.value;
                      setPayouts(arr);
                    }}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: '#fff',
                      fontSize: 14,
                      outline: 'none',
                      fontWeight: 600,
                    }}
                  />
                </div>
              ))}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '12px 12px 0',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--sp-fg-dim)', fontWeight: 700 }}>
                  Total Prizepool:
                </span>
                <span style={{ fontSize: 14, color: 'var(--sp-accent-green)', fontWeight: 800 }}>
                  ${totalPrizePool.toLocaleString()}
                </span>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 16,
                padding: 24,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--sp-accent-amber)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Player Stacks
                </div>
                <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>
                  Total: {totalChips.toLocaleString()}
                </div>
              </div>

              {players.map((p, i) => (
                <div
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 12 }}
                >
                  <input
                    value={p.name}
                    onChange={(e) => {
                      const arr = [...players];
                      arr[i].name = e.target.value;
                      setPlayers(arr);
                    }}
                    style={{
                      width: 100,
                      background: 'rgba(255,255,255,0.05)',
                      border:
                        p.id === 1 ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
                      color: p.id === 1 ? 'var(--sp-accent-cyan)' : 'var(--sp-fg)',
                      padding: '10px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: p.id === 1 ? 700 : 500,
                      outline: 'none',
                    }}
                  />
                  <input
                    type="number"
                    value={p.stack}
                    onChange={(e) => {
                      const arr = [...players];
                      arr[i].stack = e.target.value;
                      setPlayers(arr);
                    }}
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,0.02)',
                      border: 'none',
                      color: '#fff',
                      padding: '10px 12px',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      outline: 'none',
                    }}
                  />
                </div>
              ))}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={runSim}
                disabled={calculating}
                style={{
                  width: '100%',
                  marginTop: 24,
                  padding: 16,
                  background: 'linear-gradient(135deg, rgba(var(--sp-accent-blue-rgb), 1), #8b5cf6)',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(59,130,246,0.3)',
                }}
              >
                {calculating ? 'CALCULATING (N!)...' : 'RUN ICM SOLVER'}
              </motion.button>
            </div>
          </div>

          {/* Right: Output */}
          <div style={{ flex: '1 1 350px' }}>
            <div
              style={{
                background: 'rgba(15,23,42,0.8)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 16,
                padding: 32,
                height: '100%',
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8, color: '#fff' }}>
                ICM Value Distribution
              </div>
              <div style={{ fontSize: 13, color: 'var(--sp-fg-muted)', lineHeight: 1.5, marginBottom: 32 }}>
                Independent Chip Model converts raw tournament chips into actual dollar equity
                mapped to the remaining prize pool structure.
              </div>

              {equities.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[...players]
                    .map((p, i) => ({ ...p, eq: equities[i] }))
                    .sort((a, b) => b.eq - a.eq)
                    .map((p, rank) => {
                      const chipPct = (p.stack / totalChips) * 100;
                      const eqPct = (p.eq / totalPrizePool) * 100;
                      const isHero = p.id === 1;

                      return (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: rank * 0.1 }}
                          style={{
                            background: isHero ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.02)',
                            border: isHero
                              ? '1px solid rgba(0,212,255,0.3)'
                              : '1px solid rgba(255,255,255,0.05)',
                            borderRadius: 12,
                            padding: 16,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 8,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 15,
                                fontWeight: isHero ? 800 : 600,
                                color: isHero ? 'var(--sp-accent-cyan)' : 'var(--sp-fg)',
                              }}
                            >
                              {p.name}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--sp-accent-green)' }}>
                              $
                              {p.eq.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 24, fontSize: 11, color: 'var(--sp-fg-muted)' }}>
                            <div>
                              <span style={{ fontWeight: 700, color: 'var(--sp-fg)' }}>Chips:</span>{' '}
                              {(Number.isFinite(Number(chipPct)) ? Number(chipPct) : 0).toFixed(1)}% ({Number(p.stack).toLocaleString()})
                            </div>
                            <div>
                              <span style={{ fontWeight: 700, color: 'var(--sp-fg)' }}>Prize EQ:</span>{' '}
                              {(Number.isFinite(Number(eqPct)) ? Number(eqPct) : 0).toFixed(1)}%
                            </div>
                          </div>

                          <div
                            style={{
                              width: '100%',
                              height: 4,
                              background: 'rgba(0,0,0,0.5)',
                              borderRadius: 2,
                              marginTop: 12,
                              overflow: 'hidden',
                            }}
                          >
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${eqPct}%` }}
                              style={{ height: '100%', background: isHero ? 'var(--sp-accent-cyan)' : 'var(--sp-accent-purple)' }}
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5 }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>■</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sp-fg)' }}>Run Solver</div>
                  <div style={{ fontSize: 13, color: 'var(--sp-fg-muted)' }}>Fill in stacks and payouts.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
