import React, { useEffect, useState } from 'react';
import SheetShell from './SheetShell';
import { useComposeStore } from '../../../../stores/composeStore';
import { supabase } from '../../../../lib/supabase';
import { getAuthUser } from '../../../../lib/authUtils';

/**
 * ShareToGroupsSheet — pick home groups to mirror this post into.
 *
 * Reads the user's home groups directly from Supabase: the union of
 * groups they OWN and groups they FOLLOW (commander_home_group_follows).
 * No dedicated /api/social/home-groups endpoint exists; querying RLS-
 * protected tables directly is the established pattern (see
 * pages/hub/social-media/index.js global search).
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
                const userId = getAuthUser()?.id;
                if (!userId) {
                    if (!cancelled) { setGroups([]); setLoading(false); }
                    return;
                }
                // 1. Groups the user owns
                const ownedQ = supabase
                    .from('commander_home_groups')
                    .select('id, name, member_count, profile_photo_url')
                    .eq('owner_id', userId)
                    .eq('is_active', true)
                    .limit(100);

                // 2. Groups the user follows
                const followsQ = supabase
                    .from('commander_home_group_follows')
                    .select('group_id, commander_home_groups!inner(id, name, member_count, profile_photo_url, is_active)')
                    .eq('user_id', userId)
                    .limit(100);

                const [{ data: owned }, { data: follows }] = await Promise.all([ownedQ, followsQ]);

                const map = new Map();
                (owned || []).forEach(g => map.set(g.id, g));
                (follows || []).forEach(f => {
                    const g = f.commander_home_groups;
                    if (g && g.is_active && !map.has(g.id)) map.set(g.id, g);
                });

                if (!cancelled) {
                    setGroups(Array.from(map.values()));
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
