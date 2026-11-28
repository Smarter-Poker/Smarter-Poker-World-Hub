/**
 * PROGRAMMATIC HAND-VS-HAND EQUITY PAGE -- /tools/odds/[matchup]
 * ===============================================================
 * Static pre-rendered poker odds and equity breakdown for the 30 iconic
 * No-Limit Hold'em and 4-Card Pot-Limit Omaha (PLO4) head-to-head matchups.
 *
 * House style: #SMARTERDESIGN (0px corners, navy/chrome hardware, zero banned
 * gold hexes), Title Case, zero em dashes, zero en dashes.
 */

import Link from 'next/link';
import SEOHead, { schemas } from '../../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../../src/lib/seo/hubPageSchema';
import SmarterSeoMasthead from '../../../src/components/seo/SmarterSeoMasthead';
import SmarterCalculatorSaveBar from '../../../src/components/seo/SmarterCalculatorSaveBar';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import SmarterHandPasteTeaser from '../../../src/components/seo/SmarterHandPasteTeaser';
import { resolveMatchupLinkMesh } from '../../../src/lib/seo/internalLinkMesh.mjs';
import FaqSection from '../../../src/components/seo/FaqSection';
import styles from '../../../src/components/seo/SmarterSeoKit.module.css';
import {
  TOOL_HAND_MATCHUPS,
  getToolHandMatchup,
  toolMatchupPath,
} from '../../../src/content/tools/handMatchups';

