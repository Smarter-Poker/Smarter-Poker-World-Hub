/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER MENTAL GAME, TILT CONTROL & PEAK PERFORMANCE HUB (/learn/mental-game)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Comprehensive psychology, tilt diagnostics, stop-loss protocol, and endurance
 * guide covering the 7 types of poker tilt, interactive A-Game vs C-Game
 * diagnostic checklist, session exit protocols, and 12-hour live nutrition.
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';

const SEVEN_TILT_TYPES = [
  {
    name: '1. Injustice Tilt ("Cooler & Bad Beat Tilt")',
    trigger: 'Getting Stacked As An 80%+ Favorite On A 2-Outer River Or Running Into Set-Over-Set.',
    symptom: 'Complaining About Cardroom Shufflers, Calling Wide Preflop To "Get Even With Luck", And Seeing Monsters Under The Bed.',
    antidote:
      'Open The Smarter.Poker Variance Calculator Immediately After The Session To Visualize That A 10-Buy-In Downswing Happens To A +8 BB/100 Winner Over 35% Of The Time Across 50,000 Hands.',
  },
  {
    name: '2. Hate-Losing Tilt ("Booking A Win Obsession")',
    trigger: 'Dropping Back Into The Red After Being Up Two Buy-Ins Earlier In The Session.',
    symptom: 'Forcing Marginal 3-Bets Or Hero-Calling River Overbets Simply Because Losing A Previously Won Stack Feels Like Losing Double.',
    antidote:
      'Detach From Arbitrary 24-Hour Session Boundaries: Poker Is One Continuous Lifetime Session Measured In Expected Value (+EV Decisions), Never Daily Cash Register Snapshots.',
  },
  {
    name: '3. Mistake Tilt ("Self-Criticism Spiral")',
    trigger: 'Making A Clear Technical Error (Misreading A Board, Punting A Bluff Into A Calling Station) And Obsessing Over It.',
    symptom: 'Playing Tentatively On The Next Three Orbits Or Over-Aggressively Trying To Immediately Win Back The Punted Chips.',
    antidote:
      'Write The Exact Hand Down In Your Session Notes Within 30 Seconds To Review Off-Table Later, Take Three Box Breaths (4-4-4-4), And Reset To Baseline Preflop Charts.',
  },
  {
    name: '4. Revenge Tilt ("Personal Vendetta Vs Specific Villain")',
    trigger: 'Being Shown A Bluff, Slow-Rolled, Or Needle-Talked By An Aggressive Table Opponent.',
    symptom: '3-Betting And Floating That Specific Opponent With Trash Hands Out Of Position Just To "Teach Them A Lesson."',
    antidote:
      'Remember That Needling Opponents Want You To Deviations-Tilt. The Coldest Revenge In Poker Is Patiently Waiting For The Top 15% Of Your Range And Stacking Their Over-Aggression.',
  },
  {
    name: '5. Entitlement Tilt ("I Am Better Than This Fish")',
    trigger: 'Losing Three Pots In A Row To A Loose-Passive Recreational Player Playing 65% VPIP.',
    symptom: 'Refusing To Fold Overpairs When The Recreational Player Hits Two Pair Or A Flush Because "They Should Never Have That Hand Preflop."',
    antidote:
      'Respect Postflop Equity Regardless Of Preflop Skill: A 7-4 Offsuit That Flops Two Pair Holds 76% Equity Against Your Pocket Aces. Praise Loose Action So They Keep Playing Bad Ranges.',
  },
  {
    name: '6. Winner\'s Tilt ("Invincibility & Loose Euphoria")',
    trigger: 'Sitting On A 400BB Monster Stack After Winning Three Huge Pots In The First Two Hours.',
    symptom: 'Playing 45% VPIP "Because I Have So Many Chips", Straddling Out Of Turn, And Giving Back 150BB In Sloppy Multiway Calls.',
    antidote:
      'Treat Every Chip In A 400BB Stack As Full Bankroll Equity. Tighten Your Early-Position Ranges And Use Deep-Stack Leverage Only In Position Against Other Deep Stacks.',
  },
  {
    name: '7. Desperation Tilt ("Chasing Losses & Moving Up Stakes")',
    trigger: 'Being Down Three Buy-Ins At $2/$5 And Jumping Into The $5/$10 Game At 2:00 AM To Break Even.',
    symptom: 'Playing Above Your Bankroll While Fatigued, Shoving Marginal Draws, And Risking Month-Long Bankroll Ruin In One Night.',
    antidote:
      'Enforce A Hard Pre-Session Buy-In Cap: Never Carry More Than 3 Buy-Ins For Your Target Stake To The Casino Floor And Never Move Up Stakes While Stuck.',
  },
];

