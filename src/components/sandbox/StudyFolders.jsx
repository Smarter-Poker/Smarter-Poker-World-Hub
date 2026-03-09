/**
 * STUDY FOLDERS BROWSER (W6-1)
 * Browses all saved hands by folder, allowing users to reload them into the Sandbox.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../hooks/useTrainingBus';

const M = {
    bg: 'rgba(11,13,17,0.95)',
    card: '#242526',
    text: '#E4E6EB',
    sub: '#B0B3B8',
    border: '#3E4042',
    accent: '#4599FF',
    green: '#00E676',
};

export default function StudyFolders({ onClose, onLoadTarget }) {
    const [hands, setHands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFolder, setActiveFolder] = useState(null);

    const fetchHands = useCallback(async () => {
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('supabase.auth.token') : null;
            let headers = {};
            if (token) {
                try {
                    const parsed = JSON.parse(token);
                    headers.Authorization = `Bearer ${parsed.currentSession?.access_token}`;
                } catch (e) { }
            }

            const res = await fetch('/api/sandbox/saved-hands', { headers });
            const json = await res.json();
            if (json.success) {
                setHands(json.hands);
                if (json.hands.length > 0 && !activeFolder) {
                    const folders = [...new Set(json.hands.map(h => h.folder_name))];
                    setActiveFolder(folders[0]);
                }
            }
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    }, [activeFolder]);

    useEffect(() => {
        fetchHands();
    }, [fetchHands]);

    useTrainingBus('sandbox-hand-saved', () => {
        fetchHands();
    });

    const folders = [...new Set(hands.map(h => h.folder_name))];
    const filteredHands = hands.filter(h => h.folder_name === activeFolder);

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100001, padding: 16 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
                onClick={e => e.stopPropagation()}
                style={{ background: M.bg, borderRadius: 16, width: '100%', maxWidth: 640, height: '80vh', border: `1px solid ${M.border}`, boxShadow: '0 12px 48px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${M.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: M.card }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(69,153,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📁</div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: M.text }}>Study Folders</div>
                            <div style={{ fontSize: 11, color: M.sub }}>{hands.length} customized scenarios saved</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: 'none', color: M.sub, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                {loading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: M.sub, fontSize: 14 }}>Loading your study lab...</div>
                ) : hands.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 40, textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: M.text, marginBottom: 8 }}>Empty Archive</div>
                        <div style={{ fontSize: 13, color: M.sub, maxWidth: 280, lineHeight: 1.5 }}>
                            You haven't saved any scenarios yet. Use the "Save to Folder" button in the Sandbox overflow menu to start building your custom drilling library.
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        {/* Left sidebar - Folders */}
                        <div style={{ width: 200, background: 'rgba(0,0,0,0.2)', borderRight: `1px solid ${M.border}`, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                            {folders.map(f => (
                                <button
                                    key={f}
                                    onClick={() => setActiveFolder(f)}
                                    style={{
                                        padding: '14px 16px', background: activeFolder === f ? 'rgba(69,153,255,0.1)' : 'transparent', border: 'none', borderLeft: activeFolder === f ? `3px solid ${M.accent}` : '3px solid transparent', color: activeFolder === f ? M.accent : M.text, fontSize: 13, fontWeight: activeFolder === f ? 700 : 500, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.1s'
                                    }}
                                >
                                    <span style={{ fontSize: 14 }}>{activeFolder === f ? '📂' : '📁'}</span>
                                    {f}
                                    <span style={{ marginLeft: 'auto', fontSize: 11, color: M.sub, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>
                                        {hands.filter(h => h.folder_name === f).length}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Right main - Hands */}
                        <div style={{ flex: 1, padding: 20, overflowY: 'auto', background: M.bg }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: M.text, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {activeFolder}
                                <span style={{ fontSize: 11, fontWeight: 400, color: M.sub }}>{filteredHands.length} setups</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {filteredHands.map((h, i) => {
                                    const state = typeof h.state_json === 'string' ? JSON.parse(h.state_json) : h.state_json;
                                    const boardCars = state.board?.flop?.join(' ') || state.board?.join(' ') || 'Preflop';
                                    const heroCards = state.heroHand ? `${state.heroHand.card1}${state.heroHand.card2}` : 'Unknown';

                                    return (
                                        <div key={h.id || i} style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: M.text, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>Hero: {heroCards} {state.heroPosition ? `(${state.heroPosition})` : ''}</span>
                                                    <span style={{ fontSize: 12, color: M.sub }}>Board: <strong style={{ color: '#fff' }}>{boardCars}</strong></span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    {(h.tags || []).map(t => (
                                                        <span key={t} style={{ fontSize: 10, color: M.accent, background: 'rgba(69,153,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>#{t}</span>
                                                    ))}
                                                    <span style={{ fontSize: 10, color: M.sub, padding: '2px 0' }}>
                                                        {new Date(h.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    onLoadTarget(state);
                                                    onClose();
                                                }}
                                                style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(0,230,118,0.15)', color: M.green, border: `1px solid rgba(0,230,118,0.3)`, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                ▶ Load Sandbox
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
