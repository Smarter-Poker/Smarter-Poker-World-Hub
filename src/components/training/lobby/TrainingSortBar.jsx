/**
 * TrainingSortBar — Sticky Quick-Filter Rail & 4-Column Sortable Header Bar
 * ─────────────────────────────────────────────────────────────────────────────
 * Mirrors Club Arena's StickyLobbyFilters + CompactLobby column header:
 *   - Compact sticky rail reveals automatically once the user scrolls past the
 *     selector deck, keeping Category/Browse, Favorites, Search, and Filters
 *     always 1 tap away without scrolling back to the top.
 *   - Sortable column header row (GAME | LEVEL | LENGTH | PROGRESS) pins right
 *     beneath the rail / header for instant re-ordering of all 107 games.
 */

import { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, Star, Search, SlidersHorizontal } from 'lucide-react';
import {
  LOBBY_CATEGORY_META,
  LOBBY_GROUPS,
  countAdvancedFilters,
} from '../../../lib/training/trainingLobbyFilter.mjs';

const SORT_COLUMNS = [
  { key: 'name', label: 'Game', defaultDir: 'asc' },
  { key: 'difficulty', label: 'Level', defaultDir: 'asc' },
  { key: 'stack', label: 'Stack', defaultDir: 'asc' },
  { key: 'progress', label: 'Progress', defaultDir: 'desc' },
];

export default function TrainingSortBar({
  filters,
  onSortChange,
  onToggleFavorites,
  onOpenFilters,
  onJumpToControls,
  controlsRef,
  favoriteCount,
}) {
  const [compactVisible, setCompactVisible] = useState(false);

  useEffect(() => {
    const controlsEl = controlsRef?.current;
    if (!controlsEl || typeof IntersectionObserver !== 'function') return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setCompactVisible(!entry.isIntersecting && entry.boundingClientRect.bottom < 80);
      },
      { rootMargin: '-64px 0px 0px 0px', threshold: 0 },
    );

    observer.observe(controlsEl);
    return () => observer.disconnect();
  }, [controlsRef]);

  const activeScopeLabel = filters.favoritesOnly
    ? 'Favorites'
    : filters.category !== 'ALL'
      ? (LOBBY_CATEGORY_META[filters.category]?.shortLabel || filters.category)
      : filters.group !== 'ALL'
        ? (LOBBY_GROUPS[filters.group]?.label || 'Games')
        : 'All Games';

  const advancedCount = countAdvancedFilters(filters);

  const handleSortClick = (col) => {
    if (filters.sortKey === col.key) {
      if (filters.sortDir === col.defaultDir) {
        onSortChange(col.key, col.defaultDir === 'asc' ? 'desc' : 'asc');
      } else {
        // Third tap returns to default Recommended order
        onSortChange('recommended', 'asc');
      }
    } else {
      onSortChange(col.key, col.defaultDir);
    }
  };

  return (
    <div className="sp-arena-sticky-dock">
      {/* Compact Sticky Quick Rail — mounted when user scrolls past Find Your Game */}
      {compactVisible && (
        <nav className="sp-arena-sticky-rail" aria-label="Quick Training Filters">
          <button
            type="button"
            className="sp-arena-sticky-rail__btn sd-button"
            onClick={() => onJumpToControls(false)}
            aria-label="Scroll To Game Categories"
          >
            <span>{activeScopeLabel}</span>
          </button>

          <button
            type="button"
            className="sp-arena-sticky-rail__btn sd-button"
            aria-pressed={filters.favoritesOnly}
            onClick={onToggleFavorites}
          >
            <Star
              size={13}
              aria-hidden="true"
              fill={filters.favoritesOnly ? 'currentColor' : 'none'}
            />
            <span>Favs{favoriteCount > 0 ? ` (${favoriteCount})` : ''}</span>
          </button>

          <button
            type="button"
            className="sp-arena-sticky-rail__btn sd-button"
            onClick={() => onJumpToControls(true)}
            aria-label="Focus Search Games"
          >
            <Search size={13} aria-hidden="true" />
            <span>Search</span>
          </button>

          <button
            type="button"
            className={`sp-arena-sticky-rail__btn sd-button${advancedCount > 0 ? ' active' : ''}`}
            onClick={onOpenFilters}
            aria-label="Open Training Filters"
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            <span>Filters{advancedCount > 0 ? ` (${advancedCount})` : ''}</span>
          </button>
        </nav>
      )}

      {/* 4-Column Sortable Header Bar (GAME | LEVEL | LENGTH | PROGRESS) */}
      <div className="sp-arena-sortbar" role="region" aria-label="Sort Training Games">
        {SORT_COLUMNS.map((col) => {
          const isSorted = filters.sortKey === col.key;
          const ariaSort = isSorted
            ? (filters.sortDir === 'asc' ? 'ascending' : 'descending')
            : 'none';
          return (
            <button
              key={col.key}
              type="button"
              className={`sp-arena-sortbar__col sp-arena-sortbar__col--${col.key}${isSorted ? ' is-sorted' : ''}`}
              aria-label={isSorted ? `${col.label}, Sorted ${ariaSort}` : `Sort By ${col.label}`}
              data-sort-col={col.key}
              onClick={() => handleSortClick(col)}
            >
              <span>{col.label}</span>
              {isSorted && (
                filters.sortDir === 'asc'
                  ? <ChevronUp size={13} aria-hidden="true" />
                  : <ChevronDown size={13} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
