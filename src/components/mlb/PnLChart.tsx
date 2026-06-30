import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface PnLDataPoint {
  date: string;
  pnl: number;
  cum_pnl: number;
  bets: number;
  roi: number;
}

interface PnLChartProps {
  data: PnLDataPoint[];
}

const fmtDate = (v: string): string => {
  if (!v) return '--';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');

export default function PnLChart({ data }: PnLChartProps) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.cum_pnl), 0);
  const min = Math.min(...data.map((d) => d.cum_pnl), 0);
  const offset = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
            <stop offset={offset} stopColor="#00D4FF" stopOpacity={0.35} />
            <stop offset={offset} stopColor="#FF4444" stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="#64748B"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
          tickFormatter={fmtDate}
        />
        <YAxis
          stroke="#64748B"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={42}
          tickFormatter={(val) => `${val}u`}
        />
        <ReferenceLine y={0} stroke="#3d4f5f" strokeDasharray="4 4" />
        <Tooltip
          contentStyle={{
            background: '#0a0a15',
            border: `1px solid #3d4f5f`,
            borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)',
            fontSize: '12px',
          }}
          itemStyle={{ color: '#00D4FF', fontWeight: 700 }}
          labelStyle={{ color: '#F8FAFC', marginBottom: '4px', fontWeight: 600 }}
          formatter={(value: number, _name: string, props: any) => {
            const p = props?.payload || {};
            const daySign = p.pnl >= 0 ? '+' : '';
            return [
              `${Number(value).toFixed(2)}u  (day ${daySign}${Number(p.pnl).toFixed(2)}u · ${fmtInt(p.bets)} bets)`,
              'Cumulative P&L',
            ];
          }}
          labelFormatter={(label) => `📅 ${fmtDate(String(label))}`}
        />
        <Area
          type="monotone"
          dataKey="cum_pnl"
          stroke="#00D4FF"
          strokeWidth={2.5}
          fillOpacity={1}
          fill="url(#splitColor)"
          activeDot={{ r: 5, fill: '#00D4FF', stroke: '#0a0a15', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
