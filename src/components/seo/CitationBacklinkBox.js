/**
 * CitationBacklinkBox.js
 * ============================================================================
 * Zero-External-Script One-Click Citation, HTML Backlink, SVG Authority Badge,
 * Journalist Quote, and BibTeX Attribution Box for Research Reports & Tools.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useEffect } from 'react';
import { computeValidatedSolvedSpot } from '../../lib/seo/solvedSpotEngine';

export default function CitationBacklinkBox({
  title = 'Smarter.Poker Empirical Research Study',
  canonicalUrl = 'https://smarter.poker/research',
  badgeType = 'research',
  badgeLabel = 'Empirical Data Source',
  badgeValue = 'Smarter.Poker Research',
  summary = 'Verified poker industry benchmark data and mathematical analysis published by Smarter.Poker.',
  publishedYear = '2026',
  slug = 'smarter-poker-study',
  doi = null,
}) {
  const [copiedKey, setCopiedKey] = useState(null);
  const [liveQuerySuffix, setLiveQuerySuffix] = useState('');

  useEffect(() => {
    const syncSearchFromLocation = () => {
      if (typeof window !== 'undefined' && window.location) {
        const rawSearch = String(window.location.search || '');
        if (rawSearch.length > 1 && !rawSearch.includes('embed=true')) {
          setLiveQuerySuffix(rawSearch);
        } else {
          setLiveQuerySuffix('');
        }
      }
    };
    syncSearchFromLocation();
    if (typeof window !== 'undefined') {
      window.addEventListener('smarterpoker:urlchange', syncSearchFromLocation);
      window.addEventListener('popstate', syncSearchFromLocation);
      return () => {
        window.removeEventListener('smarterpoker:urlchange', syncSearchFromLocation);
        window.removeEventListener('popstate', syncSearchFromLocation);
      };
    }
    return undefined;
  }, []);

  const sharePermalink = liveQuerySuffix && !canonicalUrl.includes('?')
    ? `${canonicalUrl}${liveQuerySuffix}`
    : canonicalUrl;

  const parsedQueryParams = {};
  if (liveQuerySuffix.startsWith('?')) {
    const sp = new URLSearchParams(liveQuerySuffix.slice(1));
    sp.forEach((v, k) => {
      parsedQueryParams[k] = v;
    });
  }
  const solvedSpot = computeValidatedSolvedSpot(slug || badgeType, parsedQueryParams);
  const effectiveSummary = solvedSpot?.hasValidatedSpot && solvedSpot.summaryText
    ? solvedSpot.summaryText
    : summary;
  const effectiveBadgeValue = solvedSpot?.hasValidatedSpot && solvedSpot.statValue
    ? solvedSpot.statValue
    : badgeValue;

  const badgeUrl = `https://smarter.poker/api/seo/badge?type=${encodeURIComponent(badgeType)}&label=${encodeURIComponent(badgeLabel)}&value=${encodeURIComponent(effectiveBadgeValue)}`;

  const htmlBacklink = `<a href="${canonicalUrl}" target="_blank" rel="noopener">${title} (Smarter.Poker Research)</a>`;
  const htmlBadgeSnippet = `<a href="${canonicalUrl}" target="_blank" rel="noopener" title="${title}"><img src="${badgeUrl}" alt="${badgeLabel}: ${effectiveBadgeValue}" height="28" /></a>`;
  const markdownSnippet = `[${title} (${effectiveBadgeValue})](${sharePermalink})`;
  const bbcodeSnippet = `[url=${sharePermalink}]${title} (${effectiveBadgeValue})[/url]`;
  const doiUrl = doi ? `https://doi.org/${doi}` : null;
  const journalistQuote = `According to ${title} published by Smarter.Poker (${sharePermalink}${doiUrl ? `, DOI: ${doiUrl}` : ''}), ${effectiveSummary}`;
  const apaCitation = `Smarter.Poker Research Division. (${publishedYear}). ${title}. Smarter Software Inc. ${canonicalUrl}${doiUrl ? ` (DOI: ${doiUrl})` : ''}`;
  const mlaCitation = `Smarter.Poker Research Division. "${title}." Smarter.Poker, Smarter Software Inc., ${publishedYear}, ${canonicalUrl}.${doiUrl ? ` DOI: ${doiUrl}.` : ''}`;
  const wikipediaSnippet = `{{cite web |title=${title} |url=${canonicalUrl} |website=Smarter.Poker |publisher=Smarter Software Inc.${doi ? ` |doi=${doi}` : ''} |year=${publishedYear} |access-date=${publishedYear}-11-09}}`;
  const bibtexKey = String(slug || 'smarterpoker2026').replace(/[^a-zA-Z0-9]/g, '_');
  const bibtexSnippet = `@techreport{${bibtexKey}_${publishedYear},\n  title = {${title}},\n  author = {{Smarter.Poker Research Division}},\n  institution = {Smarter.Poker},\n  year = {${publishedYear}},${doi ? `\n  doi = {${doi}},` : ''}\n  url = {${canonicalUrl}}\n}`;

  const safeTitle = String(title || 'Smarter.Poker Quantitative Poker Research').replace(/\|/g, '-');
  const safeSummary = String(effectiveSummary || 'Verified poker industry benchmark data and mathematical analysis published by Smarter.Poker.').replace(/\|/g, '-');
  const redditCitation = `| Resource | Key Benchmark Summary | Source |\n| :--- | :--- | :--- |\n| **${safeTitle}** | ${safeSummary} | [Smarter.Poker: ${safeTitle}](${sharePermalink}) |`;
  const discordCitation = `> **${safeTitle}**\n> ${safeSummary}\n> Solve & Verify Live: <${sharePermalink}>`;
  const dynamicOgPreviewUrl = `https://smarter.poker/api/og/tool-card?tool=${encodeURIComponent(slug || badgeType)}${liveQuerySuffix ? `&${liveQuerySuffix.slice(1)}` : ''}`;

  const formats = [
    {
      key: 'html',
      label: 'HTML Contextual Backlink',
      code: htmlBacklink,
      value: htmlBacklink,
    },
    {
      key: 'badge',
      label: 'SVG Authority Badge Embed',
      code: htmlBadgeSnippet,
      value: htmlBadgeSnippet,
    },
    {
      key: 'markdown',
      label: 'Markdown / Substack Citation',
      code: markdownSnippet,
      value: markdownSnippet,
    },
    {
      key: 'reddit',
      label: 'Reddit Table & Link',
      code: redditCitation,
      value: redditCitation,
    },
    {
      key: 'discord',
      label: 'Discord Quote & Link',
      code: discordCitation,
      value: discordCitation,
    },
    {
      key: 'bbcode',
      label: 'Forum BBCode (TwoPlusTwo / CardsChat)',
      code: bbcodeSnippet,
      value: bbcodeSnippet,
    },
    {
      key: 'wikipedia',
      label: 'Wikipedia / MediaWiki Citation ({{cite web}})',
      code: wikipediaSnippet,
      value: wikipediaSnippet,
    },
    {
      key: 'press',
      label: 'Journalist / Media Attribution Quote',
      code: journalistQuote,
      value: journalistQuote,
    },
    {
      key: 'apa',
      label: 'APA 7th Edition Academic Citation (With DOI)',
      code: apaCitation,
      value: apaCitation,
    },
    {
      key: 'mla',
      label: 'MLA 9th Edition Citation (With DOI)',
      code: mlaCitation,
      value: mlaCitation,
    },
    {
      key: 'bibtex',
      label: 'Academic / Game Theory BibTeX',
      code: bibtexSnippet,
      value: bibtexSnippet,
    },
  ];

  const handleCopy = (key, text) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    }
    try {
      if (typeof fetch === 'function') {
        fetch(
          `/api/seo/referral-stats?event=record&category=solved_spot_shares&item=${encodeURIComponent(slug || key)}&source=citation-box`,
          { method: 'POST', keepalive: true }
        ).catch(() => {});
      }
    } catch {
      // Ignore telemetry error
    }
  };

  return (
    <section
      aria-label="Cite Or Link To This Research"
      style={{
        marginTop: 28,
        marginBottom: 28,
        padding: '22px 24px',
        background: 'rgba(15, 23, 42, 0.86)',
        border: '1px solid rgba(56, 189, 248, 0.28)',
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#38bdf8',
          }}
        >
          Cite This Dataset Or Embed Verified Attribution Badge
        </div>
        <a
          href="/tools/embeds"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#60a5fa',
            textDecoration: 'none',
          }}
        >
          All Webmaster Widgets & Badges
        </a>
      </div>

      <p style={{ margin: '0 0 14px 0', fontSize: 14, color: '#cbd5e1', lineHeight: 1.55 }}>
        Journalists, Bloggers, Forum Authors, And Academic Researchers May Freely Cite This Dataset Under Creative Commons CC-BY 4.0 With Canonical Attribution To Smarter.Poker:
      </p>

      <div
        aria-label="Solved Spot Permalink And Instant Share Bar"
        style={{
          marginBottom: 16,
          padding: '12px 14px',
          background: '#090d16',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: 8,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
          Instant Solved-Spot Permalink &amp; Group-Chat Share:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={() => handleCopy('permalink', sharePermalink)}
            style={{
              background: copiedKey === 'permalink' ? '#059669' : '#0284c7',
              color: '#ffffff',
              border: 0,
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {copiedKey === 'permalink' ? 'Copied Permalink URL!' : 'Copy Solved-Spot Permalink'}
          </button>
          <button
            type="button"
            onClick={() => handleCopy('discord-quick', discordCitation)}
            style={{
              background: copiedKey === 'discord-quick' ? '#059669' : '#1e293b',
              color: '#f8fafc',
              border: '1px solid #38bdf8',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {copiedKey === 'discord-quick'
              ? 'Copied Discord Summary!'
              : 'Copy 1-Click Discord / Forum Summary'}
          </button>
          <a
            href={dynamicOgPreviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#0f172a',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 11.5,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            View Social OG Card
          </a>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {formats.map((item) => {
          const isCopied = copiedKey === item.key;
          return (
            <div
              key={item.key}
              style={{
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>
                  {item.label}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(item.key, item.code)}
                  style={{
                    background: isCopied ? '#059669' : '#1d4ed8',
                    color: '#ffffff',
                    border: 0,
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isCopied ? 'Copied!' : 'Copy Snippet'}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: '#a5b4fc',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  lineHeight: 1.45,
                }}
              >
                {item.code}
              </pre>
            </div>
          );
        })}
      </div>
    </section>
  );
}
