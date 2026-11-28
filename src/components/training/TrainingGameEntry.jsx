import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft, Play } from 'lucide-react';
import SEOHead from '../seo/SEOHead';
import TrainingImageHeader from './TrainingImageHeader';
import { getGameById, CATEGORIES } from '../../data/TRAINING_LIBRARY';
import { GAME_CONFIGS } from '../../config/gameConfigs';
import s from '../../styles/training/training-play.module.css';

const toTitle = (value) => String(value || '')
  .split(/(\s+|-)/)
  .map((part) => (/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part))
  .join('');

/**
 * A Training game entry page under #SMARTERDESIGN: Back row above the image
 * header, then one steel-rimmed briefing panel (what the game trains, its
 * table format, stack depth and difficulty from the game catalog) with the
 * cobalt Play action, and a short how-it-works panel.
 */
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

  // Each entry page has its own header art keyed by its route.
  const slug = 'training-' + String(router.pathname || '').split('/').pop();
  const hrefGameId = String(gameHref || '').match(/\/arena\/([^?/]+)/)?.[1];
  const game = getGameById(gameId) || getGameById(hrefGameId) || null;
  const config = GAME_CONFIGS[gameId] || GAME_CONFIGS[hrefGameId] || null;
  const category = game ? Object.values(CATEGORIES).find((c) => c.id === String(game.category).toLowerCase()) : null;
  const difficulty = Math.max(0, Math.min(5, Number(game?.difficulty) || 0));
  const facts = [
    config?.format && { label: 'Table Format', value: config.format },
    config?.stackDepth && { label: 'Stack Depth', value: config.stackDepth.replace(/BB/g, ' BB') },
  ].filter(Boolean);

  return (
    <>
      <SEOHead title={title} description={description} noindex />
      <div className={s.shell}>
        <main className={s.page}>
          <div className="sp-training-head">
            <div className="sd-back-row">
              <Link href="/hub/training" className="sd-button">
                <ArrowLeft size={16} aria-hidden /> Back To Training Games
              </Link>
            </div>
            <TrainingImageHeader slug={slug} title={title} help={description} titleId="training-game-title" />
          </div>

          <section className={`sd-panel ${s.panel}`} aria-labelledby="training-game-title">
            {(category || game) && (
              <p className={s.tag}>
                <span className={s.dot} aria-hidden />
                {[category?.name, game?.name].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className={s.entryLead}>{description}</p>
            {game?.focus && (
              <p className={s.copy}>
                Focus: <span className={s.ice}>{toTitle(game.focus)}</span>
              </p>
            )}

            {(facts.length > 0 || difficulty > 0) && (
              <div className={s.entryFacts} aria-label="Game Details">
                {facts.map((fact) => (
                  <div key={fact.label} className={`sd-metric ${s.metric}`}>
                    <span className={s.metricLabel}>{fact.label}</span>
                    <strong className={s.metricValue}>{fact.value}</strong>
                  </div>
                ))}
                {difficulty > 0 && (
                  <div className={`sd-metric ${s.metric}`}>
                    <span className={s.metricLabel}>Difficulty</span>
                    <strong className={s.metricValue} data-tone="ice">{difficulty} / 5</strong>
                    <span className={s.difficulty} aria-hidden>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`${s.pip} ${n <= difficulty ? s.pipOn : ''}`} />
                      ))}
                    </span>
                  </div>
                )}
              </div>
            )}

            {navigationFailed && <p role="status" className={s.error}>Could Not Open The Game. Select Play To Try Again.</p>}
            <Link href={gameHref} className={`sd-button sd-primary ${s.primaryAction}`}>
              <Play size={20} aria-hidden /> Play
            </Link>
          </section>

          <section className={`sd-panel ${s.panel}`} aria-labelledby="training-game-how">
            <h2 id="training-game-how" className={s.sectionTitle}>How It Works</h2>
            <ol className={s.steps}>
              <li><span><strong>Open The Table.</strong> Play Starts Level 1 On The Club Arena Training Table.</span></li>
              <li><span><strong>Make Each Decision.</strong> Every Hand Is Graded With An Explanation Of The Best Line.</span></li>
              <li><span><strong>Climb The Levels.</strong> Pass A Level To Advance To The Next One.</span></li>
            </ol>
          </section>
        </main>
      </div>
    </>
  );
}
