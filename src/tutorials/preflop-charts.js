/**
 * Preflop Charts tutorial (phase 2 of docs/mobile-standard/ROLLOUT-PLAN.md).
 * Dan: "this needs a full tutorial added to it when you start."
 *
 * Every `target` is a `data-tutorial="..."` attribute on
 * pages/hub/memory-games.js (served at /hub/preflop-charts and
 * /hub/memory-games). The page has three screens (menu, game, result), so
 * the page listens for TUTORIAL_WILL_OPEN_EVENT and returns to the menu
 * unless a game is in progress, and the menu carries a static matrix primer
 * (PreflopMatrixPrimer) that holds the matrix / legend / submit targets. In a
 * live game the same three targets sit on the real matrix, action buttons
 * and Submit Range button, so the tour has a spotlight on either screen.
 *
 * A target written "a|b" is a list of alternatives; the engine rings the
 * first one that is on screen (src/components/tutorial/PageTutorial.jsx).
 *
 * Copy is Title Case (the popup rule). No em dashes.
 */
export const PREFLOP_TUTORIAL_KEY = 'preflop_tutorial_seen_v1';

export const PREFLOP_TUTORIAL = {
  id: 'preflop-charts',
  title: 'Preflop Charts',
  storageKey: PREFLOP_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Welcome To Preflop Charts',
      body: 'A Preflop Chart Shows Every Starting Hand And What A Solver Does With It From One Seat At One Stack Depth. Strong Players Memorise Ranges, Not Single Hands, Because A Range Tells You How Often You Enter A Pot And Which Hands Do The Work. This Page Trains That Recall Under A Clock.',
      target: null,
    },
    {
      id: 'matrix',
      title: 'Reading The 13x13 Matrix',
      body: 'Each Row And Column Is A Card Rank From Ace Down To Two. The Diagonal Holds The Pairs. Every Cell Above The Diagonal Is A Suited Hand (AKs) And Every Cell Below It Is An Offsuit Hand (AKo). Read The Row Rank, Then The Column Rank, And You Have The Hand.',
      target: 'matrix|mode-grid',
    },
    {
      id: 'scenario',
      title: 'Positions And Stack Depth',
      body: 'A Range Only Makes Sense For A Seat And A Stack. The Level Cards Set The Difficulty, And Filter Scenarios Narrows The Practice Pool To A Position, An Effective Stack Depth And A Table Format. AI Mode Asks Jarvis To Build A Fresh Solver Spot Instead.',
      target: 'scenario',
    },
    {
      id: 'legend',
      title: 'Actions And Colours',
      body: 'Every Hand Gets One Action. Grey Is Fold, Green Is Call, Red Is Raise, Orange Is A Small Raise, Purple Is A Big Raise And Pink Is All In. Pick The Action First, Then Paint It Onto The Hands That Take It.',
      target: 'legend',
    },
    {
      id: 'build',
      title: 'Build Your Range',
      body: 'Tap A Hand To Give It The Active Action, Or Press And Drag Across The Matrix To Paint A Whole Block In One Stroke. The Readout Above The Grid Names The Last Hand You Touched. The Pairs, Suited And Offsuit Shortcuts Apply The Action To A Whole Region, And Undo Takes Back The Last Stroke.',
      target: 'matrix',
    },
    {
      id: 'submit',
      title: 'Submit And Score',
      body: 'Submit Range Compares Your Grid With The Solver Range. Your Score Is The Exact Overlap. After Grading, Green Cells Are Correct, Blue Cells Are Hands You Missed, Red Cells Are Extra Hands You Should Have Folded And Amber Cells Have The Right Hand With The Wrong Action. Eighty Five Percent Passes A Level.',
      target: 'submit',
    },
    {
      id: 'modes',
      title: 'Modes And The Daily Challenge',
      body: 'Range Is The Core Drill. Speed Drill Flashes One Hand At A Time, Pressure Cooker Races A Bomb Timer, Pattern Recognition Asks You To Read A Partial Range, Mixed Trains Frequencies, Spot Trainer Plays Full Hand Trees And VS Ranked Puts You In Rated Battles. The Daily Card Sets One Assignment A Day And Keeps Your Streak Alive.',
      target: 'mode-grid|daily',
    },
    {
      id: 'stats',
      title: 'Stats Leaderboard And Achievements',
      body: 'My Stats, Ranks, Awards And The Guide Live One Tap Away. After Any Graded Range, Ask Jarvis Why A Hand Was Wrong And Get A Solver Explanation Written For That Spot. Replay This Tour Any Time From Page Tutorial In The Hamburger Menu.',
      target: 'subnav|jarvis',
    },
  ],
};
