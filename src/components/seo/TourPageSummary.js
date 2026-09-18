/**
 * THE SERVER RENDERED HALF OF A TOUR PAGE (AEO phase 3, 2026-09-18).
 *
 * The tour page itself is entirely client driven: it reads the code out of
 * router.query and pulls schedule, stops, activity and results over SWR, so
 * a crawler that does not run JavaScript gets none of it. This block is
 * rendered from props that getServerSideProps resolves, so it is in the
 * server HTML whatever happens afterwards, and it stays on the page for a
 * reader rather than being hidden markup.
 *
 * It deliberately promises only what is true before any fetch: what the tour
 * is, what the page will show, and where the neighbouring pages are.
 */
import Link from 'next/link';
import { TOUR_TYPE_LABELS } from '../../lib/seo/tourPageSeo';

export default function TourPageSummary({ code, name, type, website }) {
  const label = (name || '').trim() || `${code} Poker Tour`;
  const kind = TOUR_TYPE_LABELS[type] || 'Poker Tour';

  return (
    <section style={styles.section} aria-labelledby="tour-summary-heading">
      <h1 id="tour-summary-heading" style={styles.heading}>{label}</h1>
      <p style={styles.lead}>
        {label} Is A {kind} Followed On Smarter.Poker. This Page Lists Every Stop On The
        Schedule With The Events At Each One, Their Buy Ins And Start Times, And The
        Results Once They Land. Follow The Tour To Be Told When The Next Stop Is
        Announced. Free To Read, And No Account Is Needed To Look.
      </p>
      <ul style={styles.list}>
        <li style={styles.item}>
          <Link href="/hub/poker-tours" style={styles.link}>All Poker Tours</Link>
          <span style={styles.itemText}>Every Circuit And Series Tracked Here.</span>
        </li>
        <li style={styles.item}>
          <Link href="/hub/poker-near-me/tours" style={styles.link}>Tours Near You</Link>
          <span style={styles.itemText}>The Stops Closest To Where You Are.</span>
        </li>
        <li style={styles.item}>
          <Link href="/hub/poker-near-me/venues" style={styles.link}>Poker Rooms</Link>
          <span style={styles.itemText}>The Casinos And Card Rooms That Host Them.</span>
        </li>
        {website && (
          <li style={styles.item}>
            <a href={website} style={styles.link} rel="noopener noreferrer nofollow" target="_blank">
              Official Site
            </a>
            <span style={styles.itemText}>The Tour Operator{'’'}s Own Pages.</span>
          </li>
        )}
      </ul>
      <p style={styles.compliance}>
        Schedules And Results Come From The Tour Operators And Can Change. 18+.{' '}
        <Link href="/terms" style={styles.inlineLink}>Terms</Link>
        <Link href="/privacy" style={styles.inlineLink}>Privacy</Link>
      </p>
    </section>
  );
}

const styles = {
  section: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '40px 20px 48px',
    color: '#e6ecf5',
    fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
  },
  heading: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(18px, 2.4vw, 24px)',
    fontWeight: 700,
    lineHeight: 1.3,
    color: '#ffffff',
    margin: '0 0 14px',
    letterSpacing: '0.5px',
  },
  lead: { fontSize: 15, lineHeight: 1.65, color: '#b8c4d6', margin: '0 0 24px', maxWidth: 860 },
  list: {
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 14,
    margin: 0,
    padding: 0,
  },
  item: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(0, 198, 255, 0.18)',
    borderRadius: 12,
    padding: '16px 16px 14px',
  },
  link: {
    display: 'block',
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 15,
    fontWeight: 600,
    color: '#00c6ff',
    textDecoration: 'none',
    marginBottom: 6,
    letterSpacing: '0.5px',
  },
  itemText: { fontSize: 14, lineHeight: 1.55, color: '#b8c4d6' },
  compliance: { fontSize: 12, lineHeight: 1.6, color: '#7f8ca3', margin: '26px 0 0' },
  inlineLink: { color: '#9fd8ff', textDecoration: 'underline', marginRight: 10 },
};
