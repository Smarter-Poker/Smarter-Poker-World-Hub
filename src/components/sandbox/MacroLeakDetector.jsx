/**
 * MACRO LEAK DETECTOR (W6-4)
 * Analyzes large sample sets (up to 1,000 hands) to identify systemic flaws.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import useTrainingBus from '../../hooks/useTrainingBus';

const M = {
    bg: '#18191A', card: '#242526', border: '#3E4042',
    accent: '#4599FF', green: '#00cc6a', text: '#E4E6EB', sub: '#B0B3B8'
};

export default function MacroLeakDetector() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchAnalysis = useCallback(async () => {
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('supabase.auth.token') : null;
            let headers = {};
            if (token) {
                try {
                    const parsed = JSON.parse(token);
                    headers.Authorization = `Bearer ${parsed.currentSession?.access_token}`;
                } catch (e) { }
            }

            const res = await fetch('/api/sandbox/macro-analysis', { headers });
            const json = await res.json();
            if (json.success) setData(json);
            else setError(json.error);
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchAnalysis();
    }, [fetchAnalysis]);

    useTrainingBus('sandbox-coach-result-saved', () => {
        // Refresh analysis in the background without setting loading=true
        fetchAnalysis();
    });

    if (loading) return (
        <div style={{ padding: 20, background: M.card, borderRadius: 12, border: `1px solid ${M.border}`, textAlign: 'center', color: M.sub }}>
            <div style={{ fontSize: 24, marginBottom: 8, animation: 'spin 1s linear infinite' }}>⚙️</div>
            Running systemic leak aggregation...
        </div>
    );

    if (error) return null;

    if (data?.insufficientData) {
        return (
            <div style={{ padding: 20, background: M.card, borderRadius: 12, border: `1px solid ${M.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: M.text, marginBottom: 4 }}>🔬 Macro Leak Detector</div>
                <div style={{ fontSize: 11, color: M.sub }}>Insufficient sample size. Play at least 50 hands in Coach Mode to uncover systemic macro leaks. (Current: {data.total}/50)</div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginTop: 8 }}>
                    <div style={{ width: `${Math.min(100, (data.total / 50) * 100)}%`, background: M.accent, height: '100%', borderRadius: 2 }} />
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: 20, background: M.card, borderRadius: 12, border: `1px solid ${M.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ background: 'rgba(236,72,153,0.15)', color: '#ec4899', padding: '6px 8px', borderRadius: 8, fontSize: 13, fontWeight: 800 }}>
                    🔬 Macro Detection
                </div>
                <div style={{ fontSize: 11, color: M.sub, fontWeight: 600 }}>Sample: {data.totalHands} Hands</div>
                <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>
                    Lost EV: {data.totalEvLost.toFixed(2)}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.insights.map((insight, idx) => (
                    <motion.div
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                        key={idx} style={{ padding: 12, background: 'rgba(0,0,0,0.2)', borderLeft: `3px solid ${idx === 0 ? '#ff4444' : idx === 1 ? M.accent : M.green}`, borderRadius: 6, fontSize: 13, color: M.text, lineHeight: 1.5 }}
                    >
                        <span dangerouslySetInnerHTML={{ __html: insight.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #fff">$1</strong>') }} />
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
