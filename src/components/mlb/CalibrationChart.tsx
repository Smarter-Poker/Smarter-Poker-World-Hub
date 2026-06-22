import React from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface CalibrationBucket {
  bucket_label: string;
  predicted_prob: number;
  actual_win_rate: number;
  n: number;
}

interface CalibrationChartProps {
  data: CalibrationBucket[];
}

// Perfect calibration diagonal: 11 points from (0,0) to (100,100)
const PERFECT_LINE = Array.from({ length: 11 }, (_, i) => ({
  x: i * 10,
  y: i * 10,
  // Dummy n so CustomDot can skip coloring
  n: -1,
  bucket_label: '',
  predicted_prob: i * 10,
  actual_win_rate: i * 10,
}));

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  // Diagonal reference dots — render as small dim circles
  if (payload.n === -1) {
    return <circle cx={cx} cy={cy} r={2} fill="#3d4f5f" opacity={0.6} />;
  }
  const radius = Math.max(5, Math.min(15, Math.sqrt(payload.n / 6)));
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
  if (!d || d.n === -1) return null;
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
        Predicted:{' '}
        <span style={{ color: '#F8FAFC', fontWeight: 700 }}>
          {d.predicted_prob.toFixed(1)}%
        </span>
      </div>
      <div style={{ color: '#94A3B8' }}>
        Actual:{' '}
        <span style={{ color: '#00D4FF', fontWeight: 700 }}>
          {d.actual_win_rate.toFixed(1)}%
        </span>
      </div>
      <div style={{ color: '#94A3B8' }}>
        Delta:{' '}
        <span
          style={{
            color: delta >= 0 ? '#00FF88' : '#FF4444',
            fontWeight: 700,
          }}
        >
          {delta > 0 ? '+' : ''}
          {delta.toFixed(1)}%
        </span>
      </div>
      <div style={{ color: '#64748B', marginTop: 4, fontSize: 11 }}>
        n = {d.n} bets
      </div>
    </div>
  );
};

export default function CalibrationChart({ data }: CalibrationChartProps) {
  if (!data || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, 100]}
          stroke="#64748B"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
          label={{
            value: 'Predicted %',
            position: 'insideBottom',
            offset: -12,
            fill: '#64748B',
            fontSize: 10,
          }}
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[0, 100]}
          stroke="#64748B"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={38}
          tickFormatter={(v) => `${v}%`}
          label={{
            value: 'Actual %',
            angle: -90,
            position: 'insideLeft',
            fill: '#64748B',
            fontSize: 10,
            dx: 12,
          }}
        />
        <Tooltip content={<CustomTooltip />} />
        {/* Perfect calibration diagonal — rendered first so data dots sit on top */}
        <Scatter
          data={PERFECT_LINE}
          shape={<CustomDot />}
          isAnimationActive={false}
          line={{ stroke: '#3d4f5f', strokeWidth: 1.5, strokeDasharray: '5 5' }}
          lineType="fitting"
        />
        {/* Actual calibration data points */}
        <Scatter
          data={data.map((d) => ({
            ...d,
            x: d.predicted_prob,
            y: d.actual_win_rate,
          }))}
          shape={<CustomDot />}
          isAnimationActive={false}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
