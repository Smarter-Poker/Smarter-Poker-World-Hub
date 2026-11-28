import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { moneyChartTicks } from '../../lib/bankroll/analyticsView.mjs';
import {
  dateAxisRows,
  idleTail,
  lineExtremes,
  sessionAxisRows,
  sessionTicks,
} from '../../lib/bankroll/trendAxis.mjs';
import {
  formatCentsCurrency,
  formatCurrencyCompact,
} from '../../lib/bankroll/currencyUtils';
import { periodDate } from './analyticsDisplay';
import styles from './BankrollAnalytics.module.css';

const tick = { fill: '#b8cde1', fontSize: 12 };
const stripe = '#304960';
const DAY = 86400000;

function dateTicks(start, end) {
  const monthly = end - start > 93 * DAY;
  const out = [];
  const cursor = new Date(start);
  if (monthly) cursor.setUTCDate(1);
  while (cursor.getTime() <= end) {
    if (cursor.getTime() >= start) out.push(cursor.getTime());
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const stride = Math.max(1, Math.ceil(out.length / 5));
  return { monthly, ticks: out.filter((_, i) => !(i % stride)) };
}

const signedCompact = (cents, displayEUR) =>
  (cents > 0 ? '+' : '') + formatCurrencyCompact(cents / 100, displayEUR);

export default function BankrollLinePlot({ model, axis, displayEUR }) {
  const gradient = 'bankroll-' + useId().replace(/:/g, '');
  const bySession = axis === 'session';
  const rows = bySession ? sessionAxisRows(model.line) : dateAxisRows(model.line);
  const xKey = bySession ? 'x' : 't';
  const start = rows.length ? rows[0][xKey] : 0;
  const end = rows.length ? rows[rows.length - 1][xKey] : 0;
  const tail = bySession ? null : idleTail(model.line);
  const { peak, lowest } = lineExtremes(model.line);

  let minimum = 0;
  let maximum = 0;
  for (const row of rows) {
    minimum = Math.min(minimum, row.cumulative);
    maximum = Math.max(maximum, row.cumulative);
  }
  // Ticks on whole display units (moneyChartTicks, shared with the bars).
  const ticks = moneyChartTicks(minimum, maximum, displayEUR);
  const dates = bySession ? null : dateTicks(start, end);
  const xTicks = bySession ? sessionTicks(rows.length) : dates.ticks;
  const xFormatter = bySession
    ? (v) => (rows[v] ? periodDate(rows[v].date) : '')
    : (v) => periodDate(new Date(v).toISOString().slice(0, 10), dates.monthly);
  const fullMoney = (cents) => formatCentsCurrency(cents, displayEUR, { signed: true, cents: 'auto' });

  const xOf = (row) => (bySession ? rows.find((r) => r.date === row.date && !r.synthetic)?.x : row.t);
  // Peak labels sit above their dot, Low labels below; anchored to stay inside the plot.
  const anchorAt = (x) => {
    const share = end > start ? (x - start) / (end - start) : 0;
    return share < 0.25 ? 'start' : share > 0.75 ? 'end' : 'middle';
  };
  const marker = (row, label, color, above) => {
    if (!row) return null;
    const x = xOf(row);
    if (x === undefined) return null;
    const anchor = anchorAt(x);
    const text = label + ' ' + signedCompact(row.cumulative, displayEUR);
    return (
      <ReferenceDot
        key={label}
        x={x}
        y={row.cumulative}
        r={4.5}
        fill={color}
        stroke="#071420"
        strokeWidth={1.5}
        ifOverflow="visible"
        label={({ viewBox }) => {
          const cx = viewBox.x + viewBox.width / 2;
          const cy = viewBox.y + viewBox.height / 2;
          const dx = anchor === 'start' ? -4 : anchor === 'end' ? 4 : 0;
          return (
            <text
              x={cx + dx}
              y={above ? cy - 10 : cy + 18}
              textAnchor={anchor}
              fill={color}
              fontSize={12}
              fontWeight={700}
              paintOrder="stroke"
              stroke="#091727"
              strokeWidth={3}
            >
              {text}
            </text>
          );
        }}
      />
    );
  };
  const tailWide = tail && end > start && (tail.to - tail.from) / (end - start) > 0.4;

  const tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const first = row === rows[0] && row.synthetic;
    return (
      <div className={styles.tooltip}>
        <strong>{first ? 'Start' : periodDate(row.date, false, true)}</strong>
        <span>
          Running Net <b>{fullMoney(row.cumulative)}</b>
        </span>
        {!row.synthetic && (
          <span>
            Day Result <b>{fullMoney(row.cents)}</b>
          </span>
        )}
        {row.synthetic && !first && <span>No Sessions Since {periodDate(tail?.since || row.date)}</span>}
      </div>
    );
  };

  return (
    <div className={styles.plot}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 22, bottom: 2, left: 0, right: bySession ? 20 : 14 }} accessibilityLayer>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#36baff" stopOpacity=".55" />
              <stop offset="100%" stopColor="#085bb4" stopOpacity=".04" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={stripe} strokeDasharray="3 5" />
          <XAxis
            dataKey={xKey}
            type="number"
            scale={bySession ? 'linear' : 'time'}
            domain={[start, end]}
            ticks={xTicks}
            tickFormatter={xFormatter}
            tick={tick}
            tickLine={false}
            axisLine={{ stroke: stripe }}
            interval="preserveStartEnd"
            minTickGap={18}
            tickMargin={8}
          />
          <YAxis
            width="auto"
            tickFormatter={(v) => formatCurrencyCompact(v / 100, displayEUR)}
            domain={[ticks[0], ticks[ticks.length - 1]]}
            ticks={ticks}
            tickCount={5}
            tick={tick}
            tickLine={false}
            axisLine={false}
            tickMargin={5}
          />
          {tail && (
            <ReferenceArea
              x1={tail.from}
              x2={tail.to}
              fill="#8aacc7"
              fillOpacity={0.07}
              stroke="none"
              label={
                tailWide
                  ? {
                      value: 'No sessions since ' + periodDate(tail.since, false, true),
                      position: 'insideTopRight',
                      fill: '#b8cde1',
                      fontSize: 12,
                    }
                  : undefined
              }
            />
          )}
          <Tooltip content={tip} cursor={{ stroke: '#8edcff', strokeDasharray: '4 4' }} />
          <ReferenceLine y={0} stroke="#8aacc7" strokeWidth={1} />
          <Area
            type="linear"
            dataKey={bySession ? 'cumulative' : 'solid'}
            stroke="#68d6ff"
            strokeWidth={3}
            fill={'url(#' + gradient + ')'}
            isAnimationActive={false}
            dot={bySession ? { r: 2.5, fill: '#68d6ff', strokeWidth: 0 } : false}
            activeDot={{ r: 4, fill: '#dbf6ff' }}
          />
          {tail && (
            <Area
              type="linear"
              dataKey="tail"
              stroke="#8aacc7"
              strokeWidth={2}
              strokeDasharray="6 5"
              fill="none"
              isAnimationActive={false}
              activeDot={false}
            />
          )}
          {marker(peak, 'Peak', '#67cba0', true)}
          {marker(lowest, 'Low', '#f68487', false)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
