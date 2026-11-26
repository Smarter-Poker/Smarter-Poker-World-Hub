import { useMemo } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import { sessionSummary } from '../../lib/bankroll/analyticsView.mjs';
import { money, tone } from './analyticsDisplay';
import styles from './BankrollAnalytics.module.css';

export default function VarianceCalculator({ entries = [], displayEUR = false }) {
  const s = useMemo(() => sessionSummary(entries), [entries]);
  return (
    <section className={styles.card} aria-label="Variance Analysis">
      <h3>
        <ChartNoAxesCombined aria-hidden size={18} />
        Variance Analysis
      </h3>
      {s.count < 2 ? (
        <p className={styles.empty}>Log Two Sessions To Measure Variance.</p>
      ) : (
        <>
          <div className={styles.heroMetric}>
            <span>Session Standard Deviation</span>
            <strong>{money(s.sd, displayEUR)}</strong>
          </div>
          <dl className={styles.lines}>
            {[
              ['Average Session', s.mean],
              ['Hourly Rate', s.hourlyRate],
              ['Best Session', s.best],
              ['Worst Session', s.worst],
              ['Max Drawdown', -s.drawdown],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={tone(v)}>
                  {money(v, displayEUR, true)}
                  {k === 'Hourly Rate' && v !== null ? ' / hr' : ''}
                </dd>
              </div>
            ))}
          </dl>
          <p className={styles.foot}>
            {s.count} Sessions · {s.timed} With Recorded Hours
          </p>
        </>
      )}
    </section>
  );
}
