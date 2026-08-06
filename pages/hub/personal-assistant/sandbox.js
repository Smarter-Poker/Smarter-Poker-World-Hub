// __PUBLISH_PLACEHOLDER_A__
  // mid-range phone never blocks on it. No worker available (SSR, CSP, ancient
  // webview) => the old requestIdleCallback path, unchanged.
// __PUBLISH_SLOT_00__
  }, [parseVoiceCommand]);

  // __PUBLISH_HDR__
  // SCENARIO RESTORE — one code path for share links, templates, sessions,
  // saved folders, imports and the weekly spot.
  // __PUBLISH_HDR__
  const restoreScenario = useCallback((s) => {
    if (!s) return;
// __PUBLISH_SLOT_01__
  }, [pushUndo, clearResults]);

  // __PUBLISH_HDR__
  // HYDRATION — lz-string payload, legacy query params, leak hand-off
  // __PUBLISH_HDR__
  useEffect(() => {
    if (!router.isReady) return;
// __PUBLISH_SLOT_02__
  }, [router.query.loadShared]);

  // __PUBLISH_HDR__
  // WEEKLY SPOT
  // __PUBLISH_HDR__
  useEffect(() => {
    let cancelled = false;
// __PUBLISH_SLOT_03__
  }, [restoreScenario]);

  // __PUBLISH_HDR__
  // SESSION LOG — persisted locally on EVERY change (the old code only wrote
  // after a successful server fetch, so offline journals were lost on reload)
  // __PUBLISH_HDR__
  useEffect(() => {
    const t = setTimeout(() => {
// __PUBLISH_SLOT_04__
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // __PUBLISH_HDR__
  // TEMPLATES + ANALYTICS (explicit status machines, never a dead spinner)
  // __PUBLISH_HDR__
  const loadTemplates = useCallback(async () => {
    setTemplatesError(null);
// __PUBLISH_SLOT_05__
  }, [heroPosition, currentStreet, gameType, handStrength]);

  // __PUBLISH_HDR__
  // CARD SELECTION / BOARD
  // __PUBLISH_HDR__
  const openHeroPicker = useCallback(() => {
    setDeckTarget('hero');
// __PUBLISH_SLOT_06__
  }, [handOver, results, resultsOverride, currentStreet, board, equity, dealNextStreet, villains]);

  // __PUBLISH_HDR__
  // ACTION LINE — the villain now answers EVERY hero action (the old code only
  // fired when the builder's position dropdown happened to equal heroPosition)
  // __PUBLISH_HDR__
  const addAction = useCallback((a) => {
    if (handOver) return;
// __PUBLISH_SLOT_07__
  }, []);

  // __PUBLISH_HDR__
  // VILLAIN CONTROLS (multiway)
  // __PUBLISH_HDR__
  const patchVillain = useCallback((idx, patch, recomputeRange = false) => {
    setVillains(prev => prev.map((v, i) => {
// __PUBLISH_SLOT_08__
  }, []);

  // __PUBLISH_HDR__
  // ANALYSIS
  // __PUBLISH_HDR__
  const sandboxSnapshot = useMemo(() => ({
    board, heroHand, heroPosition,
// __PUBLISH_SLOT_09__
  }, [heroHand.card1, heroHand.card2, heroPosition, board.flop.length]);

  // __PUBLISH_HDR__
  // QUIZ — graded against the curated answer when a weekly spot is loaded
  // __PUBLISH_HDR__
  const handleQuizGuess = useCallback((guess) => {
    setUserGuess(guess);
// __PUBLISH_SLOT_10__
  }, [resultsOverride, results, activeSpot, board, heroHand, heroPosition, currentStreet, scheduleReview]);

  // __PUBLISH_HDR__
  // POSITION COMPARISON — must not re-fire the coach effect (it used to
  // double-count the streak and POST a duplicate coach-result row)
  // __PUBLISH_HDR__

  // The suppression flag is consumed by the `results` effect, which only runs
// __PUBLISH_SLOT_11__
  }, [analyzeWithoutCoach, buildAnalyzePayload]);

  // __PUBLISH_HDR__
  // HAND PLAYOUT — terminal states, a result banner, and Next Hand
  // __PUBLISH_HDR__
  const handResult = useMemo(() => {
    if (!handState.terminal) return null;
// __PUBLISH_SLOT_12__
  }, [handResult, reduceMotion, pushUndo, clearResults, playCardDeal]);

  // __PUBLISH_HDR__
  // RESET — two-tap confirm in-page (window.confirm is blocked in several
  // in-app browsers, and the felt button used to reset with no confirmation)
  // __PUBLISH_HDR__
  const resetAll = useCallback(() => {
    setHeroHand({ card1: null, card2: null });
// __PUBLISH_SLOT_13__
  }, [results, resultsOverride, actionHistory.length, heroHand.card1, board.flop.length, resetArmed, resetAll]);

  // __PUBLISH_HDR__
  // BOOKMARKS
  // __PUBLISH_HDR__
  const saveBookmarkLocally = useCallback((payload) => {
    if (!payload || typeof window === 'undefined') return false;
// __PUBLISH_SLOT_14__
    const cards = String(entry.board || '').split(' ').filter(Boolean);
    restoreScenario({
// __PUBLISH_PLACEHOLDER_C__
