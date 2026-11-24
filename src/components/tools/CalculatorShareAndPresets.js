/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  REUSABLE CALCULATOR PRESET PILLS & SHARE BAR (src/components/tools/CalculatorShareAndPresets.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Provides 1-click real-world preset pills, shareable scenario permalink copy,
 * formatted Reddit/Discord markdown summary copy, and a Cmd+K Universal Search link.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState } from 'react';
import Link from 'next/link';

export default function CalculatorShareAndPresets({
  toolTitle = 'Smarter.Poker Calculator',
  toolPath = '/tools',
  summaryText = '',
  presets = [],
  onSelectPreset,
  activePresetId,
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = window.location.href || `https://smarter.poker${toolPath}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyMarkdown = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = window.location.href || `https://smarter.poker${toolPath}`;
    const mdSnippet = [
      `**${toolTitle} - Smarter.Poker Scenario Summary**`,
      summaryText ? `> ${summaryText}` : '',
      `Interactive Solver Link: ${shareUrl}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    navigator.clipboard.writeText(mdSnippet);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2500);
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
                  onClick={() => onSelectPreset && onSelectPreset(preset)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '2px',
                    border: isActive ? '1px solid #25c8ff' : '1px solid #334155',
                    background: isActive ? 'rgba(37, 200, 255, 0.14)' : '#101a20',
                    color: isActive ? '#25c8ff' : '#e2e8f0',
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
              background: copiedLink ? '#059669' : '#25c8ff',
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
    </div>
  );
}
