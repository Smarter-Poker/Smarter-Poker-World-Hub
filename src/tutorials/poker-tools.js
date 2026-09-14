/**
 * Odds Calculator tutorial (phase 10 of docs/mobile-standard/ROLLOUT-PLAN.md).
 *
 * Registered for /hub/poker-tools. Every `target` is a `data-tutorial="..."`
 * attribute on a real element of pages/hub/poker-tools.js: the page title
 * (title), the game tabs (games), the felt with its seats (table), the
 * action bar (actions), the presets row (presets, rendered only while
 * Presets is open, so that step names the action bar as its alternative),
 * the card picker (picker) and the results list (results, rendered once a
 * calculation has run, so that step names the table as its alternative).
 *
 * The engine (src/components/tutorial/PageTutorial.jsx) tolerates a missing
 * target, so a step still reads when its element is not on the page.
 *
 * Copy is Title Case (the popup rule). No em dashes.
 */
export const POKER_TOOLS_TUTORIAL_KEY = 'poker_tools_tutorial_seen_v1';

export const POKER_TOOLS_TUTORIAL = {
  id: 'poker-tools',
  title: 'Odds Calculator',
  storageKey: POKER_TOOLS_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Welcome To The Odds Calculator',
      body: 'Deal Any Spot And See Every Player\'s Equity In Seconds. It Runs Ten Thousand Random Runouts Right Here On Your Device, So It Works Offline And Nothing You Enter Leaves The Page.',
      target: 'title',
    },
    {
      id: 'games',
      title: 'Pick The Game',
      body: 'Hold\'em, Pot-Limit Omaha, PLO-5, PLO-6, Seven-Card Stud And Razz. Changing The Game Clears The Table, Because Each One Deals A Different Number Of Hole Cards.',
      target: 'games',
    },
    {
      id: 'table',
      title: 'The Table',
      body: 'Tap A Seat To Choose Whose Cards You Are Dealing; Tap The Dashed Seats To Add Villains, Up To Six In Hold\'em And Three In The Five And Six Card Games. The Board Cards Sit In The Middle Of The Felt.',
      target: 'table',
    },
    {
      id: 'actions',
      title: 'Board, Dead Cards, Presets',
      body: 'Board Switches The Picker To The Community Cards And Dead Marks Cards That Are Out Of The Deck. Presets Load Classic Matchups In One Tap. New Hand Clears Everything.',
      target: 'actions|presets',
    },
    {
      id: 'picker',
      title: 'The Card Picker',
      body: 'Every Card In The Deck Is On Screen, Eight To A Row On A Phone So Each One Is An Easy Tap. A Card Already In Play Is Greyed Out. The Picker Moves To The Next Empty Seat On Its Own.',
      target: 'picker',
    },
    {
      id: 'calculate',
      title: 'Calculate',
      body: 'Once Two Seats Have Full Hands, Calculate Appears In The Action Bar. Tap It And The Equity Shows On Every Seat Badge And In The Results List Underneath.',
      target: 'actions',
    },
    {
      id: 'results',
      title: 'Reading The Results',
      body: 'One Card Per Seat: The Equity Percentage, Then Wins And Ties Out Of Ten Thousand Runouts. Change Any Card And The Numbers Clear, So You Always Know They Match What Is On The Felt.',
      target: 'results|table',
    },
    {
      id: 'finish',
      title: 'Where To Find This Again',
      body: 'Replay This Tour Whenever You Like From Page Tutorial In The Hamburger Menu, On This Page Or Any Other. The Menu Also Links The Equity And ICM Calculators, The Preflop Range Lab And The Hand Lab.',
      target: 'title|games',
    },
  ],
};
