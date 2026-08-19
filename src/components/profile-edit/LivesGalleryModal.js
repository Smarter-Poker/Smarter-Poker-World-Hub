import React from 'react';
import { getProfileJwt } from './utils';
import { busEmit } from '../../engine/EventBus';
import { broadcastSync } from '../../lib/broadcastSync';
import dynamic from 'next/dynamic';
const BottomNavBar = dynamic(() => import('../ui/BottomNavBar'), { ssr: false });

export default function LivesGalleryModal({ isOpen, onClose, userLives, user, setUserLives, setMessage }) {
    if (!isOpen) return null;
    return (

                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', zIndex: 9999,
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{
                        padding: 16, display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', borderBottom: '1px solid #333'
                    }}>
                        <h2 style={{ margin: 0, color: 'white', fontSize: 20 }}>🔴 My Lives</h2>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none', border: 'none', color: 'white',
                                fontSize: 28, cursor: 'pointer'
                            }}
                        >×</button>
                    </div>
                    <div style={{
                        flex: 1, overflow: 'auto', padding: 16,
                        display: 'flex', flexDirection: 'column', gap: 16,
                        maxWidth: 600, margin: '0 auto', width: '100%'
                    }}>
                        {userLives.length === 0 ? (
                            <div style={{
                                textAlign: 'center', color: '#888',
                                padding: 60
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>🔴</div>
                                <div style={{ fontSize: 18 }}>No Saved Lives Yet</div>
                                <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                                    When you end a live stream, you can save it here
                                </div>
                            </div>
                        ) : (
                            userLives.map(live => {
                                const duration = live.started_at && live.ended_at
                                    ? Math.round((new Date(live.ended_at) - new Date(live.started_at)) / 1000)
                                    : 0;
                                const durationStr = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
                                const dateStr = new Date(live.created_at).toLocaleDateString();

                                return (
                                    <div
                                        key={live.id}
                                        style={{
                                            background: '#1a1a1a',
                                            borderRadius: 12,
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {/* Video Preview */}
                                        <div style={{ position: 'relative', background: '#000' }}>
                                            {live.video_url ? (
                                                <video
                                                    src={live.video_url}
                                                    poster={live.thumbnail_url}
                                                    style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '80vh' }}
                                                    controls
                                                />
                                            ) : live.thumbnail_url ? (
                                                <img
                                                    src={live.thumbnail_url}
                                                    alt={live.title}
                                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: '100%', height: '100%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#666', fontSize: 40
                                                }}>📺</div>
                                            )}
                                            {/* Duration badge */}
                                            <div style={{
                                                position: 'absolute', bottom: 8, right: 8,
                                                background: 'rgba(0,0,0,0.8)', color: 'white',
                                                padding: '4px 8px', borderRadius: 4, fontSize: 12
                                            }}>{durationStr}</div>
                                            {/* Status badge */}
                                            <div style={{
                                                position: 'absolute', top: 8, left: 8,
                                                background: live.is_posted ? '#42B72A' : '#FA383E',
                                                color: 'white',
                                                padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600
                                            }}>{live.is_posted ? 'Posted' : 'Draft'}</div>
                                        </div>
                                        {/* Info */}
                                        <div style={{ padding: 12 }}>
                                            <div style={{ color: 'white', fontWeight: 600, marginBottom: 4 }}>
                                                {live.title || 'Live Stream'}
                                            </div>
                                            <div style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
                                                {dateStr} • {live.viewer_count || 0} viewers
                                            </div>
                                            {/* Actions */}
                                            {!live.is_posted && (
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button
                                                        onClick={async () => {
                                                            if (!live.video_url) {
                                                                setMessage('No video available to post');
                                                                return;
                                                            }
                                                            // Post to feed
                                                            try {
                                                                // Direct PostgREST — avoids SIGNED_OUT cascade
                                                                const _liveUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                                                                const _liveKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                                                                const _liveJwt = getProfileJwt();
                                                                const _liveHeaders = { 'apikey': _liveKey, 'Authorization': `Bearer ${_liveJwt}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

                                                                // Insert social post
                                                                const insertRes = await fetch(`${_liveUrl}/rest/v1/social_posts`, {
                                                                    method: 'POST',
                                                                    headers: _liveHeaders,
                                                                    body: JSON.stringify({
                                                                        author_id: user?.id,
                                                                        content: `🔴 ${live.title || 'Live replay'}`,
                                                                        content_type: 'video',
                                                                        media_urls: [live.video_url],
                                                                        visibility: 'public'
                                                                    }),
                                                                });
                                                                if (!insertRes.ok) throw new Error(await insertRes.text());

                                                                // Update live stream status
                                                                const updateRes = await fetch(`${_liveUrl}/rest/v1/live_streams?id=eq.${live.id}`, {
                                                                    method: 'PATCH',
                                                                    headers: _liveHeaders,
                                                                    body: JSON.stringify({ is_posted: true, is_draft: false }),
                                                                });
                                                                if (!updateRes.ok) throw new Error(await updateRes.text());

                                                                setUserLives(prev => prev.map(l =>
                                                                    l.id === live.id ? { ...l, is_posted: true, is_draft: false } : l
                                                                ));
                                                                setMessage('Live stream posted to your feed!');
                                                                busEmit.dataMutated('social');
                                                                try {
                                                                    broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey: 'social-feed', action: 'invalidate', ts: Date.now() });
                                                                } catch { /* noop */ }
                                                            } catch (e) {
                                                                console.warn('Error posting live stream:', e);
                                                                setMessage('Error posting live stream: ' + (e.message || 'Unknown error'));
                                                            }
                                                        }}
                                                        style={{
                                                            flex: 1, padding: '10px 16px', borderRadius: 6,
                                                            background: '#1877F2', color: 'white',
                                                            border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                                                        }}
                                                    >Post</button>
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('Delete this live stream?')) {
                                                                try {
                                                                    // Direct PostgREST DELETE — avoids SIGNED_OUT cascade
                                                                    const _delUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                                                                    const _delKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                                                                    const _delJwt = getProfileJwt();
                                                                    const delRes = await fetch(`${_delUrl}/rest/v1/live_streams?id=eq.${live.id}`, {
                                                                        method: 'DELETE',
                                                                        headers: { 'apikey': _delKey, 'Authorization': `Bearer ${_delJwt}`, 'Content-Type': 'application/json' },
                                                                    });
                                                                    if (!delRes.ok) throw new Error(await delRes.text());
                                                                    setUserLives(prev => prev.filter(l => l.id !== live.id));
                                                                    setMessage('Live stream deleted.');
                                                                    busEmit.dataMutated('social');
                                                                    try {
                                                                        broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey: 'social-feed', action: 'invalidate', ts: Date.now() });
                                                                    } catch { /* noop */ }
                                                                } catch (e) {
                                                                    console.warn('Error deleting live stream:', e);
                                                                    setMessage('Error deleting live stream: ' + (e.message || 'Unknown error'));
                                                                }
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '10px 16px', borderRadius: 6,
                                                            background: 'transparent', color: '#FA383E',
                                                            border: '1px solid #FA383E', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                                                        }}
                                                    >Delete</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                  <BottomNavBar />
                </div>
            
    );
}