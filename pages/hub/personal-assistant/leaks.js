    if (!isDetecting) { setDetectStep(0); setDetectSlow(false); return undefined; }
    const stepTimer = setInterval(() => setDetectStep(s => (s + 1) % DETECT_STEPS.length), 3500);
    const slowTimer = setTimeout(() => setDetectSlow(true), 25000);
    return () => { clearInterval(stepTimer); clearTimeout(slowTimer); };
  }, [isDetecting]);

  // Auto-clear non-error banners so a stale result cannot outlive its context
  useEffect(() => {
    if (!detectionSummary || detectionSummary.type === 'error') return undefined;
    const t = setTimeout(() => setDetectionSummary(null), 12000);
    return () => clearTimeout(t);
  }, [detectionSummary]);

  const handleRunDetection = useCallback(async () => {
    setDetectionSummary(null);
    let result;
    try {
      result = await runDetection();
    } catch (e) {
      setDetectionSummary({ type: 'error', text: friendlyDetectionError(e?.message || e) });
      return;
    }
    if (result?.success) {
      if (result.message) {
        setDetectionSummary({ type: 'info', text: result.message });
        return;
      }
      const found = result.leaksDetected ?? 0;
      if (result.persisted === false) {
        setDetectionSummary({
          type: 'error',
          text: `Found ${found} leak${found === 1 ? '' : 's'} but could not save them. Please try again.`,
        });
        return;
      }
      setDetectionSummary({
        type: 'success',
        text: `Analysed ${num(result.handsAnalyzed).toLocaleString()} hands · ${found} leak${found === 1 ? '' : 's'} found.`,
      });
    } else {
      setDetectionSummary({ type: 'error', text: friendlyDetectionError(result?.error) });
    }
  }, [runDetection]);

  const celebrate = useCallback(async () => {
    if (reduceMotion) return;
    try {
      const mod = await import('canvas-confetti');
      const confetti = mod?.default || mod;
      confetti({ particleCount: 60, spread: 65, startVelocity: 32, origin: { y: 0.75 }, disableForReducedMotion: true });
    } catch (e) {
      /* confetti is decorative — never fatal */
    }
  }, [reduceMotion]);

  const handleMarkResolved = useCallback(async (leak) => {
    if (!leak || isDemoLeakId(leak.id)) return;
    setResolvingLeakId(leak.id);
    try {
      const result = await updateLeakStatus(leak.id, 'resolved');
      if (result?.success) {
        toast.success('Leak marked as resolved');
        celebrate();
        setSelectedLeakId(null);
      } else {
        toast.error(result?.error || 'Could not update leak status');
      }
    } catch (e) {
      toast.error('Could not update leak status');
    } finally {
      setResolvingLeakId(null);
    }
  }, [updateLeakStatus, celebrate]);

  const handleReopen = useCallback(async (leak) => {
    if (!leak || isDemoLeakId(leak.id)) return;
    setResolvingLeakId(leak.id);
    try {
      const result = await updateLeakStatus(leak.id, 'persistent');
      if (result?.success) {
        toast.success('Leak reopened');
      } else {
        toast.error(result?.error || 'Could not reopen this leak');
      }
    } catch (e) {
      toast.error('Could not reopen this leak');
    } finally {
      setResolvingLeakId(null);
    }
  }, [updateLeakStatus]);

  const buildPracticeQuery = useCallback((leak) => {
    const q = {};
    if (leak?.id != null) q.leak = leak.id;
    const slug = leak?.leakType || slugFromTitle(leak?.title);
    if (slug) q.leakType = slug;
    if (leak?.recommendedDrill) q.drill = leak.recommendedDrill;
    else if (leak?.leakCategory) q.drill = leak.leakCategory;
    return q;
  }, []);

  const handlePracticeSandbox = useCallback((leak) => {
    if (!guardAction()) return;
    const target = leak || selectedLeak;
    if (!target) return;
    router.push({ pathname: '/hub/personal-assistant/sandbox', query: buildPracticeQuery(target) });
  }, [guardAction, router, selectedLeak, buildPracticeQuery]);

  /** One-tap drill-through into the exact spot the example hand recorded. */
  const handlePracticeExample = useCallback((leak, ex) => {
    if (!guardAction()) return;
    const snap = ex?.snapshot || {};
    const q = buildPracticeQuery(leak);

    const heroRaw = Array.isArray(snap.hero_cards)
      ? snap.hero_cards.join('')
      : (typeof snap.hero_cards === 'string' ? snap.hero_cards : '');
    const hero = String(heroRaw).replace(/[\s,]/g, '');
    if (hero.length >= 4) q.h = hero.slice(0, 4);

    const board = Array.isArray(snap.board)
      ? snap.board.filter(Boolean).join(',')
      : (typeof snap.board === 'string' ? snap.board : '');
    if (board) q.b = board;

    if (Number.isFinite(Number(snap.pot_size))) q.pot = Number(snap.pot_size);
    // Only fall back to the street when the leak has no named drill
    if (!q.drill && snap.street) q.drill = String(snap.street);

    router.push({ pathname: '/hub/personal-assistant/sandbox', query: q });
  }, [guardAction, router, buildPracticeQuery]);

  const handleTrainDrills = useCallback((leak) => {
    if (!guardAction()) return;
    const target = leak || selectedLeak;
    const q = { from: 'leaks' };
    const focus = target?.recommendedDrill || target?.leakType || slugFromTitle(target?.title);
    if (focus) q.focus = focus;
    if (target?.leakCategory) q.category = target.leakCategory;
    router.push({ pathname: '/hub/training', query: q });
  }, [guardAction, router, selectedLeak]);

  const handleShareLeak = useCallback(async (leak) => {
    if (!leak || typeof window === 'undefined') return;
    const url = `${window.location.origin}/hub/personal-assistant/leaks?leak=${encodeURIComponent(leak.id)}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
        return;
      }
    } catch (e) {
      /* fall through to the share sheet */
    }
    try {
      if (navigator?.share) {
        await navigator.share({ title: leak.title, url });
        return;
      }
    } catch (e) {
      /* user dismissed */
    }
    toast('Copy this link: ' + url);
  }, []);

  // ─── Spaced-repetition review queue ──────────────────────────────────────
  // Sources: the server schedule (authoritative) merged over the localStorage
  // fallback QuickSpotDrill writes when the API cannot persist. The queue and
  // the ordering come from src/lib/sandbox/leakReview — this page only renders.
  const [reviewNowMs, setReviewNowMs] = useState(0);
  const [reviewServerRecords, setReviewServerRecords] = useState([]);
  const [reviewLocalRecords, setReviewLocalRecords] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  // First load only — a background refresh after a drill must not flash the
  // whole card back to a skeleton.
  const [reviewLoaded, setReviewLoaded] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [reviewSession, setReviewSession] = useState(null);

  // A pinned clock: "due" must not be recomputed on every keystroke, but it
  // must not go stale on a phone left open either.
  useEffect(() => {
    setReviewNowMs(Date.now());
    const id = setInterval(() => setReviewNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const refreshLocalReviews = useCallback(() => {
    setReviewLocalRecords(readLocalReviewRecords());
  }, []);

  useEffect(() => { refreshLocalReviews(); }, [refreshLocalReviews]);

  const fetchReviewSchedule = useCallback(async () => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        // Signed out: the local fallback is the whole schedule. Not an error.
        setReviewServerRecords([]);
        return;
      }
      const res = await fetch('/api/assistant/leaks/review', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        setReviewError(`Review schedule unavailable (HTTP ${res.status})`);
        return;
      }
      const json = await res.json();
      if (json?.success) {
        setReviewServerRecords(Array.isArray(json.records) ? json.records : []);
      } else {
        setReviewError(json?.error || 'Review schedule unavailable');
      }
    } catch (e) {
      console.warn('[LeakFinder] review schedule failed:', e?.message || e);
      setReviewError('Review schedule unavailable');
    } finally {
      setReviewLoading(false);
      setReviewLoaded(true);
    }
  }, []);

  useEffect(() => { fetchReviewSchedule(); }, [fetchReviewSchedule, userId]);

  // A finished review updates both stores; re-read them rather than guessing.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onUpdated = () => {
      refreshLocalReviews();
      setReviewNowMs(Date.now());
      fetchReviewSchedule();
    };
    window.addEventListener('pa-leak-review-updated', onUpdated);
    return () => window.removeEventListener('pa-leak-review-updated', onUpdated);
  }, [refreshLocalReviews, fetchReviewSchedule]);

  // Server wins on every field it STATES; a local field survives only where the
  // account row is silent about it (the mastery columns are omitted entirely
  // until the migration lands, and adopting a zeroed streak from a row that
  // simply cannot hold one would reset mastery on every page load).
  const reviewRecords = useMemo(() => {
    const rawById = new Map();
    for (const raw of reviewLocalRecords) {
      const rec = migrateRecord(raw);
      if (rec && rec.leakId) rawById.set(String(rec.leakId), rec);
    }
    for (const raw of reviewServerRecords) {
      const mapped = fromServerReviewRecord(raw);
      if (!mapped) continue;
      const id = String(mapped.leakId ?? '');
      const rec = migrateRecord({ ...(rawById.get(id) || {}), ...definedOnly(mapped) });
      if (rec && rec.leakId) rawById.set(String(rec.leakId), rec);
    }
    return Array.from(rawById.values());
  }, [reviewLocalRecords, reviewServerRecords]);

  // Per-leak lookup for the progress-to-resolution surfaces (cards + detail).
  // Keyed by String(leakId) — the same normalisation the queue uses.
  const reviewRecordById = useMemo(() => {
    const map = new Map();
    for (const rec of reviewRecords) {
      if (rec && rec.leakId) map.set(String(rec.leakId), rec);
    }
    return map;
  }, [reviewRecords]);

  // Sample leaks are excluded: their schedule cannot be stored against an
  // account, and counting them would be a fake badge over data that is not yours.
  const reviewableLeaks = useMemo(
    () => (leaksAreDemo ? [] : activeLeaks.filter(l => !isDemoLeakId(l.id))),
    [activeLeaks, leaksAreDemo],
  );

  // The FULL ordered queue. The card renders a session's worth (MAX_QUEUE) but
  // needs the real total to say how much work exists without overstating it.
  const reviewQueueAll = useMemo(() => {
    if (!reviewNowMs) return [];
    try {
      return dueQueueAll(reviewRecords, reviewableLeaks, reviewNowMs) || [];
    } catch (e) {
      console.warn('[LeakFinder] review queue failed:', e?.message || e);
      return [];
    }
  }, [reviewRecords, reviewableLeaks, reviewNowMs]);

  const reviewQueue = useMemo(
    () => reviewQueueAll.slice(0, REVIEW_MAX_QUEUE),
    [reviewQueueAll],
  );

  // Stats are fed the SAME records the queue is fed. A row for a leak the user
  // has since resolved (or that is filtered out) would otherwise become
  // nextDueAt, and the caught-up card would promise a review for a leak that
  // can never appear in the queue.
  const reviewSummary = useMemo(() => {
    if (!reviewNowMs) return null;
    try {
      const ids = new Set(reviewableLeaks.map(l => String(l?.id ?? '')));
      const scoped = reviewRecords.filter(r => r && ids.has(String(r.leakId ?? '')));
      return reviewStats(scoped, reviewNowMs);
    } catch (e) {
      console.warn('[LeakFinder] review stats failed:', e?.message || e);
      return null;
    }
  }, [reviewRecords, reviewableLeaks, reviewNowMs]);

  const handleStartReview = useCallback((entry) => {
    if (!guardAction()) return;
    const target = entry || reviewQueue[0];
    if (!target || !target.leak) return;
    const params = target.drill || leakToDrill(target.leak);
    if (!params) {
      // No street can be inferred, so a drill would serve unrelated spots.
      // Fall back to the existing sandbox handoff instead of a dead end.
      handlePracticeSandbox(target.leak);
      return;
    }
    // The leak's CURRENT measured EV cost rides along so the review API can
    // diff it against the measurement stored at the previous review — that
    // delta (negative = the leak is costing less in real hands) is the
    // scheduler's corroborating evDelta signal. Measured by detection, not
    // estimated here.
    const evLossBB = Math.abs(num(target.leak.evLossBB));
    setReviewSession({
      leakId: String(target.leakId),
      params,
      evLossBB: Number.isFinite(evLossBB) && evLossBB > 0 ? evLossBB : null,
    });
  }, [guardAction, reviewQueue, handlePracticeSandbox]);

  const closeReviewSession = useCallback(() => {
    setReviewSession(null);
    refreshLocalReviews();
    setReviewNowMs(Date.now());
    fetchReviewSchedule();
  }, [refreshLocalReviews, fetchReviewSchedule]);

  // ─── Filter / sort / paginate ────────────────────────────────────────────
  const visibleLeaks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = activeLeaks;
    if (statusFilter !== 'all') list = list.filter(l => l.status === statusFilter);
    if (needle) {
      list = list.filter(l =>
        String(l.title || '').toLowerCase().includes(needle)
        || String(l.situationClass || '').toLowerCase().includes(needle));
    }
    const confRank = { high: 3, medium: 2, low: 1 };
    const sorted = [...list];
    if (sortMode === 'impact') {
      sorted.sort((a, b) => totalBleed(b) - totalBleed(a));
    } else if (sortMode === 'recent') {
      sorted.sort((a, b) => new Date(b.lastDetected || b.firstDetected || 0) - new Date(a.lastDetected || a.firstDetected || 0));
    } else {
      sorted.sort((a, b) => (confRank[b.confidence] || 0) - (confRank[a.confidence] || 0) || totalBleed(b) - totalBleed(a));
    }
    return sorted;
  }, [activeLeaks, statusFilter, query, sortMode]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [statusFilter, query, sortMode]);

  const shownLeaks = visibleLeaks.slice(0, visibleCount);
  const remaining = Math.max(0, visibleLeaks.length - shownLeaks.length);

  // ═══ HAMBURGER MENU ═══
  // Single-page surface, so the menu's "Views" rows switch tab and scroll to a
  // section. Every handler below has a real implementation — the config omits
  // any row whose handler is absent, so no dead rows can render.
  // The drawer closes on activation and locks body scroll while open, so the
  // scroll has to run after React has committed the close AND the tab switch.
  const jumpTo = useCallback((id) => {
    if (typeof window === 'undefined') return;
    const behavior = reduceMotion ? 'auto' : 'smooth';
    setTimeout(() => {
      const node = id ? document.getElementById(id) : null;
      if (node) node.scrollIntoView({ behavior, block: 'start' });
      else window.scrollTo({ top: 0, behavior });
    }, 160);
  }, [reduceMotion]);

  const menuHandlers = useMemo(() => ({
    onViewOverview: () => { setTab('leaks'); jumpTo(null); },
    onViewLeaks: () => { setTab('leaks'); jumpTo('leak-list'); },
    onViewAnalytics: () => { setTab('insights'); jumpTo('leak-insights'); },
    onRescan: () => { if (!isDetecting) handleRunDetection(); },
    onPracticeWorst: () => {
      const worst = visibleLeaks[0] || activeLeaks[0];
      if (!worst) { setTab('leaks'); jumpTo('leak-list'); return; }
      handlePracticeSandbox(worst);
    },
    // Toggles keep the drawer open, so this only changes state — no scroll.
    onToggleResolved: (next) => { setTab('leaks'); setPastOpen(!!next); },
  }), [jumpTo, isDetecting, handleRunDetection, visibleLeaks, activeLeaks, handlePracticeSandbox]);

  const menuConfig = useMemo(() => getMenuConfig('leaks', null, {
    leakCount: activeLeaks.length,
    isDetecting,
    showResolved: pastOpen,
  }, menuHandlers), [activeLeaks.length, isDetecting, pastOpen, menuHandlers]);

  // ═══ PRE-MOUNT: real chrome + skeletons, never a bare flash ═══
  if (!mounted) {
    return (
      <div style={styles.page}>
        <PAStyles />
        <div style={styles.shell} aria-busy="true">
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
            <Skeleton h={28} w="55%" />
            <div style={styles.statGrid}>
              {[0, 1, 2, 3].map(i => <Skeleton key={i} h={70} />)}
            </div>
            <Skeleton h={44} />
            {[0, 1, 2].map(i => <Skeleton key={i} h={132} />)}
          </div>
        </div>
      </div>
    );
  }

  const detectButton = (block = true) => (
    <button
      type="button"
      className="pa-btn"
      style={btn('primary', { block, disabled: isDetecting })}
      onClick={handleRunDetection}
      disabled={isDetecting}
    >
      <Activity size={18} strokeWidth={2} aria-hidden="true" />
      {isDetecting ? 'Analysing…' : 'Run Leak Detection'}
    </button>
  );

  return (
    <PageTransition>
      <SEOHead
        title="Leak Finder — Fix Your Game"
        description="Identify And Fix Leaks In Your Poker Game With AI-powered Analysis From Jarvis."
        canonical="/hub/personal-assistant/leaks"
      />

      <div className="leaks-page" style={styles.page}>
        <PAStyles />
        <UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(true)} />

        <HamburgerMenu
          isOpen={showMenu}
          onClose={() => setShowMenu(false)}
          direction="left"
          theme="pa"
          user={null}
          showProfile={false}
          menuItems={menuConfig.menuItems}
          bottomLinks={menuConfig.bottomLinks}
        />

        <main id="leak-finder-main" className="leaks-shell" style={styles.shell}>
          {/* ── Page header ── */}
          <header style={styles.pageHeader}>
            <div style={{ minWidth: 0 }}>
              <h1 style={styles.pageTitle}>Leak Finder</h1>
              <p style={styles.pageSub}>Post-session analysis — repeated, measurable EV leaks.</p>
            </div>
            <span style={styles.integrityBadge}>
              <Lock size={12} strokeWidth={2} aria-hidden="true" />
              Not Live Play — Post-Session Review Only
            </span>
          </header>

          {/* ── Sample-data disclosure ── */}
          {leaksAreDemo && !leaksLoading && (
            <section style={styles.demoBanner} aria-label="Sample data notice">
              <p style={styles.demoBannerText}>
                You are viewing sample data. Sign in and run detection to analyse your own hands.
              </p>
              <a className="pa-btn" href="/auth" style={{ ...btn('primary', { block: true }), textDecoration: 'none', minHeight: 48 }}>
                Sign in to analyse my hands
              </a>
            </section>
          )}

          {/* ── Stats ── */}
          <section style={styles.statGrid} aria-label="Summary statistics">
            <StatCell
              label="Sessions reviewed"
              value={statsLoading ? null : (statsAreDemo ? '—' : String(stats.sessionsReviewed))}
            />
            <StatCell
              label="Hands analysed"
              value={statsLoading ? null : (statsAreDemo ? '—' : stats.handsAnalyzed.toLocaleString())}
            />
            <StatCell
              label="Active leaks"
              value={leaksLoading ? null : (leaksAreDemo ? '—' : String(stats.leaksFound))}
            />
            <StatCell
              label="Avg EV loss"
              tone={T.danger}
              value={leaksLoading ? null : (stats.avgEvLoss && !statsAreDemo ? `${stats.avgEvLoss.toFixed(2)} BB` : '—')}
            />
            <StatCell
              label="GTO accuracy"
              icon={<GraduationCap size={14} strokeWidth={2} aria-hidden="true" />}
              value={coachLoading
                ? null
                : coachError
                  ? '—'
                  : (coachAccuracy && num(coachAccuracy.total_hands) > 0 ? `${coachAccuracy.accuracy_pct ?? '—'}%` : '—')}
              tone={coachAccuracy && num(coachAccuracy.accuracy_pct) >= 70
                ? T.success
                : coachAccuracy && num(coachAccuracy.accuracy_pct) >= 50 ? T.warn : T.text}
              hint={coachError ? 'Coach stats unavailable' : (coachAccuracy && num(coachAccuracy.total_hands) > 0 ? `${num(coachAccuracy.correct_count)} / ${num(coachAccuracy.total_hands)} coach hands` : 'No coach hands yet')}
              onRetry={coachError ? fetchCoachAccuracy : null}
            />
            {statsAreDemo && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={pill('warn')}>Sample stats — not your own data</span>
              </div>
            )}
          </section>

          {/* ── Tabs ── */}
          <div style={{ marginBottom: S.md }}>
            <Segmented
              idPrefix="leaks-tab"
              label="View"
              columns={2}
              value={tab}
              onChange={setTab}
              options={[
                { value: 'leaks', label: 'Leaks' },
                { value: 'insights', label: 'Insights' },
              ]}
            />
          </div>

          {tab === 'leaks' ? (
            <section id="leak-list" aria-label="Your leaks">
              {/* Due for review — the spaced-repetition entry point */}
              <LeakErrorBoundary label="The review queue">
                <ReviewQueueCard
                  loading={leaksLoading || !reviewNowMs || (reviewLoading && !reviewLoaded)}
                  error={reviewError}
                  onRetry={fetchReviewSchedule}
                  queue={reviewQueue}
                  queueTotal={reviewQueueAll.length}
                  stats={reviewSummary}
                  nowMs={reviewNowMs}
                  hasLeaks={reviewableLeaks.length > 0}
                  isDemo={leaksAreDemo}
                  isDetecting={isDetecting}
                  onStart={handleStartReview}
                  onOpenLeak={(l) => l && setSelectedLeakId(l.id)}
                />
              </LeakErrorBoundary>

              {/* Detection */}
              <div style={{ ...card, marginBottom: S.md }}>
                {detectButton(true)}
                {isDetecting && (
                  <div style={{ marginTop: S.md }} aria-live="polite">
                    <div className="leak-progress"><span /></div>
                    <p style={styles.detectStepText}>
                      {detectSlow
                        ? 'Detection is taking longer than expected — it will finish in the background.'
                        : DETECT_STEPS[detectStep]}
                    </p>
                  </div>
                )}
                {detectionSummary && (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      ...styles.detectionBanner,
                      borderColor: detectionSummary.type === 'error'
                        ? 'rgba(239,68,68,0.5)'
                        : detectionSummary.type === 'success' ? 'rgba(34,197,94,0.5)' : 'rgba(251,191,36,0.5)',
                      color: detectionSummary.type === 'error'
                        ? T.danger
                        : detectionSummary.type === 'success' ? T.success : T.warn,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>{detectionSummary.text}</span>
                    <button
                      type="button"
                      className="pa-btn"
                      aria-label="Dismiss detection message"
                      onClick={() => setDetectionSummary(null)}
                      style={iconBtn({ transparent: true, color: T.textMuted })}
                    >
                      <X size={18} strokeWidth={2} />
                    </button>
                  </div>
                )}
              </div>

              {/* Load error (never replaces the empty state / detect button) */}
              {leaksError && !leaksLoading && (
                <div style={{ marginBottom: S.md }}>
                  <ErrorState
                    title="Could not load your leaks"
                    body={friendlyLoadError(leaksError)}
                    onRetry={() => refetchLeaks()}
                  />
                </div>
              )}

              {leaksLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }} aria-busy="true">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="leak-skeleton" style={styles.skeletonCard} />
                  ))}
                </div>
              ) : activeLeaks.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                  <EmptyState
                    icon={<Inbox size={22} strokeWidth={2} />}
                    title="No leaks detected yet"
                    body="Run detection on your recent hands and the engine will rank every repeated, measurable EV leak."
                    action={detectButton(false)}
                  />
                  {(onboardingLeaks || []).length > 0 && (
                    <div>
                      <h2 style={styles.sectionHeading}>Example leaks (not yours)</h2>
                      <ul style={styles.leakList} role="list">
                        {onboardingLeaks.slice(0, 3).map(leak => (
                          <LeakCard
                            key={`demo-${leak.id}`}
                            leak={normaliseLeak(leak)}
                            demo
                            selected={String(selectedLeakId) === String(leak.id)}
                            onOpen={(l) => setSelectedLeakId(l.id)}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <LeakErrorBoundary label="The bleed summary">
                    <BleedSummary leaks={activeLeaks} isDemo={leaksAreDemo} />
                  </LeakErrorBoundary>

                  {/* Search + sort + filter */}
                  <div style={{ ...cardCompact, marginBottom: S.md, display: 'flex', flexDirection: 'column', gap: S.md }}>
                    <div style={styles.searchWrap}>
                      <Search size={18} strokeWidth={2} aria-hidden="true" style={{ color: T.textDim, flexShrink: 0 }} />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search leaks or situations"
                        aria-label="Search leaks"
                        style={styles.searchInput}
                      />
                      {query && (
                        <button
                          type="button"
                          className="pa-btn"
                          aria-label="Clear search"
                          onClick={() => setQuery('')}
                          style={iconBtn({ transparent: true, color: T.textMuted })}
                        >
                          <X size={18} strokeWidth={2} />
                        </button>
                      )}
                    </div>

                    <Segmented
                      idPrefix="leak-sort"
                      label="Sort by"
                      value={sortMode}
                      onChange={setSortMode}
                      options={[
                        { value: 'impact', label: 'Impact' },
                        { value: 'recent', label: 'Recent' },
                        { value: 'confidence', label: 'Confidence' },
                      ]}
                    />

                    <Segmented
                      idPrefix="leak-status"
                      label="Status"
                      tone="warn"
                      columns={2}
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'persistent', label: 'Persistent' },
                        { value: 'emerging', label: 'Emerging' },
                        { value: 'improving', label: 'Improving' },
                      ]}
                    />
                  </div>

                  {shownLeaks.length === 0 ? (
                    <EmptyState
                      compact
                      icon={<Search size={22} strokeWidth={2} />}
                      title="No matching leaks"
                      body="No leak matches this filter. Clear the search or switch back to All."
                      action={(
                        <button
                          type="button"
                          className="pa-btn"
                          style={btn('secondary')}
                          onClick={() => { setQuery(''); setStatusFilter('all'); }}
                        >
                          Reset filters
                        </button>
                      )}
                    />
                  ) : (
                    <>
                      <ul style={styles.leakList} role="list">
                        {shownLeaks.map(leak => (
                          <LeakCard
                            key={leak.id}
                            leak={leak}
                            demo={leaksAreDemo || isDemoLeakId(leak.id)}
                            selected={String(selectedLeakId) === String(leak.id)}
                            onOpen={(l) => setSelectedLeakId(l.id)}
                            onPractice={handlePracticeSandbox}
                            progress={(leaksAreDemo || isDemoLeakId(leak.id))
                              ? null
                              : resolutionProgress(reviewRecordById.get(String(leak.id)) || null)}
                          />
                        ))}
                      </ul>
                      {remaining > 0 && (
                        <button
                          type="button"
                          className="pa-btn"
                          style={{ ...btn('secondary', { block: true }), marginTop: S.md }}
                          onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                        >
                          Show {Math.min(PAGE_SIZE, remaining)} more ({remaining} left)
                        </button>
                      )}
                    </>
                  )}

                  {/* Past leaks — collapsed by default */}
                  {pastLeaks.length > 0 && (
                    <div style={{ marginTop: S.lg }}>
                      <button
                        type="button"
                        className="pa-btn"
                        aria-expanded={pastOpen}
                        onClick={() => setPastOpen(o => !o)}
                        style={styles.disclosureBtn}
                      >
                        <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>Past leaks ({pastLeaks.length})</span>
                        {pastOpen
                          ? <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
                          : <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />}
                      </button>
                      {pastOpen && (
                        <ul style={{ ...styles.leakList, marginTop: S.md }} role="list">
                          {pastLeaks.map(leak => (
                            <li key={leak.id} role="listitem" style={{ ...styles.leakCard, opacity: 0.86 }}>
                              <button
                                type="button"
                                className="leak-card pa-btn"
                                onClick={() => setSelectedLeakId(leak.id)}
                                style={styles.leakCardBody}
                                aria-label={`${leak.title}, resolved. Open details.`}
                              >
                                <span style={styles.leakCardHeader}>
                                  <span style={styles.leakCardTitle}>{leak.title}</span>
                                  <ChevronRight size={18} strokeWidth={2} aria-hidden="true" style={{ color: T.textMuted, flexShrink: 0 }} />
                                </span>
                                <span style={styles.leakCardBadges}>
                                  <LeakStatusBadge status="resolved" />
                                  {leak.sourceSystem && <SourceBadge source={leak.sourceSystem} />}
                                </span>
                                <span style={styles.leakCardSituation}>
                                  Situation: {leak.situationClass || 'Not specified'}
                                  {relativeDate(leak.resolvedAt) ? ` · Resolved ${relativeDate(leak.resolvedAt)}` : ''}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            <section id="leak-insights" aria-label="Insights">
              <h2 style={styles.sectionHeading}>
                <BarChart3 size={14} strokeWidth={2} aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />
                Session analytics
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                <LeakErrorBoundary label="Session analytics">
                  <SessionAnalytics userId={userId} />
                </LeakErrorBoundary>

                {/* Worst coach-mode spots */}
                <div style={card}>
                  <h3 style={styles.cardHeading}>Worst coach-mode spots</h3>
                  {coachLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }} aria-busy="true">
                      <Skeleton h={56} />
                      <Skeleton h={56} />
                    </div>
                  ) : coachError ? (
                    <ErrorState title="Coach stats unavailable" body={coachError} onRetry={fetchCoachAccuracy} />
                  ) : !Array.isArray(coachAccuracy?.topLeaks) || coachAccuracy.topLeaks.length === 0 ? (
                    <p style={styles.detailBody}>
                      No coach-mode mistakes recorded yet. Turn on coach mode in the sandbox and your worst spots appear here.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                      {coachAccuracy.topLeaks.map((spot, i) => (
                        <button
                          key={`${spot?.street || 'x'}-${i}`}
                          type="button"
                          className="leak-card pa-btn"
                          style={styles.exampleRow}
                          onClick={() => {
                            if (!guardAction()) return;
                            const q = { from: 'leaks' };
                            if (spot?.street) q.drill = String(spot.street);
                            if (spot?.board) {
                              const b = Array.isArray(spot.board) ? spot.board.filter(Boolean).join(',') : String(spot.board);
                              if (b) q.b = b;
                            }
                            router.push({ pathname: '/hub/personal-assistant/sandbox', query: q });
                          }}
                          aria-label={`Practice this coach-mode spot on ${fmtCards(spot?.board)}`}
                        >
                          <span style={styles.exampleLine1}>
                            <span style={styles.exampleCards}>{fmtCards(spot?.board)}</span>
                            <span style={{ ...styles.exampleEv, ...numeric }}>EV {num(spot?.ev_delta).toFixed(2)}</span>
                          </span>
                          <span style={styles.exampleLine2}>
                            <span style={pill('accent')}>{String(spot?.street || '?').toUpperCase()}</span>
                            <span style={styles.exampleBoard}>
                              You: {spot?.user_pick || '?'} · GTO: {spot?.gto_action || '?'}
                            </span>
                            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" style={{ color: T.textMuted, marginLeft: 'auto' }} />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <LeakErrorBoundary label="The leaderboard">
                  <CoachLeaderboard userId={userId} />
                </LeakErrorBoundary>

                <LeakErrorBoundary label="The macro leak detector">
                  <MacroLeakDetector />
                </LeakErrorBoundary>

                <LeakErrorBoundary label="The leak heatmap">
                  <LeakHeatmap userId={userId} />
                </LeakErrorBoundary>
              </div>
            </section>
          )}
        </main>

        {/* ── Review drill (the existing sandbox drill loop, not a second one) ── */}
        {reviewSession && (
          <LeakErrorBoundary
            label="The review drill"
            fallback={(err, reset) => (
              <PanelCrash label="The review drill" error={err} onRetry={() => { reset(); setReviewSession(null); }} />
            )}
          >
            <QuickSpotDrill
              customParams={reviewSession.params}
              reviewLeakId={reviewSession.leakId}
              reviewEvLossBB={reviewSession.evLossBB ?? null}
              onClose={closeReviewSession}
            />
          </LeakErrorBoundary>
        )}

        {/* ── Detail sheet ── */}
        <BottomSheet
          open={!!selectedLeak}
          onClose={() => setSelectedLeakId(null)}
          title={selectedLeak?.title || 'Leak'}
          subtitle={selectedLeak?.situationClass || undefined}
          closeLabel="Close leak details"
          ariaLabel={`Leak details: ${selectedLeak?.title || ''}`}
          headerRight={selectedLeak ? (
            <button
              type="button"
              className="pa-btn"
              aria-label="Copy link to this leak"
              onClick={() => handleShareLeak(selectedLeak)}
              style={iconBtn({ color: T.textMuted })}
            >
              <Link2 size={18} strokeWidth={2} />
            </button>
          ) : null}
        >
          <LeakErrorBoundary label="Leak details">
            {selectedLeak && (
              <LeakDetail
                leak={selectedLeak}
                onPracticeSandbox={handlePracticeSandbox}
                onPracticeExample={handlePracticeExample}
                onTrainDrills={handleTrainDrills}
                onMarkResolved={handleMarkResolved}
                onReopen={handleReopen}
                isResolving={resolvingLeakId != null && String(resolvingLeakId) === String(selectedLeak.id)}
                reviewRecord={reviewRecordById.get(String(selectedLeak.id)) || null}
              />
            )}
          </LeakErrorBoundary>
        </BottomSheet>

        <style dangerouslySetInnerHTML={{ __html: `
          .leak-card {
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            transition: transform .12s ease, background .12s ease, border-color .12s ease;
          }
          .leak-card:active {
            transform: scale(0.985);
            background: rgba(255, 255, 255, 0.06);
          }
          .leak-card:focus-visible {
            outline: 2px solid ${T.accent};
            outline-offset: 2px;
          }
          .leak-skeleton {
            animation: leakSkeletonPulse 1.4s ease-in-out infinite;
          }
          @keyframes leakSkeletonPulse {
            0%, 100% { opacity: 0.35; }
            50% { opacity: 0.7; }
          }
          .leak-progress {
            position: relative;
            overflow: hidden;
            height: 6px;
            border-radius: ${R.pill}px;
            background: ${T.surface2};
          }
          .leak-progress > span {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: 40%;
            border-radius: ${R.pill}px;
            background: linear-gradient(90deg, ${T.accent}, ${T.accentPress});
            animation: leakProgressSlide 1.2s ease-in-out infinite;
          }
          @keyframes leakProgressSlide {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(300%); }
          }
          @media (prefers-reduced-motion: reduce) {
            .leak-skeleton { animation: none; opacity: 0.5; }
            .leak-progress > span { animation: none; width: 100%; opacity: 0.5; }
            .leak-card:active { transform: none; }
            *, *::before, *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
              scroll-behavior: auto !important;
            }
          }
          /* The shell carries its padding as an inline style, which a plain
             rule cannot override — hence !important on this one declaration. */
          @media (min-width: 769px) {
            .leaks-shell {
              padding-left: max(24px, env(safe-area-inset-left, 0px)) !important;
              padding-right: max(24px, env(safe-area-inset-right, 0px)) !important;
            }
          }
        ` }} />
      </div>

      {UpgradePopup}
      <Toaster
        position="top-center"
        containerStyle={{ top: 'calc(env(safe-area-inset-top, 0px) + 72px)', zIndex: Z.toast }}
        toastOptions={{
          style: {
            maxWidth: 'calc(100vw - 32px)',
            fontSize: F.bodySm,
            background: T.surface,
            color: T.text,
            border: `1px solid ${T.border}`,
          },
          duration: 3500,
        }}
      />
      <BottomNavBar />
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT CELL
// ═══════════════════════════════════════════════════════════════════════════

function StatCell({ label, value, tone, icon, hint, onRetry }) {
  return (
    <div style={styles.statCell}>
      <span style={styles.statCellLabel}>
        {icon}
        {label}
      </span>
      {value === null ? (
        <span className="leak-skeleton" style={{ ...styles.statSkeleton }} aria-label={`${label} loading`} />
      ) : (
        <span style={{ ...styles.statCellValue, color: tone || T.text }}>{value}</span>
      )}
      {hint && <span style={styles.statCellHint}>{hint}</span>}
      {onRetry && (
        <button type="button" className="pa-btn" onClick={onRetry} style={styles.statRetry}>
          <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES (PA_DESIGN_SPEC tokens only)
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
  page: {
    minHeight: '100dvh',
    width: '100%',
    maxWidth: '100vw',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    background: T.bg,
    fontFamily: FONT,
    color: T.text,
    position: 'relative',
  },
  shell: {
    width: '100%',
    maxWidth: 760,
    margin: '0 auto',
    boxSizing: 'border-box',
    padding: `${S.lg}px max(${S.lg}px, env(safe-area-inset-left, 0px))`,
    paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
  },

  pageHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
    marginBottom: S.lg,
  },
  pageTitle: {
    fontSize: F.h1,
    fontWeight: 800,
    color: T.text,
    margin: 0,
    lineHeight: 1.2,
  },
  pageSub: {
    fontSize: F.bodySm,
    color: T.textMuted,
    margin: '4px 0 0',
    lineHeight: 1.45,
  },
  integrityBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: S.sm,
    alignSelf: 'flex-start',
    padding: '6px 12px',
    borderRadius: R.pill,
    background: T.surface2,
    border: `1px solid ${T.borderHi}`,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.textMuted,
    maxWidth: '100%',
  },

  // ── Review queue ──────────────────────────────────────────────────────
  reviewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
    flexWrap: 'wrap',
    marginBottom: S.sm,
  },
  reviewEyebrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: S.xs,
    fontSize: F.caption,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: T.textMuted,
  },
  reviewCount: {
    margin: `0 0 ${S.md}px`,
    fontSize: F.h3,
    fontWeight: 700,
    color: T.text,
    lineHeight: 1.35,
  },
  reviewBody: {
    margin: `0 0 ${S.md}px`,
    fontSize: F.bodySm,
    color: T.textMuted,
    lineHeight: 1.45,
  },
  reviewCaughtUp: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    margin: `0 0 ${S.xs}px`,
    fontSize: F.bodySm,
    fontWeight: 700,
    color: T.text,
  },
  reviewTop: {
    marginBottom: S.md,
  },
  reviewTopBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: S.xs,
    width: '100%',
    minHeight: 44,
    padding: S.md,
    boxSizing: 'border-box',
    background: T.surface2,
    border: `1px solid ${T.border}`,
    borderRadius: R.sm,
    cursor: 'pointer',
    font: 'inherit',
    color: T.text,
    textAlign: 'left',
  },
  reviewTopLabel: {
    fontSize: F.caption,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: T.textDim,
  },
  reviewTopTitle: {
    fontSize: F.body,
    fontWeight: 800,
    color: T.text,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
  reviewTopMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    flexWrap: 'wrap',
  },
  reviewTopEv: {
    fontSize: F.caption,
    fontWeight: 700,
    color: T.danger,
  },
  reviewFoot: {
    margin: `${S.sm}px 0 0`,
    fontSize: F.caption,
    color: T.textDim,
    lineHeight: 1.45,
  },
  reviewErrorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    marginTop: S.md,
    padding: S.sm,
    borderRadius: R.sm,
    background: T.warnSoft,
    border: '1px solid rgba(251,191,36,0.4)',
    fontSize: F.caption,
    color: T.warn,
    lineHeight: 1.45,
  },

  // ── Drill chunk placeholder ───────────────────────────────────────────────
  drillLoadingBackdrop: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: Z.sheet,
    background: T.scrim,
    display: 'flex',
    alignItems: 'flex-end',
  },
  drillLoadingSheet: {
    width: '100%',
    maxWidth: 760,
    margin: '0 auto',
    boxSizing: 'border-box',
    background: T.surface,
    borderRadius: R.sheet,
    padding: S.lg,
    paddingBottom: `calc(${S.lg}px + env(safe-area-inset-bottom, 0px))`,
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
  },

  demoBanner: {
    ...card,
    background: T.warnSoft,
    borderColor: 'rgba(251,191,36,0.45)',
    marginBottom: S.md,
    display: 'flex',
    flexDirection: 'column',
    gap: S.md,
  },
  demoBannerText: {
    margin: 0,
    fontSize: F.bodySm,
    fontWeight: 700,
    color: T.warn,
    lineHeight: 1.45,
  },

  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: S.sm,
    marginBottom: S.md,
  },
  statCell: {
    ...cardCompact,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  statCellLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: S.xs,
    fontSize: F.caption,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: T.textMuted,
  },
  statCellValue: {
    ...numeric,
    fontSize: 20,
    fontWeight: 800,
    color: T.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statCellHint: {
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.4,
  },
  statSkeleton: {
    display: 'block',
    height: 20,
    width: '60%',
    borderRadius: R.sm,
    background: T.surface2,
  },
  statRetry: {
    ...btn('ghost'),
    minHeight: 44,
    padding: '0 8px',
    marginTop: S.xs,
    alignSelf: 'flex-start',
    fontSize: F.caption,
    color: T.accent,
  },

  sectionHeading: {
    fontSize: F.label,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: T.textMuted,
    margin: `0 0 ${S.md}px`,
  },
  cardHeading: {
    fontSize: F.h3,
    fontWeight: 700,
    color: T.text,
    margin: `0 0 ${S.md}px`,
  },

  detectStepText: {
    margin: `${S.sm}px 0 0`,
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
  },
  detectionBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    marginTop: S.md,
    padding: `${S.sm}px ${S.sm}px ${S.sm}px ${S.md}px`,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid',
    borderRadius: R.sm,
    fontSize: F.bodySm,
    fontWeight: 600,
    lineHeight: 1.45,
  },

  skeletonCard: {
    height: 132,
    background: T.surface2,
    border: `1px solid ${T.border}`,
    borderRadius: R.md,
  },

  // Bleed summary
  bleedHeadline: {
    fontSize: F.h3,
    fontWeight: 700,
    color: T.text,
    margin: 0,
    lineHeight: 1.35,
  },
  bleedSub: {
    fontSize: F.caption,
    color: T.textMuted,
    margin: `${S.xs}px 0 ${S.md}px`,
    lineHeight: 1.45,
  },
  bleedBar: {
    display: 'flex',
    width: '100%',
    height: 10,
    borderRadius: R.pill,
    overflow: 'hidden',
    background: T.surface2,
  },
  bleedLegend: {
    listStyle: 'none',
    margin: `${S.md}px 0 0`,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
  },
  bleedLegendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    minWidth: 0,
  },
  bleedLegendTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: F.caption,
    color: T.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  bleedLegendValue: {
    ...numeric,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.text,
    flexShrink: 0,
  },

  // Search / filters
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    padding: `0 ${S.sm}px 0 ${S.md}px`,
    minHeight: 48,
    background: T.surface2,
    border: `1px solid ${T.borderHi}`,
    borderRadius: R.sm,
    boxSizing: 'border-box',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: T.text,
    fontSize: F.input,
    fontFamily: 'inherit',
    minHeight: 44,
    padding: 0,
  },

  // Leak list
  leakList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: S.md,
  },
  leakCard: {
    ...card,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: S.md,
    padding: S.lg,
  },
  leakCardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
    width: '100%',
    minWidth: 0,
    minHeight: 44,
    padding: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: R.sm,
    textAlign: 'left',
    cursor: 'pointer',
    font: 'inherit',
    color: T.text,
  },
  leakCardSelected: {
    borderColor: T.accent,
    background: T.accentSoft,
  },
  leakCardDemo: {
    borderStyle: 'dashed',
    borderColor: 'rgba(251,191,36,0.45)',
  },
  leakCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    width: '100%',
    minWidth: 0,
  },
  leakCardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: F.h3,
    fontWeight: 700,
    color: T.text,
    lineHeight: 1.3,
  },
  leakCardMetrics: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: S.sm,
    minWidth: 0,
  },
  leakCardEv: {
    ...numeric,
    fontSize: F.body,
    fontWeight: 700,
    color: T.danger,
  },
  leakCardMetricDim: {
    fontSize: F.caption,
    color: T.textMuted,
  },
  leakCardMetricStrong: {
    ...numeric,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.textMuted,
  },
  leakCardBadges: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: S.sm,
  },
  leakCardSituation: {
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
  },
  leakCardHint: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: S.xs,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.warn,
    lineHeight: 1.4,
  },

  disclosureBtn: {
    ...btn('secondary', { block: true }),
    justifyContent: 'space-between',
    fontSize: F.bodySm,
  },

  // Detail sheet
  detailBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: S.sm,
    marginBottom: S.md,
  },
  detailMetaLine: {
    fontSize: F.caption,
    color: T.textMuted,
    margin: `0 0 ${S.md}px`,
  },
  // ── progress to resolution ──────────────────────────────────────────────────────────
  leakCardProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    minWidth: 0,
  },
  leakCardProgressLabel: {
    fontSize: F.caption,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  progressTrack: {
    display: 'block',
    flex: 1,
    minWidth: 0,
    height: 6,
    borderRadius: 999,
    background: T.surface3,
    overflow: 'hidden',
  },
  progressFill: {
    display: 'block',
    height: '100%',
    borderRadius: 999,
    transition: 'width .3s ease',
  },
  progressHeaderRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: S.sm,
    marginBottom: S.xs,
  },
  progressPercent: {
    fontSize: F.h2,
    fontWeight: 700,
  },
  progressTrend: {
    fontSize: F.caption,
    fontWeight: 600,
  },
  progressStageCopy: {
    fontSize: F.bodySm,
    color: T.textMuted,
    margin: `${S.sm}px 0 ${S.md}px`,
    lineHeight: 1.5,
  },
  progressHistoryWrap: {
    marginBottom: S.md,
  },
  progressHistoryStrip: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 4,
    height: 44,
    padding: `0 2px`,
  },
  progressHistoryBar: {
    display: 'block',
    flex: 1,
    maxWidth: 22,
    minWidth: 6,
    borderRadius: 3,
  },
  progressHistoryCaption: {
    display: 'block',
    fontSize: F.caption,
    color: T.textDim,
    marginTop: S.xs,
  },
  progressMetaLine: {
    fontSize: F.caption,
    color: T.textMuted,
    margin: 0,
  },

  statTileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: S.sm,
    marginBottom: S.lg,
  },
  statTile: {
    ...cardCompact,
    background: T.surface2,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  statTileLabel: {
    fontSize: F.caption,
    fontWeight: 700,
    color: T.textMuted,
    lineHeight: 1.3,
  },
  statTileValue: {
    ...numeric,
    fontSize: 18,
    fontWeight: 800,
  },
  detailSection: {
    marginBottom: S.lg,
  },
  detailSectionTitle: {
    fontSize: F.h3,
    fontWeight: 700,
    color: T.text,
    margin: `0 0 ${S.sm}px`,
  },
  detailBody: {
    fontSize: F.bodySm,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: 0,
  },
  detailNote: {
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: `${S.sm}px 0 0`,
  },
  helperText: {
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: `${S.sm}px 0 0`,
  },

  // Trend
  trendHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
    flexWrap: 'wrap',
    marginBottom: S.sm,
  },
  trendHeaderLabel: {
    fontSize: F.caption,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: T.textMuted,
  },
  trendEmpty: {
    ...cardCompact,
    background: 'transparent',
    borderStyle: 'dashed',
    borderColor: T.borderHi,
    display: 'flex',
    flexDirection: 'column',
    gap: S.md,
  },
  trendEmptyText: {
    fontSize: F.bodySm,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: 0,
  },
  miniTile: {
    ...cardCompact,
    background: T.surface2,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  miniTileLabel: {
    fontSize: F.caption,
    fontWeight: 700,
    color: T.textMuted,
  },
  miniTileValue: {
    ...numeric,
    fontSize: 20,
    fontWeight: 800,
  },
  trendScaleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: S.sm,
    flexWrap: 'wrap',
    marginTop: S.xs,
  },
  trendScaleText: {
    fontSize: F.caption,
    color: T.textMuted,
  },
  // Deliberate horizontal snap carousel. One auto-column per point with no
  // minimum squeezed 7 runs to ~36px and 12 runs to ~21px on a 375px viewport,
  // which broke the 44x44 tap target and clipped the % / date labels.
  trendPointRow: {
    display: 'flex',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    gap: S.sm,
    marginTop: S.md,
    paddingBottom: S.xs,
  },
  trendPointBtn: {
    display: 'flex',
    flex: '0 0 auto',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    scrollSnapAlign: 'start',
    gap: 2,
    minHeight: 44,
    minWidth: 60,
    padding: '4px 8px',
    borderRadius: R.sm,
    border: `1px solid ${T.border}`,
    background: T.surface2,
    color: T.text,
    cursor: 'pointer',
    font: 'inherit',
  },
  trendPointValue: {
    ...numeric,
    fontSize: F.caption,
    fontWeight: 800,
    color: T.text,
  },
  trendPointDate: {
    fontSize: F.caption,
    color: T.textMuted,
  },
  trendCaption: {
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: `${S.sm}px 0 0`,
  },

  // Example rows
  exampleRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: S.xs,
    width: '100%',
    minHeight: 56,
    padding: `${S.md}px`,
    background: T.surface2,
    border: `1px solid ${T.border}`,
    borderRadius: R.sm,
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    color: T.text,
  },
  exampleLine1: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
    width: '100%',
    minWidth: 0,
  },
  exampleLine2: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    width: '100%',
    minWidth: 0,
  },
  exampleCards: {
    fontSize: F.bodySm,
    fontWeight: 700,
    color: T.text,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  exampleBoard: {
    fontSize: F.caption,
    color: T.textMuted,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  exampleEv: {
    ...numeric,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.danger,
    flexShrink: 0,
  },

  // Fix cards
  fixGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: S.md,
    marginBottom: S.md,
  },
  fixCard: {
    ...cardCompact,
    background: T.surface2,
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
  },
  fixCardRecommended: {
    borderColor: T.accent,
    background: T.accentSoft,
  },
  fixHead: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    flexWrap: 'wrap',
  },
  fixTitle: {
    fontSize: F.h3,
    fontWeight: 700,
    color: T.text,
    margin: 0,
    minWidth: 0,
  },
  fixText: {
    fontSize: F.bodySm,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: 0,
  },

  // Auto-guidance switch
  guidanceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: S.md,
    width: '100%',
    minHeight: 56,
    padding: S.md,
    background: T.surface2,
    border: `1px solid ${T.border}`,
    borderRadius: R.sm,
    cursor: 'pointer',
    font: 'inherit',
    color: T.text,
    textAlign: 'left',
  },
  guidanceTitle: {
    display: 'block',
    fontSize: F.bodySm,
    fontWeight: 700,
    color: T.text,
  },
  guidanceBody: {
    display: 'block',
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
    marginTop: 2,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: R.pill,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    padding: 3,
    boxSizing: 'border-box',
    transition: 'background .12s ease',
  },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#FFFFFF',
    transition: 'transform .12s ease',
  },
};
