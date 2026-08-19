import React from 'react';
import { getProfileJwt } from './utils';
import { busEmit } from '../../engine/EventBus';
import { broadcastSync } from '../../lib/broadcastSync';
import dynamic from 'next/dynamic';
const BottomNavBar = dynamic(() => import('../ui/BottomNavBar'), { ssr: false });

export default function ReelsGalleryModal({ isOpen, onClose, userReels }) {
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
                        <h2 style={{ margin: 0, color: 'white', fontSize: 20 }}>My Reels</h2>
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
                        {userReels.length === 0 ? (
                            <div style={{
                                textAlign: 'center', color: '#888',
                                padding: 60
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>🎞️</div>
                                <div style={{ fontSize: 18 }}>No Reels Yet</div>
                                <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                                    Videos from your posts will appear here
                                </div>
                            </div>
                        ) : (
                            userReels.map(reel => (
                                <div
                                    key={reel.id}
                                    style={{
                                        background: '#111', borderRadius: 12, overflow: 'hidden'
                                    }}
                                >
                                    <video
                                        src={reel.media_url}
                                        poster={reel.thumbnail_url}
                                        style={{
                                            width: '100%', height: 'auto',
                                            display: 'block', maxHeight: '80vh'
                                        }}
                                        controls
                                    />
                                    {reel.caption && (
                                        <div style={{
                                            padding: '12px 16px', color: 'white',
                                            fontSize: 14, background: '#1a1a1a'
                                        }}>{reel.caption}</div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            
    );
}