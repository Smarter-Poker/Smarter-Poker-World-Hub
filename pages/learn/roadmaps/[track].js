/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INDIVIDUAL PLAYER PROGRESSION ROADMAP PAGE (/learn/roadmaps/[track])
 * ═══════════════════════════════════════════════════════════════════════════════
 * Static detail page for each of the 5 player progression roadmaps with
 * phase-by-phase action checklists, integrated tool links, and HowTo + Article
 * + FAQPage + BreadcrumbList JSON-LD.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import {
  POKER_ROADMAPS,
  ROADMAPS_AS_OF,
  ROADMAPS_BASE_PATH,
  ROADMAPS_URL,
  getRoadmapBySlug,
  roadmapPath,
} from '../../../src/content/learn/roadmaps';

export async function getStaticPaths() {
  return {
    paths: POKER_ROADMAPS.map((r) => ({ params: { track: r.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const roadmap = getRoadmapBySlug(params?.track);
  if (!roadmap) return { notFound: true };

  const otherRoadmaps = POKER_ROADMAPS.filter((r) => r.slug !== roadmap.slug).map((r) => ({
    slug: r.slug,
    code: r.code,
    name: r.name,
    duration: r.duration,
    graduationGoal: r.graduationGoal,
  }));

  return {
    props: {
      roadmap,
      otherRoadmaps,
    },
  };
}

export default function PokerRoadmapDetailPage({ roadmap, otherRoadmaps = [] }) {
  const canonicalPath = roadmapPath(roadmap.slug);
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: roadmap.h1,
      name: roadmap.title,
      description: roadmap.summary,
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: ROADMAPS_AS_OF,
      dateModified: ROADMAPS_AS_OF,
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
    },
    {
      '@type': 'HowTo',
      '@id': `${canonicalUrl}#howto`,
      name: roadmap.name,
      description: roadmap.summary,
      step: (roadmap.milestones || []).map((m, idx) => ({
        '@type': 'HowToStep',
        position: idx + 1,
        name: m.phase,
        text: `${m.objective} ${m.actionItems.join(' ')}`,
      })),
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: (roadmap.faqs || []).map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: 'https://smarter.poker/' },
        { '@type': 'ListItem', position: 2, name: 'Learn Poker', item: 'https://smarter.poker/learn' },
        { '@type': 'ListItem', position: 3, name: 'Progression Roadmaps', item: ROADMAPS_URL },
        { '@type': 'ListItem', position: 4, name: roadmap.name, item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title={roadmap.title}
        description={roadmap.summary}
        canonical={canonicalPath}
        jsonLd={jsonLd}
      />

      <UniversalHeader pageDepth={3} />

      <main style={styles.container}>
        <nav aria-label="Breadcrumb" style={styles.breadcrumbs}>
          <Link href="/" style={styles.crumbLink}>
            Smarter.Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href="/learn" style={styles.crumbLink}>
            Learn Poker
          </Link>
          <span style={styles.crumbSep}>/</span>
          <Link href={ROADMAPS_BASE_PATH} style={styles.crumbLink}>
            Progression Roadmaps
          </Link>
          <span style={styles.crumbSep}>/</span>
          <span style={styles.crumbCurrent}>{roadmap.name}</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>{roadmap.code}</span>
            <span style={styles.emeraldBadge}>TIMELINE: {roadmap.duration}</span>
          </div>

          <h1 style={styles.h1}>{roadmap.h1}</h1>

          <p style={styles.lead}>
            <strong>Curriculum Overview:</strong> {roadmap.summary}
          </p>

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Starting Point</div>
              <div style={styles.metricValueCyan}>{roadmap.startingPoint}</div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Graduation Target</div>
              <div style={styles.metricValueEmerald}>{roadmap.graduationGoal}</div>
            </div>
          </div>

          <div style={styles.quickCrossLinks}>
            <Link href={ROADMAPS_BASE_PATH} style={styles.crossBtnCyan}>
              All 5 Progression Roadmaps
            </Link>
            <Link href="/learn/stakes" style={styles.crossBtnEmerald}>
              Stake Level &amp; Move-Up Hub
            </Link>
            <Link href="/learn/positions" style={styles.crossBtnOutline}>
              9-Seat Position Encyclopedia
            </Link>
            <Link href="/tools" style={styles.crossBtnOutline}>
              24 Free Poker Calculators
            </Link>
          </div>
        </header>

        {/* Phase-By-Phase Milestones */}
        <section aria-label="Phase By Phase Curriculum Milestones" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Step-By-Step Milestones &amp; Action Plan ({roadmap.duration})
          </h2>

          <div style={styles.milestoneList}>
            {(roadmap.milestones || []).map((m, idx) => (
              <div key={m.phase} style={styles.milestoneCard}>
                <div style={styles.milestoneTop}>
                  <span style={styles.phaseNumber}>MILESTONE 0{idx + 1}</span>
                  <h3 style={styles.h3}>{m.phase}</h3>
                </div>

                <p style={styles.objectiveText}>
                  <strong>Core Objective:</strong> {m.objective}
                </p>

                <ul style={styles.actionList}>
                  {(m.actionItems || []).map((item) => (
                    <li key={item} style={styles.actionItem}>
                      {item}
                    </li>
                  ))}
                </ul>

                <div style={styles.linkRow}>
                  {(m.recommendedLinks || []).map((lnk) => (
                    <Link key={lnk.href} href={lnk.href} style={styles.resourceBtn}>
                      {lnk.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Other Roadmaps */}
        <section aria-label="Explore Other Progression Roadmaps" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Explore Other Smarter.Poker Player Progression Tracks</h2>
          <div style={styles.peerGrid}>
            {otherRoadmaps.map((peer) => (
              <Link key={peer.slug} href={roadmapPath(peer.slug)} style={styles.peerCard}>
                <span style={styles.peerCode}>
                  {peer.code} ({peer.duration})
                </span>
                <span style={styles.peerName}>{peer.name}</span>
                <span style={styles.peerGoal}>{peer.graduationGoal}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Frequently Asked Questions: {roadmap.name}
          </h2>
          <div style={styles.faqList}>
            {(roadmap.faqs || []).map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title={roadmap.title}
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel={roadmap.code}
          badgeValue={roadmap.duration}
          summary={roadmap.summary}
          publishedYear="2026"
          slug={`roadmap-${roadmap.slug}`}
        />

        <AiPromptLauncher
          title={roadmap.title}
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl={`/learn/roadmaps/${roadmap.slug}.md`}
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0a0f18',
    color: '#e2e8f0',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
  container: {
    maxWidth: '1080px',
    margin: '0 auto',
    padding: '28px 20px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '20px',
  },
  crumbLink: {
    color: '#00d4ff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  crumbSep: {
    color: '#475569',
  },
  crumbCurrent: {
    color: '#e2e8f0',
    fontWeight: 600,
  },
  heroPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '28px',
    marginBottom: '24px',
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '14px',
  },
  cyanBadge: {
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    border: '1px solid #00d4ff',
    color: '#00d4ff',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '4px',
    letterSpacing: '0.06em',
  },
  emeraldBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid #10b981',
    color: '#10b981',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '4px',
    letterSpacing: '0.06em',
  },
  h1: {
    fontSize: '30px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 14px',
    lineHeight: 1.2,
  },
  lead: {
    fontSize: '15.5px',
    lineHeight: 1.65,
    color: '#cbd5e1',
    margin: '0 0 22px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '14px',
    marginBottom: '22px',
  },
  metricCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  metricLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  metricValueCyan: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#00d4ff',
    lineHeight: 1.45,
  },
  metricValueEmerald: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#10b981',
    lineHeight: 1.45,
  },
  quickCrossLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  crossBtnCyan: {
    backgroundColor: '#00d4ff',
    color: '#0a0f18',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    backgroundColor: '#10b981',
    color: '#0a0f18',
    fontWeight: 700,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  crossBtnOutline: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  sectionPlate: {
    backgroundColor: '#111a2a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '24px',
  },
  h2: {
    fontSize: '21px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 14px',
  },
  milestoneList: {
    display: 'grid',
    gap: '16px',
  },
  milestoneCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '20px',
  },
  milestoneTop: {
    marginBottom: '10px',
  },
  phaseNumber: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 800,
    color: '#00d4ff',
    marginBottom: '4px',
    letterSpacing: '0.06em',
  },
  h3: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#f8fafc',
    margin: 0,
  },
  objectiveText: {
    fontSize: '14px',
    color: '#10b981',
    margin: '0 0 12px',
    lineHeight: 1.55,
  },
  actionList: {
    margin: '0 0 16px',
    paddingLeft: '20px',
    display: 'grid',
    gap: '8px',
  },
  actionItem: {
    fontSize: '14px',
    color: '#cbd5e1',
    lineHeight: 1.6,
  },
  linkRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  resourceBtn: {
    backgroundColor: '#111a2a',
    border: '1px solid #00d4ff',
    color: '#00d4ff',
    fontSize: '12.5px',
    fontWeight: 700,
    padding: '7px 14px',
    borderRadius: '6px',
    textDecoration: 'none',
  },
  peerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '12px',
  },
  peerCard: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '14px',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  peerCode: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#00d4ff',
  },
  peerName: {
    fontSize: '14.5px',
    fontWeight: 700,
    color: '#f8fafc',
  },
  peerGoal: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#10b981',
  },
  faqList: {
    display: 'grid',
    gap: '14px',
  },
  faqItem: {
    backgroundColor: '#0a0f18',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '16px',
  },
  faqQ: {
    fontSize: '15.5px',
    fontWeight: 700,
    color: '#00d4ff',
    margin: '0 0 8px',
  },
  faqA: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#cbd5e1',
    margin: 0,
  },
};
