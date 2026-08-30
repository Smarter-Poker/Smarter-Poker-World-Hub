import { useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';

const VERIFIED_DRILL = '/hub/training/arena/adv-003?level=1&source=nodelocking';

/**
 * The former node-locking page calculated recommendations with local heuristic
 * formulas and stored profiles inside training-session rows. This route now
 * opens the canonical authored Node Locking game and no longer contaminates
 * accuracy, streak, or leaderboard metrics with configuration saves.
 */
export default function NodelockingPage() {
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) router.replace(VERIFIED_DRILL);
  }, [router]);

  return (
    <>
      <SEOHead title="Node Locking — Smarter.Poker" description="Verified node-locking training." noindex />
      <main style={{ minHeight: 'calc(100vh - 70px)', padding: 'clamp(30px, 8vw, 90px) 18px', background: 'radial-gradient(circle at 50% 15%, #12354d 0, #050910 50%, #020407 100%)', color: '#fff' }}>
        <section style={{ position: 'relative', maxWidth: 720, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', border: '1px solid rgba(145,229,255,.45)', background: 'linear-gradient(145deg, rgba(20,42,60,.97), rgba(4,9,15,.98))', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 7, border: '1px solid rgba(105,207,244,.14)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ color: '#79e6ff', fontSize: 10, fontWeight: 900, letterSpacing: '.2em', textTransform: 'uppercase' }}>Verified Club Arena Drill</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>Node Locking</h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>Opening the authored Node Locking curriculum. Configuration changes are no longer recorded as perfect training sessions.</p>
            <a href={VERIFIED_DRILL} style={{ display: 'inline-flex', minHeight: 48, alignItems: 'center', padding: '0 20px', marginTop: 24, border: '1px solid #a5efff', background: 'linear-gradient(180deg, #2a6077, #07131d)', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>
              Continue To Node Locking →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
