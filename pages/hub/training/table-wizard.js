import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

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
      <main style={{ minHeight: 'calc(100dvh - 70px)', padding: 'clamp(30px, 8vw, 90px) 18px', background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)', color: '#fff' }}>
        <section style={{ position: 'relative', maxWidth: 720, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', border: '1px solid #688299', borderTopColor: '#aec0d0', background: 'linear-gradient(180deg, rgba(9, 23, 39, 0.96) 0%, rgba(3, 11, 20, 0.98) 100%)', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 7, border: '1px solid rgba(105,207,244,.14)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ color: '#79e6ff', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Verified Club Arena Drill</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1, textTransform: 'capitalize' }}>Table Selection</h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>Practice Choosing A Table.</p>

            <a href={VERIFIED_DRILL} style={{ display: 'inline-flex', minHeight: 48, alignItems: 'center', padding: '0 20px', marginTop: 24, border: '1px solid #a5efff', background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>
              Continue To Table Selection →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
