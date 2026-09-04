/**
 * Pager - Previous / Next and an honest "Showing X-Y Of Z".
 *
 * When `total` is unknown the range is still stated and the total is simply
 * left out rather than guessed at, because a fabricated total is how a list
 * ends up looking complete when it is not. In that case Next is driven by the
 * route's own `hasMore` flag where it sends one.
 *
 * Every decision lives in ./pagerModel.js as a pure function so the copy and
 * the enable/disable rules are unit tested without a DOM.
 */
import React from 'react';
import styles from './shared.module.css';
import { pagerModel } from './pagerModel';

export { rangeLabel, pagerModel } from './pagerModel';

export default function Pager({
  offset = 0,
  limit = 50,
  count = 0,
  total = null,
  hasMore = undefined,
  loading = false,
  noun = 'Rows',
  onPrevious,
  onNext,
}) {
  const model = pagerModel({ offset, limit, count, total, hasMore, noun });

  return (
    <div className={styles.pager}>
      <button
        type="button"
        className={styles.pagerBtn}
        onClick={onPrevious}
        disabled={!model.hasPrevious || loading}
      >
        Previous
      </button>
      <span className={styles.pagerInfo}>{model.label}</span>
      <button
        type="button"
        className={styles.pagerBtn}
        onClick={onNext}
        disabled={!model.hasNext || loading}
      >
        Next
      </button>
    </div>
  );
}
