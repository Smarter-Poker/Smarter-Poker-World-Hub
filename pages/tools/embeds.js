import React, { useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import SEOHead from '../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { Code, Copy, Check, ExternalLink, ShieldCheck, Zap } from 'lucide-react';

const WIDGETS = [
  {
    id: 'odds-calculator',
    title: 'Multiway Poker Odds Calculator',
    description: 'Real-time Texas Hold\'em equity calculator supporting 2 to 10 players, exact card pickers, dead cards, and instant simulation.',
    embedUrl: 'https://smarter.poker/hub/poker-tools?embed=true',
    landerUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Free Poker Odds Calculator',
  },
  {
    id: 'icm-calculator',
    title: 'Tournament ICM Calculator',
    description: 'Malmuth-Harville mathematical model converting tournament chip stacks to real dollar equity values for final table and bubble decisions.',
    embedUrl: 'https://smarter.poker/hub/training/icm-calculator',
    landerUrl: 'https://smarter.poker/tools/icm-calculator',
    height: 720,
    width: '100%',
    creditAnchor: 'Smarter.Poker Tournament ICM Calculator',
  },
  {
    id: 'preflop-ranges',
    title: 'GTO Preflop Range Matrix Hub',
    description: 'Interactive 13x13 preflop starting hand chart covering all 169 combinations and 1,326 combos across 6-max positions.',
    embedUrl: 'https://smarter.poker/tools/preflop-ranges',
    landerUrl: 'https://smarter.poker/tools/preflop-ranges',
    height: 820,
    width: '100%',
    creditAnchor: 'Smarter.Poker GTO Preflop Ranges',
  },
  {
    id: 'pot-odds-calculator',
    title: 'Pot Odds, Implied Odds & MDF Calculator',
    description: 'Instant pot odds, break-even equity percentage, minimum defense frequency (MDF), and outs-to-equity calculator for cash games and tournaments.',
    embedUrl: 'https://smarter.poker/tools/pot-odds-calculator',
    landerUrl: 'https://smarter.poker/tools/pot-odds-calculator',
    height: 740,
    width: '100%',
    creditAnchor: 'Smarter.Poker Pot Odds & MDF Calculator',
  },
  {
    id: 'push-fold-calculator',
    title: 'Short-Stack Push/Fold Nash Equilibrium Chart',
    description: 'Interactive 3BB to 20BB short-stack tournament push/fold Nash equilibrium solver chart across every table position with ante adjustments.',
    embedUrl: 'https://smarter.poker/tools/push-fold-calculator',
    landerUrl: 'https://smarter.poker/tools/push-fold-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Push/Fold Nash Chart',
  },
  {
    id: 'bankroll-calculator',
    title: 'Poker Bankroll & Risk Of Ruin Calculator',
    description: 'Variance simulator and Risk of Ruin (RoR) calculator computing required buy-ins from BB/100 winrate and standard deviation.',
    embedUrl: 'https://smarter.poker/tools/bankroll-calculator',
    landerUrl: 'https://smarter.poker/tools/bankroll-calculator',
    height: 720,
    width: '100%',
    creditAnchor: 'Smarter.Poker Bankroll & Risk Of Ruin Calculator',
  },
  {
    id: 'bounty-calculator',
    title: 'PKO & Mystery Bounty Chip Equity Calculator',
    description: 'Progressive Knockout (PKO) and Mystery Bounty chip conversion and calling-equity adjustment calculator using bounty power factors.',
    embedUrl: 'https://smarter.poker/tools/bounty-calculator',
    landerUrl: 'https://smarter.poker/tools/bounty-calculator',
    height: 740,
    width: '100%',
    creditAnchor: 'Smarter.Poker PKO & Mystery Bounty Calculator',
  },
  {
    id: 'poker-winrate-calculator',
    title: 'Poker Winrate (BB/100 To $/Hr) & Volume Calculator',
    description: 'Converts online BB/100 and live hourly winrates into projected monthly and annual earnings with confidence intervals.',
    embedUrl: 'https://smarter.poker/tools/poker-winrate-calculator',
    landerUrl: 'https://smarter.poker/tools/poker-winrate-calculator',
    height: 720,
    width: '100%',
    creditAnchor: 'Smarter.Poker Winrate & Hourly Earnings Calculator',
  },
  {
    id: 'side-pot-calculator',
    title: 'Multi-Way All-In Main & Side Pot Calculator',
    description: 'Slices multi-way all-in confrontations for up to 9 players into exact main pot and sequential side pots with dead money and uncalled bet returns.',
    embedUrl: 'https://smarter.poker/tools/side-pot-calculator',
    landerUrl: 'https://smarter.poker/tools/side-pot-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker Multi-Way Side Pot Calculator',
  },
  {
    id: 'blind-structure-calculator',
    title: 'Tournament Blind Structure & Chip Distribution Generator',
    description: 'Generates TDA-compliant home game and club tournament blind schedules, big blind ante progressions, color-up levels, and starting chip counts.',
    embedUrl: 'https://smarter.poker/tools/blind-structure-calculator',
    landerUrl: 'https://smarter.poker/tools/blind-structure-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Tournament Blind Structure Generator',
  },
  {
    id: 'spr-calculator',
    title: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator',
    description: 'Calculates effective Stack-To-Pot Ratio (SPR), commitment zones, and exact 1-street, 2-street, and 3-street geometric bet sizing percentages.',
    embedUrl: 'https://smarter.poker/tools/spr-calculator',
    landerUrl: 'https://smarter.poker/tools/spr-calculator',
    height: 740,
    width: '100%',
    creditAnchor: 'Smarter.Poker SPR & Geometric Sizing Calculator',
  },
  {
    id: 'plo-bet-calculator',
    title: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    description: 'Calculates exact Pot-Limit Omaha maximum bet and raise sizes using the 3x plus trail formula and solves double-board bomb pot split equity.',
    embedUrl: 'https://smarter.poker/tools/plo-bet-calculator',
    landerUrl: 'https://smarter.poker/tools/plo-bet-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker PLO Max Bet & Bomb Pot Calculator',
  },
  {
    id: 'payout-calculator',
    title: 'Tournament Payout & Prize Pool Distribution Calculator',
    description: 'Generates TDA-compliant tournament prize pool payouts across Top 10%, Top 15%, Top 20%, and Winner-Take-All structures with ICM bubble factors.',
    embedUrl: 'https://smarter.poker/tools/payout-calculator',
    landerUrl: 'https://smarter.poker/tools/payout-calculator',
    height: 780,
    width: '100%',
    creditAnchor: 'Smarter.Poker Tournament Payout Calculator',
  },
  {
    id: 'rake-calculator',
    title: 'Live Cash Game Rake & Time-Charge Calculator',
    description: 'Compares casino percentage pot drop rake plus jackpot drops against timed seat collection in $/Hr, BB/100 drag, and 1,000-hour annual cost.',
    embedUrl: 'https://smarter.poker/tools/rake-calculator',
    landerUrl: 'https://smarter.poker/tools/rake-calculator',
    height: 760,
    width: '100%',
    creditAnchor: 'Smarter.Poker Live Cash Rake Calculator',
  },
  {
    id: '3bet-calculator',
    title: 'GTO Preflop 3-Bet, Squeeze, 4-Bet & MDF Calculator',
    description: 'Calculates solver-approved In-Position and Out-Of-Position 3-bet, multiway squeeze, and 4-bet sizing in big blinds with villain MDF.',
    embedUrl: 'https://smarter.poker/tools/3bet-calculator',
    landerUrl: 'https://smarter.poker/tools/3bet-calculator',
    height: 740,
    width: '100%',
    creditAnchor: 'Smarter.Poker GTO 3-Bet & 4-Bet Calculator',
  },
];

export const PARTNER_BADGES = [
  {
    id: 'badge-venue',
    title: 'Verified Live Poker Room Badge',
    description: 'For casinos, Texas social poker clubs, and charity rooms listed in the Smarter.Poker directory.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=venue',
    targetUrl: 'https://smarter.poker/hub/poker-near-me/lobby',
    altText: 'Verified Poker Room: Smarter.Poker Directory',
  },
  {
    id: 'badge-commander',
    title: 'Powered By Club Commander Waitlist Badge',
    description: 'For card rooms running live waitlists, tournament clocks, and seat alerts with Club Commander.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=commander',
    targetUrl: 'https://smarter.poker/compare/best-poker-room-management-software',
    altText: 'Live Waitlist & Clocks: Powered By Club Commander',
  },
  {
    id: 'badge-research',
    title: 'Smarter.Poker Empirical Research Citation Badge',
    description: 'For journalists, Substack writers, and poker bloggers citing Smarter.Poker industry benchmark studies.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=research',
    targetUrl: 'https://smarter.poker/research',
    altText: 'Empirical Data Source: Smarter.Poker Research',
  },
  {
    id: 'badge-gto',
    title: 'GTO Math Verified Solver Badge',
    description: 'For strategy articles, hand breakdowns, and training posts referencing Smarter.Poker GTO preflop and ICM ranges.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=gto',
    targetUrl: 'https://smarter.poker/tools/preflop-ranges',
    altText: 'GTO Math Verified: Smarter.Poker Solver',
  },
  {
    id: 'badge-club',
    title: 'Smarter.Poker Club Arena Partner Badge',
    description: 'For private online poker clubs, home game hosts, and league organizers running games on Club Arena.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=club',
    targetUrl: 'https://smarter.poker/compare/best-poker-club-apps',
    altText: 'Private Club Platform: Smarter.Poker Club Arena',
  },
  {
    id: 'badge-daily',
    title: 'Daily GTO Hand Challenge Verified Badge',
    description: 'For training blogs, study Discord servers, and hand recap posts linking to the Smarter.Poker Daily GTO Challenge.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=daily',
    targetUrl: 'https://smarter.poker/hub/training/daily-challenge',
    altText: 'Daily GTO Challenge: Solver Verified On Smarter.Poker',
  },
  {
    id: 'badge-rules',
    title: 'Official Poker Rules & TDA Authority Badge',
    description: 'For tournament directors, card room rulebooks, and floor ruling guides citing Smarter.Poker Official Rules.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=rules',
    targetUrl: 'https://smarter.poker/rules',
    altText: 'Official Poker Rules: TDA & RROP Verified',
  },
];

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');
  if (isMarkdownRequested) {
    const { renderEmbedsMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderEmbedsMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}

export default function WebmasterEmbedPortal() {
  const [copiedId, setCopiedId] = useState(null);

  const getEmbedCode = (widget) => {
    return `<iframe src="${widget.embedUrl}" width="${widget.width}" height="${widget.height}" frameborder="0" style="border:0;border-radius:12px;overflow:hidden;max-width:100%;" title="${widget.title}"></iframe>\n<p style="font-size:12px;text-align:center;color:#94AFCC;margin-top:6px;">Powered By <a href="${widget.landerUrl}" target="_blank" rel="noopener" style="color:#4E9CFF;text-decoration:none;font-weight:600;">${widget.creditAnchor}</a></p>`;
  };

  const handleCopy = (widget) => {
    const code = getEmbedCode(widget);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedId(widget.id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const EMBEDS_FAQS = [
    {
      question: 'How Do I Embed The Smarter.Poker Odds Calculator On My Website?',
      answer:
        'Copy The Responsive HTML Iframe Snippet From This Portal And Paste It Into Your CMS Or HTML Page. It Automatically Adjusts To Mobile And Desktop Viewports With Zero API Keys Required.',
    },
    {
      question: 'Are Smarter.Poker Embeddable Poker Widgets Free For Commercial And Affiliate Sites?',
      answer:
        'Yes. All Smarter.Poker Widgets Are 100% Free To Embed On Poker Blogs, News Portals, Casino Affiliate Sites, And Media Publications.',
    },
    {
      question: 'Can I Customize The Theme Or Default Poker Game Variant For The Widget?',
      answer:
        'Yes. You Can Append URL Query Parameters Such As ?game=holdem, ?game=plo4, Or ?embed=true To Preselect Specific Variants And Lock Widget Dimensions.',
    },
    {
      question: 'Do These Widgets Require Any JavaScript Dependencies Or External Tracking Scripts?',
      answer:
        'No. Smarter.Poker Widgets Run Entirely Within Sandboxed Responsive Iframes, Requiring Zero External Scripts Or Client Libraries On Your Host Domain.',
    },
  ];

  const EMBEDS_SCHEMA = hubProductSchema({
    path: '/tools/embeds',
    name: 'Smarter.Poker Webmaster Widgets & Embed Distribution Center',
    description: 'Free embeddable poker widgets, odds calculators, ICM solvers, and GTO charts for poker webmasters, bloggers, and media sites.',
    applicationCategory: 'WebApplication',
    applicationSubCategory: 'DeveloperApplication',
    trail: [
      ['Hub', '/hub'],
      ['Poker Tools', '/tools/poker-odds-calculator'],
      ['Embed Widgets', '/tools/embeds'],
    ],
    faqs: EMBEDS_FAQS,
    howTo: {
      name: 'How To Embed Smarter.Poker Calculators On Your Website',
      description: 'Step-by-step instructions for copying and embedding responsive poker widgets into WordPress, Ghost, Substack, or custom HTML sites.',
      steps: [
        {
          name: 'Select A Poker Widget',
          text: 'Choose between the Multiway Poker Odds Calculator, Tournament ICM Calculator, or GTO Preflop Range Matrix Hub.',
        },
        {
          name: 'Copy The Responsive Iframe Snippet',
          text: 'Click the Copy Code button to copy the clean, sandboxed iframe snippet with optimal responsive dimensions.',
        },
        {
          name: 'Paste Into Your Website CMS Or HTML Template',
          text: 'Paste the iframe snippet into your WordPress Custom HTML block, Webflow embed element, or static HTML template.',
        },
        {
          name: 'Test Live Responsiveness Across Desktop And Mobile',
          text: 'Preview your published page on mobile and desktop browsers to verify seamless touch interaction and automatic height scaling.',
        },
      ],
    },
  });

  return (
    <>
      <SEOHead
        title="Free Poker Widgets & Embeds"
        description="Free embeddable poker widgets for webmasters and bloggers. Embed real-time odds calculators, tournament ICM solvers, and GTO preflop charts with simple HTML iframe snippets."
        canonical="https://smarter.poker/tools/embeds"
        jsonLd={EMBEDS_SCHEMA}
        ogImage="/api/og/tool-card?tool=embeds&title=Free+Poker+Widgets+And+Embeds&subtitle=Responsive+Iframe+Widgets+For+Odds+ICM+And+Preflop+Ranges&statLabel=WIDGETS&statValue=100%+FREE"
        markdownUrl="https://smarter.poker/tools/embeds.md"
      />

      <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#fff', paddingBottom: '60px' }}>
        <UniversalHeader pageDepth={1} />

        <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px' }}>
          <header style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', background: 'rgba(78, 156, 255, 0.1)', border: '1px solid rgba(78, 156, 255, 0.25)', color: '#60a5fa', fontSize: '0.85rem', fontWeight: 600, marginBottom: '16px' }}>
              <Code size={14} /> Webmaster Distribution Portal
            </div>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 800, margin: '0 0 16px 0', letterSpacing: '-0.02em' }}>
              Free Embeddable Poker Tools For Webmasters
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255, 255, 255, 0.75)', maxWidth: '720px', margin: '0 auto', lineHeight: 1.6 }}>
              Add Interactive, Responsive Poker Calculators And GTO Charts To Your Website, Poker Forum, Or Strategy Blog. All Widgets Are Completely Free To Use With Canonical Attribution.
            </p>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '24px' }}>
              <Zap size={24} style={{ color: '#fbbf24', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0' }}>Zero Configuration Required</h3>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>
                Copy The HTML Snippet Directly Into Your WordPress Post, Ghost Blog, Or Custom CMS. Works Seamlessly Without External Script Dependencies.
              </p>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '24px' }}>
              <ShieldCheck size={24} style={{ color: '#34d399', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0' }}>Mobile-Optimized & Responsive</h3>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>
                Each Calculator Dynamically Adapts To Desktop, Tablet, And Smartphone Screens With Lightning-Fast Sub-50ms Touch Response Times.
              </p>
            </div>
          </div>

          <section aria-labelledby="available-widgets-heading">
            <h2 id="available-widgets-heading" style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '24px' }}>
              Available Embeddable Widgets
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {WIDGETS.map((widget) => {
                const code = getEmbedCode(widget);
                const isCopied = copiedId === widget.id;

                return (
                  <article
                    key={widget.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '28px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                      <h3 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>{widget.title}</h3>
                      <Link
                        href={widget.landerUrl}
                        target="_blank"
                        rel="noopener"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', color: '#60a5fa', textDecoration: 'none' }}
                      >
                        Preview Live Tool <ExternalLink size={14} />
                      </Link>
                    </div>

                    <p style={{ fontSize: '0.95rem', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                      {widget.description}
                    </p>

                    <div style={{ position: 'relative' }}>
                      <textarea
                        readOnly
                        value={code}
                        aria-label={`HTML Embed Code for ${widget.title}`}
                        style={{
                          width: '100%',
                          height: '90px',
                          background: '#06060c',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '8px',
                          padding: '12px',
                          color: '#a5b4fc',
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(widget)}
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: isCopied ? '#059669' : '#2563eb',
                          color: '#fff',
                          border: 0,
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isCopied ? (
                          <>
                            <Check size={14} /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={14} /> Copy Embed Code
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Verified Partner & Venue SVG Backlink Badges */}
          <section aria-labelledby="partner-badges-heading" style={{ marginTop: '48px' }}>
            <h2 id="partner-badges-heading" style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '12px' }}>
              Verified Partner, Venue & Media Attribution Badges
            </h2>
            <p style={{ fontSize: '0.96rem', color: 'rgba(255, 255, 255, 0.72)', lineHeight: 1.6, marginBottom: '24px' }}>
              Card Rooms, Club Operators, Strategy Bloggers, And Journalists Can Embed These Lightweight Dynamic SVG Badges On Their Websites, Footers, Or GitHub Readmes With Direct Canonical Attribution.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {PARTNER_BADGES.map((badge) => {
                const badgeSnippet = `<a href="${badge.targetUrl}" target="_blank" rel="noopener" title="${badge.altText}"><img src="${badge.badgeUrl}" alt="${badge.altText}" height="28" /></a>`;
                const isBadgeCopied = copiedId === badge.id;
                return (
                  <article
                    key={badge.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(56, 189, 248, 0.18)',
                      borderRadius: '14px',
                      padding: '22px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '10px' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{badge.title}</h3>
                      <img src={badge.badgeUrl} alt={badge.altText} height="28" style={{ display: 'block' }} />
                    </div>
                    <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.72)', margin: '0 0 12px 0' }}>
                      {badge.description}
                    </p>
                    <div style={{ position: 'relative' }}>
                      <textarea
                        readOnly
                        value={badgeSnippet}
                        aria-label={`HTML Badge Embed Code for ${badge.title}`}
                        style={{
                          width: '100%',
                          height: '64px',
                          background: '#06060c',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '8px',
                          padding: '10px',
                          color: '#7dd3fc',
                          fontFamily: 'monospace',
                          fontSize: '0.82rem',
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                            navigator.clipboard.writeText(badgeSnippet);
                            setCopiedId(badge.id);
                            setTimeout(() => setCopiedId(null), 2500);
                          }
                        }}
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: isBadgeCopied ? '#059669' : '#0284c7',
                          color: '#fff',
                          border: 0,
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isBadgeCopied ? (
                          <>
                            <Check size={14} /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={14} /> Copy Badge HTML
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Frequently Asked Questions */}
          <section
            aria-label="Frequently Asked Questions"
            style={{
              marginTop: '40px',
              padding: '24px',
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '12px',
            }}
          >
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#f0f6fc',
                margin: '0 0 16px 0',
              }}
            >
              Frequently Asked Questions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {EMBEDS_FAQS.map((faq, idx) => (
                <details
                  key={idx}
                  style={{
                    background: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#f0f6fc',
                  }}
                >
                  <summary
                    style={{
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      color: '#58a6ff',
                      outline: 'none',
                    }}
                  >
                    {faq.question}
                  </summary>
                  <p
                    style={{
                      margin: '10px 0 0',
                      fontSize: '0.88rem',
                      lineHeight: 1.6,
                      color: '#8b949e',
                    }}
                  >
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>

          {/* Related Free Poker Ecosystem Hubs */}
          <section
            aria-label="Related Free Poker Tools And Freerolls"
            style={{
              marginTop: '40px',
              padding: '24px',
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '12px',
            }}
          >
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#f0f6fc',
                margin: '0 0 16px 0',
              }}
            >
              Related Free Poker Ecosystem Hubs
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <Link
                href="/compare"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(88, 166, 255, 0.12)',
                  border: '1px solid rgba(88, 166, 255, 0.3)',
                  borderRadius: '6px',
                  color: '#58a6ff',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Compare Free Poker Tools Vs. Paid Software
              </Link>
              <Link
                href="/freerolls"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(0, 230, 118, 0.12)',
                  border: '1px solid rgba(0, 230, 118, 0.3)',
                  borderRadius: '6px',
                  color: '#00e676',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Play Daily $2,000 Guaranteed Freerolls
              </Link>
              <Link
                href="/tools/poker-odds-calculator"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Poker Odds Calculator
              </Link>
              <Link
                href="/tools/icm-calculator"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Tournament ICM Calculator
              </Link>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
