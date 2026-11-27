/**
 * Personal Assistant tutorial.
 *
 * Registered for the whole /hub/personal-assistant prefix, so the hub,
 * Review My Play, Virtual Sandbox, and My Leaks share a truthful tour.
 * Every `target` is a `data-tutorial="..."` attribute on a real element.
 *
 * Copy is Title Case. No em dashes.
 */
export const PERSONAL_ASSISTANT_TUTORIAL_KEY = 'pa_tutorial_seen_v1';

export const PERSONAL_ASSISTANT_TUTORIAL = {
  id: 'personal-assistant',
  title: 'Personal Assistant',
  storageKey: PERSONAL_ASSISTANT_TUTORIAL_KEY,
  steps: [
    {
      id: 'welcome',
      title: 'Meet Your Personal Assistant',
      body: 'This Is Your Workspace For Reviewing Saved Hands, Exploring Scenarios In Virtual Sandbox, And Fixing Leaks. Every Number Comes From Real Hands And Verified Solver Checks.',
      target: null,
    },
    {
      id: 'nav',
      title: 'Personal Assistant Home And Settings',
      body: 'Start Here For Your Next Step. Use The Settings Control In The Top Corner Any Time To Adjust Practice And Audit Preferences Inside Personal Assistant.',
      target: 'nav|leak-views',
    },
    {
      id: 'mission',
      title: 'Review My Play',
      body: 'Open Your Saved Club Arena Hands, Record Private Notes, Track Review Status, And Pass Canonical Completed Hands Into Verified Analysis Without Mixing Saved And Analyzed States.',
      target: 'mission|leak-list',
    },
    {
      id: 'systems',
      title: 'Virtual Sandbox',
      body: 'Launch The Native Poker Table To Explore Boards, Opponent Ranges, Action Sequences, Multiway Equity, Saved Studies, And Imports. Authored Scenarios Stay Ungraded.',
      target: 'systems|detect',
    },
    {
      id: 'stats',
      title: 'My Leaks',
      body: 'Audit Your Completed Club Arena Hands Against Verified Solver Evidence, Track Active And Fixed Leaks, And Review Real Examples.',
      target: 'stats|leak-list',
    },
    {
      id: 'loop',
      title: 'Log A Hand And My Coaching Plan',
      body: 'Log A Hand Directly Inside Personal Assistant Or Open Your Coaching Plan For Weekly Focus Areas And Goals.',
      target: 'loop|leak-views',
    },
    {
      id: 'settings',
      title: 'Assistant Settings And Preferences',
      body: 'Open Settings Inside Personal Assistant To Adjust Audit Defaults, Study Preferences, And Notifications Without Leaving The Workspace.',
      target: 'nav|leak-views',
    },
    {
      id: 'activity',
      title: 'Replay This Tour Any Time',
      body: 'Pull Down At The Top Of The Page To Refresh Your Live Account Data. Replay This Tour Any Time From Page Tutorial In The Hamburger Menu.',
      target: 'activity|detect',
    },
  ],
};
