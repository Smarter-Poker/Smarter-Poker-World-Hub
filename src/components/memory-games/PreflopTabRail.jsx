/**
 * PreflopTabRail: a wrapping row of 44px tabs for the Preflop Charts
 * subpages (leaderboard modes, achievement categories).
 *
 * Mobile phase 2: this used to share `.preflop-mode-rail`, an overflow-x
 * scroller with a hidden scrollbar and a scrollIntoView on activation, so
 * tabs past the fold were "slide to see". Every tab now wraps into view
 * (`.preflop-tab-rail`, flex-wrap) and nothing scrolls. The roving tabindex
 * keyboard contract (arrows, Home, End) is unchanged.
 */
import { memo, useCallback, useRef } from 'react';

function PreflopTabRail({ items, selected, onSelect, ariaLabel }) {
  const tabRefs = useRef(new Map());

  const activate = useCallback((index) => {
    const item = items[index];
    if (!item) return;
    onSelect(item.key);
    const tab = tabRefs.current.get(item.key);
    if (tab && typeof tab.focus === 'function') tab.focus({ preventScroll: true });
  }, [items, onSelect]);

  const handleKeyDown = useCallback((event, index) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % items.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    activate(nextIndex);
  }, [activate, items.length]);

  return (
    <div className="preflop-tab-rail" role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <button
          key={item.key}
          ref={(node) => {
            if (node) tabRefs.current.set(item.key, node);
            else tabRefs.current.delete(item.key);
          }}
          type="button"
          role="tab"
          aria-selected={selected === item.key}
          tabIndex={selected === item.key ? 0 : -1}
          onClick={() => onSelect(item.key)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default memo(PreflopTabRail);
