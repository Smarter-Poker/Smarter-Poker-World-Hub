import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft, Play } from 'lucide-react';
import SEOHead from '../seo/SEOHead';
import TrainingImageHeader from './TrainingImageHeader';

export default function TrainingGameEntry({ title, description, gameHref, allowAutoRedirect = false }) {
  const router = useRouter();
  const [navigationFailed, setNavigationFailed] = useState(false);
  useEffect(() => {
    if (!allowAutoRedirect || !router.isReady || router.query.autoRedirect !== '1') return undefined;
    let active = true;
    router.replace(gameHref).catch(() => {
      if (active) setNavigationFailed(true);
    });
    return () => { active = false; };
  }, [allowAutoRedirect, gameHref, router]);

  // Each entry page has its own header art keyed by its route.
  const slug = 'training-' + String(router.pathname || '').split('/').pop();
  return (
    <>
      <SEOHead title={title} description={description} noindex />
      <main className="game-entry">
        <div className="sd-back-row">
          <Link href="/hub/training" className="sd-button">
            <ArrowLeft size={16} aria-hidden /> Training Games
          </Link>
        </div>
        <TrainingImageHeader slug={slug} title={title} help={description} titleId="training-game-title" />
        <section className="sd-panel intro" aria-labelledby="training-game-title">
          <p>{description}</p>
          {navigationFailed && <p role="status">Could Not Open The Game. Select Play To Try Again.</p>}
          <Link href={gameHref} className="sp-mtt-primary-cta play sd-button sd-primary">
            <Play size={18} aria-hidden /> Play
          </Link>
        </section>
      </main>
      <style jsx>{`
        .game-entry { box-sizing: border-box; max-width: 780px; padding: 14px clamp(10px, 3vw, 18px) 110px; margin: 0 auto; color: #f2f7ff; display: grid; gap: 14px; }
        .game-entry :global(.sd-back-row) { margin: 0; }
        .intro { display: grid; gap: 14px; justify-items: start; }
        .intro p { margin: 0; color: #bdd0e2; font-size: 1rem; line-height: 1.55; }
        .game-entry :global(.play) { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; min-width: 9rem; padding: 0 22px; font-size: 1.1rem; }
        .game-entry :global(a:focus-visible) { outline: 2px solid #83deff; outline-offset: 3px; }
      `}</style>
    </>
  );
}
