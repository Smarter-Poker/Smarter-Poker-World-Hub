import { useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { ArrowLeft, Atom, DollarSign, Rocket, Trophy, Brain, Search, X, SlidersHorizontal, Star } from 'lucide-react';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { getGamesByCategory } from '../../../../src/data/TRAINING_LIBRARY';
import useTrainingProgress from '../../../../src/hooks/useTrainingProgress';
import useTrainingFavorites from '../../../../src/hooks/useTrainingFavorites';
import { useAvatar } from '../../../../src/contexts/AvatarContext';
import TrainingFavoritesNotice from '../../../../src/components/training/lobby/TrainingFavoritesNotice';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';
import PageTransition from '../../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import TrainingImageHeader from '../../../../src/components/training/TrainingImageHeader';
import TrainingLobbyResults from '../../../../src/components/training/lobby/TrainingLobbyResults';
const TrainingFiltersSheet = dynamic(
  () => import('../../../../src/components/training/lobby/TrainingFiltersSheet'),
  { ssr: false }
);
import TrainingSortBar from '../../../../src/components/training/lobby/TrainingSortBar';
const TrainingGamePreviewSheet = dynamic(
  () => import('../../../../src/components/training/lobby/TrainingGamePreviewSheet'),
  { ssr: false }
);
import lobbyStyles from '../../../../src/components/training/lobby/TrainingLobby.module.css';
import { resolvePresetForGame, VARIANT_METADATA } from '../../../../src/lib/training/trainingPresets.mjs';
import {
  DEFAULT_LOBBY_FILTERS,
  buildLobbyGameMeta,
  countAdvancedFilters,
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

  const { user: authUser, initializing } = useAvatar();

  const { favoriteIds, favoriteCount, favoritesLoading, favoritesError, retryFavorites, toggleFavorite } =
    useTrainingFavorites(authUser, initializing);
  const favoritesUnavailable = favoritesLoading || Boolean(favoritesError);
  const [categoryFilters, setCategoryFilters] = useState(DEFAULT_LOBBY_FILTERS);
  const [viewMode, setViewMode] = useState('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { query, favoritesOnly, variant } = categoryFilters;
  const advancedCount = countAdvancedFilters(categoryFilters);
  const updateFilters = (patch) => setCategoryFilters((previous) => ({ ...previous, ...patch }));
  const resetFilters = () => setCategoryFilters(DEFAULT_LOBBY_FILTERS);
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

  const items = useMemo(() => (
    filterAndSortTrainingGames(games, categoryFilters, {
      metaMap,
      favoriteIds,
      getProgress: (id) => getGameProgress?.(id)?.completionPercent ?? 0,
    })
  ), [games, categoryFilters, metaMap, favoriteIds, getGameProgress]);

  if (!router.isReady) return pageHead;

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

  const playGame = (game, overrides = variant !== 'ALL' && game.category !== 'PSYCHOLOGY'
    ? { variant, bettingStructure: VARIANT_METADATA[variant]?.defaultStructure }
    : null) => {
    if (!game) return;
    const focusPosition = overrides?.heroPosition || overrides?.position || (Array.isArray(overrides?.targetPositions) ? overrides.targetPositions[0] : overrides?.targetPositions) || null;
    router.push({
      pathname: '/hub/training/arena/[gameId]',
      query: {
        gameId: game.id,
        start: '1',
        source: 'training-category',
        ...(overrides?.variant ? { variant: overrides.variant } : {}),
        ...(overrides?.bettingStructure ? { bettingStructure: overrides.bettingStructure } : {}),
        ...(overrides?.format ? { format: overrides.format } : {}),
        ...(overrides?.targetStreet ? { targetStreet: overrides.targetStreet } : {}),
        ...(focusPosition ? { position: focusPosition } : {}),
        ...(Number.isInteger(overrides?.questionsCount) ? { hands: String(overrides.questionsCount) } : {}),
      },
    });
  };

  return (
    <PageTransition>
      {pageHead}
      <div className="sp-training-category" style={{ '--category-accent': 'var(--sd-ice)' }}>
        <UniversalHeader pageDepth={2} />

        <main className={`sp-arena-lobby-shell ${lobbyStyles.shell}`}>
          <div className="sp-training-head">
            <div className="sd-back-row">
              <button
                className={`sd-button sp-cat-back-btn ${lobbyStyles.chromeButton}`}
                type="button"
                onClick={() => router.push('/hub/training')}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>All Training Games</span>
              </button>
            </div>
            <TrainingImageHeader slug={`training-category-${String(categoryId).toLowerCase()}`} title={category.title} help={category.description}>
              <p className="sp-head-note"><strong className="sp-num">{games.length}</strong> Games</p>
            </TrainingImageHeader>
          </div>

          {featuredGame && (
            <section
              className="sp-category-hero-launch sp-arena-quickbar sp-cat-quickbar"
              data-category-preset-summary="true"
              data-category-hero-launch={featuredGame.id}
              onClick={(event) => {
                if (event.target?.closest?.('button, a, input, select, textarea, [role="button"]')) return;
                playGame(featuredGame);
              }}
            >
              <div className="sp-arena-quickbar__copy">
                <span className="sp-arena-quickbar__tag">Top Drill</span>
                <span className="sp-arena-quickbar__text">
                  {featuredGame.name} · {featuredPreset?.summary || 'Preset Ready'}
                </span>
              </div>
              <button
                type="button"
                data-category-quick-start="true"
                className={`sp-arena-quickbar__cta sd-button sd-primary ${lobbyStyles.chromeButton} ${lobbyStyles.primaryButton}`}
                onClick={() => playGame(featuredGame)}
              >
                Play Now
              </button>
            </section>
          )}

          <section className={`sp-arena-lobby-section ${lobbyStyles.library}`} aria-labelledby="category-library-title">
            <div className={`sp-arena-deck ${lobbyStyles.controls}`} ref={controlsRef}>
              <div className="sp-arena-deck__heading-row">
                <h2 id="category-library-title" className="sp-arena-deck__heading">
                  Choose A Game
                </h2>
                <span className="sp-arena-deck__count sp-num">
                  {favoritesOnly && favoritesUnavailable ? 'Favorites' : `${items.length} Of ${games.length}`}
                </span>
              </div>

              <div className={lobbyStyles.searchRow}>
                <label className={lobbyStyles.searchWell}>
                  <Search size={18} aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="search"
                    aria-label={`Search ${category.title}`}
                    placeholder={`Search ${category.title}…`}
                    value={query}
                    onChange={(e) => updateFilters({ query: e.target.value })}
                  />
                  {query && (
                    <button
                      type="button"
                      className={lobbyStyles.clearSearch}
                      aria-label="Clear Search"
                      onClick={() => updateFilters({ query: '' })}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </label>
                <div className="sp-cat-filter-actions">
                  <button
                    type="button"
                    className={`sp-arena-pill sd-button ${lobbyStyles.chromeButton} ${lobbyStyles.iconButton}`}
                    aria-label="Favorite Games"
                    aria-pressed={favoritesOnly}
                    onClick={() => updateFilters({ favoritesOnly: !favoritesOnly })}
                  >
                    <Star size={18} aria-hidden="true" fill={favoritesOnly ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    className={`sp-arena-pill sd-button ${lobbyStyles.chromeButton} ${lobbyStyles.filtersButton}`}
                    aria-haspopup="dialog"
                    onClick={() => setFiltersOpen(true)}
                  >
                    <SlidersHorizontal size={18} aria-hidden="true" /> Filters{advancedCount > 0 ? ` (${advancedCount})` : ''}
                  </button>
                </div>
              </div>
            </div>

            <TrainingSortBar
              filters={categoryFilters}
              filteredCount={favoritesOnly && favoritesUnavailable ? null : items.length}
              totalCount={games.length}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              fiveMinuteLeakFix={featuredGame ? {
                game: featuredGame,
                basis: 'daily-warmup',
                title: `10-Hand Warmup: ${featuredGame.name}`,
                overrides: {
                  ...(variant !== 'ALL' && featuredGame.category !== 'PSYCHOLOGY'
                    ? { variant, bettingStructure: VARIANT_METADATA[variant]?.defaultStructure }
                    : {}),
                  questionsCount: 10,
                },
              } : null}
              onPlayGame={playGame}
              onSortChange={(sortKey, sortDir) => updateFilters({ sortKey, sortDir })}
              onToggleFavorites={() => updateFilters({ favoritesOnly: !favoritesOnly })}
              onOpenFilters={() => setFiltersOpen(true)}
              onJumpToControls={(focusSearch) => {
                controlsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (focusSearch) searchRef.current?.focus({ preventScroll: true });
              }}
              controlsRef={controlsRef}
              favoriteCount={favoriteCount}
            />

            <TrainingFavoritesNotice
              loading={favoritesOnly && favoritesLoading}
              error={favoritesError}
              onRetry={retryFavorites}
            />
            {favoritesOnly && favoritesUnavailable ? null : items.length > 0 ? (
              <TrainingLobbyResults
                key={JSON.stringify([categoryId, categoryFilters])}
                sections={[{ id: categoryId, label: category.title, items }]}
                filters={{ ...categoryFilters, category: categoryId }}
                viewMode={viewMode}
                onStart={playGame}
                favoritesUnavailable={favoritesUnavailable}
                onToggleFavorite={toggleFavorite}
                onOpenPreview={setPreviewItem}
                selectedVariant={variant}
              />
            ) : (
              <div className="sp-arena-empty" role="status">
                <p>{favoritesOnly && favoriteCount === 0
                  ? 'No Favorite Games Yet. Tap The Star On Any Game To Pin It Here.'
                  : `No ${category.title} Drills Match Your Filter.`}</p>
                <button
                  type="button"
                  className={`sd-button ${lobbyStyles.chromeButton}`}
                  onClick={resetFilters}
                >
                  Reset Filters
                </button>
              </div>
            )}
          </section>

          <TrainingFiltersSheet
            isOpen={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            filters={categoryFilters}
            onUpdateFilters={updateFilters}
            onResetFilters={resetFilters}
            matchingCount={items.length}
          />

          <TrainingGamePreviewSheet
            item={previewItem}
            isFavorite={favoriteIds.has(previewItem?.game.id)}
            onClose={() => setPreviewItem(null)}
            onLaunch={playGame}
            defaultVariant={variant}
            favoritesUnavailable={favoritesUnavailable}
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
        .sp-cat-filter-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .sp-cat-quickbar {
          margin-top: 10px;
          cursor: pointer;
        }
        .sp-cat-quickbar__text {
          min-width: 0;
        }
        .sp-cat-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 44px;
          padding: 0 12px;
          font-size: 13px;
          font-weight: 800;
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
