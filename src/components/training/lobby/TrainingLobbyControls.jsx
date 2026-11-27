import { Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { LOBBY_CATEGORY_META, countAdvancedFilters } from '../../../lib/training/trainingLobbyFilter.mjs';
import styles from './TrainingLobby.module.css';

const CATEGORIES = [
  { id: 'ALL', label: 'All Games' },
  { id: 'CASH', label: 'Cash Games' },
  { id: 'MTT', label: 'Tournaments' },
  { id: 'ADVANCED', label: 'Strategy' },
  { id: 'PSYCHOLOGY', label: 'Mental Games' },
  { id: 'SPINS', label: 'Spins' },
];

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
  const hasAnyActiveFilter = filters.group !== 'ALL' || filters.category !== 'ALL'
    || filters.favoritesOnly || Boolean(filters.query?.trim()) || advancedCount > 0;

  const handleGroupToggle = (groupId) => {
    onUpdateFilters({
      group: filters.group === groupId ? 'ALL' : groupId,
      category: 'ALL',
      favoritesOnly: false,
    });
  };
  const handleCategorySelect = (category) => {
    // All categories stay visible. Selecting one changes its owning mode too,
    // so switching directly from a drill category to a lab never yields a false empty result.
    onUpdateFilters({
      category,
      group: category === 'ALL' ? 'ALL' : LOBBY_CATEGORY_META[category].group,
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

  return (
    <div className={styles.controls} ref={controlsRef} id="training-lobby-controls">
      <div className={styles.keyboardShortcuts}>
        <h2 ref={headingRef} id="lib-h" tabIndex={-1}>Find Your Game</h2>
        <a href="#training-results">{filteredCount == null ? 'View Favorites' : `View ${filteredCount} Games`}</a>
      </div>
      <div className={styles.searchRow} data-tutorial="search">
        <div className={styles.searchWell}>
          <Search size={24} aria-hidden="true" />
          <label htmlFor="training-lobby-search" className={styles.srOnly}>Search Games</label>
          <input
            id="training-lobby-search"
            ref={searchInputRef}
            type="search"
            placeholder="Search All Games"
            value={filters.query}
            onChange={(event) => onUpdateFilters({ query: event.target.value })}
          />
          {filters.query && (
            <button type="button" className={styles.clearSearch} aria-label="Clear Search" onClick={() => onUpdateFilters({ query: '' })}>
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="button"
          className={`${styles.chromeButton} ${styles.filtersButton}`}
          data-open-filters-sheet="true"
          aria-haspopup="dialog"
          onClick={onOpenFiltersSheet}
        >
          <SlidersHorizontal size={22} aria-hidden="true" />
          <span>Filters{advancedCount > 0 ? ` (${advancedCount})` : ''}</span>
        </button>
      </div>

      <div className={styles.categoryGrid} role="group" aria-label="Training Game Categories" data-tutorial="categories">
        {CATEGORIES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={styles.chromeButton}
            data-category-tab={id.toLowerCase()}
            aria-pressed={filters.category === id && !filters.favoritesOnly}
            aria-label={`${label}, ${id === 'ALL' ? totalCount : counts?.[id] ?? 0} Games`}
            onClick={() => handleCategorySelect(id)}
          >{label}</button>
        ))}
      </div>

      <div className={styles.modeGrid} role="group" aria-label="Training Mode">
        <button type="button" className={styles.chromeButton} data-group-plate="DRILLS" aria-pressed={filters.group === 'DRILLS'} onClick={() => handleGroupToggle('DRILLS')}>Game Drills</button>
        <button type="button" className={styles.chromeButton} data-group-plate="LABS" aria-pressed={filters.group === 'LABS'} onClick={() => handleGroupToggle('LABS')}>Strategy Labs</button>
        <button type="button" className={styles.chromeButton} data-favorites-toggle="true" aria-pressed={filters.favoritesOnly} onClick={handleFavoritesToggle}>
          <Star size={20} aria-hidden="true" fill={filters.favoritesOnly ? 'currentColor' : 'none'} />
          <span>Favorites{favoriteCount > 0 ? ` (${favoriteCount})` : ''}</span>
        </button>
      </div>
      {hasAnyActiveFilter && (
        <div className={styles.activeFilters}>
          {filters.variant !== 'ALL' && <span>{filters.variant.toUpperCase()}</span>}
          {filters.query && <span>Search: {filters.query}</span>}
          <button type="button" className={styles.textButton} onClick={onResetFilters}><X size={15} aria-hidden="true" /> Reset Filters</button>
        </div>
      )}
    </div>
  );
}
