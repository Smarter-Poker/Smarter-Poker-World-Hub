/**
 * TrainingLobbyControls — "FIND YOUR GAME" 3-Tier Metallic Selector Deck
 * ─────────────────────────────────────────────────────────────────────────────
 * Mirrors the Club Arena Game Lobby selector hierarchy:
 *   - Tier 1: Two primary beveled leather-quilt plates (Game Drills | Strategy Labs)
 *             + centered ★ Favorites plate underneath
 *   - Tier 2: Inline category tabs (.sp-cat-chips flex-wrap; zero hidden rails)
 *   - Tier 3: 2x3 quick-filter pills (All | For You | In Progress | Beginner | Pro / GTO | Filters)
 *   - Inline compact search input + dismissible active filter chips
 */

import { Search, SlidersHorizontal, Star, X, Trophy, DollarSign, Rocket, Atom, Brain, Grid2x2 } from 'lucide-react';
import {
  QUICK_FILTER_PILLS,
  LOBBY_CATEGORY_META,
  countAdvancedFilters,
} from '../../../lib/training/trainingLobbyFilter.mjs';

const CATEGORY_ICONS = {
  ALL: Grid2x2,
  MTT: Trophy,
  CASH: DollarSign,
  SPINS: Rocket,
  ADVANCED: Atom,
  PSYCHOLOGY: Brain,
};

