/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PRINTABLE ONE-PAGE POKER CHEAT SHEETS & REFERENCE CARDS HUB
 *  (/learn/cheat-sheets)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Print-friendly (@media print) reference tables for Official Poker Hand
 * Rankings, Rule of 4 and 2 Draw Odds, 6-Max & 9-Max RFI Opening Ranges,
 * 10BB/15BB Push-Fold Charts, and Home Game Chip Denominations.
 *
 * House style: Title Case, zero em dashes.
 */

import React from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';

const HAND_RANKING_ROWS = [
  { rank: '1. Royal Flush', example: 'As Ks Qs Js Ts', combos: '4', odds: '0.000154% (649,739 : 1)', note: 'Unbeatable Ace-High Same-Suit Broadway Straight.' },
  { rank: '2. Straight Flush', example: '9h 8h 7h 6h 5h', combos: '36', odds: '0.00139% (72,192 : 1)', note: 'Five Consecutive Cards Of The Exact Same Suit.' },
  { rank: '3. Four Of A Kind (Quads)', example: 'Qc Qd Qh Qs 7c', combos: '624', odds: '0.0240% (4,164 : 1)', note: 'All Four Cards Of The Same Rank Plus One Kicker.' },
  { rank: '4. Full House (Boat)', example: 'Kc Kd Kh Ts Td', combos: '3,744', odds: '0.1441% (693 : 1)', note: 'Three Of A Kind Plus A Pair; Ranked By The Trips First.' },
  { rank: '5. Flush', example: 'Ad Jd 8d 5d 2d', combos: '5,108', odds: '0.1965% (508 : 1)', note: 'Any Five Cards Of The Same Suit; Highest Card Breaks Ties.' },
  { rank: '6. Straight', example: 'Tc 9s 8h 7d 6c', combos: '10,200', odds: '0.3925% (254 : 1)', note: 'Five Consecutive Ranks; Ace Plays High (A-K-Q-J-T) Or Low (5-4-3-2-A).' },
  { rank: '7. Three Of A Kind (Set / Trips)', example: '8s 8h 8d Ac 4s', combos: '54,912', odds: '2.1128% (46.3 : 1)', note: 'Three Cards Of The Same Rank Plus Two Unpaired Kickers.' },
  { rank: '8. Two Pair', example: 'Jh Jc 4s 4d Ah', combos: '123,552', odds: '4.7539% (20.0 : 1)', note: 'Two Distinct Pairs Plus Fifth-Card Kicker; High Pair Ranks First.' },
  { rank: '9. One Pair', example: 'As Ad Kh Qc 9s', combos: '1,098,240', odds: '42.2569% (1.37 : 1)', note: 'Two Cards Of One Rank Plus Three Unpaired Kickers.' },
  { rank: '10. High Card', example: 'Ah Qd 9s 6c 3h', combos: '1,302,540', odds: '50.1177% (1.00 : 1)', note: 'No Pair, Straight, Or Flush; Highest Individual Card Wins.' },
];

const DRAW_ODDS_ROWS = [
  { draw: 'Gutshot Straight Draw', outs: '4 Outs', turnPct: '8.7%', flopToRiverPct: '16.5%', potOddsNeeded: '5.1 : 1 (Turn) | 5.1 : 1 (All-In Flop)' },
  { draw: 'Two Overcards (E.G. AK On T-7-2)', outs: '6 Outs', turnPct: '13.0%', flopToRiverPct: '24.1%', potOddsNeeded: '6.7 : 1 (Turn) | 3.1 : 1 (All-In Flop)' },
  { draw: 'Open-Ended Straight Draw (OESD)', outs: '8 Outs', turnPct: '17.4%', flopToRiverPct: '31.5%', potOddsNeeded: '4.7 : 1 (Turn) | 2.2 : 1 (All-In Flop)' },
  { draw: 'Flush Draw (Two Suited Cards)', outs: '9 Outs', turnPct: '19.6%', flopToRiverPct: '35.0%', potOddsNeeded: '4.1 : 1 (Turn) | 1.86 : 1 (All-In Flop)' },
  { draw: 'Flush Draw + Gutshot (Monster)', outs: '12 Outs', turnPct: '26.1%', flopToRiverPct: '45.0%', potOddsNeeded: '2.8 : 1 (Turn) | 1.22 : 1 (All-In Flop)' },
  { draw: 'Flush Draw + Open-Ended (Combo)', outs: '15 Outs', turnPct: '32.6%', flopToRiverPct: '54.1%', potOddsNeeded: '2.1 : 1 (Turn) | Favorite On Flop!' },
];

