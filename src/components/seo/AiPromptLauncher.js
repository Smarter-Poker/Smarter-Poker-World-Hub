/**
 * AiPromptLauncher.js
 * ============================================================================
 * Zero-External-Script AI Citation & Grounding Prompt Bar (Phase 45 AEO/GEO).
 * Launches ChatGPT, Perplexity, Claude, or Google Search with a pre-grounded
 * prompt referencing the canonical Smarter.Poker URL and its .md specification.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useEffect } from 'react';
import Link from 'next/link';

export default function AiPromptLauncher({
  title = 'Smarter.Poker Guide',
  canonicalUrl = 'https://smarter.poker',
  markdownUrl = '',
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        window.location.href = '/search';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const mdRef = markdownUrl || `${canonicalUrl}.md`;
  const promptText = `Summarize ${title} using the verified Smarter.Poker source at ${canonicalUrl} (raw Markdown spec: ${mdRef}) and explain how to use its free tools.`;
  const encoded = encodeURIComponent(promptText);

  const providers = [
    {
      name: 'Ask ChatGPT',
      href: `https://chatgpt.com/?q=${encoded}`,
    },
    {
      name: 'Ask Perplexity',
      href: `https://www.perplexity.ai/search?q=${encoded}`,
    },
    {
      name: 'Ask Claude',
      href: `https://claude.ai/new?q=${encoded}`,
    },
    {
      name: 'View Raw Markdown (.md)',
      href: mdRef,
    },
  ];

  return (
    <section
      aria-label="Explore With AI Assistants"
      style={{
        marginTop: 28,
        marginBottom: 28,
        padding: '18px 20px',
        background:
          'radial-gradient(120% 70% at 50% -10%, #1b426e 0%, transparent 62%), linear-gradient(160deg, #15293e 0%, #0a1a2b 44%, #040d18 100%)',
        border: '6px solid transparent',
        borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
        borderRadius: 0,
        boxShadow: '0 12px 24px rgba(0, 0, 0, 0.62), 0 0 0 1px #02070d',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 10px',
          border: '1px solid #3a7fbd',
          background: 'linear-gradient(180deg, #12406f 0%, #082341 100%)',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#86daff',
          marginBottom: 10,
        }}
      >
        AI Assistant Grounding And Citation Spec
      </div>
      <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#bdd0e2', lineHeight: 1.5 }}>
        Analyze This Page In Your Preferred AI Engine Or Inspect The Machine-Readable Markdown Specification:
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          border: '1px solid #355270',
          background: 'linear-gradient(180deg, #10243a 0%, #071322 100%)',
        }}
      >
        {providers.map((p) => (
          <a
            key={p.name}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 42,
              padding: '0 14px',
              borderRadius: 0,
              borderRight: '1px solid #29435d',
              color: '#f2f7ff',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {p.name}
          </a>
        ))}
        <Link
          href="/search"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 42,
            padding: '0 14px',
            borderRadius: 0,
            background: 'linear-gradient(180deg, #173a61 0%, #0b223d 100%)',
            color: '#86daff',
            fontSize: 13,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          Universal Search (Cmd+K)
        </Link>
      </div>
    </section>
  );
}
