import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft, Play } from 'lucide-react';
import SEOHead from '../seo/SEOHead';
import TrainingGameArt from './TrainingGameArt';

export default function TrainingGameEntry({ title, description, gameId, gameHref, allowAutoRedirect = false }) {
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

  return (
    <>
      <SEOHead title={title} description={description} noindex />
      <main className="game-entry">
        <Link href="/hub/training" className="back">
          <ArrowLeft size={16} aria-hidden /> Training Games
        </Link>
        <section aria-labelledby="training-game-title">
          <TrainingGameArt gameId={gameId} className="art" sizes="(max-width: 640px) 100vw, 720px" />
          <div className="intro">
            <h1 id="training-game-title">{title}</h1>
            <p>{description}</p>
            {navigationFailed && <p role="status">Could Not Open The Game. Select Play To Try Again.</p>}
            <Link href={gameHref} className="sp-mtt-primary-cta play">
              <Play size={18} aria-hidden /> Play
            </Link>
          </div>
        </section>
      </main>
      <style jsx>{`
        .game-entry { max-width: 780px; padding: 18px 18px 90px; margin: 0 auto; color: #eff8fc; }
        .game-entry :global(.back), .game-entry :global(.play) {
          display: inline-flex; align-items: center; gap: 8px; min-height: 44px;
        }
        .game-entry :global(.back) { color: #d0e3f4; margin-bottom: 10px; }
        section { overflow: hidden; border: 1px solid #688299; border-radius: 8px; background: #040d18; }
        section :global(.art) { display: block; width: 100%; height: clamp(130px, 30vw, 240px); object-fit: cover; }
        .intro { padding: clamp(18px, 4vw, 30px); }
        h1 { font-size: clamp(28px, 6vw, 44px); margin: 0; }
        p { margin: 8px 0 20px; color: #b9cddd; }
        .game-entry :global(.play) { padding: 0 20px; }
        .game-entry :global(a:focus-visible) { outline: 2px solid #83deff; outline-offset: 3px; }
      `}</style>
    </>
  );
}
