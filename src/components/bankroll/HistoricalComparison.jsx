import ResponsiveTable from '../ui/ResponsiveTable';
import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { comparePeriods } from '../../lib/bankroll/analyticsView.mjs';
import { money, periodDate, tone } from './analyticsDisplay';
import styles from './BankrollAnalytics.module.css';
const pct = (v) => (v == null ? 'N/A' : v.toFixed(1) + '%');

export default function HistoricalComparison({ entries = [], displayEUR = false }) {
  const [period, setPeriod] = useState('month');
  const today = new Date().toISOString().slice(0, 10);
  const { current, previous, start, previousStart } = useMemo(
    () => comparePeriods(entries, period, today),
    [entries, period, today]
  );
  const label = (d) => (period === 'month' ? periodDate(d, true) : d.slice(0, 4));
  const priorNet = previous.count ? previous.net : null,
    currentNet = current.count ? current.net : null;
  return (
    <section className={styles.card} aria-label="Historical Comparison">
      <h3>
        <CalendarRange aria-hidden size={18} />
        Historical Comparison
      </h3>
      <div className={styles.tabs} role="group" aria-label="Comparison Period">
        {['month', 'year'].map((k) => (
          <button type="button" aria-pressed={k === period} key={k} onClick={() => setPeriod(k)}>
            {k === 'month' ? 'Month' : 'Year'}
          </button>
        ))}
      </div>
      {!current.count && !previous.count ? (
        <p className={styles.empty}>No Sessions In Either Period</p>
      ) : (
        <>
          <div className={styles.compare}>
            <ResponsiveTable
              caption="Period Comparison"
              keyField="name"
              columns={[
                { key: 'name', label: 'Measure' },
                { key: 'now', label: label(start), align: 'right' },
                { key: 'prior', label: label(previousStart), align: 'right' },
              ]}
              rows={[
                {
                  name: 'Net Result',
                  now: <span className={tone(currentNet)}>{money(currentNet, displayEUR, true)}</span>,
                  prior: <span className={tone(priorNet)}>{money(priorNet, displayEUR, true)}</span>,
                },
                { name: 'Sessions', now: current.count, prior: previous.count },
                { name: 'Win Rate', now: pct(current.winRate), prior: pct(previous.winRate) },
              ]}
            />
          </div>
          {priorNet !== null && currentNet !== null && (
            <div className={styles.pair}>
              <small>Net Change</small>
              <strong className={tone(currentNet - priorNet)}>
                {money(currentNet - priorNet, displayEUR, true)}
              </strong>
            </div>
          )}
          <p className={styles.foot}>Selected Ledger Entries · Current Period To Date</p>
        </>
      )}
    </section>
  );
}
