/**
 * SHARE SCENARIO MODAL (W6-2)
 * Generates and displays a shareable short-link for the current Sandbox state.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const M = {
    bg: 'rgba(11,13,17,0.95)',
    card: '#242526',
    text: '#E4E6EB',
    sub: '#B0B3B8',
    border: '#3E4042',
    accent: '#4599FF',
    green: '#00E676',
};

export default function ShareScenarioModal({ onClose, sandboxState }) {
    const [loading, setLoading] = useState(false);
    const [shareUrl, setShareUrl] = useState(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState(null);

    const generateLink = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('supabase.auth.token') : null;
            let headers = { 'Content-Type': 'application/json' };
            if (token) {
                try {
                    const parsed = JSON.parse(token);
                    headers.Authorization = `Bearer ${parsed.currentSession?.access_token}`;
                } catch (e) { }
            }

            const res = await fetch('/api/sandbox/create-share', {
                method: 'POST',
                headers,
                body: JSON.stringify({ state_json: sandboxState })
            });

            const json = await res.json();
            if (json.success) {
                const origin = typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker';
                setShareUrl(`${origin}/sandbox/${json.shareId}`);
            } else {
                setError(json.error || 'Failed to generate link');
            }
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    }, [sandboxState]);

    const copyToClipboard = () => {
        if (!shareUrl) return;
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100002 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
                onClick={e => e.stopPropagation()}
                style={{ background: M.card, padding: 24, borderRadius: 16, width: '90%', maxWidth: 400, border: `1px solid ${M.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', position: 'relative', textAlign: 'center' }}
            >
                <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: M.sub, fontSize: 16, cursor: 'pointer' }}>✕</button>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: M.text, marginBottom: 8 }}>Share Scenario</div>
                <div style={{ fontSize: 13, color: M.sub, marginBottom: 20, lineHeight: 1.5 }}>
                    Generate a public link to share this exact sandbox state (ranges, board, and analysis) with friends or coaches.
                </div>

                {error && <div style={{ color: '#ff4444', fontSize: 12, background: 'rgba(255,68,68,0.1)', padding: '8px 12px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}

                {!shareUrl ? (
                    <button
                        onClick={generateLink}
                        disabled={loading}
                        style={{ width: '100%', padding: '14px', borderRadius: 8, background: loading ? M.border : M.accent, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                        {loading ? 'Generating...' : 'Create Share Link'}
                    </button>
                ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div onClick={copyToClipboard} style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: `1px solid ${M.border}`, borderRadius: 8, padding: '12px', cursor: 'pointer', marginBottom: 12 }}>
                            <div style={{ flex: 1, fontSize: 13, color: M.text, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'left' }}>
                                {shareUrl}
                            </div>
                            <div style={{ color: copied ? M.green : M.accent, fontSize: 14, fontWeight: 700, marginLeft: 12 }}>
                                {copied ? 'Copied! ✓' : 'Copy'}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            style={{ width: '100%', padding: '12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: M.text, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}
                        >
                            Done
                        </button>
                    </motion.div>
                )}
            </motion.div>
        </motion.div>
    );
}