export default function TrainingLobbyControls({
  filters,
  onUpdateFilters,
  onResetFilters,
  onOpenFiltersSheet,
  counts,
  favoriteCount,
  filteredCount,
  totalCount,
  searchInputRef,
  controlsRef,
  headingRef,
}) {
  const advancedCount = countAdvancedFilters(filters);

  // Sub-category buttons adapt cleanly to Tier 1 while keeping every category
  // reachable in one tap when viewing All Games.
  const subCategories =
    filters.group === 'DRILLS'
      ? ['ALL', 'MTT', 'CASH', 'SPINS']
      : filters.group === 'LABS'
        ? ['ALL', 'ADVANCED', 'PSYCHOLOGY']
        : ['ALL', 'MTT', 'CASH', 'SPINS', 'ADVANCED', 'PSYCHOLOGY'];

  const handleGroupToggle = (groupId) => {
    const nextGroup = filters.group === groupId ? 'ALL' : groupId;
    onUpdateFilters({
      group: nextGroup,
      category: 'ALL',
      favoritesOnly: false,
    });
  };

  const handleCategorySelect = (catId) => {
    onUpdateFilters({
      category: catId,
      favoritesOnly: false,
    });
  };

  const handleFavoritesToggle = () => {
    const nextFav = !filters.favoritesOnly;
    onUpdateFilters({
      favoritesOnly: nextFav,
      ...(nextFav ? { group: 'ALL', category: 'ALL', quickFilter: 'ALL' } : {}),
    });
  };

  const handleQuickFilter = (quickId) => {
    onUpdateFilters({
      quickFilter: filters.quickFilter === quickId && quickId !== 'ALL' ? 'ALL' : quickId,
    });
  };

  const hasAnyActiveFilter =
    filters.group !== 'ALL'
    || filters.category !== 'ALL'
    || filters.favoritesOnly
    || filters.quickFilter !== 'ALL'
    || Boolean(filters.query?.trim())
    || advancedCount > 0;

  return (
    <div className="sp-arena-deck" ref={controlsRef} id="training-lobby-controls">
      <div className="sp-arena-deck__heading-row">
        <h2 ref={headingRef} id="lib-h" className="sp-arena-deck__heading" tabIndex={-1}>
          Find Your Game
        </h2>
        <span className="sp-arena-deck__count sp-num" aria-live="polite">
          {filteredCount === totalCount
            ? `${totalCount} Games`
            : `${filteredCount} Of ${totalCount}`}
        </span>
      </div>

      {/* Tier 1: Primary Mode Plates (Exact 2-column Poker Arena geometry) */}
      <div className="sp-arena-primary-plates" role="group" aria-label="Training Mode">
        <button
          type="button"
          className="sp-arena-plate sd-button"
          data-group-plate="DRILLS"
          aria-pressed={filters.group === 'DRILLS'}
          onClick={() => handleGroupToggle('DRILLS')}
        >
          <span className="sp-arena-plate__well">
            <span className="sp-arena-plate__title">Game Drills</span>
            <span className="sp-arena-plate__meta sp-num">{counts.DRILLS} Games</span>
          </span>
        </button>

        <button
          type="button"
          className="sp-arena-plate sd-button"
          data-group-plate="LABS"
          aria-pressed={filters.group === 'LABS'}
          onClick={() => handleGroupToggle('LABS')}
        >
          <span className="sp-arena-plate__well">
            <span className="sp-arena-plate__title">Strategy Labs</span>
            <span className="sp-arena-plate__meta sp-num">{counts.LABS} Games</span>
          </span>
        </button>
      </div>

      {/* Centered Favorites Plate (Matches Club Arena FAVORITES button) */}
      <div className="sp-arena-favorites-row">
        <button
          type="button"
          className="sp-arena-favorites-btn sd-button"
          data-favorites-toggle="true"
          aria-pressed={filters.favoritesOnly}
          onClick={handleFavoritesToggle}
        >
          <Star
            size={14}
            aria-hidden="true"
            fill={filters.favoritesOnly ? 'currentColor' : 'none'}
          />
          <span>Favorites{favoriteCount > 0 ? ` (${favoriteCount})` : ''}</span>
        </button>
      </div>

      {/* Tier 2: Sub-Category Tabs (Inline zero-reload filter, always wraps cleanly) */}
      <div
        className="sp-cat-chips sp-arena-subtabs"
        role="group"
        aria-label="Training Game Categories"
        data-tutorial="categories"
      >
        {subCategories.map((catId) => {
          const Icon = CATEGORY_ICONS[catId] || Grid2x2;
          const label = catId === 'ALL'
            ? (filters.group === 'DRILLS' ? 'All Drills' : filters.group === 'LABS' ? 'All Labs' : 'All Games')
            : LOBBY_CATEGORY_META[catId]?.shortLabel || catId;
          const catCount = catId === 'ALL'
            ? (filters.group === 'ALL' ? totalCount : counts[filters.group])
            : counts[catId];
          const active = filters.category === catId && !filters.favoritesOnly;

          return (
            <button
              key={catId}
              type="button"
              className="sp-cat-chip sp-arena-subtab sd-button"
              data-category-tab={catId.toLowerCase()}
              aria-pressed={active}
              onClick={() => handleCategorySelect(catId)}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{label}</span>
              <span className="sp-cat-count sp-num">{catCount}</span>
            </button>
          );
        })}
      </div>

      {/* Tier 3: 2x3 Instant Quick-Filter Pills + Filters Sheet Trigger */}
      <div className="sp-arena-quick-pills" role="group" aria-label="Quick Filters">
        {QUICK_FILTER_PILLS.map((pill) => {
          const active = filters.quickFilter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              className="sp-arena-pill sd-button"
              data-quick-filter={pill.id.toLowerCase()}
              aria-pressed={active}
              onClick={() => handleQuickFilter(pill.id)}
            >
              <span>{pill.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`sp-arena-pill sp-arena-pill--filters sd-button${advancedCount > 0 ? ' active' : ''}`}
          data-open-filters-sheet="true"
          aria-haspopup="dialog"
          onClick={onOpenFiltersSheet}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span>Filters{advancedCount > 0 ? ` (${advancedCount})` : ''}</span>
        </button>
      </div>

      {/* Compact Inline Search Well */}
      <div className="sp-toolbar sp-arena-search-row" data-tutorial="search">
        <label className="sp-search sp-arena-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Search Games"
            placeholder="Search Games, e.g. ICM or 3-Bet"
            value={filters.query}
            onChange={(e) => onUpdateFilters({ query: e.target.value })}
          />
          {filters.query && (
            <button
              type="button"
              className="sp-arena-search__clear"
              aria-label="Clear Search"
              onClick={() => onUpdateFilters({ query: '' })}
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </label>

        {hasAnyActiveFilter && (
          <button
            type="button"
            className="sp-arena-reset-btn sd-button"
            onClick={onResetFilters}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
