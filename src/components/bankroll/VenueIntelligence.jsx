import { useMemo, useState } from 'react';
import { Activity, ChevronDown, Layers3, MapPin, Trophy } from 'lucide-react';
import ResponsiveTable from '../ui/ResponsiveTable';
import styles from './toke/VenueConsole.module.css';
import { careerTotals, gameTypeStats as computeGameTypes, rankVenues, tournamentBrackets as computeBrackets } from '../../lib/bankroll/tokeVenueStats.mjs';

const fmt = (value) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function PanelHeading({ icon: Icon, title, expanded, onToggle, controls }) {
  return (
    <h3 className={styles.sectionTitle}>
      <button type="button" aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
        <Icon size={21} aria-hidden="true" />
        <span>{title}</span>
        <ChevronDown className={styles.chevron} size={19} aria-hidden="true" />
      </button>
    </h3>
  );
}

const distributionColumns = [
  { key: 'totalTokes', label: 'Total Tokes', align: 'right', render: (row) => fmt(row.totalTokes) },
  { key: 'totalDowns', label: 'Downs', align: 'right' },
  {
    key: 'avgTokePerDown',
    label: 'Tokes Per Down',
    align: 'right',
    render: (row) => fmt(row.avgTokePerDown),
  },
];

const GAME_TYPE_MAP = {
  Holdem: "Hold'em",
  PLO: 'PLO',
  Mixed: 'Mixed',
  tournament: 'Tournament',
  brush: 'Brush',
  break: 'Break',
  other: 'Other',
};

// ── Main Component ───────────────────────────────────────────────

