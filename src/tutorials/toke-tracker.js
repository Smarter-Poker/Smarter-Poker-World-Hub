/**
 * Toke Tracker tutorial (phase 11 of docs/mobile-standard/ROLLOUT-PLAN.md).
 *
 * Registered as a PREFIX row for /hub/toke-tracker: the landing page and its
 * four rooms (shift, analytics, vault, venues) are one product, and a dealer
 * opens the tour from whichever one they are standing in. Every `target`
 * therefore names alternatives, and `title` is on all five pages, so a step
 * always has something to ring.
 *
 * Targets and where they live:
 *   title     the page heading, on all five pages
 *   cards     the four room cards (pages/hub/toke-tracker/index.js)
 *   shift     the Shift Tracker column (shift.js)
 *   event     the live event and its downs (shift.js)
 *   analytics the analytics column (analytics.js)
 *   vault     the Dealer Vault column (vault.js)
 *   venues    the Venue Intel column (venues.js)
 *   calendar  the year calendar (venues.js)
 *
 * The engine (src/components/tutorial/PageTutorial.jsx) tolerates a missing
 * target, so a step still reads when its element is on another page.
 *
 * Copy is Title Case (the popup rule). No em dashes.
 */
export const TOKE_TRACKER_TUTORIAL_KEY = 'toke_tracker_tutorial_seen_v1';

export const TOKE_TRACKER_TUTORIAL = {
  id: 'toke-tracker',
  title: 'Toke Tracker',
  storageKey: TOKE_TRACKER_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Welcome To Toke Tracker',
      body: 'Your Whole Dealing Career In One Place: What You Made Tonight, What You Made This Year, And The Paperwork That Proves It. Everything Here Is Yours Alone And Nobody Else Can See It.',
      target: 'title',
    },
    {
      id: 'rooms',
      title: 'The Four Rooms',
      body: 'Shift Tracker Is Where You Work. Analytics Is Where You Look Back. The Dealer Vault Holds Your Documents. Venue Intel Compares The Houses You Deal For And Plans The Ones Ahead.',
      target: 'cards|title',
    },
    {
      id: 'shift',
      title: 'Start An Event',
      body: 'An Event Is One Job At One Venue, And It Can Run For As Many Days As The Series Does. Tap New Event, Pick The Venue, And Your Hourly Rate Is Remembered For Next Time.',
      target: 'shift|cards',
    },
    {
      id: 'downs',
      title: 'Log Every Down',
      body: 'Add Down Records A Cash Game, A Tournament, A Brush Or A Break, And A Thirty Five Minute Timer Asks Whether You Are Still At The Same Table. Tap The Toke Amount On Any Down To Correct It.',
      // 'cards' last, like every other step: the tour opens on the landing
      // page, where neither 'event' nor 'shift' exists, and step four was the
      // only one of eight that lost its spotlight there (measured 2026-09-15).
      target: 'event|shift|cards',
    },
    {
      id: 'analytics',
      title: 'Read The Trends',
      body: 'Every Chart Is On The Page At Once: Your Running Career Total, What Each Event Paid, Month By Month, And How Your Downs Split Between Cash, Tournament, Brush And Break.',
      target: 'analytics|cards',
    },
    {
      id: 'vault',
      title: 'The Dealer Vault',
      body: 'Photograph A Gaming Licence, A W-2 Or Any Of Your Pay Records And It Reads The Dates And Numbers Off The Picture On Your Own Device. Licences Show How Long They Have Left, And All Four Categories Are Listed On The Page.',
      target: 'vault|cards',
    },
    {
      id: 'venues',
      title: 'Venue Intel And The Calendar',
      body: 'See Which House Pays Best Per Hour, Which Game Types Tip Best, And Which Buy-In Brackets Are Worth Your Time. Tap Any Day In The Calendar To Book A Future Gig And Get A Reminder On The Day.',
      target: 'venues|calendar|cards',
    },
    {
      id: 'finish',
      title: 'Where To Find This Again',
      body: 'Replay This Tour Whenever You Like From Page Tutorial In The Hamburger Menu, On This Page Or Any Other. Pull Down On Any Of These Pages To Refresh What They Show.',
      target: 'title|cards',
    },
  ],
};
