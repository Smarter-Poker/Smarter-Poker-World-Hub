/** Direct game search, mode and category selection for the Arena lobby. */
import { Search, SlidersHorizontal, Star, X } from 'lucide-react';
import {
  LOBBY_CATEGORY_META,
  countAdvancedFilters,
} from '../../../lib/training/trainingLobbyFilter.mjs';

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

  const hasAnyActiveFilter =
    filters.group !== 'ALL'
    || filters.category !== 'ALL'
    || filters.favoritesOnly
    || Boolean(filters.query?.trim())
    || advancedCount > 0;

  return (
    <div className="sp-arena-deck" ref={controlsRef} id="training-lobby-controls">
      <div className="sp-arena-browse-shortcuts">
        <h2 ref={headingRef} id="lib-h" className="sp-arena-keyboard-shortcut" tabIndex={-1}>
          Find Your Game
        </h2>
        <a className="sp-arena-keyboard-shortcut" href="#training-results" aria-live="polite">
          {filteredCount == null ? 'Favorites' : filteredCount === totalCount
            ? `View ${totalCount} Games`
            : `View ${filteredCount} Of ${totalCount}`}
        </a>
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

        <button
          type="button"
          className={`sp-arena-pill sp-arena-pill--filters${advancedCount > 0 ? ' active' : ''}`}
          data-open-filters-sheet="true"
          aria-haspopup="dialog"
          onClick={onOpenFiltersSheet}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span>Filters{advancedCount > 0 ? ` (${advancedCount})` : ''}</span>
        </button>

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

      {/* Primary Game Modes And Saved Favorites */}
      <div className="sp-arena-primary-plates" role="group" aria-label="Training Mode">
        <button
          type="button"
          className="sp-arena-plate"
          data-group-plate="DRILLS"
          aria-pressed={filters.group === 'DRILLS'}
          onClick={() => handleGroupToggle('DRILLS')}
        >
          <span className="sp-arena-plate__well">
            <span className="sp-arena-plate__title">Game Drills</span>
          </span>
        </button>

        <button
          type="button"
          className="sp-arena-plate"
          data-group-plate="LABS"
          aria-pressed={filters.group === 'LABS'}
          onClick={() => handleGroupToggle('LABS')}
        >
          <span className="sp-arena-plate__well">
            <span className="sp-arena-plate__title">Strategy Labs</span>
          </span>
        </button>
        <button
          type="button"
          className="sp-arena-favorites-btn"
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
              className="sp-cat-chip sp-arena-subtab"
              data-category-tab={catId.toLowerCase()}
              aria-pressed={active}
              aria-label={`${label}, ${catCount} Games`}
              onClick={() => handleCategorySelect(catId)}
            >
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
