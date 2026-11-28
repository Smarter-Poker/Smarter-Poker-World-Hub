/* ═══════════════════════════════════════════════════════════════════════════
   /compare/<slug> - one comparison or best-of page
   ═══════════════════════════════════════════════════════════════════════════

   AEO PROGRAMME SECTION 3.3 (2026-09-22). Comparison and best-of pages are
   the format AI engines cite most, and the one where a wrong claim about a
   named competitor does the most harm. So this template states nothing of
   its own: every cell, sentence and source comes from
   src/content/compare/pages.js and src/content/compare/facts.js, where each
   fact carries the URL it was read from and the day it was read.

   Everything an engine needs is in the server HTML: the h1, the answer-first
   paragraph, a real <table>, the "Checked" line, the play-credit disclosure
   and the Sources list. Statically generated, fallback false, so a slug that
   is not in the module is a 404 rather than an empty shell.

   Law: __tests__/a-comparison-cites-what-it-claims.law.test.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead, { schemas } from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import SmarterConversionCta from '../../src/components/seo/SmarterConversionCta';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import SmarterHandPasteTeaser from '../../src/components/seo/SmarterHandPasteTeaser';
import { resolveCompareLinkMesh } from '../../src/lib/seo/internalLinkMesh.mjs';
import { COMPARE_CSS } from '../../src/components/compare/CompareStyles';
import {
  CHECKED_LABEL,
  COMPARE_BASE,
  COMPARE_PAGES,
  PLAY_CREDIT_DISCLOSURE,
  PRODUCTS,
  SOURCES_NOTE,
  cellFor,
  compareJsonLd,
  comparePath,
  getComparePage,
  glossaryHref,
  pageSources,
} from '../../src/content/compare/pages';
import { VENUE_COUNT_LABEL } from '../../src/lib/venueCount.mjs';

export async function getStaticPaths() {
  return {
    paths: COMPARE_PAGES.map((page) => ({ params: { slug: page.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const page = getComparePage(params.slug);
  if (!page) return { notFound: true };
  return { props: { slug: page.slug } };
}

function Cell({ productId, column }) {
  const cell = cellFor(productId, column.key);
  return (
    <td data-label={column.label} className={cell.unknown ? 'cmp-unknown' : undefined}>
      {cell.value}
    </td>
  );
}

export default function ComparePage({ slug }) {
  const page = getComparePage(slug);
  const sources = pageSources(page);
  const related = page.related.map((relatedSlug) => getComparePage(relatedSlug)).filter(Boolean);
  const linkMesh = resolveCompareLinkMesh(page.slug);

  return (
    <>
      <SEOHead
        title={page.title}
        description={page.description}
        canonical={comparePath(page.slug)}
        ogType="article"
        jsonLd={[schemas.organization, ...compareJsonLd(page)]}
      />
      <style dangerouslySetInnerHTML={{ __html: COMPARE_CSS }} />

      <main className="cmp-page">
        <article className="cmp-article">
          <nav className="cmp-crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link> / <Link href={COMPARE_BASE}>Comparisons</Link>
          </nav>

          <h1 className="cmp-h1">{page.h1}</h1>
          <p className="cmp-lead">{page.summary.text}</p>
          <p className="cmp-checked">{CHECKED_LABEL}</p>
          <p className="cmp-body">{page.intro.text}</p>
          <p className="cmp-disclosure">{PLAY_CREDIT_DISCLOSURE.value}</p>

          {page.table && (
            <div className="cmp-table-wrap" style={{ overflowX: 'auto' }}>
              <table className="cmp-table">
                <caption>{page.table.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{page.table.subjectLabel || 'Product'}</th>
                    {page.table.columns.map((column) => (
                      <th scope="col" key={column.key}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.table.products.map((productId) => {
                    const product = PRODUCTS[productId];
                    return (
                      <tr key={productId} className={product.own ? 'cmp-own' : undefined}>
                        <th scope="row">
                          {product.own ? (
                            <Link href={product.href} className="cmp-link">
                              {product.name}
                            </Link>
                          ) : (
                            product.name
                          )}
                        </th>
                        {page.table.columns.map((column) => (
                          <Cell key={column.key} productId={productId} column={column} />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {page.steps && (
            <>
              <h2 className="cmp-h2">Steps</h2>
              <ol className="cmp-steps">
                {page.steps.map((step) => (
                  <li key={step.text}>{step.text}</li>
                ))}
              </ol>
            </>
          )}

          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="cmp-h2">{section.heading}</h2>
              {(section.paragraphs || []).map((paragraph) => (
                <p key={paragraph.text} className="cmp-body">
                  {paragraph.text}
                </p>
              ))}
              {section.bullets && (
                <ul className="cmp-list">
                  {section.bullets.map((bullet) => (
                    <li key={bullet.text}>{bullet.text}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {page.faq.length > 0 && (
            <section>
              <h2 className="cmp-h2">Questions</h2>
              <dl className="cmp-faq">
                {page.faq.map((item) => (
                  <div key={item.q}>
                    <dt>{item.q}</dt>
                    <dd>{item.a.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <h2 className="cmp-h2">Try It On Smarter.Poker</h2>
          <ul className="cmp-list">
            {page.productLinks.map((productId) => (
              <li key={productId}>
                <Link href={PRODUCTS[productId].href} className="cmp-link">
                  {PRODUCTS[productId].name}
                </Link>
              </li>
            ))}
            {(page.extraLinks || []).map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="cmp-link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <SmarterConversionCta
            eyebrow="Switch To 100% Free Poker Tools"
            title="Start Using Smarter.Poker Free With Zero Subscriptions"
            description={`Get 107 Free GTO Training Games, Browser-Native Odds & ICM Calculators, And ${VENUE_COUNT_LABEL} Live Poker Room Listings In One Free Account.`}
            primaryLabel="Create Free Account"
            primaryHref={`/auth/signup?redirect=/hub/training&src=compare-${encodeURIComponent(page.slug)}`}
            secondaryLabel="Browse Free Poker Tools"
            secondaryHref="/tools"
          />

          <SmarterHandPasteTeaser
            context={`compare-${page.slug}`}
            redirectPath={comparePath(page.slug)}
          />

          <section
            data-testid="internal-link-mesh"
            aria-label="Recommended Free Poker Tools And Training"
            style={{
              boxSizing: 'border-box',
              width: '100%',
              maxWidth: '100%',
              margin: '24px 0',
              padding: 20,
              background: '#0b1120',
              border: '1px solid #1e3a5f',
              borderRadius: 0,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#38bdf8',
                marginBottom: 6,
              }}
            >
              Matched Smarter.Poker Tools
            </div>
            <h2
              style={{
                margin: '0 0 14px',
                fontSize: 19,
                fontWeight: 800,
                color: '#f2f7ff',
              }}
            >
              Continue With Free Calculators & GTO Training
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {linkMesh.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 44,
                    padding: '14px 16px',
                    background: '#060c18',
                    border: '1px solid #1e3a5f',
                    borderLeft: '3px solid #2563eb',
                    borderRadius: 0,
                    textDecoration: 'none',
                    color: '#f2f7ff',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: '#38bdf8',
                    }}
                  >
                    {item.eyebrow}
                  </span>
                  <span
                    style={{
                      marginTop: 6,
                      fontSize: 15,
                      fontWeight: 800,
                      color: '#f2f7ff',
                    }}
                  >
                    {item.label}
                  </span>
                  <span
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: '#bdd0e2',
                    }}
                  >
                    {item.description}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {page.glossary.length > 0 && (
            <>
              <h2 className="cmp-h2">Terms Used On This Page</h2>
              <ul className="cmp-list">
                {page.glossary.map((term) => (
                  <li key={term}>
                    <Link href={glossaryHref(term)} className="cmp-link">
                      {term}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="cmp-h2">Related Comparisons</h2>
          <ul className="cmp-related">
            {related.map((item) => (
              <li key={item.slug}>
                <Link href={comparePath(item.slug)}>{item.h1}</Link>
                <p>{item.description}</p>
              </li>
            ))}
          </ul>

          <h2 className="cmp-h2">Sources</h2>
          <p className="cmp-body">{SOURCES_NOTE}</p>
          <ol className="cmp-sources">
            {sources.map((source) => (
              <li key={source.key}>
                <a href={source.url} rel="nofollow noopener">
                  {source.title}
                </a>
              </li>
            ))}
          </ol>

          <AiPromptLauncher
            title={page.h1}
            canonicalUrl={`https://smarter.poker${comparePath(page.slug)}`}
            markdownUrl={`https://smarter.poker${comparePath(page.slug)}.md`}
          />

          <div style={{ margin: '24px 0' }}>
            <SmarterAccountUnlockGate
              variant="dataset-export"
              context="compare-detail"
              redirectPath={comparePath(page.slug)}
            />
          </div>

          <CitationBacklinkBox
            title={page.h1}
            canonicalUrl={`https://smarter.poker${comparePath(page.slug)}`}
            badgeType="research"
            badgeLabel="Verified Comparison"
            badgeValue="Smarter.Poker Benchmarks"
            summary={page.description}
            publishedYear="2026"
            slug={`compare-${page.slug}`}
          />

          <p className="cmp-compliance">Free To Play. 18+. Diamonds And Chips Have No Cash Value.</p>
        </article>
      </main>
    </>
  );
}
