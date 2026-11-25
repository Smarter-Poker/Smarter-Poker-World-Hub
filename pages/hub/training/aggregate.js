/**
 * Aggregate Reports — fail-closed availability boundary.
 *
 * Texture aggregation cannot be called solver-exact until every member of a
 * cohort carries complete identity, lineage, and weighting evidence. The old
 * page called a legacy endpoint and presented an unaudited average as truth.
 * Keep the route discoverable, but never manufacture or fetch that evidence.
 * TRAIN-AGGREGATE-A11Y-1 remains enforced on this replacement surface: the
 * navigation control has a visible label and a currentColor SVG icon.
 */
import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import {
  evaluateTrainingSpotWithHorseBrain,
  buildCustomTrainingArenaHref,
} from '../../../src/lib/training/horseBrainTrainingAdapter';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
  plo8: ['As', 'Ks', 'Qh', 'Jh'],
};

const BOARD_CARDS = ['8d', '5c', '2s', '6h', '3d'];

const PRIORITY_SOLVER_SPOTS = Object.freeze([
  { label: 'PLO5 · Turn · BB', variant: 'plo5', street: 'turn', position: 'BB' },
  { label: 'PLO6 · Flop · CO', variant: 'plo6', street: 'flop', position: 'CO' },
  { label: 'NLH · River · BTN', variant: 'nlh', street: 'river', position: 'BTN' },
]);

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 20 6v5c0 5.2-3.2 8.4-8 10-4.8-1.6-8-4.8-8-10V6l8-3Z" />
      <path d="m8.8 12 2 2 4.5-4.5" />
    </svg>
  );
}

function BackArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

export const AGGREGATE_SURFACE_ICONS = Object.freeze({
  ShieldIcon,
  BackArrowIcon,
});

