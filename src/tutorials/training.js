/**
 * Training Games tutorial (phase 5 of docs/mobile-standard/ROLLOUT-PLAN.md).
 *
 * Registered for the whole /hub/training prefix: the hub and its 94 subpages
 * (the trainers, the arena, coach mode, progress, streaks) are one product.
 * Every `target` is a `data-tutorial="..."` attribute on a real element of
 * pages/hub/training.js: the hero (hero), the priority leak card (leak), the
 * This Week stats (stats), lifetime Progress (progress), the library section
 * (library), its search box (search), the category chips (categories) and
 * the game grid (games).
 *
 * The engine (src/components/tutorial/PageTutorial.jsx) tolerates a missing
 * target, so a step still reads on a subpage that lacks the element; the leak
 * step names the stats section as its alternative because the leak card only
 * renders when a leak has actually been detected.
 *
 * Copy is Title Case (the popup rule). No em dashes.
 */
export const TRAINING_TUTORIAL_KEY = 'training_tutorial_seen_v1';

export const TRAINING_TUTORIAL = {
  id: 'training',
  title: 'Training Games',
  storageKey: TRAINING_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Welcome To Training',
      body: 'This Is Where Your Game Gets Sharper. Over A Hundred Drills Cover Preflop Ranges, Postflop Lines, Tournament Spots And Table Dynamics, Each One Graded By The Same Solver Ranges Leak Finder Audits Your Real Hands Against. Every Number On This Page Comes From Sessions You Actually Played.',
      target: null,
    },
    {
      id: 'hero',
      title: 'Your Next Drill',
      body: 'The Top Card Reads Your Recent Results And Picks The One Drill Worth Doing Next. Tap Start To Open The Session Setup, Choose Difficulty, Timer And Mode, And Go Straight To The Table.',
      target: 'hero',
    },
    {
      id: 'leak',
      title: 'The Priority Leak',
      body: 'When Leak Finder Has Found A Repeated Mistake In Your Hands, It Shows Here With Its EV Cost And A Drill Built To Fix It. No Leak Detected Means No Card: This Section Never Invents One.',
      target: 'leak|stats',
    },
    {
      id: 'stats',
      title: 'This Week At A Glance',
      body: 'Sessions, Hands, Accuracy And Streak For The Last Seven Days, Each One A Real Count From Your Training Sessions. While The Numbers Are Still Loading The Cards Say So Rather Than Showing A Zero You Might Mistake For A Result.',
      target: 'stats',
    },
    {
      id: 'progress',
      title: 'Lifetime Progress',
      body: 'Your Accuracy By Position Across Every Session You Have Played, So You Can See Which Seats Are Costing You. An Empty History Reads As No Sessions Yet, Never As A Made Up Trend.',
      target: 'progress',
    },
    {
      id: 'library',
      title: 'The Training Library',
      body: 'Every Drill Is Here, All Of It On Screen. Search By Name Or Pick A Category Chip: Preflop, Postflop, Tournament, Cash, Mental Game And More. The Chips Wrap So Every Category Is Visible On A Phone With Nothing To Swipe Across.',
      target: 'library|search|categories',
    },
    {
      id: 'games',
      title: 'Game Cards',
      body: 'Each Card Shows The Drill, Its Focus And Your Own Progress Bar. Tap A Card To Open Session Setup. Inside A Drill, Every Position Selector And Chart Type Is Laid Out In Full, So Nothing Hides Off The Edge Of The Screen.',
      target: 'games',
    },
    {
      id: 'finish',
      title: 'Where To Find This Again',
      body: 'Pull Down At The Top Of The Page Any Time To Refresh Your Stats. Replay This Tour Whenever You Like From Page Tutorial In The Hamburger Menu, On This Page Or Any Other.',
      target: 'search|hero',
    },
  ],
};
