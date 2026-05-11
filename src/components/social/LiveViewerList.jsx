/**
 * LiveViewerList — Slide-up sheet showing who's watching
 * Tap the viewer count to open. Shows profile photos and names.
 */
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export function LiveViewerList({ streamId, viewerCount, isOpen, onClose }) {
    const [viewers, setViewers] = useState([]);
    const [loading, setLoading] = useState(false);
    // BUG-FIX-DEEP-AUDIT-R5 VL-4: track per-avatar failure so a broken
    // avatar URL falls back to the default rather than showing a broken-
    // image icon.
    const [failedAvatars, setFailedAvatars] = useState({});

    useEffect(() => {
        if (!isOpen || !streamId) return;
        // BUG FIX (L3): mounted flag prevents stale setState if isOpen toggles
        // false while the two-step query is still in-flight.
        let mounted = true;

        const loadViewers = async () => {
            if (!mounted) return;
            setLoading(true);
            // BUG-FIX-DEEP-AUDIT-R5 VL-1: order by last_seen_at desc so we
            // get the actually-watching-right-now viewers. The previous
            // version did .limit(50) without order, which returned an
            // arbitrary 50 — on streams with 1000+ viewers, this was
            // whoever's row Postgres happened to scan first.
            //
            // Also filter to recent heartbeats (>= now - 5 min, matching
            // fn_cleanup_stale_viewers cutoff) so ghost rows that haven't
            // been cleaned up yet don't dominate the list.
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { data: rows } = await supabase
                .from('live_viewers')
                .select('viewer_id, last_seen_at')
                .eq('stream_id', streamId)
                .gte('last_seen_at', fiveMinAgo)
                .order('last_seen_at', { ascending: false })
                .limit(50);
            if (!mounted) return;
            if (!rows?.length) { setViewers([]); setLoading(false); return; }
            const ids = rows.map(r => r.viewer_id);
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .in('id', ids);
            if (!mounted) return;
            // Preserve the ordering from live_viewers (most-recent first)
            const profileMap = new Map((profiles || []).map(p => [p.id, p]));
            const ordered = ids.map(id => profileMap.get(id)).filter(Boolean);
            setViewers(ordered);
            setLoading(false);
        };

        loadViewers();

        // BUG-FIX-DEEP-AUDIT-R5 VL-3: subscribe to live_viewers changes
        // while the panel is open. Without this, the list was a one-shot
        // snapshot — new viewers joining or leaving were invisible until
        // the user closed and reopened. We debounce by re-running the
        // load query (not patching state row-by-row) because the two-step
        // join-profiles pattern is simpler than maintaining incremental
        // state. Bounded by panel-open lifetime.
        let debounceTimer = null;
        const ch = supabase.channel(`live-viewers-list-${streamId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'live_viewers', filter: `stream_id=eq.${streamId}` },
                () => {
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        if (mounted) loadViewers();
                    }, 1500);  // batch a burst of viewer changes
                })
            .subscribe();

        return () => {
            mounted = false;
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(ch);
        };
    }, [isOpen, streamId]);

    if (!isOpen) return null;

    // BUG-FIX-DEEP-AUDIT-R5 VL-5: derive anonymous-viewer count. The
    // live_viewers table has no row for anonymous viewers (the viewer_id
    // FK requires a profile). viewer_count is the authoritative LiveKit-
    // participant count from the broadcaster, so the gap = anon viewers.
    const safeCount = Number.isFinite(viewerCount) ? viewerCount : 0;
    const anonCount = Math.max(0, safeCount - viewers.length);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.4)', zIndex: 50,
                display: 'flex', alignItems: 'flex-end',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%',
                    background: 'rgba(18,18,30,0.97)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '20px 20px 0 0',
                    padding: '16px 0 32px',
                    maxHeight: '60vh',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Handle */}
                <div style={{
                    width: 40, height: 4, background: 'rgba(255,255,255,0.3)',
                    borderRadius: 2, margin: '0 auto 16px',
                }} />

                <div style={{ padding: '0 20px', color: 'white', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                    {/* BUG-FIX-DEEP-AUDIT-R5 VL-2: NaN coercion */}
                    👁️ {safeCount} Watching
                </div>

                <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px' }}>
                    {loading && (
                        <div style={{ color: 'rgba(255,255,255,0.4)', padding: '24px', textAlign: 'center', fontSize: 14 }}>
                            Loading viewers...
                        </div>
                    )}
                    {!loading && viewers.length === 0 && anonCount === 0 && (
                        <div style={{ color: 'rgba(255,255,255,0.4)', padding: '24px', textAlign: 'center', fontSize: 14 }}>
                            No viewers yet
                        </div>
                    )}
                    {viewers.map(viewer => (
                        <div key={viewer.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 8px', borderRadius: 12,
                        }}>
                            <img
                                src={failedAvatars[viewer.id] ? '/default-avatar.png' : (viewer.avatar_url || '/default-avatar.png')}
                                alt={viewer.username}
                                onError={() => setFailedAvatars(prev => ({ ...prev, [viewer.id]: true }))}
                                style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                            />
                            <span style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>
                                {viewer.username || viewer.full_name || 'Anonymous'}
                            </span>
                        </div>
                    ))}
                    {/* BUG-FIX-DEEP-AUDIT-R5 VL-5: anonymous-viewer footer.
                        Surfaces the gap between viewer_count (which includes
                        anon viewers via the LiveKit room participant count)
                        and the named-viewer list (named viewers only, since
                        the live_viewers FK is to profiles). Without this,
                        a stream with 100 viewers but only 3 named ones felt
                        like the badge was lying. */}
                    {!loading && anonCount > 0 && (
                        <div style={{
                            color: 'rgba(255,255,255,0.5)', padding: '12px 8px 4px',
                            fontSize: 13, textAlign: 'center', fontStyle: 'italic',
                        }}>
                            + {anonCount.toLocaleString()} anonymous viewer{anonCount === 1 ? '' : 's'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default LiveViewerList;
