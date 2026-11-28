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

import React from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';


import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/training-play.module.css';
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


  return (
    <>
      <SEOHead
        title="Famous Finals Training Archive"
        description="Explore The Famous Finals Poker Training Archive On Smarter.Poker With Links To Verified Final Table ICM Simulators And Championship Strategy Drills."
        canonical="/hub/training/famous-finals"
      />

      <div className={s.shell}>
        <main data-training-authority="archive-ungraded" className={s.page}>
          <TrainingPageHead slug="training-famous-finals" help="An Archive Of Earlier Final-Table Reconstructions. They Are Not Graded Or Presented As History; Use The Verified Destinations On This Page To Train." />

          <section className={`sd-panel ${s.panel}`} aria-labelledby="famous-finals-status">
            <p className={s.tag}><span className={s.dot} aria-hidden />Archived · Not A Scored Game</p>
            <h2 id="famous-finals-status" className={s.sectionTitle}>Why This Archive Is Ungraded</h2>
            <p className={s.copy}>
              The Previous Final-Table Scenarios Were Authored Reconstructions. They Did Not Carry
              Cited Hand Histories, Payout Inputs, Or A Sealed Analysis Artifact, So Smarter.Poker
              Will Not Present Them As Exact History Or Use Them To Grade Your Play.
            </p>
            <p role="note" className={s.note}>
              No Answer, Frequency, EV, Accuracy, Progress, Reward, Or Streak Is Recorded On This
              Archive Page. Choose A Verified Training Destination Below.
            </p>
          </section>

          <section className={`sd-panel ${s.panel}`} aria-labelledby="famous-finals-destinations">
            <h2 id="famous-finals-destinations" className={s.sectionTitle}>Verified Destinations</h2>
            <div className={s.destinations}>
              {ROUTES.map((route) => (
                <button
                  key={route.href}
                  type="button"
                  onClick={() => router.push(route.href)}
                  className={`sd-button ${route.primary ? 'sd-primary' : ''} ${s.destination}`}
                >
                  <span className={s.destinationLabel}>{route.label}</span>
                  <span className={s.destinationCopy}>{route.description}</span>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
      <ConnectionToast />
      <HubPageSummary page="training-famous-finals" />
    </>
  );
}