const DIAGNOSTIC_CHECKLIST = [
  {
    id: 'pulse-baseline',
    label: 'Physical Calm: Resting Heart Rate & Breathing Remain Normal After A Big Pot',
    detail: 'If Your Chest Feels Tight Or You Slam Chips After Losing A Flip, You Have Dropped Below A-Game.',
  },
  {
    id: 'range-discipline',
    label: 'Preflop Discipline: Zero Revenge Calls Or Boredom Limps In The Last 30 Minutes',
    detail: 'Opening Offsuit Trash Or Cold-Calling 3-Bets Out Of Position Is The Earliest C-Game Warning Sign.',
  },
  {
    id: 'sizing-calculation',
    label: 'Active Math: Computing Pot Size, Stack-To-Pot Ratio (SPR) & Villain Range On Every Street',
    detail: 'Autopilot Clicking Or Guessing Bet Sizes Without Counting The Pot Signals Cognitive Fatigue.',
  },
  {
    id: 'result-detachment',
    label: 'Zero Stack-Peak Anchoring: Not Comparing Current Stack To Your Highest Stack Of The Night',
    detail: 'Every Hand Starts At The Current Effective Stack Size; Yesterday\'s Peak Chips Do Not Exist.',
  },
  {
    id: 'fatigue-hydration',
    label: 'Physiological Readiness: Hydrated, Fed Low-Glycemic Protein, And Under 8 Hours At The Table',
    detail: 'Decision Quality Drops By Up To 35% When Dehydrated Or Experiencing A Sugar/Caffeine Crash.',
  },
];

const STOP_LOSS_PROTOCOLS = [
  {
    rule: 'The 3-Buy-In Hard Or Soft Stop-Loss Rule',
    protocol:
      'Carry Exactly Three 100BB Buy-Ins For Your Session. If You Lose All Three Buy-Ins (Even Via Pure Set-Over-Set Coolers), Your Table Image Takes A Hit And Subtle Tilt Creeps In. Rack Up And End The Session Unless A Confirmed 70%+ VPIP Whale Is Directly To Your Right And You Score 5/5 On The A-Game Checklist.',
  },
  {
    rule: 'The Trailing Peak-Stack Lock ("Winner\'s Stop-Win Guard")',
    protocol:
      'When Your Stack Reaches 350BB+ Late At Night And The Table Breaks Down To Four Tough Regulars, Set A Trailing Floor (For Example, Locking Up At 300BB If The Recreational Players Leave). Never Stay At A Bad Table Just Because You Are Up.',
  },
  {
    rule: 'The Two-Mistake Technical Exit Trigger',
    protocol:
      'Separate Variance From Execution: Losing Two All-In Coinflips Is Zero Reason To Quit A Great Game. However, Making Two Clear Unforced Technical Mistakes In A Single Orbit (Such As Misreading Stack Depth Or Tilt-Calling A Nit\'s River Raise) Demands An Immediate 15-Minute Walk Or Session Exit.',
  },
  {
    rule: 'The 90-Minute Off-Table Reset Walk',
    protocol:
      'Every 90 To 120 Minutes Of Live Or Online Grinding, Stand Up From The Table For 5 To 8 Minutes. Walk Outside The Casino Floor, Drink 12oz Of Water, And Let Your Prefrontal Cortex Clear Short-Term Hand Residua.',
  },
];

