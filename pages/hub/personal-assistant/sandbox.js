// __PUBLISH_PLACEHOLDER_A__
  // mid-range phone never blocks on it. No worker available (SSR, CSP, ancient
  // webview) => the old requestIdleCallback path, unchanged.
// __PUBLISH_PLACEHOLDER_B__
    const cards = String(entry.board || '').split(' ').filter(Boolean);
    restoreScenario({
// __PUBLISH_CSLOT_00__
  }, [restoreScenario]);

  // ═══════════════════════════════════════════════════════════
  // DERIVED VIEW STATE
  // ═══════════════════════════════════════════════════════════
  const historicResults = (activeStreet < streetHistory.length) ? streetHistory[activeStreet]?.results : null;
  const displayResults = historicResults || resultsOverride || results;
// __PUBLISH_CSLOT_01__
      </div>

      {/* ═══════════════════ SHEETS ═══════════════════ */}

      <CardPickerSheet
// __PUBLISH_CSLOT_02__
      />

      {/* ═══════════════════ RESULTS SHEET (tabbed) ═══════════════════ */}
      <BottomSheet
        isOpen={!!displayResults && showResults}
// __PUBLISH_CSLOT_03__
            )}

            {/* ─────────── VERDICT ─────────── */}
            {resultsTab === 'verdict' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
// __PUBLISH_CSLOT_04__
            )}

            {/* ─────────── DEEP DIVE ─────────── */}
            {resultsTab === 'deep' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
// __PUBLISH_CSLOT_05__
            )}

            {/* ─────────── SHARE & TRAIN ─────────── */}
            {resultsTab === 'share' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
// __PUBLISH_CSLOT_06__
