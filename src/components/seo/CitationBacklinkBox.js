/**
 * CitationBacklinkBox.js
 * ============================================================================
 * Zero-External-Script One-Click Citation, HTML Backlink, SVG Authority Badge,
 * Journalist Quote, and BibTeX Attribution Box for Research Reports & Tools.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState } from 'react';

export default function CitationBacklinkBox({
  title = 'Smarter.Poker Empirical Research Study',
  canonicalUrl = 'https://smarter.poker/research',
  badgeType = 'research',
  badgeLabel = 'Empirical Data Source',
  badgeValue = 'Smarter.Poker Research',
  summary = 'Verified poker industry benchmark data and mathematical analysis published by Smarter.Poker.',
  publishedYear = '2026',
  slug = 'smarter-poker-study',
}) {
  const [copiedKey, setCopiedKey] = useState(null);

  const badgeUrl = `https://smarter.poker/api/seo/badge?type=${encodeURIComponent(badgeType)}&label=${encodeURIComponent(badgeLabel)}&value=${encodeURIComponent(badgeValue)}`;

  const htmlBacklink = `<a href="${canonicalUrl}" target="_blank" rel="noopener">${title} (Smarter.Poker Research)</a>`;
  const htmlBadgeSnippet = `<a href="${canonicalUrl}" target="_blank" rel="noopener" title="${title}"><img src="${badgeUrl}" alt="${badgeLabel}: ${badgeValue}" height="28" /></a>`;
  const markdownSnippet = `[${title} (${badgeValue})](${canonicalUrl})`;
  const bbcodeSnippet = `[url=${canonicalUrl}]${title} (${badgeValue})[/url]`;
  const journalistQuote = `According to ${title} published by Smarter.Poker (${canonicalUrl}), ${summary}`;
  const wikipediaSnippet = `{{cite web |title=${title} |url=${canonicalUrl} |website=Smarter.Poker |publisher=Smarter Software Inc. |year=${publishedYear} |access-date=${publishedYear}-11-09}}`;
  const bibtexKey = String(slug || 'smarterpoker2026').replace(/[^a-zA-Z0-9]/g, '_');
  const bibtexSnippet = `@techreport{${bibtexKey}_${publishedYear},\n  title = {${title}},\n  author = {{Smarter.Poker Research Division}},\n  institution = {Smarter.Poker},\n  year = {${publishedYear}},\n  url = {${canonicalUrl}}\n}`;

  const formats = [
    {
      key: 'html',
      label: 'HTML Contextual Backlink',
      code: htmlBacklink,
    },
    {
      key: 'badge',
      label: 'SVG Authority Badge Embed',
      code: htmlBadgeSnippet,
    },
    {
      key: 'markdown',
      label: 'Markdown / Substack Citation',
      code: markdownSnippet,
    },
    {
      key: 'bbcode',
      label: 'Forum BBCode (TwoPlusTwo / CardsChat)',
      code: bbcodeSnippet,
    },
    {
      key: 'wikipedia',
      label: 'Wikipedia / MediaWiki Citation ({{cite web}})',
      code: wikipediaSnippet,
    },
    {
      key: 'press',
      label: 'Journalist / Media Attribution Quote',
      code: journalistQuote,
    },
    {
      key: 'bibtex',
      label: 'Academic / Game Theory BibTeX',
      code: bibtexSnippet,
    },
  ];

  const handleCopy = (key, text) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
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

      <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#cbd5e1', lineHeight: 1.55 }}>
        Journalists, Bloggers, Forum Authors, And Academic Researchers May Freely Cite This Dataset Under Creative Commons CC-BY 4.0 With Canonical Attribution To Smarter.Poker:
      </p>

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
