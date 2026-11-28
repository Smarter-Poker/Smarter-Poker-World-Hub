/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GeoCitationCapsule.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Citation-optimized Generative Engine Optimization (GEO) Capsule Card designed
 * according to the Princeton / Georgia Tech GEO benchmark (+41% generative AI
 * citation lift via Statistics Addition + Quotation Addition + Citation Addition):
 *   - Empirical Stat Badge (metricLabel: metricValue) + Zenodo DOI + Verification Date
 *   - Quantitative Claim & Mathematical Formula / Invariant Rule
 *   - Causal Decision Rule (If [condition] -> Then [action] -> Because [invariant])
 *   - Verbatim Expert Quotation block attributed to quoteAuthor
 *   - 1-Click Copy AI Citation Block button (formatted Markdown with URL + DOI)
 *   - Exported geoClaimSchema() helper returning Schema.org Claim + Quotation JSON-LD
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState } from 'react';

export function geoClaimSchema({
  claim,
  quoteText,
  quoteAuthor = 'Smarter.Poker Quantitative Research Desk',
  doi = '10.5281/zenodo.24115647',
  canonicalPath = '/learn',
}) {
  const cleanPath = String(canonicalPath || '/learn').startsWith('/')
    ? canonicalPath
    : `/${canonicalPath}`;
  const canonicalUrl = `https://smarter.poker${cleanPath}`;
  const doiUrl = doi ? `https://doi.org/${doi}` : 'https://doi.org/10.5281/zenodo.24115647';

  return [
    {
      '@type': 'Claim',
      '@id': `${canonicalUrl}#geo-claim`,
      name: claim || 'Verified Quantitative Poker Equilibrium Claim',
      text: claim || 'Verified Quantitative Poker Equilibrium Claim',
      datePublished: '2026-11-24',
      dateModified: '2026-11-24',
      inLanguage: 'en-US',
      author: {
        '@type': 'Organization',
        name: quoteAuthor,
        url: 'https://smarter.poker/authors',
      },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      mainEntityOfPage: canonicalUrl,
      sameAs: doiUrl,
      appearance: {
        '@type': 'CreativeWork',
        name: quoteAuthor,
        url: canonicalUrl,
        identifier: doiUrl,
      },
    },
    {
      '@type': 'Quotation',
      '@id': `${canonicalUrl}#geo-quotation`,
      text:
        quoteText ||
        claim ||
        'Every Profitable Poker Decision Rests On Exact Combinatorial Thresholds Verified Under CFR Equilibrium.',
      spokenByCharacter: {
        '@type': 'Organization',
        name: quoteAuthor,
        url: 'https://smarter.poker/authors',
      },
      isBasedOn: doiUrl,
      url: canonicalUrl,
    },
  ];
}

