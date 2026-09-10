/**
 * Personal Assistant tutorial (phase 4 of docs/mobile-standard/ROLLOUT-PLAN.md).
 *
 * Registered for the whole /hub/personal-assistant prefix, so the hub, the
 * Leak Finder and the Scenario Analysis evidence gate all offer the same tour.
 * The three routes are one product: the hub queues the next move, Leak Finder
 * does the diagnosis, and the gate explains why an approximate grade is never
 * shown. Every `target` is a `data-tutorial="..."` attribute on a real element:
 *
 *   - pages/hub/personal-assistant/index.js: the section anchors (nav), the
 *     Jarvis Priority Queue (mission), the Decision Loop (loop), the two tool
 *     cards (systems), the dashboard counters (stats), Your Activity
 *     (activity), the session list (sessions) and Hand Of The Day (daily).
 *   - pages/hub/personal-assistant/leaks.js: the Leaks/Insights/Coaching
 *     views (leak-views), the leak list (leak-list) and the audit control
 *     (detect).
 *   - pages/hub/personal-assistant/sandbox.js: the evidence panel
 *     (evidence-gate) and the verified destinations (sandbox-destinations).
 *
 * A target names alternatives with "a|b"; PageTutorial rings the first one it
 * finds on screen and tolerates a step whose element is on another route, so
 * the same eight steps read correctly from any of the three.
 *
 * The wording never promises a grade this platform will not stand behind. The
 * evidence boundary is Dan's ruling on this surface: nothing here scores an
 * approximate answer, and the tour says so rather than implying otherwise.
 *
 * Copy is Title Case (the popup rule). No em dashes.
 */
export const PERSONAL_ASSISTANT_TUTORIAL_KEY = 'pa_tutorial_seen_v1';

export const PERSONAL_ASSISTANT_TUTORIAL = {
  id: 'personal-assistant',
  title: 'Personal Assistant',
  storageKey: PERSONAL_ASSISTANT_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Meet Jarvis, Your Personal Assistant',
      body: 'This Is Your Command Center For Getting Better. Jarvis Reads Your Real Sessions And Hands, Finds The Decisions That Repeat, And Points You At The One Thing Worth Fixing Next. Nothing On This Page Guesses: Every Number Comes From Hands You Actually Played.',
      target: null,
    },
    {
      id: 'nav',
      title: 'Everything Is On One Screen',
      body: 'The Row At The Top Jumps Between Your Tools: Overview, The Scenario Archive, Leak Finder, The Training Center And Your Activity. Every Anchor Is Visible At Once On A Phone, So There Is Nothing To Swipe Across And Nothing Hidden Off The Edge.',
      target: 'nav|leak-views',
    },
    {
      id: 'mission',
      title: 'The Jarvis Priority Queue',
      body: 'The Big Card Is Your Next Move, Chosen From Live Data. Active Leaks Come First, Then Your Most Recent Session, Then The Daily Spot. The Button Takes You Straight There. If The Data Link Drops, The Card Says So And Offers A Retry Instead Of Showing You A Stale Answer.',
      target: 'mission|leak-list',
    },
    {
      id: 'loop',
      title: 'The Decision Loop',
      body: 'Train, Diagnose, Train Again. The Three Steps Under The Priority Queue Are The Loop That Actually Moves Your Win Rate, And Each One Shows Your Own Count Beside It. Tap Any Step To Jump Into That Part Of The Loop.',
      target: 'loop|leak-views',
    },
    {
      id: 'systems',
      title: 'Leak Finder And The Evidence Gate',
      body: 'Leak Finder Audits Your Club Arena Hands Against The Same Solver Ranges Training Uses, Then Turns Each Repeated Mistake Into A Scheduled Drill. The Scenario Analysis Archive Explains The Evidence Boundary: Approximate Grading Is Retired, So Anything Scored Here Is Backed By A Signed Training Attempt.',
      target: 'systems|detect|evidence-gate',
    },
    {
      id: 'stats',
      title: 'Your Dashboard Numbers',
      body: 'Sessions Reviewed, Hands Analyzed, Active Leaks And Archived Sessions. Each Counter Is A Button That Opens The Detail Behind It. While Jarvis Is Still Reading Your Data The Cards Say So Rather Than Showing A Zero You Might Mistake For A Result.',
      target: 'stats|leak-list',
    },
    {
      id: 'activity',
      title: 'Activity And Your Recent Sessions',
      body: 'The Activity Cards Summarise What Changed Since You Were Last Here, And The List Below Them Reopens Any Of Your Three Most Recent Sessions With Its Type, Its Date And Its EV Beside It. Pull Down At The Top Of The Page Any Time To Refresh All Of It.',
      target: 'activity|sessions|detect',
    },
    {
      id: 'daily',
      title: 'Hand Of The Day And Where To Find This Again',
      body: 'The Daily Spot Gives You One Real Decision To Think Through, Then Hands You To Verified Training For The Grade. Replay This Tour Any Time From Page Tutorial In The Hamburger Menu, On This Page Or Any Other.',
      target: 'daily|sandbox-destinations|leak-list',
    },
  ],
};
