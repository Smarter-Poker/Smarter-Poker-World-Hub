/**
 * FeedTabs - the All / Hands switch above the social feed (Phase 8.1).
 *
 * The feed API pages one ordered row sequence per tab (tab=all or tab=hands,
 * pages/api/social/feed.js), so a tab change is a full refresh from offset 0
 * on the page that owns the feed state. This component owns nothing but the
 * control: a WAI-ARIA tablist with two 44px tabs, roving focus, and left and
 * right arrow keys that move focus and select in one step.
 *
 * It renders for every visitor, signed in or not, and it never looks at who
 * wrote a post: a hand is a hand whoever played it.
 */
import React, { useRef } from 'react';
import { SOCIAL_COLORS as C } from '../../lib/socialHelpers';

export const FEED_TAB_OPTIONS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All' }),
  Object.freeze({ id: 'hands', label: 'Hands' }),
]);

export const FEED_TAB_IDS = FEED_TAB_OPTIONS.map((tab) => tab.id);

/** The tab a stored or routed value maps to; anything unknown is the All tab. */
export function normalizeFeedTab(value) {
  return FEED_TAB_IDS.includes(value) ? value : 'all';
}

export default function FeedTabs({ value = 'all', onChange, disabled = false }) {
  const tabRefs = useRef([]);
  const current = normalizeFeedTab(value);

  const select = (next) => {
    if (disabled || next === current) return;
    if (typeof onChange === 'function') onChange(next);
  };

  const onKeyDown = (event, index) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    if (disabled) return;
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + step + FEED_TAB_OPTIONS.length) % FEED_TAB_OPTIONS.length;
    const nextTab = tabRefs.current[nextIndex];
    if (nextTab && typeof nextTab.focus === 'function') nextTab.focus();
    select(FEED_TAB_OPTIONS[nextIndex].id);
  };

  return (
    <div
      role="tablist"
      aria-label="Feed"
      style={{
        display: 'flex',
        gap: 8,
        padding: '6px 12px',
        background: C.card,
        borderRadius: 8,
        marginBottom: 2,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
      }}
    >
      {FEED_TAB_OPTIONS.map((tab, index) => {
        const active = tab.id === current;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`sp-feed-tab-${tab.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => select(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            style={{
              flex: 1,
              minHeight: 44,
              height: 44,
              padding: '0 16px',
              borderRadius: 22,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: disabled ? 'default' : 'pointer',
              border: `1px solid ${active ? C.blue : C.border}`,
              background: active ? '#E7F3FF' : 'transparent',
              color: active ? C.blue : C.textSec,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
