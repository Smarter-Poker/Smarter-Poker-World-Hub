/**
 * MultiTableTracker — GTO Wizard-Style Multi-Table Session Dashboard
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Track performance across multiple simultaneous tables. Aggregate stats,
 * per-table breakdowns, and cross-table analysis.
 */
import React, { useState, useMemo } from 'react';

const TABLES = [
  {
    id: 1, name: 'Table 1 — NL200', stake: 'NL200', hands: 142, vpip: 24.3, pfr: 19.1, af: 3.2,
    winRate: 8.4, profit: 168.00, status: 'active', players: 6,
    recentHands: ['+$45', '-$12', '+$8', '+$22', '-$35', '+$15', '-$6', '+$18'],
  },
  {
    id: 2, name: 'Table 2 — NL200', stake: 'NL200', hands: 128, vpip: 22.8, pfr: 18.5, af: 2.9,
    winRate: -3.2, profit: -41.00, status: 'active', players: 6,
    recentHands: ['-$18', '+$5', '-$22', '+$10', '-$8', '-$15', '+$12', '-$5'],
  },
  {
    id: 3, name: 'Table 3 — NL500', stake: 'NL500', hands: 95, vpip: 21.5, pfr: 17.8, af: 3.5,
    winRate: 12.6, profit: 315.00, status: 'active', players: 6,
    recentHands: ['+$120', '-$45', '+$65', '+$30', '-$20', '+$85', '-$10', '+$40'],
  },
  {
    id: 4, name: 'Table 4 — NL100', stake: 'NL100', hands: 186, vpip: 25.1, pfr: 20.4, af: 2.7,
    winRate: 5.1, profit: 51.00, status: 'paused', players: 6,
    recentHands: ['+$8', '+$12', '-$5', '+$3', '-$10', '+$15', '+$6', '-$2'],
  },
];

function parseProfit(str) {
  return parseFloat(str.replace('$', '').replace('+', ''));
}

