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
import Head from 'next/head';
import { useRouter } from 'next/router';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import Link from 'next/link';
import s from '../../../src/styles/training/sessions-coaching.module.css';

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
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

  return (
    <>
      <Head>
        <title>Aggregate Reports | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Aggregate solver reports remain unavailable until every cohort member has audited identity and provenance."
        />
      </Head>

      <main className="aggregate-boundary" style={{ minHeight: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'clip', background: '#040d18', color: '#f2f7ff' }}>
        <TrainingPageHead slug="training-aggregate" />
        <div className={s.page}>
          <section className={`sd-panel ${s.panel}`} aria-labelledby="aggregate-title">
            <div className={s.panelHead}>
              <span className={s.tag}>
                <ShieldIcon />
                Solver Integrity Gate
              </span>
              <p className={s.eyebrow}>Audited Cohort Analysis</p>
            </div>
            <h2 id="aggregate-title" className={s.sectionTitle}>Aggregate Reports Are Paused</h2>
            <p className={s.copy}>
              The Previous Report Combined Solver Rows Without Proving Complete Identity,
              Source Lineage, Cohort Membership, Or Board Weighting. Those Numbers Are Not
              Reliable Enough To Teach From, So They Have Been Removed.
            </p>
          </section>

          <section className={`sd-panel ${s.panel}`} aria-labelledby="aggregate-requirements-title">
            <h2 id="aggregate-requirements-title" className={s.sectionTitle}>What Reopening Requires</h2>
            <div className={s.cardGrid}>
              <article className={`sd-metric ${s.card}`}>
                <span className={s.eyebrow}>Required</span>
                <strong className={s.subTitle}>Canonical Row Identity</strong>
                <p className={s.copy}>Every Street, Board, Position, Stack, Actor, And Decision Node Must Match.</p>
              </article>
              <article className={`sd-metric ${s.card}`}>
                <span className={s.eyebrow}>Required</span>
                <strong className={s.subTitle}>Complete Solver Lineage</strong>
                <p className={s.copy}>Machine, Binary, Pipeline, Manifest, Source Artifact, And Audit Must Be Sealed.</p>
              </article>
              <article className={`sd-metric ${s.card}`}>
                <span className={s.eyebrow}>Required</span>
                <strong className={s.subTitle}>Documented Weighting</strong>
                <p className={s.copy}>Texture Results Must Use A Reproducible, Complete, Non-Duplicated Cohort.</p>
              </article>
            </div>
          </section>

          <nav className={`sd-panel ${s.panel}`} aria-label="Aggregate Report Alternatives">
            <div className={s.actions} style={{ flexDirection: 'column' }}>
              <button type="button" className={`sd-button sd-primary ${s.button} ${s.primary}`} onClick={() => router.push('/hub/training/solutions')}>
                Open Audited Solutions
              </button>
              <Link className={`sd-button ${s.button}`} data-training-destination="true" href="/hub/training/reports">
                View My Training Reports
              </Link>
              <button type="button" className={`sd-button ${s.button}`} onClick={() => router.push('/hub/training')}>
                Return To Training Hub
              </button>
            </div>
          </nav>
        </div>
      </main>
    </>
  );
}

AggregateReports.displayName = 'AggregateReports';
