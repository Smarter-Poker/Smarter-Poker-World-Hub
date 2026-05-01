import React, { useEffect, useState } from 'react';
import SheetShell from './SheetShell';
import { useComposeStore } from '../../../../stores/composeStore';
import { getAccessToken } from '../../../../lib/authUtils';

/**
 * ShareToGroupsSheet — pick home groups to mirror this post into.
 * Hits /api/social/home-groups (existing endpoint that returns the user's
 * memberships). User can pick N; each picked group gets a mirror insert
 * after the primary post lands.
 */
export default function ShareToGroupsSheet({ onClose }) {
    const shareToGroups = useComposeStore(s => s.shareToGroups);
    const setShareToGroups = useComposeStore(s => s.setShareToGroups);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const token = getAccessToken();
                const res = await fetch('/api/social/home-groups?limit=100', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                const json = await res.json();
                if (!cancelled) {
                    setGroups(Array.isArray(json?.groups) ? json.groups : []);
                }
            } catch (_) {
                if (!cancelled) setGroups([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const isPicked = (id) => shareToGroups.some(g => g.id === id);
    const togglePick = (g) => {
        if (isPicked(g.id)) setShareToGroups(shareToGroups.filter(x => x.id !== g.id));
        else setShareToGroups([...shareToGroups, { id: g.id, name: g.name || g.target_name }]);
    };

    return (
        <SheetShell
            title="Share to groups"
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
            <div style={{ padding: 16, color: '#65676B', fontSize: 13, lineHeight: 1.4 }}>
                Mirror this post into selected home groups. Each will appear as a separate post in that group's feed.
            </div>
            {loading && <div style={{ padding: 16, color: '#65676B', fontSize: 14 }}>Loading…</div>}
            {!loading && groups.length === 0 && (
                <div style={{ padding: 16, color: '#65676B', fontSize: 14 }}>
                    You're not in any home groups yet.
                </div>
            )}
            {groups.map(g => {
                const picked = isPicked(g.id);
                return (
                    <button
                        key={g.id}
                        onClick={() => togglePick(g)}
                        style={{
                            width: '100%', display: 'flex', gap: 12, alignItems: 'center',
                            padding: '12px 16px', background: 'none', border: 'none',
                            borderTop: '1px solid #e4e6eb', cursor: 'pointer', textAlign: 'left',
                        }}
                    >
                        <div style={{
                            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                            background: 'linear-gradient(135deg, #6e8efb, #a777e3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 16, fontWeight: 700,
                        }}>{(g.name || g.target_name || '?').charAt(0).toUpperCase()}</div>
                        <span style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{g.name || g.target_name}</span>
                            {g.member_count != null && (
                                <span style={{ display: 'block', fontSize: 12, color: '#65676B', marginTop: 2 }}>
                                    {g.member_count} member{g.member_count === 1 ? '' : 's'}
                                </span>
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
        </SheetShell>
    );
}