const NUTRITION_TIMELINE = [
  {
    window: 'Pre-Session (60 Minutes Before First Hand)',
    focus: 'Steady Glucose & Dopamine Precursors',
    action:
      'Eat High-Protein, Complex-Fat Meals (Eggs, Salmon, Avocado, Almonds, Oats) With 16oz Water + Electrolytes. Avoid Heavy Pasta Or Burger Meals That Trigger Postprandial Drowsiness ("Food Coma") During Hour 2.',
  },
  {
    window: 'Hours 1 To 4 (Peak Cognitive Window)',
    focus: 'Controlled Caffeine & Hydration',
    action:
      'Limit Caffeine To 100mg-150mg (One Black Coffee Or Green Tea) Early In The Session. Sip 8oz Of Water Every Hour To Maintain Blood Volume And Visual Focus.',
  },
  {
    window: 'Hours 4 To 8 (Mid-Session Fuel & Reset)',
    focus: 'Zero-Spike Table Snacking',
    action:
      'Pack Raw Walnuts, Macadamia Nuts, Beef Jerky, Or Low-Sugar Protein Bars. Never Order Sugary Casino Sodas, Energy Drinks, Or Fried Finger Foods That Spike Insulin And Cause Irritability Tilt 45 Minutes Later.',
  },
  {
    window: 'Hours 8 To 12 (Late-Session Endurance & Wind-Down)',
    focus: 'Caffeine Cut-Off & Sleep Protection',
    action:
      'Cut Off All Caffeine At Least 6 Hours Before Planned Sleep So You Achieve Deep REM Sleep (Where The Brain Consolidates Solver Patterns And Emotional Regulation).',
  },
];

const MENTAL_FAQS = [
  {
    q: 'Why Do Winning Poker Players Still Go On Tilt?',
    a: 'Under Acute Stress Or Bad Beats, The Brain\'s Amygdala Triggers A Fight-Or-Flight Cortisol Surge That Temporarily Throttles Blood Flow To The Prefrontal Cortex (The Region Responsible For Probability Calculation And Impulse Control). Even Elite Pros Must Use Pre-Committed Stop-Loss Rules And Breathing Protocols To Override Amygdala Hijack.',
  },
  {
    q: 'Should I Quit A Poker Session When I Am Up Two Buy-Ins To "Lock In A Win"?',
    a: 'Only If The Game Quality Has Deteriorated Or You Are Experiencing Winner\'s Tilt / Fatigue. Quitting A High-EV Table Full Of Recreational Players Early Just To Protect A Daily Win Entry Cuts Your Long-Term Hourly Winrate By 25% To 40%.',
  },
  {
    q: 'How Does The Inchworm Concept (Jared Tendler) Apply To Poker Improvement?',
    a: 'Your Performance Ranges From Your Best (A-Game) To Your Worst (C-Game). True Improvement Requires Both Moving The Front Of The Inchworm Forward (Learning New GTO Solver Concepts) And Pulling The Back Of The Inchworm Forward (Eliminating C-Game Tilt Punts That Destroy 50 Hours Of A-Game Grinding In 20 Minutes).',
  },
];

