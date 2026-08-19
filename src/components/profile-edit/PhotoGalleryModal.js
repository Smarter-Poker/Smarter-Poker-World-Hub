import React from 'react';
import { getProfileJwt } from './utils';
import { busEmit } from '../../engine/EventBus';
import { broadcastSync } from '../../lib/broadcastSync';
import dynamic from 'next/dynamic';
const BottomNavBar = dynamic(() => import('../ui/BottomNavBar'), { ssr: false });

export default function PhotoGalleryModal({ isOpen, onClose, userPhotos }) {
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
                        <h2 style={{ margin: 0, color: 'white', fontSize: 20 }}>📷 My Photos</h2>
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
                        {userPhotos.length === 0 ? (
                            <div style={{
                                textAlign: 'center', color: '#888',
                                padding: 60
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
                                <div style={{ fontSize: 18 }}>No Photos Yet</div>
                                <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                                    Photos from your posts will appear here
                                </div>
                            </div>
                        ) : (
                            userPhotos.map(photo => (
                                <div key={photo.id} style={{
                                    background: '#111', borderRadius: 12, overflow: 'hidden'
                                }}>
                                    <img
                                        src={photo.media_url}
                                        alt={photo.content || 'Photo'}
                                        loading="lazy"
                                        style={{
                                            width: '100%', height: 'auto',
                                            display: 'block'
                                        }}
                                    />
                                    {photo.content && (
                                        <div style={{
                                            padding: '12px 16px', color: 'white',
                                            fontSize: 14, background: '#1a1a1a'
                                        }}>{photo.content}</div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            
    );
}