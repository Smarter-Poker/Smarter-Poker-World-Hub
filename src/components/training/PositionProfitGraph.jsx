/**
 * PositionProfitGraph — GTO Wizard-Style Position-by-Position P&L Tracker
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Visualize profit/loss breakdown by position with bar chart, trend lines,
 * and detailed stats per seat.
 */
import React, { useState, useMemo } from 'react';

const POSITION_DATA = {
  'Last 1K': {
    UTG: { hands: 165, profit: -42, vpip: 14.2, pfr: 12.1, bbWon: -2.5 },
    MP:  { hands: 170, profit: 28, vpip: 17.8, pfr: 15.3, bbWon: 1.6 },
    CO:  { hands: 168, profit: 95, vpip: 25.6, pfr: 22.1, bbWon: 5.7 },
    BTN: { hands: 172, profit: 184, vpip: 38.2, pfr: 32.5, bbWon: 10.7 },
    SB:  { hands: 163, profit: -78, vpip: 32.4, pfr: 24.8, bbWon: -4.8 },
    BB:  { hands: 162, profit: -95, vpip: 28.1, pfr: 8.6, bbWon: -5.9 },
  },
  'Last 5K': {
    UTG: { hands: 830, profit: -125, vpip: 14.8, pfr: 12.5, bbWon: -1.5 },
    MP:  { hands: 845, profit: 180, vpip: 18.2, pfr: 15.8, bbWon: 2.1 },
    CO:  { hands: 838, profit: 420, vpip: 26.1, pfr: 22.8, bbWon: 5.0 },
    BTN: { hands: 855, profit: 890, vpip: 39.5, pfr: 33.1, bbWon: 10.4 },
    SB:  { hands: 820, profit: -310, vpip: 33.1, pfr: 25.2, bbWon: -3.8 },
    BB:  { hands: 812, profit: -455, vpip: 29.5, pfr: 9.2, bbWon: -5.6 },
  },
  'Last 10K': {
    UTG: { hands: 1660, profit: -180, vpip: 15.1, pfr: 12.8, bbWon: -1.1 },
    MP:  { hands: 1690, profit: 410, vpip: 18.5, pfr: 16.1, bbWon: 2.4 },
    CO:  { hands: 1672, profit: 920, vpip: 26.8, pfr: 23.2, bbWon: 5.5 },
    BTN: { hands: 1710, profit: 1850, vpip: 40.1, pfr: 33.8, bbWon: 10.8 },
    SB:  { hands: 1640, profit: -580, vpip: 33.8, pfr: 25.8, bbWon: -3.5 },
    BB:  { hands: 1628, profit: -920, vpip: 30.2, pfr: 9.5, bbWon: -5.7 },
  },
  'All Time': {
    UTG: { hands: 8200, profit: -650, vpip: 15.3, pfr: 13.0, bbWon: -0.8 },
    MP:  { hands: 8400, profit: 2100, vpip: 18.8, pfr: 16.4, bbWon: 2.5 },
    CO:  { hands: 8350, profit: 4800, vpip: 27.2, pfr: 23.5, bbWon: 5.7 },
    BTN: { hands: 8550, profit: 9200, vpip: 40.5, pfr: 34.2, bbWon: 10.8 },
    SB:  { hands: 8100, profit: -2800, vpip: 34.2, pfr: 26.1, bbWon: -3.5 },
    BB:  { hands: 8000, profit: -4650, vpip: 30.8, pfr: 9.8, bbWon: -5.8 },
  },
};

const PERIODS = Object.keys(POSITION_DATA || {});
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const POS_COLORS = { UTG: '#ef4444', MP: '#f59e0b', CO: '#10b981', BTN: '#3b82f6', SB: '#8b5cf6', BB: '#ec4899' };

