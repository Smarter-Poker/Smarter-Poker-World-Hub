// __PUBLISH_PLACEHOLDER_A__
  // mid-range phone never blocks on it. No worker available (SSR, CSP, ancient
  // webview) => the old requestIdleCallback path, unchanged.
// __PUBLISH_SLOT_00__
  // ═══════════════════════════════════════════════════════════
  // SCENARIO RESTORE — one code path for share links, templates, sessions,
  // saved folders, imports and the weekly spot.
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_01__
  // ═══════════════════════════════════════════════════════════
  // HYDRATION — lz-string payload, legacy query params, leak hand-off
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_02__
  // ═══════════════════════════════════════════════════════════
  // WEEKLY SPOT
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_03__
  // ═══════════════════════════════════════════════════════════
  // SESSION LOG — persisted locally on EVERY change (the old code only wrote
  // after a successful server fetch, so offline journals were lost on reload)
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_04__
  // ═══════════════════════════════════════════════════════════
  // TEMPLATES + ANALYTICS (explicit status machines, never a dead spinner)
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_05__
  // ═══════════════════════════════════════════════════════════
  // CARD SELECTION / BOARD
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_06__
  // ═══════════════════════════════════════════════════════════
  // ACTION LINE — the villain now answers EVERY hero action (the old code only
  // fired when the builder's position dropdown happened to equal heroPosition)
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_07__
  // ═══════════════════════════════════════════════════════════
  // VILLAIN CONTROLS (multiway)
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_08__
  // ═══════════════════════════════════════════════════════════
  // ANALYSIS
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_09__
  // ═══════════════════════════════════════════════════════════
  // QUIZ — graded against the curated answer when a weekly spot is loaded
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_10__
  // ═══════════════════════════════════════════════════════════
  // POSITION COMPARISON — must not re-fire the coach effect (it used to
  // double-count the streak and POST a duplicate coach-result row)
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_11__
  // ═══════════════════════════════════════════════════════════
  // HAND PLAYOUT — terminal states, a result banner, and Next Hand
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_12__
  // ═══════════════════════════════════════════════════════════
  // RESET — two-tap confirm in-page (window.confirm is blocked in several
  // in-app browsers, and the felt button used to reset with no confirmation)
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_13__
  // ═══════════════════════════════════════════════════════════
  // BOOKMARKS
  // ═══════════════════════════════════════════════════════════
// __PUBLISH_SLOT_14__
    const cards = String(entry.board || '').split(' ').filter(Boolean);
    restoreScenario({
// __PUBLISH_PLACEHOLDER_C__
