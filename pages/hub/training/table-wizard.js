import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

import { ArrowRight } from 'lucide-react';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/training-play.module.css';

const VERIFIED_DRILL = '/hub/training/arena/cash-020?level=1&start=1&source=table-wizard';

/**
 * Table Wizard used to generate a fictional lobby, waitlists, and player
 * statistics, then award a perfect training result for choosing any table.
 * Route the legacy entry point to the real table-selection curriculum.
 */
export default function TableWizardPage() {
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) router.replace(VERIFIED_DRILL);
  }, [router]);

  return (
    <>
      <SEOHead title="Table Selection - Smarter.Poker" description="Verified Table-Selection Training." noindex />
      <UniversalHeader pageDepth={2} />
      <div className={s.shell}>
        <main className={s.page}>
          <TrainingPageHead slug="training-table-wizard" />
          <section className={`sd-panel ${s.panel}`} aria-labelledby="table-selection-title">
            <h2 id="table-selection-title" className={s.sectionTitle}>Verified Club Arena Drill</h2>
            <p className={s.copy}>Practice Choosing A Table.</p>
            <a href={VERIFIED_DRILL} className={`sd-button sd-primary ${s.primaryAction}`}>
              Continue To Table Selection <ArrowRight size={18} aria-hidden />
            </a>
          </section>
        </main>
      </div>
    </>
  );
}
