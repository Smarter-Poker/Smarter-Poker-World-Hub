/**
 * Famous Finals Archive
 *
 * The original experience contained authored reconstructions that had neither
 * cited hand histories nor provenance-sealed solver artifacts. It is kept as a
 * truthful navigation surface, but it must never grade those reconstructions or
 * present their frequencies, EVs, stacks, or outcomes as historical fact.
 * TRAIN-CSS-MOBILE-ADOPT-13 is retained by the bounded, overflow-safe archive
 * shell and clamp-based responsive spacing below.
 */

import React, { useState, useMemo } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
};

const BOARD_CARDS_BY_STREET = {
  flop: ['Kc', '9d', '4s'],
  turn: ['Kc', '9d', '4s', '2h'],
  river: ['Kc', '9d', '4s', '2h', '7c'],
};

const ROUTES = [
  {
    label: 'Open Audited Spot Study',
    description: 'Review Answer-Revealed Audited Artifacts In An Explicitly Ungraded Study Utility.',
    href: '/hub/training/spot-trainer?source=famous-finals-archive',
    primary: true,
  },
  {
    label: 'Open Tournament Preparation',
    description: 'Plan Tournament Structures Without Inventing A Solved Final-Table Result.',
    href: '/hub/training/tournament-prep?source=famous-finals-archive',
    primary: false,
  },
];

