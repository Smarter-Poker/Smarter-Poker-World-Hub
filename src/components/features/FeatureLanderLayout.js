import React from 'react';
import Link from 'next/link';
import SEOHead, { schemas } from '../seo/SEOHead';

export default function FeatureLanderLayout({
  title,
  metaTitle,
  description,
  canonical,
  ogImage,
  badgeText = '100% Free Platform Feature',
  primaryCtaText = 'Launch In World Hub',
  primaryCtaHref = '/hub',
  secondaryCtaText = 'View Plain-Text Spec',
  secondaryCtaHref,
  markdownUrl,
  features = [],
  comparison = null,
  howItWorks = [],
  faqs = [],
  jsonLd = [],
}) {
  const schemaList = [
    schemas.organization,
    {
      '@type': 'WebPage',
      '@id': `https://smarter.poker${canonical}#page`,
      url: `https://smarter.poker${canonical}`,
      name: metaTitle || title,
      description,
      isPartOf: { '@id': 'https://smarter.poker/#website' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'p'],
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `https://smarter.poker${canonical}#app`,
      name: title,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any (Web, iOS, Android)',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      description,
      url: `https://smarter.poker${canonical}`,
    },
    ...jsonLd,
  ];

  if (Array.isArray(faqs) && faqs.length > 0) {
    schemaList.push({
      '@type': 'FAQPage',
      '@id': `https://smarter.poker${canonical}#faq`,
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.answer,
        },
      })),
    });
  }

  return (
    <>
      <SEOHead
        title={metaTitle || title}
        description={description}
        canonical={canonical}
        ogImage={ogImage || `/api/og/tool-card?tool=features&title=${encodeURIComponent(title)}`}
        jsonLd={schemaList}
        markdownUrl={markdownUrl}
      />

      <main style={styles.page}>
        <article style={styles.article}>
          <nav style={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/" style={styles.breadcrumbLink}>
              Home
            </Link>
            <span style={styles.breadcrumbSeparator}>/</span>
            <Link href="/hub" style={styles.breadcrumbLink}>
              Hub
            </Link>
            <span style={styles.breadcrumbSeparator}>/</span>
            <span style={styles.breadcrumbCurrent}>{title}</span>
          </nav>

          <header style={styles.header}>
            <div style={styles.badge}>{badgeText}</div>
            <h1 style={styles.h1}>{title}</h1>
            <p style={styles.lead}>{description}</p>
            <div style={styles.ctaGroup}>
              <Link href={primaryCtaHref} style={styles.primaryBtn}>
                {primaryCtaText}
              </Link>
              {secondaryCtaHref && (
                <a href={secondaryCtaHref} style={styles.secondaryBtn}>
                  {secondaryCtaText}
                </a>
              )}
            </div>
          </header>

          {features.length > 0 && (
            <section style={styles.section}>
              <h2 style={styles.h2}>Core Capabilities & Architecture</h2>
              <div style={styles.grid}>
                {features.map((f, idx) => (
                  <div key={idx} style={styles.card}>
                    <h3 style={styles.cardTitle}>{f.title}</h3>
                    <p style={styles.cardText}>{f.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {comparison && (
            <section style={styles.section}>
              <h2 style={styles.h2}>{comparison.title}</h2>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {comparison.headers.map((h, idx) => (
                        <th key={idx} style={styles.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.rows.map((row, rIdx) => (
                      <tr key={rIdx} style={rIdx % 2 === 1 ? styles.trAlt : styles.tr}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} style={cIdx === 0 ? styles.tdBold : styles.td}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {howItWorks.length > 0 && (
            <section style={styles.section}>
              <h2 style={styles.h2}>How It Works</h2>
              <ol style={styles.stepList}>
                {howItWorks.map((step, idx) => (
                  <li key={idx} style={styles.stepItem}>
                    <span style={styles.stepNumber}>{idx + 1}</span>
                    <div>
                      <h3 style={styles.stepTitle}>{step.title}</h3>
                      <p style={styles.stepDescription}>{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {faqs.length > 0 && (
            <section style={styles.section}>
              <h2 style={styles.h2}>Frequently Asked Questions</h2>
              <div style={styles.faqList}>
                {faqs.map((faq, idx) => (
                  <div key={idx} style={styles.faqItem}>
                    <h3 style={styles.faqQuestion}>{faq.question}</h3>
                    <p style={styles.faqAnswer}>{faq.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <footer style={styles.footer}>
            <p style={styles.footerNote}>
              Free To Play Platform Operated By Smarter Software Inc. Zero Financial Deposit Required.
            </p>
            <div style={styles.footerLinks}>
              <Link href="/terms" style={styles.footerLink}>
                Terms Of Service
              </Link>
              <Link href="/privacy" style={styles.footerLink}>
                Privacy Policy
              </Link>
              <Link href="/about" style={styles.footerLink}>
                About Smarter.Poker
              </Link>
            </div>
          </footer>
        </article>
      </main>
    </>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0a0a12 0%, #050510 100%)',
    color: '#e6ecf5',
    fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif",
  },
  article: { maxWidth: 920, margin: '0 auto', padding: '40px 20px 64px' },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#7f8ca3',
    marginBottom: 28,
  },
  breadcrumbLink: { color: '#00c6ff', textDecoration: 'none' },
  breadcrumbSeparator: { color: '#4a5568' },
  breadcrumbCurrent: { color: '#b8c4d6', fontWeight: 500 },
  header: { marginBottom: 44 },
  badge: {
    display: 'inline-block',
    background: 'rgba(0, 198, 255, 0.1)',
    border: '1px solid rgba(0, 198, 255, 0.3)',
    color: '#00c6ff',
    padding: '4px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.5px',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  h1: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 'clamp(26px, 4.5vw, 38px)',
    fontWeight: 700,
    lineHeight: 1.25,
    color: '#ffffff',
    margin: '0 0 16px',
    letterSpacing: '0.5px',
  },
  lead: {
    fontSize: 17,
    lineHeight: 1.7,
    color: '#c7d2e2',
    margin: '0 0 24px',
  },
  ctaGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 20,
  },
  primaryBtn: {
    display: 'inline-block',
    background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: 15,
    padding: '12px 24px',
    borderRadius: 8,
    textDecoration: 'none',
    letterSpacing: '0.5px',
  },
  secondaryBtn: {
    display: 'inline-block',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#e6ecf5',
    fontWeight: 600,
    fontSize: 15,
    padding: '12px 24px',
    borderRadius: 8,
    textDecoration: 'none',
  },
  section: {
    marginTop: 48,
    paddingTop: 36,
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  },
  h2: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 'clamp(20px, 3vw, 24px)',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 24px',
    letterSpacing: '0.5px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
  },
  card: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(0, 198, 255, 0.15)',
    borderRadius: 12,
    padding: '20px 18px',
  },
  cardTitle: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 15,
    fontWeight: 600,
    color: '#00c6ff',
    margin: '0 0 8px',
    letterSpacing: '0.3px',
  },
  cardText: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#b8c4d6',
    margin: 0,
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: 12,
    border: '1px solid rgba(0, 198, 255, 0.2)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
    textAlign: 'left',
  },
  th: {
    background: 'rgba(0, 198, 255, 0.12)',
    color: '#ffffff',
    fontWeight: 600,
    padding: '14px 16px',
    borderBottom: '1px solid rgba(0, 198, 255, 0.2)',
  },
  tr: {
    background: 'rgba(255, 255, 255, 0.02)',
  },
  trAlt: {
    background: 'rgba(255, 255, 255, 0.04)',
  },
  td: {
    padding: '14px 16px',
    color: '#c7d2e2',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  tdBold: {
    padding: '14px 16px',
    color: '#ffffff',
    fontWeight: 600,
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  stepList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'grid',
    gap: 16,
  },
  stepItem: {
    display: 'flex',
    gap: 16,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: '18px 20px',
  },
  stepNumber: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#00c6ff',
    background: 'rgba(0, 198, 255, 0.12)',
    width: 36,
    height: 36,
    borderRadius: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 6px',
  },
  stepDescription: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#b8c4d6',
    margin: 0,
  },
  faqList: {
    display: 'grid',
    gap: 16,
  },
  faqItem: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(0, 198, 255, 0.12)',
    borderRadius: 12,
    padding: '18px 20px',
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: 600,
    color: '#00c6ff',
    margin: '0 0 8px',
  },
  faqAnswer: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#c7d2e2',
    margin: 0,
  },
  footer: {
    marginTop: 56,
    paddingTop: 28,
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    textAlign: 'center',
  },
  footerNote: {
    fontSize: 13,
    color: '#7f8ca3',
    margin: '0 0 14px',
  },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: 18,
  },
  footerLink: {
    fontSize: 13,
    color: '#9fd8ff',
    textDecoration: 'underline',
  },
};
