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
    id: 'badge-award-top50',
    title: 'US Live Poker Room Benchmark Index Badge',
    description: 'For poker rooms and casino properties included in the US Live Poker Room Rake & Jackpot Benchmark Report (324+ venues).',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-top50',
    targetUrl: 'https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark',
    altText: 'US Live Poker Room Index: Smarter.Poker Directory',
  },
  {
    id: 'badge-award-texas',
    title: 'Texas Social Card Room Benchmark Badge',
    description: 'For Texas social poker clubs profiled in the Cardroom Waitlist Turnover & Time-Collection Benchmark.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-texas',
    targetUrl: 'https://smarter.poker/research/cardroom-waitlist-turnover-and-table-utilization-benchmark',
    altText: 'Texas Card Room Benchmark: Smarter.Poker Directory',
  },
  {
    id: 'badge-award-cpa',
    title: 'Form W-2G & Schedule C Tax Ledger Badge (For CPAs)',
    description: 'For gaming CPA firms, tax attorneys, and financial advisors linking to the free Form W-2G poker session tax ledger.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-cpa',
    targetUrl: 'https://smarter.poker/features/bankroll-tax-tracker',
    altText: 'Form W-2G Tax Ledger: Smarter.Poker Bankroll Tool',
  },
  {
    id: 'badge-award-dealer',
    title: 'Casino Dealer Toke & Shift Tracker Resource Badge',
    description: 'For casino dealer schools, hospitality programs, and dealer communities linking to the free Toke Tracker and study tools.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-dealer',
    targetUrl: 'https://smarter.poker/features/poker-dealer-toke-tracker',
    altText: 'Dealer Toke & Shift Tool: Smarter.Poker Toke Tracker',
  },
  {
    id: 'badge-award-edu',
    title: 'University Game Theory & Quantitative Dataset Badge',
    description: 'For university game theory syllabi, quantitative finance clubs, and open-source poker research repositories.',
    badgeUrl: 'https://smarter.poker/api/seo/badge?type=award-edu',
    targetUrl: 'https://smarter.poker/api/datasets/catalog',
    altText: 'Poker Math & ICM Dataset: Smarter.Poker Research',
  },
];

export const STREAM_CHAT_COMMANDS = [
  {
    id: 'cmd-odds',
    command: '!odds',
    title: 'Preflop Matchup & Draw Equity Command (!odds AA vs KK)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=odds&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/poker-odds-calculator',
  },
  {
    id: 'cmd-potodds',
    command: '!potodds',
    title: 'Pot Odds & Minimum Defense Frequency Command (!potodds 100 50)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=potodds&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/pot-odds-calculator',
  },
  {
    id: 'cmd-pushfold',
    command: '!pushfold',
    title: '10BB Short-Stack Nash Push/Fold Command (!pushfold)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=pushfold&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/push-fold-calculator',
  },
  {
    id: 'cmd-icm',
    command: '!icm',
    title: 'Tournament Final Table ICM Bubble Factor Command (!icm)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=icm&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/icm-calculator',
  },
  {
    id: 'cmd-bounty',
    command: '!bounty',
    title: 'PKO & Mystery Bounty Chip Equivalent Command (!bounty)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=bounty&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/bounty-calculator',
  },
  {
    id: 'cmd-winrate',
    command: '!winrate',
    title: 'Poker Bankroll Risk Of Ruin & Variance Command (!winrate)',
    nightbot: '$(urlfetch https://smarter.poker/api/stream/cmd?cmd=winrate&q=$(querystring))',
    toolUrl: 'https://smarter.poker/tools/poker-winrate-calculator',
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

          {/* Twitch & YouTube Streamer Nightbot / StreamElements Chatbot Commands */}
          <section aria-labelledby="streamer-bot-heading" style={{ marginTop: '48px' }}>
            <h2 id="streamer-bot-heading" style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '12px' }}>
              Twitch & YouTube Streamer Chatbot Commands
            </h2>
            <p style={{ fontSize: '0.96rem', color: 'rgba(255, 255, 255, 0.72)', lineHeight: 1.6, marginBottom: '24px' }}>
              Poker Streamers And Vloggers Can Add Real-Time Poker Math Commands To Nightbot, StreamElements, Or Fossabot In 10 Seconds. Every Response Includes Direct Canonical Attribution To Smarter.Poker Solvers.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '16px' }}>
              {STREAM_CHAT_COMMANDS.map((item) => {
                const isCmdCopied = copiedId === item.id;
                return (
                  <article
                    key={item.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(168, 85, 247, 0.25)',
                      borderRadius: '12px',
                      padding: '18px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#c084fc', fontFamily: 'monospace' }}>
                        {item.command}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                            navigator.clipboard.writeText(item.nightbot);
                            setCopiedId(item.id);
                            setTimeout(() => setCopiedId(null), 2500);
                          }
                        }}
                        style={{
                          background: isCmdCopied ? '#059669' : '#7e22ce',
                          color: '#fff',
                          border: 0,
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isCmdCopied ? 'Copied!' : 'Copy Nightbot Command'}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.88rem', color: 'rgba(255, 255, 255, 0.8)', margin: '0 0 10px 0' }}>
                      {item.title}
                    </p>
                    <pre
                      style={{
                        margin: 0,
                        padding: '8px 10px',
                        background: '#06060c',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        color: '#d8b4fe',
                        fontSize: '0.76rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      {item.nightbot}
                    </pre>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Open Datasets, JSON Feed & Syndication APIs */}
          <section
            aria-labelledby="syndication-apis-heading"
            style={{
              marginTop: '48px',
              padding: '24px',
              background: 'rgba(16, 185, 129, 0.04)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '14px',
            }}
          >
            <h2 id="syndication-apis-heading" style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 10px 0', color: '#34d399' }}>
              Open Datasets, JSON Feed 1.1 & Multilingual Syndication APIs
            </h2>
            <p style={{ fontSize: '0.92rem', color: 'rgba(255, 255, 255, 0.78)', lineHeight: 1.55, margin: '0 0 16px 0' }}>
              Developers, Academic Researchers, And International Poker Portals Can Ingest Smarter.Poker Citations, Structured Datasets, Zenodo/DataCite Metadata, And Localized Embeds In 7 Languages Directly Via REST Or MCP:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <a
                href="/api/datasets/catalog"
                style={{
                  padding: '8px 14px',
                  background: '#064e3b',
                  border: '1px solid #10b981',
                  borderRadius: '6px',
                  color: '#ecfdf5',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Open Dataset Catalog API
              </a>
              <a
                href="/api/datasets/catalog?format=cff"
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  border: '1px solid #38bdf8',
                  borderRadius: '6px',
                  color: '#bae6fd',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Academic Citation File Format Manifest
              </a>
              <a
                href="/api/feeds/research"
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  border: '1px solid #38bdf8',
                  borderRadius: '6px',
                  color: '#bae6fd',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Research & Calculator JSON Feed 1.1
              </a>
              <a
                href="/api/seo/outreach-generator"
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  border: '1px solid #a855f7',
                  borderRadius: '6px',
                  color: '#e9d5ff',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Multilingual Outreach & Snippet Generator API
              </a>
              <a
                href="/api/ai/backlink-opportunities"
                style={{
                  padding: '8px 14px',
                  background: '#0f172a',
                  border: '1px solid #f59e0b',
                  borderRadius: '6px',
                  color: '#fde68a',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                AI Backlink & Citation Catalog API
              </a>
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
