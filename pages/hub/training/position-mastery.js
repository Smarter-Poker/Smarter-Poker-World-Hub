/**
 * Position Mastery Map — Per-Position Performance Heatmap
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 23: Dedicated page for per-position accuracy breakdown.
 * Shows visual heatmap, position cards, bar chart, and weakness callout.
 *
 * Route: /hub/training/position-mastery
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-36 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-29 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { authedFetch, getAccessToken } from '../../../src/lib/authUtils';
import TrainingSignInPrompt from '../../../src/components/training/TrainingSignInPrompt';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/sessions-coaching.module.css';
// TRAIN-CSS-MOTION-ADOPT-17 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// POSITION CONFIG
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const POSITIONS = [
  { id: 'BTN', name: 'Button', short: 'BTN', desc: 'Last to act postflop, widest opening range' },
  { id: 'CO', name: 'Cutoff', short: 'CO', desc: 'Second-best position, wide opens' },
  { id: 'HJ', name: 'Hijack', short: 'HJ', desc: 'Middle-late position, moderate opens' },
  { id: 'MP', name: 'Middle', short: 'MP', desc: 'Middle position, tighter range' },
  { id: 'UTG', name: 'Under The Gun', short: 'UTG', desc: 'First to act, tightest range' },
  { id: 'SB', name: 'Small-Blind', short: 'SB', desc: 'Forced bet, worst postflop position' },
  { id: 'BB', name: 'Big-Blind', short: 'BB', desc: 'Forced bet, defends vs opens' },
];

// Accuracy is shown on one ice scale with semantic green (strong) and red
// (weak) ends; every value also carries a text label beside the colour.
function getAccuracyColor(acc) {
  if (acc >= 75) return '#5ee08a';
  if (acc >= 45) return '#86daff';
  if (acc >= 30) return '#4f9fd1';
  if (acc > 0) return '#ff7a86';
  return '#8ea4b9';
}

function getAccuracyLabel(acc) {
  if (acc >= 80) return 'Mastered';
  if (acc >= 65) return 'Strong';
  if (acc >= 50) return 'Developing';
  if (acc >= 35) return 'Weak';
  return 'Needs Work';
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// VISUAL TABLE HEATMAP (SVG)
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function TableHeatmap({ positionData }) {
  // Seat positions on an oval table (for 7 seats: BTN, CO, HJ, MP, UTG, SB, BB)
  const seats = [
    { id: 'BTN', cx: 260, cy: 200, label: 'BTN' },
    { id: 'CO', cx: 340, cy: 130, label: 'CO' },
    { id: 'HJ', cx: 320, cy: 60, label: 'HJ' },
    { id: 'MP', cx: 200, cy: 40, label: 'MP' },
    { id: 'UTG', cx: 80, cy: 60, label: 'UTG' },
    { id: 'SB', cx: 60, cy: 130, label: 'SB' },
    { id: 'BB', cx: 140, cy: 200, label: 'BB' },
  ];

  return (
    <svg
      viewBox="0 0 400 250"
      role="img"
      aria-label="Accuracy By Seat"
      style={{ width: '100%', maxWidth: 400, margin: '0 auto', display: 'block' }}
    >
      {/* Table oval */}
      <ellipse
        cx="200"
        cy="125"
        rx="170"
        ry="90"
        fill="#0b1c2c"
        stroke="#7f9db6"
        strokeWidth="2"
      />
      <ellipse
        cx="200"
        cy="125"
        rx="130"
        ry="60"
        fill="#071420"
        stroke="rgba(124,158,187,0.35)"
        strokeWidth="1"
      />
      <text
        x="200"
        y="128"
        textAnchor="middle"
        fill="rgba(189,208,226,0.35)"
        fontSize='12px'
        fontWeight="700"
      >
        SMARTER.POKER
      </text>

      {/* Dealer button */}
      <circle cx="230" cy="170" r="8" fill="#f2f7ff" stroke="#7f9db6" strokeWidth="1" />
      <text x="230" y="173" textAnchor="middle" fill="#040d18" fontSize='12px' fontWeight="900">
        D
      </text>

      {/* Seat nodes */}
      {seats.map((seat) => {
        const data = positionData[seat.id] || {};
        const acc = data.accuracy || 0;
        const color = getAccuracyColor(acc);
        const radius = 22;

        return (
          <g key={seat.id}>
            {/* Glow ring */}
            <circle
              cx={seat.cx}
              cy={seat.cy}
              r={radius + 4}
              fill="none"
              stroke={color}
              strokeWidth="2"
              opacity="0.3"
            />
            {/* Seat circle */}
            <circle
              cx={seat.cx}
              cy={seat.cy}
              r={radius}
              fill="#071420"
              stroke={color}
              strokeWidth="2"
            />
            {/* Position label */}
            <text
              x={seat.cx}
              y={seat.cy - 4}
              textAnchor="middle"
              fill="#f2f7ff"
              fontSize='12px'
              fontWeight="800"
            >
              {seat.label}
            </text>
            {/* Accuracy % */}
            <text
              x={seat.cx}
              y={seat.cy + 9}
              textAnchor="middle"
              fill={color}
              fontSize='12px'
              fontWeight="900"
            >
              {acc > 0 ? `${acc}%` : '--'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// PAGE COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function PositionMasteryPage() {
  const router = useRouter();
  useTrainingBus('position-mastery');

  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The page is open to everyone (Dan, 2026-10-12: "THEY SHOULD OPEN TO
  // EVERYONE"), but get-progress is personal and stays signed-in only. A
  // signed-out visitor sees the position guide with an empty progress map and
  // a sign-in prompt; the personal endpoint is never called without a token.
  const [signedOut, setSignedOut] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!getAccessToken()) {
      setSignedOut(true);
      setProgress([]);
      setLoading(false);
      return;
    }
    setSignedOut(false);
    try {
      const res = await authedFetch('/api/training/get-progress');
      if (res.status === 401) {
        // A stored session that could not be refreshed is a signed-out visit,
        // not an error: show the empty map and the sign-in prompt.
        setSignedOut(true);
        setProgress([]);
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        setProgress(json.progress || []);
      } else {
        setError(json.error || 'Failed to load');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bus listener — refresh when training completes
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchData());
    return unsub;
  }, [fetchData]);

  // Compute per-position data from progress
  const positionData = useMemo(() => {
    const data = {};
    POSITIONS.forEach((p) => {
      // Find progress entries that match this position
      const relevant = progress.filter((pr) => {
        const gid = (pr.game_id || '').toLowerCase();
        const pos = p.id.toLowerCase();
        return (
          gid.includes(pos.toLowerCase()) || (pr.position && pr.position.toUpperCase() === p.id)
        );
      });

      const totalQ = relevant.reduce((sum, r) => sum + (r.total_questions_answered || 0), 0);
      const totalC = relevant.reduce((sum, r) => sum + (r.total_correct || 0), 0);
      const accuracy = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0;
      const streak = Math.max(0, ...relevant.map((r) => r.best_streak || 0));
      const mastery =
        relevant.length > 0
          ? Math.round(
              relevant.reduce((sum, r) => sum + (r.mastery_percentage || 0), 0) / relevant.length
            )
          : 0;

      data[p.id] = { accuracy, totalQ, totalC, streak, mastery, drills: relevant.length };
    });

    return data;
  }, [progress]);

  const hasPositionData = useMemo(
    () => Object.values(positionData).some((entry) => entry.totalQ > 0),
    [positionData]
  );

  // Find weakest and strongest
  const sortedPositions = useMemo(() => {
    return [...POSITIONS].sort((a, b) => {
      const accA = positionData[a.id]?.accuracy || 0;
      const accB = positionData[b.id]?.accuracy || 0;
      return accA - accB;
    });
  }, [positionData]);

  const weakest = sortedPositions[0];
  const strongest = sortedPositions[sortedPositions.length - 1];
  const maxBar = Math.max(1, ...POSITIONS.map((p) => positionData[p.id]?.accuracy || 0));

  return (
    <>
      <SEOHead
        title="Poker Position Mastery Heatmap"
        description="Track Your GTO Poker Decision Accuracy And EV Retention Across All Six Table Positions From Under The Gun To The Big Blind On Smarter.Poker."
        canonical="/hub/training/position-mastery"
      />

      <div className={s.shell}>
        <TrainingPageHead slug="training-position-mastery" />

        <div className={s.page}>
          {/* Error */}
          {error && (
            <div role="alert" className={s.error} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>{error}</span>
              <button type="button" onClick={fetchData} className={`sd-button ${s.button}`}>
                Retry
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <section className={`sd-panel ${s.panel} ${s.state}`} role="status" aria-live="polite">
              <p className={s.copy}>Loading Position Data...</p>
            </section>
          )}

          {!loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'grid', gap: 14, minWidth: 0 }}>
              {signedOut && (
                <TrainingSignInPrompt
                  returnPath="/hub/training/position-mastery"
                  message="Sign In To See Your Accuracy By Seat. Your Progress Map Fills In As You Train."
                />
              )}
              {!signedOut && !hasPositionData && (
                <p role="status" className={s.note}>
                  No Position-Tagged Decisions Have Been Recorded Yet. Complete A Position-Specific
                  Drill To Populate This Map; Overall Results Are Never Redistributed Into Invented
                  Seat Statistics.
                </p>
              )}
              {/* Visual Table Heatmap */}
              <section className={`sd-panel ${s.panel}`} aria-labelledby="position-heatmap-title">
                <h2 id="position-heatmap-title" className={s.sectionTitle}>Position Heatmap</h2>
                <TableHeatmap positionData={positionData} />
                {/* Legend */}
                <ul className={s.facts} style={{ justifyContent: 'center', listStyle: 'none', padding: 0 }} aria-label="Heatmap Legend">
                  {[
                    { color: '#ff7a86', label: 'Under 30%' },
                    { color: '#4f9fd1', label: '30-45%' },
                    { color: '#86daff', label: '45-75%' },
                    { color: '#5ee08a', label: '75%+' },
                  ].map((l) => (
                    <li key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                      <span>{l.label}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Weakest Position Callout */}
              {weakest && positionData[weakest.id]?.totalQ > 0 && (
                <section className={`sd-panel ${s.panel}`} aria-labelledby="weakest-position-title">
                  <div className={s.panelHead}>
                    <div>
                      <p className={`${s.eyebrow} ${s.down}`}>Weakest Position</p>
                      <h2 id="weakest-position-title" className={s.sectionTitle}>
                        {weakest.name} ({positionData[weakest.id]?.accuracy || 0}%)
                      </h2>
                      <p className={s.copy}>Focus Your Drills Here To Improve Fastest</p>
                    </div>
                    <button
                      type="button"
                      className={`sd-button sd-primary ${s.button}`}
                      onClick={() =>
                        router.push(`/hub/training/drill-builder?position=${weakest.id}`)
                      }
                    >
                      Practice {weakest.short}
                    </button>
                  </div>
                </section>
              )}

              {/* Accuracy Bar Chart */}
              <section className={`sd-panel ${s.panel}`} aria-labelledby="accuracy-by-position-title">
                <h2 id="accuracy-by-position-title" className={s.sectionTitle}>Accuracy By Position</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {POSITIONS.map((pos, i) => {
                    const acc = positionData[pos.id]?.accuracy || 0;
                    const width = maxBar > 0 ? (acc / maxBar) * 100 : 0;
                    return (
                      <div key={pos.id} style={{ display: 'grid', gridTemplateColumns: '2.6rem minmax(0, 1fr) 3rem', alignItems: 'center', gap: 10 }}>
                        <span className={s.ice} style={{ fontWeight: 800, fontSize: 13, textAlign: 'right' }}>{pos.short}</span>
                        <div className={s.track} style={{ blockSize: 14 }}>
                          <motion.div
                            className={s.fill}
                            initial={{ width: 0 }}
                            animate={{ width: `${width}%` }}
                            transition={{ duration: MOTION.slow, delay: i * 0.08 }}
                          />
                        </div>
                        <span style={{ fontWeight: 800, fontSize: 13, color: getAccuracyColor(acc), fontVariantNumeric: 'tabular-nums' }}>
                          {acc > 0 ? `${acc}%` : '--'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Position Detail Cards */}
              <section className={s.cardGrid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))' }} aria-label="Position Details">
                {POSITIONS.map((pos, i) => {
                  const data = positionData[pos.id] || {};
                  const acc = data.accuracy || 0;
                  return (
                    <motion.article
                      key={pos.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`sd-metric ${s.card}`}
                    >
                      <div className={s.panelHead}>
                        <span className={s.subTitle}>{pos.short}</span>
                        <span style={{ fontWeight: 800, fontSize: 15, color: getAccuracyColor(acc), fontVariantNumeric: 'tabular-nums' }}>
                          {acc > 0 ? `${acc}%` : '--'}
                        </span>
                      </div>
                      <p className={s.copy} style={{ fontSize: 13, textTransform: 'capitalize' }}>{pos.desc}</p>
                      <p className={s.facts} style={{ fontSize: 12 }}>
                        <span>{data.drills || 0} Drills</span>
                        <span>{data.totalQ || 0} Hands</span>
                        {data.streak > 0 && <span className={s.ice}>{data.streak} Streak</span>}
                      </p>
                      <span className={s.metricLabel} style={{ color: getAccuracyColor(acc) }}>
                        {acc > 0 ? getAccuracyLabel(acc) : 'No Data'}
                      </span>
                    </motion.article>
                  );
                })}
              </section>

              {/* About */}
              <section className={`sd-panel ${s.panel}`} aria-labelledby="about-position-mastery-title">
                <h2 id="about-position-mastery-title" className={s.subTitle}>About Position Mastery</h2>
                <p className={s.copy}>
                  GTO Accuracy Varies Significantly By Position. Most Players Are Weakest From The
                  Blinds (SB/BB) And Strongest From Late Position (BTN/CO). Use This Map To Identify
                  Your Weakest Seats, Then Drill Those Positions Specifically Using The Drill
                  Builder.
                </p>
              </section>
            </motion.div>
          )}
        </div>
      </div>
      <HubPageSummary page="training-position-mastery" />
    </>
  );
}
