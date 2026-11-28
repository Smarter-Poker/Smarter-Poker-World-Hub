/**
 * Solver Spot Study — answer-revealed postflop policy review.
 *
 * This utility intentionally reveals solver policy and does not grade, persist,
 * reward, or advance authoritative Training progress. Blind decisions belong
 * to the signed 107-game arena pipeline.
 * TRAIN-CSS-TOKENS-ADOPT-4 and TRAIN-CSS-MOBILE-ADOPT-5 remain represented by
 * the shared --sp-* palette and overflow-safe responsive layout below.
 * TRAIN-WIRE-FEEDBACK-V2-5 and TRAIN-WIRE-QUIZ-ANSWER-6 are intentionally
 * superseded here: this answer-revealed study surface has no grading controls,
 * while the signed Arena owns blind answers and persistent feedback.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import { AnimatePresence, motion } from 'framer-motion';
import Card from '../../../src/components/training/Card';
import { authedFetch } from '../../../src/lib/authUtils';
import { trainingSourcePresentation } from '../../../src/lib/training/cacheTruthContract.mjs';


import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/training-play.module.css';
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
    <div className={s.cardRow}>
      {physicalCards.map((card, index) => (
        <Card key={`${card}-${index}`} rank={card[0]} suit={card[1]} size="small" />
      ))}
    </div>
  );
}


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
        // Spot Study is open to everyone (Dan, 2026-10-12). authedFetch adds
        // the Authorization header only when a session token exists, so a
        // signed-out visitor sends an anonymous request and gets the same
        // answer-revealed study spot; no sign-in screen is shown.
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
  const querySource = typeof router.query?.source === 'string' ? router.query.source.trim() : '';
  const queryLeak = typeof router.query?.leak === 'string' ? router.query.leak.trim() : '';
  const isPaSource = querySource.startsWith('personal-assistant') || querySource.startsWith('assistant-sandbox');
  const backHref = isPaSource
    ? (queryLeak ? `/hub/personal-assistant/leaks?leak=${encodeURIComponent(queryLeak)}` : '/hub/personal-assistant/leaks')
    : '/hub/training';

  return (
    <>
      <SEOHead
        title="Answer-Revealed Solver Spot Study"
        description="Review Answer-Revealed, Provenance-Audited Postflop Solver Policies And Action Frequencies Without Affecting Your Ranked Training Score On Smarter.Poker."
        canonical="/hub/training/spot-trainer"
      />

      <div className={s.shell}>
        <main className={s.page}>
          <TrainingPageHead slug="training-spot-trainer" note="Answer-Revealed Study" backHref={backHref} backLabel={isPaSource ? 'Back To Personal Assistant' : 'Training'} />

          <p className={s.note}>
            <span>
              This Is An Answer-Revealed Solver Study Utility. It Is Intentionally Not Scored And
              Cannot Change Training Progress, Streaks, Leaderboards, Achievements, Or Rewards.
            </span>
          </p>

          <section className={`sd-panel ${s.panel}`} aria-labelledby="spot-filters-title">
            <h2 id="spot-filters-title" className={s.subTitle}>Filter Spots</h2>
            <div className={s.chips} role="group" aria-label="Format">
              {FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={format === option.value}
                  onClick={() => setFormat(option.value)}
                  className={`sd-button ${s.button}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className={s.chips} role="group" aria-label="Position">
              {POSITION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={position === option.value}
                  onClick={() => setPosition(option.value)}
                  className={`sd-button ${s.button}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          {error && (
            <div role="alert" className={`${s.error} ${s.row}`}>
              <span>{error}</span>
              <button type="button" onClick={fetchSpot} className={`sd-button ${s.button}`}>
                Retry
              </button>
            </div>
          )}

          {loading && (
            <p aria-live="polite" className={`sd-panel ${s.panel} ${s.loadingPanel}`}>
              Loading Audited Solver Spot...
            </p>
          )}

          <AnimatePresence mode="wait">
            {spot && !loading && (
              <motion.div
                key={`${spot.id}-${spot.heroHand}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={s.page0}
              >
                <section className={`sd-panel ${s.panel}`} aria-label="Spot">
                  <div className={s.row}>
                    <div className={s.pills}>
                      {[spot.heroPosition, spot.street, `${spot.stackDepth} BB`, spot.gameType?.replace('_', ' ')].filter(Boolean).map((label) => (
                        <span key={label} className={s.pill}>{label}</span>
                      ))}
                    </div>
                    <button type="button" onClick={fetchSpot} className={`sd-button ${s.button}`}>
                      Load Another
                    </button>
                  </div>
                  <p className={`${s.eyebrow} ${s.center}`}>Board</p>
                  <div className={s.cardRow}>
                    {(spot.board || []).map((card, index) => (
                      <Card key={`${card}-${index}`} rank={card[0]?.toUpperCase()} suit={card[1]?.toLowerCase()} size="small" />
                    ))}
                  </div>
                  <p className={`${s.eyebrow} ${s.center}`}>Your Hand</p>
                  <HandBadge cards={spot.heroCards} />
                </section>

                <section className={`sd-panel ${s.panel}`} aria-labelledby="spot-answer-title">
                  <p className={s.eyebrow}>Primary Solver Action</p>
                  <h2 id="spot-answer-title" className={s.sectionTitle}>{spot.gtoAction}</h2>
                  <p className={s.copy}>{spot.gtoFrequency}% In This Policy</p>
                  <div className={s.pills}>
                    {Object.entries(spot.actionBreakdown || {})
                      .sort(([, left], [, right]) => right - left)
                      .map(([action, frequency]) => (
                        <span key={action} className={s.pill} data-on={action === spot.gtoAction ? 'true' : undefined}>
                          {action}: {frequency}%
                        </span>
                      ))}
                  </div>
                </section>

                <section className={`sd-panel ${s.panel}`} aria-labelledby="spot-artifact-title">
                  <div className={s.panelHead}>
                    <h2 id="spot-artifact-title" className={s.subTitle}>Audited PioSOLVER Artifact</h2>
                    <span title={sourceBadge.title} className={s.tag}>
                      {sourceBadge.label}
                    </span>
                  </div>
                  <div className={s.metrics}>
                    {[
                      ['Decision Node', spot.decisionNode?.node],
                      ['Actor', `${spot.decisionNode?.actorRole || '-'} · ${spot.heroPosition || '-'}`],
                      ['Seats', `${spot.decisionNode?.oopPosition || '-'} OOP / ${spot.decisionNode?.ipPosition || '-'} IP`],
                      ['Current Pot', Number.isFinite(Number(spot.decisionNode?.potBb)) ? `${spot.decisionNode.potBb} BB` : '-'],
                      ['Facing', Number(spot.decisionNode?.facingBetBb) > 0 ? `${spot.decisionNode.facingBetBb} BB` : 'No Bet'],
                      ['Hand EV', Number.isFinite(Number(spot.handEvBb)) ? `${spot.handEvBb} BB` : '-'],
                      ['Solver', spot.provenance?.solverVersion],
                      ['Machine', spot.provenance?.machineId],
                      ['Manifest', spot.provenance?.manifestVersion],
                      ['Quality', spot.provenance?.qualityStatus],
                      ['Policy Receipt', spot.policyChecksum
                        ? `${String(spot.policyChecksum).slice(0, 12)}…`
                        : '-'],
                    ].map(([label, value]) => (
                      <div key={label} className={`sd-metric ${s.metric} ${s.metricLeft}`}>
                        <span className={s.metricLabel}>{label}</span>
                        <strong className={s.metricSmall}>{value || '-'}</strong>
                      </div>
                    ))}
                  </div>
                  <p className={s.small}>
                    Scenario: {spot.scenarioHash} · Pipeline: {spot.provenance?.pipelineCommit} · Audited: {spot.provenance?.auditedAt}
                  </p>
                </section>

                <button type="button" onClick={fetchSpot} className={`sd-button sd-primary ${s.primaryAction}`}>
                  Load Another Audited Spot
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <section className={`sd-panel ${s.panel}`} aria-labelledby="spot-about-title">
            <h2 id="spot-about-title" className={s.subTitle}>About Solver Spot Study</h2>
            <p className={s.copy}>
              Review Provenance-Audited Postflop Policies By Format And Position. The Primary Action
              And Full Frequency Mix Are Revealed Immediately, So This Page Is A Study Reference,
              Not A Quiz. Use The Canonical Training Games For Blind Four-Choice Decisions,
              Server-Verified Feedback, Progress, Streaks, Leaderboards, And Rewards.
            </p>
          </section>
        </main>
      </div>
      <HubPageSummary page="training-spot-trainer" />
    </>
  );
}
