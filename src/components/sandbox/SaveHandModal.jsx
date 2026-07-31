/**
 * SAVE HAND MODAL (W6-1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Saves the current sandbox state into a study folder.
 *
 * Mobile fixes: bottom sheet with a scrolling body and a sticky footer (the old
 * centred dialog pushed Save off-screen once the keyboard opened), 16px inputs
 * so iOS does not zoom, 44px folder chips, an explicit signed-out state instead
 * of a silent empty folder list, duplicate-name folding, an optional note and a
 * success toast that says where the scenario went.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Save, FolderPlus } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { T, F, S, R, btn } from './paTokens';
import { BottomSheet, PAStyles, Skeleton, SignInState, ErrorState } from './paKit';

const inputStyle = {
    width: '100%', minHeight: 44, padding: '10px 12px', boxSizing: 'border-box',
    background: T.surface2, border: `1px solid ${T.borderHi}`, borderRadius: R.sm,
    color: T.text, fontSize: F.input, fontFamily: 'inherit', outline: 'none',
};

const labelStyle = { fontSize: F.label, fontWeight: 700, color: T.textMuted, marginBottom: S.sm, display: 'block' };

export default function SaveHandModal({ onClose, sandboxState, onSaveComplete }) {
    const [folder, setFolder] = useState('');
    const [tagsInput, setTagsInput] = useState('');
    const [note, setNote] = useState('');
    const [existingFolders, setExistingFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const fetchFolders = useCallback(async () => {
        setLoading(true);
        setAuthError(false);
        setLoadError(null);
        try {
            const token = getAccessToken();
            const headers = {};
            if (token) headers.Authorization = `Bearer ${token}`;

            const res = await fetch('/api/sandbox/saved-hands', { headers });
            if (res.status === 401) {
                setAuthError(true);
                return;
            }
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) {
                setLoadError('Could not load your existing folders.');
                return;
            }
            const folders = [...new Set((json.hands || []).map(h => h.folder_name).filter(Boolean))];
            setExistingFolders(folders);
            if (folders.length > 0) setFolder(prev => prev || folders[0]);
        } catch (err) {
            console.warn('[SaveHandModal] folder fetch error:', err?.message || err);
            setLoadError('Could not load your existing folders.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchFolders(); }, [fetchFolders]);

    // Case-insensitive duplicate folding so "river calls" does not create a
    // second folder next to "River Calls".
    const resolvedFolder = useMemo(() => {
        const trimmed = folder.trim();
        if (!trimmed) return '';
        const match = existingFolders.find(f => f.toLowerCase() === trimmed.toLowerCase());
        return match || trimmed;
    }, [folder, existingFolders]);

    const isExisting = useMemo(
        () => existingFolders.some(f => f.toLowerCase() === folder.trim().toLowerCase()),
        [existingFolders, folder],
    );

    const handleSave = useCallback(async () => {
        if (!resolvedFolder) { setError('Give the folder a name first.'); return; }
        setSaving(true);
        setError(null);

        try {
            const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);
            const token = getAccessToken();
            if (!token) {
                setError('Sign in to save scenarios.');
                return;
            }
            const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

            const payload = {
                folder_name: resolvedFolder,
                tags,
                state_json: note.trim()
                    ? { ...(sandboxState || {}), note: note.trim().slice(0, 500) }
                    : sandboxState,
            };

            const res = await fetch('/api/sandbox/save-hand', { method: 'POST', headers, body: JSON.stringify(payload) });
            const json = await res.json().catch(() => null);

            if (res.status === 401) {
                setError('Sign in to save scenarios.');
                return;
            }
            if (res.ok && json?.success) {
                window.dispatchEvent(new CustomEvent('sandbox-hand-saved', { detail: { hand: json.hand } }));
                toast.success(`Saved to "${resolvedFolder}"`);
                onSaveComplete?.(json.hand);
                onClose?.();
                return;
            }
            setError('Could not save that scenario. Please try again.');
        } catch (err) {
            console.warn('[SaveHandModal] save error:', err?.message || err);
            setError('Could not save that scenario. Check your connection.');
        } finally {
            setSaving(false);
        }
    }, [resolvedFolder, tagsInput, note, sandboxState, onSaveComplete, onClose]);

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Save to study folder"
            titleIcon={<Save size={18} strokeWidth={2} color={T.accent} />}
            subtitle="Keep this exact spot to drill later."
            ariaLabel="Save scenario to a study folder"
            footer={!loading && !authError ? (
                <button
                    type="button"
                    className="pa-btn"
                    onClick={handleSave}
                    disabled={saving || !resolvedFolder}
                    style={{ ...btn('primary', { block: true, disabled: saving || !resolvedFolder }) }}
                >
                    {saving ? 'Saving…' : isExisting ? `Save to ${resolvedFolder}` : 'Create folder and save'}
                </button>
            ) : null}
        >
            <PAStyles />

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }} aria-hidden="true">
                    <Skeleton h={14} w="35%" />
                    <Skeleton h={44} />
                    <Skeleton h={14} w="45%" />
                    <Skeleton h={44} />
                </div>
            ) : authError ? (
                <SignInState
                    title="Sign in to save scenarios"
                    body="Study folders live on your account, so saving needs you signed in."
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg }}>
                    {loadError && (
                        <ErrorState
                            title="Folder list unavailable"
                            body={`${loadError} You can still type a new folder name and save.`}
                            onRetry={fetchFolders}
                        />
                    )}

                    {error && (
                        <div
                            role="alert"
                            style={{
                                fontSize: F.bodySm, fontWeight: 700, color: T.danger, background: T.dangerSoft,
                                border: '1px solid rgba(239,68,68,0.4)', borderRadius: R.sm, padding: S.md,
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="shm-folder" style={labelStyle}>Folder name</label>
                        <input
                            id="shm-folder"
                            value={folder}
                            onChange={(e) => { setFolder(e.target.value); setError(null); }}
                            placeholder="e.g. Tough river calls"
                            style={inputStyle}
                        />
                        {isExisting && (
                            <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: S.xs }}>
                                Adds to the existing folder.
                            </div>
                        )}

                        {existingFolders.length > 0 && (
                            <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap', marginTop: S.md }}>
                                {existingFolders.map(f => {
                                    const on = f.toLowerCase() === folder.trim().toLowerCase();
                                    return (
                                        <button
                                            key={f}
                                            type="button"
                                            className="pa-btn"
                                            aria-pressed={on}
                                            onClick={() => setFolder(f)}
                                            style={{
                                                ...btn('secondary'), padding: '0 14px', fontSize: F.label,
                                                background: on ? T.accentSoft : T.surface2,
                                                color: on ? T.accent : T.textMuted,
                                                borderColor: on ? 'rgba(69,153,255,0.45)' : T.borderHi,
                                            }}
                                        >
                                            {f}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {existingFolders.length === 0 && !loadError && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginTop: S.md, fontSize: F.caption, color: T.textDim }}>
                                <FolderPlus size={18} strokeWidth={2} />
                                This will be your first study folder.
                            </div>
                        )}
                    </div>

                    <div>
                        <label htmlFor="shm-tags" style={labelStyle}>Tags (comma separated, optional)</label>
                        <input
                            id="shm-tags"
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="OOP, 3BP, bluff catcher"
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label htmlFor="shm-note" style={labelStyle}>Note (optional)</label>
                        <textarea
                            id="shm-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What do you want to check when you come back to this?"
                            rows={3}
                            style={{ ...inputStyle, minHeight: 88, resize: 'vertical', lineHeight: 1.45 }}
                        />
                    </div>
                </div>
            )}
        </BottomSheet>
    );
}
