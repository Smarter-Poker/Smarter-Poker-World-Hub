import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import TrainingGameCard from './TrainingGameCard';
import styles from './TrainingLobby.module.css';

// FIRST PAINT CARRIES ONLY WHAT THE FIRST PAINT CAN SHOW (2026-11-27).
// Six shelves hold all 107 games, and every card is a full article with its
// artwork, four icons and three controls. Server-rendering all of them made
// /hub/training ship about 700KB of HTML - 590KB of it cards the player cannot
// see, because a shelf is a horizontal track that shows one card at 375px and
// three at desktop width. The browser has to parse and lay out every one of
// them before its first paint, which put mobile Largest Contentful Paint over
// the 2500ms budget (e2e/mobile-budget.spec.ts). The server now renders the
// first SHELF_FIRST_PAINT_CARDS of each shelf and the rest join the same track
// straight after the first frame, so search, filters, counts and every card's
// actions are unchanged - only when the off-screen cards are built moves.
export const SHELF_FIRST_PAINT_CARDS = 4;

function useAfterFirstPaint() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setReady(true);
      return undefined;
    }
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => setReady(true), 0);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);
  return ready;
}

export default function TrainingGameShelf({ group, rowOffset = 0, onViewAll, ...cardProps }) {
  const trackRef = useRef(null);
  const measurements = useRef({ step: 1, maxLeft: 0 });
  const [position, setPosition] = useState({ page: 0, count: 1 });
  const headingId = `training-shelf-${group.id}`;
  const afterFirstPaint = useAfterFirstPaint();
  const shownItems = afterFirstPaint ? group.items : group.items.slice(0, SHELF_FIRST_PAINT_CARDS);

  const measure = useCallback(() => {
    const track = trackRef.current;
    const firstCard = track?.firstElementChild;
    if (!track || !firstCard) return;
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0;
    const cardStep = firstCard.getBoundingClientRect().width + gap;
    const visible = Math.max(1, Math.floor((track.clientWidth + gap) / cardStep));
    const step = cardStep * visible;
    const maxLeft = Math.max(0, track.scrollWidth - track.clientWidth);
    const count = maxLeft <= 2 ? 1 : Math.ceil(maxLeft / step) + 1;
    const page = track.scrollLeft >= maxLeft - 2 ? count - 1
      : Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / step)));
    measurements.current = { step, maxLeft };
    setPosition((old) => old.page === page && old.count === count ? old : { page, count });
  }, []);

  useEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track) return undefined;
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(track);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, shownItems.length]);

  const goTo = (page) => {
    const next = Math.min(position.count - 1, Math.max(0, page));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    trackRef.current?.scrollTo({
      left: Math.min(measurements.current.maxLeft, next * measurements.current.step),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <section className={styles.shelf} aria-labelledby={headingId} data-training-shelf={group.id}>
      <div className={styles.shelfHeading}>
        <h2 id={headingId}>{group.label}</h2>
        <span className={styles.shelfLine} aria-hidden="true" />
        <button type="button" className={`${styles.chromeButton} ${styles.viewAllButton}`} onClick={() => onViewAll(group)} aria-label={`View All ${group.label} Games`}>
          View All <ChevronRight size={19} aria-hidden="true" />
        </button>
      </div>
      <ol className={styles.shelfTrack} ref={trackRef} onScroll={measure} aria-label={`${group.label} Games`}>
        {shownItems.map((item, index) => (
          <li key={item.game.id} className={styles.shelfSlot}>
            <TrainingGameCard item={item} index={rowOffset + index} {...cardProps} />
          </li>
        ))}
      </ol>
      {position.count > 1 && (
        <div className={styles.shelfNavigation} aria-label={`${group.label} Shelf Navigation`}>
          <button type="button" className={`${styles.chromeButton} ${styles.shelfArrow}`} disabled={position.page === 0} aria-label={`Previous ${group.label} Games`} onClick={() => goTo(position.page - 1)}><ChevronLeft size={21} aria-hidden="true" /></button>
          {position.count <= 7 ? (
            <div className={styles.shelfDots}>
              {Array.from({ length: position.count }, (_, page) => (
                <button type="button" key={page} aria-label={`${group.label} Page ${page + 1}`} aria-current={page === position.page ? 'true' : undefined} onClick={() => goTo(page)}><span /></button>
              ))}
            </div>
          ) : <span className={styles.shelfPage} aria-live="polite">{position.page + 1} / {position.count}</span>}
          <button type="button" className={`${styles.chromeButton} ${styles.shelfArrow}`} disabled={position.page === position.count - 1} aria-label={`Next ${group.label} Games`} onClick={() => goTo(position.page + 1)}><ChevronRight size={21} aria-hidden="true" /></button>
        </div>
      )}
    </section>
  );
}