export default function VenueIntelligence({
  gigs = [],
  loading = false,
  error = false,
  signedIn = true,
  onRetry,
}) {
  const [expanded, setExpanded] = useState(true);
  const [venueSort, setVenueSort] = useState('toke_hr');
  const [venueOpen, setVenueOpen] = useState(true);
  const [gameOpen, setGameOpen] = useState(true);
  const [tourneyOpen, setTourneyOpen] = useState(true);

  // Paid hours and tokes come from tokeVenueStats.mjs, the same definitions
  // Analytics and the event reports use, so Hourly Tokes agrees across pages.
  const safeGigs = Array.isArray(gigs) ? gigs : [];
  const venueRanking = useMemo(() => rankVenues(safeGigs, venueSort), [safeGigs, venueSort]);
  const gameTypeStats = useMemo(() => computeGameTypes(safeGigs), [safeGigs]);
  const tournamentBrackets = useMemo(() => computeBrackets(safeGigs), [safeGigs]);
  const career = useMemo(() => careerTotals(safeGigs), [safeGigs]);
  const totalEvents = career.events;
  const totalTokesAllTime = career.totalTokes;

  const measure = (venue) =>
    venueSort === 'events'
      ? venue.events
      : venueSort === 'total'
        ? venue.totalTokes
        : venue.tokePerHr;
  const largest = venueRanking.reduce((max, venue) => Math.max(max, measure(venue)), 0);
  const ready = signedIn && !loading && !error;
  return (
    <section aria-label="Career Intelligence" className={styles.stack}>
      <div className={'sd-panel ' + styles.summary}>
        <h2 className={styles.summaryTitle}>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="venue-career-panels"
            onClick={() => setExpanded((value) => !value)}
          >
            <Activity size={25} aria-hidden="true" />
            <span>Career Intelligence</span>
            <ChevronDown size={20} aria-hidden="true" className={styles.chevron} />
          </button>
        </h2>
        {ready ? (
          <dl className={styles.summaryFigures}>
            <div>
              <dt>Total Tokes</dt>
              <dd>{fmt(totalTokesAllTime)}</dd>
            </div>
            <div>
              <dt>Completed Events</dt>
              <dd>{totalEvents}</dd>
            </div>
            <div>
              <dt>Venues</dt>
              <dd>{venueRanking.length}</dd>
            </div>
            <div>
              <dt>Tokes Per Hour</dt>
              <dd>{career.paidHours > 0 ? fmt(career.tokesPerHour) : '-'}</dd>
            </div>
          </dl>
        ) : (
          <p className={styles.status} role={error ? 'alert' : 'status'}>
            {!signedIn
              ? 'Sign In To View Your Career Figures.'
              : error
                ? 'Career Figures Could Not Be Loaded.'
                : 'Loading Career Figures…'}
            {error && onRetry && (
              <button className="sd-button" type="button" onClick={onRetry}>
                Retry
              </button>
            )}
          </p>
        )}
      </div>
      <div id="venue-career-panels" className={styles.stack} hidden={!expanded}>
        <section aria-label="Venue Performance" className={'sd-panel ' + styles.panel}>
          <PanelHeading
            icon={MapPin}
            title="Venue Performance"
            expanded={venueOpen}
            controls="venue-performance-ranking"
            onToggle={() => setVenueOpen((value) => !value)}
          />
          <div id="venue-performance-ranking" hidden={!venueOpen}>
            {ready && venueRanking.length > 0 ? (
              <>
                <div className={styles.sortRail} role="group" aria-label="Rank Venues By">
                  {[
                    ['toke_hr', 'Hourly Tokes'],
                    ['total', 'Total Tokes'],
                    ['events', 'Events'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      className="sd-button"
                      type="button"
                      aria-pressed={venueSort === key}
                      onClick={() => setVenueSort(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <ol className={styles.ranking} aria-label="Ranked Venues">
                  {venueRanking.map((venue, index) => (
                    <li key={venue.venue}>
                      <span className={styles.rank} aria-label={'Rank ' + (index + 1)}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className={styles.venueName}>
                        <strong>{venue.venue}</strong>
                        <small>
                          {venue.events} {venue.events === 1 ? 'Event' : 'Events'} ·{' '}
                          {venue.paidHours.toFixed(1)} Paid Hours
                        </small>
                      </div>
                      <dl className={styles.rowFigures}>
                        <div>
                          <dt>Total Tokes</dt>
                          <dd>{fmt(venue.totalTokes)}</dd>
                        </div>
                        <div>
                          <dt>Hourly Tokes</dt>
                          <dd>{venue.paidHours > 0 ? fmt(venue.tokePerHr) : '-'}</dd>
                        </div>
                      </dl>
                      <div className={styles.meter} aria-hidden="true">
                        <span
                          style={{
                            width: (largest > 0 ? (100 * measure(venue)) / largest : 0) + '%',
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className={styles.empty}>
                {ready
                  ? 'Complete A Shift To Compare Tokes And Paid Hours By Venue.'
                  : 'Venue Rankings Use Completed Shifts.'}
              </p>
            )}
          </div>
        </section>
        <section aria-label="Game Type Profitability" className={'sd-panel ' + styles.panel}>
          <PanelHeading
            icon={Layers3}
            title="Game Type Profitability"
            expanded={gameOpen}
            controls="venue-game-types"
            onToggle={() => setGameOpen((value) => !value)}
          />
          <div id="venue-game-types" className={styles.table} hidden={!gameOpen}>
            {ready && gameTypeStats.length > 0 ? (
              <ResponsiveTable
                keyField="gameType"
                caption="Results By Game Type"
                rows={gameTypeStats}
                columns={[
                  {
                    key: 'gameType',
                    label: 'Game',
                    render: (row) => GAME_TYPE_MAP[row.gameType] || row.gameType || 'Other',
                  },
                  ...distributionColumns,
                ]}
              />
            ) : (
              <p className={styles.empty}>Recorded Downs Show Tokes By Game Type Here.</p>
            )}
          </div>
        </section>
        {ready && tournamentBrackets?.length > 0 && (
          <section aria-label="Tournament Buy-In Analysis" className={'sd-panel ' + styles.panel}>
            <PanelHeading
              icon={Trophy}
              title="Tournament Buy-In Analysis"
              expanded={tourneyOpen}
              controls="venue-tournament-brackets"
              onToggle={() => setTourneyOpen((value) => !value)}
            />
            <div id="venue-tournament-brackets" className={styles.table} hidden={!tourneyOpen}>
              <ResponsiveTable
                keyField="label"
                caption="Tournament Buy-In Brackets"
                rows={tournamentBrackets}
                columns={[{ key: 'label', label: 'Buy-In' }, ...distributionColumns]}
              />
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
