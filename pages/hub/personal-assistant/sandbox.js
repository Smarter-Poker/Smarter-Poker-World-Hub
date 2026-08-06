// __PUBLISH_PLACEHOLDER_A__
  // mid-range phone never blocks on it. No worker available (SSR, CSP, ancient
  // webview) => the old requestIdleCallback path, unchanged.
  const [equity, setEquity] = useState(null);
  const [equityVsRange, setEquityVsRange] = useState(true);

  useEffect(() => {
    if (!heroHand.card1 || !heroHand.card2) { setEquity(null); return undefined; }
    const heroCards = [heroHand.card1, heroHand.card2];
    const boardCards = boardToArray(board);
    const range = equityVsRange ? equityRangeInput : null;

    let cancelled = false;
    let idleId = null;
    const abort = makeEquityAbort();
    const idle = (cb) => {
      if (typeof window !== 'undefined' && window.requestIdleCallback) return window.requestIdleCallback(cb, { timeout: 900 });
      return setTimeout(cb, 80);
    };
    const cancelIdle = (id) => {
      if (id == null) return;
      if (typeof window !== 'undefined' && window.cancelIdleCallback) window.cancelIdleCallback(id);
      else clearTimeout(id);
    };

    const t = setTimeout(() => {
      try {
        const fast = calculateEquity(heroCards, boardCards, 250, range);
        if (!cancelled) setEquity({ ...fast, refining: true });
      } catch (e) { if (!cancelled) setEquity(null); }

      if (isEquityWorkerAvailable()) {
        // Off-thread: no reason to wait for an idle slice, it never touches
        // this thread. `cancelled` is the last line of defence against a slow
        // reply from a previous hand overwriting the current one.
        calculateEquityAsync(heroCards, boardCards, 2000, range, { signal: abort.signal })
          .then((full) => {
            if (!cancelled && full) setEquity({ ...full, refining: false });
          })
          .catch(() => { /* keep the fast estimate */ });
        return;
      }

      idleId = idle(() => {
        try {
          const full = calculateEquity(heroCards, boardCards, 2000, range);
          if (!cancelled) setEquity({ ...full, refining: false });
        } catch (e) { /* keep the fast estimate */ }
      });
    }, 90);

    return () => { cancelled = true; clearTimeout(t); cancelIdle(idleId); abort.abort(); };
  }, [heroHand.card1, heroHand.card2, board, equityVsRange, equityRangeInput]);

  const equityLabel = useMemo(() => {
    if (!equityVsRange) return 'vs random hand';
    if (villains.length > 1) return `vs ${villains.length} villain ranges`;
    return `vs ${villains[0]?.archetype?.name || 'villain'} range`;
  }, [equityVsRange, villains]);

  // ━━━ RUNOUTS ━━━
  const [runoutData, setRunoutData] = useState(null);
  useEffect(() => {
    if (!heroHand.card1 || !heroHand.card2 || board.flop.length < 3 || board.river) {
      setRunoutData(null); return undefined;
    }
    const heroCards = [heroHand.card1, heroHand.card2];
    const boardCards = [...board.flop];
    if (board.turn) boardCards.push(board.turn);
    const range = equityVsRange ? equityRangeInput : null;

    // ~46 candidate cards x 200 sims each — by far the heaviest thing on this
    // page. Straight to the worker; the synchronous call is the fallback.
    let cancelled = false;
    const abort = makeEquityAbort();
    const t = setTimeout(() => {
      if (isEquityWorkerAvailable()) {
        simulateRunoutsAsync(heroCards, boardCards, 200, range, { signal: abort.signal })
          .then((data) => {
            if (!cancelled) setRunoutData(data || null);
          })
          .catch(() => { if (!cancelled) setRunoutData(null); });
        return;
      }
      try { setRunoutData(simulateRunouts(heroCards, boardCards, 200, range)); }
      catch (e) { setRunoutData(null); }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); abort.abort(); };
  }, [heroHand.card1, heroHand.card2, board, equityVsRange, equityRangeInput]);

  // The worker is shared across both effects, so it is torn down once, on
  // unmount — never per input change (that is what abort() above is for).
  useEffect(() => () => terminateEquityWorker(), []);

  // ━━━ PREFLOP CHARTS ━━━
  const [preflopScenario, setPreflopScenario] = useState('rfi');
  const rangeGrid = useMemo(() => (currentStreet === 'preflop' ? getRangeGrid(heroPosition, preflopScenario) : null), [heroPosition, preflopScenario, currentStreet]);
  const rangePercent = useMemo(() => (currentStreet === 'preflop' ? getRangePercentage(heroPosition, preflopScenario) : 0), [heroPosition, preflopScenario, currentStreet]);

  // ━━━ EXPLOIT / ICM ━━━
  const [exploitMode, setExploitMode] = useState('gto');
  const [bubbleFactor, setBubbleFactor] = useState(1.0);
  const exploitTip = useMemo(() => {
    if (exploitMode !== 'exploit' || !villains[0]) return null;
    const tips = {
      calling_station: 'Bet thinner for value, skip bluffs',
      nit: 'Steal more pots, respect raises',
      lag: 'Tighten up, let them hang themselves',
      tag: 'Stay balanced, mix your frequencies',
      maniac: 'Widen value range, reduce bluff frequency',
      fish: 'Bet bigger with strong hands, simplify decisions',
      gto_neutral: 'No exploit adjustment needed',
    };
    return tips[villains[0].archetype?.id || 'gto_neutral'] || 'Adjust based on villain tendencies';
  }, [exploitMode, villains]);

  // ━━━ SOUNDS / FEATURE MODALS ━━━
  const { soundEnabled, toggleSound, playCardDeal, playChipClick, playAnalysisDing } = useSandboxSounds();
  const [showHHImport, setShowHHImport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesStatus, setTemplatesStatus] = useState('idle');
  const [templatesError, setTemplatesError] = useState(null);
  const [showRangeGrid, setShowRangeGrid] = useState(false);
  // Hydration-safe (React #418): constant initial value, hydrate after mount.
  // tableFelt drives a rendered inline `filter` style, so a storage read in the
  // useState initializer would make the SSR HTML and first client render disagree.
  const [tableFelt, setTableFelt] = useState('default');
  useEffect(() => {
    const saved = safeLocal.get('sandbox-felt', null);
    if (saved) setTableFelt(saved);
  }, []);
  const [leakStats, setLeakStats] = useState(null);
  const [leakStatsStatus, setLeakStatsStatus] = useState('loading');
  const [leakStatsError, setLeakStatsError] = useState(null);
  const [showLeakStats, setShowLeakStats] = useState(false);
  const [sessionLog, setSessionLog] = useState([]);
  // Marker for "hands played in THIS sitting". Every locally-created entry now
  // carries `createdAt` (and the server returns one too), so the absence of
  // `createdAt` is NOT a usable signal — entries are stamped explicitly.
  const sessionStartedAtRef = useRef(Date.now());
  const [showSessionLog, setShowSessionLog] = useState(false);
  const [showRangeExplorer, setShowRangeExplorer] = useState(false);
  const [showQuickDrill, setShowQuickDrill] = useState(false);
  const [showSessionReport, setShowSessionReport] = useState(false);
  const [showVillainPresets, setShowVillainPresets] = useState(false);
  const [showHandReplay, setShowHandReplay] = useState(false);
  const [showStudyFolders, setShowStudyFolders] = useState(false);
  const [showSaveHand, setShowSaveHand] = useState(false);
  const [showShareScenario, setShowShareScenario] = useState(false);
  const [showCustomDrill, setShowCustomDrill] = useState(false);
  const [showGodMode, setShowGodMode] = useState(false);
  const [drillParams, setDrillParams] = useState(null);
  const [recentResults, setRecentResults] = useState([]);
  const [showSolverImport, setShowSolverImport] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showNodeLocks, setShowNodeLocks] = useState(false);
  // Before/after hero EV around a node-lock change, so the exploit panel can
  // show what the lock actually bought. `after` fills in on the next analysis.
  const [lockEvPreview, setLockEvPreview] = useState(null);
  const [showShareHand, setShowShareHand] = useState(false);
  const [showVillainRange, setShowVillainRange] = useState(false);
  const [showShortcutLegend, setShowShortcutLegend] = useState(false);
  const [showDue, setShowDue] = useState(false);
  const [practiceFocus, setPracticeFocus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [ttsOverlay, setTtsOverlay] = useState(null);
  const exportCardRef = useRef(null);

  // ━━━ QUIZ / COACH ━━━
  const [quizMode, setQuizMode] = useState(false);
  const [userGuess, setUserGuess] = useState(null);
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0, streak: 0 });
  const [weeklySpot, setWeeklySpot] = useState(null);
  const [activeSpot, setActiveSpot] = useState(null); // the curated spot being quizzed
  // Hydration-safe (React #418): coachMode changes rendered button copy, so the
  // stored value is applied in an effect rather than the useState initializer.
  const [coachMode, setCoachMode] = useState(false);
  useEffect(() => {
    if (safeLocal.get('sandbox-coach-mode', null) === 'true') setCoachMode(true);
  }, []);
  const [showCoachPicker, setShowCoachPicker] = useState(false);
  const [coachUserPick, setCoachUserPick] = useState(null);
  const [coachEvDelta, setCoachEvDelta] = useState(null);
  const [coachEvEstimated, setCoachEvEstimated] = useState(false);
  const [coachStreak, setCoachStreak] = useState(0);
  const [pendingBoard, setPendingBoard] = useState(null);
  const coachStreakRef = useRef(0);
  const coachUserPickRef = useRef(null);
  const suppressCoachEffectRef = useRef(false);
  useEffect(() => { coachUserPickRef.current = coachUserPick; }, [coachUserPick]);

  // ━━━ SPACED REPETITION ━━━
  const [srs, setSrs] = useState([]);
  useEffect(() => { setSrs(srsLoad()); }, []);
  const dueItems = useMemo(() => srsDue(srs), [srs]);
  const scheduleReview = useCallback((item, correct) => {
    setSrs(prev => {
      const next = srsUpsert(prev, item, correct);
      srsSave(next);
      return next;
    });
  }, []);

  // ━━━ REPLAY ━━━
  const [replayIndex, setReplayIndex] = useState(null);
  const replayState = useMemo(() => {
    if (replayIndex == null) return null;
    const slice = actionHistory.slice(0, replayIndex + 1);
    const st = computeHandState({
      basePot: Number(potBase) || 1.5, actions: slice, heroPosition,
      heroStack: Number(heroStack) || 100, villainStack: Number(villains[0]?.stack) || 100,
      street: currentStreet,
    });
    // Trim any card dealt after the replayed action's street
    const order = ['preflop', 'flop', 'turn', 'river'];
    const target = order.indexOf(String(slice[slice.length - 1]?.street || currentStreet));
    const b = { flop: [...board.flop], turn: board.turn, river: board.river };
    if (target >= 0 && target < 3) b.river = null;
    if (target >= 0 && target < 2) b.turn = null;
    if (target === 0) b.flop = [];
    return { handState: st, board: b, cards: boardToArray(b) };
  }, [replayIndex, actionHistory, potBase, heroPosition, heroStack, villains, currentStreet, board]);

  const onReplayTo = useCallback((i) => {
    try { navigator.vibrate?.(i === null ? 20 : 10); } catch (e) { /* unsupported */ }
    setReplayIndex(i);
  }, []);

  // ━━━ VOICE ━━━
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const speechRef = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setVoiceSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);
  useEffect(() => () => { try { speechRef.current?.abort?.(); } catch (e) { /* noop */ } }, []);

  const parseVoiceCommand = useCallback((text) => {
    const rankWords = { ace: 'A', king: 'K', queen: 'Q', jack: 'J', ten: 'T', nine: '9', eight: '8', seven: '7', six: '6', five: '5', four: '4', three: '3', two: '2', deuce: '2' };
    const suitWords = { spade: 's', spades: 's', heart: 'h', hearts: 'h', diamond: 'd', diamonds: 'd', club: 'c', clubs: 'c' };
    const posWords = { 'under the gun': 'UTG', utg: 'UTG', middle: 'MP', cutoff: 'CO', 'cut off': 'CO', button: 'BTN', 'small blind': 'SB', 'big blind': 'BB' };
    const words = text.split(/\s+/);
    const cards = [];
    let suit = null;
    words.forEach(w => {
      if (rankWords[w]) cards.push(rankWords[w]);
      if (suitWords[w]) suit = suitWords[w];
    });
    if (cards.length >= 2) {
      const s1 = suit || 's';
      const s2 = suit ? (suit === 's' ? 'h' : 's') : 'h';
      pushUndo();
      setHeroHand({ card1: `${cards[0]}${s1}`, card2: `${cards[1]}${text.includes('suited') ? s1 : s2}` });
      toast.success('Hand set from voice');
    }
    Object.entries(posWords).some(([key, val]) => {
      if (text.includes(key)) { setHeroPosition(val); return true; }
      return false;
    });
    const stackMatch = text.match(/(\d+)\s*(bb|big blind)/i);
    if (stackMatch) setHeroStack(parseInt(stackMatch[1], 10));
    if (/tournament|mtt/.test(text)) setGameType('tournament');
    else if (text.includes('cash')) setGameType('cash');
  }, [pushUndo]);

  const startVoiceInput = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Voice input is not supported in this browser'); return; }
    try { navigator.vibrate?.(10); } catch (e) { /* unsupported */ }
    try {
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        parseVoiceCommand(String(event.results[0][0].transcript || '').toLowerCase());
        setIsListening(false);
      };
      recognition.onerror = () => { setIsListening(false); toast.error('Could not hear that'); };
      recognition.onend = () => setIsListening(false);
      recognition.start();
      setIsListening(true);
      speechRef.current = recognition;
    } catch (e) {
      setIsListening(false);
      toast.error('Voice input failed to start');
    }
  }, [parseVoiceCommand]);

  // __PUBLISH_HDR__
  // SCENARIO RESTORE — one code path for share links, templates, sessions,
  // saved folders, imports and the weekly spot.
  // __PUBLISH_HDR__
  const restoreScenario = useCallback((s) => {
    if (!s) return;
    pushUndo();
    if (s.heroHand) setHeroHand({ card1: s.heroHand.card1 || null, card2: s.heroHand.card2 || null });
    if (s.heroPosition && POSITIONS.includes(s.heroPosition)) setHeroPosition(s.heroPosition);
    if (s.heroStack != null || s.effStack != null) setHeroStack(Number(s.heroStack ?? s.effStack) || 100);
    if (s.gameType) setGameType(s.gameType);
    if (s.board) {
      setBoard(Array.isArray(s.board)
        ? { flop: s.board.slice(0, 3), turn: s.board[3] || null, river: s.board[4] || null }
        : { flop: [...(s.board.flop || [])], turn: s.board.turn || null, river: s.board.river || null });
    }
    if (Array.isArray(s.villains) && s.villains.length) {
      setVillains(withVillainIds(s.villains.map(v => ({ ...v, stack: Number(v.stack) || 100 }))));
    }
    const actions = Array.isArray(s.actionHistory) ? s.actionHistory : [];
    setActionHistory(actions);
    // A stored pot ALREADY contains the stored action line — replaying the line
    // on top of it would double-count, so the base resets when actions exist.
    setPotBase(actions.length > 0 ? 1.5 : (Number(s.potSize) || 1.5));
    setReplayIndex(null);
    clearResults();
    setResultsOverride(null);
    streetHistoryRef.current = [];
    setStreetHistory([]);
    setActiveStreet(0);
  }, [pushUndo, clearResults]);

  // __PUBLISH_HDR__
  // HYDRATION — lz-string payload, legacy query params, leak hand-off
  // __PUBLISH_HDR__
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;

    if (q.leak || q.leakType || q.drill) {
      setPracticeFocus({ leakId: q.leak || null, leakType: q.leakType || null, drill: q.drill || null });
      setCoachMode(true);
      safeLocal.set('sandbox-coach-mode', 'true');
    }

    // 1. Full-fidelity lz-string snapshot (villains + action line survive)
    let restoredRich = false;
    const packed = typeof q.s === 'string' && !/^\d+(\.\d+)?$/.test(q.s) ? q.s : null;
    if (packed) {
      try {
        const json = LZString.decompressFromEncodedURIComponent(packed);
        const state = json ? JSON.parse(json) : null;
        if (state && typeof state === 'object') { restoreScenario(state); restoredRich = true; }
      } catch (e) { console.warn('[Sandbox] share payload could not be read:', e?.message || e); }
    }

    // 2. Legacy query params
    if (!restoredRich && (q.h || q.p || q.b)) {
      const hand = String(q.h || '');
      if (hand.length >= 4) setHeroHand({ card1: hand.substring(0, 2), card2: hand.substring(2, 4) });
      if (q.p && POSITIONS.includes(q.p)) setHeroPosition(q.p);
      const stackParam = q.s_bb ?? (/^\d+(\.\d+)?$/.test(String(q.s || '')) ? q.s : null);
      if (stackParam != null) setHeroStack(Number(stackParam) || 100);
      if (q.g) setGameType(q.g);
      if (q.pot != null) setPotBase(Number(q.pot) || 1.5);
      if (q.b) {
        const cards = String(q.b).includes(',') ? String(q.b).split(',').filter(Boolean) : (String(q.b).match(/.{1,2}/g) || []);
        setBoard({ flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null });
      }
      if (q.partial === '1') toast('Partial scenario restored — opponents and betting line were not in the link', { duration: 4000 });
    }

    if (typeof window !== 'undefined' && (q.h || q.b || q.s || q.leak || q.leakType || q.drill)) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Shared-scenario hydration via sessionStorage (the /sandbox/<id> hand-off)
  useEffect(() => {
    if (typeof window === 'undefined' || router.query.loadShared !== 'true') return;
    try {
      const payload = sessionStorage.getItem('shared-sandbox-state');
      if (payload) {
        restoreScenario(JSON.parse(payload));
        sessionStorage.removeItem('shared-sandbox-state');
        toast.success('Shared scenario loaded');
      }
    } catch (err) {
      console.warn('Failed to parse shared state payload', err);
      toast.error('That shared scenario could not be read');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.loadShared]);

  // __PUBLISH_HDR__
  // WEEKLY SPOT
  // __PUBLISH_HDR__
  useEffect(() => {
    let cancelled = false;
    fetch('/api/assistant/sandbox/weekly-spot')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data?.spot) setWeeklySpot(data.spot); })
      .catch(e => console.warn('[Sandbox] weekly spot unavailable:', e?.message || e));
    return () => { cancelled = true; };
  }, []);

  const loadWeeklySpot = useCallback((spot) => {
    if (!spot?.scenario_json) return;
    restoreScenario(spot.scenario_json);
    setActiveSpot(spot);
    setQuizMode(true);
    setQuizRevealed(false);
    setUserGuess(null);
    toast('Weekly spot loaded — tap Analyze to start the quiz');
  }, [restoreScenario]);

  // __PUBLISH_HDR__
  // SESSION LOG — persisted locally on EVERY change (the old code only wrote
  // after a successful server fetch, so offline journals were lost on reload)
  // __PUBLISH_HDR__
  useEffect(() => {
    const t = setTimeout(() => {
      try { Promise.resolve(idbSaveSessionLog(sessionLog)).catch(() => {}); }
      catch (e) { console.warn('[Sandbox] session log persist failed:', e?.message || e); }
    }, 500);
    return () => clearTimeout(t);
  }, [sessionLog]);

  // `origin` explicitly labels where a row came from. Downstream components
  // (HandReplay, SessionReport) branch on `source`, never on the presence of a
  // timestamp — every row has one.
  const mergeSessions = useCallback((incoming, origin = 'server') => {
    setSessionLog(prev => {
      const ts = (e) => Number(new Date(e?.createdAt || e?.created_at || 0)) || Number(e?.id) || 0;
      const byId = new Map();
      (incoming || []).forEach(s => {
        if (!s) return;
        byId.set(String(s.id), { ...s, source: s.source || origin });
      });
      (prev || []).forEach(p => { if (!byId.has(String(p.id))) byId.set(String(p.id), p); });
      return Array.from(byId.values()).sort((a, b) => ts(a) - ts(b));
    });
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const user = getAuthUser();
      if (!user) {
        const offline = await idbLoadSessionLog();
        if (Array.isArray(offline) && offline.length) mergeSessions(offline, 'local');
        return;
      }
      const token = getAccessToken();
      const res = await fetch('/api/sandbox/sessions', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success && Array.isArray(json.sessions)) mergeSessions(json.sessions, 'server');
    } catch (err) {
      console.warn('[Sandbox] session fetch error (falling back to IDB):', err?.message || err);
      try {
        const offline = (await idbLoadSessionLog()) || [];
        if (offline.length) mergeSessions(offline, 'local');
      } catch (idbErr) { console.warn('[Sandbox] IDB fallback error:', idbErr?.message || idbErr); }
    }
  }, [mergeSessions]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // __PUBLISH_HDR__
  // TEMPLATES + ANALYTICS (explicit status machines, never a dead spinner)
  // __PUBLISH_HDR__
  const loadTemplates = useCallback(async () => {
    setTemplatesError(null);
    try {
      if (!getAuthUser()) { setTemplatesStatus('signed-out'); return; }
      setTemplatesStatus('loading');
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/assistant/sandbox/sandbox-templates', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      const json = await r.json();
      setTemplates(json.templates || []);
      setTemplatesStatus('ready');
    } catch (e) {
      console.warn('[Templates] Load error:', e?.message || e);
      setTemplatesError(e?.message || 'Unknown error');
      setTemplatesStatus('error');
    }
  }, []);

  const saveAsTemplate = useCallback(async (name) => {
    const label = String(name || '').trim()
      || `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'} ${board.flop.length ? `on ${board.flop.join('')}` : 'preflop'}`;
    try {
      if (!getAuthUser()) { toast.error('Sign in to save templates'); return; }
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/assistant/sandbox/sandbox-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          name: label,
          scenario: { heroHand, heroPosition, heroStack, gameType, board, villains, actionHistory, potSize },
        }),
      });
      // The API really does return 409/413 — the old code toasted success blindly.
      if (r.status === 409) { toast.error('Template limit reached (30) — delete one first'); return; }
      if (r.status === 413) { toast.error('Scenario too large to save as a template'); return; }
      if (!r.ok) { toast.error(`Could not save template (${r.status})`); return; }
      toast.success('Template saved');
      loadTemplates();
    } catch (e) {
      console.warn('[Templates] Save error:', e?.message || e);
      toast.error('Could not save template');
    }
  }, [heroHand, heroPosition, heroStack, gameType, board, villains, actionHistory, potSize, loadTemplates]);

  const deleteTemplate = useCallback(async (id) => {
    const prev = templates;
    setTemplates(list => list.filter(t => t.id !== id)); // optimistic
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/assistant/sandbox/sandbox-templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      toast.success('Template deleted');
    } catch (e) {
      console.warn('[Templates] Delete error:', e?.message || e);
      setTemplates(prev); // roll back
      toast.error('Could not delete that template');
    }
  }, [templates]);

  const loadLeakStats = useCallback(async () => {
    setLeakStatsError(null);
    try {
      if (!getAuthUser()) { setLeakStatsStatus('signed-out'); return; }
      setLeakStatsStatus('loading');
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/assistant/sandbox/sandbox-analytics', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      setLeakStats(await r.json());
      setLeakStatsStatus('ready');
    } catch (e) {
      console.warn('[LeakStats] Load error:', e?.message || e);
      setLeakStatsError(e?.message || 'Unknown error');
      setLeakStatsStatus('error');
    }
  }, []);

  const openAnalytics = useCallback(() => { setShowLeakStats(true); setLeakStatsStatus('loading'); loadLeakStats(); }, [loadLeakStats]);

  const logAnalytics = useCallback(async (freshData, pickedAction, streetOverride) => {
    try {
      if (!getAuthUser()) return;
      const optimalLabel = freshData?.optimalAction?.label || null;
      const { data: { session } } = await supabase.auth.getSession();
      fetch('/api/assistant/sandbox/sandbox-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          position: heroPosition,
          street: streetOverride || currentStreet,
          gameType,
          action: optimalLabel,
          isCorrect: pickedAction && optimalLabel ? gradeAction(pickedAction, optimalLabel) : null,
          handStrength: handStrength?.label || null,
        }),
      }).catch(e => console.warn('[Sandbox] analytics post failed:', e?.message || e));
    } catch (e) { console.warn('[Sandbox] analytics error:', e?.message || e); }
  }, [heroPosition, currentStreet, gameType, handStrength]);

  // __PUBLISH_HDR__
  // CARD SELECTION / BOARD
  // __PUBLISH_HDR__
  const openHeroPicker = useCallback(() => {
    setDeckTarget('hero');
    setHeroPickStep(heroHand.card1 && !heroHand.card2 ? 2 : 1);
    setShowDeck(true);
  }, [heroHand.card1, heroHand.card2]);

  const openBoardPicker = useCallback(() => { setDeckTarget('board'); setShowDeck(true); }, []);

  const handleDeckSelect = useCallback((cardStr) => {
    try { navigator.vibrate?.(10); } catch (e) { /* unsupported */ }
    playCardDeal();
    if (deckTarget === 'hero') {
      if (!heroHand.card1 || heroPickStep === 1) {
        setHeroHand(h => ({ ...h, card1: cardStr }));
        setHeroPickStep(2);
      } else {
        setHeroHand(h => ({ ...h, card2: cardStr }));
        setHeroPickStep(0);
        setShowDeck(false);
        setDeckTarget(null);
      }
      return;
    }
    if (deckTarget !== 'board') return;
    setBoard(prev => {
      if (prev.flop.length < 3) {
        const newFlop = [...prev.flop, cardStr];
        if (newFlop.length >= 3) setTimeout(() => { setShowDeck(false); setDeckTarget(null); }, 150);
        return { ...prev, flop: newFlop };
      }
      if (!prev.turn) { setShowDeck(false); setDeckTarget(null); return { ...prev, turn: cardStr }; }
      if (!prev.river) { setShowDeck(false); setDeckTarget(null); return { ...prev, river: cardStr }; }
      return prev;
    });
  }, [deckTarget, heroHand.card1, heroPickStep, playCardDeal]);

  const freeDeck = useCallback((exclude = []) => {
    const blocked = new Set([...allUsedCards, ...exclude]);
    const deck = [];
    RANKS.forEach(r => SUITS.forEach(s => { const c = `${r}${s.code}`; if (!blocked.has(c)) deck.push(c); }));
    return deck;
  }, [allUsedCards]);

  const randomCard = useCallback(() => {
    const deck = freeDeck();
    if (!deck.length) { toast.error('No cards left in the deck'); return; }
    handleDeckSelect(deck[Math.floor(Math.random() * deck.length)]);
  }, [freeDeck, handleDeckSelect]);

  const randomBoard = useCallback(() => {
    pushUndo();
    const heroOnly = [heroHand.card1, heroHand.card2].filter(Boolean);
    const deck = [];
    RANKS.forEach(r => SUITS.forEach(s => { const c = `${r}${s.code}`; if (!heroOnly.includes(c)) deck.push(c); }));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    setBoard({ flop: deck.slice(0, 3), turn: null, river: null });
    setShowDeck(false);
    setDeckTarget(null);
    playCardDeal();
  }, [heroHand.card1, heroHand.card2, pushUndo, playCardDeal]);

  /** Deals the next street. Returns the NEW board (state updates are async). */
  const dealNextStreet = useCallback(() => {
    const deck = freeDeck();
    if (!deck.length) return null;
    const cardStr = deck[Math.floor(Math.random() * deck.length)];
    let newBoard = null;
    if (board.flop.length === 3 && !board.turn) newBoard = { ...board, turn: cardStr };
    else if (board.turn && !board.river) newBoard = { ...board, river: cardStr };
    if (!newBoard) return null;
    pushUndo();
    setBoard(newBoard);
    playCardDeal();
    toast((t) => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: F.bodySm }}>
        Dealt {cardStr}
        <button
          type="button" className="pa-btn"
          onClick={() => { popUndo(); toast.dismiss(t.id); }}
          style={{ ...btn('secondary'), padding: '0 14px', fontSize: F.label, flexShrink: 0 }}
        >Undo</button>
      </span>
    ), { duration: 3200 });
    return newBoard;
  }, [board, freeDeck, pushUndo, popUndo, playCardDeal]);

  /**
   * Archive the current street's analysis, deal the next card, and let the
   * villain lead/check into the new street.
   * Texture is recomputed from the NEW board — the old code passed the stale
   * pre-deal memo, so the villain modelled the wrong texture every time.
   */
  const dealAndAnalyze = useCallback(() => {
    if (handOver) { toast('The hand is over — start the next one'); return null; }
    if (results || resultsOverride) {
      const archived = {
        street: currentStreet,
        board: { ...board, flop: [...board.flop] },
        results: resultsOverride || results,
        equity: equity?.heroEquity ?? null,
        isCorrect: coachUserPickRef.current
          ? gradeAction(coachUserPickRef.current, (resultsOverride || results)?.optimalAction?.label)
          : null,
      };
      const nextHistory = [...streetHistoryRef.current, archived];
      streetHistoryRef.current = nextHistory;
      setStreetHistory(nextHistory);
      setActiveStreet(nextHistory.length);
    }
    const newBoard = dealNextStreet();
    if (newBoard && villains[0]) {
      const newTexture = classifyBoardTexture(newBoard);
      const lead = simulateVillainAction(villains[0], null, newTexture, streetOfBoard(newBoard));
      if (lead) {
        setActionHistory(prev => [...prev, lead]);
        toast(`${lead.position} ${lead.label}`, { duration: 1800 });
      }
    }
    return newBoard;
  }, [handOver, results, resultsOverride, currentStreet, board, equity, dealNextStreet, villains]);

  // __PUBLISH_HDR__
  // ACTION LINE — the villain now answers EVERY hero action (the old code only
  // fired when the builder's position dropdown happened to equal heroPosition)
  // __PUBLISH_HDR__
  const addAction = useCallback((a) => {
    if (handOver) return;
    playChipClick();
    const entry = { ...a, street: a?.street || currentStreet };
    const withEntry = [...actionHistory, entry];
    let final = withEntry;

    if (entry.isHero && villains[0]) {
      const after = computeHandState({
        basePot: Number(potBase) || 1.5, actions: withEntry, heroPosition,
        heroStack: Number(heroStack) || 100, villainStack: Number(villains[0]?.stack) || 100,
        street: currentStreet,
      });
      if (!after.terminal && after.toAct === 'villain') {
        const response = simulateVillainAction(villains[0], entry, boardTexture, currentStreet);
        if (response) {
          final = [...withEntry, response];
          playCardDeal();
          try { navigator.vibrate?.(12); } catch (e) { /* unsupported */ }
          toast(`${response.position} ${response.label}`, { duration: 1800 });
        }
      }
    }
    setActionHistory(final);
  }, [handOver, actionHistory, currentStreet, villains, potBase, heroPosition, heroStack, boardTexture, playChipClick, playCardDeal]);

  const removeAction = useCallback((i) => {
    setActionHistory(prev => prev.filter((_, j) => j !== i));
  }, []);

  // __PUBLISH_HDR__
  // VILLAIN CONTROLS (multiway)
  // __PUBLISH_HDR__
  const patchVillain = useCallback((idx, patch, recomputeRange = false) => {
    setVillains(prev => prev.map((v, i) => {
      if (i !== idx) return v;
      const next = { ...v, ...patch };
      if (recomputeRange) {
        const archId = next.archetype?.id || 'gto_neutral';
        next.range = getArchetypeRangeString(archId, next.position || 'BB');
        next.vpip = getArchetypeVPIP(archId, next.position || 'BB');
        next.customRange = false;
      }
      return next;
    }));
  }, []);

  const handleVillainArchetypeChange = useCallback((idx, archetypeId) => {
    const info = getArchetypeInfo(archetypeId) || {};
    setVillains(prev => prev.map((v, i) => {
      if (i !== idx) return v;
      const pos = v.position || 'BB';
      return {
        ...v,
        archetype: { id: archetypeId, name: info.name || archetypeId },
        range: getArchetypeRangeString(archetypeId, pos),
        vpip: getArchetypeVPIP(archetypeId, pos),
        customRange: false,
      };
    }));
  }, []);

  const addVillain = useCallback(() => {
    setVillains(prev => {
      if (prev.length >= MAX_VILLAINS) return prev;
      const taken = new Set([heroPosition, ...prev.map(v => v.position)]);
      const seat = POSITIONS.find(p => !taken.has(p)) || 'BB';
      const nextId = prev.reduce((m, v) => Math.max(m, Number(v.id) || 0), -1) + 1;
      return [...prev, {
        id: nextId, position: seat,
        archetype: { id: 'gto_neutral', name: 'GTO Neutral' },
        stack: Number(heroStack) || 100,
        range: getArchetypeRangeString('gto_neutral', seat),
        vpip: getArchetypeVPIP('gto_neutral', seat),
      }];
    });
  }, [heroPosition, heroStack]);

  const removeVillain = useCallback((idx) => {
    setVillains(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  const changeFeltColor = useCallback((color) => {
    setTableFelt(color);
    safeLocal.set('sandbox-felt', color);
    saveAppSetting('sandbox_felt', color, 'sandbox-felt');
  }, []);

  const toggleCoachMode = useCallback(() => {
    setCoachMode(prev => {
      const next = !prev;
      safeLocal.set('sandbox-coach-mode', String(next));
      saveAppSetting('sandbox_coach_mode', next, 'sandbox-coach-mode');
      return next;
    });
  }, []);

  // __PUBLISH_HDR__
  // ANALYSIS
  // __PUBLISH_HDR__
  const sandboxSnapshot = useMemo(() => ({
    board, heroHand, heroPosition,
    heroStack: Number(heroStack) || 100,
    effStack: Number(heroStack) || 100,
    gameType, villains,
    potSize: Number(potSize) || 1.5,
    actionHistory,
  }), [board, heroHand, heroPosition, heroStack, gameType, villains, potSize, actionHistory]);

  const buildAnalyzePayload = useCallback((positionOverride = null, boardOverride = null, resolvedPick = null) => {
    const effBoard = boardOverride || board;
    const effActions = liveStateRef.current?.actionHistory || actionHistory;
    const villainArcId = villains[0]?.archetype?.id || 'gto_neutral';
    const villainPos = villains[0]?.position || 'BB';
    const nodeLock = villains[0]?.nodeLock && villains[0].nodeLock !== 'None' ? villains[0].nodeLock : undefined;
    return {
      heroHand,
      heroPosition: positionOverride || heroPosition,
      heroStack: Number(heroStack) || 100,
      gameType, villains,
      board: effBoard,
      potSize: Number(potSize) || 1.5,
      actionHistory: effActions,
      betSizing: 'standard',
      exploitMode,
      villainArchetype: villainArcId,
      bubbleFactor: gameType === 'tournament' ? bubbleFactor : undefined,
      villainRange: villains[0]?.range || getArchetypeRangeString(villainArcId, villainPos),
      nodeLock,
      socratic: coachMode && resolvedPick ? { userPick: resolvedPick } : undefined,
    };
  }, [board, actionHistory, villains, heroHand, heroPosition, heroStack, gameType, potSize, exploitMode, bubbleFactor, coachMode]);

  const runAnalysis = useCallback(async (skipCoach = false, pickedAction = null, boardOverride = null) => {
    if (!guardAction(() => { })) return;
    if (!heroHand.card1 || !heroHand.card2) { toast('Pick your two hole cards first'); return; }
    if (handOver) { toast('This hand is complete — deal the next one'); return; }

    if (coachMode && !skipCoach && !coachUserPick && !pickedAction) {
      try { navigator.vibrate?.(20); } catch (e) { /* unsupported */ }
      setShowResults(false); // the picker must never open behind the results sheet
      setShowCoachPicker(true);
      return;
    }
    try { navigator.vibrate?.(10); } catch (e) { /* unsupported */ }

    const resolvedPick = pickedAction || coachUserPick;
    const effBoard = boardOverride || pendingBoard || board;
    setPendingBoard(null);
    setResultsOverride(null);

    const data = await analyze(buildAnalyzePayload(null, effBoard, resolvedPick));

    // Offline / server-error fallback — a badged local estimate instead of a
    // red box, so the tool still teaches something with no connection.
    if (!data?.success) {
      const fallback = localSolve({
        heroHand, heroPosition, board: effBoard, handState,
        texture: classifyBoardTexture(effBoard),
        equityPct: equity?.heroEquity, preflopScenario,
      });
      setResultsOverride(fallback);
      toast('Offline estimate — reconnect for solver data', { duration: 3200 });
    }

    setShowResults(true);
    setActiveStreet(streetHistoryRef.current.length);
    playAnalysisDing();

    const snapStreet = streetOfBoard(effBoard);
    if (data?.success) logAnalytics(data, resolvedPick, snapStreet);

    const snapEquity = equity?.heroEquity ?? null;
    const snapHand = `${heroHand.card1}${heroHand.card2}`;
    const snapBoard = boardToArray(effBoard).join(' ');

    setSessionLog(prev => {
      const next = [...prev, {
        id: Date.now(),
        createdAt: new Date().toISOString(),
        // Explicit provenance — SessionReport scopes "this session" on
        // sessionStartedAt and HandReplay labels rows on `source`.
        source: 'live',
        sessionStartedAt: sessionStartedAtRef.current,
        hand: snapHand,
        position: heroPosition,
        street: snapStreet,
        board: snapBoard,
        equity: snapEquity,
        optimalAction: null,
        isCorrect: null,
        evDelta: null,
        userPick: resolvedPick || null,
      }];
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sandbox-session-log-updated', { detail: { count: next.length } }));
        window.dispatchEvent(new CustomEvent('pa-sandbox-updated', { detail: { type: 'analysis' } }));
      }
      return next;
    });

    (async () => {
      try {
        const accessToken = getAccessToken();
        if (accessToken && snapEquity !== null) {
          await fetch('/api/sandbox/equity-snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              heroHand: snapHand,
              villainRange: villainRangeStr || null,
              street: snapStreet,
              equityPct: typeof snapEquity === 'number' ? snapEquity : null,
              boardCards: snapBoard || null,
            }),
          });
        }
      } catch (e) { console.warn('[Sandbox] equity snapshot failed:', e?.message || e); }
    })();
  }, [guardAction, heroHand, handOver, coachMode, coachUserPick, pendingBoard, board, analyze,
    buildAnalyzePayload, handState, equity, preflopScenario, heroPosition, playAnalysisDing,
    logAnalytics, villainRangeStr]);

  // ── Coach verdict: fills the session-log entry, streak, tilt feed and SRS ──
  // Shared by the solver path AND the offline-estimate path so coaching never
  // silently stops working when the network does.
  const gradeAnalysis = useCallback((res) => {
    if (!res?.optimalAction?.label) return;
    const gtoLabel = res.optimalAction.label;
    const currentPick = coachUserPickRef.current;
    const hasPick = !!currentPick;
    const isCorrect = hasPick ? gradeAction(currentPick, gtoLabel) : null;

    // Real per-action EV when the solver exposes one. When it does not, we do
    // NOT invent a number — the UI says the impact is unavailable instead.
    const gtoEV = Number(res.ev?.hero) || 0;
    const picked = hasPick ? (res.actions || []).find(a => gradeAction(a.label || a.id, currentPick)) : null;
    const pickedEV = picked && typeof picked.ev === 'number' ? picked.ev : null;
    let delta = null;
    let estimated = false;
    if (hasPick) {
      if (pickedEV != null && gtoEV !== 0) delta = parseFloat((pickedEV - gtoEV).toFixed(3));
      else estimated = true;
    }

    setSessionLog(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && !last.optimalAction) {
        updated[updated.length - 1] = {
          ...last,
          optimalAction: gtoLabel,
          isCorrect: hasPick ? isCorrect : (last.isCorrect ?? null),
          evDelta: hasPick ? delta : (last.evDelta ?? null),
          evDeltaEstimated: hasPick ? estimated : false,
          userPick: hasPick ? currentPick : (last.userPick ?? null),
        };
      }
      return updated;
    });

    if (!hasPick) return;

    setCoachEvDelta(delta);
    setCoachEvEstimated(estimated);

    if (isCorrect) {
      const newStreak = coachStreakRef.current + 1;
      coachStreakRef.current = newStreak;
      setCoachStreak(newStreak);
      if ([5, 10, 25].includes(newStreak)) {
        try { navigator.vibrate?.([50, 30, 50, 30, 100]); } catch (e) { /* unsupported */ }
        if (!reduceMotion) {
          import('canvas-confetti')
            .then(mod => mod.default?.({ particleCount: 90, spread: 70, origin: { y: 0.7 }, disableForReducedMotion: true }))
            .catch(() => { });
        }
        toast.success(`${newStreak} in a row`);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sandbox-coach-streak-milestone', { detail: { streak: newStreak } }));
        }
      }
    } else {
      coachStreakRef.current = 0;
      setCoachStreak(0);
    }

    const snapBoardFull = boardToArray(board).join(' ');
    const handLabel = `${heroHand?.card1 || ''}${heroHand?.card2 || ''}`;
    setRecentResults(prev => [...prev.slice(-9), {
      isCorrect, evDelta: delta, evDeltaEstimated: estimated, hand: handLabel,
      position: heroPosition, street: currentStreet, userPick: currentPick,
      optimalAction: gtoLabel, board: snapBoardFull,
    }]);

    // Spaced repetition: a miss schedules the exact spot for review.
    scheduleReview({
      key: `${handKeyOf(heroHand) || handLabel}|${heroPosition}|${currentStreet}|${snapBoardFull}`,
      hand: handLabel, position: heroPosition, street: currentStreet,
      board: snapBoardFull, gtoAction: gtoLabel,
      heroHand: { ...heroHand },
    }, !!isCorrect);

    // Offline estimates are never worth a server row.
    if (res.offline) return;
    (async () => {
      try {
        const accessToken = getAccessToken();
        if (!accessToken) return;
        // Exact verdict↔hand link for the archived Hand Replay. This must be the
        // sandbox_sessions row id that /api/assistant/sandbox/analyze created for
        // THIS analysis and nothing else — a stand-in id would make the server
        // attribute this verdict to someone else's hand, which is worse than the
        // "not coached" it replaces. analyze returns it as `sessionId`; it is
        // null for guests, cached responses and failed writes, in which case the
        // key is omitted and the server keeps using its spot+time fallback.
        const claimedSessionId = res?.sessionId;
        const normalizedSessionId = typeof claimedSessionId === 'number' && Number.isSafeInteger(claimedSessionId) && claimedSessionId > 0
          ? String(claimedSessionId)
          : (typeof claimedSessionId === 'string' ? claimedSessionId.trim() : '');
        const sessionId = /^[A-Za-z0-9_-]{1,64}$/.test(normalizedSessionId)
          ? normalizedSessionId
          : null;
        await fetch('/api/sandbox/coach-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            hand: handLabel, position: heroPosition, street: currentStreet, board: snapBoardFull,
            userPick: currentPick, gtoAction: gtoLabel, isCorrect, evDelta: delta,
            evDeltaEstimated: estimated,
            ...(sessionId ? { sessionId } : {}),
          }),
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sandbox-coach-result-saved', { detail: { isCorrect, evDelta: delta } }));
        }
      } catch (e) { console.warn('[Sandbox] coach result post failed:', e?.message || e); }
    })();
  }, [board, heroHand, heroPosition, currentStreet, reduceMotion, scheduleReview]);

  const gradeAnalysisRef = useRef(gradeAnalysis);
  useEffect(() => { gradeAnalysisRef.current = gradeAnalysis; }, [gradeAnalysis]);

  // Solver results. A position comparison must NOT re-grade (it used to
  // double-count the streak and POST a duplicate coach-result row).
  useEffect(() => {
    if (!results) return;
    if (suppressCoachEffectRef.current) { suppressCoachEffectRef.current = false; return; }
    gradeAnalysisRef.current?.(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  // Close the node-lock EV comparison once a fresh solve lands.
  useEffect(() => {
    const evNow = Number(results?.ev?.hero);
    if (!Number.isFinite(evNow)) return;
    setLockEvPreview(prev => (prev && prev.after == null ? { ...prev, after: evNow } : prev));
  }, [results]);

  // Offline-estimate results
  const gradedOverrideRef = useRef(null);
  useEffect(() => {
    if (!resultsOverride?.offline) return;
    if (gradedOverrideRef.current === resultsOverride) return;
    gradedOverrideRef.current = resultsOverride;
    gradeAnalysisRef.current?.(resultsOverride);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsOverride]);
  // Broadcast to other PA pages when a NEW analysis lands
  const busSnapshotRef = useRef({});
  useEffect(() => { busSnapshotRef.current = { heroPosition, heroHand, equity, quizScore }; });
  useEffect(() => {
    if (!results || typeof window === 'undefined') return;
    const snap = busSnapshotRef.current;
    window.dispatchEvent(new CustomEvent('pa-sandbox-updated', {
      detail: {
        heroPosition: snap.heroPosition,
        heroHand: `${snap.heroHand?.card1 || ''}${snap.heroHand?.card2 || ''}`,
        results: true,
        equity: snap.equity?.heroEquity || null,
        quizAccuracy: snap.quizScore?.total > 0 ? Math.round(snap.quizScore.correct / snap.quizScore.total * 100) : null,
      },
    }));
  }, [results]);

  const handleCoachPick = useCallback((action) => {
    setCoachUserPick(action);
    coachUserPickRef.current = action;
    setShowCoachPicker(false);
    runAnalysis(true, action, pendingBoard);
  }, [runAnalysis, pendingBoard]);

  const handleCoachSkip = useCallback(() => {
    setCoachUserPick(null);
    coachUserPickRef.current = null;
    setShowCoachPicker(false);
    runAnalysis(true, null, pendingBoard);
  }, [runAnalysis, pendingBoard]);

  // Deal the next street and ASK FOR A DECISION on it. The old code passed
  // skipCoach=true, so coaching silently stopped after the flop.
  const dealAndCoach = useCallback(() => {
    const newBoard = dealAndAnalyze();
    if (!newBoard) return;
    setCoachUserPick(null);
    coachUserPickRef.current = null;
    setPendingBoard(newBoard);
    setShowResults(false);
    if (coachMode) setShowCoachPicker(true);
    else setTimeout(() => runAnalysis(true, null, newBoard), 200);
  }, [dealAndAnalyze, coachMode, runAnalysis]);

  useEffect(() => {
    setCoachUserPick(null);
    setCoachEvDelta(null);
    setCoachEvEstimated(false);
  }, [heroHand.card1, heroHand.card2, heroPosition, board.flop.length]);

  // __PUBLISH_HDR__
  // QUIZ — graded against the curated answer when a weekly spot is loaded
  // __PUBLISH_HDR__
  const handleQuizGuess = useCallback((guess) => {
    setUserGuess(guess);
    setQuizRevealed(true);
    const displayed = resultsOverride || results;
    const correctLabel = activeSpot?.correct_action || displayed?.optimalAction?.label || '';
    const isCorrect = correctLabel.length > 0 && gradeAction(guess, correctLabel);
    setQuizScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));

    const boardStr = boardToArray(board).join(' ');
    scheduleReview({
      key: `${handKeyOf(heroHand) || 'hand'}|${heroPosition}|${currentStreet}|${boardStr}`,
      hand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
      position: heroPosition, street: currentStreet, board: boardStr,
      gtoAction: correctLabel, heroHand: { ...heroHand },
    }, isCorrect);

    try {
      const token = getAccessToken();
      if (!token) return;
      const hash = activeSpot?.id
        || `${heroHand.card1}${heroHand.card2}_${heroPosition}_${board.flop.join('')}${board.turn || ''}${board.river || ''}`;
      fetch('/api/assistant/sandbox/sandbox-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scenarioHash: hash, userAction: guess, correctAction: correctLabel, isCorrect, spotId: activeSpot?.id || null }),
      }).catch(e => console.warn('[Sandbox] quiz post failed:', e?.message || e));
    } catch (e) { console.warn('[Sandbox] quiz error:', e?.message || e); }
  }, [resultsOverride, results, activeSpot, board, heroHand, heroPosition, currentStreet, scheduleReview]);

  // __PUBLISH_HDR__
  // POSITION COMPARISON — must not re-fire the coach effect (it used to
  // double-count the streak and POST a duplicate coach-result row)
  // __PUBLISH_HDR__

  // The suppression flag is consumed by the `results` effect, which only runs
  // when `analyze` actually succeeds. A failed request leaves `results`
  // untouched, so the flag has to be released here or it silently swallows the
  // coach grading of the user's NEXT successful analysis.
  const analyzeWithoutCoach = useCallback(async (payload) => {
    suppressCoachEffectRef.current = true;
    let ok = false;
    try {
      const data = await analyze(payload);
      ok = !!data?.success;
      return data;
    } finally {
      if (!ok) suppressCoachEffectRef.current = false;
    }
  }, [analyze]);

  const runPositionComparison = useCallback(async (pos) => {
    if (!comparePosition) primaryResultsRef.current = resultsOverride || results;
    setComparePosition(pos);
    setResultsOverride(null);
    const data = await analyzeWithoutCoach(buildAnalyzePayload(pos));
    if (!data?.success) toast.error('Could not compare that position — try again');
  }, [comparePosition, resultsOverride, results, analyzeWithoutCoach, buildAnalyzePayload]);

  const restorePrimaryResults = useCallback(async () => {
    setComparePosition(null);
    if (primaryResultsRef.current) {
      setResultsOverride(primaryResultsRef.current);
      primaryResultsRef.current = null;
      return;
    }
    await analyzeWithoutCoach(buildAnalyzePayload());
  }, [analyzeWithoutCoach, buildAnalyzePayload]);

  // __PUBLISH_HDR__
  // HAND PLAYOUT — terminal states, a result banner, and Next Hand
  // __PUBLISH_HDR__
  const handResult = useMemo(() => {
    if (!handState.terminal) return null;
    const invested = handState.invested?.hero || 0;
    if (handState.terminal === 'fold') {
      const heroWon = handState.winner === 'hero';
      return {
        heroWon,
        bb: heroWon ? (handState.pot - invested) : -invested,
        headline: heroWon ? 'Villain folded' : 'You folded',
        detail: heroWon
          ? `You take ${handState.pot.toFixed(1)} BB without showdown.`
          : `You give up ${invested.toFixed(1)} BB already invested.`,
        exact: true,
      };
    }
    const eq = Number(equity?.heroEquity);
    if (!Number.isFinite(eq)) {
      return { heroWon: null, bb: null, headline: 'All-in', detail: 'Set both hole cards to see the expected result.', exact: false };
    }
    const ev = (handState.pot * (eq / 100)) - invested;
    return {
      heroWon: ev >= 0,
      bb: ev,
      headline: 'All-in',
      detail: `${eq.toFixed(1)}% equity ${equityLabel} in a ${handState.pot.toFixed(1)} BB pot.`,
      exact: boardToArray(board).length === 5,
    };
  }, [handState, equity, equityLabel, board]);

  const runItOut = useCallback(() => {
    if (board.flop.length < 3) { randomBoard(); return; }
    const deck = freeDeck();
    let i = 0;
    const next = { ...board, flop: [...board.flop] };
    if (!next.turn && deck[i]) next.turn = deck[i++];
    if (!next.river && deck[i]) next.river = deck[i++];
    if (next.turn === board.turn && next.river === board.river) return;
    pushUndo();
    setBoard(next);
    playCardDeal();
  }, [board, freeDeck, pushUndo, playCardDeal, randomBoard]);

  const nextHand = useCallback((dealRandom = false) => {
    // The session log, quiz score and streak deliberately survive.
    if (handResult && handResult.bb != null) {
      setSessionLog(prev => {
        if (prev.length === 0) return prev;
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          resultBB: Math.round(handResult.bb * 10) / 10,
          resultExact: handResult.exact,
        };
        return updated;
      });
      if (handResult.heroWon && !reduceMotion) {
        import('canvas-confetti')
          .then(mod => mod.default?.({ particleCount: 60, spread: 60, origin: { y: 0.75 }, disableForReducedMotion: true }))
          .catch(() => { });
      }
    }
    pushUndo();
    setActionHistory([]);
    setPotBase(1.5);
    setBoard({ flop: [], turn: null, river: null });
    setHeroHand({ card1: null, card2: null });
    setReplayIndex(null);
    setCoachUserPick(null);
    coachUserPickRef.current = null;
    setQuizRevealed(false);
    setUserGuess(null);
    setActiveSpot(null);
    clearResults();
    setResultsOverride(null);
    setShowResults(false);
    streetHistoryRef.current = [];
    setStreetHistory([]);
    setActiveStreet(0);
    if (dealRandom) {
      const deck = [];
      RANKS.forEach(r => SUITS.forEach(s => deck.push(`${r}${s.code}`)));
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      setHeroHand({ card1: deck[0], card2: deck[1] });
      setBoard({ flop: deck.slice(2, 5), turn: null, river: null });
      playCardDeal();
    }
  }, [handResult, reduceMotion, pushUndo, clearResults, playCardDeal]);

  // __PUBLISH_HDR__
  // RESET — two-tap confirm in-page (window.confirm is blocked in several
  // in-app browsers, and the felt button used to reset with no confirmation)
  // __PUBLISH_HDR__
  const resetAll = useCallback(() => {
    setHeroHand({ card1: null, card2: null });
    setBoard({ flop: [], turn: null, river: null });
    setActionHistory([]);
    setPotBase(1.5);
    clearResults();
    setResultsOverride(null);
    primaryResultsRef.current = null;
    setShowResults(false);
    setComparePosition(null);
    streetHistoryRef.current = [];
    setStreetHistory([]);
    setActiveStreet(0);
    setEquity(null);
    setRunoutData(null);
    undoStackRef.current = [];
    setQuizMode(false); setUserGuess(null); setQuizRevealed(false); setActiveSpot(null);
    setExploitMode('gto'); setPreflopScenario('rfi');
    setBubbleFactor(1.0);
    setReplayIndex(null);
    setCoachUserPick(null); coachUserPickRef.current = null;
    setCoachEvDelta(null); setCoachEvEstimated(false);
    setShowShareHand(false);
    setShowSessionLog(false);
  }, [clearResults]);

  useEffect(() => () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); }, []);

  const confirmReset = useCallback(() => {
    const hasWork = !!(results || resultsOverride || actionHistory.length > 0 || heroHand.card1 || board.flop.length);
    if (!hasWork) { resetAll(); return; }
    if (resetArmed) {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      setResetArmed(false);
      resetAll();
      toast.success('Scenario reset');
      return;
    }
    setResetArmed(true);
    try { navigator.vibrate?.(20); } catch (e) { /* unsupported */ }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => { resetTimerRef.current = null; setResetArmed(false); }, 3500);
    toast('Tap reset again to clear the whole scenario', { duration: 3000 });
  }, [results, resultsOverride, actionHistory.length, heroHand.card1, board.flop.length, resetArmed, resetAll]);

  // __PUBLISH_HDR__
  // BOOKMARKS
  // __PUBLISH_HDR__
  const saveBookmarkLocally = useCallback((payload) => {
    if (!payload || typeof window === 'undefined') return false;
    try {
      const stored = JSON.parse(safeLocal.get('sandbox_bookmarks', '[]'));
      safeLocal.set('sandbox_bookmarks', JSON.stringify([payload, ...(Array.isArray(stored) ? stored : [])].slice(0, 100)));
      return true;
    } catch (e) { return false; }
  }, []);

  const saveBookmark = useCallback(async () => {
    let payload = null;
    try {
      const user = getAuthUser();
      setSaveStatus('saving');
      payload = {
        user_id: user?.id || null,
        hero_hand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
        hero_position: heroPosition, hero_stack: heroStack, game_type: gameType,
        board_flop: board.flop.join(''), board_turn: board.turn, board_river: board.river,
        villains: JSON.stringify(villains), action_history: JSON.stringify(actionHistory),
        pot_size_bb: potSize,
        label: `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'} on ${board.flop.join('') || 'preflop'}`,
        created_at: new Date().toISOString(),
      };
      if (!user) { setSaveStatus(saveBookmarkLocally(payload) ? 'saved' : 'error'); return; }
      const { error: dbError } = await supabase.from('sandbox_bookmarks').insert(payload);
      if (dbError) {
        console.warn('[Sandbox] Bookmark save error (table may not exist yet):', dbError.message);
        setSaveStatus(saveBookmarkLocally(payload) ? 'saved' : 'error');
      } else {
        setSaveStatus('saved');
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pa-data-updated'));
      }
    } catch (err) {
      console.warn('[Sandbox] Sync error (caching offline):', err?.message || err);
      setSaveStatus(payload && saveBookmarkLocally(payload) ? 'saved' : 'error');
    } finally {
      setTimeout(() => setSaveStatus(null), 2000);
    }
  }, [heroHand, heroPosition, heroStack, gameType, board, villains, actionHistory, potSize, saveBookmarkLocally]);

  const loadSessionEntry = useCallback((entry) => {
    if (!entry) return;
    const cards = String(entry.board || '').split(' ').filter(Boolean);
    restoreScenario({
// __PUBLISH_PLACEHOLDER_C__