const RFI_RANGE_ROWS = [
  { seat: 'UTG (9-Max First In)', rfiPct: '10.5%', pairs: '66 - AA (Mix 22-55)', suited: 'ATs+, A5s-A4s, KTs+, QTs+, JTs, T9s', offsuit: 'AQo+, AKo' },
  { seat: 'Lojack / 6-Max UTG', rfiPct: '17.5%', pairs: '22 - AA', suited: 'A2s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, 76s, 65s', offsuit: 'ATo+, KQo' },
  { seat: 'Hijack (HJ)', rfiPct: '21.5%', pairs: '22 - AA', suited: 'A2s+, K6s+, Q8s+, J8s+, T8s+, 98s-54s', offsuit: 'ATo+, KJo+, QJo' },
  { seat: 'Cutoff (CO)', rfiPct: '28.0%', pairs: '22 - AA', suited: 'A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 86s+, 75s+, 65s-43s', offsuit: 'A8o+, KTo+, QTo+, JTo' },
  { seat: 'Button (BTN)', rfiPct: '44.5%', pairs: '22 - AA', suited: 'A2s+, K2s+, Q2s+, J4s+, T6s+, 95s+, 85s+, 74s+, 63s+, 53s+, 43s', offsuit: 'A2o+, K8o+, Q9o+, J9o+, T8o+, 98o' },
  { seat: 'Small Blind (BvB Only)', rfiPct: '41.0%', pairs: '22 - AA', suited: 'A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s', offsuit: 'A2o+, K8o+, Q9o+, J9o+, T9o' },
];

