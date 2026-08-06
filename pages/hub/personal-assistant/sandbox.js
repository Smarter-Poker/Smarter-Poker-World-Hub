  // ━━━ EQUITY — range-aware and progressive ━━━
  // A fast 250-sim pass paints a number immediately (cheap enough to stay on
  // the main thread); the 2000-sim refinement goes to a Web Worker so a
  // mid-range phone never blocks on it. No worker available (SSR, CSP, ancient
  // webview) => the old requestIdleCallback path, unchanged.
        : null,
      heroPosition: entry.position,
      board: { flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null },
      actionHistory: [],
      potSize: 1.5,
