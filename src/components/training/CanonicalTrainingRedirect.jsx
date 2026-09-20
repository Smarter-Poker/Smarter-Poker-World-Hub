import { useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../seo/SEOHead';

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

  useEffect(() => {
    if (router.isReady) router.replace(href);
  }, [router, href]);

  return (
    <>
      <SEOHead title={`${title} - Smarter.Poker`} description={description} noindex />
      <main className={shellClassName} style={{ minHeight: 'calc(100dvh - 70px)', padding: 'clamp(30px, 8vw, 90px) 18px', background: 'radial-gradient(circle at 50% 15%, #12354d 0, #050910 50%, #020407 100%)', color: '#fff' }}>
        <section className={mainClassName} style={{ position: 'relative', maxWidth: 720, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', border: '1px solid rgba(145,229,255,.45)', background: 'linear-gradient(145deg, rgba(20,42,60,.97), rgba(4,9,15,.98))', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)' }}>
          <div style={{ position: 'relative' }}>
            <div className={headerClassName} style={{ color: '#79e6ff', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{eyebrow}</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(30px, 6vw, 54px)', lineHeight: 1 }}>{title}</h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>{description}</p>
            <a href={href} style={{ display: 'inline-flex', minHeight: 48, alignItems: 'center', padding: '0 20px', marginTop: 24, border: '1px solid #a5efff', background: 'linear-gradient(180deg, #2a6077, #07131d)', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>
              {action} →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
