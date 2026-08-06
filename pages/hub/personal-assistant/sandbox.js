// __PUBLISH_PLACEHOLDER_A__
  // mid-range phone never blocks on it. No worker available (SSR, CSP, ancient
  // webview) => the old requestIdleCallback path, unchanged.
// __PUBLISH_PLACEHOLDER_B__
    const cards = String(entry.board || '').split(' ').filter(Boolean);
    restoreScenario({
      heroHand: entry.hand && entry.hand.length >= 4
        ? { card1: entry.hand.substring(0, 2), card2: entry.hand.substring(2, 4) }
        : null,
      heroPosition: entry.position,
      board: { flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null },
      actionHistory: [],
      potSize: 1.5,
    });
    try { navigator.vibrate?.(20); } catch (e) { /* unsupported */ }
  }, [restoreScenario]);

  // ═══════════════════════════════════════════════════════════
  // DERIVED VIEW STATE
  // ═══════════════════════════════════════════════════════════
  const historicResults = (activeStreet < streetHistory.length) ? streetHistory[activeStreet]?.results : null;
  const displayResults = historicResults || resultsOverride || results;
  const isHistoricView = !!historicResults;

  const sourceBadge = displayResults ? (
    displayResults.offline
      ? { bg: T.warnSoft, border: T.warn, text: T.warn, label: 'Offline estimate' }
      : displayResults.matchTier <= 2 ? { bg: T.successSoft, border: T.success, text: T.success, label: 'PIO Verified' }
        : displayResults.matchTier === 3 ? { bg: T.warnSoft, border: T.warn, text: T.warn, label: 'PIO Approximated' }
          : { bg: T.purpleSoft, border: T.purple, text: T.purple, label: 'AI Analysis' }
  ) : null;

  const anyModalOpen = showDeck || showCoachPicker || showSaveHand || showShareScenario || showGodMode
    || showSolverImport || showHHImport || showTemplates || showLeakStats || showSessionLog
    || showRangeExplorer || showQuickDrill || showCustomDrill || showSessionReport
    || showVillainPresets || showHandReplay || showStudyFolders || showShareHand || showRangeGrid
    || showSessions || showSetup || showDue || showResults;

  // Keyboard shortcuts read their callbacks from here (registered once, fresh)
  const actionsRef = useRef({});
  useEffect(() => {
    actionsRef.current = {
      runAnalysis: () => runAnalysis(),
      confirmReset, popUndo, saveBookmark, toggleCoachMode,
      modalOpen: anyModalOpen,
    };
  });

  useEffect(() => {
    const handleKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const acts = actionsRef.current;
      if (acts.modalOpen && e.key !== 'Escape' && e.key !== '?') return;
      switch (e.key.toLowerCase()) {
        case 'a': acts.runAnalysis?.(); break;
        case 'r': acts.confirmReset?.(); break;
        case 'u': acts.popUndo?.(); break;
        case 's': acts.saveBookmark?.(); break;
        case 'c': acts.toggleCoachMode?.(); break;
        case '?': setShowShortcutLegend(prev => !prev); break;
        case 'escape': setShowResults(false); setShowShortcutLegend(false); break;
        default: break;
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('keydown', handleKey);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('keydown', handleKey); };
  }, []);

  const selectResultsTab = useCallback((tab) => {
    setResultsTab(tab);
    safeLocal.set('sandbox-results-tab', tab);
  }, []);

  const startLeakDrill = useCallback(() => {
    const street = String(practiceFocus?.drill || '').toLowerCase();
    setDrillParams({
      street: ['preflop', 'flop', 'turn', 'river'].includes(street) ? street : 'flop',
      position: heroPosition,
      limit: 10,
    });
    setShowQuickDrill(true);
  }, [practiceFocus, heroPosition]);

  const copyShareLink = useCallback(() => {
    try {
      const packed = LZString.compressToEncodedURIComponent(JSON.stringify(sandboxSnapshot));
      const url = `${window.location.origin}/hub/personal-assistant/sandbox?s=${packed}`;
      navigator.clipboard?.writeText(url)
        .then(() => toast.success('Full-fidelity link copied'))
        .catch(() => toast.error('Copy failed'));
    } catch (e) {
      toast.error('Could not build a share link');
    }
  }, [sandboxSnapshot]);

  // ── View helpers ──
  const tableCards = replayState ? replayState.cards : communityCards;
  const tablePot = replayState ? replayState.handState.pot : potSize;
  const tableSpr = replayState ? replayState.handState.spr : handState.spr;
  const canDeal = board.flop.length === 3 && !board.river && !handOver;
  const analyzeDisabled = isAnalyzing || !heroHand.card1 || !heroHand.card2 || handOver;
  const textureLabel = boardTexture ? (TEXTURE_SHORT[boardTexture.label] || boardTexture.label) : null;

  return (
    <div
      className="sandbox-page"
      style={{
        width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
        background: T.bg, color: T.text,
        fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
        // clears the sticky action bar (60) + BottomNavBar (56) + safe area
        paddingBottom: 'calc(60px + 56px + 16px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {UpgradePopup}
      {/* top-right collides with the header on a 375px screen */}
      <Toaster position="top-center" containerStyle={{ top: 'calc(8px + env(safe-area-inset-top, 0px))' }} />

      <UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(true)} />

      <HamburgerMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        direction="left"
        theme="pa"
        user={null}
        showProfile={false}
        menuItems={getMenuConfig('sandbox', null, {
          quizMode, coachMode,
          hasResults: !!displayResults,
          saveStatus,
          sessionLogCount: sessionLog.length,
          showHeatmap, showNodeLocks, soundEnabled,
        }, {
          onToggleQuiz: () => { setQuizMode(q => !q); setQuizRevealed(false); setUserGuess(null); },
          onToggleCoach: () => toggleCoachMode(),
          onRanges: () => setShowRangeExplorer(true),
          onVillains: () => setShowVillainPresets(true),
          onUndo: () => popUndo(),
          onReset: () => confirmReset(),
          onReplay: () => setShowHandReplay(true),
          onResults: () => setShowResults(true),
          onShare: () => {
            // ShareHandModal captures #results-panel, so the results sheet must
            // be mounted (and on a presentable tab) when it opens.
            if (!displayResults) { setShowShare(true); return; }
            selectResultsTab('verdict');
            setShowResults(true);
            setShowShareHand(true);
          },
          onSave: () => saveBookmark(),
          onSessions: () => setShowSessions(true),
          onFolders: () => setShowStudyFolders(true),
          onLog: () => setShowSessionLog(true),
          onTemplates: () => { setShowTemplates(true); loadTemplates(); },
          onSaveTemplate: () => saveAsTemplate(),
          onSaveSpot: () => setShowSaveHand(true),
          onShareScenario: () => setShowShareScenario(true),
          onImportHH: () => setShowHHImport(true),
          onLeakStats: openAnalytics,
          onAnalytics: openAnalytics,
          onReport: () => setShowSessionReport(true),
          onGodMode: () => setShowGodMode(true),
          onProImport: () => setShowSolverImport(true),
          onCustomSpot: () => setShowCustomDrill(true),
          onDrill: () => { setDrillParams(null); setShowQuickDrill(true); },
          onToggleHeatmap: (val) => setShowHeatmap(val),
          onToggleNodeLocks: (val) => setShowNodeLocks(val),
          onToggleSound: () => toggleSound(),
          onPlayTutorial: () => { setShowTour(true); setTourStep(0); },
        }).menuItems}
        bottomLinks={getMenuConfig('sandbox', null, {}, {
          onPlayTutorial: () => { setShowTour(true); setTourStep(0); },
        }).bottomLinks}
      />

      <OnboardingTour
        isVisible={showTour}
        step={tourStep}
        onClose={() => { setShowTour(false); safeLocal.set('sandbox-tour-seen', 'true'); }}
        onNext={() => setTourStep(prevStep => {
          const next = prevStep + 1;
          // The results step spotlights #results-panel, which only exists while
          // the sheet is mounted — open it so the step is not an orphan.
          if (next === 4 && displayResults) setShowResults(true);
          return next;
        })}
      />

      <main style={{
        width: '100%', maxWidth: 560, margin: '0 auto', boxSizing: 'border-box',
        paddingTop: S.md,
        paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
        paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
        display: 'flex', flexDirection: 'column', gap: S.md,
      }}>

        {/* ── Leak practice hand-off from the Leak Finder ── */}
        {practiceFocus && (
          <div style={{
            ...cardCompact, background: T.warnSoft, border: `1px solid rgba(251,191,36,0.3)`,
            display: 'flex', alignItems: 'center', gap: S.md, marginTop: S.md,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...sectionTitle, color: T.warn }}>Practising a leak</div>
              <div style={{ fontSize: F.bodySm, color: T.text, fontWeight: 700, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {String(practiceFocus.leakType || 'Leak drill')}
                {practiceFocus.drill ? ` — ${String(practiceFocus.drill)}` : ''}
              </div>
              <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: 2, lineHeight: 1.45 }}>
                Coach mode is on — pick your action before each analysis.
              </div>
              <button type="button" className="pa-btn" onClick={startLeakDrill} style={{ ...btn('secondary'), marginTop: S.sm, color: T.warn }}>
                <Zap size={18} strokeWidth={2} aria-hidden="true" />Start drill
              </button>
            </div>
            <button
              type="button" className="pa-btn" onClick={() => setPracticeFocus(null)}
              aria-label="Dismiss leak practice banner"
              style={iconBtn({ color: T.textMuted })}
            >
              <XIcon size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* ── Always-visible progress + live numbers ── */}
        <StatusStrip
          quizScore={quizScore}
          coachStreak={coachStreak}
          equity={equity?.heroEquity}
          pot={tablePot}
          spr={tableSpr}
          handClass={handStrength?.label || null}
          dueCount={dueItems.length}
          onDue={() => setShowDue(true)}
        />

        {/* ── Board texture chip (moved OFF the felt where it never fit) ── */}
        {(textureLabel || equity?.refining) && (
          <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            {textureLabel && (
              <button
                type="button" className="pa-btn"
                onClick={() => toast(boardTexture.strategy || textureLabel, { duration: 4000 })}
                aria-label={`Board texture ${textureLabel}. Tap for the strategy note.`}
                style={{ ...btn('secondary'), borderRadius: R.pill, padding: '0 14px', fontSize: F.caption, color: boardTexture.textColor || T.textMuted }}
              >
                {textureLabel}
              </button>
            )}
            {equity?.refining && (
              <span style={{ ...pill('neutral') }}>
                <Loader2 size={12} strokeWidth={2} className="pa-spin" aria-hidden="true" />
                refining equity
              </span>
            )}
          </div>
        )}

        {/* ── THE TABLE — full width, the hero element ── */}
        <div
          id="sandbox-table"
          className="sandbox-table-wrap"
          style={{ width: '100%', filter: FELT_COLORS.find(f => f.id === tableFelt)?.filter || 'none' }}
        >
          <MemoSandboxPokerTable
            heroCards={heroCardsMemo}
            communityCards={tableCards}
            pot={Number(tablePot) || 0}
            heroPosition={heroPosition}
            heroStack={Math.round(handState.remaining.hero)}
            villains={tableVillains}
            street={currentStreet}
            boardTexture={boardTexture}
            showTextureBadge={false}
            equity={equity?.heroEquity}
            equityLabel={equityLabel}
            spr={tableSpr}
            showDealHint={canDeal && !!heroHand.card1}
            onTapHeroCards={openHeroPicker}
            onTapBoard={openBoardPicker}
            onReset={confirmReset}
            onRemoveHeroCard={(idx) => {
              try { navigator.vibrate?.(15); } catch (e) { /* unsupported */ }
              pushUndo();
              if (idx === 0) setHeroHand(h => ({ ...h, card1: h.card2, card2: null }));
              else setHeroHand(h => ({ ...h, card2: null }));
            }}
            onRemoveBoardCard={(idx) => {
              try { navigator.vibrate?.(15); } catch (e) { /* unsupported */ }
              pushUndo();
              const allCards = boardToArray(board);
              allCards.splice(idx, 1);
              setBoard({ flop: allCards.slice(0, Math.min(3, allCards.length)), turn: allCards[3] || null, river: allCards[4] || null });
            }}
            onSwipeLeft={() => { if (canDeal) dealAndCoach(); }}
            onSwipeRight={() => {
              if (!board.river && !board.turn) return;
              pushUndo();
              if (board.river) setBoard(b => ({ ...b, river: null }));
              else setBoard(b => ({ ...b, turn: null }));
              toast((t) => (
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: F.bodySm }}>
                  Card removed
                  <button
                    type="button" className="pa-btn"
                    onClick={() => { popUndo(); toast.dismiss(t.id); }}
                    style={{ ...btn('secondary'), padding: '0 14px', fontSize: F.label, flexShrink: 0 }}
                  >Undo</button>
                </span>
              ), { duration: 3200 });
            }}
          />
        </div>

        {/* ── First-run: three one-tap starts instead of two dashed rectangles ── */}
        {!heroHand.card1 && !heroHand.card2 && communityCards.length === 0 && (
          <div style={{ ...cardCompact, display: 'flex', flexDirection: 'column', gap: S.sm }}>
            <h3 style={{ fontSize: F.h3, fontWeight: 700, margin: 0, color: T.text }}>Start a spot</h3>
            <p style={{ fontSize: F.bodySm, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
              Pick a hand and a board, or let the sandbox deal you one.
            </p>
            <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
              <button type="button" className="pa-btn" onClick={() => nextHand(true)} style={{ ...btn('primary'), flex: '1 1 150px' }}>
                <Shuffle size={18} strokeWidth={2} aria-hidden="true" />Deal me a spot
              </button>
              <button type="button" className="pa-btn" onClick={openHeroPicker} style={{ ...btn('secondary'), flex: '1 1 150px' }}>
                Pick my cards
              </button>
              <button type="button" className="pa-btn" onClick={() => setShowSessions(true)} style={{ ...btn('secondary'), flex: '1 1 150px' }}>
                Load a saved hand
              </button>
              {weeklySpot && (
                <button type="button" className="pa-btn" onClick={() => loadWeeklySpot(weeklySpot)} style={{ ...btn('secondary'), flex: '1 1 150px', color: T.purple }}>
                  <Trophy size={18} strokeWidth={2} aria-hidden="true" />Weekly challenge
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Hand complete ── */}
        {handOver && handResult && (
          <div style={{
            ...cardCompact,
            background: handResult.heroWon ? T.successSoft : handResult.heroWon === false ? T.dangerSoft : T.warnSoft,
            border: `1px solid ${handResult.heroWon ? 'rgba(34,197,94,0.4)' : handResult.heroWon === false ? 'rgba(239,68,68,0.4)' : 'rgba(251,191,36,0.4)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: S.xs }}>
              {handResult.heroWon
                ? <Check size={18} strokeWidth={3} style={{ color: T.success }} aria-hidden="true" />
                : <AlertTriangle size={18} strokeWidth={2} style={{ color: handResult.heroWon === false ? T.danger : T.warn }} aria-hidden="true" />}
              <span style={{ fontSize: F.h3, fontWeight: 800, color: handResult.heroWon ? T.success : handResult.heroWon === false ? T.danger : T.warn }}>
                {handResult.headline}
              </span>
              {handResult.bb != null && (
                <span style={{ marginLeft: 'auto', ...pill(handResult.bb >= 0 ? 'success' : 'danger'), ...NUM }}>
                  {handResult.bb >= 0 ? '+' : ''}{handResult.bb.toFixed(1)} BB
                </span>
              )}
            </div>
            <p style={{ fontSize: F.bodySm, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
              {handResult.detail}{!handResult.exact && handResult.bb != null ? ' Expected value, not a dealt showdown.' : ''}
            </p>
            <div style={{ display: 'flex', gap: S.sm, marginTop: S.md, flexWrap: 'wrap' }}>
              {!handResult.exact && handState.terminal === 'allin' && boardToArray(board).length < 5 && (
                <button type="button" className="pa-btn" onClick={runItOut} style={{ ...btn('secondary'), flex: '1 1 140px' }}>
                  <PlayCircle size={18} strokeWidth={2} aria-hidden="true" />Run it out
                </button>
              )}
              <button type="button" className="pa-btn" onClick={() => nextHand(true)} style={{ ...btn('primary'), flex: '1 1 140px' }}>
                Next hand
              </button>
            </div>
          </div>
        )}

        {/* ── Board strip ── */}
        <div id="board-builder" style={{ ...cardCompact }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, marginBottom: S.md }}>
            <h4 style={{ ...sectionTitle, margin: 0 }}>Board</h4>
            <div style={{ display: 'flex', gap: S.sm }}>
              <button type="button" className="pa-btn" onClick={randomBoard} style={{ ...btn('secondary'), padding: '0 12px', fontSize: F.caption }}>
                <Shuffle size={18} strokeWidth={2} aria-hidden="true" />Random
              </button>
              {communityCards.length >= 3 && (
                <button type="button" className="pa-btn" onClick={() => setShowRangeGrid(true)} style={{ ...btn('secondary'), padding: '0 12px', fontSize: F.caption, color: T.purple }}>
                  Grid
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: S.md, flexWrap: 'wrap', alignItems: 'center' }}>
            {board.flop.map((c, i) => (
              <CardSlot
                key={`f${i}`} card={c} onTap={openBoardPicker}
                onRemove={() => { pushUndo(); const f = [...board.flop]; f.splice(i, 1); setBoard({ flop: f, turn: null, river: null }); }}
              />
            ))}
            {board.flop.length < 3 && <CardSlot onTap={openBoardPicker} />}
            {board.flop.length === 3 && (
              <CardSlot card={board.turn} label="T" onTap={openBoardPicker} onRemove={board.turn ? () => { pushUndo(); setBoard(b => ({ ...b, turn: null, river: null })); } : null} />
            )}
            {board.turn && (
              <CardSlot card={board.river} label="R" onTap={openBoardPicker} onRemove={board.river ? () => { pushUndo(); setBoard(b => ({ ...b, river: null })); } : null} />
            )}
          </div>
        </div>

        {/* ── Street timeline ── */}
        <StreetTimeline
          streetHistory={streetHistory}
          activeStreet={activeStreet}
          onSelectStreet={(i) => { setActiveStreet(i); setShowResults(true); }}
        />

        {/* ── Action line — full width, no 110px rail, no 80px clamp ── */}
        <div id="action-history">
          <ActionReplayBar
            actions={actionHistory}
            replayIndex={replayIndex}
            onReplayTo={onReplayTo}
            onExitReplay={() => onReplayTo(null)}
          />
          {replayIndex != null && (
            <button
              type="button" className="pa-btn"
              onClick={() => { onReplayTo(null); runAnalysis(true, null, replayState?.board || board); }}
              style={{ ...btn('secondary', { block: true }), marginBottom: S.md, color: T.accent }}
            >
              Re-analyze from here
            </button>
          )}
          <MemoActionHistoryBuilder
            actions={actionHistory}
            onAdd={addAction}
            onRemove={removeAction}
            potSize={Number(potBase) || 1.5}
            heroPosition={heroPosition}
            villainPosition={villains[0]?.position || 'BB'}
            street={currentStreet}
            handState={replayState ? replayState.handState : handState}
            disabled={replayIndex != null || handOver}
          />
        </div>

        {/* ── Preflop chart ── */}
        {currentStreet === 'preflop' && (
          <div>
            <button
              type="button" className="pa-btn"
              onClick={() => setShowRangeChart(v => !v)}
              aria-expanded={showRangeChart}
              style={{ ...btn(showRangeChart ? 'primary' : 'secondary', { block: true }), justifyContent: 'space-between' }}
            >
              <span>{heroPosition} range chart</span>
              {showRangeChart ? <ChevronUp size={18} strokeWidth={2} aria-hidden="true" /> : <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />}
            </button>
            {showRangeChart && (
              <div style={{ marginTop: S.sm }}>
                <PreflopChartOverlay
                  position={heroPosition}
                  scenario={preflopScenario}
                  rangeGrid={rangeGrid}
                  rangePercent={rangePercent}
                  onChangeScenario={setPreflopScenario}
                  onPickHand={(handKey) => {
                    // Turn the chart into a hand picker: load a representative combo
                    if (!handKey || handKey.length < 2) return;
                    const r1 = handKey[0], r2 = handKey[1];
                    const suited = handKey.endsWith('s');
                    pushUndo();
                    setHeroHand({ card1: `${r1}s`, card2: `${r2}${suited ? 's' : 'h'}` });
                    toast.success(`${handKey} loaded`);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Runout simulator ── */}
        {board.flop.length === 3 && !board.river && runoutData && (
          <div>
            <button
              type="button" className="pa-btn"
              onClick={() => setShowRunouts(v => !v)}
              aria-expanded={showRunouts}
              style={{ ...btn(showRunouts ? 'primary' : 'secondary', { block: true }), justifyContent: 'space-between' }}
            >
              <span>Runout simulator</span>
              {showRunouts ? <ChevronUp size={18} strokeWidth={2} aria-hidden="true" /> : <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />}
            </button>
            {showRunouts && <div style={{ marginTop: S.sm }}><RunoutChart runoutData={runoutData} /></div>}
          </div>
        )}

        {/* ── Analysis error ── */}
        {error && !resultsOverride && (
          <ErrorState
            title="Analysis failed"
            body={String(error)}
            onRetry={() => runAnalysis(true, coachUserPick)}
          />
        )}

        {isAnalyzing && <AnalysisSkeleton />}
      </main>

      {/* ═══ STICKY THUMB BAR — the whole tool is one-handed from here ═══ */}
      <div
        id="run-analysis"
        style={{
          position: 'fixed', left: 0, right: 0,
          bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          zIndex: Z.sticky,
          display: 'flex', alignItems: 'center', gap: S.sm,
          paddingTop: S.sm, paddingBottom: S.sm,
          paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(12px, env(safe-area-inset-right, 0px))',
          background: 'rgba(24,25,26,0.94)',
          WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)',
          borderTop: `1px solid ${T.border}`,
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button" className="pa-btn" onClick={popUndo}
          aria-label="Undo last change"
          style={iconBtn({ color: T.textMuted })}
        >
          <Undo2 size={20} strokeWidth={2} aria-hidden="true" />
        </button>

        <button
          type="button" className="pa-btn"
          onClick={() => (canDeal ? dealAndCoach() : randomBoard())}
          aria-label={canDeal ? `Deal the ${board.turn ? 'river' : 'turn'}` : 'Deal a random flop'}
          style={iconBtn({ color: canDeal ? T.success : T.textMuted })}
        >
          {canDeal ? <PlayCircle size={20} strokeWidth={2} aria-hidden="true" /> : <Shuffle size={20} strokeWidth={2} aria-hidden="true" />}
        </button>

        <button
          type="button" className="pa-btn"
          onClick={() => runAnalysis()}
          disabled={analyzeDisabled}
          style={{
            ...btn(analyzeDisabled ? 'secondary' : 'primary', { disabled: analyzeDisabled }),
            flex: 1, minWidth: 0, minHeight: 52, fontSize: F.h3, letterSpacing: 0.3,
          }}
        >
          {isAnalyzing
            ? <><Loader2 size={20} strokeWidth={2} className="pa-spin" aria-hidden="true" />Analyzing…</>
            : coachMode
              ? <><Brain size={20} strokeWidth={2} aria-hidden="true" />What would you do?</>
              : 'Analyze'}
        </button>

        <button
          type="button" className="pa-btn" id="sandbox-setup"
          onClick={() => setShowSetup(true)}
          aria-label="Open setup"
          style={iconBtn({ color: T.textMuted })}
        >
          <SlidersHorizontal size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {/* ═══════════════════ SHEETS ═══════════════════ */}

      <CardPickerSheet
        isOpen={showDeck}
        onClose={() => { setShowDeck(false); setDeckTarget(null); setHeroPickStep(0); }}
        onSelect={handleDeckSelect}
        usedCards={allUsedCards}
        mode={deckTarget === 'hero' ? 'hero' : deckTarget === 'board' ? 'board' : 'single'}
        pickProgress={heroPickStep}
        onRandomCard={randomCard}
        onRandomFlop={randomBoard}
      />

      <SetupSheet
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        heroPosition={heroPosition} setHeroPosition={setHeroPosition}
        gameType={gameType} setGameType={setGameType}
        heroStack={heroStack} setHeroStack={setHeroStack}
        potBase={potBase} setPotBase={setPotBase} livePot={potSize}
        villains={villains}
        onVillainPatch={patchVillain}
        onVillainArchetype={handleVillainArchetypeChange}
        onAddVillain={addVillain}
        onRemoveVillain={removeVillain}
        onOpenPresets={() => { setShowSetup(false); setShowVillainPresets(true); }}
        onOpenRanges={() => { setShowSetup(false); setShowRangeExplorer(true); }}
        bubbleFactor={bubbleFactor} setBubbleFactor={setBubbleFactor}
        tableFelt={tableFelt} onChangeFelt={changeFeltColor}
        isListening={isListening} onVoice={startVoiceInput} voiceSupported={voiceSupported}
        equityVsRange={equityVsRange} setEquityVsRange={setEquityVsRange}
        onImportHH={() => { setShowSetup(false); setShowHHImport(true); }}
        onTemplates={() => { setShowSetup(false); setShowTemplates(true); loadTemplates(); }}
      />

      <SessionsSheet
        isOpen={showSessions}
        onClose={() => setShowSessions(false)}
        leaderboardEntries={leaderboardEntries}
        onLeakStats={openAnalytics}
        onLoad={(session) => {
          const flop = session.board_flop
            ? (String(session.board_flop).includes(',') ? String(session.board_flop).split(',').filter(Boolean) : (String(session.board_flop).match(/.{1,2}/g) || []))
            : [];
          const h = String(session.hero_hand || '');
          restoreScenario({
            heroHand: h.length >= 4 ? { card1: h.substring(0, 2), card2: h.substring(2, 4) } : null,
            heroPosition: session.hero_position,
            heroStack: session.hero_stack,
            gameType: session.game_type,
            board: { flop, turn: session.board_turn || null, river: session.board_river || null },
            villains: Array.isArray(session.villain_config) && session.villain_config.length
              ? session.villain_config
              : [{ id: 0, position: session.hero_position === 'BB' ? 'SB' : 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: Number(session.hero_stack) || 100 }],
            actionHistory: Array.isArray(session.action_history) ? session.action_history : [],
            potSize: session.pot_size_bb,
          });
        }}
      />

      <TemplatesSheet
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        templates={templates}
        status={templatesStatus}
        error={templatesError}
        onReload={loadTemplates}
        onSave={saveAsTemplate}
        onLoad={(t) => { restoreScenario(t?.scenario_json); setShowTemplates(false); }}
        onDelete={deleteTemplate}
      />

      <AnalyticsSheet
        isOpen={showLeakStats}
        onClose={() => setShowLeakStats(false)}
        status={leakStatsStatus}
        stats={leakStats}
        error={leakStatsError}
        onRetry={loadLeakStats}
      />

      <DueSheet
        isOpen={showDue}
        onClose={() => setShowDue(false)}
        due={dueItems}
        onReview={(item) => {
          restoreScenario({
            heroHand: item.heroHand || null,
            heroPosition: item.position,
            board: (() => {
              const cards = String(item.board || '').split(' ').filter(Boolean);
              return { flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null };
            })(),
            actionHistory: [],
            potSize: 1.5,
          });
          setCoachMode(true);
          setShowDue(false);
          toast('Review spot loaded — tap Analyze');
        }}
        onDismiss={(item) => setSrs(prev => {
          const next = prev.filter(e => e.key !== item.key);
          srsSave(next);
          return next;
        })}
      />

      <SessionLogModal
        isOpen={showSessionLog}
        onClose={() => setShowSessionLog(false)}
        sessionLog={sessionLog}
        onClearSession={() => { setSessionLog([]); try { Promise.resolve(idbSaveSessionLog([])).catch(() => { }); } catch (e) { /* noop */ } }}
        onLoadEntry={loadSessionEntry}
      />

      <CoachActionPicker
        isOpen={showCoachPicker}
        onPick={handleCoachPick}
        onSkip={handleCoachSkip}
        heroHand={heroHand}
        board={pendingBoard || board}
        potSize={potSize}
        heroPosition={heroPosition}
        villain={villains[0]}
        handState={handState}
        street={streetOfBoard(pendingBoard || board)}
        newCard={pendingBoard ? (pendingBoard.river || pendingBoard.turn) : null}
      />

      <ShareAnalysisModal
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        results={displayResults}
        scenario={{ board: communityCards.join(' ') }}
      />

      <ShortcutLegend isOpen={showShortcutLegend} onClose={() => setShowShortcutLegend(false)} />

      <ImportHHModal
        isVisible={showHHImport}
        onClose={() => setShowHHImport(false)}
        onImport={(parsed) => {
          if (!parsed) return;
          restoreScenario(parsed);
          toast.success('Hand imported');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pa-sandbox-updated', { detail: { type: 'import_hh' } }));
          }
        }}
      />

      {showRangeExplorer && (
        <RangeExplorer
          villains={villains}
          onSelectRange={(rangeStr, villainIdx = 0) => {
            if (!rangeStr) return;
            // Flag it as custom so the simulator is honest about still using the
            // archetype's tendencies for action frequencies.
            patchVillain(Math.min(villainIdx, villains.length - 1), { range: rangeStr, customRange: true });
            toast.success('Custom range applied');
          }}
          onClose={() => setShowRangeExplorer(false)}
        />
      )}

      {showVillainPresets && (
        <VillainPresetPicker
          villains={villains}
          onSelectPreset={(preset, villainIdx = 0) => {
            if (!preset) return;
            const idx = Math.min(Math.max(0, Number(villainIdx) || 0), villains.length - 1);
            const archId = preset.archetype?.id || 'gto_neutral';
            const pos = villains[idx]?.position || 'BB';
            // The WHOLE preset is applied — the old handler kept only `range`,
            // so picking "Maniac" left the simulator behaving as GTO Neutral.
            patchVillain(idx, {
              range: preset.range,
              archetype: preset.archetype || { id: archId, name: archId },
              vpip: getArchetypeVPIP(archId, pos),
              customRange: false,
            });
            toast.success(`${preset.archetype?.name || 'Preset'} applied`);
          }}
          onClose={() => setShowVillainPresets(false)}
        />
      )}

      {showCustomDrill && (
        <CustomDrillBuilder
          onClose={() => setShowCustomDrill(false)}
          onStartDrill={(params) => { setDrillParams(params); setShowCustomDrill(false); setShowQuickDrill(true); }}
        />
      )}

      {showQuickDrill && (
        <QuickSpotDrill customParams={drillParams} onClose={() => { setShowQuickDrill(false); setDrillParams(null); }} />
      )}

      {showSessionReport && (
        <SessionReport
          sessionLog={sessionLog}
          coachStreak={coachStreak}
          sessionStartedAt={sessionStartedAtRef.current}
          onClose={() => setShowSessionReport(false)}
        />
      )}

      {showHandReplay && (
        <HandReplay
          sessionLog={sessionLog}
          onLoadScenario={(entry) => { loadSessionEntry(entry); setShowHandReplay(false); }}
          onClose={() => setShowHandReplay(false)}
        />
      )}

      {showStudyFolders && (
        <StudyFolders onLoadTarget={(state) => restoreScenario(state)} onClose={() => setShowStudyFolders(false)} />
      )}

      {showSaveHand && (
        <SaveHandModal sandboxState={sandboxSnapshot} onSaveComplete={() => setShowSaveHand(false)} onClose={() => setShowSaveHand(false)} />
      )}

      {showShareScenario && (
        <ShareScenarioModal sandboxState={sandboxSnapshot} onClose={() => setShowShareScenario(false)} />
      )}

      {showGodMode && (
        <GodModePanel
          onClose={() => setShowGodMode(false)}
          sandboxState={sandboxSnapshot}
          setResults={(mock) => {
            if (!mock) return;
            const freqs = mock.frequencies || {};
            const ev = Number(mock.evDelta) || 0;
            setResultsOverride({
              optimalAction: { id: String(mock.optimalAction || '').toLowerCase(), label: mock.optimalAction, frequency: 100, color: T.success },
              actions: Object.entries(freqs).map(([label, f]) => ({
                id: label.toLowerCase(), label, frequency: Number(f) || 0, isOptimal: label === mock.optimalAction,
              })),
              isMixed: false,
              ev: { hero: ev, heroDisplay: `${ev >= 0 ? '+' : ''}${ev.toFixed(2)} BB`, max: ev, min: ev, avg: ev, evLoss: 0 },
              matchTier: 4,
              source: 'God Mode Override',
              explanation: `Forced override: ${mock.optimalAction} at 100% (sizing ${mock.gtoSizing || 'N/A'}).`,
            });
            setShowResults(true);
            toast('God Mode result injected');
          }}
        />
      )}

      {showSolverImport && (
        <ExternalSolverImport
          onClose={() => setShowSolverImport(false)}
          onImport={(state) => {
            if (!state) return;
            restoreScenario({ ...state, heroStack: state.effStack ?? state.heroStack });
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(null), 2000);
          }}
        />
      )}

      <RangeHeatGrid
        boardCards={communityCards}
        isOpen={showRangeGrid}
        onClose={() => setShowRangeGrid(false)}
        villainRange={villainRangeStr}
        villainLabel={villains[0]?.position || 'Villain'}
      />

      {/* ═══════════════════ RESULTS SHEET (tabbed) ═══════════════════ */}
      <BottomSheet
        isOpen={!!displayResults && showResults}
        onClose={() => setShowResults(false)}
        title={`Analysis${comparePosition ? ` (${comparePosition})` : ''}`}
        subtitle={isHistoricView ? `${streetHistory[activeStreet]?.street || 'Past street'} — archived` : `${currentStreet} · ${potSize.toFixed(1)} BB pot`}
        labelledBy="pa-results-title"
        maxWidth={640}
        footer={canDeal ? (
          <button type="button" className="pa-btn" onClick={dealAndCoach} style={btn('success', { block: true })}>
            <PlayCircle size={18} strokeWidth={2} aria-hidden="true" />
            Deal {board.turn ? 'river' : 'turn'} &amp; re-analyze
          </button>
        ) : null}
      >
        {displayResults && (
          <div id="results-panel" ref={exportCardRef}>
            {/* Sticky tab bar */}
            <div
              role="tablist" aria-label="Analysis sections"
              style={{
                position: 'sticky', top: -S.lg, zIndex: 2, background: T.surface,
                marginTop: -S.lg, paddingTop: S.lg, paddingBottom: S.sm,
                display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: S.sm,
              }}
            >
              {[['verdict', 'Verdict'], ['deep', 'Deep dive'], ['share', 'Share']].map(([id, label]) => (
                <button
                  key={id} type="button" className="pa-btn" role="tab" aria-selected={resultsTab === id}
                  onClick={() => selectResultsTab(id)}
                  style={{ ...btn(resultsTab === id ? 'primary' : 'secondary'), padding: '0 8px', fontSize: F.label }}
                >{label}</button>
              ))}
            </div>

            {isHistoricView && (
              <button
                type="button" className="pa-btn"
                onClick={() => setActiveStreet(streetHistory.length)}
                style={{ ...btn('secondary', { block: true }), marginBottom: S.md, color: T.accent }}
              >
                Back to the current street
              </button>
            )}

            {/* ─────────── VERDICT ─────────── */}
            {resultsTab === 'verdict' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                {sourceBadge && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: S.sm }}>
                    <span style={{
                      padding: '5px 12px', borderRadius: R.pill, fontSize: F.caption, fontWeight: 700,
                      background: sourceBadge.bg, border: `1px solid ${sourceBadge.border}`, color: sourceBadge.text,
                    }}>{sourceBadge.label}</span>
                    <span style={{ fontSize: F.caption, color: T.textMuted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {displayResults.source}
                    </span>
                  </div>
                )}

                {quizMode && (
                  <QuizPanel
                    onGuess={handleQuizGuess}
                    correctAction={activeSpot?.correct_action || displayResults.optimalAction?.label}
                    revealed={quizRevealed}
                    userGuess={userGuess}
                    score={quizScore}
                    prompt={activeSpot?.description || null}
                  />
                )}

                {coachMode && coachUserPick && (
                  <CoachVerdict
                    userPick={coachUserPick}
                    gtoAction={displayResults.optimalAction?.label}
                    evDelta={coachEvDelta}
                    evDeltaEstimated={coachEvEstimated}
                  />
                )}

                {coachMode && coachUserPick && (
                  <CoachFeedback
                    results={displayResults}
                    heroHand={heroHand}
                    heroPosition={heroPosition}
                    coachUserPick={coachUserPick}
                    isCorrect={gradeAction(coachUserPick, displayResults.optimalAction?.label)}
                    board={board}
                    villain={villains[0] || null}
                    onDrill={(spot) => {
                      const street = String(spot?.street || currentStreet || 'flop').toLowerCase();
                      setDrillParams({
                        street: ['preflop', 'flop', 'turn', 'river'].includes(street) ? street : 'flop',
                        position: spot?.position || heroPosition,
                        limit: 10,
                      });
                      setShowResults(false);
                      setShowQuickDrill(true);
                    }}
                  />
                )}

                {coachMode && recentResults.length >= 3 && <TiltMonitor recentResults={recentResults} />}

                {displayResults.optimalAction && (
                  <div style={{
                    background: T.successSoft, border: `1px solid rgba(34,197,94,0.3)`,
                    borderRadius: R.md, padding: S.lg, textAlign: 'center',
                  }}>
                    <div style={{ ...sectionTitle, marginBottom: S.xs }}>
                      {displayResults.isMixed ? 'Primary (mixed)' : 'Optimal (pure)'}
                    </div>
                    <div style={{ fontSize: F.h1, fontWeight: 800, color: displayResults.optimalAction.color || T.success, lineHeight: 1.2 }}>
                      {displayResults.optimalAction.label}
                    </div>
                    <div style={{ fontSize: F.h3, fontWeight: 700, color: T.text, ...NUM }}>
                      {displayResults.optimalAction.frequency}%
                    </div>
                  </div>
                )}

                {getResultsSummary(displayResults) && (
                  <p style={{
                    ...cardCompact, background: T.accentSoft, border: `1px solid rgba(69,153,255,0.25)`,
                    fontSize: F.bodySm, lineHeight: 1.45, color: T.text, margin: 0, textTransform: 'none',
                  }}>
                    {getResultsSummary(displayResults)}
                  </p>
                )}

                {displayResults.ev?.heroDisplay && displayResults.ev.heroDisplay !== '—' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: S.sm }}>
                    {[
                      { l: 'Hand EV', v: displayResults.ev.heroDisplay, c: displayResults.ev.hero >= 0 ? T.success : T.danger },
                      { l: 'EV loss', v: displayResults.ev.evLoss > 0 ? `-${displayResults.ev.evLoss.toFixed(2)}` : '0.00', c: displayResults.ev.evLoss > 0 ? T.danger : T.success },
                      { l: 'Avg EV', v: `${displayResults.ev.avg >= 0 ? '+' : ''}${displayResults.ev.avg.toFixed(2)}`, c: T.textMuted },
                    ].map(item => (
                      <div key={item.l} style={{ background: T.surface2, borderRadius: R.sm, padding: S.md, textAlign: 'center' }}>
                        <div style={{ fontSize: F.caption, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{item.l}</div>
                        <div style={{ fontSize: F.h3, fontWeight: 700, color: item.c, marginTop: 2, ...NUM }}>{item.v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {gameType === 'tournament' && displayResults.icmAdjusted && displayResults.icmEV && (
                  <div style={{ ...cardCompact, background: T.warnSoft, border: `1px solid rgba(251,191,36,0.25)`, display: 'flex', alignItems: 'center', gap: S.sm }}>
                    <span style={{ fontSize: F.caption, color: T.warn, fontWeight: 700, textTransform: 'uppercase' }}>
                      ICM EV ({Number(displayResults.bubbleFactor || bubbleFactor).toFixed(1)}x)
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: F.h3, fontWeight: 700, color: displayResults.icmEV.hero >= 0 ? T.success : T.danger, ...NUM }}>
                      {displayResults.icmEV.heroDisplay}
                    </span>
                  </div>
                )}

                <div style={{ ...cardCompact, background: T.surface2 }}>
                  <h4 style={{ ...sectionTitle, marginBottom: S.md }}>GTO frequencies</h4>
                  {displayResults.actions?.map(a => <FrequencyBar key={a.id} action={a} isOptimal={a.isOptimal} />)}
                </div>

                {displayResults.explanation && (
                  <div style={{ ...cardCompact, background: T.accentSoft, border: `1px solid rgba(69,153,255,0.2)` }}>
                    <h4 style={{ ...sectionTitle, marginBottom: S.xs }}>Analysis</h4>
                    <p style={{ color: T.text, fontSize: F.bodySm, lineHeight: 1.45, margin: 0, textTransform: 'none' }}>
                      {displayResults.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ─────────── DEEP DIVE ─────────── */}
            {resultsTab === 'deep' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                <ExploitToggle mode={exploitMode} onToggle={setExploitMode} exploitTip={exploitTip} />

                <NodeLockExploits
                  isVisible={showNodeLocks}
                  villains={villains}
                  updateVillainLock={(vid, lockType) => {
                    setVillains(v => v.map((villain, idx) => ((villain.id ?? idx) === vid ? { ...villain, nodeLock: lockType } : villain)));
                    const evNow = Number(displayResults?.ev?.hero);
                    setLockEvPreview(Number.isFinite(evNow) ? { before: evNow, after: null } : null);
                  }}
                  evPreview={lockEvPreview}
                  onReanalyze={async () => {
                    // Deliberately NOT runAnalysis(): that appends a second
                    // session-log row and re-grades the SAME coach decision,
                    // double-counting the streak and POSTing a duplicate
                    // coach-result row. A node-lock re-run is a pure re-solve.
                    setResultsOverride(null);
                    const data = await analyzeWithoutCoach(buildAnalyzePayload());
                    if (data?.success) {
                      playAnalysisDing();
                      toast.success('Re-solved with your node locks');
                    } else {
                      toast.error('Could not re-run the analysis');
                    }
                  }}
                />

                {showHeatmap && communityCards.length >= 3 && (
                  <div style={{ position: 'relative', height: 220, borderRadius: R.md, overflow: 'hidden', background: T.bg, border: `1px solid ${T.border}` }}>
                    <EquityHeatmapOverlay
                      isVisible={showHeatmap}
                      board={communityCards}
                      heroPosition={heroPosition}
                      villains={villains}
                      equity={equity}
                    />
                  </div>
                )}

                <EquityGraph
                  streetHistory={streetHistory}
                  currentEquity={equity?.heroEquity}
                  currentStreet={currentStreet}
                  onSelectStreet={(i) => setActiveStreet(Math.min(i, streetHistory.length))}
                  verdicts={streetHistory.map(s => s.isCorrect)}
                />

                <TreeVisualization
                  actions={displayResults.actions}
                  archetypeId={villains[0]?.archetype?.id || 'gto_neutral'}
                  potSize={potSize}
                  heroEquity={equity?.heroEquity}
                  boardTexture={boardTexture}
                  onAppendLine={(heroAction, villainResponse) => {
                    addAction({
                      position: heroPosition, action: heroAction.id || 'bet_66',
                      label: heroAction.label, street: currentStreet, isHero: true,
                    });
                    setShowResults(false);
                    toast(`Line added: ${heroAction.label} → ${villainResponse.label}`);
                  }}
                />

                <SizingSensitivity results={displayResults} />

                {displayResults.rangeHeatmap && (
                  <div style={{ ...cardCompact, background: T.surface2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: S.sm, marginBottom: S.md, flexWrap: 'wrap' }}>
                      <h4 style={{ ...sectionTitle, margin: 0 }}>
                        Range heatmap ({displayResults.rangeHeatmap.totalHands})
                      </h4>
                      <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                        {displayResults.rangeHeatmap.actions?.slice(0, 4).map(a => {
                          const on = (selectedHeatmapAction || displayResults.rangeHeatmap.actions[0]?.id) === a.id;
                          return (
                            <button
                              key={a.id} type="button" className="pa-btn"
                              onClick={() => setSelectedHeatmapAction(a.id)}
                              aria-pressed={on}
                              style={{ ...btn(on ? 'primary' : 'secondary'), padding: '0 12px', fontSize: F.caption }}
                            >{a.label}</button>
                          );
                        })}
                      </div>
                    </div>
                    <RangeMatrix
                      rangeHeatmap={displayResults.rangeHeatmap}
                      selectedAction={selectedHeatmapAction}
                      onPickHand={(handKey) => {
                        if (!handKey || handKey.length < 2) return;
                        const suited = handKey.endsWith('s');
                        pushUndo();
                        setHeroHand({ card1: `${handKey[0]}s`, card2: `${handKey[1]}${suited ? 's' : 'h'}` });
                        toast.success(`${handKey} loaded`);
                      }}
                    />
                  </div>
                )}

                {villains?.[0] && <VillainReadCard villain={villains[0]} />}

                {villains?.[0]?.range && (
                  <div>
                    <button
                      type="button" className="pa-btn"
                      onClick={() => setShowVillainRange(v => !v)}
                      aria-expanded={showVillainRange}
                      style={{ ...btn(showVillainRange ? 'primary' : 'secondary', { block: true }), justifyContent: 'space-between' }}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Villain range ({villains[0].archetype?.name || 'Unknown'})
                      </span>
                      {showVillainRange ? <ChevronUp size={18} strokeWidth={2} aria-hidden="true" /> : <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />}
                    </button>
                    {showVillainRange && (
                      <div style={{ ...cardCompact, marginTop: S.sm, background: T.bg }}>
                        <div style={{ ...sectionTitle, marginBottom: S.xs }}>
                          VPIP {villains[0].vpip ?? '—'}% · opening range
                        </div>
                        <p style={{ fontSize: F.caption, color: T.textMuted, fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-all', margin: 0, textTransform: 'none' }}>
                          {villains[0].range}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Compare position — lives here so it is never full-bleed */}
                <div style={{ ...cardCompact, background: T.surface2 }}>
                  <h4 style={{ ...sectionTitle, marginBottom: S.md }}>Compare position</h4>
                  <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                    {POSITIONS.map(p => {
                      const on = comparePosition ? comparePosition === p : heroPosition === p;
                      return (
                        <button
                          key={p} type="button" className="pa-btn"
                          onClick={() => (p === heroPosition ? restorePrimaryResults() : runPositionComparison(p))}
                          disabled={isAnalyzing}
                          aria-pressed={on}
                          style={{ ...btn(on ? 'primary' : 'secondary', { disabled: isAnalyzing }), flex: '1 0 72px', padding: '0 10px' }}
                        >{p}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ─────────── SHARE & TRAIN ─────────── */}
            {resultsTab === 'share' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                <ExportCard
                  results={displayResults}
                  scenario={{
                    position: heroPosition,
                    hand: `${heroHand.card1 || '?'}${heroHand.card2 || '?'}`,
                    board: communityCards.join(' ') || 'Preflop',
                  }}
                  equity={equity}
                  villainRange={villainRangeStr}
                />

                <button type="button" className="pa-btn" onClick={() => setShowShareHand(true)} style={btn('primary', { block: true })}>
                  <Camera size={18} strokeWidth={2} aria-hidden="true" />Share hand
                </button>

                <button type="button" className="pa-btn" onClick={copyShareLink} style={btn('secondary', { block: true })}>
                  <Share2 size={18} strokeWidth={2} aria-hidden="true" />Copy share link
                </button>

                <button type="button" className="pa-btn" onClick={() => { setShowResults(false); setShowShareScenario(true); }} style={btn('secondary', { block: true })}>
                  Share scenario (short link)
                </button>

                <button
                  type="button" className="pa-btn"
                  onClick={() => {
                    const hand = `${heroHand.card1 || ''}${heroHand.card2 || ''}`;
                    const boardStr = communityCards.filter(Boolean).join(' ');
                    const street = streetOfBoard(board);
                    const tags = [
                      heroPosition?.toLowerCase(), street, gameType?.toLowerCase(),
                      Number(heroStack) < 20 ? 'short stack' : null,
                      Number(heroStack) < 20 ? 'push fold' : null,
                    ].filter(Boolean);
                    const ctx = {
                      ref: 'sandbox', vid: hand || 'sandbox',
                      title: `${heroPosition || 'Hero'} vs ${boardStr || 'Preflop'} — ${gameType || 'NLH'}`.slice(0, 80),
                      source: 'Sandbox', tags,
                    };
                    let games = [];
                    let gameIds = [];
                    try {
                      gameIds = findBestGames(ctx) || [];
                      // Lazy require avoids a Webpack circular initialisation
                      const { getGameById: lookupGame } = require('../../../src/data/TRAINING_LIBRARY');
                      games = gameIds.map(id => lookupGame(id)).filter(Boolean).slice(0, 3);
                    } catch (e) { console.warn('[Sandbox] training match failed:', e?.message || e); }
                    setTtsOverlay({ ctx, games, hand, board: boardStr, street });
                    fetch('/api/training/log-request', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ref: 'sandbox', vid: ctx.vid, title: ctx.title, source: 'Sandbox', tags, matchedGameIds: gameIds.slice(0, 3) }),
                    }).catch(() => { });
                  }}
                  style={{ ...btn('success', { block: true }) }}
                >
                  <Layers size={18} strokeWidth={2} aria-hidden="true" />Train this spot
                </button>

                <button type="button" className="pa-btn" onClick={() => { setShowResults(false); setShowSessionReport(true); }} style={btn('secondary', { block: true })}>
                  <BookOpen size={18} strokeWidth={2} aria-hidden="true" />Session report
                </button>

                {studySessions.length > 0 && (
                  <StudyReplayCard
                    session={studySessions[studyIndex]}
                    index={studyIndex}
                    total={studySessions.length}
                    onNext={() => setStudyIndex(i => Math.min(i + 1, studySessions.length - 1))}
                    onPrev={() => setStudyIndex(i => Math.max(i - 1, 0))}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <ShareHandModal
        isOpen={showShareHand}
        onClose={() => setShowShareHand(false)}
        results={displayResults}
        heroHand={heroHand}
        board={board}
        scenario={{ position: heroPosition }}
        cardRef={exportCardRef}
      />

      {/* ═══ Train This Spot ═══ */}
      <BottomSheet
        isOpen={!!ttsOverlay}
        onClose={() => setTtsOverlay(null)}
        title="Train this spot"
        subtitle="Drills matched to your hand"
        labelledBy="pa-tts-title"
        footer={(
          <button type="button" className="pa-btn" onClick={() => { setTtsOverlay(null); router.push('/hub/training'); }} style={btn('secondary', { block: true })}>
            Browse all training games
          </button>
        )}
      >
        {ttsOverlay && (
          <>
            <div style={{ ...cardCompact, background: T.surface2, marginBottom: S.lg, display: 'flex', alignItems: 'center', gap: S.md, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: S.xs }}>
                {ttsOverlay.hand
                  ? (ttsOverlay.hand.match(/.{2}/g) || []).map((c, i) => <TableCard key={i} card={c} style={{ width: 34, height: 48 }} />)
                  : <span style={{ fontSize: F.caption, color: T.textDim }}>No hand set</span>}
              </div>
              <div style={{ fontSize: F.caption, color: T.textMuted, minWidth: 0 }}>
                <span style={{ textTransform: 'capitalize', fontWeight: 700, color: T.accent }}>{ttsOverlay.street}</span>
                {ttsOverlay.board ? ` · ${ttsOverlay.board}` : ''}
              </div>
            </div>

            {ttsOverlay.games.length === 0 ? (
              <EmptyState
                icon={<Target size={24} strokeWidth={2} aria-hidden="true" />}
                title="No matching drill yet"
                body="We could not match this spot to a training game. Browse the full library instead."
              />
            ) : ttsOverlay.games.map((game, idx) => (
              <button
                key={game.id} type="button" className="pa-btn"
                onClick={() => { setTtsOverlay(null); router.push(`/hub/training?autoLaunch=${game.id}`); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: S.md, width: '100%', minHeight: 60,
                  padding: S.md, marginBottom: S.sm, borderRadius: R.sm, textAlign: 'left', cursor: 'pointer',
                  background: idx === 0 ? T.successSoft : T.surface2,
                  border: `1px solid ${idx === 0 ? 'rgba(34,197,94,0.35)' : T.borderHi}`,
                }}
              >
                <span style={{
                  width: 40, height: 40, borderRadius: R.sm, flexShrink: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: idx === 0 ? 'rgba(34,197,94,0.18)' : T.surface,
                  color: idx === 0 ? T.success : T.textMuted,
                }}>
                  <Target size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: F.bodySm, fontWeight: 700, color: idx === 0 ? T.success : T.text }}>{game.name}</span>
                    {idx === 0 && <span style={pill('success')}>Best match</span>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: F.caption, color: T.textMuted, marginTop: 2 }}>
                    {game.focus}
                    <span style={{ display: 'inline-flex', gap: 1, marginLeft: 4 }} aria-label={`Difficulty ${Math.min(game.difficulty || 1, 5)} of 5`}>
                      {Array.from({ length: Math.min(game.difficulty || 1, 5) }).map((_, si) => (
                        <Star key={si} size={12} strokeWidth={2} fill="currentColor" style={{ color: T.warn }} aria-hidden="true" />
                      ))}
                    </span>
                  </span>
                </span>
                <ChevronRight size={18} strokeWidth={2} style={{ color: T.textDim, flexShrink: 0 }} aria-hidden="true" />
              </button>
            ))}
          </>
        )}
      </BottomSheet>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .sandbox-page { min-height: 100vh; min-height: 100dvh; }

        /* Touch feedback is mandatory and must not rely on hover */
        .pa-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .pa-btn:active:not(:disabled) { transform: scale(0.97); filter: brightness(1.12); }
        .pa-btn:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }

        .pa-skel { animation: paSkel 1.4s ease-in-out infinite; }
        @keyframes paSkel { 0%, 100% { opacity: .35 } 50% { opacity: .7 } }
        .pa-spin { animation: paSpin 1s linear infinite; }
        @keyframes paSpin { to { transform: rotate(360deg) } }

        /* Nothing on this page may be smaller than the 16px iOS zoom floor */
        .sandbox-page input,
        .sandbox-page select,
        .sandbox-page textarea { font-size: 16px; }

        /* Two-step picker on phones, classic 4x13 grid on wide screens */
        .deck-grid-only { display: none; }
        @media (min-width: 769px) {
          .deck-grid-only { display: block; }
          .deck-steps-only { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .pa-skel { animation: none; opacity: .5 }
          .pa-spin { animation: none }
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      <BottomNavBar />
    </div>
  );
}
