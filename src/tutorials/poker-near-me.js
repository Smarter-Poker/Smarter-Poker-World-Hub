/**
 * Poker Near Me tutorial (phase 3 of docs/mobile-standard/ROLLOUT-PLAN.md).
 *
 * Registered for the whole /hub/poker-near-me prefix, so the lobby, every
 * discovery route (/map, /venues, /events, /live-games, /saved, /more and
 * the sub-surfaces) and the state pages all offer the same tour. Every
 * `target` is a `data-tutorial="..."` attribute on a real element:
 *
 *   - pages/hub/poker-near-me/[pnmTab].js: the stacked sections (venues,
 *     events, live, map, saved, more), the anchor row (nav), and, inside the
 *     More section, the Best Time To Go grid (best-time) and the social feed
 *     (social) from MoreTabPanel.
 *   - the lobby (LobbyOverlay.jsx): the hotspot grid (nav) and the hotspots
 *     for venues, live, map, events, saved and social.
 *
 * The engine (src/components/tutorial/PageTutorial.jsx) tolerates a missing
 * target, so a step still reads on a page that lacks its element (best-time
 * on the lobby, for example). Both pages listen for TUTORIAL_WILL_OPEN_EVENT
 * and return to the top with their overlays closed.
 *
 * Live counts are worded per .agent/workflows/live-cash-games-policy.md:
 * while the Bravo scraper is off, the published table counts are modelled
 * from weeks of observed history and are labelled approximate, never live.
 *
 * Copy is Title Case (the popup rule). No em dashes.
 */
export const POKER_NEAR_ME_TUTORIAL_KEY = 'pnm_tutorial_seen_v1';

export const POKER_NEAR_ME_TUTORIAL = {
  id: 'poker-near-me',
  title: 'Poker Near Me',
  storageKey: POKER_NEAR_ME_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Welcome To Poker Near Me',
      body: 'This Is Your Guide To Live Poker Around You: Casinos And Card Rooms, Cash Games Running Right Now, Home Games, Tournaments And Travelling Tours. Enable Your Location Or Search A City And Everything On The Page Sorts By Distance From You.',
      target: null,
    },
    {
      id: 'map',
      title: 'The Map',
      body: 'Every Pin Is A Poker Room. Your Location Shows As A Pulsing Dot Once GPS Is On, And The Radius Badge Sets How Far The Search Reaches. Tap A Pin To See The Room, Its Games And Its Hours. The Map Keeps Its Own Pinch And Drag Gestures; The Page Scrolls Around It.',
      target: 'map',
    },
    {
      id: 'live',
      title: 'Live Games Running',
      body: 'The Live Section Counts Cash Tables By Room And Game. While The Live Scraper Is Off, Those Counts Are Modelled From Weeks Of Real Observed History, So They Are Labelled Approximate And Never Presented As A Live Observation. A Count Marked Live Comes From A Real Scrape.',
      target: 'live',
    },
    {
      id: 'venues',
      title: 'Rooms And Venues',
      body: 'Each Card Is One Room: Its Games, Stakes, Hours, Distance From You And Its Trust Score. Tap The Heart To Save A Room, Check In To Tell Friends You Are There, Or Open Details For Reviews, Promotions And The Full Schedule.',
      target: 'venues',
    },
    {
      id: 'events',
      title: 'Events And Tournaments',
      body: 'The Daily List Shows Every Scheduled Tournament By Day With Buy In And Guarantee. Tours Follow The Travelling Circuits, Series Lists The Festivals, And The Calendar Lays It All Out By Date. The Row Of Buttons Jumps Between Them.',
      target: 'events',
    },
    {
      id: 'best-time',
      title: 'Best Time To Go',
      body: 'The Hour Grid Shows When Rooms Near You Are Busiest, Day By Day, Built From The Same Observed History As The Live Counts. Darker Cells Mean More Tables. Tap A Cell To Read The Average For That Hour Before You Plan A Session.',
      target: 'best-time',
    },
    {
      id: 'social',
      title: 'Check In And Reviews',
      body: 'Check In At A Room To Share Where You Are Playing, Write A Review With Star Ratings For Dealers, Game Selection, Waitlist Speed, Food And Atmosphere, And Invite Friends To Your Table From The Social Feed.',
      target: 'social',
    },
    {
      id: 'saved',
      title: 'Saved And More',
      body: 'Saved Keeps Every Room, Tour And Series You Favourited In One Place, And The State Directory Browses Rooms By Location. Discovery Tools Adds Road Trips, Game Alerts, Near Me Now And Trip Costs. Replay This Tour Any Time From Page Tutorial In The Hamburger Menu.',
      target: 'saved|nav',
    },
  ],
};
