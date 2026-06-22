import React from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Line,
  ComposedChart,
} from 'recharts';

export interface CalibrationBucket {
  bucket_label: string;   // e.g. "45-50%"
  predicted_prob: number; // midpoint of bucket, e.g. 47.5
  actual_win_rate: number; // realized win rate in this bucket
  n: number;             // sample size
}

interface CalibrationChartProps {
  data: CalibrationBucket[];
}

const perfectLine = Array.from({ length: 11 }, (_, i) => ({
  predicted_prob: i * 10,
  perfect: i * 10,
}));

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  const radius = Math.max(4, Math.min(14, Math.sqrt(payload.n / 8)));
  const delta = payload.actual_win_rate - payload.predicted_prob;
  const color = Math.abs(delta) < 4 ? '#00D4FF' : delta > 0 ? '#00FF88' : '#FF4444';
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={color}
      fillOpacity={0.85}
      stroke="#0a0a15"
      strokeWidth={1.5}
    />
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const delta = d.actual_win_rate - d.predicted_prob;
  return (
    <div
      style={{
        background: '#0a0a15',
        border: '1px solid #00D4FF',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '12px',
      }}
    >
      <div style={{ color: '#F8FAFC', fontWeight: 700, marginBottom: 6 }}>
        {d.bucket_label}
      </div>
      <div style={{ color: '#94A3B8' }}>
        Predicted: <span style={{ color: '#F8FAFC', fontWeight: 700 }}>{d.predicted_prob.toFixed(1)}%</span>
      </div>
      <div style={{ color: '#94A3B8' }}>
        Actual: <span style={{ color: '#00D4FF', fontWeight: 700 }}>{d.actual_win_rate.toFixed(1)}%</span>
      </div>
      <div style={{ color: '#94A3B8' }}>
        Delta: <span style={{ color: delta >= 0 ? '#00FF88' : '#FF4444', fontWeight: 700 }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
      </div>
      <div style={{ color: '#64748B', marginTop: 4, fontSize: 11 }}>n = {d.n} bets</div>
    </div>
  );
};

export default function CalibrationChart({ data }: CalibrationChartProps) {
  if (!data || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" />
        <XAxis
          type="number"
          dataKey="predicted_prob"
          domain={[0, 100]}
          stroke="#64748B"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
          label={{ value: 'Predicted %', position: 'insideBottom', offset: -2, fill: '#64748B', fontSize: 10 }}
        />
        <YAxis
          type="number"
          dataKey="actual_win_rate"
          domain={[0, 100]}
          stroke="#64748B"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={38}
          tickFormatter={(v) => `${v}%`}
          label={{ value: 'Actual %', angle: -90, position: 'insideLeft', fill: '#64748B', fontSize: 10, dx: 12 }}
        />
        {/* Perfect calibration reference line */}
        <Line
          data={perfectLine}
          type="linear"
          dataKey="perfect"
          stroke="#3d4f5f"
          strokeWidth={1.5}
          strokeDasharray="5 5"
          dot={false}
          isAnimationActive={false}
          legendType="none"
        />
        <Scatter
          data={data}
          shape={<CustomDot />}
          isAnimationActive={false}
        />
        <Tooltip content={<CustomTooltip />} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
