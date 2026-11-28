/**
 * One venue's detail in Venue Analytics: the player's own results there and,
 * when the venue is linked to the Poker Near Me directory, what the
 * directory lists for the room (src/lib/bankroll/venueContext.mjs). The
 * listing is the room's catalogue, never a live count of games running.
 */

import { formatCurrency, formatCurrencyWithSign } from '../../lib/bankroll/currencyUtils';
import styles from './VenueRoomDetail.module.css';

const NO_LISTING = 'The directory lists no games, stakes or hours for this room yet.';
const NOT_LIVE = "The room's own listing, not a live count of games running.";
const NO_DIRECTORY = 'The venue directory could not be read.';

const hoursText = (hours) => (Math.round(hours * 10) / 10).toLocaleString('en-US');

export default function VenueRoomDetail({ venue, directory, displayEUR = false, contextError = false }) {
  const hourly = venue.hours > 0 ? venue.timedNet / 100 / venue.hours : null;
  return (
    <div className={styles.detail} data-testid="venue-room-detail">
      <p className={styles.heading}>Your Results Here</p>
      <dl className={styles.facts}>
        <div><dt>Sessions</dt><dd>{venue.count}</dd></div>
        <div>
          <dt>Hourly</dt>
          <dd className={hourly === null ? '' : hourly >= 0 ? styles.gain : styles.loss}>
            {hourly === null ? 'No Timed Sessions' : formatCurrencyWithSign(hourly, displayEUR) + '/hr'}
          </dd>
        </div>
        {venue.hours > 0 && <div><dt>Hours</dt><dd>{hoursText(venue.hours)}</dd></div>}
        <div><dt>Net</dt><dd>{formatCurrency(venue.net / 100, displayEUR)}</dd></div>
      </dl>

      {directory && (
        <>
          <p className={styles.heading}>Listed On Poker Near Me</p>
          {(directory.name || directory.place) && (
            <p className={styles.line}>{[directory.name, directory.place].filter(Boolean).join(' · ')}</p>
          )}
          {directory.games.length > 0 && <p className={styles.line}><span>Games</span> {directory.games.join(', ')}</p>}
          {directory.stakes.length > 0 && <p className={styles.line}><span>Cash Stakes</span> {directory.stakes.join(', ')}</p>}
          {directory.hours.map((h) => (
            <p key={h.label} className={styles.line}><span>{h.label}</span> {h.text}</p>
          ))}
          {!directory.games.length && !directory.stakes.length && !directory.hours.length && (
            <p className={styles.note}>{NO_LISTING}</p>
          )}
          <p className={styles.note}>{NOT_LIVE}</p>
          <a className={styles.link} href={directory.href}>View On Poker Near Me</a>
        </>
      )}
      {contextError && <p className={styles.note} role="status">{NO_DIRECTORY}</p>}
    </div>
  );
}
