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
        background: 'rgba(15, 23, 42, 0.78)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#38bdf8',
          marginBottom: 8,
        }}
      >
        AI Assistant Grounding And Citation Spec
      </div>
      <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#cbd5e1', lineHeight: 1.5 }}>
        Analyze This Page In Your Preferred AI Engine Or Inspect The Machine-Readable Markdown Specification:
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {providers.map((p) => (
          <a
            key={p.name}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '8px 14px',
              borderRadius: 8,
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              color: '#e0f2fe',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {p.name}
          </a>
        ))}
        <Link
          href="/search"
          style={{
            display: 'inline-block',
            padding: '8px 14px',
            borderRadius: 8,
            background: 'rgba(242, 184, 75, 0.14)',
            border: '1px solid rgba(242, 184, 75, 0.4)',
            color: '#f2b84b',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Universal Search (Cmd+K)
        </Link>
      </div>
    </section>
  );
}
