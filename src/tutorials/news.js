/**
 * Poker News tutorial (phase 6 of docs/mobile-standard/ROLLOUT-PLAN.md).
 *
 * Registered for the whole /hub/news prefix (the hub and /hub/news/sources).
 * Every `target` is a `data-tutorial="..."` attribute on a real element of
 * pages/hub/news.js: the section anchors (sections), the stacked News, Reels,
 * Videos, Events and Read Later sections (news, reels, videos, events,
 * later). The five sections are all on the page at once; the anchor row
 * scrolls to one rather than swapping it in.
 *
 * Copy is Title Case (the popup rule). No em dashes.
 */
export const NEWS_TUTORIAL_KEY = 'news_tutorial_seen_v1';

export const NEWS_TUTORIAL = {
  id: 'news',
  title: 'Poker News',
  storageKey: NEWS_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Welcome To The Live Wire',
      body: 'Every Poker Story That Matters, Pulled From The Top Sources And Refreshed Through The Day. News, Short Reels, Full Videos, Upcoming Events And Your Own Read Later List Are All On This One Page, Laid Out In Full, With Nothing Hidden Behind A Tab.',
      target: null,
    },
    {
      id: 'sections',
      title: 'Five Sections, One Page',
      body: 'The Row At The Top Jumps To A Section: News, Reels, Videos, Events And Read Later. Every Anchor Is On Screen At Once On A Phone, And Tapping One Scrolls You There. A Link With A Section In It Lands You On That Section Too.',
      target: 'sections',
    },
    {
      id: 'news',
      title: 'The News Feed',
      body: 'Stories Are Grouped By Source And Sorted Newest First, With A Search Box And Source Chips To Narrow Them. Every Source Chip Is Visible, So There Is Nothing To Swipe Across. Tap A Story To Read It In Place; The Bookmark And Share Buttons Sit On Every Card And Every List Row.',
      target: 'news',
    },
    {
      id: 'reels',
      title: 'Poker Reels',
      body: 'Short Form Clips From The Top Poker Channels, Two To A Row On A Phone So The Whole Set Is On Screen. Tap One To Open The Viewer; It Plays Through The Set And Closes On The Last Clip.',
      target: 'reels',
    },
    {
      id: 'videos',
      title: 'Poker Videos',
      body: 'Full Length Videos From The Same Channels, Newest First. Each Card Shows The Channel, The Length And When It Was Posted.',
      target: 'videos',
    },
    {
      id: 'events',
      title: 'Upcoming Events',
      body: 'Tournaments And Series Coming Up, With Dates, Venues And Buy Ins. The List Reads From The Same Live Schedule Poker Near Me Uses.',
      target: 'events',
    },
    {
      id: 'later',
      title: 'Read Later And Bookmarks',
      body: 'Anything You Bookmark Or Mark To Read Later Lands Here, And The Count Beside The View Toggle Tells You How Many Are Waiting. Both Are Saved To Your Account, So They Follow You Between Devices.',
      target: 'later',
    },
    {
      id: 'finish',
      title: 'Where To Find This Again',
      body: 'Pull Down At The Top Of The Page Any Time To Refresh Every Feed At Once. Replay This Tour Whenever You Like From Page Tutorial In The Hamburger Menu, On This Page Or Any Other.',
      target: 'sections',
    },
  ],
};
