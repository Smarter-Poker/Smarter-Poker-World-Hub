/**
 * Positional GTO Preflop Range Matrix Route -- /tools/preflop-ranges/[position]
 * ==============================================================================
 * Server-rendered positional preflop chart pages for UTG, MP, HJ, CO, BTN, and SB
 * (plus raw Markdown at /tools/preflop-ranges/[position].md).
 */

import { useState, useMemo, useEffect } from 'react';
import PreflopRangeMatrixHub from '../../../src/components/seo/PreflopRangeMatrixHub';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import { openQuickSignup } from '../../../src/components/seo/SmarterQuickSignupSheet';
import { trackSeoFunnelEvent } from '../../../src/lib/seo/seoFunnelTelemetry';
import { RFI, RANKS } from '../../../src/config/solverRanges';
import { setPublicSeoHtmlCache } from '../../../src/lib/seo/edgeCacheHeaders.mjs';

const VALID_POSITIONS = new Set(['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB']);

/**
 * Pure helper evaluating a player's quiz decision against the authoritative
 * 100BB 6-Max RFI frequency table in src/config/solverRanges.js.
 *   freq >= 50           -> Open Raise
 *   freq > 0 && freq < 50 -> Mixed / Low-Freq Open
 *   freq === 0           -> Fold
 */
export function evaluatePreflopQuizAnswer(position, hand, userChoice) {
  const pos = String(position || 'UTG').trim().toUpperCase();
  const cleanHand = String(hand || '').trim();
  const choice = userChoice === 'open' ? 'open' : 'fold';
  const rfiMap = RFI[pos] || {};
  const rawFreq = Number(rfiMap[cleanHand]?.raise || 0);
  const freq = Math.round(rawFreq * 100);

  if (freq >= 50) {
    return {
      position: pos,
      hand: cleanHand,
      choice,
      freq,
      category: 'open',
      verdict: 'Open Raise',
      isCorrect: choice === 'open',
      feedback: `${cleanHand} From ${pos} Is ${freq >= 99 ? 'A Pure Open Raise (100%)' : `An Open Raise (${freq}% Open)`}.`,
    };
  }
  if (freq > 0 && freq < 50) {
    return {
      position: pos,
      hand: cleanHand,
      choice,
      freq,
      category: 'mixed',
      verdict: 'Mixed / Low-Freq Open',
      isCorrect: true,
      feedback: `${cleanHand} From ${pos} Is Mixed / Low-Freq Open (${freq}% Open, ${100 - freq}% Fold).`,
    };
  }
  return {
    position: pos,
    hand: cleanHand,
    choice,
    freq: 0,
    category: 'fold',
    verdict: 'Fold',
    isCorrect: choice === 'fold',
    feedback: `${cleanHand} From ${pos} Is A Pure Fold (0% Open).`,
  };
}

/**
 * Build deterministic quick-quiz hand prompts for a position spanning pure opens,
 * mixed / low-freq opens, and folds from the real RFI map.
 */
export function buildQuickQuizPrompts(position) {
  const pos = String(position || 'UTG').trim().toUpperCase();
  const rfiMap = RFI[pos] || {};
  const pure = [];
  const mixed = [];
  const folds = [];

  for (let r = 0; r < 13; r += 1) {
    for (let c = 0; c < 13; c += 1) {
      const hand = r === c ? `${RANKS[r]}${RANKS[c]}` : r < c ? `${RANKS[r]}${RANKS[c]}s` : `${RANKS[c]}${RANKS[r]}o`;
      const freq = Math.round(Number(rfiMap[hand]?.raise || 0) * 100);
      if (freq >= 50) pure.push(hand);
      else if (freq > 0 && freq < 50) mixed.push(hand);
      else folds.push(hand);
    }
  }

  const picks = [
    pure[Math.min(4, Math.max(0, pure.length - 1))],
    mixed[0],
    folds.includes('KJo') ? 'KJo' : folds[0],
    pure[Math.max(0, pure.length - 1)],
    mixed[Math.min(2, Math.max(0, mixed.length - 1))],
    folds.includes('Q9o') ? 'Q9o' : folds[Math.min(10, Math.max(0, folds.length - 1))],
  ].filter(Boolean);

  return [...new Set(picks)];
}

