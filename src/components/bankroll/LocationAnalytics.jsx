import { useState, useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { venueBreakdown } from '../../lib/bankroll/analyticsView.mjs';
import { money, tone } from './analyticsDisplay';
import styles from './BankrollAnalytics.module.css';

export default function LocationAnalytics({ entries = [], isLoading, displayEUR = false }) {
  const [sort, setSort] = useState('profit'),
    [all, setAll] = useState(false);
  const sorted = useMemo(() => venueBreakdown(entries, sort), [entries, sort]);
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
                <strong>{v.name}</strong>
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
