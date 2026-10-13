import { forwardRef } from 'react';

/*
 * OWNER UPDATE (Video Library, 2026-10-11): Dan asked for the library to look
 * and work like YouTube on a phone and for the decorative frames to go. The
 * command rail is now one row of YouTube-style chips under the search bar, at
 * every width. The row scrolls sideways with its scrollbar left visible (the
 * 2026-09-27 command-rail rule), and every chip keeps a 44px tap target.
 */

const BROWSE_VIEWS = [
    { id: 'ALL', name: 'All Videos' },
    { id: 'cash', name: 'Cash Games' },
    { id: 'tournament', name: 'Tournaments' },
    { id: 'slots', name: 'Casino And Slots' },
    { id: 'sports', name: 'Sports' },
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
    onBrowse,
    onLibrary,
    onSort,
    onOpenReels,
    reelsTriggerRef,
}, filterRailRef) {
    return (
        <nav className="vl-chip-rail" aria-label="Video library filters">
            <div
                ref={filterRailRef}
                className="vl-type-toggle-row"
                role="group"
                aria-label="Browse and sort videos"
                data-tutorial="filters"
            >
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
                            <span>{view.name}</span>
                        </button>
                    );
                })}

                <span className="vl-chip-divider" aria-hidden="true" />
                <button
                    ref={reelsTriggerRef}
                    type="button"
                    id="vl-reels-tab-btn"
                    className="vl-filter-button vl-reels-button"
                    aria-label="Open the video Reels viewer"
                    onClick={onOpenReels}
                >
                    <span>Reels</span>
                </button>

                <span className="vl-chip-divider" aria-hidden="true" />
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
                            <span>{view.label}</span>
                        </button>
                    );
                })}

                <span className="vl-chip-divider" aria-hidden="true" />
                {libraryViews.map(view => {
                    const isActive = libraryFilter === view.id;
                    const count = personalViewCounts[view.id] || 0;
                    return (
                        <button
                            type="button"
                            key={view.id}
                            className={`vl-filter-button vl-library-filter${isActive ? ' is-active' : ''}`}
                            data-filter-group="library"
                            aria-label={view.id === 'recommended' ? view.label : `${view.label}, ${count} ${view.id === 'playlists' ? (count === 1 ? 'playlist' : 'playlists') : (count === 1 ? 'video' : 'videos')}`}
                            aria-pressed={isActive}
                            aria-controls="video-library-grid"
                            onClick={event => onLibrary(view.id, event.currentTarget)}
                        >
                            <span>{view.shortLabel}</span>
                            {count > 0 && <span className="vl-filter-count" aria-hidden="true">{count}</span>}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
});

export default VideoLibraryCommandRail;
