import { useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';

const VERIFIED_REPORT = '/hub/training/aggregate?source=ev-heatmap';

/**
 * The former heatmap displayed a hard-coded sample count and transformed mock
 * EV values when the user changed game type. That made generated numbers look
 * like measured player history. The legacy route now opens the authenticated,
 * session-backed aggregate report instead.
 */
export default function EvHeatmapPage() {
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) router.replace(VERIFIED_REPORT);
  }, [router]);

  return (
    <>
      <SEOHead title="EV Performance — Smarter.Poker" description="Measured training performance by position and street." noindex />
      <main className="sp-training-tool sp-training-tool--analysis" style={{ minHeight: 'calc(100vh - 70px)', padding: 'clamp(30px, 8vw, 90px) 18px', background: 'radial-gradient(circle at 50% 15%, #12354d 0, #050910 50%, #020407 100%)', color: '#fff' }}>
        <section className="sp-training-analysis-main" style={{ position: 'relative', maxWidth: 720, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', border: '1px solid rgba(145,229,255,.45)', background: 'linear-gradient(145deg, rgba(20,42,60,.97), rgba(4,9,15,.98))', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 7, border: '1px solid rgba(105,207,244,.14)' }} />
          <div style={{ position: 'relative' }}>
            <div className="sp-training-analysis-header" style={{ color: '#79e6ff', fontSize: 10, fontWeight: 900, letterSpacing: '.2em', textTransform: 'uppercase' }}>Measured Training Data</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>EV Performance</h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>Opening the authenticated performance report. Every value shown there comes from recorded training sessions; no sample counts or EV values are fabricated.</p>
            <a href={VERIFIED_REPORT} style={{ display: 'inline-flex', minHeight: 48, alignItems: 'center', padding: '0 20px', marginTop: 24, border: '1px solid #a5efff', background: 'linear-gradient(180deg, #2a6077, #07131d)', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>
              Continue To Performance Report →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
