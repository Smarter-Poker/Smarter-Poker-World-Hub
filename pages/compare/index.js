/* ═══════════════════════════════════════════════════════════════════════════
   /compare - every comparison and best-of page
   ═══════════════════════════════════════════════════════════════════════════

   AEO PROGRAMME SECTION 3.3 (2026-09-22). The index an engine lands on
   first: what these pages are, how they were checked, and a link to each
   one with its answer-first summary. Built from src/content/compare/pages.js
   so a page added there is listed here the same day.
   ═══════════════════════════════════════════════════════════════════════════ */

import Link from 'next/link';
import SEOHead, { schemas } from '../../src/components/seo/SEOHead';
import { COMPARE_CSS } from '../../src/components/compare/CompareStyles';
import {
  CHECKED_LABEL,
  COMPARE_BASE,
  COMPARE_INDEX_TITLE,
  COMPARE_PAGES,
  PLAY_CREDIT_DISCLOSURE,
  compareIndexJsonLd,
  comparePath,
} from '../../src/content/compare/pages';

export async function getStaticProps() {
  return { props: {} };
}

const INDEX_LEAD =
  'Side By Side Comparisons Of Poker Club Apps, Apps For Playing With Friends, Poker Room Management Software, GTO Trainers And Bankroll Trackers, Including The Smarter.Poker Products In Each Category. Every Fact Comes From A Store Listing, Maker Site Or Trade Press Article Linked On The Page, And Anything No Source Publishes Is Marked Not Published.';

const INDEX_METHOD =
  'We Do Not Use Star Ratings, Review Counts, Download Counts Or Rankings From Other Sites. Each Page Lists Where The Other Products Do More Than Ours, And We Check Every Source Again Each Quarter.';

export default function CompareIndex() {
  return (
    <>
      <SEOHead
        title="Poker App And Software Comparisons"
        description="Honest Comparisons Of Poker Club Apps, Poker Room Management Software, GTO Trainers And Bankroll Trackers, With Every Fact Sourced And Dated."
        canonical={COMPARE_BASE}
        jsonLd={[schemas.organization, ...compareIndexJsonLd()]}
      />
      <style dangerouslySetInnerHTML={{ __html: COMPARE_CSS }} />

      <main className="cmp-page">
        <article className="cmp-article">
          <nav className="cmp-crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
          </nav>

          <h1 className="cmp-h1">{COMPARE_INDEX_TITLE}</h1>
          <p className="cmp-lead">{INDEX_LEAD}</p>
          <p className="cmp-checked">{CHECKED_LABEL}</p>
          <p className="cmp-disclosure">{PLAY_CREDIT_DISCLOSURE.value}</p>
          <p className="cmp-body">{INDEX_METHOD}</p>

          <h2 className="cmp-h2">All Comparisons</h2>
          <ul className="cmp-related">
            {COMPARE_PAGES.map((page) => (
              <li key={page.slug}>
                <Link href={comparePath(page.slug)}>{page.h1}</Link>
                <p>{page.summary.text}</p>
              </li>
            ))}
          </ul>

          <p className="cmp-compliance">Free To Play. 18+. Diamonds And Chips Have No Cash Value.</p>
        </article>
      </main>
    </>
  );
}