export default function FamousFinalsArchivePage() {
  const router = useRouter();
  useTrainingBus('famous-finals');
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [activeStreet, setActiveStreet] = useState('flop');

  const brainEval = useMemo(() => {
    const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;
    const boardCards = BOARD_CARDS_BY_STREET[activeStreet] || BOARD_CARDS_BY_STREET.flop;
    return evaluateTrainingSpotWithHorseBrain({
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
  }, [activeVariant, activeStreet, heroPosition]);

  const arenaHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005',
          variant: activeVariant,
          street: activeStreet,
          position: heroPosition,
        },
        'famous-finals',
      ),
    [activeVariant, activeStreet, heroPosition],
  );

  return (
    <>
      <SEOHead
        title="Famous Finals Training Archive"
        description="Explore The Famous Finals Poker Training Archive On Smarter.Poker With Links To Verified Final Table ICM Simulators And Championship Strategy Drills."
        canonical="/hub/training/famous-finals"
      />

      <main
        data-training-authority="archive-ungraded"
        style={{
          minHeight: '100dvh',
          width: '100%',
          maxWidth: '100vw',
          boxSizing: 'border-box',
          overflowX: 'clip',
          padding: '32px 18px 80px',
          color: 'var(--sp-fg)',
          background:
            'radial-gradient(circle at 50% 0%, rgba(0,168,255,0.15), transparent 42%), linear-gradient(180deg, #07111b 0%, #03070c 100%)',
        }}
      >
        <section style={{ width: '100%', maxWidth: 760, margin: '0 auto' }}>
          <button
            type="button"
            onClick={() => router.push('/hub/training')}
            style={{
              border: '1px solid rgba(139,238,255,0.32)',
              background: 'linear-gradient(180deg, rgba(27,55,72,0.92), rgba(5,15,23,0.98))',
              color: '#dff8ff',
              minHeight: 42,
              padding: '0 16px',
              cursor: 'pointer',
              fontWeight: 800,
              boxShadow: 'inset 0 1px rgba(255,255,255,0.18), 0 10px 24px rgba(0,0,0,0.34)',
            }}
          >
            Back To Training Hub
          </button>

          <div
            style={{
              marginTop: 24,
              padding: 'clamp(24px, 5vw, 44px)',
              border: '1px solid rgba(139,238,255,0.38)',
              background:
                'linear-gradient(145deg, rgba(25,49,64,0.96), rgba(4,12,19,0.99) 56%, rgba(7,27,42,0.98))',
              boxShadow:
                'inset 0 1px rgba(255,255,255,0.22), inset 0 -18px 44px rgba(0,0,0,0.42), 0 22px 60px rgba(0,0,0,0.48)',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                padding: '6px 10px',
                border: '1px solid rgba(251,191,36,0.5)',
                color: '#fcd56a',
                background: 'rgba(90,61,10,0.24)',
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              Archived · Not A Scored Game
            </div>

            <h1
              style={{
                margin: '18px 0 12px',
                fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
                fontSize: 'clamp(30px, 7vw, 54px)',
                lineHeight: 1,
                textTransform: 'uppercase',
                letterSpacing: -1,
                color: '#e8faff',
                textShadow: '0 2px #00131d, 0 0 24px rgba(77,213,255,0.34)',
              }}
            >
              Famous Finals Archive
            </h1>

            <p style={{ margin: 0, maxWidth: 640, color: '#b9ccd5', fontSize: 15, lineHeight: 1.75 }}>
              The Previous Final-Table Scenarios Were Authored Reconstructions. They Did Not Carry
              Cited Hand Histories, Payout Inputs, Or A Sealed Analysis Artifact, So Smarter.Poker
              Will Not Present Them As Exact History Or Use Them To Grade Your Play.
            </p>

            <div
              role="note"
              style={{
                marginTop: 22,
                padding: 16,
                borderLeft: '3px solid #64dfff',
                background: 'rgba(0,174,255,0.08)',
                color: '#d5edf5',
                fontSize: 13,
                lineHeight: 1.65,
              }}
            >
              No Answer, Frequency, EV, Accuracy, Progress, Reward, Or Streak Is Recorded On This
              Archive Page. Choose A Verified Training Destination Below.
            </div>

            {brainEval && (
              <div
                data-specialty-brain-panel="true"
                data-brain-engine={brainEval.engineModule}
                data-recommended-action={brainEval.correctAnswer}
                data-active-variant={activeVariant}
                data-hero-position={heroPosition}
                style={{
                  marginTop: 24,
                  padding: 20,
                  border: '1px solid rgba(100, 223, 255, 0.38)',
                  background: 'rgba(3, 10, 18, 0.82)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#79e6ff', textTransform: 'uppercase' }}>
                    Horse Brain Spot &amp; Mastery Reference Panel
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fcd56a' }}>
                    Engine: {brainEval.engineModule} | Recommended: {brainEval.correctAnswerText}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                      Variant
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['nlh', 'plo4', 'plo5', 'plo6'].map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={activeVariant === v}
                          onClick={() => setActiveVariant(v)}
                          style={{
                            padding: '6px 12px',
                            border: activeVariant === v ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.16)',
                            background: activeVariant === v ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255,255,255,0.04)',
                            color: activeVariant === v ? '#7dd3fc' : '#cbd5e1',
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
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                      Position
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['BTN', 'CO', 'SB', 'BB'].map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          aria-pressed={heroPosition === pos}
                          onClick={() => setHeroPosition(pos)}
                          style={{
                            padding: '6px 12px',
                            border: heroPosition === pos ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.16)',
                            background: heroPosition === pos ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255,255,255,0.04)',
                            color: heroPosition === pos ? '#6ee7b7' : '#cbd5e1',
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
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                      Street
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['flop', 'turn', 'river'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          aria-pressed={activeStreet === st}
                          onClick={() => setActiveStreet(st)}
                          style={{
                            padding: '6px 12px',
                            border: activeStreet === st ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.16)',
                            background: activeStreet === st ? 'rgba(251, 191, 36, 0.18)' : 'rgba(255,255,255,0.04)',
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

                <p style={{ margin: '0 0 16px', fontSize: 12, color: '#b9ccd5', lineHeight: 1.6 }}>
                  {brainEval.explanation}
                </p>

                <button
                  type="button"
                  data-launch-club-arena-cta="true"
                  onClick={() => router.push(arenaHref)}
                  style={{
                    padding: '10px 16px',
                    border: '1px solid #64dfff',
                    background: 'linear-gradient(180deg, #2b718f 0%, #0a2d40 100%)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Practice Target Spot In Club Arena →
                </button>
              </div>
            )}

            <div style={{ display: 'grid', gap: 12, marginTop: 26 }}>
              {ROUTES.map((route) => (
                <button
                  key={route.href}
                  type="button"
                  onClick={() => router.push(route.href)}
                  style={{
                    width: '100%',
                    padding: '17px 18px',
                    border: route.primary
                      ? '1px solid rgba(139,238,255,0.78)'
                      : '1px solid rgba(255,255,255,0.18)',
                    background: route.primary
                      ? 'linear-gradient(180deg, #2b718f 0%, #0a2d40 48%, #061822 100%)'
                      : 'linear-gradient(180deg, rgba(42,52,60,0.96), rgba(8,14,18,0.98))',
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxShadow: 'inset 0 1px rgba(255,255,255,0.24), 0 10px 24px rgba(0,0,0,0.34)',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 900 }}>{route.label}</span>
                  <span style={{ display: 'block', marginTop: 4, color: '#b9ccd5', fontSize: 12 }}>
                    {route.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>
      <ConnectionToast />
      <HubPageSummary page="training-famous-finals" />
    </>
  );
}
