/**
 * The Poker Near Me card skeleton.
 *
 * One skeleton for the first paint and for every placeholder that takes over
 * from it: the venue list chunk, each venue and tour card chunk, and the daily
 * list (its LazyPanel placeholder and its chunk). A hand-off that drew less
 * than the skeleton before it would collapse the section above a reader.
 * Chromium hides that with scroll anchoring; WebKit (Safari) has none, so the
 * page jumps under the reader and, at the bottom of the deep Series route,
 * the scroll position clamps and the fixed header is laid out off screen until
 * the next frame (Global Footer E2E, e2e/024, 2026-11-27).
 *
 * Law: __tests__/poker-near-me-sections-never-collapse-above-the-reader.law.test.mjs
 */
import React from 'react';

export const VENUE_SKELETON_CARDS = 8;
export const DAILY_SKELETON_CARDS = 4;

export function SkeletonCard() {
  return (
    <div className="entity-card skeleton-card" aria-hidden="true">
      <div className="skel skel-header"></div>
      <div className="skel skel-title"></div>
      <div className="skel skel-text"></div>
      <div className="skel skel-tags"></div>
      <div className="skel skel-footer"></div>
    </div>
  );
}

export default function CardSkeletons({ count = VENUE_SKELETON_CARDS }) {
  return (
    <div className="card-grid" data-pnm-card-skeletons={count}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
