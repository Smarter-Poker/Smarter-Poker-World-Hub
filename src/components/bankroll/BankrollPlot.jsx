import { useId } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartTicks } from '../../lib/bankroll/analyticsView.mjs';
import { money, periodDate } from './analyticsDisplay';
import styles from './BankrollAnalytics.module.css';

const tick = { fill: '#b8cde1', fontSize: 12 };
const stripe = '#304960';
const labels = { cumulative: 'Running Net', cents: 'Net Result', count: 'Sessions' };

export default function BankrollPlot({ mode, model, bins, displayEUR }) {
  const gradient = 'bankroll-' + useId().replace(/:/g, '');
  const fmt = (value) => money(Number(value), displayEUR, true);
  const monthly = model.period === 'Month';
  const isDistribution = mode === 'histogram';
  const categories = model.categories;
  const dateLabel = (date) => periodDate(date, monthly);
  const binLabel = (b) =>
    b.low === b.high
      ? money(b.low, displayEUR)
      : money(b.low, displayEUR) + ' to ' + money(b.high, displayEUR);
  const tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div className={styles.tooltip}>
        <strong>
          {isDistribution
            ? binLabel(row)
            : mode === 'donut'
              ? row.label
              : periodDate(row.date, monthly, true)}
        </strong>
        {mode === 'donut' ? (
          <span>
            Category Net <b>{fmt(row.cents)}</b>
          </span>
        ) : (
          payload.map((item) => (
            <span key={item.dataKey}>
              {labels[item.dataKey] || categories.find((c) => c.key === item.dataKey)?.label}{' '}
              <b>{isDistribution ? item.value : fmt(item.value)}</b>
            </span>
          ))
        )}
      </div>
    );
  };
  if (mode === 'donut')
    return (
      <div className={styles.donut}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer>
            <Pie
              data={categories}
              dataKey="magnitude"
              nameKey="label"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={categories.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {categories.map((cat) => (
                <Cell key={cat.key} fill={cat.color} />
              ))}
            </Pie>
            <Tooltip content={tip} />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.donutValue}>
          <small>Net Result</small>
          <strong>{fmt(model.total)}</strong>
        </div>
      </div>
    );
  const isLine = mode === 'line';
  const Chart = isLine ? AreaChart : BarChart;
  const rows = isDistribution ? bins : model.series;
  const yFormat = (value) => (isDistribution ? String(value) : money(value, displayEUR, false, true));
  let minimum = 0;
  let maximum = 0;
  for (const row of rows) {
    if (mode === 'stacked') {
      let positive = 0,
        negative = 0;
      for (const category of categories) {
        const amount = row[category.key] || 0;
        if (amount > 0) positive += amount;
        else negative += amount;
      }
      maximum = Math.max(positive, maximum);
      minimum = Math.min(negative, minimum);
    } else {
      const amount = row[isLine ? 'cumulative' : isDistribution ? 'count' : 'cents'];
      minimum = Math.min(minimum, amount);
      maximum = Math.max(maximum, amount);
    }
  }
  const ticks = chartTicks(minimum, maximum);
  const xFormatter = (v) => (isDistribution ? money(v, displayEUR, false, true) : dateLabel(v));
  return (
    <div className={styles.plot}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart
          data={rows}
          margin={{ top: 12, bottom: 2, left: 0, right: 14 }}
          stackOffset={mode === 'stacked' ? 'sign' : undefined}
          accessibilityLayer
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#36baff" stopOpacity=".55" />
              <stop offset="100%" stopColor="#085bb4" stopOpacity=".04" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={stripe} strokeDasharray="3 5" />
          <XAxis
            dataKey={isDistribution ? 'low' : 'date'}
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
            tickFormatter={yFormat}
            domain={[ticks[0], ticks[ticks.length - 1]]}
            ticks={ticks}
            allowDecimals={!isDistribution}
            tickCount={5}
            tick={tick}
            tickLine={false}
            axisLine={false}
            tickMargin={5}
          />
          <Tooltip
            content={tip}
            cursor={isLine ? { stroke: '#8edcff', strokeDasharray: '4 4' } : { fill: '#72aef318' }}
          />
          {!isDistribution && <ReferenceLine y={0} stroke="#8aacc7" strokeWidth={1} />}
          {isLine && (
            <Area
              type="linear"
              dataKey="cumulative"
              stroke="#68d6ff"
              strokeWidth={3}
              fill={'url(#' + gradient + ')'}
              isAnimationActive={false}
              dot={rows.length === 1 ? { r: 4 } : false}
              activeDot={{ r: 4, fill: '#dbf6ff' }}
            />
          )}
          {mode === 'bar' && (
            <Bar dataKey="cents" maxBarSize={34} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell key={row.date} fill={row.cents < 0 ? '#f68487' : '#67cba0'} />
              ))}
            </Bar>
          )}
          {mode === 'stacked' &&
            categories.map((cat) => (
              <Bar
                key={cat.key}
                dataKey={cat.key}
                name={cat.label}
                stackId="result"
                fill={cat.color}
                maxBarSize={35}
                isAnimationActive={false}
              />
            ))}
          {isDistribution && (
            <Bar dataKey="count" fill="#4ea9f5" maxBarSize={52} isAnimationActive={false} />
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
