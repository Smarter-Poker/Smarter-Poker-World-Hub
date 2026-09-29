/**
 * THE CHARTS, ON THE PAGE (AEO phase 3, 2026-09-19).
 *
 * /hub/preflop-charts served 112 words to a crawler: its summary block and
 * nothing else. The range lab draws the charts after mount, so the one
 * question the page exists to answer, what a position opens, was never
 * written down anywhere a reader without JavaScript could find it.
 *
 * The corpus is bundled. This renders it as text, on the server, under the
 * summary and in the normal flow of the page, with the provenance attached:
 * an authored 6-max cash teaching reference at 100 big blinds, not a
 * checksummed solver export. Saying so is the difference between a reference
 * and a claim.
 */
import Link from 'next/link';
import {
  openingRanges,
  defenceRanges,
  fourBetRanges,
} from '../../lib/seo/preflopReference';
import { RFI, BB_DEFENSE, FOUR_BET } from '../../config/solverRanges';

const SEAT_ORDER = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];
const SEAT_NAMES = {
  UTG: 'Under The Gun',
  MP: 'Middle Position',
  HJ: 'Hijack',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small Blind',
};

const hands = (list) => list.join(', ');
const mixedHands = (list) => list.map((m) => `${m.hand} ${m.frequency}%`).join(', ');

export default function PreflopReference() {
  const opens = openingRanges(RFI, SEAT_ORDER);
  const defends = defenceRanges(BB_DEFENSE, ['vs_UTG', 'vs_CO', 'vs_BTN', 'vs_SB']);
  const fourBets = fourBetRanges(FOUR_BET, ['UTG_vs_3bet', 'CO_vs_3bet', 'BTN_vs_3bet']);

  return (
    <section style={styles.section} aria-labelledby="preflop-reference-heading">
      <h2 id="preflop-reference-heading" style={styles.heading}>
        The Reference Ranges, Written Out
      </h2>
      <p style={styles.lead}>
        These Are The Ranges The Lab Above Drills, In Words. They Are An Authored
        Teaching Reference For Six Handed Cash At One Hundred Big Blinds, Not A Solver
        Export, And No Solve Tree Or Checksum Is Attached To Them. Two Percentages
        Describe A Mixed Range And They Are Not The Same Number: The First Counts Every
        Hand At The Rate It Is Actually Played, The Second Counts Any Hand The Range
        Touches At All.
      </p>

      <h3 style={styles.subheading}>Opening Ranges</h3>
      {opens.map((range) => (
        <div key={range.position} style={styles.block}>
          <h4 style={styles.blockHeading}>
            {SEAT_NAMES[range.position] || range.position} Opens {range.percent}% Of Hands,
            Reaching {range.reach}%
          </h4>
          {range.always.length > 0 && (
            <p style={styles.line}><span style={styles.label}>Always Opens</span> {hands(range.always)}</p>
          )}
          {range.mixed.length > 0 && (
            <p style={styles.line}><span style={styles.label}>Opens Sometimes</span> {mixedHands(range.mixed)}</p>
          )}
        </div>
      ))}

      <h3 style={styles.subheading}>Defending The Big Blind</h3>
      {defends.map((spot) => (
        <div key={spot.versus} style={styles.block}>
          <h4 style={styles.blockHeading}>
            Against An Open From {SEAT_NAMES[spot.versus] || spot.versus}: Three Bets{' '}
            {spot.threeBet.percent}%, Calls {spot.call.percent}%
          </h4>
          {spot.threeBet.always.length > 0 && (
            <p style={styles.line}><span style={styles.label}>Always Three Bets</span> {hands(spot.threeBet.always)}</p>
          )}
          {spot.threeBet.mixed.length > 0 && (
            <p style={styles.line}><span style={styles.label}>Three Bets Sometimes</span> {mixedHands(spot.threeBet.mixed)}</p>
          )}
          {spot.call.mixed.length > 0 && (
            <p style={styles.line}><span style={styles.label}>Calls</span> {mixedHands(spot.call.mixed)}</p>
          )}
        </div>
      ))}

      <h3 style={styles.subheading}>Facing A Three Bet</h3>
      {fourBets.map((spot) => (
        <div key={spot.position} style={styles.block}>
          <h4 style={styles.blockHeading}>
            {SEAT_NAMES[spot.position] || spot.position} Four Bets {spot.fourBet.percent}%
            And Continues With {spot.call.percent}%
          </h4>
          {spot.fourBet.always.length > 0 && (
            <p style={styles.line}><span style={styles.label}>Always Four Bets</span> {hands(spot.fourBet.always)}</p>
          )}
          {spot.fourBet.mixed.length > 0 && (
            <p style={styles.line}><span style={styles.label}>Four Bets Sometimes</span> {mixedHands(spot.fourBet.mixed)}</p>
          )}
          {spot.call.mixed.length > 0 && (
            <p style={styles.line}><span style={styles.label}>Calls</span> {mixedHands(spot.call.mixed)}</p>
          )}
        </div>
      ))}

      <p style={styles.footnote}>
        A Hand Written With A Percentage Is Played That Share Of The Time And Folded The
        Rest, Which Is What Separates A Range From A List. Work Through Them Hand By Hand
        In The Lab Above, Or Read The Terms In The{' '}
        <Link href="/glossary" style={styles.link}>Poker Glossary</Link>.
      </p>
    </section>
  );
}

const styles = {
  section: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '8px 20px 48px',
    color: '#e6ecf5',
    fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
  },
  heading: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(17px, 2.2vw, 22px)',
    fontWeight: 700,
    color: '#ffffff',
    margin: '0 0 12px',
    letterSpacing: '0.5px',
  },
  lead: { fontSize: 15, lineHeight: 1.65, color: '#b8c4d6', margin: '0 0 22px', maxWidth: 860 },
  subheading: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 16,
    fontWeight: 700,
    color: '#9fd8ff',
    margin: '26px 0 10px',
    letterSpacing: '0.4px',
  },
  block: {
    border: '1px solid rgba(0, 198, 255, 0.14)',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: '13px 15px',
    margin: '0 0 10px',
  },
  blockHeading: { fontSize: 14.5, fontWeight: 700, color: '#ffffff', margin: '0 0 7px', lineHeight: 1.4 },
  line: { fontSize: 13.5, lineHeight: 1.6, color: '#b8c4d6', margin: '0 0 4px' },
  label: { color: '#7f8ca3', marginRight: 6, fontSize: 12, letterSpacing: '0.5px', textTransform: 'uppercase' },
  footnote: { fontSize: 13, lineHeight: 1.65, color: '#8fa0b8', margin: '22px 0 0', maxWidth: 860 },
  link: { color: '#9fd8ff', textDecoration: 'underline' },
};
