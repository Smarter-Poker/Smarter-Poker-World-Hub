/**
 * Video Library tutorial (phase 9 of docs/mobile-standard/ROLLOUT-PLAN.md).
 *
 * Registered for the /hub/video-library prefix. Every `target` is a
 * `data-tutorial="..."` attribute on a real element: the command controls
 * (filters) and the live count (count) on
 * src/components/video-library/VideoLibraryCommandRail.jsx, and on
 * pages/hub/video-library.js the search box (search), the creator row
 * (sources), the New This Week grid (new), Continue Watching (continue,
 * rendered only when a session is in progress, so the step names the grid as
 * its alternative), the main column (main) and the video grid (grid).
 *
 * The engine (src/components/tutorial/PageTutorial.jsx) tolerates a missing
 * target, so a step still reads when its element is not on the page.
 *
 * Copy is Title Case (the popup rule). No em dashes.
 */
export const VIDEO_LIBRARY_TUTORIAL_KEY = 'video_library_tutorial_seen_v1';

export const VIDEO_LIBRARY_TUTORIAL = {
  id: 'video-library',
  title: 'Video Library',
  storageKey: VIDEO_LIBRARY_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Welcome To The Video Library',
      body: 'Hundreds Of Poker Videos From The Top Channels, Curated Into One Library: Strategy, Cash Games, Tournaments And Full Sessions. Every Control And Every Row Is Laid Out In Full On This Page, With Nothing Hidden Behind A Swipe.',
      target: null,
    },
    {
      id: 'filters',
      title: 'Browse, My Library, Order, Format',
      body: 'Choose Cash Games Or Tournaments, Switch To Your Own Favorites, Watch Later, History And Playlists, Sort By Latest, Trending Or Top Rated, Or Open Reels. Every Button Is On Screen At Once On A Phone Under Its Group Heading.',
      target: 'filters',
    },
    {
      id: 'search',
      title: 'Search The Library',
      body: 'Type A Player, A Concept Or A Channel. The Grid Narrows As You Type And The Count Beside The Controls Tells You How Many Videos Match. Press The Slash Key To Jump To The Box On A Keyboard.',
      target: 'search|count',
    },
    {
      id: 'sources',
      title: 'Creators',
      body: 'Tap A Creator To See Only Their Videos. On A Phone The First Ten Creators Are On Screen And One Tap Shows All Of Them; On A Desktop Every Creator Is In View.',
      target: 'sources',
    },
    {
      id: 'new',
      title: 'New This Week',
      body: 'Everything Added In The Last Seven Days, Four At A Time With A Show All Button For The Rest. Dismiss The Row If You Have Already Seen It.',
      target: 'new|grid',
    },
    {
      id: 'continue',
      title: 'Continue Watching',
      body: 'Any Video You Left Part Way Through Comes Back Here With Its Progress Bar, So You Can Pick Up Where You Stopped. It Appears Once You Have A Session In Progress.',
      target: 'continue|grid',
    },
    {
      id: 'grid',
      title: 'The Video Grid',
      body: 'Tap A Card To Watch. The Player Opens Full Screen With Like, Share, Save And Playlist Controls, And Up Next Suggestions Underneath; Back Closes It. Mark A Video Watched From Its Badge.',
      target: 'grid',
    },
    {
      id: 'finish',
      title: 'Where To Find This Again',
      body: 'Pull Down At The Top Of The Page Any Time To Refresh The Catalog. Replay This Tour Whenever You Like From Page Tutorial In The Hamburger Menu, On This Page Or Any Other.',
      target: 'main|search',
    },
  ],
};
