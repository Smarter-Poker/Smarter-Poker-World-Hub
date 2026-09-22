/* ═══════════════════════════════════════════════════════════════════════════
   /learn/<slug> - ONE POKER STRATEGY LESSON PER PAGE (AEO section 3.7, 2026-09-22)
   ═══════════════════════════════════════════════════════════════════════════

   A strategy question retrieves best from a page whose URL, <title>, <h1>
   and first paragraph all answer it. Each lesson is statically generated:
   the title is the h1, the one sentence answer is the first paragraph, the
   sections follow as h2s with every chart and table as a real <table>, the
   related lessons and glossary terms are real links, and the training call
   to action comes last. Nothing is gated; the whole answer is in the
   server HTML.

   Paths and content come from src/content/learn/lessons.js, read only in
   getStaticProps and getStaticPaths so the 70 KB range corpus it imports
   never reaches the browser. fallback is false, so a slug that is not in
   the module is a real 404.

   Schema: an Article published by the Smarter.Poker organization, part of
   the /learn CollectionPage, plus a BreadcrumbList. No author Person and
   no byline: the programme has no named author yet, and inventing one is
   not an option.

   Copy follows the house rule: Title Case, no em dashes.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import { firstThatFits } from '../../src/lib/seo/titleFit.js';
import {
  LEARN_PATH,
  LEARN_URL,
  LEARN_COLLECTION_ID,
  ORGANIZATION_ID,
  SITE_URL,
  LEARN_PUBLISHED,
  LEARN_MODIFIED,
  lessonPath,
  categoryAnchor,
  glossaryTermPath,
} from '../../src/lib/learn/learnSite.js';
import { LESSONS, getLesson, trainingCta } from '../../src/content/learn/lessons.js';
import { readGlossaryTerms, glossaryLinksFor } from '../../src/lib/learn/glossaryLinks.js';

export async function getStaticPaths() {
  return {
    paths: LESSONS.map((l) => ({ params: { topic: l.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const lesson = getLesson(params?.topic);
  if (!lesson) return { notFound: true };
  const related = lesson.related
    .map((slug) => getLesson(slug))
    .filter(Boolean)
    .map((l) => ({ slug: l.slug, title: l.title }));
  return {
    props: {
      lesson,
      related,
      glossary: glossaryLinksFor(lesson.glossary, readGlossaryTerms()),
      cta: trainingCta(lesson),
    },
  };
}

/** A lesson's JSON-LD: the Article and its breadcrumb trail. */
function lessonSchema(lesson) {
  const url = `${SITE_URL}${lessonPath(lesson.slug)}`;
  return [
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: lesson.title,
      description: lesson.summary,
      url,
      mainEntityOfPage: url,
      datePublished: LEARN_PUBLISHED,
      dateModified: LEARN_MODIFIED,
      inLanguage: 'en-US',
      articleSection: lesson.category,
      isAccessibleForFree: true,
      publisher: { '@id': ORGANIZATION_ID },
      isPartOf: {
        '@type': 'CollectionPage',
        '@id': LEARN_COLLECTION_ID,
        name: 'Poker Strategy Lessons',
        url: LEARN_URL,
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Poker Strategy Lessons', item: LEARN_URL },
        { '@type': 'ListItem', position: 3, name: lesson.title, item: url },
      ],
    },
  ];
}

