/**
 * GameTrendsDashboard — Shows which game types are growing/shrinking
 * Displays trend arrows, percentages, and mini-bars for game types.
 */
import { useState, useEffect } from 'react';
import { eventBus, EventType } from '../../engine/EventBus';

function TrendIcon({ trend, changePct }) {
  if (trend === 'up') return <span style={{ color: '#4ade80', fontWeight: 'bold' }}>▲ +{changePct}%</span>;
  if (trend === 'down') return <span style={{ color: '#f87171', fontWeight: 'bold' }}>▼ {changePct}%</span>;
  // BUG FIX: /api/poker/game-trends emits four values — 'up', 'down', 'stable' AND
  // 'new' (a game type that just appeared, the most interesting signal the endpoint
  // produces). 'new' fell through to "— Stable", i.e. it was reported as unchanged.
  if (trend === 'new') return <span style={{ color: '#00d4ff', fontWeight: 'bold' }}>NEW</span>;
  return <span style={{ color: '#64748b' }}>— Stable</span>;
}

export default function GameTrendsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // BUG FIX: there was no error state — a failed or 500 response rendered the full
  // chrome with "0 tables active" and an empty list, indistinguishable from a
  // genuinely empty dataset.
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const fetchTrends = () => {
      fetch('/api/poker/game-trends', { signal: controller.signal })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(d => { if (mounted) { setData(d); setError(null); setLoading(false); } })
        .catch(e => {
          if (mounted && e.name !== 'AbortError') {
            setError(e?.message || 'Could not load trends');
            setLoading(false);
          }
        });
    };

    fetchTrends();

    const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
      if (e?.payload?.entity === 'live_tables') {
        fetchTrends();
      }
    });

    return () => {
      mounted = false;
      controller.abort();
      if (typeof unsub === 'function') unsub();
    };
  }, [reloadKey]);

  if (loading) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
        borderRadius: 16, padding: 24, border: '1px solid rgba(0,212,255,0.15)',
      }}>
        <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>Loading trends...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
        borderRadius: 16, padding: 24, border: '1px solid rgba(245,158,11,0.25)',
      }}>
        <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 16 }}>Game Type Trends</h3>
        <div style={{ color: '#f59e0b', fontSize: 13, marginBottom: 14 }}>
          Trend data could not be loaded.
        </div>
        <button
          onClick={() => { setError(null); setLoading(true); setReloadKey(k => k + 1); }}
          style={{
            padding: '8px 16px', borderRadius: 8, background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const trends = data?.trends || [];
  // BUG FIX: a row missing current_tables made Math.max return NaN, which propagated
  // into every bar's width. Coerce once, here.
  const tableCount = (t) => Number(t?.current_tables) || 0;
  const maxTables = Math.max(...trends.map(tableCount), 1);

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
      borderRadius: 16, padding: 20, border: '1px solid rgba(0,212,255,0.15)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: 16 }}>Game Type Trends</h3>
        <div style={{ color: '#64748b', fontSize: 12 }}>
          {data?.total_games_now || 0} tables active
        </div>
      </div>

      {!data?.has_historical_data && (
        <div style={{
          background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12,
          color: '#fbbf24',
        }}>
          Historical comparison available after 7 days of data collection.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {trends.slice(0, 12).map((trend, idx) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            transition: 'all 0.2s ease',
          }}>
            {/* Rank */}
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: idx < 3 ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: idx < 3 ? '#00d4ff' : '#64748b', fontSize: 12, fontWeight: 'bold',
            }}>
              {idx + 1}
            </div>

            {/* Game name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {trend.game}
              </div>
              <div style={{ color: '#64748b', fontSize: 11 }}>
                {tableCount(trend)} table{tableCount(trend) !== 1 ? 's' : ''} running
              </div>
            </div>

            {/* Bar */}
            <div style={{ width: 80, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{
                width: `${(tableCount(trend) / maxTables) * 100}%`,
                height: '100%', borderRadius: 3,
                background: trend.trend === 'up' ? '#4ade80' : trend.trend === 'down' ? '#f87171' : '#00d4ff',
                transition: 'width 0.5s ease',
              }} />
            </div>

            {/* Trend */}
            <div style={{ width: 80, textAlign: 'right', fontSize: 12 }}>
              <TrendIcon trend={trend.trend} changePct={trend.change_pct} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