export async function getStaticPaths() {
  return {
    paths: TOOL_HAND_MATCHUPS.map((item) => ({
      params: { matchup: item.slug },
    })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const matchup = getToolHandMatchup(params?.matchup);
  if (!matchup) {
    return { notFound: true };
  }
  const related = (matchup.relatedSlugs || [])
    .map((slug) => getToolHandMatchup(slug))
    .filter(Boolean)
    .map((item) => ({
      slug: item.slug,
      path: item.path,
      handA: item.handA,
      handB: item.handB,
      equityA: item.equityA,
      equityB: item.equityB,
      gameLabel: item.gameLabel,
    }));

  const linkMesh = resolveMatchupLinkMesh(matchup, TOOL_HAND_MATCHUPS);

  return {
    props: {
      matchup,
      related,
      linkMesh,
    },
  };
}

export default function ToolHandMatchupPage({ matchup, related = [], linkMesh = null }) {
  const canonicalPath = toolMatchupPath(matchup.slug);
  const resolvedLinkMesh = linkMesh || resolveMatchupLinkMesh(matchup, TOOL_HAND_MATCHUPS);
  const faqs = matchup.faqs;
  const schemaNodes = hubProductSchema({
    path: canonicalPath,
    name: matchup.h1,
    description: matchup.description,
    applicationCategory: 'GameApplication',
    trail: [
      ['Poker Tools', '/tools'],
      ['Poker Odds Calculator', '/tools/poker-odds-calculator'],
      [`${matchup.handA} Vs ${matchup.handB}`, canonicalPath],
    ],
    faqs,
  });

  const winAPct = `${matchup.winA.toFixed(2)}%`;
  const winBPct = `${matchup.winB.toFixed(2)}%`;
  const tiePct = `${matchup.tie.toFixed(2)}%`;
  const eqAPct = `${matchup.equityA.toFixed(2)}%`;
  const eqBPct = `${matchup.equityB.toFixed(2)}%`;

  return (
    <>
      <SEOHead
        title={matchup.title}
        description={matchup.description}
        canonical={canonicalPath}
        jsonLd={[schemas.organization, ...schemaNodes]}
      />

      <main
        style={{
          minHeight: '100vh',
          background: '#040d18',
          color: '#f2f7ff',
          padding: '24px 16px 64px',
        }}
      >
        <div style={{ maxWidth: 1020, margin: '0 auto' }}>
          <nav
            aria-label="Breadcrumb"
            style={{
              fontSize: 13,
              color: '#86daff',
              marginBottom: 16,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <Link href="/" style={{ color: '#86daff', textDecoration: 'none' }}>
              Home
            </Link>
            <span style={{ color: '#64748b' }}>/</span>
            <Link href="/tools" style={{ color: '#86daff', textDecoration: 'none' }}>
              Poker Tools
            </Link>
            <span style={{ color: '#64748b' }}>/</span>
            <Link
              href="/tools/poker-odds-calculator"
              style={{ color: '#86daff', textDecoration: 'none' }}
            >
              Odds Calculator
            </Link>
            <span style={{ color: '#64748b' }}>/</span>
            <span style={{ color: '#f2f7ff', fontWeight: 700 }}>
              {matchup.handA} Vs {matchup.handB}
            </span>
          </nav>

          <SmarterSeoMasthead
            vertical="tools"
            eyebrow={`${matchup.gameLabel} Preflop Equity`}
            title={matchup.h1}
            lead={matchup.description}
            stats={[
              { label: `${matchup.handA} Equity`, value: eqAPct },
              { label: `${matchup.handB} Equity`, value: eqBPct },
              { label: 'Split Pot Rate', value: tiePct },
              { label: 'Matchup Type', value: matchup.category },
            ]}
            redirectPath={canonicalPath}
            unlockKey={`tools-odds-${matchup.slug}`}
            primaryCtaLabel="Save Spot Free"
            secondaryHref={matchup.calculatorUrl}
            secondaryLabel="Launch In Odds Calculator"
          />

          <section
            aria-label="Preflop Equity Comparison"
            className={`${styles.kit} ${styles.frameActive}`}
            style={{ marginTop: 24, padding: 20 }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <span className={styles.eyebrowTag}>Verified Equity Split</span>
                <h2
                  style={{
                    margin: '6px 0 0',
                    fontSize: 22,
                    fontWeight: 800,
                    color: '#f2f7ff',
                  }}
                >
                  {matchup.handAName} ({matchup.handA}) Vs {matchup.handBName} ({matchup.handB})
                </h2>
              </div>
              <Link
                href={matchup.calculatorUrl}
                style={{
                  display: 'inline-block',
                  padding: '10px 18px',
                  background: 'linear-gradient(180deg, #1d4ed8 0%, #1e3a8a 100%)',
                  border: '1px solid #38bdf8',
                  borderRadius: 0,
                  color: '#f2f7ff',
                  fontWeight: 800,
                  fontSize: 13,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                }}
              >
                Open Live In Odds Calculator
              </Link>
            </div>

            <div
              role="img"
              aria-label={`${matchup.handA} ${eqAPct} Equity Versus ${matchup.handB} ${eqBPct} Equity`}
              style={{
                display: 'flex',
                width: '100%',
                height: 36,
                background: '#071321',
                border: '1px solid #2b4663',
                borderRadius: 0,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${matchup.winA}%`,
                  background: 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#040d18',
                  fontWeight: 800,
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                {matchup.handA} {eqAPct}
              </div>
              {matchup.tie >= 0.5 && (
                <div
                  style={{
                    width: `${matchup.tie}%`,
                    background: '#475569',
                    minWidth: 4,
                  }}
                  title={`Split Pot ${tiePct}`}
                />
              )}
              <div
                style={{
                  flex: 1,
                  background: 'linear-gradient(90deg, #059669 0%, #10b981 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#040d18',
                  fontWeight: 800,
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                {matchup.handB} {eqBPct}
              </div>
            </div>

            <div
              style={{
                overflowX: 'auto',
                maxWidth: '100%',
                marginTop: 18,
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  background: '#071321',
                  border: '1px solid #2b4663',
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr style={{ background: '#0d1f33', color: '#86daff', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #2b4663' }}>Hand</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #2b4663' }}>Outright Win</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #2b4663' }}>Split Pot</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #2b4663' }}>Outright Loss</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #2b4663' }}>Total Equity</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #1e3a5f', fontWeight: 700, color: '#f2f7ff' }}>
                      {matchup.handAName} ({matchup.handA})
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #1e3a5f', color: '#38bdf8', fontWeight: 700 }}>
                      {winAPct}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #1e3a5f', color: '#bdd0e2' }}>
                      {tiePct}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #1e3a5f', color: '#bdd0e2' }}>
                      {winBPct}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #1e3a5f', color: '#f2f7ff', fontWeight: 800 }}>
                      {eqAPct}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f2f7ff' }}>
                      {matchup.handBName} ({matchup.handB})
                    </td>
                    <td style={{ padding: '10px 12px', color: '#34d399', fontWeight: 700 }}>
                      {winBPct}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#bdd0e2' }}>
                      {tiePct}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#bdd0e2' }}>
                      {winAPct}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#f2f7ff', fontWeight: 800 }}>
                      {eqBPct}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
              gap: 18,
              marginTop: 24,
            }}
          >
            <section
              aria-label="Flop Hit Notes"
              className={`${styles.kit} ${styles.frame}`}
              style={{ padding: 20 }}
            >
              <span className={styles.eyebrowTag}>Board Texture Math</span>
              <h2 style={{ margin: '6px 0 12px', fontSize: 19, fontWeight: 800, color: '#f2f7ff' }}>
                Flop Hit Notes And Equity Shifts
              </h2>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10, color: '#bdd0e2', fontSize: 14, lineHeight: 1.6 }}>
                {matchup.flopHitNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>

            <section
              aria-label="Strategic Takeaways"
              className={`${styles.kit} ${styles.frame}`}
              style={{ padding: 20 }}
            >
              <span className={styles.eyebrowTag}>GTO Spot Guidance</span>
              <h2 style={{ margin: '6px 0 12px', fontSize: 19, fontWeight: 800, color: '#f2f7ff' }}>
                Strategic Takeaways
              </h2>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10, color: '#bdd0e2', fontSize: 14, lineHeight: 1.6 }}>
                {matchup.strategicTakeaways.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </section>
          </div>

          <div style={{ marginTop: 24 }}>
            <SmarterCalculatorSaveBar
              toolSlug={`odds-${matchup.slug}`}
              toolName={`${matchup.handA} Vs ${matchup.handB} Odds`}
              eyebrow="Free Equity Cloud Sync"
              title={`Save ${matchup.handA} Vs ${matchup.handB} To Your Free Cloud Account`}
              description="Sync Custom Preflop Matchups, Multiway Board Simulations And 107 Interactive GTO Training Drills Free."
              ctaLabel="Save Matchup Free"
              summaryText={`${matchup.handA} (${eqAPct}) Vs ${matchup.handB} (${eqBPct}) In ${matchup.gameLabel}`}
              redirectPath={canonicalPath}
              unlockKey={`tools-odds-${matchup.slug}`}
            />
          </div>

          <SmarterHandPasteTeaser
            context={`odds-${matchup.slug}`}
            redirectPath={canonicalPath}
          />

          <section
            data-testid="internal-link-mesh"
            aria-label="Preflop Ranges, GTO Leak Finder, And Related Matchups"
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
              Connected GTO Tools & Matchups
            </div>
            <h2
              style={{
                margin: '0 0 14px',
                fontSize: 19,
                fontWeight: 800,
                color: '#f2f7ff',
              }}
            >
              Drill Preflop Ranges & Sibling Equity Matchups
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: 12,
              }}
            >
              {resolvedLinkMesh.links.map((item) => (
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
                    borderLeft: item.kind === 'tool' ? '3px solid #2563eb' : '3px solid #38bdf8',
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

          <div style={{ marginTop: 24 }}>
            <SmarterAccountUnlockGate
              variant="calculator-pro"
              context={`tools-odds-${matchup.slug}`}
              redirectPath={canonicalPath}
            />
          </div>

          <FaqSection
            faqs={faqs}
            title={`${matchup.handA} Vs ${matchup.handB} Frequently Asked Questions`}
          />

          {related.length > 0 && (
            <section
              aria-label="Related Matchup Calculators"
              className={`${styles.kit} ${styles.frame}`}
              style={{ marginTop: 28, padding: 20 }}
            >
              <span className={styles.eyebrowTag}>Explore More Matchups</span>
              <h2 style={{ margin: '6px 0 14px', fontSize: 20, fontWeight: 800, color: '#f2f7ff' }}>
                Related Hand-Vs-Hand Equity Calculators
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: 12,
                }}
              >
                {related.map((item) => (
                  <Link
                    key={item.slug}
                    href={item.path}
                    style={{
                      display: 'block',
                      padding: '14px 16px',
                      background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
                      border: '1px solid #2b4663',
                      borderRadius: 0,
                      textDecoration: 'none',
                      color: '#f2f7ff',
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#86daff' }}>
                      {item.handA} Vs {item.handB}
                    </div>
                    <div style={{ fontSize: 13, color: '#bdd0e2', marginTop: 4 }}>
                      {item.equityA.toFixed(2)}% Vs {item.equityB.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textTransform: 'uppercase' }}>
                      {item.gameLabel}
                    </div>
                  </Link>
                ))}
              </div>
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: '1px solid #1e3a5f',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 14,
                  fontSize: 13,
                }}
              >
                <Link href="/tools/poker-odds-calculator" style={{ color: '#38bdf8', fontWeight: 700, textDecoration: 'none' }}>
                  Full Multiway Poker Odds Calculator
                </Link>
                <Link href="/compare/plo4-vs-plo5" style={{ color: '#38bdf8', fontWeight: 700, textDecoration: 'none' }}>
                  PLO4 Vs PLO5 Equity And Variance Comparison
                </Link>
                <Link href="/tools" style={{ color: '#38bdf8', fontWeight: 700, textDecoration: 'none' }}>
                  All Free Poker Tools And Calculators
                </Link>
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
