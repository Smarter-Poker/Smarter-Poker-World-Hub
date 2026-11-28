import { useState, useMemo, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { venueBreakdown } from '../../lib/bankroll/analyticsView.mjs';
import { loadVenueContext } from '../../lib/bankroll/venueContext.mjs';
import { supabase } from '../../lib/supabase';
import VenueRoomDetail from './VenueRoomDetail';
import detailStyles from './VenueRoomDetail.module.css';
import { money, tone } from './analyticsDisplay';
import styles from './BankrollAnalytics.module.css';

export default function LocationAnalytics({ entries = [], isLoading, displayEUR = false, venueContext: givenContext }) {
  const [sort, setSort] = useState('profit'),
    [all, setAll] = useState(false),
    [open, setOpen] = useState(null),
    [context, setContext] = useState(() => givenContext || new Map()),
    [contextError, setContextError] = useState(false);
  const sorted = useMemo(() => venueBreakdown(entries, sort), [entries, sort]);
  // The directory listing of each logged venue that is linked to Poker Near
  // Me. An unlinked venue gets nothing extra, and a failed read says so.
  const venueIds = useMemo(() => sorted.map((v) => v.id).sort().join(','), [sorted]);
  useEffect(() => {
    if (givenContext) return undefined;
    let cancelled = false;
    setContextError(false);
    loadVenueContext(supabase, venueIds ? venueIds.split(',') : [])
      .then((map) => { if (!cancelled) setContext(map); })
      .catch((err) => {
        console.warn('[LocationAnalytics] venue directory:', err);
        if (!cancelled) setContextError(true);
      });
    return () => { cancelled = true; };
  }, [venueIds, givenContext]);
  const visible = all ? sorted : sorted.slice(0, 5);
  const max = visible.reduce((m, v) => Math.max(m, sort === 'sessions' ? v.count : Math.abs(v.net)), 1);
  return (
    <section className={styles.card} aria-label="Venue Analytics">
      <h3>
        <MapPin aria-hidden size={18} />
        Venue Analytics
      </h3>
      <div className={styles.tabs} role="group" aria-label="Sort Venues By">
        {['profit', 'sessions'].map((k) => (
          <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>
            {k === 'profit' ? 'P/L' : 'Sessions'}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className={styles.empty}>Loading Venue Results…</p>
      ) : !visible.length ? (
        <p className={styles.empty}>No Venue Data Yet</p>
      ) : (
        <ol className={styles.venues}>
          {visible.map((v) => (
            <li key={v.id}>
              <div className={styles.pair}>
                <button
                  type="button"
                  className={detailStyles.venueToggle}
                  aria-expanded={open === v.id}
                  onClick={() => setOpen(open === v.id ? null : v.id)}
                >
                  <strong>{v.name}</strong>
                </button>
                <b className={tone(v.net)}>{money(v.net, displayEUR, true)}</b>
              </div>
              <div className={sort === 'profit' ? styles.diverging : styles.track} aria-hidden="true">
                <i
                  style={{
                    width: (sort === 'profit' ? 50 * Math.abs(v.net) : 100 * v.count) / max + '%',
                    ...(sort === 'profit'
                      ? v.net < 0
                        ? { right: '50%', background: '#dc7882' }
                        : { left: '50%', background: '#66c7a4' }
                      : {}),
                  }}
                />
              </div>
              <small>
                {v.count} {v.count === 1 ? 'Session' : 'Sessions'} ·{' '}
                {Number(((v.wins / v.count) * 100).toFixed(1))}% Win Rate
              </small>
              {open === v.id && (
                <VenueRoomDetail venue={v} directory={context.get(v.id) || null} displayEUR={displayEUR} contextError={contextError} />
              )}
            </li>
          ))}
        </ol>
      )}
      {sorted.length > 5 && (
        <button type="button" className={styles.link} onClick={() => setAll(!all)}>
          {all ? 'Show Top Five' : 'Show All ' + sorted.length + ' Venues'}
        </button>
      )}
    </section>
  );
}
