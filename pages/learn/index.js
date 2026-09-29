/* ═══════════════════════════════════════════════════════════════════════════
   /learn - THE POKER STRATEGY LESSON INDEX (AEO section 3.7, 2026-09-22)
   ═══════════════════════════════════════════════════════════════════════════

   Every lesson in src/content/learn/lessons.js, grouped by category, each
   one a real server rendered <a href> with its one sentence answer beside
   it, so a crawler that runs no JavaScript reaches all of them from here.

   Schema: the CollectionPage every lesson's Article declares itself part
   of (@id https://smarter.poker/learn#collection), with an ItemList of the
   lessons, published by the Smarter.Poker organization, plus a
   BreadcrumbList. No author Person.

   The module is read in getStaticProps only, so the range corpus it
   imports never reaches the browser.

   Copy follows the house rule: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  LEARN_PATH,
  LEARN_URL,
  LEARN_COLLECTION_ID,
  ORGANIZATION_ID,
  WEBSITE_ID,
  SITE_URL,
  LEARN_MODIFIED,
  lessonPath,
  categoryAnchor,
} from '../../src/lib/learn/learnSite.js';
import { LESSONS, lessonsByCategory } from '../../src/content/learn/lessons.js';

export async function getStaticProps() {
  return {
    props: {
      count: LESSONS.length,
      groups: lessonsByCategory()
        .filter((g) => g.lessons.length > 0)
        .map((g) => ({
          category: g.category,
          intro: g.intro,
          lessons: g.lessons.map((l) => ({ slug: l.slug, title: l.title, summary: l.summary })),
        })),
    },
  };
}

function indexSchema(groups, description) {
  const lessons = groups.flatMap((g) => g.lessons);
  return [
    {
      '@type': 'CollectionPage',
      '@id': LEARN_COLLECTION_ID,
      name: 'Poker Strategy Lessons',
      description,
      url: LEARN_URL,
      inLanguage: 'en-US',
      dateModified: LEARN_MODIFIED,
      isAccessibleForFree: true,
      isPartOf: { '@id': WEBSITE_ID },
      publisher: { '@id': ORGANIZATION_ID },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: lessons.length,
        itemListElement: lessons.map((l, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE_URL}${lessonPath(l.slug)}`,
          name: l.title,
        })),
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Strategy Lessons', item: LEARN_URL },
      ],
    },
  ];
}

export default function LearnIndex({ count, groups }) {
  const description = `${count} Free Poker Strategy Lessons, Each A Complete Answer With Its Chart Or Table On The Page: Preflop Ranges By Position, ICM, Bubble Play, 3-Bet Sizing, Bankroll Rules And Tilt Control.`;

  return (
    <>
      <SEOHead
        title={`Learn Poker Strategy: ${count} Free Lessons`}
        description={description}
        canonical={LEARN_PATH}
        jsonLd={indexSchema(groups, description)}
      />

      <main style={styles.page}>
        <div style={styles.wrap}>
          <nav aria-label="Breadcrumb" style={styles.crumbs}>
            <Link href="/" style={styles.crumbLink}>
              Smarter.Poker
            </Link>
            <span style={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span>Poker Strategy Lessons</span>
          </nav>

          <h1 style={styles.h1}>Learn Poker Strategy</h1>

          <p style={styles.lead}>
            {count} Free Poker Strategy Lessons, Each One A Complete Answer To A Single Question With The Chart Or
            Table On The Page. Nothing Is Behind A Sign In: Read The Answer First, Then Practise It In The Matching
            Training Game.
          </p>

          <p style={styles.note}>
            The Preflop Charts Come From The Smarter.Poker Preflop Reference, An Authored Teaching Reference For Six
            Handed Cash At One Hundred Big Blinds, Not A Solver Export. Every Other Number Is Worked Out On The Page.
          </p>

          <nav aria-label="Lesson Categories" style={styles.toc}>
            {groups.map((g) => (
              <a key={g.category} href={`#${categoryAnchor(g.category)}`} style={styles.tocLink}>
                {g.category}
              </a>
            ))}
          </nav>

          {groups.map((g) => (
            <section key={g.category} id={categoryAnchor(g.category)} style={styles.section}>
              <h2 style={styles.h2}>{g.category}</h2>
              {g.intro && <p style={styles.intro}>{g.intro}</p>}
              <ul style={styles.list}>
                {g.lessons.map((l) => (
                  <li key={l.slug} style={styles.item}>
                    <Link href={lessonPath(l.slug)} style={styles.link}>
                      {l.title}
                    </Link>
                    <span style={styles.summary}>{l.summary}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <p style={styles.compliance}>Free To Play. 18+. No Real Money Gambling. Chips And Diamonds Have No Cash Value.</p>
        </div>
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
  wrap: { maxWidth: 900, margin: '0 auto', padding: '40px 16px 64px' },
  crumbs: { fontSize: 13, color: '#7f8ca3', margin: '0 0 16px', display: 'flex', gap: 8, flexWrap: 'wrap' },
  crumbLink: { color: '#9fd8ff', textDecoration: 'none' },
  crumbSep: { color: '#4b5568' },
  h1: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(26px, 4.5vw, 40px)',
    fontWeight: 700,
    lineHeight: 1.2,
    color: '#ffffff',
    margin: '0 0 18px',
    letterSpacing: '0.5px',
  },
  lead: { fontSize: 18, lineHeight: 1.7, color: '#dbe4f0', margin: '0 0 12px' },
  note: { fontSize: 14, lineHeight: 1.6, color: '#9fb0c8', margin: '0 0 20px' },
  toc: { display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 12px' },
  tocLink: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(0, 198, 255, 0.25)',
    color: '#9fd8ff',
    fontSize: 14,
    textDecoration: 'none',
  },
  section: { marginTop: 32 },
  h2: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(18px, 2.6vw, 22px)',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 6px',
    letterSpacing: '0.5px',
  },
  intro: { fontSize: 14, lineHeight: 1.6, color: '#9fb0c8', margin: '0 0 12px' },
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
  summary: { fontSize: 14, lineHeight: 1.55, color: '#b8c4d6' },
  compliance: { fontSize: 12, lineHeight: 1.6, color: '#7f8ca3', margin: '32px 0 0' },
};
