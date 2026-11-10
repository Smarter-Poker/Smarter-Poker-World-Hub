/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  OFFICIAL POKER RULE & FLOOR RULING DETAIL PAGE (/rules/[slug])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Server-rendered floor ruling guide at /rules/<slug> (and raw Markdown at
 * /rules/<slug>.md).
 *
 * Design: #SmarterCasinoRealism (#020608 obsidian, #101a20 gunmetal, #25c8ff cyan,
 * #f2b84b vault gold, borderRadius: '2px').
 * House style: Title Case, zero em dashes.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import {
  POKER_RULES,
  RULES_AS_OF,
  RULES_BASE_PATH,
  RULES_URL,
  getRuleBySlug,
  rulePath,
} from '../../src/content/rules/rules';

export async function getStaticPaths() {
  return {
    paths: POKER_RULES.map((r) => ({ params: { slug: r.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const rule = getRuleBySlug(params?.slug);
  if (!rule) return { notFound: true };

  const peerRules = POKER_RULES.filter(
    (r) => r.category === rule.category && r.slug !== rule.slug
  ).slice(0, 5);

  return {
    props: {
      rule,
      peerRules,
    },
  };
}

export default function PokerRuleDetailPage({ rule, peerRules = [] }) {
  const [rulingCopiedKey, setRulingCopiedKey] = useState('');
  const canonicalPath = rulePath(rule.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const mdPath = `${canonicalPath}.md`;
  const qrSvgPath = `/api/seo/qr?path=${encodeURIComponent(canonicalPath)}&label=${encodeURIComponent(rule.title)}`;
  const groupChatRulingText = `[Floor Rule Reference (${rule.tdaRef}): ${rule.title}] ${rule.summary} (Citing Published Poker TDA / Robert's Rules Of Poker Standards; Local House Rules Govern At Individual Venues). Full Reference & Table Scenarios: ${canonicalUrl}`;
  const redditMarkdownRuling = `> **Floor Rule Reference: ${rule.title} (Citing ${rule.tdaRef})**\n> ${rule.summary}\n> *Source Attribution: Independent Educational Summary Citing Published Poker TDA & Robert's Rules Of Poker (RROP) Standards via [Smarter.Poker Floor Reference](${canonicalUrl})*`;

  const handleCopyRuling = async (key, text) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setRulingCopiedKey(key);
        setTimeout(() => setRulingCopiedKey(''), 2200);
      }
      if (typeof fetch === 'function') {
        fetch(
          `/api/seo/referral-stats?event=record&category=solved_spot_shares&item=${encodeURIComponent(rule.slug)}&source=rule-share`,
          { method: 'POST', keepalive: true }
        ).catch(() => {});
      }
    } catch {
      // Ignore clipboard failure
    }
  };

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: rule.h1,
      name: rule.title,
      description: rule.summary,
      datePublished: RULES_AS_OF,
      dateModified: RULES_AS_OF,
      inLanguage: 'en-US',
      mainEntityOfPage: canonicalUrl,
      articleSection: rule.category,
      isPartOf: { '@id': `${RULES_URL}#collection` },
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', '#quick-answer-summary'],
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Official Poker Rules & Floor Rulings', item: RULES_URL },
        { '@type': 'ListItem', position: 3, name: rule.title, item: canonicalUrl },
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (rule.faqs || []).map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={rule.title}
        description={rule.summary}
        canonical={canonicalPath}
        markdownUrl={`https://smarter.poker${mdPath}`}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={2} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href={RULES_BASE_PATH} style={styles.crumbLink}>
            Official Poker Rules &amp; Floor Rulings
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{rule.title}</span>
        </nav>

        <article>
          <header style={styles.heroPlate}>
            <div style={styles.badgeRow}>
              <span style={styles.goldBadge}>{rule.tdaRef}</span>
              <span style={styles.cyanBadge}>{rule.category}</span>
              <a href={mdPath} style={styles.mdBadge}>
                RAW MARKDOWN ({mdPath})
              </a>
            </div>

            <h1 style={styles.h1}>{rule.h1}</h1>

            <div id="quick-answer-summary" style={styles.summaryBox}>
              <div style={styles.summaryLabel}>FLOOR RULE REFERENCE SUMMARY (CITING {rule.tdaRef})</div>
              <p style={styles.summaryText}>{rule.summary}</p>
              <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                {"Source Attribution: Independent Educational Reference Summary Citing Published Poker Tournament Directors Association (TDA) Rules And Robert's Rules Of Poker (RROP). Smarter.Poker Is An Independent Publisher; In Any Live Cardroom Or Tournament, The Supervising Floor Director And Posted House Rules Hold Final Authority."}
              </p>
            </div>

            <div
              aria-label="Settle The Bet Ruling Share And Print Actions"
              style={{
                marginTop: '14px',
                padding: '14px 16px',
                background: '#081118',
                border: '1px solid #1e293b',
                borderRadius: '2px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
              }}
            >
              <div style={{ flex: '1 1 360px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f2b84b', letterSpacing: '0.04em', marginBottom: '8px' }}>
                  SETTLE THE BET AT THE TABLE: SHARE OR PRINT THIS FLOOR RULE REFERENCE SHEET
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleCopyRuling('chat', groupChatRulingText)}
                    style={{
                      padding: '7px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: rulingCopiedKey === 'chat' ? '#10b981' : '#25c8ff',
                      color: '#020608',
                      border: 'none',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    {rulingCopiedKey === 'chat'
                      ? 'Copied Group-Chat Rule Reference'
                      : 'Copy Rule Reference For Group Chat (SMS / WhatsApp / Discord)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyRuling('reddit', redditMarkdownRuling)}
                    style={{
                      padding: '7px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: rulingCopiedKey === 'reddit' ? '#10b981' : '#101a20',
                      color: rulingCopiedKey === 'reddit' ? '#020608' : '#25c8ff',
                      border: '1px solid #25c8ff',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    {rulingCopiedKey === 'reddit' ? 'Copied Forum Quote' : 'Copy Forum / Reddit Quote'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined' && typeof window.print === 'function') {
                        window.print();
                      }
                    }}
                    style={{
                      padding: '7px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: '#101a20',
                      color: '#f2b84b',
                      border: '1px solid #f2b84b',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    Print Table Rule Reference Sheet (With QR)
                  </button>
                </div>
              </div>

              <div
                aria-label="Printable QR Code Verification Block"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  background: '#050b10',
                  border: '1px solid #1e293b',
                  borderRadius: '2px',
                }}
              >
                <img
                  src={qrSvgPath}
                  alt={`QR Code For ${canonicalUrl}`}
                  width="76"
                  height="76"
                  style={{ display: 'block', borderRadius: '2px', background: '#ffffff' }}
                />
                <div style={{ maxWidth: '210px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#25c8ff' }}>
                    SCAN FOR FULL RULE &amp; SCENARIOS
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#cbd5e1', wordBreak: 'break-all', marginTop: '2px' }}>
                    {canonicalUrl}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                    Cites: {rule.tdaRef}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <style
            dangerouslySetInnerHTML={{
              __html: `
            @media print {
              nav, footer, button, [aria-label="Cite Or Link To This Research"], [aria-label="Verify Or Analyze With AI Assistants"] {
                display: none !important;
              }
              body, main, div, article, section, header {
                background: #ffffff !important;
                color: #0f172a !important;
                border-color: #cbd5e1 !important;
              }
            }
          `,
            }}
          />

          <section style={styles.sectionPlate}>
            <h2 style={styles.h2}>Official TDA &amp; RROP Floor Ruling Procedure</h2>
            <p style={styles.rulingBody}>{rule.floorRuling}</p>
            <div style={styles.metaStrip}>
              <span>Authority Reference: {rule.tdaRef}</span>
              <span>|</span>
              <span>Rule Category: {rule.category}</span>
              <span>|</span>
              <span>Last Verified: {RULES_AS_OF}</span>
            </div>
          </section>

          <section style={styles.sectionPlate}>
            <h2 style={styles.h2}>Common Live Table Scenarios &amp; Official Floor Decisions</h2>
            <p style={styles.subLead}>
              How Tournament Directors And Cardroom Floor Supervisors Apply {rule.title} In Real-World Disputes:
            </p>
            <div style={styles.scenarioGrid}>
              {(rule.commonScenarios || []).map((sc, idx) => (
                <div key={sc.situation} style={styles.scenarioCard}>
                  <div style={styles.scenarioNum}>SCENARIO #{idx + 1}</div>
                  <div style={styles.scenarioBlock}>
                    <span style={styles.scenarioHeadingGold}>Table Situation:</span>
                    <p style={styles.scenarioText}>{sc.situation}</p>
                  </div>
                  <div style={styles.scenarioBlockRuling}>
                    <span style={styles.scenarioHeadingCyan}>Official Floor Ruling:</span>
                    <p style={styles.scenarioText}>{sc.ruling}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={styles.twoColGrid}>
            <div style={styles.colPlate}>
              <h2 style={styles.h2Small}>Related Poker Math Calculators</h2>
              <p style={styles.smallNote}>
                Verify Exact Equity, Pot Sizing, And Side-Pot Allocations Associated With This Rule:
              </p>
              <div style={styles.linkStack}>
                {(rule.relatedCalculators || []).map((calc) => (
                  <Link key={calc.href} href={calc.href} style={styles.calcLinkCard}>
                    <span style={styles.calcTag}>INTERACTIVE SOLVER</span>
                    <span style={styles.calcTitle}>{calc.label}</span>
                  </Link>
                ))}
                <Link href="/learn/poker-hand-rankings" style={styles.calcLinkCard}>
                  <span style={styles.calcTag}>OFFICIAL REFERENCE</span>
                  <span style={styles.calcTitle}>Poker Hand Rankings &amp; Tie-Breaker Cheat Sheet</span>
                </Link>
                <Link href="/games" style={styles.calcLinkCard}>
                  <span style={styles.calcTag}>VARIANTS ENCYCLOPEDIA</span>
                  <span style={styles.calcTitle}>15 Poker Variants &amp; Mixed Game Rulebooks</span>
                </Link>
              </div>
            </div>

            <div style={styles.colPlate}>
              <h2 style={styles.h2Small}>Connected Poker Glossary Definitions</h2>
              <p style={styles.smallNote}>
                Review Official Definitions For Core Terms Referenced In This Floor Ruling:
              </p>
              <div style={styles.chipWrap}>
                {(rule.relatedTerms || []).map((termSlug) => (
                  <Link key={termSlug} href={`/glossary/${termSlug}`} style={styles.glossaryChip}>
                    {`/glossary/${termSlug}`}
                  </Link>
                ))}
                <Link href="/glossary" style={styles.glossaryAllChip}>
                  Browse Full Poker Glossary
                </Link>
              </div>

              {peerRules.length > 0 && (
                <div style={{ marginTop: '22px' }}>
                  <h3 style={styles.h3Small}>More {rule.category} Rulings</h3>
                  <ul style={styles.peerList}>
                    {peerRules.map((p) => (
                      <li key={p.slug} style={styles.peerItem}>
                        <Link href={rulePath(p.slug)} style={styles.peerLink}>
                          {p.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section style={styles.sectionPlate}>
            <h2 style={styles.h2}>Frequently Asked Questions: {rule.title}</h2>
            <div style={styles.faqGrid}>
              {(rule.faqs || []).map((item) => (
                <div key={item.q} style={styles.faqBox}>
                  <h3 style={styles.faqQ}>{item.q}</h3>
                  <p style={styles.faqA}>{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <CitationBacklinkBox
            title={`${rule.title} (${rule.tdaRef})`}
            canonicalUrl={canonicalUrl}
            badgeType="research"
            badgeLabel="Floor Rule Reference"
            badgeValue={rule.tdaRef}
            summary={rule.summary}
            slug={`poker-rule-${rule.slug}`}
            doi="10.5281/zenodo.24115454"
          />

          <AiPromptLauncher
            title={`${rule.title} (${rule.tdaRef})`}
            canonicalUrl={canonicalUrl}
            canonicalPath={canonicalPath}
            markdownUrl={`/rules/${rule.slug}.md`}
          />

          <div style={styles.bottomNavRow}>
            <Link href={RULES_BASE_PATH} style={styles.backBtn}>
              Back To All 30 Official Poker Rules &amp; Floor Rulings
            </Link>
            <a href="/rules.md" style={styles.rawIndexLink}>
              View Complete {'/rules.md'} Specification
            </a>
          </div>

          <p style={styles.complianceFooter}>
            Smarter.Poker Is A Free-To-Play Poker Training, Rules Reference, And Social Community Platform. 18+. Club
            Chips And Diamonds Have No Cash Value.
          </p>
        </article>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#020608',
    color: '#e2e8f0',
    fontFamily: 'var(--font-inter), Inter, system-ui, -apple-system, sans-serif',
  },
  container: {
    maxWidth: '1060px',
    margin: '0 auto',
    padding: '28px 18px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  crumbLink: {
    color: '#25c8ff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  crumbSep: {
    color: '#475569',
  },
  crumbCurrent: {
    color: '#cbd5e1',
  },
  heroPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(37, 200, 255, 0.3)',
    borderRadius: '2px',
    padding: '26px',
    marginBottom: '22px',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 28px rgba(0, 0, 0, 0.5)',
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '14px',
  },
  goldBadge: {
    backgroundColor: 'rgba(242, 184, 75, 0.14)',
    border: '1px solid #f2b84b',
    color: '#f2b84b',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.07em',
    padding: '4px 10px',
    borderRadius: '2px',
  },
  cyanBadge: {
    backgroundColor: 'rgba(37, 200, 255, 0.12)',
    border: '1px solid #25c8ff',
    color: '#25c8ff',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.07em',
    padding: '4px 10px',
    borderRadius: '2px',
  },
  mdBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    color: '#e2e8f0',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  h1: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(22px, 3.4vw, 33px)',
    fontWeight: 800,
    lineHeight: 1.22,
    color: '#ffffff',
    margin: '0 0 18px',
  },
  summaryBox: {
    backgroundColor: '#020608',
    borderLeft: '4px solid #f2b84b',
    borderTop: '1px solid rgba(242, 184, 75, 0.25)',
    borderRight: '1px solid rgba(242, 184, 75, 0.25)',
    borderBottom: '1px solid rgba(242, 184, 75, 0.25)',
    borderRadius: '2px',
    padding: '16px 18px',
  },
  summaryLabel: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#f2b84b',
    letterSpacing: '0.08em',
    marginBottom: '6px',
  },
  summaryText: {
    fontSize: '16px',
    lineHeight: 1.65,
    color: '#f8fafc',
    fontWeight: 600,
    margin: 0,
  },
  sectionPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: '2px',
    padding: '24px',
    marginBottom: '22px',
  },
  h2: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(17px, 2.3vw, 21px)',
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 12px',
  },
  rulingBody: {
    fontSize: '15.5px',
    lineHeight: 1.75,
    color: '#dbe4f0',
    margin: '0 0 16px',
  },
  metaStrip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    fontSize: '12.5px',
    color: '#94a3b8',
    borderTop: '1px solid rgba(148, 163, 184, 0.16)',
    paddingTop: '12px',
  },
  subLead: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '0 0 16px',
  },
  scenarioGrid: {
    display: 'grid',
    gap: '14px',
  },
  scenarioCard: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.22)',
    borderRadius: '2px',
    padding: '16px 18px',
  },
  scenarioNum: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#f2b84b',
    letterSpacing: '0.08em',
    marginBottom: '8px',
  },
  scenarioBlock: {
    marginBottom: '10px',
  },
  scenarioBlockRuling: {
    borderTop: '1px solid rgba(148, 163, 184, 0.14)',
    paddingTop: '10px',
  },
  scenarioHeadingGold: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 700,
    color: '#f2b84b',
    marginBottom: '4px',
  },
  scenarioHeadingCyan: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 700,
    color: '#25c8ff',
    marginBottom: '4px',
  },
  scenarioText: {
    fontSize: '14.5px',
    lineHeight: 1.6,
    color: '#e2e8f0',
    margin: 0,
  },
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '18px',
    marginBottom: '22px',
  },
  colPlate: {
    backgroundColor: '#101a20',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: '2px',
    padding: '22px',
  },
  h2Small: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: '17px',
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 8px',
  },
  h3Small: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#f2b84b',
    margin: '0 0 8px',
  },
  smallNote: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: '0 0 14px',
    lineHeight: 1.5,
  },
  linkStack: {
    display: 'grid',
    gap: '10px',
  },
  calcLinkCard: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.28)',
    borderRadius: '2px',
    padding: '12px 14px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  calcTag: {
    fontSize: '10px',
    fontWeight: 800,
    color: '#f2b84b',
    letterSpacing: '0.08em',
  },
  calcTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#25c8ff',
  },
  chipWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  glossaryChip: {
    backgroundColor: '#020608',
    border: '1px solid rgba(37, 200, 255, 0.35)',
    color: '#25c8ff',
    fontSize: '12.5px',
    fontWeight: 600,
    padding: '6px 11px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  glossaryAllChip: {
    backgroundColor: 'rgba(242, 184, 75, 0.14)',
    border: '1px solid #f2b84b',
    color: '#f2b84b',
    fontSize: '12.5px',
    fontWeight: 700,
    padding: '6px 11px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  peerList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: '6px',
  },
  peerItem: {
    borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
    paddingBottom: '6px',
  },
  peerLink: {
    color: '#25c8ff',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
  },
  faqGrid: {
    display: 'grid',
    gap: '14px',
  },
  faqBox: {
    backgroundColor: '#020608',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '2px',
    padding: '16px',
  },
  faqQ: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#25c8ff',
    margin: '0 0 8px',
  },
  faqA: {
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: 0,
  },
  bottomNavRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginTop: '24px',
  },
  backBtn: {
    backgroundColor: '#101a20',
    border: '1px solid #25c8ff',
    color: '#25c8ff',
    fontSize: '13.5px',
    fontWeight: 700,
    padding: '10px 16px',
    borderRadius: '2px',
    textDecoration: 'none',
  },
  rawIndexLink: {
    color: '#f2b84b',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
  },
  complianceFooter: {
    fontSize: '12px',
    color: '#64748b',
    textAlign: 'center',
    marginTop: '32px',
  },
};