const PUSH_FOLD_ROWS = [
  { position: 'Lojack (5 Left Behind)', tenBbPush: '22+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, A9o+, KQo (21%)', fifteenBbPush: 'Open 2.1x Or Shove 22-99, A2s-A5s, ATo-AQo, KJs, QJs' },
  { position: 'Hijack (4 Left Behind)', tenBbPush: '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 98s, 87s, A7o+, KTo+, QJo (26%)', fifteenBbPush: 'Shove 22-TT, A2s-A9s, A9o-AQo, KTs+, QTs+, JTs' },
  { position: 'Cutoff (3 Left Behind)', tenBbPush: '22+, A2s+, K2s+, Q6s+, J7s+, T7s+, 97s+, 87s, 76s, A2o+, K9o+, QTo+, JTo (35%)', fifteenBbPush: 'Shove Pocket Pairs 22-99, All Offsuit Aces A5o-AJo, Suited Connectors' },
  { position: 'Button (2 Blinds Behind)', tenBbPush: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 75s+, 65s, 54s, A2o+, K5o+, Q8o+, J8o+, T8o+, 98o (49%)', fifteenBbPush: 'Mix 2.0x Min-Raises And 15BB All-In Shoves Across 44% Of Hands' },
  { position: 'Small Blind (Vs Big Blind)', tenBbPush: '22+, A2s+, K2s+, Q2s+, J2s+, T3s+, 95s+, 84s+, 74s+, 63s+, 53s+, 43s, A2o+, K2o+, Q5o+, J7o+, T7o+, 97o+, 87o (64%)', fifteenBbPush: 'Shove Or Limp-Trap 65%+ Of Hands With Big Blind Ante Dead Money' },
];

const HOME_GAME_CHIP_ROWS = [
  { gameType: '$0.25 / $0.50 Home Cash ($50 Buy-In)', chip1: '20 x $0.25 ($5)', chip2: '20 x $1.00 ($20)', chip3: '5 x $5.00 ($25)', chip4: 'Reserve $25 Chips For Rebuys', totalChips: '45 Chips / Player' },
  { gameType: '$1 / $2 Home Cash ($200 Buy-In)', chip1: '20 x $1 White ($20)', chip2: '26 x $5 Red ($130)', chip3: '2 x $25 Green ($50)', chip4: 'Reserve $100 Black For Deep Rebuys', totalChips: '48 Chips / Player' },
  { gameType: 'T10,000 Deepstack Home Tournament', chip1: '12 x T25 (300)', chip2: '12 x T100 (1,200)', chip3: '7 x T500 (3,500)', chip4: '5 x T1,000 (5,000) + T5,000 Color-Up', totalChips: '36 Chips / Player' },
  { gameType: 'T25,000 Championship Home Tournament', chip1: '8 x T100 (800)', chip2: '6 x T500 (3,000)', chip3: '11 x T1,000 (11,000)', chip4: '2 x T5,000 (10,000) + 1 x T200 Bonus', totalChips: '27 Chips / Player' },
];

const CHEAT_SHEET_FAQS = [
  {
    q: 'Can I Print This Page As A Clean Table Reference Card?',
    a: 'Yes. Press Ctrl+P (Or Cmd+P On Mac) Or Click The "Print Cheat Sheets" Button Above To Trigger Our Clean Print Stylesheet Covering Hand Rankings, Draw Odds, 100BB RFI Ranges, Push-Fold Tables, And Home Game Chip Counts.',
  },
  {
    q: 'Can I Keep A Printed Preflop Chart On The Table In A Live Casino?',
    a: 'In Casual Home Games, Printed Reference Cards Are Great For Learning. In Regulated Commercial Casino Poker Rooms And WSOP/WPT Tournaments, Referencing Any Preflop Chart Or Electronic Solver While Holding Live Cards Is Prohibited Under TDA Rule 5; Review Charts Between Hands Or Before Your Session.',
  },
  {
    q: 'What Is The Optimal Number Of Physical Chips Per Player In A Home Game?',
    a: 'Deal Between 35 And 48 Physical Chips Per Starting Stack Across Three Or Four Denominations. Fewer Than 25 Chips Forces Constant Making Change, While More Than 60 Chips Clutters The Table.',
  },
];

export default function PrintablePokerCheatSheetsPage() {
  const canonicalPath = '/learn/cheat-sheets';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const handlePrint = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: 'Printable One-Page Poker Cheat Sheets & Reference Cards Hub',
      name: 'Printable One-Page Poker Cheat Sheets & Reference Cards Hub',
      description:
        'Print-Friendly Poker Cheat Sheets: Official Hand Rankings, Rule Of 4 And 2 Draw Odds, 6-Max & 9-Max 100BB RFI Opening Ranges, 10BB/15BB Push-Fold Charts, And Home Game Chip Breakdown.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-10',
      dateModified: '2026-11-10',
      isAccessibleForFree: true,
      author: { '@id': 'https://smarter.poker/#organization' },
      publisher: { '@id': 'https://smarter.poker/#organization' },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'header p:first-of-type'],
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      mainEntity: CHEAT_SHEET_FAQS.map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Printable Poker Cheat Sheets', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Printable Poker Cheat Sheets: Hand Rankings, Odds & RFI Charts"
        description="Print-Friendly Poker Cheat Sheets: Official Hand Rankings, Rule Of 4 And 2 Draw Odds, 6-Max & 9-Max 100BB RFI Opening Ranges, 10BB/15BB Push-Fold Charts, And Home Game Chip Breakdown."
        canonical={canonicalPath}
        jsonLd={jsonLd}
      />

      <style>{`
        @media print {
          body { background: #ffffff !important; color: #000000 !important; }
          nav, button, .no-print { display: none !important; }
          section, header { background: #ffffff !important; color: #000000 !important; border: 1px solid #cccccc !important; page-break-inside: avoid; }
          th, td, h1, h2, h3, p, span { color: #000000 !important; }
        }
      `}</style>

      <UniversalHeader pageDepth={2} />

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
          <span style={styles.crumbCurrent}>Printable Poker Cheat Sheets</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>5 PRINT-READY REFERENCE TABLES</span>
            <span style={styles.emeraldBadge}>INCLUDES @MEDIA PRINT STYLESHEET</span>
          </div>

          <h1 style={styles.h1}>
            Printable One-Page Poker Cheat Sheets: Hand Rankings, Draw Odds, RFI Ranges &amp; Push-Fold
          </h1>

          <p style={styles.lead}>
            <strong>Direct Reference Hub:</strong> Bookmark Or Print All Five Essential Poker Reference Cards Below:
            <strong> (1) Official 10 Poker Hand Rankings</strong>,
            <strong> (2) Rule Of 4 And 2 Draw Odds &amp; Pot Odds</strong>,
            <strong> (3) 100BB 9-Max &amp; 6-Max RFI Opening Ranges</strong>,
            <strong> (4) 10BB &amp; 15BB Tournament Push-Fold Charts</strong>, And
            <strong> (5) Home Game Starting Chip Breakdowns</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <button type="button" onClick={handlePrint} style={styles.printBtn}>
              Print All 5 Cheat Sheets (Ctrl+P / Cmd+P)
            </button>
            <Link href="/learn/poker-hand-rankings" style={styles.crossBtnEmerald}>
              Full Hand Rankings Guide
            </Link>
            <Link href="/tools/preflop-ranges" style={styles.crossBtnOutline}>
              Interactive 13x13 GTO Range Grid
            </Link>
            <Link href="/tools/push-fold-chart" style={styles.crossBtnOutline}>
              Interactive Push-Fold Tool
            </Link>
            <Link href="/learn/poker-math" style={styles.crossBtnOutline}>
              12 Poker Math Formulas
            </Link>
          </div>
        </header>

        {/* Sheet 1: Official Poker Hand Rankings */}
        <section aria-label="Cheat Sheet 1 Official Poker Hand Rankings" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Cheat Sheet 01: Official Poker Hand Rankings (Strongest To Weakest)
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Hand Rank</th>
                  <th style={styles.th}>5-Card Example</th>
                  <th style={styles.th}>5-Card Combos</th>
                  <th style={styles.th}>Probability (Odds)</th>
                  <th style={styles.th}>Tie-Breaker Rule</th>
                </tr>
              </thead>
              <tbody>
                {HAND_RANKING_ROWS.map((r) => (
                  <tr key={r.rank} style={styles.trBody}>
                    <td style={styles.tdCyan}>{r.rank}</td>
                    <td style={styles.tdBold}>{r.example}</td>
                    <td style={styles.tdCell}>{r.combos}</td>
                    <td style={styles.tdEmerald}>{r.odds}</td>
                    <td style={styles.tdCell}>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sheet 2: Rule of 4 and 2 Draw Odds */}
        <section aria-label="Cheat Sheet 2 Draw Odds And Pot Odds" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Cheat Sheet 02: Flop &amp; Turn Draw Odds (The Rule Of 4 And 2)
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Common Postflop Draw</th>
                  <th style={styles.th}>Clean Outs</th>
                  <th style={styles.th}>1 Card (Turn -&gt; River)</th>
                  <th style={styles.th}>2 Cards (Flop -&gt; River)</th>
                  <th style={styles.th}>Minimum Pot Odds Required</th>
                </tr>
              </thead>
              <tbody>
                {DRAW_ODDS_ROWS.map((r) => (
                  <tr key={r.draw} style={styles.trBody}>
                    <td style={styles.tdBold}>{r.draw}</td>
                    <td style={styles.tdCyan}>{r.outs}</td>
                    <td style={styles.tdEmerald}>{r.turnPct}</td>
                    <td style={styles.tdCyan}>{r.flopToRiverPct}</td>
                    <td style={styles.tdCell}>{r.potOddsNeeded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sheet 3: 100BB RFI Opening Ranges */}
        <section aria-label="Cheat Sheet 3 100BB RFI Opening Ranges" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Cheat Sheet 03: 100BB Cash Game Raise-First-In (RFI) Ranges By Position
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Table Position</th>
                  <th style={styles.th}>RFI %</th>
                  <th style={styles.th}>Pocket Pairs</th>
                  <th style={styles.th}>Suited Hands</th>
                  <th style={styles.th}>Offsuit Hands</th>
                </tr>
              </thead>
              <tbody>
                {RFI_RANGE_ROWS.map((r) => (
                  <tr key={r.seat} style={styles.trBody}>
                    <td style={styles.tdBold}>{r.seat}</td>
                    <td style={styles.tdCyan}>{r.rfiPct}</td>
                    <td style={styles.tdEmerald}>{r.pairs}</td>
                    <td style={styles.tdCell}>{r.suited}</td>
                    <td style={styles.tdCell}>{r.offsuit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sheet 4: 10BB & 15BB Push-Fold Charts */}
        <section aria-label="Cheat Sheet 4 Short Stack Tournament Push Fold Ranges" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Cheat Sheet 04: 10BB &amp; 15BB Tournament Short-Stack Push-Fold Reference
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Position</th>
                  <th style={styles.th}>10BB All-In Shove Range (With Ante)</th>
                  <th style={styles.th}>15BB Strategy Adjustment</th>
                </tr>
              </thead>
              <tbody>
                {PUSH_FOLD_ROWS.map((r) => (
                  <tr key={r.position} style={styles.trBody}>
                    <td style={styles.tdBold}>{r.position}</td>
                    <td style={styles.tdCyan}>{r.tenBbPush}</td>
                    <td style={styles.tdCell}>{r.fifteenBbPush}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sheet 5: Home Game Starting Chip Breakdown */}
        <section aria-label="Cheat Sheet 5 Home Game Starting Chip Breakdown" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Cheat Sheet 05: Home Game Cash &amp; Tournament Starting Chip Breakdown
          </h2>
          <div style={{ overflowX: 'auto', marginTop: '14px' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.trHead}>
                  <th style={styles.th}>Game Format &amp; Stack</th>
                  <th style={styles.th}>Denomination 1</th>
                  <th style={styles.th}>Denomination 2</th>
                  <th style={styles.th}>Denomination 3</th>
                  <th style={styles.th}>Denomination 4 / Reserve</th>
                  <th style={styles.th}>Physical Chips</th>
                </tr>
              </thead>
              <tbody>
                {HOME_GAME_CHIP_ROWS.map((r) => (
                  <tr key={r.gameType} style={styles.trBody}>
                    <td style={styles.tdBold}>{r.gameType}</td>
                    <td style={styles.tdCyan}>{r.chip1}</td>
                    <td style={styles.tdEmerald}>{r.chip2}</td>
                    <td style={styles.tdCell}>{r.chip3}</td>
                    <td style={styles.tdCell}>{r.chip4}</td>
                    <td style={styles.tdBold}>{r.totalChips}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions On Poker Cheat Sheets</h2>
          <div style={styles.faqList}>
            {CHEAT_SHEET_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Printable One-Page Poker Cheat Sheets & Reference Cards Hub"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="5 Reference Tables"
          badgeValue="Rankings, Odds, RFI & Chips"
          summary="Print-Friendly Poker Cheat Sheets: Official Hand Rankings, Rule Of 4 And 2 Draw Odds, 6-Max & 9-Max 100BB RFI Opening Ranges, 10BB/15BB Push-Fold Charts, And Home Game Chip Breakdown."
          publishedYear="2026"
          slug="printable-poker-cheat-sheets"
        />

        <AiPromptLauncher
          title="Printable One-Page Poker Cheat Sheets"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
          markdownUrl="/learn/cheat-sheets.md"
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
    maxWidth: '1160px',
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
    fontSize: '31px',
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
  quickCrossLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  printBtn: {
    backgroundColor: '#00d4ff',
    color: '#0a0f18',
    fontWeight: 800,
    fontSize: '13px',
    padding: '9px 16px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
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
    marginBottom: '26px',
  },
  h2: {
    fontSize: '21px',
    fontWeight: 800,
    color: '#f8fafc',
    margin: 0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13.5px',
  },
  trHead: {
    backgroundColor: '#0a0f18',
    borderBottom: '2px solid #00d4ff',
    textAlign: 'left',
  },
  th: {
    padding: '11px 12px',
    color: '#00d4ff',
    fontWeight: 700,
    fontSize: '12px',
  },
  trBody: {
    borderBottom: '1px solid #1e293b',
  },
  tdBold: {
    padding: '12px',
    color: '#f8fafc',
    fontWeight: 700,
  },
  tdCyan: {
    padding: '12px',
    color: '#00d4ff',
    fontWeight: 700,
  },
  tdEmerald: {
    padding: '12px',
    color: '#10b981',
    fontWeight: 700,
  },
  tdCell: {
    padding: '12px',
    color: '#cbd5e1',
    lineHeight: 1.5,
  },
  faqList: {
    display: 'grid',
    gap: '14px',
    marginTop: '14px',
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