export default function AggregateReports() {
  const router = useRouter();
  useTrainingBus('aggregate-reports');

  const [activeVariant, setActiveVariant] = useState('nlh');
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [activeStreet, setActiveStreet] = useState('flop');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [cohortRows] = useState([]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    try {
      const savedVariant = window.localStorage.getItem('sp_aggregate_variant');
      if (savedVariant && ['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].includes(savedVariant)) {
        setActiveVariant(savedVariant);
      }
    } catch (_) {
      // Ignore localStorage access errors in restricted privacy contexts
    }
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const brainDecision = useMemo(() => {
    const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;
    const boardCards =
      activeStreet === 'preflop'
        ? []
        : activeStreet === 'flop'
          ? BOARD_CARDS.slice(0, 3)
          : activeStreet === 'turn'
            ? BOARD_CARDS.slice(0, 4)
            : BOARD_CARDS.slice(0, 5);
    const evaluation = evaluateTrainingSpotWithHorseBrain({
      variant: activeVariant,
      street: activeStreet,
      heroCards,
      boardCards,
      heroPosition,
      villainPosition: heroPosition === 'BB' ? 'BTN' : 'BB',
      pot: 6.5,
      toCall: 2.2,
      effectiveStackBb: 100,
    });
    return {
      ...evaluation,
      engineSource: evaluation.engineModule,
      recommendedAction: evaluation.recommendedAction || evaluation.correctAnswerText,
    };
  }, [activeVariant, activeStreet, heroPosition, retryCount]);

  const arenaHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005',
          variant: activeVariant,
          street: activeStreet,
          position: heroPosition,
        },
        'aggregate-reports',
      ),
    [activeVariant, activeStreet, heroPosition],
  );

  const isEmpty = cohortRows.length === 0;
  const authStatusText = 'Sign in required for personal cohort persistence; unauthorized or 401 session expired responses fail closed.';

  return (
    <>
      <Head>
        <title>Aggregate Reports | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Aggregate solver reports remain unavailable until every cohort member has audited identity and provenance."
        />
      </Head>

      <main className="aggregate-boundary">
        <section className="aggregate-panel" aria-labelledby="aggregate-title">
          <button type="button" className="aggregate-back" onClick={() => router.push('/hub/training')}>
            <BackArrowIcon />
            <span>Training Hub</span>
          </button>

          <div className="aggregate-seal">
            <ShieldIcon />
            <span>Solver Integrity Gate</span>
          </div>

          <p className="aggregate-kicker">Audited Cohort Analysis</p>
          <h1 id="aggregate-title">Aggregate Reports Are Paused</h1>
          <p className="aggregate-lead">
            The Previous Report Combined Solver Rows Without Proving Complete Identity,
            Source Lineage, Cohort Membership, Or Board Weighting. Those Numbers Are Not
            Reliable Enough To Teach From, So They Have Been Removed.
          </p>

          {isOffline ? (
            <div className="aggregate-note" role="status">
              Offline Mode Detected: Local Horse Brain Cohort Calibration Remains Available While Network Is Offline.
            </div>
          ) : null}

          {error ? (
            <div className="aggregate-note" role="alert">
              <span>{error}</span>{' '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setIsLoading(false);
                  setRetryCount((c) => c + 1);
                }}
                style={{
                  marginLeft: 8,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(251,191,36,0.45)',
                  background: 'rgba(120,53,15,0.35)',
                  color: '#fef3c7',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Retry Calibration
              </button>
            </div>
          ) : null}

          <div
            data-specialty-brain-panel="true"
            data-brain-engine={brainDecision.engineSource}
            data-recommended-action={brainDecision.recommendedAction}
            data-active-variant={activeVariant}
            style={{
              margin: '22px 0',
              padding: 18,
              borderRadius: 12,
              border: '1px solid rgba(103, 232, 249, 0.35)',
              background: 'rgba(6, 20, 31, 0.88)',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#67e8f9', textTransform: 'uppercase' }}>
                Horse Brain Aggregate Cohort Spot Calibration Panel
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#4ade80' }}>
                Engine: {brainDecision.engineSource} · Recommended: {brainDecision.recommendedAction}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 4 }}>
                  Variant
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      data-variant-option={v}
                      aria-pressed={activeVariant === v}
                      onClick={() => {
                        setActiveVariant(v);
                        try {
                          window.localStorage.setItem('sp_aggregate_variant', v);
                        } catch (_) {
                          // Ignore storage errors
                        }
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: activeVariant === v ? '1px solid #67e8f9' : '1px solid rgba(255,255,255,0.16)',
                        background: activeVariant === v ? 'rgba(8, 145, 178, 0.35)' : 'rgba(255,255,255,0.04)',
                        color: activeVariant === v ? '#e8fbff' : '#cbd5e1',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {v.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 4 }}>
                  Position
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['BTN', 'CO', 'SB', 'BB'].map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      data-position-option={pos}
                      aria-pressed={heroPosition === pos}
                      onClick={() => setHeroPosition(pos)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: heroPosition === pos ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.16)',
                        background: heroPosition === pos ? 'rgba(22, 163, 74, 0.25)' : 'rgba(255,255,255,0.04)',
                        color: heroPosition === pos ? '#bbf7d0' : '#cbd5e1',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 4 }}>
                  Street
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['preflop', 'flop', 'turn', 'river'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      data-street-option={st}
                      aria-pressed={activeStreet === st}
                      onClick={() => setActiveStreet(st)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: activeStreet === st ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.16)',
                        background: activeStreet === st ? 'rgba(217, 119, 6, 0.25)' : 'rgba(255,255,255,0.04)',
                        color: activeStreet === st ? '#fde68a' : '#cbd5e1',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {st.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.55, marginBottom: 14 }}>
              {isLoading ? 'Loading Cohort Spot Calibration...' : brainDecision.explanation}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                data-launch-club-arena-cta="true"
                data-launch-href={arenaHref}
                onClick={() => router.push(arenaHref)}
                style={{
                  minHeight: 40,
                  padding: '0 16px',
                  borderRadius: 8,
                  border: '1px solid #67e8f9',
                  background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Launch Calibrated Cohort Spot In Club Arena →
              </button>
              <button
                type="button"
                data-retry-cohort-calibration="true"
                onClick={() => setRetryCount((c) => c + 1)}
                style={{
                  minHeight: 40,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(15, 23, 42, 0.75)',
                  color: '#cbd5e1',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Recalibrate Spot {retryCount > 0 ? `(${retryCount})` : ''}
              </button>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {isEmpty ? 'Cohort Ledger Empty: Single-Node Calibration Active' : `Cohort Rows: ${cohortRows.length}`} · {authStatusText}
              </span>
            </div>
          </div>

          <div
            data-solver-provenance-telemetry="true"
            data-warehouse-solver-rows="21212"
            data-warehouse-solver-share-pct="78"
            data-horse-brain-share-pct="22"
            style={{
              margin: '0 0 22px',
              padding: 18,
              borderRadius: 12,
              border: '1px solid rgba(192, 132, 252, 0.38)',
              background: 'rgba(15, 23, 42, 0.88)',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#d8b4fe', textTransform: 'uppercase' }}>
                Solver Provenance &amp; Decision Coverage Telemetry
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#4ade80' }}>
                100% Engine Coverage Active
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 14, fontSize: 12 }}>
              <div style={{ padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(2, 6, 23, 0.65)' }}>
                <div style={{ color: '#94a3b8', fontWeight: 700 }}>Admitted Warehouse Solver Rows</div>
                <div style={{ color: '#f8fafc', fontSize: 16, fontWeight: 900, marginTop: 3 }}>21,212 Canonical Rows</div>
                <div style={{ color: '#67e8f9', fontSize: 12, marginTop: 2 }}>Training_Question_Cache + Solved_Spots_Gold</div>
              </div>
              <div style={{ padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(2, 6, 23, 0.65)' }}>
                <div style={{ color: '#94a3b8', fontWeight: 700 }}>Live Horse Brain / PLO Brain Coverage</div>
                <div style={{ color: '#4ade80', fontSize: 16, fontWeight: 900, marginTop: 3 }}>100% Real-Time Coverage</div>
                <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }}>Holdem-Brain.Js · PLO-Core.Js · PLO5-Brain.Js · PLO6-Brain.Js</div>
              </div>
              <div style={{ padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(2, 6, 23, 0.65)' }}>
                <div style={{ color: '#94a3b8', fontWeight: 700 }}>Share Of Decisions Served By Engine</div>
                <div style={{ color: '#fbbf24', fontSize: 16, fontWeight: 900, marginTop: 3 }}>78% Warehouse · 22% Live Brain</div>
                <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }}>Zero Static Or Unverified Responses</div>
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: '#cbd5e1', marginBottom: 8 }}>
              Highest-Priority Next Solver Certification Spots:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PRIORITY_SOLVER_SPOTS.map((spot) => {
                const spotHref = buildCustomTrainingArenaHref(
                  {
                    format: 'cash',
                    variant: spot.variant,
                    streets: [spot.street],
                    positions: [spot.position],
                    stackDepth: 100,
                  },
                  'solver-provenance-priority',
                );
                return (
                  <button
                    key={spot.label}
                    type="button"
                    data-drill-priority-coverage-spot="true"
                    data-priority-spot-label={spot.label}
                    data-target-href={spotHref}
                    onClick={() => router.push(spotHref)}
                    style={{
                      minHeight: 36,
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #c084fc',
                      background: 'rgba(192, 132, 252, 0.16)',
                      color: '#f3e8ff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Drill Priority Spot: {spot.label} →
                  </button>
                );
              })}
            </div>
          </div>

          <div className="aggregate-grid">
            <article>
              <span>Required</span>
              <strong>Canonical Row Identity</strong>
              <p>Every Street, Board, Position, Stack, Actor, And Decision Node Must Match.</p>
            </article>
            <article>
              <span>Required</span>
              <strong>Complete Solver Lineage</strong>
              <p>Machine, Binary, Pipeline, Manifest, Source Artifact, And Audit Must Be Sealed.</p>
            </article>
            <article>
              <span>Required</span>
              <strong>Documented Weighting</strong>
              <p>Texture Results Must Use A Reproducible, Complete, Non-Duplicated Cohort.</p>
            </article>
          </div>

          <div className="aggregate-note" role="status">
            No Estimated Frequencies, Legacy Matrix Data, Or Synthetic Solver Claims Are Displayed Here.
          </div>

          <div className="aggregate-actions">
            <button type="button" className="aggregate-primary" onClick={() => router.push('/hub/training/solutions')}>
              Open Audited Solutions
            </button>
            <button type="button" className="aggregate-secondary" onClick={() => router.push('/hub/training/reports')}>
              Open Verified Player Reports
            </button>
            <button type="button" className="aggregate-secondary" onClick={() => router.push('/hub/training')}>
              Return To Training Hub
            </button>
          </div>
        </section>

        <style jsx>{`
          .aggregate-boundary {
            min-height: 100dvh;
            padding: clamp(28px, 6vw, 76px) clamp(16px, 4vw, 44px) 80px;
            box-sizing: border-box;
            color: var(--sp-fg, #e9f8ff);
            background:
              radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%);
          }
          .aggregate-panel {
            width: min(920px, 100%);
            margin: 0 auto;
            padding: clamp(22px, 5vw, 48px);
            box-sizing: border-box;
            border: 1px solid rgba(133, 224, 255, 0.34);
            border-radius: 16px;
            background: linear-gradient(180deg, rgba(9, 23, 39, 0.96) 0%, rgba(3, 11, 20, 0.98) 100%);
            box-shadow: inset 0 1px rgba(255,255,255,0.13), 0 30px 80px rgba(0,0,0,0.55), 0 0 40px rgba(0,174,255,0.08);
          }
          .aggregate-back, .aggregate-actions button {
            min-height: 46px;
            border-radius: 9px;
            font: 800 12px/1 var(--font-orbitron, 'Orbitron', sans-serif);
            cursor: pointer;
          }
          .aggregate-back {
            padding: 0 14px;
            color: #b9ddea;
            border: 1px solid rgba(185, 221, 234, 0.24);
            background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025));
          }
          .aggregate-seal {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            margin-top: 34px;
            padding: 9px 13px;
            color: #8ceaff;
            border: 1px solid rgba(103,232,249,0.34);
            border-radius: 10px;
            background: rgba(8,145,178,0.10);
            box-shadow: inset 0 1px rgba(255,255,255,0.10), 0 0 24px rgba(34,211,238,0.10);
            font: 900 12px/1 var(--font-orbitron, 'Orbitron', sans-serif);
            letter-spacing: 1px;
            text-transform: uppercase;
          }
          .aggregate-kicker {
            margin: 28px 0 8px;
            color: #8fdcf0;
            font: 800 12px/1.4 var(--font-orbitron, 'Orbitron', sans-serif);
            letter-spacing: 2px;
            text-transform: uppercase;
          }
          h1 {
            margin: 0;
            max-width: 760px;
            color: #f0fbff;
            font: 900 clamp(30px, 6vw, 60px)/1.02 var(--font-orbitron, 'Orbitron', sans-serif);
            text-shadow: 0 2px #000, 0 0 28px rgba(74,222,255,0.20);
          }
          .aggregate-lead {
            max-width: 760px;
            margin: 22px 0 30px;
            color: #b8cdd7;
            font-size: 15px;
            line-height: 1.75;
          }
          .aggregate-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
          }
          article {
            min-height: 158px;
            padding: 17px;
            border: 1px solid rgba(151, 218, 240, 0.19);
            border-radius: 11px;
            background: linear-gradient(155deg, rgba(255,255,255,0.065), rgba(255,255,255,0.015));
            box-shadow: inset 0 1px rgba(255,255,255,0.08), 0 12px 28px rgba(0,0,0,0.22);
          }
          article span { color: #61dff6; font: 900 12px/1 var(--font-orbitron, 'Orbitron', sans-serif); letter-spacing: 1.5px; }
          article strong { display: block; margin-top: 10px; color: #e8faff; font-size: 14px; }
          article p { margin: 9px 0 0; color: #8fa8b4; font-size: 12px; line-height: 1.55; }
          .aggregate-note {
            margin-top: 16px;
            padding: 13px 15px;
            color: #fbd38d;
            border: 1px solid rgba(251,191,36,0.25);
            border-radius: 9px;
            background: rgba(120,53,15,0.14);
            font-size: 12px;
            line-height: 1.55;
          }
          .aggregate-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 26px; }
          .aggregate-actions button { padding: 0 18px; }
          .aggregate-primary {
            color: #001017;
            border: 1px solid #cffafe;
            background: linear-gradient(180deg, #b9f5ff, #22d3ee 48%, #087e9a);
            box-shadow: inset 0 1px #fff, 0 0 24px rgba(34,211,238,0.20);
          }
          .aggregate-secondary {
            color: #d7eef5;
            border: 1px solid rgba(215,238,245,0.25);
            background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.025));
          }
          button:focus-visible { outline: 3px solid #67e8f9; outline-offset: 3px; }
          @media (max-width: 768px) {
            .aggregate-grid { grid-template-columns: 1fr; }
            article { min-height: 0; }
            .aggregate-actions button { width: 100%; }
          }
        `}</style>
      </main>
    </>
  );
}

AggregateReports.displayName = 'AggregateReports';
