/**
 * SAVE HAND MODAL (W6-1)
 * Allows users to save the current Sandbox state into a custom folder with optional tags.
 */
import { useState, useEffect } from 'react';
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

export default function SaveHandModal({ onClose, sandboxState, onSaveComplete }) {
    const { busEmit } = useTrainingBus();
    const [folder, setFolder] = useState('');
    const [tagsInput, setTagsInput] = useState('');
    const [existingFolders, setExistingFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchFolders() {
            try {
                const token = typeof window !== 'undefined' ? localStorage.getItem('supabase.auth.token') : null; // Use appropriate getter here normally, simplified for sandbox env
                let headers = {};
                // Very basic token extraction if needed, typically we use getAccessToken()
                if (token) {
                    try {
                        const parsed = JSON.parse(token);
                        headers.Authorization = `Bearer ${parsed.currentSession?.access_token}`;
                    } catch (e) { }
                }

                const res = await fetch('/api/sandbox/saved-hands', { headers });
                const json = await res.json();
                if (json.success) {
                    const folders = [...new Set(json.hands.map(h => h.folder_name))];
                    setExistingFolders(folders);
                    if (folders.length > 0) setFolder(folders[0]);
                }
            } catch (err) {
                console.error(err);
            }
            setLoading(false);
        }
        fetchFolders();
    }, []);

    async function handleSave() {
        if (!folder.trim()) return setError('Folder name is required');
        setSaving(true);
        setError(null);

        try {
            const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
            const token = typeof window !== 'undefined' ? localStorage.getItem('supabase.auth.token') : null;
            let headers = { 'Content-Type': 'application/json' };
            if (token) {
                try {
                    const parsed = JSON.parse(token);
                    headers.Authorization = `Bearer ${parsed.currentSession?.access_token}`;
                } catch (e) { }
            }

            const res = await fetch('/api/sandbox/save-hand', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    folder_name: folder,
                    tags,
                    state_json: sandboxState
                })
            });

            const json = await res.json();
            if (json.success) {
                busEmit('sandbox-hand-saved', json.hand);
                if (onSaveComplete) onSaveComplete(json.hand);
                onClose();
            } else {
                setError(json.error || 'Failed to save');
            }
        } catch (err) {
            setError(err.message);
        }
        setSaving(false);
    }

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100002 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
                onClick={e => e.stopPropagation()}
                style={{ background: M.card, padding: 20, borderRadius: 16, width: '90%', maxWidth: 400, border: `1px solid ${M.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', position: 'relative' }}
            >
                <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: M.sub, fontSize: 16, cursor: 'pointer' }}>✕</button>
                <div style={{ fontSize: 16, fontWeight: 800, color: M.text, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                    💾 Save to Study Folder
                </div>

                {loading ? (
                    <div style={{ color: M.sub, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading folders...</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {error && <div style={{ color: '#ff4444', fontSize: 12, background: 'rgba(255,68,68,0.1)', padding: '8px 12px', borderRadius: 8 }}>{error}</div>}

                        <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: M.sub, marginBottom: 6 }}>Folder Name</div>
                            <input
                                value={folder}
                                onChange={(e) => setFolder(e.target.value)}
                                placeholder="e.g. Tough River Calls"
                                style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: `1px solid ${M.border}`, borderRadius: 8, color: M.text, fontSize: 14 }}
                            />
                            {existingFolders.length > 0 && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                    {existingFolders.map(f => (
                                        <button key={f} onClick={() => setFolder(f)} style={{ padding: '4px 8px', fontSize: 11, background: folder === f ? M.accent : 'rgba(255,255,255,0.05)', color: folder === f ? '#fff' : M.sub, border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: M.sub, marginBottom: 6 }}>Tags (comma separated, optional)</div>
                            <input
                                value={tagsInput}
                                onChange={(e) => setTagsInput(e.target.value)}
                                placeholder="OOP, 3BP, Bluff Catcher"
                                style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: `1px solid ${M.border}`, borderRadius: 8, color: M.text, fontSize: 14 }}
                            />
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{ padding: '12px', borderRadius: 8, background: saving ? M.border : M.accent, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', marginTop: 8 }}
                        >
                            {saving ? 'Saving...' : 'Save Scenario'}
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
