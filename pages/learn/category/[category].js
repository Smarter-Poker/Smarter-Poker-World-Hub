/* ═══════════════════════════════════════════════════════════════════════════
   /learn/category/<category> - POKER STRATEGY TOPIC CLUSTER PILLAR PAGES
   ═══════════════════════════════════════════════════════════════════════════

   One statically generated CollectionPage per strategy category in
   src/content/learn/lessons.js (Preflop, Postflop, Math, Tournaments, Cash,
   Bankroll, Mental Game, Theory). Every lesson in the category is rendered as
   a server-side <a href> with its one-sentence answer beside it, plus links
   to the matching interactive Smarter.Poker vertical and training tools.

   Copy follows the house rule: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
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
  learnCategoryPath,
} from '../../../src/lib/learn/learnSite.js';
import { LEARN_CATEGORIES, CATEGORY_INTROS, LESSONS } from '../../../src/content/learn/lessons.js';

const CATEGORY_FEATURES = {
  Preflop: { href: '/features/preflop-charts-matrix', name: 'GTO Preflop Charts And Range Matrix', toolHref: '/hub/preflop-charts', toolName: 'Preflop Range Lab' },
  Postflop: { href: '/features/poker-training-games', name: 'GTO Poker Training Games', toolHref: '/hub/training', toolName: 'GTO Training Hub' },
  Math: { href: '/features/poker-equity-calculators', name: 'Poker Equity And ICM Calculators', toolHref: '/tools/poker-odds-calculator', toolName: 'Multiway Equity Calculator' },
  Tournaments: { href: '/features/poker-equity-calculators', name: 'Tournament ICM And Payout Calculators', toolHref: '/tools/icm-calculator', toolName: 'Tournament ICM Calculator' },
  Cash: { href: '/features/poker-near-me', name: 'Live Poker Near Me And Cardroom Finder', toolHref: '/hub/poker-near-me/lobby', toolName: 'Poker Near Me Directory' },
  Bankroll: { href: '/features/bankroll-tax-tracker', name: 'Poker Bankroll And Tax Ledger', toolHref: '/hub/bankroll-manager', toolName: 'Bankroll Manager' },
  'Mental Game': { href: '/features/poker-ai-coach', name: 'Jarvis And PokerBrain AI Coaching', toolHref: '/hub/training/tilt-guard', toolName: 'Tilt Guard' },
  Theory: { href: '/features/virtual-poker-sandbox', name: 'Virtual Poker Table Sandbox', toolHref: '/hub/training/solutions', toolName: 'GTO Solutions Browser' },
};

export async function getStaticPaths() {
  return {
    paths: LEARN_CATEGORIES.map((c) => ({ params: { category: categoryAnchor(c) } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const slug = String(params?.category || '').toLowerCase();
  const category = LEARN_CATEGORIES.find((c) => categoryAnchor(c) === slug);
  if (!category) return { notFound: true };

  const lessons = LESSONS.filter((l) => l.category === category).map((l) => ({
    slug: l.slug,
    title: l.title,
    summary: l.summary,
  }));

  const otherCategories = LEARN_CATEGORIES.filter((c) => c !== category).map((c) => ({
    name: c,
    href: learnCategoryPath(c),
  }));

  return {
    props: {
      category,
      slug,
      intro: CATEGORY_INTROS[category] || '',
      lessons,
      otherCategories,
      feature: CATEGORY_FEATURES[category] || CATEGORY_FEATURES.Preflop,
    },
  };
}

function categorySchema({ category, path, description, lessons }) {
  const url = `${SITE_URL}${path}`;
  return [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#collection`,
      name: `${category} Poker Strategy Lessons`,
      description,
      url,
      inLanguage: 'en-US',
      dateModified: LEARN_MODIFIED,
      isAccessibleForFree: true,
      isPartOf: { '@id': LEARN_COLLECTION_ID },
      publisher: { '@id': ORGANIZATION_ID },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'main p:first-of-type'],
      },
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
        { '@type': 'ListItem', position: 3, name: `${category} Strategy`, item: url },
      ],
    },
  ];
}

export default function LearnCategoryPillarPage({ category, intro, lessons, otherCategories, feature }) {
  const path = learnCategoryPath(category);
  const description = `${lessons.length} Free ${category} Poker Strategy Lessons On Smarter.Poker: ${intro} Every Lesson Includes Complete Worked Answers And Interactive Practice Tools.`;

  return (
    <>
      <SEOHead
        title={`${category} Poker Strategy: ${lessons.length} Free Lessons`}
        description={description}
        canonical={path}
        markdownUrl={`${SITE_URL}${path}.md`}
        jsonLd={categorySchema({ category, path, description, lessons })}
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
            <Link href={LEARN_PATH} style={styles.crumbLink}>
              Poker Strategy Lessons
            </Link>
            <span style={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span>{category} Strategy</span>
          </nav>

          <h1 style={styles.h1}>{category} Poker Strategy Lessons</h1>

          <p style={styles.lead}>
            {intro} Browse {lessons.length} Free {category} Lessons Below, Each Written With The Answer In The First
            Sentence And Backed By Free Smarter.Poker Training Tools.
          </p>

          <section style={styles.section}>
            <h2 style={styles.h2}>All {category} Lessons</h2>
            <ul style={styles.list}>
              {lessons.map((l) => (
                <li key={l.slug} style={styles.item}>
                  <Link href={lessonPath(l.slug)} style={styles.link}>
                    {l.title}
                  </Link>
                  <span style={styles.summary}>{l.summary}</span>
                </li>
              ))}
            </ul>
          </section>

          <section style={styles.cta}>
            <h2 style={styles.h2}>Practice {category} Strategy On Smarter.Poker</h2>
            <p style={styles.intro}>
              Drill What You Read Using Our Free {category} Tools And Feature Guides:
            </p>
            <ul style={styles.chips}>
              <li>
                <Link href={feature.toolHref} style={styles.chip}>
                  Open {feature.toolName}
                </Link>
              </li>
              <li>
                <Link href={feature.href} style={styles.chip}>
                  Explore {feature.name}
                </Link>
              </li>
              <li>
                <Link href="/glossary" style={styles.chip}>
                  Poker Glossary
                </Link>
              </li>
            </ul>
          </section>

          <section style={styles.section}>
            <h2 style={styles.h2}>Other Poker Strategy Topic Clusters</h2>
            <ul style={styles.chips}>
              {otherCategories.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} style={styles.chip}>
                    {c.name} Strategy
                  </Link>
                </li>
              ))}
              <li>
                <Link href={LEARN_PATH} style={styles.chip}>
                  All Strategy Lessons
                </Link>
              </li>
            </ul>
          </section>

          <p style={styles.compliance}>
            Free To Play. 18+. No Real Money Gambling. Chips And Diamonds Have No Cash Value.
          </p>
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
  lead: { fontSize: 18, lineHeight: 1.7, color: '#dbe4f0', margin: '0 0 18px' },
  section: { marginTop: 32 },
  h2: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(18px, 2.6vw, 22px)',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 10px',
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
  cta: {
    marginTop: 32,
    background: 'rgba(0, 198, 255, 0.06)',
    border: '1px solid rgba(0, 198, 255, 0.25)',
    borderRadius: 14,
    padding: '18px 18px 14px',
  },
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
  compliance: { fontSize: 12, lineHeight: 1.6, color: '#7f8ca3', margin: '32px 0 0' },
};