function PositionProfitGraph() {
  const [period, setPeriod] = useState('Last 5K');
  const [selectedPos, setSelectedPos] = useState(null);
  const [metric, setMetric] = useState('profit'); // profit | bbWon

  const data = POSITION_DATA[period];

  const maxVal = useMemo(() => {
    return Math.max(...POSITIONS.map(p => Math.abs(metric === 'profit' ? data[p].profit : data[p].bbWon)));
  }, [data, metric]);

  const totalProfit = useMemo(() => POSITIONS.reduce((s, p) => s + data[p].profit, 0), [data]);
  const totalHands = useMemo(() => POSITIONS.reduce((s, p) => s + data[p].hands, 0), [data]);

  const detail = selectedPos ? data[selectedPos] : null;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#22d3ee' }}>Position Profit Graph</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {['profit', 'bbWon'].map(m => (
              <button key={m} onClick={() => setMetric(m)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: metric === m ? '#22d3ee' : 'rgba(255,255,255,0.06)',
                color: metric === m ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
              }}>{m === 'profit' ? '$ Profit' : 'bb/100'}</button>
            ))}
          </div>
        </div>

        {/* Period Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: period === p ? '#22d3ee' : 'rgba(255,255,255,0.06)',
              color: period === p ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{p}</button>
          ))}
        </div>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: 10, background: 'rgba(34,211,238,0.06)', borderRadius: 8, border: '1px solid rgba(34,211,238,0.12)' }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: totalProfit >= 0 ? '#10b981' : '#ef4444' }}>{totalProfit >= 0 ? '+' : ''}${totalProfit}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Total P&L</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{totalHands.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Total Hands</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#22d3ee' }}>{((totalProfit / totalHands) * 100).toFixed(1)}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>bb/100 Overall</div>
          </div>
        </div>

        {/* Bar Chart */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 160, marginBottom: 16, padding: '0 8px' }}>
          {POSITIONS.map(pos => {
            const val = metric === 'profit' ? data[pos].profit : data[pos].bbWon;
            const height = Math.abs(val) / (maxVal || 1) * 120;
            const isPositive = val >= 0;
            return (
              <div key={pos} onClick={() => setSelectedPos(selectedPos === pos ? null : pos)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isPositive ? '#10b981' : '#ef4444', marginBottom: 4 }}>
                  {metric === 'profit' ? `${isPositive ? '+' : ''}$${val}` : `${isPositive ? '+' : ''}${val}`}
                </div>
                <div style={{
                  width: '100%', maxWidth: 50, height, borderRadius: '4px 4px 0 0',
                  background: isPositive
                    ? `linear-gradient(180deg, ${POS_COLORS[pos]}, ${POS_COLORS[pos]}88)`
                    : `linear-gradient(0deg, ${POS_COLORS[pos]}, ${POS_COLORS[pos]}88)`,
                  border: selectedPos === pos ? '2px solid #fff' : 'none',
                  transition: 'height 0.3s ease',
                }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: POS_COLORS[pos], marginTop: 6 }}>{pos}</div>
              </div>
            );
          })}
        </div>

        {/* Detail Panel */}
        {detail && (
          <div style={{ padding: 14, background: 'rgba(34,211,238,0.06)', borderRadius: 10, border: '1px solid rgba(34,211,238,0.15)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: POS_COLORS[selectedPos], marginBottom: 10 }}>{selectedPos} — Detailed Stats</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {[
                { label: 'Hands', value: detail.hands.toLocaleString() },
                { label: 'Profit', value: `${detail.profit >= 0 ? '+' : ''}$${detail.profit}` },
                { label: 'bb/100', value: `${detail.bbWon >= 0 ? '+' : ''}${detail.bbWon}` },
                { label: 'VPIP', value: `${detail.vpip}%` },
                { label: 'PFR', value: `${detail.pfr}%` },
                { label: 'VPIP-PFR Gap', value: `${(detail.vpip - detail.pfr).toFixed(1)}%` },
              ].map(s => (
                <div key={s.label} style={{ padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Position Profit Graph failed to load: {err.message}</div>;
  }
}

export default PositionProfitGraph;
