/**
 * Solver Spot Study — answer-revealed postflop policy review.
 *
 * This utility intentionally reveals solver policy and does not grade, persist,
 * reward, or advance authoritative Training progress. Blind decisions belong
 * to the signed 107-game arena pipeline.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AnimatePresence, motion } from 'framer-motion';
import Card from '../../../src/components/training/Card';
import { authedFetch } from '../../../src/lib/authUtils';
import { trainingSourcePresentation } from '../../../src/lib/training/cacheTruthContract.mjs';

const FORMAT_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'cash', label: 'Cash' },
  { value: 'mtt', label: 'MTT' },
];

const POSITION_OPTIONS = [
  { value: '', label: 'Any Position' },
  { value: 'BTN', label: 'BTN' },
  { value: 'CO', label: 'CO' },
  { value: 'HJ', label: 'HJ' },
  { value: 'MP', label: 'MP' },
  { value: 'SB', label: 'SB' },
  { value: 'BB', label: 'BB' },
];

const MAX_SPOT_RETRIES = 3;
const SPOT_RETRY_BASE_MS = 250;

function waitForRetry(delayMs, signal) {
  return new Promise((resolve) => {
    let timer = null;
    const finish = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    timer = setTimeout(finish, delayMs);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

function HandBadge({ cards }) {
  const physicalCards = Array.isArray(cards)
    && cards.length === 2
    && cards.every((card) => /^[2-9TJQKA][cdhs]$/.test(String(card || '')))
    ? cards
    : null;
  if (!physicalCards) return null;
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
      {physicalCards.map((card, index) => (
        <Card key={`${card}-${index}`} rank={card[0]} suit={card[1]} size="small" />
      ))}
    </div>
  );
}

const filterButtonStyle = (active) => ({
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 800,
  cursor: 'pointer',
  border: active ? '1px solid rgba(103,232,249,0.70)' : '1px solid rgba(255,255,255,0.10)',
  background: active
    ? 'linear-gradient(180deg, rgba(8,145,178,0.70), rgba(3,50,74,0.90))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
  color: active ? '#e8fbff' : 'var(--sp-fg-muted)',
  boxShadow: active ? '0 0 16px rgba(34,211,238,0.20), inset 0 1px rgba(255,255,255,0.20)' : 'none',
});

export default function SpotTrainerPage() {
  const router = useRouter();
  const [spot, setSpot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [format, setFormat] = useState('');
  const [position, setPosition] = useState('');
  const requestAbortRef = useRef(null);

  const fetchSpot = useCallback(async () => {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setLoading(true);
    setError(null);
    setSpot(null);

    try {
      const params = new URLSearchParams();
      if (format) params.set('format', format);
      if (position) params.set('position', position);

      for (let attempt = 0; attempt <= MAX_SPOT_RETRIES; attempt += 1) {
        const response = await authedFetch(
          `/api/training/spot-drill?${params.toString()}`,
          { signal: controller.signal },
        );
        const payload = await response.json();

        if (response.ok && payload.success && payload.spot) {
          setSpot(payload.spot);
          return;
        }
        if (!payload.retryable) {
          throw new Error(payload.error || `Audited Solver Artifact Unavailable (${response.status})`);
        }
        if (attempt >= MAX_SPOT_RETRIES) {
          throw new Error(payload.error || `Audited Solver Lookup Failed After ${MAX_SPOT_RETRIES + 1} Attempts`);
        }
        await waitForRetry(SPOT_RETRY_BASE_MS * (2 ** attempt), controller.signal);
        if (controller.signal.aborted) return;
      }
    } catch (requestError) {
      if (requestError?.name !== 'AbortError' && !controller.signal.aborted) {
        setError(requestError?.message || 'Failed To Load An Audited Solver Spot');
      }
    } finally {
      if (requestAbortRef.current === controller) setLoading(false);
    }
  }, [format, position]);

  useEffect(() => {
    fetchSpot();
    return () => requestAbortRef.current?.abort();
  }, [fetchSpot]);
  const sourceBadge = trainingSourcePresentation(spot?.sourceClassification);

  return (
    <>
      <Head>
        <title>Solver Spot Study | Smarter.Poker GTO Training</title>
        <meta
          name="description"
          content="Review answer-revealed, solver-verified postflop policies without affecting Training scores, progress, or rewards."
        />
      </Head>

      <main
        style={{
          minHeight: '100vh',
          width: '100%',
          maxWidth: '100vw',
          overflowX: 'hidden',
          boxSizing: 'border-box',
          paddingBottom: 70,
          background: 'radial-gradient(circle at 50% 4%, rgba(0,119,190,0.20), transparent 32%), linear-gradient(180deg, #03080d 0%, #07111b 55%, #020609 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid rgba(103,232,249,0.20)' }}>
          <div data-pills-row style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 8,
                padding: '7px 12px',
                color: 'var(--sp-fg-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              &larr; Training
            </button>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 900,
                margin: 0,
                color: '#dff9ff',
                textShadow: '0 0 18px rgba(34,211,238,0.35)',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Solver Spot Study
            </h1>
            <span
              style={{
                fontSize: 9,
                color: '#a5f3fc',
                background: 'rgba(8,145,178,0.16)',
                padding: '4px 8px',
                borderRadius: 12,
                fontWeight: 800,
                border: '1px solid rgba(103,232,249,0.30)',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Answer-Revealed Study
            </span>
          </div>
        </div>

        <div style={{ padding: '16px 20px', maxWidth: 650, margin: '0 auto' }}>
          <section
            style={{
              color: 'var(--sp-fg-muted)',
              fontSize: 12,
              lineHeight: 1.6,
              textAlign: 'center',
              background: 'linear-gradient(180deg, rgba(7,89,133,0.16), rgba(2,20,31,0.65))',
              border: '1px solid rgba(103,232,249,0.22)',
              borderRadius: 10,
              padding: '11px 14px',
              marginBottom: 14,
              boxShadow: 'inset 0 1px rgba(255,255,255,0.08), 0 8px 28px rgba(0,0,0,0.25)',
            }}
          >
            This Is An Answer-Revealed Solver Study Utility. It Is Intentionally Not Scored And
            Cannot Change Training Progress, Streaks, Leaderboards, Achievements, Or Rewards.
          </section>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormat(option.value)}
                  style={filterButtonStyle(format === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {POSITION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPosition(option.value)}
                  style={filterButtonStyle(position === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                padding: '11px 14px',
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(248,113,113,0.35)',
                borderRadius: 8,
                color: '#fca5a5',
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {error}
              <button type="button" onClick={fetchSpot} style={{ ...filterButtonStyle(false), marginLeft: 12 }}>
                Retry
              </button>
            </div>
          )}

          {loading && (
            <div
              aria-live="polite"
              style={{ textAlign: 'center', padding: 40, color: 'var(--sp-fg-dim)', fontSize: 12, fontWeight: 800 }}
            >
              Loading Audited Solver Spot...
            </div>
          )}

          <AnimatePresence mode="wait">
            {spot && !loading && (
              <motion.section
                key={`${spot.id}-${spot.heroHand}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {[spot.heroPosition, spot.street, `${spot.stackDepth}BB`, spot.gameType?.replace('_', ' ')].filter(Boolean).map((label) => (
                      <span
                        key={label}
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#cffafe',
                          background: 'rgba(8,145,178,0.13)',
                          border: '1px solid rgba(103,232,249,0.18)',
                          padding: '4px 8px',
                          borderRadius: 6,
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <button type="button" onClick={fetchSpot} style={filterButtonStyle(false)}>
                    Load Another
                  </button>
                </div>

                <div
                  style={{
                    background: 'linear-gradient(145deg, rgba(5,22,34,0.96), rgba(1,8,14,0.98))',
                    border: '1px solid rgba(103,232,249,0.24)',
                    borderRadius: 14,
                    padding: '20px 24px',
                    marginBottom: 14,
                    textAlign: 'center',
                    boxShadow: 'inset 0 1px rgba(255,255,255,0.10), 0 14px 40px rgba(0,0,0,0.42)',
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--sp-fg-dim)', letterSpacing: 1.5, marginBottom: 10 }}>
                    Board
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                    {(spot.board || []).map((card, index) => (
                      <Card key={`${card}-${index}`} rank={card[0]?.toUpperCase()} suit={card[1]?.toLowerCase()} size="small" />
                    ))}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--sp-fg-dim)', letterSpacing: 1.5, marginBottom: 8 }}>
                    Your Hand
                  </div>
                  <HandBadge cards={spot.heroCards} />
                </div>

                <div
                  title={sourceBadge.title}
                  style={{
                    width: 'fit-content',
                    margin: '0 auto 10px',
                    padding: '4px 9px',
                    borderRadius: 999,
                    border: `1px solid ${sourceBadge.border}`,
                    background: sourceBadge.bg,
                    color: sourceBadge.fg,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0.8,
                  }}
                >
                  {sourceBadge.label}
                </div>
                <div
                  style={{
                    background: 'linear-gradient(145deg, rgba(14,116,144,0.14), rgba(2,14,24,0.92))',
                    border: '1px solid rgba(103,232,249,0.28)',
                    borderRadius: 12,
                    padding: 15,
                    marginBottom: 14,
                    boxShadow: 'inset 0 1px rgba(255,255,255,0.08), 0 10px 30px rgba(0,0,0,0.28)',
                  }}
                >
                  <div style={{ color: '#a5f3fc', fontSize: 11, fontWeight: 900, marginBottom: 10 }}>
                    Audited PioSOLVER Artifact
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8 }}>
                    {[
                      ['Decision Node', spot.decisionNode?.node],
                      ['Actor', `${spot.decisionNode?.actorRole || '—'} · ${spot.heroPosition || '—'}`],
                      ['Seats', `${spot.decisionNode?.oopPosition || '—'} OOP / ${spot.decisionNode?.ipPosition || '—'} IP`],
                      ['Current Pot', Number.isFinite(Number(spot.decisionNode?.potBb)) ? `${spot.decisionNode.potBb} BB` : '—'],
                      ['Facing', Number(spot.decisionNode?.facingBetBb) > 0 ? `${spot.decisionNode.facingBetBb} BB` : 'No Bet'],
                      ['Hand EV', Number.isFinite(Number(spot.handEvBb)) ? `${spot.handEvBb} BB` : '—'],
                      ['Solver', spot.provenance?.solverVersion],
                      ['Machine', spot.provenance?.machineId],
                      ['Manifest', spot.provenance?.manifestVersion],
                      ['Quality', spot.provenance?.qualityStatus],
                      ['Policy Receipt', spot.policyChecksum
                        ? `${String(spot.policyChecksum).slice(0, 12)}…`
                        : '—'],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, padding: '7px 9px' }}>
                        <div style={{ color: 'var(--sp-fg-dim)', fontSize: 8, fontWeight: 800, letterSpacing: 0.8 }}>{label}</div>
                        <div style={{ color: '#dff9ff', fontSize: 10, fontWeight: 800, marginTop: 3, overflowWrap: 'anywhere' }}>{value || '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ color: 'var(--sp-fg-dim)', fontSize: 9, lineHeight: 1.5, marginTop: 10, overflowWrap: 'anywhere' }}>
                    Scenario: {spot.scenarioHash} · Pipeline: {spot.provenance?.pipelineCommit} · Audited: {spot.provenance?.auditedAt}
                  </div>
                </div>

                <div
                  style={{
                    background: 'linear-gradient(145deg, rgba(34,197,94,0.10), rgba(2,20,16,0.80))',
                    border: '1px solid rgba(74,222,128,0.30)',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                    boxShadow: 'inset 0 1px rgba(255,255,255,0.08), 0 10px 34px rgba(0,0,0,0.30)',
                  }}
                >
                  <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <div style={{ color: 'var(--sp-fg-muted)', fontSize: 10, fontWeight: 800, marginBottom: 5 }}>
                      Primary Solver Action
                    </div>
                    <div style={{ color: '#86efac', fontSize: 22, fontWeight: 900 }}>{spot.gtoAction}</div>
                    <div style={{ color: 'var(--sp-fg-muted)', fontSize: 11 }}>{spot.gtoFrequency}% In This Policy</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {Object.entries(spot.actionBreakdown || {})
                      .sort(([, left], [, right]) => right - left)
                      .map(([action, frequency]) => (
                        <span
                          key={action}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: action === spot.gtoAction ? '#86efac' : 'var(--sp-fg-muted)',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            padding: '5px 9px',
                            borderRadius: 6,
                          }}
                        >
                          {action}: {frequency}%
                        </span>
                      ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={fetchSpot}
                  style={{
                    width: '100%',
                    padding: '13px 0',
                    background: 'linear-gradient(180deg, #67e8f9 0%, #0891b2 48%, #075985 100%)',
                    border: '1px solid rgba(207,250,254,0.70)',
                    borderRadius: 9,
                    color: '#021018',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: 'inset 0 1px #fff, 0 0 22px rgba(34,211,238,0.22)',
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                  }}
                >
                  Load Another Audited Spot
                </button>
              </motion.section>
            )}
          </AnimatePresence>

          <section
            style={{
              marginTop: 20,
              padding: '14px 18px',
              background: 'rgba(255,255,255,0.025)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--sp-fg-dim)', letterSpacing: 1, marginBottom: 6 }}>
              About Solver Spot Study
            </div>
            <p style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6, margin: 0 }}>
              Review Provenance-Audited Postflop Policies By Format And Position. The Primary Action
              And Full Frequency Mix Are Revealed Immediately, So This Page Is A Study Reference,
              Not A Quiz. Use The Canonical Training Games For Blind Four-Choice Decisions,
              Server-Verified Feedback, Progress, Streaks, Leaderboards, And Rewards.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
