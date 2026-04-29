/**
 * LiveViewerList — Slide-up sheet showing who's watching
 * Tap the viewer count to open. Shows profile photos and names.
 */
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export function LiveViewerList({ streamId, viewerCount, isOpen, onClose }) {
    const [viewers, setViewers] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !streamId) return;
        setLoading(true);
        supabase
            .from('live_viewers')
            .select('viewer_id, profiles!viewer_id(id, username, full_name, avatar_url)')
            .eq('stream_id', streamId)
            .limit(50)
            .then(({ data }) => {
                setViewers(data?.map(v => v.profiles).filter(Boolean) || []);
                setLoading(false);
            });
    }, [isOpen, streamId]);

    if (!isOpen) return null;

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
                    👁️ {viewerCount} Watching
                </div>

                <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px' }}>
                    {loading && (
                        <div style={{ color: 'rgba(255,255,255,0.4)', padding: '24px', textAlign: 'center', fontSize: 14 }}>
                            Loading viewers...
                        </div>
                    )}
                    {!loading && viewers.length === 0 && (
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
                                src={viewer.avatar_url || '/default-avatar.png'}
                                alt={viewer.username}
                                style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                            />
                            <span style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>
                                {viewer.username || viewer.full_name || 'Anonymous'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default LiveViewerList;