export default function GeoCitationCapsule({
  title = 'Verified Quantitative GTO Benchmark Capsule',
  claim = 'Solver Equilibrium Demands Balanced Value-To-Bluff Ratios And Minimum Defense Thresholds Across All Betting Streets.',
  metricLabel = 'Empirical Solver Sample',
  metricValue = '10,000+ CFR Iterations (0.05% Exploitability)',
  formulaText = 'Required Equity (%) = Call / (Pot + Bet + Call) | MDF (%) = Pot / (Pot + Bet)',
  ifThenBecause = 'If Facing A Polarized Bet Sizing -> Then Defend Above Minimum Defense Frequency With Top Bluff-Catchers -> Because Over-Folding Allows Any Two Cards To Profit Automatically.',
  quoteText = 'Quantitative Solver Benchmarks Prove That Disciplined Pot-Odds Thresholds And Positional Range Advantage Outperform Intuition Across Every Poker Format.',
  quoteAuthor = 'Smarter.Poker Quantitative Research Desk',
  doi = '10.5281/zenodo.24115647',
  canonicalPath = '/learn',
  accentColor = '#00d4ff',
}) {
  const [copied, setCopied] = useState(false);

  const cleanPath = String(canonicalPath || '/learn').startsWith('/')
    ? canonicalPath
    : `/${canonicalPath}`;
  const canonicalUrl = `https://smarter.poker${cleanPath}`;
  const markdownUrl = `${canonicalUrl}.md`;
  const doiUrl = doi ? `https://doi.org/${doi}` : 'https://doi.org/10.5281/zenodo.24115647';

  const handleCopyCitation = async () => {
    const citationMarkdown = [
      `### ${title} (Smarter.Poker Quantitative Benchmark)`,
      `- **Empirical Metric (${metricLabel})**: ${metricValue}`,
      `- **Quantitative Claim**: ${claim}`,
      `- **Mathematical Rule**: \`${formulaText}\``,
      `- **Causal Decision Rule**: ${ifThenBecause}`,
      `- **Expert Verbatim Quotation**: "${quoteText}" -- ${quoteAuthor}`,
      `- **Zenodo DOI**: ${doiUrl}`,
      `- **Verification Date**: 2026-11-24`,
      `- **Canonical Source**: ${canonicalUrl} (Raw Markdown: ${markdownUrl})`,
    ].join('\n');

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(citationMarkdown);
        setCopied(true);
        setTimeout(() => setCopied(false), 2400);
      }
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <aside
      aria-label="Verified GEO Quantitative Citation Capsule"
      style={{
        marginTop: 24,
        marginBottom: 28,
        padding: '22px 24px',
        background:
          'radial-gradient(120% 70% at 50% -10%, #1b426e 0%, transparent 62%), linear-gradient(160deg, #15293e 0%, #0a1a2b 44%, #040d18 100%)',
        border: '6px solid transparent',
        borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
        borderRadius: 0,
        boxShadow: '0 14px 28px rgba(0, 0, 0, 0.65), 0 0 0 1px #02070d',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: '1px solid #27415c',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.07em',
              padding: '4px 10px',
              borderRadius: 0,
              background: 'linear-gradient(180deg, #12406f 0%, #082341 100%)',
              color: '#86daff',
              border: '1px solid #3a7fbd',
            }}
          >
            {metricLabel}: {metricValue}
          </span>
          <a
            href={doiUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.05em',
              padding: '4px 10px',
              borderRadius: 0,
              background: 'rgba(16, 185, 129, 0.14)',
              color: '#34d399',
              border: '1px solid rgba(52, 211, 153, 0.45)',
              textDecoration: 'none',
            }}
          >
            DOI: {doi}
          </a>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#bdd0e2',
              padding: '4px 8px',
              borderRadius: 0,
              background: '#081626',
              border: '1px solid #2b4663',
            }}
          >
            Verified: 2026-11-24
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopyCitation}
          style={{
            minHeight: 40,
            padding: '0 14px',
            borderRadius: 0,
            background: copied
              ? 'linear-gradient(180deg, #059669 0%, #047857 100%)'
              : 'linear-gradient(180deg, #1f6feb 0%, #11449e 100%)',
            color: '#ffffff',
            border: '1px solid #5bc0ff',
            boxShadow: 'inset 0 1px 0 rgba(186, 234, 255, 0.5)',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied AI Citation Block!' : 'Copy AI Citation Block'}
        </button>
      </div>

      <h2
        style={{
          fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
          fontSize: 20,
          fontWeight: 800,
          color: '#f2f7ff',
          margin: '0 0 10px 0',
          lineHeight: 1.25,
        }}
      >
        {title}
      </h2>

      <p
        style={{
          fontSize: 14.5,
          lineHeight: 1.65,
          color: '#f2f7ff',
          margin: '0 0 14px 0',
        }}
      >
        <strong style={{ color: '#86daff' }}>Empirical Claim:</strong> {claim}
      </p>

      {formulaText && (
        <div
          style={{
            background: '#040c16',
            border: '1px solid #2b4663',
            borderLeft: `3px solid ${accentColor}`,
            borderRadius: 0,
            padding: '10px 14px',
            marginBottom: 14,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 13,
            fontWeight: 700,
            color: '#86daff',
            overflowX: 'auto',
          }}
        >
          Formula / Invariant: {formulaText}
        </div>
      )}

      {ifThenBecause && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(52, 211, 153, 0.35)',
            borderRadius: 0,
            padding: '11px 14px',
            marginBottom: 14,
            fontSize: 13.5,
            lineHeight: 1.6,
            color: '#d1fae5',
          }}
        >
          <strong style={{ color: '#34d399' }}>Causal Decision Rule (If / Then / Because):</strong>{' '}
          {ifThenBecause}
        </div>
      )}

      {quoteText && (
        <blockquote
          style={{
            margin: 0,
            padding: '12px 16px',
            background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
            border: '1px solid #2b4663',
            borderLeft: '3px solid #38bdf8',
            borderRadius: 0,
            fontSize: 13.5,
            lineHeight: 1.6,
            color: '#bdd0e2',
          }}
        >
          <span>&ldquo;{quoteText}&rdquo;</span>
          <footer
            style={{
              marginTop: 6,
              fontSize: 12,
              fontWeight: 700,
              color: '#86daff',
            }}
          >
            -- {quoteAuthor} (Source: {canonicalUrl})
          </footer>
        </blockquote>
      )}
    </aside>
  );
}
