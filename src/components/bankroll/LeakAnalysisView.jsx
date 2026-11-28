/**
 * LEAK ANALYSIS VIEW (?view=leaks)
 *
 * The financial leaks the ledger shows: stakes with negative results, losing
 * time blocks, non-poker play eating the roll, and trips whose costs beat
 * their profit (src/lib/bankroll/leakDetection.ts).
 *
 * This view existed in the page from the start but no address reached it:
 * resolveBankrollView sent ?view=leaks to the dashboard, while the dashboard
 * paid for the analysis (a dozen ledger reads) on every load to feed it. It
 * now reads the analysis itself, only while it is open, and it says which of
 * "loading", "could not read" and "nothing found" is true instead of showing
 * "No Leaks Detected" for all three.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { runLeakAnalysis } from '../../lib/bankroll/leakDetection';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';

const RISK_TONE = {
  HIGH: { color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', word: 'Alert', label: 'High Risk' },
  MEDIUM: { color: '#61d0e8', background: 'rgba(97, 208, 232, 0.1)', word: 'Warning', label: 'Medium Risk' },
  LOW: { color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)', word: 'OK', label: 'Low Risk' },
};

export default function LeakAnalysisView({ userId, locationId = null, locationName = null, displayEUR = false, analyze = runLeakAnalysis }) {
  const [state, setState] = useState({ status: userId ? 'loading' : 'signed-out', analysis: null });
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    if (!userId) { setState({ status: 'signed-out', analysis: null }); return; }
    setState((prev) => ({ status: 'loading', analysis: prev.analysis }));
    try {
      const analysis = await analyze(userId, locationId || undefined);
      if (id === request.current) setState({ status: 'ready', analysis });
    } catch (error) {
      console.warn('[LeakAnalysis] could not read the ledger:', error);
      if (id === request.current) setState({ status: 'failed', analysis: null });
    }
  }, [userId, locationId, analyze]);

  useEffect(() => {
    load();
    // A save, delete or adjustment anywhere on the page changes the ledger.
    window.addEventListener('bankroll-updated', load);
    return () => {
      request.current += 1;
      window.removeEventListener('bankroll-updated', load);
    };
  }, [load]);

  const { status, analysis } = state;
  const leaks = analysis?.topLeaks || [];
  const tone = RISK_TONE[analysis?.leakRisk] || RISK_TONE.LOW;

  return (
    <div className="sd-panel" style={{ padding: 16 }} data-testid="leak-analysis">
      <h2 className="sd-section-title">Leak Analysis</h2>
      <p style={styles.scope}>{locationName ? `At ${locationName}` : 'All Locations'} · All Recorded Sessions</p>

      {status === 'signed-out' && <p role="status" style={styles.muted}>Sign In To See Where Your Bankroll Is Leaking.</p>}

      {status === 'loading' && !analysis && <p role="status" style={styles.muted}>Reading Your Ledger…</p>}

      {status === 'failed' && (
        <div role="alert" style={styles.failed}>
          <p style={{ margin: '0 0 10px', color: '#fca5a5', fontWeight: 600 }}>Could Not Read Your Ledger.</p>
          <button type="button" className="sd-button" onClick={load}>Retry</button>
        </div>
      )}

      {analysis && leaks.length === 0 && (
        <div style={{ padding: '32px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#22c55e', margin: '0 0 8px' }}>No Leaks Detected</p>
          <p style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.6)', margin: 0 }}>Keep Logging Sessions To Build Your Analysis History.</p>
        </div>
      )}

      {analysis && leaks.length > 0 && (
        <div aria-busy={status === 'loading' || undefined}>
          <div style={{ ...styles.risk, background: tone.background }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: tone.color }}>{tone.word}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: tone.color }}>{tone.label}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                Total Leak Amount: {formatCurrency(analysis.totalLeakAmount || 0, displayEUR)}
              </div>
            </div>
          </div>
          <ul style={styles.list}>
            {leaks.map((leak) => (
              <li key={leak.id || leak.title} style={styles.leak}>
                <div style={styles.leakHead}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', minWidth: 0 }}>{leak.title}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, flexShrink: 0, color: leak.severity >= 4 ? '#ef4444' : leak.severity >= 3 ? '#61d0e8' : '#3b82f6' }}>{leak.value}</span>
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{leak.message}</div>
              </li>
            ))}
          </ul>
          {analysis.recommendations?.length > 0 && (
            <section aria-label="What To Change" style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#edf6ff', margin: '0 0 8px' }}>What To Change</h3>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 1.5 }}>
                {analysis.recommendations.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  scope: { margin: '0 0 14px', fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  muted: { padding: '24px 0', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  failed: { padding: 16, borderRadius: 10, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)' },
  risk: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: 14, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  leak: { padding: '12px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' },
  leakHead: { display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
};
