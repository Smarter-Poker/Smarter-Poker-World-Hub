import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DEFAULT_LOBBY_FILTERS,
  LOBBY_CATEGORY_META,
  countAdvancedFilters,
  getLobbyResultsPage,
} from '../../../lib/training/trainingLobbyFilter.mjs';
import TrainingGameCard from './TrainingGameCard';
import TrainingGameShelf from './TrainingGameShelf';
import styles from './TrainingLobby.module.css';

export default function TrainingLobbyResults({
  sections,
  filters = DEFAULT_LOBBY_FILTERS,
  viewMode = 'grid',
  onUpdateFilters,
  ...cardProps
}) {
  const [requestedPage, setRequestedPage] = useState(1);
  const [expandedShelfId, setExpandedShelfId] = useState(null);
  const headingRef = useRef(null);
  const focusAfterPaging = useRef(false);
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const shelfGroups = useMemo(() => {
    const featured = sections.find((section) => section.id === 'featured');
    if (featured) return sections.map((section) => section.id === 'featured' ? { ...section, label: 'Recommended' } : section);
    // Honest editorial starting points when there is no personalized recommendation.
    // Catalog items and their progress remain real, and no game is repeated across shelves.
    const starters = items.filter((item) => item.meta.difficulty <= 2).slice(0, 4);
    if (starters.length === 0) return sections;
    const starterIds = new Set(starters.map((item) => item.game.id));
    return [
      { id: 'featured', label: 'Recommended', items: starters, basis: 'starter-games' },
      ...sections.map((section) => ({ ...section, items: section.items.filter((item) => !starterIds.has(item.game.id)) }))
        .filter((section) => section.items.length > 0),
    ];
  }, [items, sections]);

  const expandedShelf = expandedShelfId ? shelfGroups.find((group) => group.id === expandedShelfId) : null;
  const browseShelves = viewMode === 'grid' && !expandedShelf && !filters.favoritesOnly
    && !String(filters.query || '').trim() && filters.category === 'ALL'
    && filters.sortKey === 'recommended' && countAdvancedFilters(filters) === 0;
  const directItems = expandedShelf?.items || items;
  const directLabel = expandedShelf?.label || (sections.length === 1 ? sections[0].label : 'Training Games');
  const paged = getLobbyResultsPage([{ id: 'direct', label: directLabel, items: directItems }], requestedPage);
  const { groups, total, page, pageCount, first, last } = paged;

  useEffect(() => {
    if (page !== requestedPage) setRequestedPage(page);
    if (focusAfterPaging.current) {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView({ block: 'start' });
      focusAfterPaging.current = false;
    }
  }, [page, requestedPage, expandedShelfId, browseShelves]);

  const goToPage = (nextPage) => {
    focusAfterPaging.current = true;
    setRequestedPage(nextPage);
  };
  const viewAll = (group) => {
    const category = String(group.id).toUpperCase();
    if (LOBBY_CATEGORY_META[category] && onUpdateFilters) {
      onUpdateFilters({ category, group: LOBBY_CATEGORY_META[category].group, favoritesOnly: false });
    } else {
      focusAfterPaging.current = true;
      setRequestedPage(1);
      setExpandedShelfId(group.id);
    }
  };

  let rowOffset = 0;
  return (
    <div className={styles.results} data-tutorial="games" data-lobby-layout={browseShelves ? 'shelves' : viewMode}>
      {browseShelves ? (
        <>
          <h2 id="training-results" ref={headingRef} tabIndex={-1} className={styles.srOnly}>{items.length} Training Games</h2>
          {shelfGroups.map((group) => {
            const offset = rowOffset;
            rowOffset += group.items.length;
            return <TrainingGameShelf key={group.id} group={group} rowOffset={offset} onViewAll={viewAll} {...cardProps} />;
          })}
        </>
      ) : (
        <>
          <div className={styles.directHeading}>
            <h2 id="training-results" ref={headingRef} tabIndex={-1}>{directLabel}</h2>
            <span>Games {first}-{last} Of {total}</span>
            {expandedShelf && (
              <button type="button" className={styles.textButton} onClick={() => { setExpandedShelfId(null); setRequestedPage(1); }}><ArrowLeft size={17} aria-hidden="true" /> Back To Shelves</button>
            )}
          </div>
          <div className={viewMode === 'list' ? styles.cardList : styles.cardGrid}>
            {groups.flatMap((group) => group.items).map((item, index) => <TrainingGameCard key={item.game.id} item={item} index={index} viewMode={viewMode} {...cardProps} />)}
          </div>
          {pageCount > 1 && (
            <nav className={styles.pagination} aria-label="Training Game Pages">
              <button type="button" className={styles.chromeButton} disabled={page === 1} onClick={() => goToPage(page - 1)}><ChevronLeft size={18} aria-hidden="true" /> Previous</button>
              <span>Page {page} Of {pageCount}</span>
              <button type="button" className={styles.chromeButton} disabled={page === pageCount} onClick={() => goToPage(page + 1)}>Next <ChevronRight size={18} aria-hidden="true" /></button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
