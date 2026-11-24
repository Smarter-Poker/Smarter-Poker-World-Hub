/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  REUSABLE CALCULATOR PRESET PILLS & SHARE BAR (src/components/tools/CalculatorShareAndPresets.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Provides 1-click real-world preset pills, shareable scenario permalink copy,
 * formatted Reddit/Discord markdown summary copy, Cmd+K Universal Search link,
 * plus v2 interactive capabilities:
 *   1. Pin / Save Spot To My Favorites (localStorage sp_saved_spots_v1 + Export JSON)
 *   2. Compare Spot A Vs. Spot B (sessionStorage sp_baseline_spot_${toolSlug})
 *   3. Print / Save PDF Card + Show QR Cheat-Card Preview (/api/seo/qr?path=...)
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const SAVED_SPOTS_STORAGE_KEY = 'sp_saved_spots_v1';

export default function CalculatorShareAndPresets({
  toolTitle,
  toolName,
  toolPath,
  toolSlug,
  summaryText = '',
  presets = [],
  onSelectPreset,
  onApplyPreset,
  activePresetId,
  accentColor = '#25c8ff',
}) {
  const resolvedToolName = toolName || toolTitle || 'Smarter.Poker Calculator';
  const resolvedToolSlug =
    toolSlug ||
    (typeof toolPath === 'string' && toolPath.startsWith('/tools/')
      ? toolPath.replace(/^\/tools\//, '').replace(/\/$/, '')
      : 'poker-tool');
  const resolvedToolPath = toolPath || (toolSlug ? `/tools/${toolSlug}` : '/tools');
  const presetHandler = onSelectPreset || onApplyPreset;

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [pinnedFeedback, setPinnedFeedback] = useState(false);
  const [savedSpots, setSavedSpots] = useState([]);
  const [showSavedDrawer, setShowSavedDrawer] = useState(false);
  const [baselineSpotA, setBaselineSpotA] = useState(null);
  const [showQrCard, setShowQrCard] = useState(false);
  const [currentPath, setCurrentPath] = useState(resolvedToolPath);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCurrentPath(`${window.location.pathname || resolvedToolPath}${window.location.search || ''}`);
    try {
      const rawSaved = window.localStorage.getItem(SAVED_SPOTS_STORAGE_KEY);
      if (rawSaved) {
        const parsed = JSON.parse(rawSaved);
        if (Array.isArray(parsed)) setSavedSpots(parsed);
      }
    } catch (_err) {
      // Ignore storage access errors
    }

    try {
      const baselineKey = `sp_baseline_spot_${resolvedToolSlug}`;
      const rawBaseline = window.sessionStorage.getItem(baselineKey);
      if (rawBaseline) {
        const parsedBaseline = JSON.parse(rawBaseline);
        if (parsedBaseline && parsedBaseline.summaryText) {
          setBaselineSpotA(parsedBaseline);
        }
      }
    } catch (_err) {
      // Ignore sessionStorage errors
    }

    const handleUrlChange = () => {
      setCurrentPath(`${window.location.pathname || resolvedToolPath}${window.location.search || ''}`);
    };
    window.addEventListener('smarterpoker:urlchange', handleUrlChange);
    return () => window.removeEventListener('smarterpoker:urlchange', handleUrlChange);
  }, [resolvedToolPath, resolvedToolSlug]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = window.location.href || `https://smarter.poker${resolvedToolPath}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyMarkdown = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = window.location.href || `https://smarter.poker${resolvedToolPath}`;
    const mdSnippet = [
      `**${resolvedToolName} - Smarter.Poker Scenario Summary**`,
      summaryText ? `> ${summaryText}` : '',
      `Interactive Solver Link: ${shareUrl}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    navigator.clipboard.writeText(mdSnippet);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2500);
  };

  const handlePinSpotToFavorites = () => {
    if (typeof window === 'undefined') return;
    const spotUrl = `${window.location.pathname || resolvedToolPath}${window.location.search || ''}`;
    const newEntry = {
      id: `spot_${Date.now()}`,
      toolSlug: resolvedToolSlug,
      toolName: resolvedToolName,
      summaryText: summaryText || resolvedToolName,
      url: spotUrl,
      savedAt: new Date().toISOString(),
    };
    const nextList = [newEntry, ...savedSpots.filter((s) => s.url !== spotUrl)].slice(0, 50);
    setSavedSpots(nextList);
    try {
      window.localStorage.setItem(SAVED_SPOTS_STORAGE_KEY, JSON.stringify(nextList));
    } catch (_err) {
      // Ignore quota errors
    }
    setPinnedFeedback(true);
    setTimeout(() => setPinnedFeedback(false), 2000);
  };

  const handleDeleteSavedSpot = (spotId) => {
    const nextList = savedSpots.filter((s) => s.id !== spotId);
    setSavedSpots(nextList);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SAVED_SPOTS_STORAGE_KEY, JSON.stringify(nextList));
      } catch (_err) {
        // Ignore storage errors
      }
    }
  };

  const handleClearSavedSpots = () => {
    setSavedSpots([]);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(SAVED_SPOTS_STORAGE_KEY);
      } catch (_err) {
        // Ignore storage errors
      }
    }
  };

  const handleExportSavedSpotsJson = () => {
    if (typeof window === 'undefined') return;
    const payload = JSON.stringify(savedSpots, null, 2);
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'smarter-poker-saved-spots.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_err) {
      if (navigator?.clipboard) {
        navigator.clipboard.writeText(payload);
      }
    }
  };

  const handlePinBaselineSpotA = () => {
    const queryStr = typeof window !== 'undefined' ? window.location.search || '' : '';
    const snap = {
      summaryText: summaryText || 'Pinned Baseline Configuration',
      query: queryStr,
      pinnedAt: new Date().toISOString(),
    };
    setBaselineSpotA(snap);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(`sp_baseline_spot_${resolvedToolSlug}`, JSON.stringify(snap));
      } catch (_err) {
        // Ignore storage errors
      }
    }
  };

  const handleClearBaselineSpotA = () => {
    setBaselineSpotA(null);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`sp_baseline_spot_${resolvedToolSlug}`);
      } catch (_err) {
        // Ignore storage errors
      }
    }
  };

  const handlePrintPdfCard = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  return (
    <div
      style={{
        background: '#020608',
        border: '1px solid #1e293b',
        borderRadius: '2px',
        padding: '14px 16px',
        marginBottom: 18,
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: '@media print { body { background: #fff !important; color: #000 !important; } }',
        }}
      />

      {Array.isArray(presets) && presets.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}
          >
            Load Real-World Scenario Preset
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {presets.map((preset) => {
              const isActive = activePresetId && activePresetId === preset.id;
              return (
                <button
                  key={preset.id || preset.label}
                  type="button"
                  onClick={() => presetHandler && presetHandler(preset)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '2px',
                    border: isActive ? `1px solid ${accentColor}` : '1px solid #334155',
                    background: isActive ? 'rgba(37, 200, 255, 0.14)' : '#101a20',
                    color: isActive ? accentColor : '#e2e8f0',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Side-By-Side Comparison Bar when Baseline Spot A is pinned */}
      {baselineSpotA && (
        <div
          style={{
            background: '#101a20',
            border: `1px solid ${accentColor}`,
            borderRadius: '2px',
            padding: '12px 14px',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: accentColor, textTransform: 'uppercase' }}>
              Compare Spot A Vs. Spot B
            </span>
            <button
              type="button"
              onClick={handleClearBaselineSpotA}
              style={{
                padding: '4px 10px',
                background: '#020608',
                color: '#f87171',
                border: '1px solid #f87171',
                borderRadius: '2px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Clear Baseline
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            <div style={{ background: '#020608', padding: 10, borderRadius: '2px', border: '1px solid #334155' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#f2b84b', marginBottom: 4 }}>
                Baseline Spot A
              </div>
              <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.45 }}>
                {baselineSpotA.summaryText}
              </div>
            </div>
            <div style={{ background: '#020608', padding: 10, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#34d399', marginBottom: 4 }}>
                Current Spot B
              </div>
              <div style={{ fontSize: 12.5, color: '#f8fafc', lineHeight: 1.45 }}>
                {summaryText || 'Adjust Controls Above To Compare Against Baseline Spot A'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={handleCopyScenarioLink}
            style={{
              padding: '7px 13px',
              background: copiedLink ? '#059669' : accentColor,
              color: '#020608',
              border: 0,
              borderRadius: '2px',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {copiedLink ? 'Copied Scenario Link!' : 'Copy Shareable Scenario Link'}
          </button>

          <button
            type="button"
            onClick={handleCopyMarkdown}
            style={{
              padding: '7px 13px',
              background: copiedMarkdown ? '#059669' : '#101a20',
              color: copiedMarkdown ? '#020608' : '#34d399',
              border: '1px solid #34d399',
              borderRadius: '2px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {copiedMarkdown ? 'Copied Markdown Summary!' : 'Copy Reddit / Discord Markdown'}
          </button>

          <button
            type="button"
            onClick={handlePinSpotToFavorites}
            style={{
              padding: '7px 12px',
              background: pinnedFeedback ? '#059669' : '#101a20',
              color: pinnedFeedback ? '#020608' : '#f2b84b',
              border: '1px solid #f2b84b',
              borderRadius: '2px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {pinnedFeedback ? 'Pinned To Favorites!' : 'Pin Spot To Favorites'}
          </button>

          <button
            type="button"
            onClick={() => setShowSavedDrawer((prev) => !prev)}
            style={{
              padding: '7px 12px',
              background: showSavedDrawer ? 'rgba(242, 184, 75, 0.16)' : '#101a20',
              color: '#f2b84b',
              border: '1px solid #334155',
              borderRadius: '2px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {`My Saved Spots (${savedSpots.length})`}
          </button>

          <button
            type="button"
            onClick={handlePinBaselineSpotA}
            style={{
              padding: '7px 12px',
              background: baselineSpotA ? 'rgba(37, 200, 255, 0.16)' : '#101a20',
              color: '#25c8ff',
              border: '1px solid #334155',
              borderRadius: '2px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Pin As Baseline Spot A
          </button>

          <button
            type="button"
            onClick={handlePrintPdfCard}
            style={{
              padding: '7px 12px',
              background: '#101a20',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: '2px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Print / Save PDF Card
          </button>

          <button
            type="button"
            onClick={() => setShowQrCard((prev) => !prev)}
            style={{
              padding: '7px 12px',
              background: showQrCard ? 'rgba(52, 211, 153, 0.16)' : '#101a20',
              color: '#34d399',
              border: '1px solid #334155',
              borderRadius: '2px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Show QR Cheat-Card
          </button>
        </div>

        <Link
          href="/search"
          style={{
            padding: '6px 11px',
            background: '#101a20',
            border: '1px solid #334155',
            borderRadius: '2px',
            color: '#f2b84b',
            fontSize: 12,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Open In Universal Search (Cmd+K)
        </Link>
      </div>

      {/* Inline Saved Spots Drawer */}
      {showSavedDrawer && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: '#101a20',
            border: '1px solid #334155',
            borderRadius: '2px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 800, color: '#f2b84b', textTransform: 'uppercase' }}>
              Pinned Favorite Spots ({savedSpots.length})
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleExportSavedSpotsJson}
                style={{
                  padding: '4px 10px',
                  background: '#020608',
                  color: '#34d399',
                  border: '1px solid #34d399',
                  borderRadius: '2px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={handleClearSavedSpots}
                style={{
                  padding: '4px 10px',
                  background: '#020608',
                  color: '#f87171',
                  border: '1px solid #f87171',
                  borderRadius: '2px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Clear Saved
              </button>
            </div>
          </div>

          {savedSpots.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#94a3b8' }}>
              No Pinned Spots Yet. Click Pin Spot To Favorites Above To Bookmark Any Solved Scenario Across Sessions.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {savedSpots.map((spot) => (
                <div
                  key={spot.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: '#020608',
                    border: '1px solid #1e293b',
                    borderRadius: '2px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <a
                      href={spot.url}
                      style={{
                        color: '#25c8ff',
                        fontSize: 12.5,
                        fontWeight: 700,
                        textDecoration: 'none',
                        display: 'block',
                      }}
                    >
                      {spot.toolName}
                    </a>
                    <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2 }}>
                      {spot.summaryText}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteSavedSpot(spot.id)}
                    style={{
                      padding: '4px 8px',
                      background: '#101a20',
                      color: '#f87171',
                      border: '1px solid #334155',
                      borderRadius: '2px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toggleable QR Cheat-Card Preview */}
      {showQrCard && (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            background: '#101a20',
            border: '1px solid #34d399',
            borderRadius: '2px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          <div style={{ flex: '1 1 280px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
              Smarter.Poker Printable Spot Cheat-Card
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
              {resolvedToolName}
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4, lineHeight: 1.5 }}>
              {summaryText || 'Interactive GTO Solver & Quantitative Poker Reference Card'}
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6, fontFamily: 'monospace' }}>
              {`https://smarter.poker${currentPath}`}
            </div>
          </div>
          <div
            style={{
              background: '#ffffff',
              padding: 6,
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={'/api/seo/qr?path=' + encodeURIComponent(currentPath)}
              alt="Spot QR Code"
              width={88}
              height={88}
            />
          </div>
        </div>
      )}
    </div>
  );
}
