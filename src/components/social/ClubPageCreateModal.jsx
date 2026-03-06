/**
 * ClubPageCreateModal — extracted from pages/hub/social-media.js
 * Modal for creating a new Club Page on Smarter.Poker Social.
 */
import { useState } from 'react';

export default function ClubPageCreateModal({ C, commanderData, userId, onCreated, onClose }) {
    const [pageName, setPageName] = useState(commanderData?.venue_name || '');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('poker_room');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    const categories = [
        { key: 'poker_room', label: 'Poker Room' },
        { key: 'casino', label: 'Casino' },
        { key: 'card_club', label: 'Card Club' },
        { key: 'charity', label: 'Charity Organization' },
        { key: 'league', label: 'League / Tour' },
        { key: 'other', label: 'Other' },
    ];

    const handleCreate = async () => {
        const controller = new AbortController();
        const { signal } = controller;
        if (!pageName.trim()) { setError('Page name is required'); return; }
        setCreating(true);
        setError('');
        try {
            const res = await fetch('/api/social/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: pageName.trim(),
                    page_type: 'club',
                    description: description.trim(),
                    category,
                    owner_id: userId,
                    linked_venue_id: commanderData?.venue_id ? String(commanderData.venue_id) : undefined,
                    location_city: (() => { try { const v = JSON.parse(localStorage.getItem('commander_venue') || '{}'); return v.city || v.location_city || ''; } catch { return ''; } })(),
                    location_state: (() => { try { const v = JSON.parse(localStorage.getItem('commander_venue') || '{}'); return v.state || v.location_state || ''; } catch { return ''; } })(),
                    is_public: true,
                    allow_member_posts: false,
                }),
                signal,
            });
            const json = await res.json();
            if (json.success && json.data) {
                onCreated(json.data);
            } else {
                setError(json.error || 'Failed to create page');
            }
        } catch (e) {
            if (e.name !== 'AbortError') setError('Network error. Please try again.');
        }
        setCreating(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
            <div style={{ position: 'relative', background: '#fff', borderRadius: 12, width: '90%', maxWidth: 480, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: C.text }}>Create Your Club Page</h2>
                <p style={{ margin: '0 0 20px', fontSize: 14, color: C.textSec }}>Set Up A Public Page For Your Venue On Smarter.Poker Social</p>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Page Name</label>
                <input value={pageName} onChange={e => setPageName(e.target.value)} placeholder="Your Venue Name"
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 15, outline: 'none', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit', color: '#050505', background: '#fff' }} />

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, outline: 'none', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', color: '#050505' }}>
                    {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell People About Your Venue..."
                    rows={3} style={{ width: '100%', padding: '10px 14px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'vertical', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit', color: '#050505', background: '#fff' }} />

                {error && <p style={{ color: C.red, fontSize: 13, margin: '0 0 10px' }}>{error}</p>}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#E4E6EB', color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    <button onClick={handleCreate} disabled={creating || !pageName.trim()} style={{
                        padding: '10px 24px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        opacity: creating || !pageName.trim() ? 0.5 : 1
                    }}>{creating ? 'Creating...' : 'Create Page'}</button>
                </div>
            </div>
        </div>
    );
}