export default function PokerMentalGamePage() {
  const [checkedMap, setCheckedMap] = useState({
    'pulse-baseline': true,
    'range-discipline': true,
    'sizing-calculation': true,
    'result-detachment': false,
    'fatigue-hydration': true,
  });

  const toggleItem = (id) => {
    setCheckedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const score = Object.values(checkedMap).filter(Boolean).length;
  const total = DIAGNOSTIC_CHECKLIST.length;
  const canonicalPath = '/learn/mental-game';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;

  const jsonLd = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: 'Poker Mental Game, Tilt Control & Peak Performance Hub',
      name: 'Poker Mental Game And Tilt Control Hub',
      description:
        'Master The 7 Types Of Poker Tilt, Run Our Interactive A-Game Vs. C-Game Diagnostic Checklist, And Apply Proven Stop-Loss And 12-Hour Live Session Nutrition Protocols.',
      url: canonicalUrl,
      inLanguage: 'en-US',
      datePublished: '2026-11-24',
      dateModified: '2026-11-24',
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
      mainEntity: MENTAL_FAQS.map((f) => ({
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
        { '@type': 'ListItem', position: 3, name: 'Poker Mental Game & Tilt Control', item: canonicalUrl },
      ],
    },
  ];

  return (
    <div style={styles.page}>
      <SEOHead
        title="Poker Mental Game And Tilt Control Hub"
        description="Master The 7 Types Of Poker Tilt, Run Our Interactive A-Game Vs. C-Game Diagnostic Checklist, And Apply Proven Stop-Loss And 12-Hour Live Session Nutrition Protocols."
        canonical={canonicalPath}
        jsonLd={jsonLd}
      />

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
          <span style={styles.crumbCurrent}>Poker Mental Game &amp; Tilt Control</span>
        </nav>

        <header style={styles.heroPlate}>
          <div style={styles.badgeRow}>
            <span style={styles.cyanBadge}>7 CANONICAL TILT PROFILES &amp; ANTIDOTES</span>
            <span style={styles.emeraldBadge}>A-GAME DIAGNOSTIC &amp; STOP-LOSS PROTOCOLS</span>
          </div>

          <h1 style={styles.h1}>
            Poker Mental Game, Tilt Control &amp; Peak Performance Hub
          </h1>

          <p style={styles.lead}>
            <strong>Direct Answer:</strong> A Single 30-Minute C-Game Tilt Spiral Can Wipe Out 40 Hours Of Disciplined A-Game Grinding. Mastering The Poker Mental Game Requires Identifying Which Of The <strong>7 Canonical Tilt Types</strong> Triggers Your Amygdala Hijack, Auditing Your <strong>A-Game Vs. C-Game Readiness</strong> In Real Time, Enforcing Non-Negotiable <strong>Session Stop-Loss Protocols</strong>, And Fueling Your Brain With <strong>Variance Math</strong>.
          </p>

          <div style={styles.quickCrossLinks}>
            <Link href="/tools/variance-calculator" style={styles.crossBtnCyan}>
              Open Poker Variance &amp; Downswing Simulator
            </Link>
            <Link href="/tools/winrate-confidence-calculator" style={styles.crossBtnEmerald}>
              Winrate Confidence Interval Calculator
            </Link>
            <Link href="/hub/training/tilt-guard" style={styles.crossBtnOutline}>
              Launch Tilt Guard Training Module
            </Link>
            <Link href="/tools/bankroll-calculator" style={styles.crossBtnOutline}>
              Risk Of Ruin &amp; Bankroll Calculator
            </Link>
          </div>
        </header>

        {/* Interactive A-Game vs C-Game Diagnostic Checklist */}
        <section aria-label="Interactive A-Game Versus C-Game Diagnostic Checklist" style={styles.sectionPlate}>
          <div style={styles.headerFlex}>
            <h2 style={styles.h2}>
              Interactive Live A-Game Vs. C-Game Diagnostic Checklist ({score} Of {total} Active)
            </h2>
            <span style={score >= 4 ? styles.statusGreen : styles.statusCaution}>
              {score === 5
                ? 'PEAK A-GAME STATE: CLEAR TO GRIND'
                : score >= 4
                ? 'B-GAME ALERT: TAKE A 5-MINUTE WALK'
                : 'C-GAME TILT WARNING: EXIT SESSION NOW'}
            </span>
          </div>
          <p style={styles.subLead}>
            Tap Each Criterion Below Mid-Session To Audit Whether You Are Operating At Peak Prefrontal Focus Or Slipping Into Emotional Autopilot:
          </p>

          <div style={styles.checklistGrid}>
            {DIAGNOSTIC_CHECKLIST.map((item) => {
              const active = Boolean(checkedMap[item.id]);
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleItem(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggleItem(item.id);
                  }}
                  style={active ? styles.checkCardActive : styles.checkCard}
                >
                  <div style={styles.checkTitleRow}>
                    <span style={active ? styles.checkBoxOn : styles.checkBoxOff}>
                      {active ? 'VERIFIED' : 'CHECK'}
                    </span>
                    <span style={styles.checkLabel}>{item.label}</span>
                  </div>
                  <p style={styles.checkDetail}>{item.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* The 7 Types of Poker Tilt */}
        <section aria-label="The 7 Types Of Poker Tilt And Antidotes" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            The 7 Types Of Poker Tilt: Triggers, Table Symptoms &amp; Mathematical Antidotes
          </h2>
          <div style={styles.tiltGrid}>
            {SEVEN_TILT_TYPES.map((t) => (
              <article key={t.name} style={styles.tiltCard}>
                <h3 style={styles.h3}>{t.name}</h3>
                <p style={styles.tiltLine}>
                  <strong style={{ color: '#f87171' }}>Primary Trigger:</strong> {t.trigger}
                </p>
                <p style={styles.tiltLine}>
                  <strong style={{ color: '#38bdf8' }}>Table Symptom:</strong> {t.symptom}
                </p>
                <p style={styles.tiltLine}>
                  <strong style={{ color: '#34d399' }}>Proven Antidote:</strong> {t.antidote}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Stop-Loss & Session Exit Protocols */}
        <section aria-label="Stop-Loss And Session Exit Protocols" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            Stop-Loss &amp; Session Exit Protocols For Cash Game &amp; Online Grinders
          </h2>
          <div style={styles.twoColGrid}>
            {STOP_LOSS_PROTOCOLS.map((p) => (
              <div key={p.rule} style={styles.colBox}>
                <div style={styles.tagCyan}>SESSION EXIT RULE</div>
                <h3 style={styles.h3}>{p.rule}</h3>
                <p style={styles.bodyText}>{p.protocol}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 12-Hour Live Session Nutrition & Focus Routine */}
        <section aria-label="12 Hour Live Session Nutrition And Focus Routine" style={styles.sectionPlate}>
          <h2 style={styles.h2}>
            12-Hour Live Marathon Session Nutrition, Hydration &amp; Focus Routine
          </h2>
          <div style={styles.twoColGrid}>
            {NUTRITION_TIMELINE.map((n) => (
              <div key={n.window} style={styles.colBox}>
                <div style={styles.tagEmerald}>{n.focus}</div>
                <h3 style={styles.h3}>{n.window}</h3>
                <p style={styles.bodyText}>{n.action}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/variance-calculator" style={styles.crossBtnCyan}>
              Simulate 100,000-Hand Variance Curves
            </Link>
            <Link href="/tools/winrate-confidence-calculator" style={styles.crossBtnEmerald}>
              Check True Winrate Sample Confidence
            </Link>
            <Link href="/hub/training/tilt-guard" style={styles.crossBtnOutline}>
              Open Tilt Guard Biofeedback Trainer
            </Link>
            <Link href="/tools/session-planner" style={styles.crossBtnOutline}>
              Open Session &amp; Stop-Loss Planner
            </Link>
          </div>
        </section>

        {/* FAQs */}
        <section aria-label="Frequently Asked Questions" style={styles.sectionPlate}>
          <h2 style={styles.h2}>Frequently Asked Questions: Poker Tilt &amp; Mental Endurance</h2>
          <div style={styles.faqList}>
            {MENTAL_FAQS.map((item) => (
              <div key={item.q} style={styles.faqItem}>
                <h3 style={styles.faqQ}>{item.q}</h3>
                <p style={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <CitationBacklinkBox
          title="Poker Mental Game, Tilt Control & Peak Performance Hub"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Mental Game Protocol"
          badgeValue="7 Tilt Profiles"
          summary="Complete psychological diagnostics, 7 tilt profiles, A-game vs C-game readiness checklist, stop-loss frameworks, and 12-hour cardroom endurance routines."
          publishedYear="2026"
          slug="poker-mental-game-tilt-control-hub"
        />

        <AiPromptLauncher
          title="Poker Mental Game, Tilt Control & Peak Performance Hub"
          canonicalUrl={canonicalUrl}
          canonicalPath={canonicalPath}
        />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#050811',
    color: '#e2e8f0',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  container: {
    maxWidth: 1080,
    margin: '0 auto',
    padding: '32px 20px 80px',
  },
  breadcrumbs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 18,
  },
  crumbLink: { color: '#38bdf8', textDecoration: 'none' },
  crumbSep: { color: '#475569' },
  crumbCurrent: { color: '#cbd5e1', fontWeight: 600 },
  heroPlate: {
    background: 'linear-gradient(180deg, #0f172a 0%, #090e1a 100%)',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '28px 26px',
    marginBottom: 26,
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  cyanBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(56, 189, 248, 0.14)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
  },
  emeraldBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(16, 185, 129, 0.14)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.35)',
  },
  h1: {
    fontSize: 'clamp(26px, 3.6vw, 36px)',
    fontWeight: 800,
    color: '#f8fafc',
    lineHeight: 1.2,
    margin: '0 0 14px 0',
  },
  lead: {
    fontSize: 16,
    lineHeight: 1.68,
    color: '#cbd5e1',
    margin: '0 0 20px 0',
  },
  quickCrossLinks: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  crossBtnCyan: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#38bdf8',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnEmerald: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#10b981',
    color: '#04131d',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  crossBtnOutline: {
    padding: '9px 15px',
    borderRadius: 8,
    background: '#0f172a',
    color: '#38bdf8',
    border: '1px solid #334155',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
  },
  sectionPlate: {
    background: '#0b1120',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '24px 22px',
    marginBottom: 26,
  },
  headerFlex: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  h2: { fontSize: 21, fontWeight: 800, color: '#f8fafc', margin: 0 },
  h3: { fontSize: 17, fontWeight: 800, color: '#f8fafc', margin: '0 0 10px 0' },
  subLead: { fontSize: 14.5, color: '#94a3b8', margin: '0 0 16px 0' },
  statusGreen: {
    fontSize: 11.5,
    fontWeight: 800,
    padding: '5px 11px',
    borderRadius: 6,
    background: 'rgba(16, 185, 129, 0.16)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.4)',
  },
  statusCaution: {
    fontSize: 11.5,
    fontWeight: 800,
    padding: '5px 11px',
    borderRadius: 6,
    background: 'rgba(56, 189, 248, 0.14)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.4)',
  },
  checklistGrid: { display: 'grid', gap: 12 },
  checkCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '14px 16px',
    cursor: 'pointer',
  },
  checkCardActive: {
    background: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid rgba(16, 185, 129, 0.45)',
    borderRadius: 10,
    padding: '14px 16px',
    cursor: 'pointer',
  },
  checkTitleRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  checkBoxOn: {
    fontSize: 10.5,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 5,
    background: '#10b981',
    color: '#04131d',
  },
  checkBoxOff: {
    fontSize: 10.5,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 5,
    background: '#1e293b',
    color: '#94a3b8',
  },
  checkLabel: { fontSize: 15, fontWeight: 700, color: '#f8fafc' },
  checkDetail: { fontSize: 13.5, color: '#cbd5e1', margin: 0, lineHeight: 1.55 },
  tiltGrid: { display: 'grid', gap: 14, marginTop: 14 },
  tiltCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '18px 20px',
  },
  tiltLine: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: '0 0 8px 0' },
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: 16,
    marginTop: 14,
  },
  colBox: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: 18,
  },
  tagCyan: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 800,
    color: '#38bdf8',
    letterSpacing: '0.05em',
    marginBottom: 6,
  },
  tagEmerald: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 800,
    color: '#34d399',
    letterSpacing: '0.05em',
    marginBottom: 6,
  },
  bodyText: { fontSize: 14, lineHeight: 1.62, color: '#cbd5e1', margin: 0 },
  faqList: { display: 'grid', gap: 14, marginTop: 14 },
  faqItem: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '16px 18px',
  },
  faqQ: { fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' },
  faqA: { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', margin: 0 },
};

export async function getServerSideProps({ req, res, query }) {
  const accept = String(req?.headers?.accept || '');
  if (
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const { renderHubToolMarkdown } = await import('../api/hub-tool-markdown');
    const md = renderHubToolMarkdown('/learn/mental-game', query);
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  return { props: {} };
}

