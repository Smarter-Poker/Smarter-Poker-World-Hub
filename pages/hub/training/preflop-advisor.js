/**
 * Preflop Advisor — GTO Preflop Decision Trainer
 * Phase 27 · /hub/training/preflop-advisor
 *
 * Deal 2 hole cards + position → decide Raise / Call / Fold
 * Validates against GTO canonical ranges · Tracks per-position accuracy
 */
// TRAIN-CSS-TOKENS-BATCH5-38 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-31 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import Card from '../../../src/components/training/Card';
import { authedFetch } from '../../../src/lib/authUtils';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
// TRAIN-WIRE-FX-5a — adoption: feedback hook

function saveSession(payload) {
  authedFetch('/api/training/save-session', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
}

// ── GTO Canonical Ranges (100BB Cash, 6-max) ──────────────────────
const RANGES = {
  UTG: {
    raise: new Set([
      'AA',
      'KK',
      'QQ',
      'JJ',
      'TT',
      '99',
      '88',
      'AKs',
      'AQs',
      'AJs',
      'ATs',
      'A9s',
      'KQs',
      'KJs',
      'QJs',
      'AKo',
      'AQo',
      'AJo',
    ]),
    call: new Set([]),
  },
  HJ: {
    raise: new Set([
      'AA',
      'KK',
      'QQ',
      'JJ',
      'TT',
      '99',
      '88',
      '77',
      'AKs',
      'AQs',
      'AJs',
      'ATs',
      'A9s',
      'A8s',
      'KQs',
      'KJs',
      'KTs',
      'QJs',
      'QTs',
      'JTs',
      'AKo',
      'AQo',
      'AJo',
      'ATo',
      'KQo',
    ]),
    call: new Set([]),
  },
  CO: {
    raise: new Set([
      'AA',
      'KK',
      'QQ',
      'JJ',
      'TT',
      '99',
      '88',
      '77',
      '66',
      'AKs',
      'AQs',
      'AJs',
      'ATs',
      'A9s',
      'A8s',
      'A7s',
      'A6s',
      'A5s',
      'A4s',
      'A3s',
      'A2s',
      'KQs',
      'KJs',
      'KTs',
      'K9s',
      'QJs',
      'QTs',
      'Q9s',
      'JTs',
      'J9s',
      'T9s',
      '98s',
      '87s',
      'AKo',
      'AQo',
      'AJo',
      'ATo',
      'A9o',
      'KQo',
      'KJo',
      'KTo',
      'QJo',
    ]),
    call: new Set([]),
  },
  BTN: {
    raise: new Set([
      'AA',
      'KK',
      'QQ',
      'JJ',
      'TT',
      '99',
      '88',
      '77',
      '66',
      '55',
      '44',
      '33',
      '22',
      'AKs',
      'AQs',
      'AJs',
      'ATs',
      'A9s',
      'A8s',
      'A7s',
      'A6s',
      'A5s',
      'A4s',
      'A3s',
      'A2s',
      'KQs',
      'KJs',
      'KTs',
      'K9s',
      'K8s',
      'K7s',
      'K6s',
      'K5s',
      'QJs',
      'QTs',
      'Q9s',
      'JTs',
      'J9s',
      'T9s',
      'T8s',
      '98s',
      '97s',
      '87s',
      '86s',
      '76s',
      '75s',
      '65s',
      'AKo',
      'AQo',
      'AJo',
      'ATo',
      'A9o',
      'KQo',
      'KJo',
      'KTo',
      'QJo',
      'QTo',
      'JTo',
    ]),
    call: new Set([]),
  },
  SB: {
    raise: new Set([
      'AA',
      'KK',
      'QQ',
      'JJ',
      'TT',
      '99',
      '88',
      '77',
      '66',
      '55',
      'AKs',
      'AQs',
      'AJs',
      'ATs',
      'A9s',
      'A8s',
      'A7s',
      'A6s',
      'A5s',
      'A4s',
      'KQs',
      'KJs',
      'KTs',
      'K9s',
      'QJs',
      'QTs',
      'JTs',
      'T9s',
      '98s',
      '87s',
      '76s',
      'AKo',
      'AQo',
      'AJo',
      'ATo',
      'KQo',
      'KJo',
      'QJo',
    ]),
    call: new Set([]),
  },
  BB: {
    raise: new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AQs', 'AKo']),
    call: new Set([
      'TT',
      '99',
      '88',
      '77',
      '66',
      '55',
      '44',
      '33',
      '22',
      'AJs',
      'ATs',
      'A9s',
      'A8s',
      'A7s',
      'A6s',
      'A5s',
      'A4s',
      'A3s',
      'A2s',
      'KQs',
      'KJs',
      'KTs',
      'K9s',
      'K8s',
      'QJs',
      'QTs',
      'Q9s',
      'JTs',
      'J9s',
      'T9s',
      '98s',
      '87s',
      '76s',
      '65s',
      'AJo',
      'ATo',
      'A9o',
      'KQo',
      'KJo',
      'QJo',
    ]),
  },
};

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['h', 'd', 'c', 's'];

// HARDENED: Validate card strings before indexing
function canonicalHand(c1, c2) {
  if (
    !c1 ||
    !c2 ||
    typeof c1 !== 'string' ||
    typeof c2 !== 'string' ||
    c1.length < 2 ||
    c2.length < 2
  )
    return null;
  const r1 = RANKS.indexOf(c1[0]),
    r2 = RANKS.indexOf(c2[0]);
  if (r1 < 0 || r2 < 0) return null;
  const hi = r1 <= r2 ? c1 : c2;
  const lo = r1 <= r2 ? c2 : c1;
  if (hi[0] === lo[0]) return hi[0] + lo[0]; // pair
  if (hi[1] === lo[1]) return hi[0] + lo[0] + 's'; // suited
  return hi[0] + lo[0] + 'o'; // offsuit
}

function getGTOAction(hand, pos) {
  const r = RANGES[pos];
  if (!r) return 'fold';
  if (r.raise.has(hand)) return 'raise';
  if (r.call.has(hand)) return 'call';
  return 'fold';
}

// HARDENED: Deal with safety guard against malformed deck
function dealHand() {
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  if (deck.length < 2) return { c1: 'Ah', c2: 'Kh', pos: 'BTN' }; // fallback
  const idx1 = Math.floor(Math.random() * deck.length);
  const c1 = deck.splice(idx1, 1)[0];
  const idx2 = Math.floor(Math.random() * deck.length);
  const c2 = deck.splice(idx2, 1)[0];
  const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)] || 'BTN';
  return { c1, c2, pos };
}

