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

import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

const ROUTES = [
  {
    label: 'Open Audited Spot Study',
    description: 'Review answer-revealed audited artifacts in an explicitly ungraded study utility.',
    href: '/hub/training/spot-trainer?source=famous-finals-archive',
    primary: true,
  },
  {
    label: 'Open Tournament Preparation',
    description: 'Plan tournament structures without inventing a solved final-table result.',
    href: '/hub/training/tournament-prep?source=famous-finals-archive',
    primary: false,
  },
];

export default function FamousFinalsArchivePage() {
  const router = useRouter();
  useTrainingBus('famous-finals');

  return (
    <>
      <Head>
        <title>Famous Finals Archive | Smarter.Poker Training</title>
        <meta
          name="description"
          content="A truthful archive notice with links to verified poker training experiences."
        />
      </Head>

      <main
        data-training-authority="archive-ungraded"
        style={{
          minHeight: '100vh',
          width: '100%',
          maxWidth: '100vw',
          boxSizing: 'border-box',
          overflowX: 'hidden',
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
                fontSize: 11,
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
    </>
  );
}
