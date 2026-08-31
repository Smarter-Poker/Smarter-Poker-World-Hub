import React, { useEffect, useState } from 'react';
import SheetShell from './SheetShell';
import { useComposeStore } from '../../../../stores/composeStore';
import { supabase } from '../../../../lib/supabase';

/**
 * TagPeopleSheet — search and tag friends as co-authors of the post.
 *
 * Reads directly from `profiles` via supabase-js (same pattern as the
 * global search at pages/hub/social-media/index.js:5708 — no dedicated
 * search API endpoint exists). RLS on profiles permits authenticated
 * SELECT so the search works for any logged-in user.
 */
export default function TagPeopleSheet({ onClose }) {
    const coAuthors = useComposeStore(s => s.coAuthors);
    const setCoAuthors = useComposeStore(s => s.setCoAuthors);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const q = query.trim();
        if (q.length < 2) { setResults([]); return; }
        const t = setTimeout(async () => {
            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
                    .limit(20);
                if (error) throw error;
                if (!cancelled) {
                    // Map to the shape the rest of this sheet expects
                    setResults((data || []).map(u => ({
                        id: u.id,
                        name: u.full_name || u.username,
                        username: u.username,
                        avatar_url: u.avatar_url,
                    })));
                }
            } catch (_) {
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [query]);

    const isPicked = (id) => coAuthors.some(a => a.id === id);

    const togglePick = (user) => {
        if (isPicked(user.id)) {
            setCoAuthors(coAuthors.filter(a => a.id !== user.id));
        } else {
            setCoAuthors([...coAuthors, { id: user.id, name: user.name || user.username, avatar: user.avatar_url || user.avatar }]);
        }
    };

    return (
        <SheetShell
            title="Tag people"
            onClose={onClose}
            rightAction={
                <button
                    onClick={onClose}
                    style={{
                        background: 'none', border: 'none', color: '#1877F2',
                        fontSize: 16, fontWeight: 600, padding: 8, cursor: 'pointer',
                    }}
                >Done</button>
            }
        >
            <div style={{ padding: 16 }}>
                <div style={{
                    background: '#f0f2f5', borderRadius: 10,
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                }}>
                    <span aria-hidden="true">&#X1F50D;</span>
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by name or username"
                        style={{
                            flex: 1, border: 'none', background: 'transparent',
                            outline: 'none', fontSize: 15,
                        }}
                    />
                </div>
            </div>

            {coAuthors.length > 0 && (
                <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {coAuthors.map(a => (
                        <span
                            key={a.id}
                            onClick={() => setCoAuthors(coAuthors.filter(x => x.id !== a.id))}
                            style={{
                                background: '#e7f3ff', color: '#1877F2',
                                padding: '4px 10px', borderRadius: 999,
                                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                        >{a.name} <span aria-hidden="true">&#X2715;</span></span>
                    ))}
                </div>
            )}

            <div>
                {loading && <div style={{ padding: 16, color: '#65676B', fontSize: 14 }}>Searching…</div>}
                {!loading && !query && (
                    <div style={{ padding: 16, color: '#65676B', fontSize: 14 }}>
                        Tag People You Want To Credit As CO-Authors Of This Post. They'll Be Invited To Share It On Their Feed Too.
                    </div>
                )}
                {results.map(u => {
                    const picked = isPicked(u.id);
                    return (
                        <button
                            key={u.id}
                            onClick={() => togglePick(u)}
                            style={{
                                width: '100%', display: 'flex', gap: 12, alignItems: 'center',
                                padding: '10px 16px', background: 'none', border: 'none',
                                borderTop: '1px solid #e4e6eb', cursor: 'pointer', textAlign: 'left',
                            }}
                        >
                            <div style={{
                                width: 40, height: 40, borderRadius: 20,
                                background: '#1c1c1e', overflow: 'hidden', flexShrink: 0,
                            }}>
                                {(u.avatar_url || u.avatar) ? (
                                    <img src={u.avatar_url || u.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{
                                        width: '100%', height: '100%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', fontSize: 16, fontWeight: 700,
                                        background: 'linear-gradient(135deg, #6e8efb, #a777e3)',
                                    }}>{(u.name || u.username || '?').charAt(0).toUpperCase()}</div>
                                )}
                            </div>
                            <span style={{ flex: 1 }}>
                                <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: '#050505' }}>{u.name || u.username}</span>
                                {u.username && u.name && (
                                    <span style={{ display: 'block', fontSize: 12, color: '#65676B', marginTop: 1 }}>@{u.username}</span>
                                )}
                            </span>
                            <span aria-hidden="true" style={{
                                width: 22, height: 22, borderRadius: 4,
                                border: picked ? '2px solid #1877F2' : '2px solid #bcc0c4',
                                background: picked ? '#1877F2' : '#fff',
                                color: '#fff', fontSize: 14, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxSizing: 'border-box',
                            }}>{picked ? '\u{2713}' : ''}</span>
                        </button>
                    );
                })}
            </div>
        </SheetShell>
    );
}