// Card rendering uses shared Card.tsx custom PNG deck

export default function PreflopAdvisor() {
  useTrainingBus('preflop-advisor');
  const fb = useTrainingFeedback();
  const router = useRouter();

  const [hand, setHand] = useState(null);
  const [decision, setDecision] = useState(null); // 'raise' | 'call' | 'fold'
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [posStats, setPosStats] = useState({}); // { UTG: { correct, total } }
  const [last20, setLast20] = useState([]); // boolean[]

  useEffect(() => {
    setHand(dealHand());
  }, []);

  const gtoAction = useMemo(
    () => (hand ? getGTOAction(canonicalHand(hand.c1, hand.c2), hand.pos) : null),
    [hand]
  );
  const canonical = useMemo(() => (hand ? canonicalHand(hand.c1, hand.c2) : null), [hand]);

  const getRangeNote = useCallback((pos, hand) => {
    const r = RANGES[pos];
    const inRaise = r?.raise?.has(hand);
    const inCall = r?.call?.has(hand);
    const raiseSize = r?.raise?.size || 0;
    const pct = Math.round((raiseSize / 169) * 100);
    return inRaise
      ? `${hand} is in ${pos}'s ${pct}% RFI range — open raise is correct.`
      : inCall
        ? `${hand} is in ${pos}'s calling range — a call vs a raise is correct.`
        : `${hand} is NOT in ${pos}'s range at 100BB — fold is GTO.`;
  }, []);

  const handleDecision = useCallback(
    (chosen) => {
      if (!hand || showResult) return; // HARDENED: prevent double-submit
      if (!gtoAction) return; // HARDENED: guard against null GTO action
      setDecision(chosen);
      setShowResult(true);
      const isCorrect = chosen === gtoAction;
      if (isCorrect) fb.correct(); else fb.incorrect();

      setStats((prev) => {
        const next = { correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 };
        const accuracy = next.total > 0 ? Math.round((next.correct / next.total) * 100) : 0;
        try {
          eventBus?.emit?.('training:session-complete', {
            game_id: 'preflop-advisor',
            accuracy,
            correct_answers: next.correct,
            total_questions: next.total,
          });
        } catch (e) { console.warn('[App] Handled exception:', e); }
        saveSession({
          game_id: 'preflop-advisor',
          accuracy,
          hands_played: next.total,
          correct_answers: next.correct,
          total_questions: next.total,
        });
        return next;
      });

      setPosStats((prev) => {
        const p = prev[hand.pos] || { correct: 0, total: 0 };
        return {
          ...prev,
          [hand.pos]: { correct: p.correct + (isCorrect ? 1 : 0), total: p.total + 1 },
        };
      });

      setLast20((prev) => [...prev.slice(-19), isCorrect]);
    },
    [hand, showResult, gtoAction]
  );

  const nextHand = useCallback(() => {
    setHand(dealHand());
    setDecision(null);
    setShowResult(false);
  }, []);

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  const ACTION_COLORS = { raise: 'var(--sp-accent-green)', call: 'var(--sp-accent-orange)', fold: 'var(--sp-accent-red)' };
  const ACTION_ICONS = { raise: '', call: '', fold: '✕'};

  const C = {
    page: {
      minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
      background: 'linear-gradient(135deg,#0a0f1e,#0d1629,#0a0f1e)',
      color: 'var(--sp-fg)',
      fontFamily: "'Inter',sans-serif",
      padding: '20px 16px 40px',
    },
    card: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      padding: '20px',
      marginBottom: 14,
    },
    orb: { fontFamily: "'Orbitron',monospace" },
  };

  return (
    <>
      <Head>
        <title>Preflop Advisor | Smarter.Poker</title>
        <meta
          name="description"
          content="Train GTO preflop decisions by position. Deal hole cards and choose Raise, Call, or Fold against canonical GTO ranges."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Orbitron:wght@700;900&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div style={C.page}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sp-fg-dim)',
              fontSize: 12,
              cursor: 'pointer',
              marginBottom: 16,
            }}
          >
            ← Training Hub
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg,#22c55e20,#00d4ff20)',
                border: '1px solid rgba(34,197,94,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
              }}
            >
              
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 900,
                  ...C.orb,
                  background: 'linear-gradient(135deg,rgba(var(--sp-accent-green-rgb), 1),rgba(var(--sp-accent-cyan-rgb), 1))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                PREFLOP ADVISOR
              </h1>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--sp-fg-dim)', fontWeight: 600 }}>
                GTO Decision Trainer · 6-Max · 100BB
              </p>
            </div>
          </div>

          {/* Stats bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3,1fr)',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {[
              {
                label: 'Accuracy',
                value: `${accuracy}%`,
                color: accuracy >= 70 ? 'var(--sp-accent-green)' : accuracy >= 50 ? 'var(--sp-accent-orange)' : 'var(--sp-accent-red)',
              },
              { label: 'Correct', value: stats.correct, color: 'var(--sp-accent-green)' },
              { label: 'Hands', value: stats.total, color: 'var(--sp-fg-muted)' },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10,
                  padding: '8px 6px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 900, ...C.orb, color: s.color }}>
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: 'var(--sp-fg-faint)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Last 20 dot trail */}
          {last20.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
              {last20.map((ok, i) => (
                <div
                  key={i}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: ok ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Hand display */}
          {hand && (
            <AnimatePresence mode="wait">
              <motion.div
                key={hand.c1 + hand.c2 + hand.pos}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div style={C.card}>
                  {/* Position badge */}
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
                        background: 'rgba(168,85,247,0.12)',
                        border: '1px solid rgba(168,85,247,0.3)',
                        borderRadius: 20,
                        padding: '4px 14px',
                        fontSize: 12,
                        fontWeight: 800,
                        color: 'var(--sp-accent-purple)',
                        ...C.orb,
                      }}
                    >
                      {hand.pos}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)', fontWeight: 600 }}>
                      6-Max · 100BB · No Limpers
                    </div>
                  </div>

                  {/* Cards */}
                  <div
                    style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}
                  >
                    <Card rank={hand.c1[0]} suit={hand.c1[1]} size="small" />
                    <Card rank={hand.c2[0]} suit={hand.c2[1]} size="small" />
                  </div>

                  <p
                    style={{
                      margin: 0,
                      textAlign: 'center',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--sp-fg-muted)',
                    }}
                  >
                    Folded to you in <strong style={{ color: 'var(--sp-accent-purple)' }}>{hand.pos}</strong>. What
                    is your action?
                  </p>
                </div>

                {/* Action buttons */}
                {!showResult && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3,1fr)',
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    {['raise', 'call', 'fold'].map((a) => (
                      <button
                        key={a}
                        onClick={() => handleDecision(a)}
                        style={{
                          padding: '16px 8px',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: `rgba(${a === 'raise' ? '34,197,94' : a === 'call' ? '249,115,22' : '239,68,68'},0.12)`,
                          color: ACTION_COLORS[a],
                          fontWeight: 900,
                          fontSize: 14,
                          cursor: 'pointer',
                          ...C.orb,
                        }}
                      >
                        {ACTION_ICONS[a]}
                        <br />
                        {a.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}

                {/* Result */}
                {showResult && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        marginBottom: 12,
                        fontSize: 14,
                        fontWeight: 800,
                        background:
                          decision === gtoAction ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                        border: `1px solid ${decision === gtoAction ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                        color: decision === gtoAction ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                      }}
                    >
                      {decision === gtoAction
                        ? '✓ CORRECT!'
                        : `✕ WRONG — GTO: ${ACTION_ICONS[gtoAction] || ''} ${(gtoAction || 'fold').toUpperCase()}`}
                    </div>
                    <div
                      style={{
                        ...C.card,
                        background: 'rgba(255,255,255,0.02)',
                        fontSize: 13,
                        color: 'var(--sp-fg-muted)',
                        lineHeight: 1.7,
                      }}
                    >
                      <strong
                        style={{
                          color: 'var(--sp-fg-dim)',
                          display: 'block',
                          marginBottom: 6,
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                         GTO Reasoning
                      </strong>
                      <strong style={{ color: 'var(--sp-accent-purple)' }}>{canonical}</strong> —{' '}
                      {getRangeNote(hand.pos, canonical)}
                    </div>

                    {/* Per-position accuracy bars */}
                    <div style={{ ...C.card, background: 'rgba(255,255,255,0.015)' }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: 'var(--sp-fg-dim)',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          marginBottom: 10,
                        }}
                      >
                        Position Accuracy
                      </div>
                      {POSITIONS.filter((p) => posStats[p]).map((p) => {
                        const ps = posStats[p];
                        const acc = ps.total > 0 ? Math.round((ps.correct / ps.total) * 100) : 0;
                        return (
                          <div key={p} style={{ marginBottom: 8 }}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--sp-fg-dim)',
                                marginBottom: 3,
                              }}
                            >
                              <span>{p}</span>
                              <span style={{ color: acc >= 70 ? 'var(--sp-accent-green)' : 'var(--sp-accent-orange)' }}>
                                {acc}% ({ps.total} hands)
                              </span>
                            </div>
                            <div
                              style={{
                                height: 5,
                                borderRadius: 3,
                                background: 'rgba(255,255,255,0.05)',
                                overflow: 'hidden',
                              }}
                            >
                              <motion.div
                                animate={{ width: `${acc}%` }}
                                style={{
                                  height: '100%',
                                  borderRadius: 3,
                                  background: acc >= 70 ? 'var(--sp-accent-green)' : 'var(--sp-accent-orange)',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      onClick={nextHand}
                      style={{
                        width: '100%',
                        padding: 14,
                        borderRadius: 12,
                        background: 'linear-gradient(135deg,rgba(var(--sp-accent-green-rgb), 1),rgba(var(--sp-accent-cyan-rgb), 1))',
                        border: 'none',
                        color: '#000',
                        fontWeight: 900,
                        fontSize: 14,
                        cursor: 'pointer',
                        ...C.orb,
                      }}
                    >
                      NEXT HAND →
                    </button>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </>
  );
}
