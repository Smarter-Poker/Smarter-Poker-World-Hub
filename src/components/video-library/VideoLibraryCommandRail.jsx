import { forwardRef } from 'react';

import VideoLibraryConsole, { ConsoleDataRow } from './console/VideoLibraryConsole';

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

const CommandControls = forwardRef(function CommandControls({
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
    mode,
}, controlsRef) {
    return (
        <div
            ref={controlsRef}
            className={`vl-type-toggle-row vl-type-toggle-row--${mode}`}
            role="group"
            aria-label="Browse and sort videos"
            data-tutorial="filters"
        >
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
                        <span>{view.name}</span>
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
                        <span>{view.label}</span>
                    </button>
                );
            })}

            <span className="vl-filter-group-label">Format</span>
            <button
                ref={reelsTriggerRef}
                type="button"
                id={mode === 'desktop' ? 'vl-reels-tab-btn' : undefined}
                className="vl-filter-button vl-reels-button"
                aria-label="Open the video Reels viewer"
                onClick={onOpenReels}
            >
                <span>Reels</span>
            </button>
        </div>
    );
});

const VideoLibraryCommandRail = forwardRef(function VideoLibraryCommandRail({
    mode = 'desktop',
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
    const controls = (
        <CommandControls
            ref={filterRailRef}
            selectedType={selectedType}
            libraryFilter={libraryFilter}
            sortMode={sortMode}
            libraryViews={libraryViews}
            personalViewCounts={personalViewCounts}
            onBrowse={onBrowse}
            onLibrary={onLibrary}
            onSort={onSort}
            onOpenReels={onOpenReels}
            reelsTriggerRef={reelsTriggerRef}
            mode={mode}
        />
    );

    if (mode === 'mobile') {
        return (
            <nav className="vl-command-rail-mobile" aria-label="Video library filters">
                <span className="vl-mobile-rail-label">Command Rail</span>
                {controls}
            </nav>
        );
    }

    return (
        <aside className="vl-command-rail" aria-label="Video library filters">
            <VideoLibraryConsole
                eyebrow="Smarter.Poker Hub"
                title="Video Library"
                subtitle="Command Rail"
                pill={`${visibleCount} Showing`}
                pillInk="blue"
                foot="foot"
                className="vl-command-console"
            >
                {controls}
                <ConsoleDataRow label="Visible Results" value={visibleCount} valueInk="blue" />
            </VideoLibraryConsole>
        </aside>
    );
});

export default VideoLibraryCommandRail;
