/**
 * STUDY FOLDERS BROWSER (W6-1)
 * Browses all saved hands by folder, allowing users to reload them into the Sandbox.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAccessToken } from '../../lib/authUtils';

const M = {
    bg: 'rgba(11,13,17,0.95)',
    card: '#242526',
    text: '#E4E6EB',
    sub: '#B0B3B8',
    border: '#3E4042',
    accent: '#4599FF',
    green: '#00E676',
};

/** Saved states can be a JSON string, an object, or corrupt legacy data. */
function parseState(raw) {
    try {
        if (typeof raw === 'string') return JSON.parse(raw) || {};
        return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
        console.warn('[StudyFolders] Corrupt state_json skipped:', e?.message || e);
        return {};
    }
}

export default function StudyFolders({ onClose, onLoadTarget }) {
    const [hands, setHands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFolder, setActiveFolder] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [notice, setNotice] = useState(null);

    // Stable callback: depending on activeFolder made every folder click
    // re-register the listener and refire the whole GET.
    const fetchHands = useCallback(async () => {
        try {
            const token = getAccessToken();
            let headers = {};
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const res = await fetch('/api/sandbox/saved-hands', { headers });
            const json = await res.json().catch(() => null);
            if (json?.success) {
                const list = Array.isArray(json.hands) ? json.hands : [];
                setHands(list);
                if (list.length > 0) {
                    const folderNames = [...new Set(list.map(h => h.folder_name))];
                    setActiveFolder(prev => (prev && folderNames.includes(prev)) ? prev : folderNames[0]);
                }
            }
        } catch (err) {
            console.warn(err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchHands();

        const handleHandSaved = () => fetchHands();
        window.addEventListener('sandbox-hand-saved', handleHandSaved);
        return () => window.removeEventListener('sandbox-hand-saved', handleHandSaved);
    }, [fetchHands]);

    const handleDelete = useCallback(async (id) => {
        if (!id) return;
        setDeletingId(id);
        setNotice(null);
        try {
            const token = getAccessToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;

            const res = await fetch('/api/sandbox/save-hand', {
                method: 'DELETE',
                headers,
                body: JSON.stringify({ id }),
            });
            const json = await res.json().catch(() => null);
            if (res.ok && json?.success) {
                setHands(prev => prev.filter(h => h.id !== id));
                window.dispatchEvent(new CustomEvent('sandbox-hand-deleted', { detail: { id } }));
            } else if (res.status === 401) {
                setNotice('Sign in again to delete saved hands.');
            } else {
                // Never surface raw server text ('Method not allowed') as copy.
                setNotice('Could not delete that hand. Please try again.');
            }
        } catch (err) {
            console.warn('[StudyFolders] Delete error:', err);
            setNotice('Could not delete that hand.');
        } finally {
            setDeletingId(null);
        }
    }, []);

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
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(69,153,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{'📁'}</div>
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
                        <div style={{ fontSize: 48, marginBottom: 16 }}>{'📭'}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: M.text, marginBottom: 8 }}>Empty Archive</div>
                        <div style={{ fontSize: 13, color: M.sub, maxWidth: 280, lineHeight: 1.5 }}>
                            You haven't saved any scenarios yet. Use the "Save to Folder" button in the Sandbox overflow menu to start building your custom drilling library.
                        </div>
                    </div>
                ) : (
                    <div className="sf-body" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        {/* Left sidebar - Folders (collapses to a chip row under 480px) */}
                        <div className="sf-folders" style={{ width: 200, background: 'rgba(0,0,0,0.2)', borderRight: `1px solid ${M.border}`, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                            {folders.map(f => (
                                <button
                                    key={f}
                                    className="sf-folder-btn"
                                    onClick={() => setActiveFolder(f)}
                                    style={{
                                        padding: '14px 16px', background: activeFolder === f ? 'rgba(69,153,255,0.1)' : 'transparent', border: 'none', borderLeft: activeFolder === f ? `3px solid ${M.accent}` : '3px solid transparent', color: activeFolder === f ? M.accent : M.text, fontSize: 13, fontWeight: activeFolder === f ? 700 : 500, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.1s', whiteSpace: 'nowrap',
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
                        <div className="sf-main" style={{ flex: 1, padding: 20, overflowY: 'auto', background: M.bg }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: M.text, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {activeFolder}
                                <span style={{ fontSize: 11, fontWeight: 400, color: M.sub }}>{filteredHands.length} setups</span>
                            </div>

                            {notice && (
                                <div style={{ fontSize: 11, color: '#fca5a5', background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
                                    {notice}
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {filteredHands.map((h, i) => {
                                    const state = parseState(h.state_json);
                                    const boardCars = state.board?.flop?.join(' ')
                                        || (Array.isArray(state.board) ? state.board.join(' ') : '')
                                        || 'Preflop';
                                    const heroCards = state.heroHand
                                        ? `${state.heroHand.card1 || '?'}${state.heroHand.card2 || '?'}`
                                        : 'Unknown';
                                    const loadable = !!(state.heroHand || state.board);

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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                                <button
                                                    onClick={() => {
                                                        if (!loadable) return;
                                                        onLoadTarget?.(state);
                                                        onClose?.();
                                                    }}
                                                    disabled={!loadable}
                                                    title={loadable ? 'Load this scenario' : 'This saved state is unreadable'}
                                                    style={{ padding: '8px 16px', borderRadius: 8, background: loadable ? 'rgba(0,230,118,0.15)' : 'rgba(255,255,255,0.04)', color: loadable ? M.green : M.sub, border: `1px solid ${loadable ? 'rgba(0,230,118,0.3)' : M.border}`, fontSize: 12, fontWeight: 700, cursor: loadable ? 'pointer' : 'not-allowed' }}
                                                >
                                                    {'▶ Load Sandbox'}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(h.id)}
                                                    disabled={deletingId === h.id || !h.id}
                                                    aria-label="Delete saved hand"
                                                    title="Delete saved hand"
                                                    style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(239,83,80,0.1)', color: '#fca5a5', border: '1px solid rgba(239,83,80,0.25)', fontSize: 12, fontWeight: 700, cursor: deletingId === h.id ? 'wait' : 'pointer' }}
                                                >
                                                    {deletingId === h.id ? '…' : '✕'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                <style jsx>{`
                    @media (max-width: 480px) {
                        .sf-body { flex-direction: column; }
                        .sf-folders {
                            width: 100% !important;
                            flex-direction: row !important;
                            overflow-x: auto;
                            overflow-y: hidden;
                            border-right: none;
                            border-bottom: 1px solid #3E4042;
                        }
                        .sf-folder-btn { padding: 10px 12px !important; border-left: none !important; }
                        .sf-main { padding: 12px !important; }
                    }
                `}</style>
            </motion.div>
        </motion.div>
    );
}
