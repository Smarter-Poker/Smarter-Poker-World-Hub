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
import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

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

export default function AggregateReports() {
  const router = useRouter();
  useTrainingBus('aggregate-reports');

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
            <button type="button" className="aggregate-secondary" onClick={() => router.push('/hub/training')}>
              Return To Training Hub
            </button>
          </div>
        </section>

        <style jsx>{`
          .aggregate-boundary {
            min-height: 100vh;
            padding: clamp(28px, 6vw, 76px) clamp(16px, 4vw, 44px) 80px;
            box-sizing: border-box;
            color: var(--sp-fg, #e9f8ff);
            background:
              radial-gradient(circle at 50% 5%, rgba(0, 174, 255, 0.20), transparent 34%),
              linear-gradient(180deg, #02070c 0%, #06121b 54%, #010407 100%);
          }
          .aggregate-panel {
            width: min(920px, 100%);
            margin: 0 auto;
            padding: clamp(22px, 5vw, 48px);
            box-sizing: border-box;
            border: 1px solid rgba(133, 224, 255, 0.34);
            border-radius: 16px;
            background: linear-gradient(145deg, rgba(10, 31, 45, 0.97), rgba(2, 9, 15, 0.99));
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
            font: 900 10px/1 var(--font-orbitron, 'Orbitron', sans-serif);
            letter-spacing: 1px;
            text-transform: uppercase;
          }
          .aggregate-kicker {
            margin: 28px 0 8px;
            color: #8fdcf0;
            font: 800 11px/1.4 var(--font-orbitron, 'Orbitron', sans-serif);
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
          article span { color: #61dff6; font: 900 9px/1 var(--font-orbitron, 'Orbitron', sans-serif); letter-spacing: 1.5px; }
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
          @media (max-width: 720px) {
            .aggregate-grid { grid-template-columns: 1fr; }
            article { min-height: 0; }
            .aggregate-actions button { width: 100%; }
          }
        `}</style>
      </main>
    </>
  );
}
