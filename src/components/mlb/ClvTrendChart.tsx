import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface ClvPoint {
  date: string;
  rolling_clv: number;
}

interface ClvTrendChartProps {
  data: ClvPoint[];
}

const fmtDate = (v: string): string => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

export default function ClvTrendChart({ data }: ClvTrendChartProps) {
  const latest = data.length > 0 ? data[data.length - 1].rolling_clv : 0;
  const color = latest >= 0 ? '#00D4FF' : '#FF4444';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
          tickFormatter={(v) => `${Number(v).toFixed(1)}`}
        />
        <ReferenceLine y={0} stroke="#3d4f5f" strokeDasharray="4 4" />
        <Tooltip
          contentStyle={{
            background: '#0a0a15',
            border: `1px solid ${color}`,
            borderRadius: '8px',
            fontSize: '12px',
          }}
          itemStyle={{ color, fontWeight: 700 }}
          labelStyle={{ color: '#F8FAFC', marginBottom: '4px', fontWeight: 600 }}
          formatter={(v: number) => [`${v > 0 ? '+' : ''}${Number(v).toFixed(2)} pts`, '14-Day Avg CLV']}
          labelFormatter={(label) => `📅 ${fmtDate(String(label))}`}
        />
        <Line
          type="monotone"
          dataKey="rolling_clv"
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, fill: color, stroke: '#0a0a15', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
