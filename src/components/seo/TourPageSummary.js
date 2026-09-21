/**
 * THE SERVER RENDERED HALF OF A TOUR PAGE (AEO phase 3, 2026-09-18).
 *
 * 2026-09-19: IT NOW LISTS THE STOPS. Measured on production, twelve tour
 * pages were sampled and produced only seven distinct bodies. WPT and NAPT
 * were byte identical below the title and the h1; so were EASTERNPT and
 * WTP, RGPS and MSPT, and LODGE, VENETIAN and SEMINOLE. Every tour page
 * served the same 190 words: this block, with the name substituted, and
 * "Loading Tour Details...".
 *
 * The copy said "This Page Lists Every Stop On The Schedule". It did not.
 * The schedule is in data/tour-source-registry.json, which is bundled and
 * needs no network, and the page was already importing it to resolve the
 * tour's name. It is now rendered, and the promise is made only by a page
 * that keeps it.
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

export default function TourPageSummary({ code, name, type, website, stops = [], events = [], facts = null }) {
  const label = (name || '').trim() || `${code} Poker Tour`;
  const kind = TOUR_TYPE_LABELS[type] || 'Poker Tour';
  const stopList = Array.isArray(stops) ? stops : [];
  const eventList = Array.isArray(events) ? events : [];

  const money = (value) => `$${Number(value).toLocaleString('en-US')}`;
  const buyinRange = facts?.buyinMin && facts?.buyinMax
    ? `${money(facts.buyinMin)} To ${money(facts.buyinMax)}`
    : null;
  const factRows = [
    facts?.headquarters ? ['Based In', facts.headquarters] : null,
    facts?.established ? ['Running Since', String(facts.established)] : null,
    buyinRange ? ['Typical Buy Ins', buyinRange] : null,
    facts?.mainEvent ? ['Main Event Buy In', money(facts.mainEvent)] : null,
    facts?.regions?.length ? ['Where It Plays', facts.regions.join(', ')] : null,
    facts?.notes ? ['Worth Knowing', facts.notes] : null,
  ].filter(Boolean);

  return (
    <section style={styles.section} aria-labelledby="tour-summary-heading">
      <h1 id="tour-summary-heading" style={styles.heading}>{label}</h1>
      {/* The lead promises a schedule only when there is one to show. A page
          that advertises a list it does not serve is the defect this block
          was built to fix, so it must not commit the same one. */}
      <p style={styles.lead}>
        {label} Is A {kind} Followed On Smarter.Poker.{' '}
        {stopList.length > 0 ? (
          <>
            {stopList.length === 1 ? 'Its Stop Is' : `All ${stopList.length} Stops Are`} Listed
            Below With The Venue, The Dates And The Buy Ins, And The Full Event Schedule For
            Each One Opens From The Page.
          </>
        ) : eventList.length > 0 ? (
          <>
            Its Published Events Are Listed Below With Their Dates And Buy Ins. Stops Are
            Added To This Page As The Operator Announces Them.
          </>
        ) : (
          <>
            The Schedule For This Tour Has Not Been Published Yet. Stops, Events, Buy Ins And
            Results Are Added To This Page As The Operator Announces Them.
          </>
        )}{' '}
        Follow The Tour To Be Told When The Next Stop Is Announced. Free To Read, And No
        Account Is Needed To Look.
      </p>

      {/* WHAT IS KNOWN ABOUT THE TOUR. Fifteen of the twenty eight tours have
          no published schedule anywhere, and without these facts their pages
          are the same sentence with a different name. Only fields that are
          actually held are printed: a blank row is worse than a short list. */}
      {factRows.length > 0 && (
        <dl style={styles.facts}>
          {factRows.map(([term, value]) => (
            <div key={term} style={styles.factRow}>
              <dt style={styles.factTerm}>{term}</dt>
              <dd style={styles.factValue}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {stopList.length > 0 && (
        <>
          <h2 style={styles.subheading}>The {label} Schedule</h2>
          <ol style={styles.stopList}>
            {stopList.map((stop, index) => (
              <li key={`${stop.name || 'stop'}-${index}`} style={styles.stop}>
                <span style={styles.stopName}>{stop.name}</span>
                <span style={styles.stopWhere}>
                  {[stop.venue, stop.location].filter(Boolean).join(', ')}
                </span>
                <span style={styles.stopWhen}>
                  {stop.dates || 'Dates Not Announced'}
                  {stop.status === 'unconfirmed' ? ' (Unconfirmed)' : ''}
                </span>
                {(stop.buyin_range || stop.buyin) && (
                  <span style={styles.stopDetail}>
                    Buy Ins {stop.buyin_range || money(stop.buyin)}
                  </span>
                )}
                {stop.events_count ? (
                  <span style={styles.stopDetail}>{stop.events_count} Events</span>
                ) : null}
                {stop.flagship && (
                  <span style={styles.stopDetail}>Main Event {stop.flagship}</span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {eventList.length > 0 && (
        <>
          <h2 style={styles.subheading}>Events On The {label} Schedule</h2>
          <ul style={styles.eventList}>
            {eventList.map((event, index) => (
              <li key={`${event.name || 'event'}-${index}`} style={styles.event}>
                <span style={styles.eventName}>{event.name}</span>
                <span style={styles.eventMeta}>
                  {[
                    event.dates,
                    event.buyin ? `$${Number(event.buyin).toLocaleString('en-US')} Buy In` : null,
                    event.game,
                  ].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
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
  facts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 10,
    margin: '0 0 8px',
  },
  factRow: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.07)',
    borderRadius: 10,
    padding: '11px 14px',
  },
  factTerm: {
    fontSize: 12,
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    color: '#7f8ca3',
    margin: 0,
  },
  factValue: { fontSize: 14, lineHeight: 1.5, color: '#e6ecf5', margin: '3px 0 0' },
  subheading: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(15px, 1.8vw, 18px)',
    fontWeight: 700,
    color: '#ffffff',
    margin: '28px 0 12px',
    letterSpacing: '0.4px',
  },
  stopList: {
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 12,
    margin: '0 0 8px',
    padding: 0,
  },
  stop: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(0, 198, 255, 0.14)',
    borderRadius: 12,
    padding: '14px 16px',
  },
  stopName: { fontSize: 15, fontWeight: 700, color: '#ffffff', lineHeight: 1.35 },
  stopWhere: { fontSize: 13.5, color: '#b8c4d6' },
  stopWhen: { fontSize: 13.5, color: '#9fd8ff', fontWeight: 600 },
  stopDetail: { fontSize: 13, color: '#8fa0b8' },
  eventList: { listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'grid', gap: 8 },
  event: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    borderLeft: '2px solid rgba(0, 198, 255, 0.3)',
    padding: '4px 0 4px 12px',
  },
  eventName: { fontSize: 14, fontWeight: 600, color: '#e6ecf5' },
  eventMeta: { fontSize: 13, color: '#8fa0b8' },
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
