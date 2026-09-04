/**
 * LazyPanel: mount an expensive panel only once the reader is near it.
 *
 * WHY (mobile phase 3): Poker Near Me used to unmount every tab except the
 * active one, which was "slide to see" with extra steps (docs/mobile-standard/
 * ALWAYS-DISPLAYED-MOBILE-STANDARD.md rule 2). Stacking all six panels in
 * document order is the fix, but the map (Leaflet), the live feed and the
 * tournament list are each heavy; mounting all of them on first paint would
 * multiply the page's script and layout cost by six. This wrapper keeps the
 * section in the DOM (its heading, its id, its tutorial target) and mounts
 * the children the first time the section scrolls within `rootMargin` of the
 * viewport. Once mounted it stays mounted: the player never sees a panel
 * disappear again.
 *
 * SSR-safe: the server renders the placeholder; a browser without
 * IntersectionObserver mounts immediately after hydration.
 */
import React, { useEffect, useRef, useState } from 'react';

export default function LazyPanel({
  children,
  rootMargin = '600px 0px',
  minHeight = 240,
  placeholder = null,
  className = '',
  eager = false,
}) {
  const hostRef = useRef(null);
  const [mounted, setMounted] = useState(Boolean(eager));

  useEffect(() => {
    if (mounted) return undefined;
    if (typeof window === 'undefined') return undefined;
    const node = hostRef.current;
    if (!node || typeof window.IntersectionObserver !== 'function') {
      setMounted(true);
      return undefined;
    }
    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted, rootMargin]);

  useEffect(() => {
    if (eager) setMounted(true);
  }, [eager]);

  return (
    <div ref={hostRef} className={`pnm-lazy${className ? ` ${className}` : ''}`} data-mounted={mounted ? 'true' : 'false'}>
      {mounted ? children : (placeholder || <div className="pnm-skel" style={{ minHeight }} aria-hidden="true" />)}
    </div>
  );
}
