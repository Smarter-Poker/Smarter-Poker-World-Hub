/**
 * 🖼️ POST IMAGE LIGHTBOX
 * src/components/social/PostImageLightbox.jsx
 * 
 * Fullscreen lightbox for viewing post images/videos.
 * Navigate between media with arrow keys or buttons.
 * 
 * SAFETY: This is a NEW file — no existing code is modified.
 */

import React, { useState, useEffect, useCallback } from 'react';

export default function PostImageLightbox({ mediaUrls = [], initialIndex = 0, contentType, onClose }) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    const canPrev = currentIndex > 0;
    const canNext = currentIndex < mediaUrls.length - 1;
    const current = mediaUrls[currentIndex];
    const isVideo = contentType === 'video' || current?.endsWith('.mp4') || current?.endsWith('.webm');

    const goNext = useCallback(() => {
        if (canNext) setCurrentIndex(i => i + 1);
    }, [canNext]);

    const goPrev = useCallback(() => {
        if (canPrev) setCurrentIndex(i => i - 1);
    }, [canPrev]);

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowLeft') goPrev();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose, goNext, goPrev]);

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    return (
        <div
            onClick={onClose}
            className="sp-fullscreen-overlay"
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
                zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'lbFadeIn 0.2s ease',
            }}
        >
            {/* Close button. Sits below the status bar (safe-area-inset-top),
                44x44 tap target (phase 0b). */}
            <button
                onClick={onClose}
                aria-label="Close"
                className="sp-icon-btn sp-overlay-close"
                style={{
                    position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: 12, zIndex: 10,
                    width: 44, height: 44, minWidth: 44, minHeight: 44, borderRadius: '50%', border: 'none',
                    background: 'rgba(255,255,255,0.1)', color: 'white',
                    fontSize: 24, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                }}
            >✕</button>

            {/* Counter */}
            {mediaUrls.length > 1 && (
                <div style={{
                    position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 20px)', left: '50%', transform: 'translateX(-50%)',
                    color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 600,
                    background: 'rgba(0,0,0,0.4)', padding: '4px 14px', borderRadius: 12,
                    backdropFilter: 'blur(4px)'
                }}>
                    {currentIndex + 1} / {mediaUrls.length}
                </div>
            )}

            {/* Previous button */}
            {canPrev && (
                <button
                    onClick={(e) => { e.stopPropagation(); goPrev(); }}
                    aria-label="Previous image"
                    style={{
                        position: 'absolute', left: 16, zIndex: 10,
                        width: 48, height: 48, borderRadius: '50%', border: 'none',
                        background: 'rgba(255,255,255,0.15)', color: 'white',
                        fontSize: 24, cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(4px)', transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                >◀</button>
            )}

            {/* Media */}
            <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
                {isVideo ? (
                    <video
                        key={current}
                        src={current}
                        controls
                        autoPlay
                        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 4 }}
                    />
                ) : (
                    <img
                        key={current}
                        src={current}
                        alt={`Image ${currentIndex + 1}`}
                        style={{
                            maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
                            borderRadius: 4, animation: 'lbImageFade 0.3s ease'
                        }}
                    />
                )}
            </div>

            {/* Next button */}
            {canNext && (
                <button
                    onClick={(e) => { e.stopPropagation(); goNext(); }}
                    aria-label="Next image"
                    style={{
                        position: 'absolute', right: 16, zIndex: 10,
                        width: 48, height: 48, borderRadius: '50%', border: 'none',
                        background: 'rgba(255,255,255,0.15)', color: 'white',
                        fontSize: 24, cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(4px)', transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                >▶</button>
            )}

            <style>{`
                @keyframes lbFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes lbImageFade {
                    from { opacity: 0; transform: scale(0.97); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
