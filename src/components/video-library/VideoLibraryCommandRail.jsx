import { forwardRef } from 'react';

const BROWSE_VIEWS = [
    { id: 'ALL', name: 'All Videos' },
    { id: 'cash', name: 'Cash Games' },
    { id: 'tournament', name: 'Tournaments' },
];

const SORT_VIEWS = [
    { id: 'default', label: 'Latest' },
    { id: 'trending', label: 'Trending' },
    { id: 'top_rated', label: 'Top Rated' },
];

const VideoLibraryCommandRail = forwardRef(function VideoLibraryCommandRail({
    selectedType,
    libraryFilter,
    sortMode,
    libraryViews,
    personalViewCounts,
    visibleCount,
    onBrowse,
    onLibrary,
    onSort,
    onOpenReels,
    reelsTriggerRef,
}, filterRailRef) {
    return (
        <aside className="vl-command-rail" aria-label="Video library filters">
            <div className="vl-rail-kicker">Smarter.Poker Hub</div>
            <h1 className="vl-rail-title">Video <span>Library</span></h1>

            <div ref={filterRailRef} className="vl-type-toggle-row" role="group" aria-label="Browse and sort videos" data-tutorial="filters">
                <span className="vl-filter-group-label">Browse</span>
                {BROWSE_VIEWS.map(view => {
                    const isActive = selectedType === view.id && libraryFilter === 'ALL';
                    return (
                        <button
                            type="button"
                            key={view.id}
                            className={`vl-filter-button${isActive ? ' is-active' : ''}`}
                            data-filter-group="type"
                            aria-pressed={isActive}
                            aria-controls="video-library-grid"
                            onClick={event => onBrowse(view.id, event.currentTarget)}
                        >
                            {view.name}
                        </button>
                    );
                })}

                <span className="vl-filter-group-label">My Library</span>
                {libraryViews.map(view => {
                    const isActive = libraryFilter === view.id;
                    const count = personalViewCounts[view.id] || 0;
                    return (
                        <button
                            type="button"
                            key={view.id}
                            className={`vl-filter-button vl-library-filter${isActive ? ' is-active' : ''}`}
                            data-filter-group="library"
                            aria-label={`${view.label}, ${count} ${view.id === 'playlists' ? (count === 1 ? 'playlist' : 'playlists') : (count === 1 ? 'video' : 'videos')}`}
                            aria-pressed={isActive}
                            aria-controls="video-library-grid"
                            onClick={event => onLibrary(view.id, event.currentTarget)}
                        >
                            <span className="vl-filter-symbol" aria-hidden="true">{view.symbol}</span>
                            <span>{view.shortLabel}</span>
                            <span className="vl-filter-count" aria-hidden="true">{count}</span>
                        </button>
                    );
                })}

                <span className="vl-filter-group-label">Order</span>
                {SORT_VIEWS.map(view => {
                    const isActive = sortMode === view.id;
                    return (
                        <button
                            type="button"
                            key={view.id}
                            className={`vl-filter-button vl-sort-button${isActive ? ' is-active' : ''}`}
                            data-filter-group="sort"
                            aria-label={`Sort videos by ${view.label}`}
                            aria-pressed={isActive}
                            aria-controls="video-library-grid"
                            onClick={event => onSort(view.id, event.currentTarget)}
                        >
                            {view.label}
                        </button>
                    );
                })}

                <span className="vl-filter-group-label">Format</span>
                <button
                    ref={reelsTriggerRef}
                    type="button"
                    id="vl-reels-tab-btn"
                    className="vl-filter-button vl-reels-button"
                    aria-label="Open the video Reels viewer"
                    onClick={onOpenReels}
                >
                    <span aria-hidden="true">▶</span> Reels
                </button>
            </div>

            <div className="vl-rail-count" aria-live="polite" data-tutorial="count">
                <strong>{visibleCount}</strong>
                <span>Videos Showing</span>
            </div>
        </aside>
    );
});

export default VideoLibraryCommandRail;
