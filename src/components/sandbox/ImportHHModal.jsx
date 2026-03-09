import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseHandHistory } from '../../utils/hh-parser';

const M = {
    bg: '#242526', border: '#3A3B3C',
    accent: '#4599FF', text: '#E4E6EB', sub: '#B0B3B8',
    red: '#fca5a5', green: '#4ade80'
};

export default function ImportHHModal({ isVisible, onClose, onImport }) {
    const [hhText, setHHText] = useState('');
    const [status, setStatus] = useState(null); // { type: 'error' | 'success', msg: string }

    const handleImport = () => {
        if (!hhText.trim()) return setStatus({ type: 'error', msg: 'Please paste a hand history.' });

        try {
            const parsed = parseHandHistory(hhText);
            if (parsed && parsed.success) {
                setStatus({ type: 'success', msg: 'Hand History parsed successfully!' });
                setTimeout(() => {
                    onImport(parsed);
                    setHHText('');
                    setStatus(null);
                    onClose();
                }, 800);
            } else {
                setStatus({ type: 'error', msg: parsed?.error || 'Invalid Hand History format.' });
            }
        } catch (e) {
            setStatus({ type: 'error', msg: 'Failed to parse Hand History.' });
        }
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                        style={{ background: M.bg, borderRadius: 16, padding: 20, width: '100%', maxWidth: 500, border: `1px solid ${M.border}`, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: M.text, margin: 0 }}>Import Hand History ⚡️</h3>
                            <button onClick={onClose} style={{ background: 'none', border: 'none', color: M.sub, fontSize: 22, cursor: 'pointer' }}>×</button>
                        </div>
                        <p style={{ fontSize: 13, color: M.sub, marginBottom: 12 }}>
                            Paste raw text from PokerStars, Ignition Casino, or GGPoker. The Sandbox will automatically configure the board, stacks, and hero hand.
                        </p>
                        <textarea
                            value={hhText}
                            onChange={(e) => { setHHText(e.target.value); setStatus(null); }}
                            placeholder="PokerStars Hand #241489066746: Hold'em No Limit ($1/$2 USD)..."
                            style={{
                                width: '100%', height: 200, padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.4,
                                background: '#18191A', border: `1px solid ${M.border}`, color: M.text,
                                resize: 'none', fontFamily: 'monospace', boxSizing: 'border-box',
                            }}
                        />
                        {status && (
                            <div style={{ marginTop: 12, fontSize: 12, color: status.type === 'error' ? M.red : M.green, fontWeight: 600, padding: '8px 12px', background: status.type === 'error' ? 'rgba(252,165,165,0.1)' : 'rgba(74,222,128,0.1)', borderRadius: 6, border: `1px solid ${status.type === 'error' ? 'rgba(252,165,165,0.3)' : 'rgba(74,222,128,0.3)'}` }}>
                                {status.msg}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                            <button onClick={handleImport}
                                style={{ flex: 1, padding: '12px 16px', background: 'linear-gradient(to right, #2374E1, #4599FF)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                <span>📥 Check & Hydrate</span>
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
