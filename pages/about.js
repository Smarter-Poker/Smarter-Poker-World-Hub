/* ═══════════════════════════════════════════════════════════════════════════
   ABOUT - the entity anchor
   ═══════════════════════════════════════════════════════════════════════════

   AEO PHASE 2 (2026-09-17). An AI engine answering "what is Smarter Poker"
   or "who makes Club Commander" looks for one page that states the entity:
   the legal name, what it makes, what it does not do, and how to reach it.
   The site had no such page, so an engine had to assemble the answer from
   a landing page and six product surfaces, and "Smarter Poker" resolves to
   an unrelated Austrian consultancy that shares the trading name.

   Every fact here is one the site already states somewhere: the legal name
   from the Organization schema and /terms, the product list from the landing
   summary, the support address from the contactPoint, the compliance line
   from the landing page. Nothing is invented, and nothing is claimed that
   the rest of the site does not also say. If a fact changes, it changes in
   src/components/landing/LandingProductSummary.js first and here second.

   Copy follows the house rule: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead, { schemas } from '../src/components/seo/SEOHead';
import { LANDING_PRODUCTS } from '../src/components/landing/LandingProductSummary';

const ABOUT_PAGE_SCHEMA = {
  '@type': 'AboutPage',
  '@id': 'https://smarter.poker/about#page',
  url: 'https://smarter.poker/about',
  name: 'About Smarter Poker',
  mainEntity: { '@id': 'https://smarter.poker/#organization' },
  isPartOf: { '@id': 'https://smarter.poker/#website' },
};

export default function AboutPage() {
  return (
    <>
      <SEOHead
        title="About Smarter.Poker"
        description="Smarter.Poker Is A Free Online Poker Platform From Smarter Software Inc. Read What It Is, What It Is Not, Which Products It Runs And How To Reach Support."
        canonical="/about"
        jsonLd={[schemas.organization, ABOUT_PAGE_SCHEMA]}
      />

      <main style={styles.page}>
        <article style={styles.article}>
          <h1 style={styles.h1}>About Smarter.Poker</h1>

          <p style={styles.lead}>
            Smarter.Poker Is A Free Online Poker Platform Built And Operated By Smarter Software Inc. It
            Brings GTO Training, Private Poker Clubs, A Live Poker Room Directory, Home Games, Bankroll
            Tracking And Poker Room Management Software Together In One World Hub At Smarter.Poker.
          </p>

          <h2 style={styles.h2}>What Smarter.Poker Is Not</h2>
          <p style={styles.body}>
            There Is No Real-Money Gambling On Smarter.Poker. Club Chips Are Play Credits With No Cash
            Value, And Diamonds Are A Promotional Rewards Currency. The Platform Is Free To Play And
            Intended For Players Aged 18 And Over. Nothing On The Platform Pays Out Cash, And No Wager
            Placed Here Is A Real-Money Wager.
          </p>

          <h2 style={styles.h2}>What Smarter.Poker Makes</h2>
          <ul style={styles.list}>
            {LANDING_PRODUCTS.map((product) => (
              <li key={product.id} style={styles.item}>
                <Link href={product.href} style={styles.link}>
                  {product.name}
                </Link>
                <span style={styles.itemText}>{product.summary}</span>
              </li>
            ))}
          </ul>

          <h2 style={styles.h2}>The Company</h2>
          <p style={styles.body}>
            Smarter.Poker Is Operated By Smarter Software Inc., The Legal Entity Named In The Terms Of
            Service And The Privacy Policy. Support Is Reached At{' '}
            <a href="mailto:support@smarter.poker" style={styles.inlineLink}>
              Support@Smarter.Poker
            </a>
            , And The Team Publishes Its Open Work On{' '}
            <a href="https://github.com/Smarter-Poker" style={styles.inlineLink} rel="noopener noreferrer">
              GitHub
            </a>
            .
          </p>

          <h2 style={styles.h2}>Policies</h2>
          <p style={styles.body}>
            <Link href="/terms" style={styles.inlineLink}>
              Terms Of Service
            </Link>
            <Link href="/privacy" style={styles.inlineLink}>
              Privacy Policy
            </Link>
            <Link href="/legal/official-rules" style={styles.inlineLink}>
              Official Rules
            </Link>
            <Link href="/hub/commander/responsible-gaming" style={styles.inlineLink}>
              Responsible Gaming
            </Link>
          </p>

          <p style={styles.compliance}>Free To Play. 18+. Diamonds And Chips Have No Cash Value.</p>
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
  article: { maxWidth: 820, margin: '0 auto', padding: '56px 20px 64px' },
  h1: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 'clamp(24px, 4vw, 36px)',
    fontWeight: 700,
    lineHeight: 1.25,
    color: '#ffffff',
    margin: '0 0 20px',
    letterSpacing: '0.5px',
  },
  h2: {
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 'clamp(17px, 2.4vw, 21px)',
    fontWeight: 600,
    color: '#ffffff',
    margin: '36px 0 12px',
    letterSpacing: '0.5px',
  },
  lead: { fontSize: 17, lineHeight: 1.7, color: '#c7d2e2', margin: '0 0 8px' },
  body: { fontSize: 15, lineHeight: 1.7, color: '#b8c4d6', margin: '0 0 8px' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 },
  item: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(0, 198, 255, 0.18)',
    borderRadius: 12,
    padding: '16px 16px 14px',
  },
  link: {
    display: 'block',
    fontFamily: "var(--font-orbitron), sans-serif",
    fontSize: 15,
    fontWeight: 600,
    color: '#00c6ff',
    textDecoration: 'none',
    marginBottom: 6,
    letterSpacing: '0.5px',
  },
  itemText: { fontSize: 14, lineHeight: 1.55, color: '#b8c4d6' },
  inlineLink: { color: '#9fd8ff', textDecoration: 'underline', marginRight: 12 },
  compliance: { fontSize: 12, lineHeight: 1.6, color: '#7f8ca3', margin: '32px 0 0' },
};
