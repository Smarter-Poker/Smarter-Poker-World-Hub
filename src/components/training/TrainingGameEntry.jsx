import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft, Play } from 'lucide-react';
import SEOHead from '../seo/SEOHead';
import SmarterConversionCta from '../seo/SmarterConversionCta';
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

  const handleCardClick = (event) => {
    if (event.target?.closest?.('a, button, input, select, textarea, [role="button"]')) return;
    router.push(gameHref).catch(() => setNavigationFailed(true));
  };

  return (
    <>
      <SEOHead title={title} description={description} noindex />
      <main className="game-entry">
        <Link href="/hub/training" className="back sd-button">
          <ArrowLeft size={16} aria-hidden /> Training Games
        </Link>
        <section aria-labelledby="training-game-title" className="entry-card" onClick={handleCardClick}>
          <Link
            href={gameHref}
            className="art-link"
            aria-label={`Play ${title}`}
            data-entry-art-launch={gameId}
          >
            <TrainingGameArt gameId={gameId} className="art" sizes="(max-width: 640px) 100vw, 720px" />
          </Link>
          <div className="intro">
            <h1 id="training-game-title">{title}</h1>
            <p>{description}</p>
            {navigationFailed && <p role="status">Could Not Open The Game. Select Play To Try Again.</p>}
            <Link href={gameHref} className="sp-mtt-primary-cta sd-button sd-primary play">
              <Play size={18} aria-hidden /> Play
            </Link>
          </div>
        </section>
        <div style={{ marginTop: 18 }}>
          <SmarterConversionCta
            compact
            eyebrow="Free GTO Training Account"
            title={`Track Your ${title} Progress & Unlock 107 Free GTO Games`}
            description="Create A Free Smarter.Poker Account To Save Session Accuracy, Track Skill Tree Mastery, And Earn Daily Training Rewards."
            primaryLabel="Create Free Account"
            primaryHref={`/auth/signup?redirect=${encodeURIComponent(gameHref || '/hub/training')}&src=training-entry`}
            secondaryLabel="Sign In"
            secondaryHref={`/auth/login?redirect=${encodeURIComponent(gameHref || '/hub/training')}`}
          />
        </div>
      </main>
      <style jsx>{`
        .game-entry { max-width: 780px; padding: 18px 18px 90px; margin: 0 auto; color: #eff8fc; }
        .game-entry :global(.back), .game-entry :global(.play) {
          display: inline-flex; align-items: center; gap: 8px; min-height: 44px; text-decoration: none;
        }
        .game-entry :global(.back) { color: #f3f7fb; margin-bottom: 12px; padding: 0 14px; }
        .entry-card {
          overflow: hidden;
          border: 2px solid transparent;
          border-radius: 16px;
          background:
            linear-gradient(165deg, #0c2031 0%, #06131f 48%, #020a12 100%) padding-box,
            linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box;
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.58), inset 0 1px 1px rgba(255, 255, 255, 0.25);
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }
        .entry-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.68), 0 0 22px rgba(0, 154, 227, 0.28);
        }
        .entry-card :global(.art-link) {
          display: block;
          width: 100%;
          overflow: hidden;
          border-bottom: 1px solid #688299;
        }
        .entry-card :global(.art) { display: block; width: 100%; height: clamp(160px, 34vw, 280px); object-fit: cover; transition: transform 220ms ease; }
        .entry-card:hover :global(.art) { transform: scale(1.025); }
        .intro { padding: clamp(18px, 4vw, 30px); }
        h1 { font-size: clamp(28px, 6vw, 44px); margin: 0; color: #f3f7fb; }
        p { margin: 8px 0 20px; color: #c4d2df; }
        .game-entry :global(.play) { padding: 0 22px; min-height: 48px; font-weight: 800; }
        .game-entry :global(a:focus-visible) { outline: 3px solid #8de6ff; outline-offset: 3px; }
      `}</style>
    </>
  );
}