function MiniSparkline({ data }) {
  const values = data.map(d => parseProfit(d));
  const max = Math.max(...values.map(Math.abs));
  const w = 120;
  const h = 32;
  const step = w / (values.length - 1);

  let cumulative = 0;
  const points = values.map((v, i) => {
    cumulative += v;
    return cumulative;
  });
  const pMax = Math.max(...points.map(Math.abs), 1);

  const pathD = points.map((p, i) => {
    const x = i * step;
    const y = h / 2 - (p / pMax) * (h / 2 - 2);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const lastPoint = points[points.length - 1];

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      <path d={pathD} fill="none" stroke={lastPoint >= 0 ? '#10b981' : '#ef4444'} strokeWidth={2} />
    </svg>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || '#fff' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function TableCard({ table, selected, onClick }) {
  const profitColor = table.profit >= 0 ? '#10b981' : '#ef4444';

  return (
    <div
      onClick={onClick}
      style={{
        padding: 14,
        background: selected ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        border: `1px solid ${selected ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)'}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: table.status === 'active' ? '#10b981' : '#f59e0b',
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{table.name}</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: profitColor }}>
          {table.profit >= 0 ? '+' : ''}{table.profit.toFixed(2)}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <StatBadge label="Hands" value={table.hands} />
          <StatBadge label="VPIP" value={`${table.vpip}%`} />
          <StatBadge label="PFR" value={`${table.pfr}%`} />
          <StatBadge label="AF" value={table.af} />
        </div>
        <MiniSparkline data={table.recentHands} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
        <span>Win rate: <span style={{ color: table.winRate >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{table.winRate >= 0 ? '+' : ''}{table.winRate} bb/100</span></span>
        <span>{table.players} players • {table.status}</span>
      </div>
    </div>
  );
}

function MultiTableTracker() {
  const [selectedTable, setSelectedTable] = useState(null);
  const [sortBy, setSortBy] = useState('profit');

  const aggregate = useMemo(() => {
    const totalHands = TABLES.reduce((s, t) => s + t.hands, 0);
    const totalProfit = TABLES.reduce((s, t) => s + t.profit, 0);
    const avgVPIP = TABLES.reduce((s, t) => s + t.vpip, 0) / TABLES.length;
    const avgPFR = TABLES.reduce((s, t) => s + t.pfr, 0) / TABLES.length;
    const avgAF = TABLES.reduce((s, t) => s + t.af, 0) / TABLES.length;
    const avgWinRate = TABLES.reduce((s, t) => s + t.winRate * t.hands, 0) / totalHands;
    const activeTables = TABLES.filter(t => t.status === 'active').length;
    return { totalHands, totalProfit, avgVPIP, avgPFR, avgAF, avgWinRate, activeTables, totalTables: TABLES.length };
  }, []);

  const sorted = useMemo(() => {
    return [...TABLES].sort((a, b) => {
      if (sortBy === 'profit') return b.profit - a.profit;
      if (sortBy === 'hands') return b.hands - a.hands;
      if (sortBy === 'winrate') return b.winRate - a.winRate;
      return 0;
    });
  }, [sortBy]);

  const detail = selectedTable ? TABLES.find(t => t.id === selectedTable) : null;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#3b82f6' }}>Multi-Table Tracker</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{aggregate.activeTables}/{aggregate.totalTables} active</span>
        </div>

        {/* Aggregate Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 16,
          padding: 14, background: 'rgba(59,130,246,0.06)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.15)',
        }}>
          <StatBadge label="Total Hands" value={aggregate.totalHands} color="#3b82f6" />
          <StatBadge label="Total P/L" value={`${aggregate.totalProfit >= 0 ? '+' : ''}$${aggregate.totalProfit.toFixed(0)}`} color={aggregate.totalProfit >= 0 ? '#10b981' : '#ef4444'} />
          <StatBadge label="Avg Win Rate" value={`${aggregate.avgWinRate >= 0 ? '+' : ''}${aggregate.avgWinRate.toFixed(1)}`} color={aggregate.avgWinRate >= 0 ? '#10b981' : '#ef4444'} />
          <StatBadge label="Avg VPIP" value={`${aggregate.avgVPIP.toFixed(1)}%`} />
          <StatBadge label="Avg PFR" value={`${aggregate.avgPFR.toFixed(1)}%`} />
          <StatBadge label="Avg AF" value={aggregate.avgAF.toFixed(1)} />
        </div>

        {/* Sort Controls */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', alignSelf: 'center' }}>Sort:</span>
          {[
            { id: 'profit', label: 'Profit' },
            { id: 'hands', label: 'Hands' },
            { id: 'winrate', label: 'Win Rate' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSortBy(s.id)}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: sortBy === s.id ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                color: sortBy === s.id ? '#fff' : 'rgba(255,255,255,0.6)',
                border: 'none',
              }}
            >{s.label}</button>
          ))}
        </div>

        {/* Table Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: detail ? 16 : 0 }}>
          {sorted.map(table => (
            <TableCard
              key={table.id}
              table={table}
              selected={selectedTable === table.id}
              onClick={() => setSelectedTable(selectedTable === table.id ? null : table.id)}
            />
          ))}
        </div>

        {/* Detail Panel */}
        {detail && (
          <div style={{ padding: 14, background: 'rgba(59,130,246,0.06)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', marginBottom: 10 }}>{detail.name} — Detailed Stats</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {[
                { label: 'Hands Played', value: detail.hands },
                { label: 'Win Rate', value: `${detail.winRate >= 0 ? '+' : ''}${detail.winRate} bb/100` },
                { label: 'Profit/Loss', value: `${detail.profit >= 0 ? '+' : ''}$${detail.profit.toFixed(2)}` },
                { label: 'VPIP / PFR', value: `${detail.vpip}% / ${detail.pfr}%` },
                { label: 'Aggression Factor', value: detail.af },
                { label: 'Status', value: detail.status.toUpperCase() },
              ].map(s => (
                <div key={s.label} style={{ padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Recent Results</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {detail.recentHands.map((h, i) => {
                  const val = parseProfit(h);
                  return (
                    <span key={i} style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
                      background: val >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      color: val >= 0 ? '#10b981' : '#ef4444',
                    }}>{h}</span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Multi-Table Tracker failed to load: {err.message}</div>;
  }
}

export default MultiTableTracker;
