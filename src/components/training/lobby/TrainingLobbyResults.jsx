import { useEffect, useRef, useState } from 'react';
import { getLobbyResultsPage } from '../../../lib/training/trainingLobbyFilter.mjs';
import TrainingLobbyRow from './TrainingLobbyRow';

export default function TrainingLobbyResults({ sections, ...rowProps }) {
  const [requestedPage, setRequestedPage] = useState(1);
  const { groups, total, page, pageCount, first, last } = getLobbyResultsPage(sections, requestedPage);
  const headingRef = useRef(null);
  const focusAfterPaging = useRef(false);

  useEffect(() => {
    if (page !== requestedPage) setRequestedPage(page);
    if (focusAfterPaging.current) {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView({ block: 'start' });
      focusAfterPaging.current = false;
    }
  }, [page, requestedPage]);

  function goToPage(nextPage) {
    focusAfterPaging.current = true;
    setRequestedPage(nextPage);
  }

  return (
    <div className="sp-arena-sections" data-tutorial="games">
      {groups.map((group, index) => (
        <div key={group.id} className="sp-arena-group">
          {(index === 0 || group.label) && (
            <div className="sp-arena-divider">
              {group.label && <span className="sp-arena-divider__label">{group.label}</span>}
              {index === 0 && (
                <h3 id="training-results" className="sp-arena-results-range" ref={headingRef} tabIndex={-1}>
                  Games {first}-{last} Of {total}
                </h3>
              )}
            </div>
          )}
          <div className="sp-arena-row-list">
            {group.items.map((item, index) => (
              <TrainingLobbyRow key={item.game.id} item={item} index={group.rowOffset + index} {...rowProps} />
            ))}
          </div>
        </div>
      ))}
      {pageCount > 1 && (
        <nav className="sp-arena-pagination" aria-label="Training Game Pages">
          <button type="button" className="sd-button" disabled={page === 1} onClick={() => goToPage(page - 1)}>
            Previous
          </button>
          <span>Page {page} Of {pageCount}</span>
          <button type="button" className="sd-button" disabled={page === pageCount} onClick={() => goToPage(page + 1)}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
