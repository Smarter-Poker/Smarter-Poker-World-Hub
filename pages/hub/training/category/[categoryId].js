import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, Atom, DollarSign, Rocket, Trophy, Brain, Search, X } from 'lucide-react';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { getGamesByCategory } from '../../../../src/data/TRAINING_LIBRARY';
import useTrainingProgress from '../../../../src/hooks/useTrainingProgress';
import useTrainingFavorites from '../../../../src/hooks/useTrainingFavorites';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';
import PageTransition from '../../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import TrainingGameArt from '../../../../src/components/training/TrainingGameArt';
import TrainingLobbyRow from '../../../../src/components/training/lobby/TrainingLobbyRow';
import TrainingSortBar from '../../../../src/components/training/lobby/TrainingSortBar';
import TrainingGamePreviewSheet from '../../../../src/components/training/lobby/TrainingGamePreviewSheet';
import { getAuthUser } from '../../../../src/lib/authUtils';
import { resolvePresetForGame } from '../../../../src/lib/training/trainingPresets.mjs';
import {
  DEFAULT_LOBBY_FILTERS,
  buildLobbyGameMeta,
  filterAndSortTrainingGames,
} from '../../../../src/lib/training/trainingLobbyFilter.mjs';

const CATEGORY_META = {
  MTT: {
    title: 'Tournaments',
    Icon: Trophy,
    accent: '#86daff',
    description: 'Tournament pressure, stack survival, ICM and final-table execution.',
  },
  CASH: {
    title: 'Cash Games',
    Icon: DollarSign,
    accent: '#62e9a6',
    description: 'Street-by-street range discipline for deep, repeatable cash-game decisions.',
  },
  SPINS: {
    title: 'Spins & SNGs',
    Icon: Rocket,
    accent: '#86daff',
    description: 'Fast stack transitions, heads-up pressure and hyper-turbo execution.',
  },
  PSYCHOLOGY: {
    title: 'Mental Game',
    Icon: Brain,
    accent: '#86daff',
    description: 'Decision discipline, emotional control and resilient performance under pressure.',
  },
  ADVANCED: {
    title: 'Poker Strategy',
    Icon: Atom,
    accent: '#68d8ff',
    description: 'Range construction, equilibrium mechanics and high-resolution strategic theory.',
  },
};