export async function getServerSideProps({ req, res, params, query }) {
  const rawPos = String(params?.position || query?.pos || query?.position || '')
    .replace(/\.md$/i, '')
    .trim()
    .toUpperCase();

  if (!VALID_POSITIONS.has(rawPos)) {
    return { notFound: true };
  }

  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md') ||
    String(params?.position || '').endsWith('.md');

  if (isMarkdownRequested) {
    const { renderPreflopRangesMarkdown } = await import('../../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPreflopRangesMarkdown({ position: rawPos });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  setPublicSeoHtmlCache(res);
  return {
    props: {
      initialPosition: rawPos,
      canonicalPath: `/tools/preflop-ranges/${rawPos.toLowerCase()}`,
      markdownPath: `/tools/preflop-ranges/${rawPos.toLowerCase()}.md`,
    },
  };
}

export default function PositionalPreflopRangeMatrixPage({
  initialPosition = 'UTG',
  canonicalPath = '/tools/preflop-ranges/utg',
  markdownPath = '/tools/preflop-ranges/utg.md',
}) {
  const pos = VALID_POSITIONS.has(String(initialPosition || '').toUpperCase())
    ? String(initialPosition).toUpperCase()
    : 'UTG';
  const [viewMode, setViewMode] = useState('chart');
  const quickPrompts = useMemo(() => buildQuickQuizPrompts(pos), [pos]);
  const [activeQuizHand, setActiveQuizHand] = useState(() => quickPrompts[0] || 'A5s');
  const [lastResult, setLastResult] = useState(null);
  const [answeredMap, setAnsweredMap] = useState({});
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    setActiveQuizHand(quickPrompts[0] || 'A5s');
    setLastResult(null);
    setAnsweredMap({});
    setScore({ correct: 0, total: 0 });
  }, [pos, quickPrompts]);

  const quizMatrix = useMemo(() => {
    const grid = [];
    for (let r = 0; r < 13; r += 1) {
      const row = [];
      for (let c = 0; c < 13; c += 1) {
        const hand = r === c ? `${RANKS[r]}${RANKS[c]}` : r < c ? `${RANKS[r]}${RANKS[c]}s` : `${RANKS[c]}${RANKS[r]}o`;
        row.push(hand);
      }
      grid.push(row);
    }
    return grid;
  }, []);

  const handleSelectQuizHand = (hand) => {
    setActiveQuizHand(hand);
    setLastResult(answeredMap[hand] || null);
  };

  const handleQuizDecision = (choice) => {
    if (!activeQuizHand) return;
    const evaluation = evaluatePreflopQuizAnswer(pos, activeQuizHand, choice);
    setLastResult(evaluation);
    setAnsweredMap((prev) => ({ ...prev, [activeQuizHand]: evaluation }));
    setScore((prev) => ({
      correct: prev.correct + (evaluation.isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('sp:seo-tool-engaged', {
            detail: { tool: 'preflop-range-quiz', position: pos, hand: activeQuizHand },
          }),
        );
      }
    } catch (_) {
      /* non-blocking */
    }

    trackSeoFunnelEvent('seo_mini_gto_drill_answered', {
      position: pos,
      hand: activeQuizHand,
    });
  };

  const handleSaveQuizCta = () => {
    trackSeoFunnelEvent('seo_mini_gto_drill_cta_click', {
      position: pos,
      score: score.correct,
      total: score.total,
    });
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('sp:peak-utility-pwa', {
            detail: { unlockKey: 'solver-matrix' },
          }),
        );
      }
    } catch (_) {
      /* non-blocking */
    }
    openQuickSignup({
      unlockKey: 'solver-matrix',
      eyebrow: 'Free GTO Training Account',
      title: 'Save Your GTO Quiz Score & Play 107 Games Free',
      subtitle: `You Scored ${score.correct}/${score.total} On ${pos} 100BB Preflop Spots. Create Your Free Account In 10 Seconds To Track Streaks And Claim 30-Day Free VIP + 500 Diamonds.`,
      source: 'preflop-range-quiz',
      redirectPath: canonicalPath,
      benefits: [
        '100% Free Forever - Zero Credit Card Required',
        'Play 107 Interactive GTO Training Games & Track Accuracy',
        'Claim 30-Day Free VIP + 500 Diamonds On Phone Verify',
      ],
    });
  };

  return (
    <PreflopRangeMatrixHub
      initialPosition={pos}
      canonicalPath={canonicalPath}
      markdownPath={markdownPath}
      unlockGateSlot={
        <>
          <section
            aria-label="Preflop Range Interactive Mode"
            style={{
              background: '#0b1120',
              border: '1px solid #1e3a5f',
              borderRadius: 0,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <div
              data-testid="preflop-quiz-toggle"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#38bdf8',
                    marginBottom: 4,
                  }}
                >
                  Interactive 100BB Range Trainer
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                  Test Your {pos} Opening Decisions Against Real 100BB Frequencies
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  data-testid="preflop-mode-chart"
                  aria-pressed={viewMode === 'chart'}
                  onClick={() => setViewMode('chart')}
                  style={{
                    minHeight: 44,
                    padding: '10px 16px',
                    borderRadius: 0,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: viewMode === 'chart' ? '#2563eb' : '#0f172a',
                    border: viewMode === 'chart' ? '1px solid #38bdf8' : '1px solid #1e3a5f',
                    color: viewMode === 'chart' ? '#ffffff' : '#cbd5e1',
                  }}
                >
                  Chart View
                </button>
                <button
                  type="button"
                  data-testid="preflop-mode-quiz"
                  aria-pressed={viewMode === 'quiz'}
                  onClick={() => setViewMode('quiz')}
                  style={{
                    minHeight: 44,
                    padding: '10px 16px',
                    borderRadius: 0,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: viewMode === 'quiz' ? '#2563eb' : '#0f172a',
                    border: viewMode === 'quiz' ? '1px solid #38bdf8' : '1px solid #1e3a5f',
                    color: viewMode === 'quiz' ? '#ffffff' : '#38bdf8',
                  }}
                >
                  Quiz Yourself (Tap Any Hand)
                </button>
              </div>
            </div>

            {viewMode === 'quiz' && (
              <div
                data-testid="preflop-quiz-panel"
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: '1px solid #1e3a5f',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>
                    Active Spot: {pos} 100BB 6-Max | Selected Hand:{' '}
                    <span style={{ color: '#38bdf8' }}>{activeQuizHand}</span>
                  </div>
                  <div
                    data-testid="preflop-quiz-score"
                    style={{
                      padding: '6px 12px',
                      borderRadius: 0,
                      background: '#0f172a',
                      border: '1px solid #1e3a5f',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#39E9A5',
                    }}
                  >
                    {score.correct}/{score.total} Correct
                  </div>
                </div>

                {/* Quick Hand Prompts */}
                <div
                  data-testid="preflop-quiz-prompts"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
                    Quick Hand Prompts:
                  </span>
                  {quickPrompts.map((promptHand) => {
                    const isActive = activeQuizHand === promptHand;
                    return (
                      <button
                        key={promptHand}
                        type="button"
                        data-testid={`preflop-quiz-prompt-${promptHand}`}
                        onClick={() => handleSelectQuizHand(promptHand)}
                        style={{
                          minHeight: 44,
                          minWidth: 48,
                          padding: '8px 12px',
                          borderRadius: 0,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: isActive ? '#1d4ed8' : '#0f172a',
                          border: isActive ? '1px solid #38bdf8' : '1px solid #1e3a5f',
                          color: isActive ? '#ffffff' : '#cbd5e1',
                        }}
                      >
                        {promptHand}
                      </button>
                    );
                  })}
                </div>

                {/* Action Buttons: Open Raise Vs Fold */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <button
                    type="button"
                    data-testid="preflop-quiz-open-btn"
                    onClick={() => handleQuizDecision('open')}
                    style={{
                      minHeight: 44,
                      flex: '1 1 160px',
                      padding: '12px 18px',
                      borderRadius: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: '#2563eb',
                      border: '1px solid #38bdf8',
                      color: '#ffffff',
                    }}
                  >
                    Open Raise
                  </button>
                  <button
                    type="button"
                    data-testid="preflop-quiz-fold-btn"
                    onClick={() => handleQuizDecision('fold')}
                    style={{
                      minHeight: 44,
                      flex: '1 1 160px',
                      padding: '12px 18px',
                      borderRadius: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#e2e8f0',
                    }}
                  >
                    Fold
                  </button>
                </div>

                {/* Instant Solver Frequency Feedback */}
                {lastResult && (
                  <div
                    data-testid="preflop-quiz-feedback"
                    role="status"
                    style={{
                      padding: '12px 14px',
                      borderRadius: 0,
                      marginBottom: 14,
                      background: lastResult.isCorrect ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      border: lastResult.isCorrect ? '1px solid #22c55e' : '1px solid #ef4444',
                      color: '#e2e8f0',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: lastResult.isCorrect ? '#4ade80' : '#f87171', marginRight: 8 }}>
                      {lastResult.isCorrect ? 'Correct:' : 'Review Spot:'}
                    </strong>
                    <span>{lastResult.verdict}</span>
                    {' | '}
                    <span>{lastResult.feedback}</span>
                  </div>
                )}

                {/* Peak-Dopamine 1-Tap Save CTA After 2+ Quiz Answers */}
                {score.total >= 2 && (
                  <div style={{ marginBottom: 16 }}>
                    <button
                      type="button"
                      data-testid="preflop-quiz-save-cta"
                      onClick={handleSaveQuizCta}
                      style={{
                        width: '100%',
                        minHeight: 48,
                        padding: '12px 18px',
                        borderRadius: 0,
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: '#2563eb',
                        border: '1px solid #38bdf8',
                        color: '#ffffff',
                      }}
                    >
                      Save Your GTO Quiz Score &amp; Play 107 Games Free
                    </button>
                  </div>
                )}

                {/* Blind 13x13 Tap-Any-Hand Matrix */}
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                  Tap Any Cell In The 13x13 Matrix To Quiz That Hand:
                </div>
                <div
                  data-testid="preflop-quiz-matrix"
                  style={{
                    overflowX: 'auto',
                    background: '#0f172a',
                    border: '1px solid #1e3a5f',
                    borderRadius: 0,
                    padding: 8,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(13, minmax(28px, 1fr))',
                      gap: 2,
                      minWidth: 400,
                    }}
                  >
                    {quizMatrix.map((row) =>
                      row.map((hand) => {
                        const graded = answeredMap[hand];
                        const isSelected = activeQuizHand === hand;
                        let bg = '#111827';
                        let color = '#cbd5e1';
                        if (graded) {
                          bg = graded.isCorrect ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)';
                          color = '#ffffff';
                        }
                        if (isSelected) {
                          bg = '#1d4ed8';
                          color = '#ffffff';
                        }
                        return (
                          <button
                            key={hand}
                            type="button"
                            data-testid={`preflop-quiz-cell-${hand}`}
                            onClick={() => handleSelectQuizHand(hand)}
                            aria-label={`Quiz Hand ${hand}`}
                            style={{
                              aspectRatio: '1/1',
                              borderRadius: 0,
                              border: isSelected ? '2px solid #38bdf8' : '1px solid rgba(148, 163, 184, 0.2)',
                              background: bg,
                              color,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {hand}
                          </button>
                        );
                      }),
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <SmarterAccountUnlockGate
            variant="solver-matrix"
            context={`tools-preflop-ranges-${pos.toLowerCase()}`}
            redirectPath={canonicalPath}
          />
        </>
      }
    />
  );
}
