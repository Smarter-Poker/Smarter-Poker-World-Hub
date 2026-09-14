/**
 * Poker Trivia tutorial (phase 7 of docs/mobile-standard/ROLLOUT-PLAN.md).
 *
 * Registered for the whole /hub/trivia prefix: the lobby and every mode,
 * stats, leaderboard, achievements and settings page are one product.
 * Every `target` is a `data-tutorial="..."` attribute on a real element of
 * src/components/trivia/TriviaLobby.jsx (mounted by pages/hub/trivia/index.js):
 * the Daily Trivia banner (daily), the Choose Your Game toolbar (modes), the
 * wrapping filter row (filters), the mode grid (grid) and the Quick Stakes
 * banner (stakes).
 *
 * The engine (src/components/tutorial/PageTutorial.jsx) tolerates a missing
 * target, so a step still reads on a subpage that lacks the element.
 *
 * Copy is Title Case (the popup rule). No em dashes.
 */
export const TRIVIA_TUTORIAL_KEY = 'trivia_tutorial_seen_v1';

export const TRIVIA_TUTORIAL = {
  id: 'trivia',
  title: 'Poker Trivia',
  storageKey: TRIVIA_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Welcome To Poker Trivia',
      body: 'Thirteen Ways To Test What You Know: Poker History, Famous Hands, Rules, GTO Theory, ICM, Cash Game And Tournament Spots. Every Mode Pays Diamonds For Correct Answers, And Every Mode Is On This One Page, Laid Out In Full.',
      target: null,
    },
    {
      id: 'daily',
      title: 'Daily Trivia',
      body: 'One Free Round Every Day. Play It To Keep Your Streak Alive; The Chip On The Banner Shows How Many Days You Are Into It. Once It Is Done For The Day The Banner Says So.',
      target: 'daily',
    },
    {
      id: 'modes',
      title: 'Choose Your Game',
      body: 'The Live Count Tells You How Many Modes Are Open Right Now And How Many Are In Maintenance. A Mode In Maintenance Says Why On Its Card And Cannot Be Started By Accident.',
      target: 'modes',
    },
    {
      id: 'filters',
      title: 'Filter By Category',
      body: 'Narrow The Grid To History, Strategy Or Competitive Modes. Every Filter Is On Screen At Once On A Phone, With Nothing To Swipe Across, And The Count On Each Chip Is How Many Modes It Holds.',
      target: 'filters',
    },
    {
      id: 'grid',
      title: 'The Mode Cards',
      body: 'Each Card Shows The Entry Price And The Diamond Reward. Paid Modes Ask You To Accept The Price Once; The Game Page Charges It When The Round Starts, So The Lobby Never Moves Diamonds Itself. Tap Launch Mode To Play.',
      target: 'grid',
    },
    {
      id: 'stakes',
      title: 'Quick Stakes',
      body: 'A Fast Paid Round With A Bigger Payout. VIP Members Play It Free; Everyone Else Sees The Entry Price On The Chip Before They Tap.',
      target: 'stakes',
    },
    {
      id: 'numbers',
      title: 'Stats, Leaderboard, Achievements',
      body: 'Your Accuracy By Category, Your Results By Mode, The Global Leaderboard For Today, This Week, This Month Or All Time, And Every Badge You Have Earned Are In The Hamburger Menu. On A Phone Each Table Is One Card Per Row.',
      target: 'grid|daily',
    },
    {
      id: 'finish',
      title: 'Where To Find This Again',
      body: 'Pull Down At The Top Of The Page Any Time To Refresh Your Balance And Streak. Replay This Tour Whenever You Like From Page Tutorial In The Hamburger Menu, On This Page Or Any Other.',
      target: 'daily|modes',
    },
  ],
};