function RangeChart({ chart }) {
  const { grid, sizes } = chart;
  const multi = grid.actions.length > 1;
  return (
    <figure style={styles.figure}>
      <div style={styles.scroll}>
        <table style={styles.grid}>
          <caption style={styles.caption}>{chart.caption}</caption>
          <thead>
            <tr>
              <th scope="col" style={styles.corner}>
                <span style={styles.hidden}>Rank</span>
              </th>
              {grid.ranks.map((rank) => (
                <th key={rank} scope="col" style={styles.rankHead}>
                  {rank}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.rank}>
                <th scope="row" style={styles.rankHead}>
                  {row.rank}
                </th>
                {row.cells.map((cell) => (
                  <td
                    key={cell.hand}
                    style={{ ...styles.cell, background: `rgba(0, 198, 255, ${(cell.played / 100) * 0.55})` }}
                  >
                    <span style={styles.hand}>{cell.hand}</span>
                    {cell.values.map((v) => (
                      <span key={v.key} style={styles.freq}>
                        {multi ? `${v.label} ${v.percent}%` : `${v.percent}%`}
                      </span>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption style={styles.figcaption}>
        {sizes.reach !== null && sizes.reach !== undefined
          ? `Opens ${sizes.percent}% Of All Starting Hands By Frequency, And Plays ${sizes.reach}% At Least Some Of The Time.`
          : `Continues With ${sizes.percent}% Of All Starting Hands By Frequency.`}{' '}
        Pairs Are On The Diagonal, Suited Hands Above It And Offsuit Hands Below It.
      </figcaption>
    </figure>
  );
}

function DataTable({ table }) {
  return (
    <div style={styles.scroll}>
      <table style={styles.table}>
        <caption style={styles.caption}>{table.caption}</caption>
        <thead>
          <tr>
            {table.head.map((h) => (
              <th key={h} scope="col" style={styles.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.join('|')}>
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" style={styles.tdHead}>
                    {cell}
                  </th>
                ) : (
                  <td key={i} style={styles.td}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LessonPage({ lesson, related, glossary, cta }) {
  const path = lessonPath(lesson.slug);
  const title = firstThatFits([lesson.title]);

  return (
    <>
      <SEOHead title={title} description={lesson.summary} canonical={path} ogType="article" jsonLd={lessonSchema(lesson)} />

      <main style={styles.page}>
        <article style={styles.article}>
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
            <span>{lesson.title}</span>
          </nav>

          <h1 style={styles.h1}>{lesson.title}</h1>

          <p style={styles.lead}>{lesson.summary}</p>

          <p style={styles.meta}>
            <Link href={`${LEARN_PATH}#${categoryAnchor(lesson.category)}`} style={styles.inlineLink}>
              {lesson.category}
            </Link>{' '}
            Lesson From Smarter.Poker, Updated <time dateTime={LEARN_MODIFIED}>{LEARN_MODIFIED}</time>
          </p>

          {lesson.sections.map((section) => (
            <section key={section.heading}>
              <h2 style={styles.h2}>{section.heading}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={i} style={styles.p}>
                  {p}
                </p>
              ))}
              {section.chart && <RangeChart chart={section.chart} />}
              {section.table && <DataTable table={section.table} />}
            </section>
          ))}

          {related.length > 0 && (
            <>
              <h2 style={styles.h2}>Keep Learning</h2>
              <ul style={styles.list}>
                {related.map((r) => (
                  <li key={r.slug} style={styles.listItem}>
                    <Link href={lessonPath(r.slug)} style={styles.inlineLink}>
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {glossary.length > 0 && (
            <>
              <h2 style={styles.h2}>Poker Terms In This Lesson</h2>
              <ul style={styles.chips}>
                {glossary.map((g) => (
                  <li key={g.slug}>
                    <Link href={glossaryTermPath(g.slug)} style={styles.chip}>
                      {g.term}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <section style={styles.cta} aria-labelledby="practise-heading">
            <h2 id="practise-heading" style={styles.ctaHeading}>
              Practise It On Smarter.Poker
            </h2>
            <p style={styles.ctaText}>
              The Answer Above Is Complete. When You Want To Drill It, These Are The Matching Training Tools.
            </p>
            <ul style={styles.ctaList}>
              {cta.game && (
                <li>
                  <Link href={cta.game.href} style={styles.ctaLink}>
                    Play {cta.game.name}
                  </Link>
                  <span style={styles.ctaNote}> The Training Game For This Lesson.</span>
                </li>
              )}
              {cta.tool && (
                <li>
                  <Link href={cta.tool.href} style={styles.ctaLink}>
                    Open The {cta.tool.name}
                  </Link>
                </li>
              )}
              <li>
                <Link href={cta.jarvis.href} style={styles.ctaLink}>
                  Open {cta.jarvis.name}
                </Link>
                <span style={styles.ctaNote}> Jarvis Explains Your Training Decisions In Words.</span>
              </li>
            </ul>
          </section>

          <p style={styles.back}>
            <Link href={LEARN_PATH} style={styles.inlineLink}>
              All Poker Strategy Lessons
            </Link>
          </p>

          <p style={styles.compliance}>Free To Play. 18+. No Real Money Gambling. Chips And Diamonds Have No Cash Value.</p>
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
  meta: { fontSize: 13, color: '#7f8ca3', margin: '0 0 8px' },
  p: { fontSize: 16, lineHeight: 1.75, color: '#c9d3e3', margin: '0 0 14px' },
  figure: { margin: '8px 0 20px' },
  scroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '8px 0 16px', maxWidth: '100%' },
  grid: { borderCollapse: 'collapse', fontSize: 11, minWidth: 620, width: '100%' },
  caption: { captionSide: 'top', textAlign: 'left', fontSize: 13, color: '#9fb0c8', padding: '0 0 8px' },
  corner: { padding: 4 },
  hidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' },
  rankHead: { padding: '4px 6px', color: '#9fd8ff', fontWeight: 700, textAlign: 'center' },
  cell: {
    border: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '4px 3px',
    textAlign: 'center',
    verticalAlign: 'middle',
    color: '#ffffff',
    lineHeight: 1.25,
  },
  hand: { display: 'block', fontWeight: 700 },
  freq: { display: 'block', color: '#dbe4f0' },
  figcaption: { fontSize: 13, lineHeight: 1.6, color: '#9fb0c8' },
  table: { borderCollapse: 'collapse', fontSize: 14, width: '100%', minWidth: 420 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid rgba(0, 198, 255, 0.35)', color: '#ffffff' },
  tdHead: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#dbe4f0', fontWeight: 600 },
  td: { padding: '8px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#c9d3e3' },
  list: { margin: 0, padding: '0 0 0 18px', display: 'grid', gap: 6 },
  listItem: { fontSize: 15, lineHeight: 1.6 },
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
  cta: {
    marginTop: 36,
    background: 'rgba(0, 198, 255, 0.06)',
    border: '1px solid rgba(0, 198, 255, 0.25)',
    borderRadius: 14,
    padding: '18px 18px 12px',
  },
  ctaHeading: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 18,
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 8px',
  },
  ctaText: { fontSize: 14, lineHeight: 1.6, color: '#b8c4d6', margin: '0 0 10px' },
  ctaList: { margin: 0, padding: '0 0 0 18px', display: 'grid', gap: 8, fontSize: 15 },
  ctaLink: { color: '#00c6ff', fontWeight: 600, textDecoration: 'underline' },
  ctaNote: { color: '#9fb0c8', fontSize: 14 },
  inlineLink: { color: '#9fd8ff', textDecoration: 'underline' },
  back: { fontSize: 15, margin: '32px 0 0' },
  compliance: { fontSize: 12, lineHeight: 1.6, color: '#7f8ca3', margin: '24px 0 0' },
};
