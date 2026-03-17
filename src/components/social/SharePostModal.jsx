/**
 * 📤 SHARE POST MODAL
 * src/components/social/SharePostModal.jsx
 * 
 * A proper share modal with copy link, social platform sharing options,
 * and visual feedback. Replaces clipboard-only sharing.
 * 
 * SAFETY: This is a NEW file — no existing code is modified.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { busEmit } from '../../engine/EventBus';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#22C55E',
};

const SHARE_PLATFORMS = [
    {
        id: 'copy',
        label: 'Copy Link',
        icon: '🔗',
        color: '#65676B',
        action: (url) => navigator.clipboard?.writeText(url)
    },
    {
        id: 'twitter',
        label: 'X (Twitter)',
        icon: '𝕏',
        color: '#000000',
        action: (url, text) => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
    },
    {
        id: 'facebook',
        label: 'Facebook',
        icon: 'f',
        color: '#1877F2',
        action: (url) => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank')
    },
    {
        id: 'whatsapp',
        label: 'WhatsApp',
        icon: '📱',
        color: '#25D366',
        action: (url, text) => window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank')
    },
    {
        id: 'email',
        label: 'Email',
        icon: '✉️',
        color: '#EA4335',
        action: (url, text) => window.open(`mailto:?subject=${encodeURIComponent('Check this out on Smarter.Poker')}&body=${encodeURIComponent(text + '\n\n' + url)}`)
    }
];

export default function SharePostModal({ post, authorUsername, onClose, onShared }) {
    const [copied, setCopied] = useState(false);
    const modalRef = useRef(null);
    const postUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/hub/user/${authorUsername || ''}?post=${post?.id || ''}`
        : '';
    const shareText = post?.content?.slice(0, 120) || 'Check out this post on Smarter.Poker';

    // Close on Escape
    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const handleBackdrop = useCallback((e) => {
        if (e.target === modalRef.current) onClose();
    }, [onClose]);

    const handlePlatformClick = async (platform) => {
        try {
            await platform.action(postUrl, shareText);
            if (platform.id === 'copy') {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
            // Notify other views/tabs of share action
            if (post?.id) {
                busEmit.dataMutated?.('social_posts');
            }
            onShared?.(platform.id);
        } catch (err) {
            console.error('Share error:', err);
        }
    };

    return (
        <div
            ref={modalRef}
            onClick={handleBackdrop}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
                zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                padding: 16, animation: 'shareFadeIn 0.2s ease'
            }}
        >
            <div style={{
                background: C.card, borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480,
                boxShadow: '0 -8px 32px rgba(0,0,0,0.2)', paddingBottom: 'env(safe-area-inset-bottom, 0)',
                animation: 'shareSlideUp 0.3s ease'
            }}>
                {/* Handle bar */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: '#DADDE1' }} />
                </div>

                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 20px 16px'
                }}>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>Share Post</h3>
                    <button
                        onClick={onClose}
                        style={{
                            width: 36, height: 36, borderRadius: '50%', border: 'none',
                            background: C.bg, cursor: 'pointer', fontSize: 18, color: C.textSec,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >✕</button>
                </div>

                {/* URL Preview */}
                <div style={{
                    margin: '0 20px 16px', padding: '12px 16px',
                    background: C.bg, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10
                }}>
                    <span style={{ fontSize: 16 }}>🔗</span>
                    <div style={{
                        flex: 1, fontSize: 13, color: C.textSec, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>{postUrl}</div>
                    {copied && (
                        <span style={{ fontSize: 12, color: C.green, fontWeight: 600, flexShrink: 0 }}>
                            Copied!
                        </span>
                    )}
                </div>

                {/* Share buttons */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 8, padding: '0 20px 24px'
                }}>
                    {SHARE_PLATFORMS.map((platform) => (
                        <button
                            key={platform.id}
                            onClick={() => handlePlatformClick(platform)}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                gap: 8, padding: '12px 4px', background: 'none', border: 'none',
                                cursor: 'pointer', borderRadius: 12, transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.bg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <div style={{
                                width: 48, height: 48, borderRadius: '50%',
                                background: platform.color + '15',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: platform.id === 'twitter' ? 22 : (platform.id === 'facebook' ? 20 : 22),
                                fontWeight: 800, color: platform.color,
                                border: `2px solid ${platform.color}22`
                            }}>
                                {platform.icon}
                            </div>
                            <span style={{
                                fontSize: 11, color: C.text, fontWeight: 500,
                                whiteSpace: 'nowrap'
                            }}>{platform.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes shareFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes shareSlideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
