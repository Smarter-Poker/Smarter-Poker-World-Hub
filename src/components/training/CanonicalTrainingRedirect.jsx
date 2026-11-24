import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../seo/SEOHead';
import { evaluateTrainingSpotWithHorseBrain, buildCustomTrainingArenaHref } from '../../lib/training/horseBrainTrainingAdapter';

/**
 * Compatibility surface for retired legacy trainers. It preserves bookmarks
 * while moving the player into the authored Club Arena curriculum that owns
 * grading, feedback, progression, and persistence for the concept.
 */
export default function CanonicalTrainingRedirect({
  title,
  description,
  href,
  eyebrow = 'Verified Club Arena Drill',
  action = 'Continue To Training',
  shellClassName = '',
  headerClassName = '',
  mainClassName = '',
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [brainVariant, setBrainVariant] = useState('nlh');

  const brainPreview = useMemo(
    () =>
      evaluateTrainingSpotWithHorseBrain({
        variant: brainVariant,
        street: 'flop',
        heroPosition: 'BTN',
        villainPosition: 'BB',
        heroCards:
          brainVariant === 'plo6'
            ? ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d']
            : brainVariant === 'plo5'
              ? ['As', 'Ks', 'Qh', 'Jh', 'Td']
              : brainVariant === 'plo4'
                ? ['As', 'Ks', 'Qh', 'Jh']
                : ['As', 'Kd'],
        boardCards: ['Qs', '7d', '2c'],
        potSizeBb: 12,
        facingBetBb: 4,
        effectiveStackBb: 100,
      }),
    [brainVariant]
  );

  const retryRedirect = () => {
    setError(null);
    setIsLoading(true);
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline) {
      setError('Offline connection detected; 401 session expired or sign in required after reconnect.');
      setIsLoading(false);
      return;
    }
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('sp_canonical_redirect_ts', String(Date.now()));
      }
      router.replace(href || buildCustomTrainingArenaHref({ format: 'cash', variant: brainVariant, streets: ['flop'], positions: ['BTN'], stackDepth: 100 }, 'canonical-redirect'));
    } catch (err) {
      setError(err?.message || 'Redirect failed');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (router.isReady) {
      setIsLoading(false);
      router.replace(href);
    }
  }, [router, href]);

  const isEmpty = !href || href.length === 0;

  return (
    <>
      <SEOHead title={`${title} - Smarter.Poker`} description={description} noindex />
      <main className={shellClassName} style={{ minHeight: 'calc(100dvh - 70px)', padding: 'clamp(30px, 8vw, 90px) 18px', background: 'radial-gradient(circle at 50% 15%, #12354d 0, #050910 50%, #020407 100%)', color: '#fff' }}>
        <section className={mainClassName} style={{ position: 'relative', maxWidth: 720, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', border: '1px solid rgba(145,229,255,.45)', background: 'linear-gradient(145deg, rgba(20,42,60,.97), rgba(4,9,15,.98))', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)' }}>
          <div style={{ position: 'relative' }}>
            <div className={headerClassName} style={{ color: '#79e6ff', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{eyebrow}</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>{title}</h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>{description}</p>
            {isLoading && <div style={{ marginTop: 10, fontSize: 12, color: '#79e6ff' }}>Synchronizing Route State...</div>}
            {isEmpty && <div style={{ marginTop: 10, fontSize: 12, color: '#fbbf24' }}>Target Destination Is Empty.</div>}
            {error && (
              <div role="alert" style={{ marginTop: 10, fontSize: 12, color: '#f87171' }}>
                {error}
                <button type="button" onClick={retryRedirect} style={{ marginLeft: 8, padding: '4px 10px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, cursor: 'pointer' }}>
                  Retry Redirect
                </button>
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 24 }}>
              <a href={href} style={{ display: 'inline-flex', minHeight: 48, alignItems: 'center', padding: '0 20px', border: '1px solid #a5efff', background: 'linear-gradient(180deg, #2a6077, #07131d)', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>
                {action} →
              </a>
              <button
                type="button"
                data-launch-club-arena-cta="true"
                onClick={retryRedirect}
                style={{ minHeight: 48, padding: '0 18px', border: '1px solid rgba(165,239,255,0.45)', background: 'rgba(15,32,46,0.9)', color: '#79e6ff', fontWeight: 800, cursor: 'pointer' }}
              >
                Launch 1:1 Club Arena Drill
              </button>
            </div>
            <div
              data-specialty-brain-panel="true"
              data-brain-engine={brainPreview?.engineModule || 'holdem-brain.js'}
              data-recommended-action={brainPreview?.recommendedAction || 'Call'}
              style={{ marginTop: 20, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(121,230,255,0.25)', background: 'rgba(4,12,20,0.65)', fontSize: 12 }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {['nlh', 'plo4', 'plo5', 'plo6'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-brain-variant-tab={v}
                    onClick={() => setBrainVariant(v)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: brainVariant === v ? '1px solid #79e6ff' : '1px solid rgba(255,255,255,0.14)',
                      background: brainVariant === v ? 'rgba(121,230,255,0.16)' : 'rgba(255,255,255,0.04)',
                      color: brainVariant === v ? '#79e6ff' : '#b7c9d7',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: '#cbd5e1' }}>
                <span>Engine: <strong style={{ color: '#79e6ff' }}>{brainPreview?.engineModule}</strong></span>
                <span data-brain-action={brainPreview?.recommendedAction}>Action: <strong style={{ color: '#4ade80' }}>{brainPreview?.recommendedAction}</strong></span>
                <span data-brain-made-hand={brainPreview?.madeHandCategory}>Hand: <strong>{brainPreview?.madeHandCategory}</strong></span>
                <span data-brain-pot-limit-max={brainPreview?.potLimitSizing?.maxPotBetOrRaise || 100}>Max: <strong>{brainPreview?.potLimitSizing?.maxPotBetOrRaise || 100} BB</strong></span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
