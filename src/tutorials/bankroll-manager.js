/**
 * Bankroll Manager tutorial (phase 1 of docs/mobile-standard/ROLLOUT-PLAN.md).
 *
 * Every `target` is a `data-tutorial="..."` attribute on
 * pages/hub/bankroll-manager.js. The page listens for
 * TUTORIAL_WILL_OPEN_EVENT and returns to the unfiltered dashboard first,
 * because the stats, chart and analytics only exist there.
 */
export const BANKROLL_TUTORIAL_KEY = 'bankroll_tutorial_seen_v1';

export const BANKROLL_TUTORIAL = {
  id: 'bankroll-manager',
  title: 'Bankroll Manager',
  storageKey: BANKROLL_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Welcome To Your Bankroll Manager',
      body: 'This Is Where Every Session, Deposit, Withdrawal And Expense Lives. It Tracks Your Balance, Your Net Results, Your Best And Worst Venues, And Warns You When A Rule Is Broken.',
      target: null,
    },
    {
      id: 'balance',
      title: 'Your Balance And Net',
      body: 'Bankroll Balance Is Everything You Have Set Aside To Play. Net Results Is What Playing Has Earned Or Cost You. Tap The Balance Card To Deposit Or Withdraw.',
      target: 'stats',
    },
    {
      id: 'log',
      title: 'Log A Session',
      body: 'The Add Button Logs Anything. A Cash Game, Tournament Or Bet Is A Session And Counts Toward Your Stats. A Deposit, Withdrawal Or Expense Is An Accounting Entry And Never Counts As A Session.',
      target: 'add-button',
    },
    {
      id: 'chart',
      title: 'The Trend Chart And Filters',
      body: 'The Chart Follows Your Balance Over Time. Filter It By Location, Time Window And Game Type, And Switch Between Line, Bar, Donut, Stacked, Histogram And Heatmap Views.',
      target: 'chart',
    },
    {
      id: 'analytics',
      title: 'Analytics',
      body: 'Three Cards Read Your Sessions Back To You: Where You Win Most, How Swingy Your Results Are, And How This Period Compares With The Last One.',
      target: 'analytics',
    },
    {
      id: 'sections',
      title: 'The Section Grid',
      body: 'Every Tool Is One Tap Away: Trips, Series, Player Notes, Staking, Tokes, Tax Reports, The Tournament Calendar And Reports. Nothing Is Hidden Behind A Swipe.',
      target: 'nav',
    },
    {
      id: 'help',
      title: 'Where To Get Help',
      body: 'Jarvis Insights Reads Your Ledger For Leaks And Explains Them In Plain Language. Reports Exports Everything To CSV, JSON Or PDF. Replay This Tour Any Time From Page Tutorial In The Hamburger Menu.',
      target: 'insights',
    },
  ],
};
