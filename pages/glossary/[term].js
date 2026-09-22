/* ═══════════════════════════════════════════════════════════════════════════
   /glossary/<slug> - ONE PAGE PER POKER TERM (AEO section 3.4, 2026-09-22)
   ═══════════════════════════════════════════════════════════════════════════

   A "what is X" prompt retrieves best from a page whose URL, <title>, <h1>
   and first paragraph all answer the same question. So each term gets its
   own statically generated page: the term is the h1, the definition is the
   first thing under it, the related terms are real links, and the page
   ships a DefinedTerm that points back at the DefinedTermSet on /glossary,
   plus a BreadcrumbList.

   Paths and content come from src/content/glossary/terms.js. fallback is
   false, so a slug that is not in the module is a real 404, never an empty
   shell. The title is fitted by src/lib/seo/titleFit.js, which counts the
   " | Smarter.Poker" suffix SEOHead appends.

   Copy follows the house rule: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import { firstThatFits } from '../../src/lib/seo/titleFit.js';
import {
  GLOSSARY_TERMS,
  GLOSSARY_PATH,
  GLOSSARY_URL,
  GLOSSARY_SET_ID,
  CATEGORY_PRODUCTS,
  getGlossaryTerm,
  relatedGlossaryTerms,
  glossaryTermPath,
} from '../../src/content/glossary/terms';

/** Whole sentences of the definition, up to about a search snippet. */
function metaDescription(definition) {
  const sentences = String(definition).match(/[^.?!]+[.?!]+(\s|$)/g) || [String(definition)];
  let out = '';
  for (const sentence of sentences) {
    const next = (out + sentence).trim();
    if (out && next.length > 160) break;
    out = `${next} `;
  }
  return out.trim();
}

export async function getStaticPaths() {
  return {
    paths: GLOSSARY_TERMS.map((t) => ({ params: { term: t.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const term = getGlossaryTerm(params?.term);
  if (!term) return { notFound: true };
  return {
    props: {
      term,
      related: relatedGlossaryTerms(term).map((r) => ({ slug: r.slug, term: r.term })),
      products: CATEGORY_PRODUCTS[term.category] || [],
    },
  };
}

export default function GlossaryTermPage({ term, related, products }) {
  const path = glossaryTermPath(term.slug);
  const url = `https://smarter.poker${path}`;
  // "What Is Poker Union In Poker?" says poker twice; a term that already
  // names the game is asked about as it is.
  const inPoker = /\bpoker\b/i.test(term.term) ? '' : ' In Poker';
  const title = firstThatFits([
    `What Is ${term.term}${inPoker}? Definition`,
    `What Is ${term.term}${inPoker}?`,
    `${term.term}${inPoker}`,
    term.term,
  ]);
  const schema = [
    {
      '@type': 'DefinedTerm',
      '@id': `${url}#term`,
      name: term.term,
      description: term.definition,
      url,
      termCode: term.slug,
      inDefinedTermSet: {
        '@type': 'DefinedTermSet',
        '@id': GLOSSARY_SET_ID,
        name: 'Smarter.Poker Poker Glossary',
        url: GLOSSARY_URL,
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Poker Glossary', item: GLOSSARY_URL },
        { '@type': 'ListItem', position: 3, name: term.term, item: url },
      ],
    },
  ];

  return (
    <>
      <SEOHead title={title} description={metaDescription(term.definition)} canonical={path} jsonLd={schema} />

      <main style={styles.page}>
        <article style={styles.article}>
          <nav aria-label="Breadcrumb" style={styles.crumbs}>
            <Link href="/" style={styles.crumbLink}>
              Smarter.Poker
            </Link>
            <span style={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <Link href={GLOSSARY_PATH} style={styles.crumbLink}>
              Poker Glossary
            </Link>
            <span style={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span>{term.term}</span>
          </nav>

          <h1 style={styles.h1}>{term.term}</h1>

          <p style={styles.lead}>{term.definition}</p>

          <p style={styles.category}>
            Category:{' '}
            <Link href={`${GLOSSARY_PATH}#${term.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} style={styles.inlineLink}>
              {term.category}
            </Link>
          </p>

          {related.length > 0 && (
            <>
              <h2 style={styles.h2}>Related Terms</h2>
              <ul style={styles.chips}>
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={glossaryTermPath(r.slug)} style={styles.chip}>
                      {r.term}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {products.length > 0 && (
            <>
              <h2 style={styles.h2}>On Smarter.Poker</h2>
              <ul style={styles.list}>
                {products.map((p) => (
                  <li key={p.href} style={styles.item}>
                    <Link href={p.href} style={styles.link}>
                      {p.name}
                    </Link>
                    <span style={styles.itemText}>{p.text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p style={styles.back}>
            <Link href={GLOSSARY_PATH} style={styles.inlineLink}>
              Back To The Poker Glossary
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
    fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
  },
  article: { maxWidth: 760, margin: '0 auto', padding: '40px 16px 64px' },
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
    overflowWrap: 'anywhere',
  },
  h2: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(17px, 2.4vw, 21px)',
    fontWeight: 600,
    color: '#ffffff',
    margin: '32px 0 12px',
    letterSpacing: '0.5px',
  },
  lead: { fontSize: 18, lineHeight: 1.7, color: '#dbe4f0', margin: '0 0 12px' },
  category: { fontSize: 14, color: '#7f8ca3', margin: '0 0 8px' },
  chips: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(0, 198, 255, 0.25)',
    color: '#9fd8ff',
    fontSize: 14,
    textDecoration: 'none',
  },
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
  back: { fontSize: 15, margin: '32px 0 0' },
  compliance: { fontSize: 12, lineHeight: 1.6, color: '#7f8ca3', margin: '24px 0 0' },
};
