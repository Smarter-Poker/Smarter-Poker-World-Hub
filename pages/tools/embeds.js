import React, { useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { Code, Copy, Check, ExternalLink, ShieldCheck, Zap } from 'lucide-react';

const WIDGETS = [
  {
    id: 'odds-calculator',
    title: 'Multiway Poker Odds Calculator',
    description: 'Real-time Texas Hold\'em equity calculator supporting 2 to 10 players, exact card pickers, dead cards, and instant simulation.',
    embedUrl: 'https://smarter.poker/hub/poker-tools?embed=true',
    landerUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Free Poker Odds Calculator',
  },
  {
    id: 'icm-calculator',
    title: 'Tournament ICM Calculator',
    description: 'Malmuth-Harville mathematical model converting tournament chip stacks to real dollar equity values for final table and bubble decisions.',
    embedUrl: 'https://smarter.poker/hub/training/icm-calculator',
    landerUrl: 'https://smarter.poker/tools/icm-calculator',
    height: 720,
    width: '100%',
    creditAnchor: 'Smarter.Poker Tournament ICM Calculator',
  },
  {
    id: 'preflop-ranges',
    title: 'GTO Preflop Range Matrix Hub',
    description: 'Interactive 13x13 preflop starting hand chart covering all 169 combinations and 1,326 combos across 6-max positions.',
    embedUrl: 'https://smarter.poker/tools/preflop-ranges',
    landerUrl: 'https://smarter.poker/tools/preflop-ranges',
    height: 820,
    width: '100%',
    creditAnchor: 'Smarter.Poker GTO Preflop Ranges',
  },
];

export default function WebmasterEmbedPortal() {
  const [copiedId, setCopiedId] = useState(null);

  const getEmbedCode = (widget) => {
    return `<iframe src="${widget.embedUrl}" width="${widget.width}" height="${widget.height}" frameborder="0" style="border:0;border-radius:12px;overflow:hidden;max-width:100%;" title="${widget.title}"></iframe>\n<p style="font-size:12px;text-align:center;color:#94AFCC;margin-top:6px;">Powered By <a href="${widget.landerUrl}" target="_blank" rel="noopener" style="color:#4E9CFF;text-decoration:none;font-weight:600;">${widget.creditAnchor}</a></p>`;
  };

  const handleCopy = (widget) => {
    const code = getEmbedCode(widget);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedId(widget.id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const portalSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Webmaster Poker Widgets & Embed Distribution Center',
    description: 'Free embeddable poker widgets, odds calculators, ICM solvers, and GTO charts for poker webmasters, bloggers, and media sites.',
    url: 'https://smarter.poker/tools/embeds',
    publisher: {
      '@type': 'Organization',
      name: 'Smarter.Poker',
      url: 'https://smarter.poker',
    },
  };

  return (
    <>
      <SEOHead
        title="Webmaster Poker Widgets - Free Embeds & Odds Calculators"
        description="Free embeddable poker widgets for webmasters and bloggers. Embed real-time odds calculators, tournament ICM solvers, and GTO preflop charts with simple HTML iframe snippets."
        canonical="https://smarter.poker/tools/embeds"
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(portalSchema) }}
        />
      </SEOHead>

      <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#fff', paddingBottom: '60px' }}>
        <UniversalHeader pageDepth={1} />

        <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px' }}>
          <header style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', background: 'rgba(78, 156, 255, 0.1)', border: '1px solid rgba(78, 156, 255, 0.25)', color: '#60a5fa', fontSize: '0.85rem', fontWeight: 600, marginBottom: '16px' }}>
              <Code size={14} /> Webmaster Distribution Portal
            </div>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 800, margin: '0 0 16px 0', letterSpacing: '-0.02em' }}>
              Free Embeddable Poker Tools For Webmasters
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255, 255, 255, 0.75)', maxWidth: '720px', margin: '0 auto', lineHeight: 1.6 }}>
              Add Interactive, Responsive Poker Calculators And GTO Charts To Your Website, Poker Forum, Or Strategy Blog. All Widgets Are Completely Free To Use With Canonical Attribution.
            </p>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '24px' }}>
              <Zap size={24} style={{ color: '#fbbf24', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0' }}>Zero Configuration Required</h3>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>
                Copy The HTML Snippet Directly Into Your WordPress Post, Ghost Blog, Or Custom CMS. Works Seamlessly Without External Script Dependencies.
              </p>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '24px' }}>
              <ShieldCheck size={24} style={{ color: '#34d399', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0' }}>Mobile-Optimized & Responsive</h3>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>
                Each Calculator Dynamically Adapts To Desktop, Tablet, And Smartphone Screens With Lightning-Fast Sub-50ms Touch Response Times.
              </p>
            </div>
          </div>

          <section aria-labelledby="available-widgets-heading">
            <h2 id="available-widgets-heading" style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '24px' }}>
              Available Embeddable Widgets
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {WIDGETS.map((widget) => {
                const code = getEmbedCode(widget);
                const isCopied = copiedId === widget.id;

                return (
                  <article
                    key={widget.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '28px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                      <h3 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>{widget.title}</h3>
                      <Link
                        href={widget.landerUrl}
                        target="_blank"
                        rel="noopener"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', color: '#60a5fa', textDecoration: 'none' }}
                      >
                        Preview Live Tool <ExternalLink size={14} />
                      </Link>
                    </div>

                    <p style={{ fontSize: '0.95rem', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                      {widget.description}
                    </p>

                    <div style={{ position: 'relative' }}>
                      <textarea
                        readOnly
                        value={code}
                        aria-label={`HTML Embed Code for ${widget.title}`}
                        style={{
                          width: '100%',
                          height: '90px',
                          background: '#06060c',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '8px',
                          padding: '12px',
                          color: '#a5b4fc',
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(widget)}
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: isCopied ? '#059669' : '#2563eb',
                          color: '#fff',
                          border: 0,
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isCopied ? (
                          <>
                            <Check size={14} /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={14} /> Copy Embed Code
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
