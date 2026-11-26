import ResponsiveTable from '../ui/ResponsiveTable';
import { memo, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { getDateRangeFilter } from '../../lib/bankroll/bankrollSelectors';
import { buildTrend, histogram } from '../../lib/bankroll/analyticsView.mjs';
import { Measure, money, periodDate, tone } from './analyticsDisplay';
import styles from './BankrollAnalytics.module.css';

const Plot = dynamic(() => import('./BankrollPlot'), {
  ssr: false,
  loading: () => <div className={styles.plot} aria-label="Preparing Chart" />,
});
const modeTitle = {
  line: 'Cumulative Net',
  bar: 'Period Results',
  stacked: 'Results By Game',
  histogram: 'Session Distribution',
  heatmap: 'Daily Results',
  donut: 'Category Mix',
};

function Heatmap({ model, displayEUR }) {
  const last = model.endDate.slice(0, 7),
    first = model.first.slice(0, 7);
  const [requested, setMonth] = useState(last),
    [selection, setSelection] = useState(null);
  const month = requested < first ? first : requested > last ? last : requested;
  const beginning = new Date(month + '-01T00:00:00Z');
  const days = new Date(
    Date.UTC(beginning.getUTCFullYear(), beginning.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const left = (beginning.getUTCDay() + 6) % 7;
  const monthRows = [...model.byDate.values()].filter((d) => d.date.startsWith(month));
  const max = Math.max(1, ...monthRows.map((d) => Math.abs(d.cents)));
  const selected = selection?.startsWith(month) ? selection : null;
  function move(offset) {
    const d = new Date(beginning);
    d.setUTCMonth(d.getUTCMonth() + offset);
    setMonth(d.toISOString().slice(0, 7));
    setSelection(null);
  }
  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHead}>
        <button
          type="button"
          aria-label="Previous Month"
          disabled={month <= first}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={17} />
        </button>
        <strong>{periodDate(month + '-01', true, true)}</strong>
        <button type="button" aria-label="Next Month" disabled={month >= last} onClick={() => move(1)}>
          <ChevronRight size={17} />
        </button>
      </div>
      <div className={styles.days}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <small key={day}>{day}</small>
        ))}
        {Array.from({ length: left }, (_, i) => (
          <span key={'empty' + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = month + '-' + String(i + 1).padStart(2, '0');
          const record = model.byDate.get(date);
          const color =
            record?.cents < 0 ? '208,87,99' : record?.cents > 0 ? '57,166,130' : '103,137,164';
          const caption = record ? money(record.cents, displayEUR, true) : 'No Entries';
          return (
            <button
              type="button"
              key={date}
              aria-label={periodDate(date, false, true) + ', ' + caption}
              aria-pressed={date === selected}
              disabled={date < model.first || date > model.endDate}
              onClick={() => setSelection(date)}
              style={{
                '--day-fill': record
                  ? 'rgba(' + color + ',' + (0.19 + (0.55 * Math.abs(record.cents)) / max) + ')'
                  : undefined,
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <p className={styles.foot} aria-live="polite">
        {selected
          ? periodDate(selected, false, true) +
            ' · ' +
            (model.byDate.has(selected)
              ? money(model.byDate.get(selected).cents, displayEUR, true)
              : 'No Entries')
          : 'Select A Day To See Its Net Result'}
      </p>
    </div>
  );
}

function DataTable({ mode, model, bins, displayEUR }) {
  const currency = (v) => money(v, displayEUR, true);
  let headers, rows;
  if (mode === 'donut') {
    headers = ['Game', 'Net Result'];
    rows = model.categories.map((c) => [c.label, currency(c.cents)]);
  } else if (mode === 'histogram') {
    headers = ['Session Result Range', 'Sessions'];
    rows = bins.map((b) => [
      money(b.low, displayEUR) + ' to ' + money(b.high, displayEUR),
      String(b.count),
    ]);
  } else if (mode === 'stacked') {
    headers = [model.period, ...model.categories.map((c) => c.label)];
    rows = model.series.map((s) => [
      periodDate(s.date, model.period === 'Month', true),
      ...model.categories.map((c) => currency(s[c.key] || 0)),
    ]);
  } else if (mode === 'heatmap') {
    headers = ['Recorded Day', 'Net Result', 'Sessions'];
    rows = [...model.byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => [periodDate(r.date, false, true), currency(r.cents), String(r.sessions)]);
  } else {
    headers = [model.period, mode === 'line' ? 'Running Net' : 'Net Result', 'Sessions'];
    rows = model.series.map((r) => [
      periodDate(r.date, model.period === 'Month', true),
      currency(mode === 'line' ? r.cumulative : r.cents),
      String(r.sessions),
    ]);
  }
  const columns = headers.map((label, index) => ({
    key: String(index),
    label,
    align: index ? 'right' : 'left',
  }));
  return (
    <details className={styles.data}>
      <summary>View Chart Data</summary>
      <ResponsiveTable columns={columns} rows={rows} keyField="0" caption={modeTitle[mode] + ' Data'} />
    </details>
  );
}

function BankrollTrendChart({
  entries = [],
  isLoading = false,
  chartType = 'line',
  timeFilter = 'Last 30 Days',
  displayEUR = false,
}) {
  const { startDate, endDate } = getDateRangeFilter(timeFilter);
  const model = useMemo(() => buildTrend(entries, startDate, endDate), [entries, startDate, endDate]);
  const bins = useMemo(
    () => (chartType === 'histogram' ? histogram(model.sessions) : []),
    [model, chartType]
  );
  const mode = Object.hasOwn(modeTitle, chartType) ? chartType : 'line';
  const noWedges = mode === 'donut' && model.categories.every((cat) => !cat.magnitude);
  const noHistogram = mode === 'histogram' && !bins.length;
  return (
    <section className={styles.trend} aria-label="Bankroll Trend" aria-busy={isLoading}>
      <div className={styles.trendHead}>
        <div>
          <h3>
            <Activity aria-hidden size={19} />
            Bankroll Trend
          </h3>
          <p>
            {modeTitle[mode]} · {timeFilter}
          </p>
        </div>
        <strong className={tone(model.total)}>
          {isLoading ? '…' : model.rows.length ? money(model.total, displayEUR, true) : 'N/A'}
        </strong>
      </div>
      {isLoading ? (
        <p className={styles.empty}>Loading Ledger Results…</p>
      ) : !model.rows.length ? (
        <p className={styles.empty}>No Data For This Period</p>
      ) : (
        <>
          {noWedges ? (
            <p className={styles.empty}>Every Category Is Even For This Period.</p>
          ) : noHistogram ? (
            <p className={styles.empty}>No Gaming Sessions In This Period.</p>
          ) : mode === 'heatmap' ? (
            <Heatmap model={model} displayEUR={displayEUR} />
          ) : (
            <Plot mode={mode} model={model} bins={bins} displayEUR={displayEUR} />
          )}
          {(mode === 'donut' || mode === 'stacked') && (
            <ul aria-label="Game Breakdown" className={styles.legend}>
              {model.categories.map((c) => (
                <li key={c.key}>
                  <i style={{ backgroundColor: c.color }} />
                  {c.label} <b>{money(c.cents, displayEUR, true)}</b>
                </li>
              ))}
            </ul>
          )}
          {mode === 'donut' && !noWedges && (
            <p className={styles.foot}>
              Slice Size Shows Each Category’s Share Of Absolute Net Results.
            </p>
          )}
          <dl className={styles.strip}>
            <Measure label="Peak Net" value={model.high}>
              {money(model.high, displayEUR, true)}
            </Measure>
            <Measure label="Lowest Net" value={model.low}>
              {money(model.low, displayEUR, true)}
            </Measure>
            <Measure label="Sessions">{model.sessions.length.toLocaleString()}</Measure>
          </dl>
          <DataTable mode={mode} model={model} bins={bins} displayEUR={displayEUR} />
        </>
      )}
    </section>
  );
}
export default memo(BankrollTrendChart);