export default function CategoryPage() {
  const router = useRouter();
  const categoryId = typeof router.query.categoryId === 'string'
    ? router.query.categoryId.toUpperCase()
    : '';
  const { getGameProgress } = useTrainingProgress();
  useTrainingBus('training-category', { categoryId });

  const [authUser, setAuthUser] = useState(null);
  useEffect(() => {
    setAuthUser(getAuthUser());
  }, []);

  const { favoriteIds, favoriteCount, toggleFavorite } = useTrainingFavorites(authUser);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('recommended');
  const [sortDir, setSortDir] = useState('asc');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const controlsRef = useRef(null);
  const searchRef = useRef(null);

  const category = CATEGORY_META[categoryId];
  const pageHead = (
    <SEOHead
      title={category ? `${category.title} | Training` : 'GTO Training Category'}
      description={category?.description || 'A Category Of Smarter.Poker GTO Training Drills.'}
      noindex={true}
    />
  );

  const games = useMemo(() => (category ? getGamesByCategory(categoryId) : []), [category, categoryId]);

  const metaMap = useMemo(() => {
    const map = new Map();
    for (const g of games) map.set(g.id, buildLobbyGameMeta(g));
    return map;
  }, [games]);

  const categoryFilters = useMemo(() => ({
    ...DEFAULT_LOBBY_FILTERS,
    category: 'ALL',
    query,
    sortKey,
    sortDir,
    favoritesOnly,
  }), [query, sortKey, sortDir, favoritesOnly]);

  const items = useMemo(() => (
    filterAndSortTrainingGames(games, categoryFilters, {
      metaMap,
      favoriteIds,
      getProgress: (id) => getGameProgress?.(id)?.completionPercent ?? 0,
    })
  ), [games, categoryFilters, metaMap, favoriteIds, getGameProgress]);

  if (!router.isReady) return pageHead;

  const heroArtId = games[0]?.id || 'quiz-gauntlet';
  const featuredGame = games[0] || null;
  const featuredPreset = featuredGame ? resolvePresetForGame(featuredGame) : null;

  if (!category || games.length === 0) {
    return (
      <PageTransition>
        <UniversalHeader pageDepth={2} />
        <main className="sp-category-missing">
          <p>Training Sector Unavailable.</p>
          <button type="button" className="sd-button" onClick={() => router.push('/hub/training')}>
            Return To Training
          </button>
        </main>
      </PageTransition>
    );
  }

  const Icon = category.Icon;
  const playGame = (game, overrides) => router.push({
    pathname: '/hub/training/arena/[gameId]',
    query: {
      gameId: game.id,
      start: '1',
      source: 'training-category',
      ...(overrides?.variant ? { variant: overrides.variant } : {}),
      ...(overrides?.bettingStructure ? { bettingStructure: overrides.bettingStructure } : {}),
      ...(overrides?.targetStreet ? { targetStreet: overrides.targetStreet } : {}),
    },
  });

  return (
    <PageTransition>
      {pageHead}
      <div className="sp-training-category" style={{ '--category-accent': 'var(--sd-ice)' }}>
        <UniversalHeader pageDepth={2} />

        <main className="sp-arena-lobby-shell">
          <section className="sp-arena-masthead sp-category-hero sd-masthead">
            <div className="sp-category-hero-art" aria-hidden="true">
              <TrainingGameArt
                gameId={heroArtId}
                sizes="(max-width: 700px) 100vw, 1000px"
                loading="eager"
              />
            </div>
            <div className="sp-category-hero-shade" aria-hidden="true" />

            <div className="sp-cat-topbar">
              <button
                className="sd-button sp-cat-back-btn"
                type="button"
                onClick={() => router.push('/hub/training')}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>All Training Games</span>
              </button>
              <span className="sp-arena-deck__count sp-num">{games.length} Games</span>
            </div>

            <div className="sp-cat-banner">
              <div className="sp-cat-banner__copy">
                <div className="sp-cat-banner__title-row">
                  <Icon size={18} aria-hidden="true" />
                  <h1>{category.title}</h1>
                </div>
                <p>{category.description}</p>
              </div>
            </div>

            {featuredGame && (
              <div className="sp-arena-quickbar sp-cat-quickbar" data-category-preset-summary="true">
                <div className="sp-arena-quickbar__copy">
                  <span className="sp-arena-quickbar__tag">Top Drill</span>
                  <span className="sp-arena-quickbar__text">
                    {featuredGame.name} · {featuredPreset?.summary || 'Preset Ready'}
                  </span>
                </div>
                <button
                  type="button"
                  data-category-quick-start="true"
                  className="sp-arena-quickbar__cta sd-button sd-primary"
                  onClick={() => playGame(featuredGame)}
                >
                  Play Now
                </button>
              </div>
            )}
          </section>

          <section className="sp-arena-lobby-section" aria-labelledby="category-library-title">
            <div className="sp-arena-deck" ref={controlsRef}>
              <div className="sp-arena-deck__heading-row">
                <h2 id="category-library-title" className="sp-arena-deck__heading">
                  Choose A Game
                </h2>
                <span className="sp-arena-deck__count sp-num">
                  {items.length} Of {games.length}
                </span>
              </div>

              <div className="sp-toolbar sp-arena-search-row">
                <label className="sp-search sp-arena-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="search"
                    aria-label={`Search ${category.title}`}
                    placeholder={`Search ${category.title}…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      type="button"
                      className="sp-arena-search__clear"
                      aria-label="Clear Search"
                      onClick={() => setQuery('')}
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  )}
                </label>
              </div>
            </div>

            <TrainingSortBar
              filters={categoryFilters}
              onSortChange={(nextKey, nextDir) => {
                setSortKey(nextKey);
                setSortDir(nextDir);
              }}
              onToggleFavorites={() => setFavoritesOnly((prev) => !prev)}
              onOpenFilters={() => searchRef.current?.focus()}
              onJumpToControls={(focusSearch) => {
                controlsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (focusSearch) searchRef.current?.focus({ preventScroll: true });
              }}
              controlsRef={controlsRef}
              favoriteCount={favoriteCount}
            />

            {items.length > 0 ? (
              <div className="sp-arena-sections">
                <div className="sp-arena-row-list">
                  {items.map((item, index) => (
                    <TrainingLobbyRow
                      key={item.game.id}
                      item={item}
                      index={index}
                      onStart={playGame}
                      onToggleFavorite={toggleFavorite}
                      onOpenPreview={setPreviewItem}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="sp-arena-empty" role="status">
                <p>No {category.title} Drills Match Your Filter.</p>
                <button
                  type="button"
                  className="sd-button"
                  onClick={() => {
                    setQuery('');
                    setFavoritesOnly(false);
                  }}
                >
                  Reset Filters
                </button>
              </div>
            )}
          </section>

          <TrainingGamePreviewSheet
            item={previewItem}
            onClose={() => setPreviewItem(null)}
            onLaunch={playGame}
            onToggleFavorite={toggleFavorite}
          />
        </main>
      </div>

      <style jsx>{`
        .sp-training-category {
          min-height: 100dvh;
          color: #f2f7ff;
          background: #040d18;
        }
        .sp-category-hero {
          position: relative;
          overflow: hidden;
        }
        .sp-category-hero-art { position: absolute; inset: 0; overflow: hidden; }
        .sp-category-hero-art :global(picture),
        .sp-category-hero-art :global(img) { display: block; width: 100%; height: 100%; }
        .sp-category-hero-art :global(img) { object-fit: cover; object-position: center; filter: saturate(1.02) contrast(1.08) brightness(0.45); }
        .sp-category-hero-shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(4, 13, 24, 0.72) 0%, rgba(4, 13, 24, 0.92) 100%);
          pointer-events: none;
        }
        .sp-cat-topbar,
        .sp-cat-banner,
        .sp-cat-quickbar {
          position: relative;
          z-index: 2;
        }
        .sp-cat-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .sp-cat-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 44px;
          padding: 0 12px;
          font-size: 13px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .sp-cat-banner {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sp-cat-banner__copy {
          min-width: 0;
          flex: 1;
        }
        .sp-cat-banner__title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #86daff;
        }
        .sp-cat-banner__title-row h1 {
          margin: 0;
          font-family: var(--font-orbitron, 'Orbitron'), var(--font-rajdhani, sans-serif);
          font-size: clamp(20px, 4.5vw, 28px);
          font-weight: 800;
          color: #f2f7ff;
          text-transform: uppercase;
        }
        .sp-cat-banner__copy p {
          margin: 4px 0 0;
          font-size: 13px;
          line-height: 1.4;
          color: #bdd0e2;
        }
        .sp-category-missing {
          min-height: calc(100dvh - 60px);
          display: grid;
          place-content: center;
          gap: 14px;
          color: #f2f7ff;
          background: #040d18;
          text-align: center;
        }
      `}</style>
    </PageTransition>
  );
}
