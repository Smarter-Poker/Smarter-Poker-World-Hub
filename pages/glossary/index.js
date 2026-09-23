/* ═══════════════════════════════════════════════════════════════════════════
   /glossary - THE POKER GLOSSARY INDEX (AEO section 3.4, 2026-09-22)
   ═══════════════════════════════════════════════════════════════════════════

   The indexable reference for every poker term the site uses. A
   definitional question ("what is a poker union", "what is a must-move
   table") is the question an AI engine answers most often, and it answers
   it from a page that states the definition first and gives the term its
   own URL. So every term here is a real server-rendered link to its own
   page at /glossary/<slug>, and the whole set ships as one DefinedTermSet.

   The terms come from src/content/glossary/terms.js and nowhere else. The
   interactive study tool at /hub/training/glossary reads the same module
   and canonicals here, so there is one indexable page per real thing.

   Copy follows the house rule: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  GLOSSARY_TERMS,
  GLOSSARY_URL,
  GLOSSARY_SET_ID,
  CATEGORY_INTROS,
  glossaryByCategory,
  glossaryTermPath,
} from '../../src/content/glossary/terms';

const categoryAnchor = (category) => category.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** The first sentence of a definition, the answer an index row shows. */
const firstSentence = (text) => {
  const match = String(text).match(/^.+?[.?!](?=\s|$)/);
  return match ? match[0] : String(text);
};

const GLOSSARY_SCHEMA = [
  {
    '@type': 'DefinedTermSet',
    '@id': GLOSSARY_SET_ID,
    name: 'Smarter.Poker Poker Glossary',
    url: GLOSSARY_URL,
    inLanguage: 'en-US',
    description:
      'Definitions Of The Club Poker, Live Room, Preflop, Postflop, Math And Game Theory Terms Used Across Smarter.Poker.',
    isPartOf: { '@id': 'https://smarter.poker/#website' },
    publisher: { '@id': 'https://smarter.poker/#organization' },
    hasDefinedTerm: GLOSSARY_TERMS.map((t) => ({
      '@type': 'DefinedTerm',
      '@id': `https://smarter.poker${glossaryTermPath(t.slug)}#term`,
      name: t.term,
      description: t.definition,
      url: `https://smarter.poker${glossaryTermPath(t.slug)}`,
      termCode: t.slug,
      inDefinedTermSet: { '@id': GLOSSARY_SET_ID },
    })),
  },
  {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
      { '@type': 'ListItem', position: 2, name: 'Poker Glossary', item: GLOSSARY_URL },
    ],
  },
];

export default function GlossaryIndexPage() {
  const groups = glossaryByCategory();
  return (
    <>
      <SEOHead
        title="Poker Glossary: Club, Live And GTO Terms"
        description="Plain Definitions Of Club Poker, Live Room And GTO Strategy Terms, From Poker Unions, Rakeback And Must-Move Tables To 3-Bets, Equity And ICM."
        canonical="/glossary"
        jsonLd={GLOSSARY_SCHEMA}
      />

      <main style={styles.page}>
        <article style={styles.article}>
          <nav aria-label="Breadcrumb" style={styles.crumbs}>
            <Link href="/" style={styles.crumbLink}>
              Smarter.Poker
            </Link>
            <span style={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span>Poker Glossary</span>
          </nav>

          <h1 style={styles.h1}>Poker Glossary</h1>

          <p style={styles.lead}>
            {GLOSSARY_TERMS.length} Poker Terms Defined In Plain Language, From Private Club Poker And Live Room
            Operations To GTO Strategy. Every Term Has Its Own Page, With The Answer First And Links To The Terms
            Around It.
          </p>

          <p style={styles.body}>
            Smarter.Poker Is Play Credit Only. Club Chips Have No Cash Value And Diamonds Are A Promotional Rewards
            Currency, So Terms That Describe Real-Money Practice Elsewhere Are Defined Here As Industry Vocabulary.
          </p>

          <ul style={styles.jumpList} aria-label="Glossary Categories">
            {groups.map((group) => (
              <li key={group.category} style={styles.jumpItem}>
                <a href={`#${categoryAnchor(group.category)}`} style={styles.jumpLink}>
                  {group.category} ({group.terms.length})
                </a>
              </li>
            ))}
          </ul>

          {groups.map((group) => (
            <section key={group.category} id={categoryAnchor(group.category)} style={styles.section}>
              <h2 style={styles.h2}>{group.category}</h2>
              <p style={styles.body}>{CATEGORY_INTROS[group.category]}</p>
              <ul style={styles.list}>
                {group.terms.map((t) => (
                  <li key={t.slug} style={styles.item}>
                    <Link href={glossaryTermPath(t.slug)} style={styles.link}>
                      {t.term}
                    </Link>
                    <span style={styles.itemText}>{firstSentence(t.definition)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <h2 style={styles.h2}>Study The Terms</h2>
          <p style={styles.body}>
            The{' '}
            <Link href="/hub/training/glossary" style={styles.inlineLink}>
              Glossary Study Tool
            </Link>{' '}
            Lets You Search These Definitions, Filter Them By Category And Save The Ones You Keep Missing. Put Them To
            Work In{' '}
            <Link href="/hub/training" style={styles.inlineLink}>
              GTO Training
            </Link>
            .
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
    fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
  },
  article: { maxWidth: 820, margin: '0 auto', padding: '40px 16px 64px' },
  crumbs: { fontSize: 13, color: '#7f8ca3', margin: '0 0 16px', display: 'flex', gap: 8, flexWrap: 'wrap' },
  crumbLink: { color: '#9fd8ff', textDecoration: 'none' },
  crumbSep: { color: '#4b5568' },
  h1: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(24px, 4vw, 36px)',
    fontWeight: 700,
    lineHeight: 1.25,
    color: '#ffffff',
    margin: '0 0 20px',
    letterSpacing: '0.5px',
  },
  h2: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(17px, 2.4vw, 21px)',
    fontWeight: 600,
    color: '#ffffff',
    margin: '36px 0 8px',
    letterSpacing: '0.5px',
  },
  lead: { fontSize: 17, lineHeight: 1.7, color: '#c7d2e2', margin: '0 0 12px' },
  body: { fontSize: 15, lineHeight: 1.7, color: '#b8c4d6', margin: '0 0 12px' },
  jumpList: { listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'flex', flexWrap: 'wrap', gap: 8 },
  jumpItem: { margin: 0 },
  jumpLink: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(0, 198, 255, 0.25)',
    color: '#9fd8ff',
    fontSize: 13,
    textDecoration: 'none',
  },
  section: { scrollMarginTop: 80 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 },
  item: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(0, 198, 255, 0.18)',
    borderRadius: 12,
    padding: '14px 16px 12px',
  },
  link: {
    display: 'block',
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 15,
    fontWeight: 600,
    color: '#00c6ff',
    textDecoration: 'none',
    marginBottom: 6,
    letterSpacing: '0.5px',
  },
  itemText: { fontSize: 14, lineHeight: 1.55, color: '#b8c4d6' },
  inlineLink: { color: '#9fd8ff', textDecoration: 'underline' },
  compliance: { fontSize: 12, lineHeight: 1.6, color: '#7f8ca3', margin: '32px 0 0' },
};
