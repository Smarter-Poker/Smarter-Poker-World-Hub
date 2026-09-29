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
            <div className="cmp-table-wrap">
              <table className="cmp-table">
                <caption>{page.table.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
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
          </ul>

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

          <p className="cmp-compliance">Free To Play. 18+. Diamonds And Chips Have No Cash Value.</p>
        </article>
      </main>
    </>
  );
}
