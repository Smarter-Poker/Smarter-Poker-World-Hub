import React, { useEffect, useState } from 'react';
import Head from 'next/head';

const STATUS_COLORS = {
  READY: '#00c853',
  ERROR: '#ff1744',
  BUILDING: '#ffab00',
  QUEUED: '#90a4ae',
  CANCELED: '#616161',
};

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '20px 24px',
      minWidth: 140,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || '#e0e0e0', fontFamily: 'monospace' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#90a4ae', marginTop: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
    </div>
  );
}

function DeployRow({ deploy }) {
  const stateColor = STATUS_COLORS[deploy.state] || '#90a4ae';
  const age = Math.round((Date.now() - deploy.createdAt) / 60000);
  const ageStr = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <td style={{ padding: '10px 12px' }}>
        <span style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          color: '#fff',
          background: stateColor,
          minWidth: 70,
          textAlign: 'center',
        }}>
          {deploy.state}
        </span>
      </td>
      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 13, color: '#b0bec5' }}>
        {deploy.sha}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 13, color: deploy.isAutofix ? '#ffab00' : '#e0e0e0', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {deploy.isAutofix && <span style={{ marginRight: 6, fontSize: 10, background: '#ffab00', color: '#000', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>AUTOFIX</span>}
        {deploy.message.substring(0, 60)}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#78909c', textAlign: 'right' }}>
        {ageStr}
      </td>
    </tr>
  );
}

export default function AutofixDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/deploy-status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Head>
        <title>Autofix Pipeline | Admin | Smarter.Poker</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        <style>{`
          body { background: #0a0e17; color: #e0e0e0; font-family: 'Inter', -apple-system, sans-serif; margin: 0; }
        `}</style>
      </Head>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#fff' }}>
              Autofix Pipeline
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#78909c' }}>
              Autonomous build error detection and repair
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 20,
              background: data?.pipeline?.status === 'healthy'
                ? 'rgba(0,200,83,0.15)' : 'rgba(255,171,0,0.15)',
              border: `1px solid ${data?.pipeline?.status === 'healthy' ? 'rgba(0,200,83,0.3)' : 'rgba(255,171,0,0.3)'}`,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: data?.pipeline?.status === 'healthy' ? '#00c853' : '#ffab00',
                boxShadow: `0 0 8px ${data?.pipeline?.status === 'healthy' ? '#00c853' : '#ffab00'}`,
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: data?.pipeline?.status === 'healthy' ? '#00c853' : '#ffab00' }}>
                {data?.pipeline?.status === 'healthy' ? 'All Clear' : 'Active'}
              </span>
            </div>
            {lastRefresh && (
              <div style={{ fontSize: 11, color: '#546e7a', marginTop: 4 }}>
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ padding: 16, background: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)', borderRadius: 8, marginBottom: 24, color: '#ff1744', fontSize: 13 }}>
            Error: {error}
          </div>
        )}

        {/* Stats Cards */}
        {data && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
            <StatCard label="Deploys" value={data.stats.totalDeploys} />
            <StatCard label="Errors" value={data.stats.errorCount} color={data.stats.errorCount > 0 ? '#ff1744' : '#00c853'} />
            <StatCard label="Autofixes" value={data.stats.autofixCount} color="#ffab00" />
            <StatCard label="Success Rate" value={`${data.stats.successRate}%`} color={data.stats.successRate >= 80 ? '#00c853' : '#ff1744'} />
            <StatCard label="Poll Interval" value="2m" color="#42a5f5" />
          </div>
        )}

        {/* Pipeline Config */}
        {data?.pipeline && (
          <div style={{
            background: 'linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: 20, marginBottom: 32,
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#78909c', textTransform: 'uppercase', letterSpacing: 1 }}>Pipeline Configuration</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {Object.entries(data.pipeline).map(([key, val]) => (
                <div key={key} style={{ fontSize: 13 }}>
                  <span style={{ color: '#78909c' }}>{key}: </span>
                  <span style={{ color: '#e0e0e0', fontWeight: 500 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Deployments */}
        {data?.deployments && (
          <div style={{
            background: 'linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, overflow: 'hidden', marginBottom: 32,
          }}>
            <h3 style={{ margin: 0, padding: '16px 20px', fontSize: 14, color: '#78909c', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              Recent Deployments
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {data.deployments.map((d) => (
                  <DeployRow key={d.id} deploy={d} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Autofix Commit History */}
        {data?.autofixCommits?.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <h3 style={{ margin: 0, padding: '16px 20px', fontSize: 14, color: '#78909c', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              Autofix Commit History
            </h3>
            {data.autofixCommits.map((c, i) => (
              <div key={i} style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#ffab00', minWidth: 80 }}>{c.sha}</span>
                <span style={{ fontSize: 13, color: '#e0e0e0', flex: 1 }}>{c.message}</span>
                <span style={{ fontSize: 11, color: '#546e7a', whiteSpace: 'nowrap' }}>
                  {c.date ? new Date(c.date).toLocaleString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {loading && !data && (
          <div style={{ textAlign: 'center', padding: 60, color: '#78909c' }}>Loading pipeline data...</div>
        )}
      </div>
    </>
  );
}
