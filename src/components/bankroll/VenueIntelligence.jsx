import { useMemo, useState } from 'react';
import { Activity, ChevronDown, Layers3, MapPin, Trophy } from 'lucide-react';
import ResponsiveTable from '../ui/ResponsiveTable';
import styles from './toke/VenueConsole.module.css';

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

const BUYIN_BRACKETS = [
  { label: '$1k+', min: 1000, max: Infinity },
  { label: '$500-$999', min: 500, max: 999.99 },
  { label: '$250-$499', min: 250, max: 499.99 },
  { label: '$100-$249', min: 100, max: 249.99 },
  { label: '<$100', min: 0, max: 99.99 },
];

// ── Helpers ──────────────────────────────────────────────────────

function computeGigStats(gig) {
  // Use gig.downs[] directly (attached by fetchGigs for analytics)
  const downs = gig.downs || [];
  let totalTokes = 0;
  let totalHours = 0;
  for (const down of downs) {
    // Only count dealing downs for hours (not breaks - they inflate the denominator unfairly)
    const isDealing =
      down.down_type === 'cash' || down.down_type === 'tournament' || down.down_type === 'brush';
    if (isDealing) totalTokes += Number(down.toke_amount) || 0;
    if (isDealing && down.started_at && down.ended_at) {
      const hours = (Date.parse(down.ended_at) - Date.parse(down.started_at)) / 3600000;
      if (Number.isFinite(hours) && hours > 0) totalHours += hours;
    }
  }
  return { totalTokes, totalHours, downs };
}

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

  // ── Venue Performance Ranking ──────────────────────────────
  const venueRanking = useMemo(() => {
    const map = Object.create(null);
    for (const gig of gigs) {
      const venue = gig.venue_name || 'Unknown Venue';
      if (!map[venue]) map[venue] = { venue, totalTokes: 0, totalHours: 0, events: 0 };
      const { totalTokes, totalHours } = computeGigStats(gig);
      map[venue].totalTokes += totalTokes;
      map[venue].totalHours += totalHours;
      map[venue].events += 1;
    }
    const arr = Object.values(map || {});
    for (const v of arr) v.tokePerHr = v.totalHours > 0 ? v.totalTokes / v.totalHours : 0;
    const sorted = {
      toke_hr: [...arr].sort((a, b) => b.tokePerHr - a.tokePerHr),
      total: [...arr].sort((a, b) => b.totalTokes - a.totalTokes),
      events: [...arr].sort((a, b) => b.events - a.events),
    };
    return sorted[venueSort];
  }, [gigs, venueSort]);

  // ── Game Type Profitability ────────────────────────────────
  const gameTypeStats = useMemo(() => {
    const map = Object.create(null);
    for (const gig of gigs) {
      for (const down of gig.downs || []) {
        const gt =
          down.down_type === 'cash'
            ? down.game_type || 'Holdem'
            : down.down_type === 'tournament'
              ? 'tournament'
              : down.down_type;
        if (!map[gt]) map[gt] = { gameType: gt, totalTokes: 0, totalDowns: 0 };
        map[gt].totalTokes += Number(down.toke_amount) || 0;
        map[gt].totalDowns += 1;
      }
    }
    return Object.values(map || {})
      .map((gt) => ({
        ...gt,
        avgTokePerDown: gt.totalDowns > 0 ? gt.totalTokes / gt.totalDowns : 0,
      }))
      .sort((a, b) => b.avgTokePerDown - a.avgTokePerDown);
  }, [gigs]);

  // ── Tournament Buy-In Bracket Analysis ────────────────────
  const tournamentBrackets = useMemo(() => {
    const bracketMap = {};
    for (const b of BUYIN_BRACKETS)
      bracketMap[b.label] = { label: b.label, totalTokes: 0, totalDowns: 0 };

    let hasTourneyData = false;
    for (const gig of gigs) {
      for (const down of gig.downs || []) {
        // use gig.downs directly
        if (down.down_type !== 'tournament') continue;
        hasTourneyData = true;
        const buyin = down.tournament_buyin;
        if (buyin == null || buyin === '') continue;
        const bracket = BUYIN_BRACKETS.find((b) => buyin >= b.min && buyin <= b.max);
        if (!bracket) continue;
        bracketMap[bracket.label].totalTokes += Number(down.toke_amount) || 0;
        bracketMap[bracket.label].totalDowns += 1;
      }
    }
    if (!hasTourneyData) return null;

    return BUYIN_BRACKETS.map((b) => ({
      ...bracketMap[b.label],
      avgTokePerDown:
        bracketMap[b.label].totalDowns > 0
          ? bracketMap[b.label].totalTokes / bracketMap[b.label].totalDowns
          : 0,
    })).filter((b) => b.totalDowns > 0);
  }, [gigs]);

  const totalEvents = gigs.length;
  const totalTokesAllTime = useMemo(
    () => gigs.reduce((sum, gig) => sum + computeGigStats(gig).totalTokes, 0),
    [gigs]
  );

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
                          {venue.totalHours.toFixed(1)} Dealing Hours
                        </small>
                      </div>
                      <dl className={styles.rowFigures}>
                        <div>
                          <dt>Total Tokes</dt>
                          <dd>{fmt(venue.totalTokes)}</dd>
                        </div>
                        <div>
                          <dt>Hourly Tokes</dt>
                          <dd>{venue.totalHours > 0 ? fmt(venue.tokePerHr) : '—'}</dd>
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
                  ? 'Complete A Shift To Compare Tokes And Dealing Hours By Venue.'
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
