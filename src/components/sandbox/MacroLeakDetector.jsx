/**
 * MACRO LEAK DETECTOR (W6-4)
 * Analyzes large sample sets (up to 1,000 hands) to identify systemic flaws.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { getAccessToken } from '../../lib/authUtils';

const M = {
    bg: '#18191A', card: '#242526', border: '#3E4042',
    accent: '#4599FF', green: '#00cc6a', text: '#E4E6EB', sub: '#B0B3B8'
};

/**
 * Renders **bold** markdown segments without dangerouslySetInnerHTML.
 */
function renderInsight(text) {
    const parts = String(text ?? '').split('**');
    return parts.map((part, i) => (
        i % 2 === 1
            ? <strong key={i} style={{ color: '#fff' }}>{part}</strong>
            : <span key={i}>{part}</span>
    ));
}

export default function MacroLeakDetector() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchAnalysis = useCallback(async () => {
        setError(null);
        try {
            const token = getAccessToken();
            let headers = {};
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const res = await fetch('/api/sandbox/macro-analysis', { headers });
            const json = await res.json().catch(() => null);
            if (json?.success) setData(json);
            else setError(json?.error || `Macro analysis unavailable (${res.status})`);
        } catch (err) {
            setError(err.message || 'Macro analysis unavailable');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchAnalysis();

        // Sandbox results are recorded on a different route, so the in-page
        // custom event never reaches this page. Refresh when the tab regains
        // focus instead ("played the sandbox in another tab, came back").
        const onVisible = () => {
            if (typeof document === 'undefined' || document.visibilityState === 'visible') fetchAnalysis();
        };
        const handleCoachResult = () => fetchAnalysis();
        window.addEventListener('sandbox-coach-result-saved', handleCoachResult);
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener('sandbox-coach-result-saved', handleCoachResult);
            window.removeEventListener('focus', onVisible);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [fetchAnalysis]);

    if (loading) return (
        <div style={{ padding: 20, background: M.card, borderRadius: 12, border: `1px solid ${M.border}`, textAlign: 'center', color: M.sub }}>
            <div className="macro-spin" style={{ fontSize: 24, marginBottom: 8 }}>{'⚙️'}</div>
            Running systemic leak aggregation...
            <style jsx>{`
                .macro-spin { animation: macroSpin 1s linear infinite; }
                @keyframes macroSpin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );

    if (error) return (
        <div style={{ padding: 16, background: M.card, borderRadius: 12, border: `1px solid ${M.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: M.text, marginBottom: 4 }}>{'🔬 Macro Leak Detector'}</div>
            <div style={{ fontSize: 11, color: M.sub, marginBottom: 10 }}>Macro analysis unavailable right now.</div>
            <button
                onClick={() => { setLoading(true); fetchAnalysis(); }}
                style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(69,153,255,0.12)', border: '1px solid rgba(69,153,255,0.35)', color: M.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
                Retry
            </button>
        </div>
    );

    if (data?.insufficientData) {
        const total = Number(data.total) || 0;
        return (
            <div style={{ padding: 20, background: M.card, borderRadius: 12, border: `1px solid ${M.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: M.text, marginBottom: 4 }}>{'🔬 Macro Leak Detector'}</div>
                <div style={{ fontSize: 11, color: M.sub }}>Insufficient sample size. Play at least 50 hands in Coach Mode to uncover systemic macro leaks. (Current: {total}/50)</div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginTop: 8 }}>
                    <div style={{ width: `${Math.min(100, (total / 50) * 100)}%`, background: M.accent, height: '100%', borderRadius: 2 }} />
                </div>
            </div>
        );
    }

    const insights = Array.isArray(data?.insights) ? data.insights : [];
    if (!data || insights.length === 0) return null;

    return (
        <div style={{ padding: 20, background: M.card, borderRadius: 12, border: `1px solid ${M.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(236,72,153,0.15)', color: '#ec4899', padding: '6px 8px', borderRadius: 8, fontSize: 13, fontWeight: 800 }}>
                    {'🔬 Macro Detection'}
                </div>
                <div style={{ fontSize: 11, color: M.sub, fontWeight: 600 }}>Sample: {Number(data.totalHands) || 0} Hands</div>
                <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>
                    Lost EV: {(Number(data.totalEvLost) || 0).toFixed(2)}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insights.map((insight, idx) => (
                    <motion.div
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                        key={idx} style={{ padding: 12, background: 'rgba(0,0,0,0.2)', borderLeft: `3px solid ${idx === 0 ? '#ff4444' : idx === 1 ? M.accent : M.green}`, borderRadius: 6, fontSize: 13, color: M.text, lineHeight: 1.5 }}
                    >
                        <span>{renderInsight(insight)}</span>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
