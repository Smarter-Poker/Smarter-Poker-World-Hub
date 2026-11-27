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
 *
 * The placeholder's height is held until the panel draws something. Most
 * panels are dynamic chunks, and one with no loading placeholder renders
 * nothing while its chunk downloads, so swapping the placeholder for it
 * collapsed the section (Best Time To Go fell from 308px to 48px) under a
 * reader at the bottom of the page. Chromium hides that with scroll
 * anchoring; WebKit (Safari) has none, so the scroll position clamped and
 * the fixed header was laid out off screen until the next frame.
 * Law: __tests__/poker-near-me-sections-never-collapse-above-the-reader.law.test.mjs
 */
import React, { useEffect, useRef, useState } from 'react';

export const HOLD_LIMIT_MS = 10000;

function placeholderHeight(node) {
  const height = node && typeof node.getBoundingClientRect === 'function'
    ? node.getBoundingClientRect().height
    : 0;
  return Number.isFinite(height) && height > 0 ? Math.round(height) : 0;
}

// The height of what the panel itself drew, not of the held host.
export function contentHeight(node) {
  if (!node || !node.children) return 0;
  let total = 0;
  for (const child of node.children) {
    const rect = typeof child.getBoundingClientRect === 'function' ? child.getBoundingClientRect() : null;
    if (rect && Number.isFinite(rect.height)) total += rect.height;
  }
  return total;
}

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
  // Height of the placeholder at the moment it was swapped out, kept as the
  // host's min-height until the panel's own content has a height.
  const [heldHeight, setHeldHeight] = useState(0);

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
          setHeldHeight(placeholderHeight(node));
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

  useEffect(() => {
    if (!mounted || heldHeight <= 0) return undefined;
    const node = hostRef.current;
    if (!node) return undefined;
    let done = false;
    let resize = null;
    let mutation = null;
    const release = () => {
      if (done) return;
      done = true;
      if (resize) resize.disconnect();
      if (mutation) mutation.disconnect();
      clearTimeout(safety);
      setHeldHeight(0);
    };
    const check = () => {
      if (contentHeight(node) > 0) release();
    };
    // Never hold longer than a slow chunk takes: a panel that draws nothing
    // for good gives its space back.
    const safety = setTimeout(release, HOLD_LIMIT_MS);
    if (typeof window.ResizeObserver === 'function') {
      resize = new window.ResizeObserver(check);
      resize.observe(node);
    }
    if (typeof window.MutationObserver === 'function') {
      mutation = new window.MutationObserver(() => {
        if (resize) for (const child of node.children) resize.observe(child);
        check();
      });
      mutation.observe(node, { childList: true, subtree: true });
    }
    if (resize) for (const child of node.children) resize.observe(child);
    check();
    return release;
  }, [mounted, heldHeight]);

  return (
    <div
      ref={hostRef}
      className={`pnm-lazy${className ? ` ${className}` : ''}`}
      data-mounted={mounted ? 'true' : 'false'}
      style={heldHeight > 0 ? { minHeight: heldHeight } : undefined}
    >
      {mounted ? children : (placeholder || <div className="pnm-skel" style={{ minHeight }} aria-hidden="true" />)}
    </div>
  );
}
