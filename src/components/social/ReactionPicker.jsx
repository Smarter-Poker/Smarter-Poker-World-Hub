/**
 * 😍 EMOJI REACTION PICKER
 * src/components/social/ReactionPicker.jsx
 * 
 * Facebook-style reaction picker that floats above the Like button.
 * Supports: like, love, haha, wow, sad, angry.
 * Uses SocialService.toggleReaction() which already supports any interactionType.
 * 
 * SAFETY: This is a NEW file — no existing code is modified.
 */

import React, { useState, useRef, useEffect } from 'react';

const REACTIONS = [
    { type: 'like', emoji: '👍', label: 'Like', color: '#1877F2' },
    { type: 'love', emoji: '❤️', label: 'Love', color: '#F33E58' },
    { type: 'haha', emoji: '😂', label: 'Haha', color: '#F7B928' },
    { type: 'wow', emoji: '😮', label: 'Wow', color: '#F7B928' },
    { type: 'sad', emoji: '😢', label: 'Sad', color: '#F7B928' },
    { type: 'angry', emoji: '😡', label: 'Angry', color: '#E9710F' },
];

export default function ReactionPicker({ onReact, currentReaction, compact = false }) {
    const [showPicker, setShowPicker] = useState(false);
    const [hoveredReaction, setHoveredReaction] = useState(null);
    const timeoutRef = useRef(null);
    const pickerRef = useRef(null);
    const touchStartRef = useRef(null);
    const longPressRef = useRef(null);

    const handleMouseEnter = () => {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setShowPicker(true), 500); // 500ms delay to show
    };

    const handleMouseLeave = () => {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setShowPicker(false);
            setHoveredReaction(null);
        }, 300);
    };

    // Mobile long-press support: opens picker after 500ms hold
    const handleTouchStart = (e) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        clearTimeout(longPressRef.current);
        longPressRef.current = setTimeout(() => {
            setShowPicker(true);
            // Prevent the subsequent click from firing a default like
            touchStartRef.current = null;
        }, 500);
    };

    const handleTouchMove = (e) => {
        // Cancel long-press if finger moves more than 10px (user is scrolling)
        if (touchStartRef.current) {
            const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
            const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
            if (dx > 10 || dy > 10) {
                clearTimeout(longPressRef.current);
                touchStartRef.current = null;
            }
        }
    };

    const handleTouchEnd = () => {
        clearTimeout(longPressRef.current);
    };

    const handleReaction = (type) => {
        setShowPicker(false);
        setHoveredReaction(null);
        onReact?.(type);
    };

    // Cleanup
    useEffect(() => {
        return () => {
            clearTimeout(timeoutRef.current);
            clearTimeout(longPressRef.current);
        };
    }, []);

    // Close picker when tapping outside (mobile)
    useEffect(() => {
        if (!showPicker) return;
        const handleOutsideTouch = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                setShowPicker(false);
                setHoveredReaction(null);
            }
        };
        document.addEventListener('touchstart', handleOutsideTouch, { passive: true });
        return () => document.removeEventListener('touchstart', handleOutsideTouch);
    }, [showPicker]);

    const activeReaction = currentReaction
        ? REACTIONS.find(r => r.type === currentReaction)
        : null;

    return (
        <div
            style={{ position: 'relative', display: 'inline-block' }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Trigger button */}
            <button
                onClick={() => handleReaction(currentReaction ? currentReaction : 'like')}
                style={{
                    flex: 1, padding: compact ? '6px 8px' : 10, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    color: activeReaction ? activeReaction.color : '#65676B',
                    fontWeight: activeReaction ? 700 : 500, fontSize: 13,
                    transition: 'all 0.2s', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 4, width: '100%'
                }}
            >
                {activeReaction ? activeReaction.emoji : '👍'}{' '}
                {activeReaction ? activeReaction.label : 'Like'}
            </button>

            {/* Floating reaction picker */}
            {showPicker && (
                <div
                    ref={pickerRef}
                    onMouseEnter={() => {
                        clearTimeout(timeoutRef.current);
                    }}
                    onMouseLeave={handleMouseLeave}
                    style={{
                        position: 'absolute', bottom: '100%', left: '50%',
                        transform: 'translateX(-50%)', marginBottom: 4,
                        background: 'white', borderRadius: 28, padding: '6px 8px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        display: 'flex', gap: 2, zIndex: 100,
                        animation: 'reactionPickerFadeIn 0.2s ease',
                    }}
                >
                    {REACTIONS.map((reaction) => (
                        <button
                            key={reaction.type}
                            onClick={(e) => { e.stopPropagation(); handleReaction(reaction.type); }}
                            onMouseEnter={() => setHoveredReaction(reaction.type)}
                            onMouseLeave={() => setHoveredReaction(null)}
                            title={reaction.label}
                            style={{
                                width: 42, height: 42, border: 'none', padding: 0,
                                background: 'transparent', borderRadius: '50%',
                                cursor: 'pointer', fontSize: 28, lineHeight: '42px',
                                transition: 'transform 0.15s ease',
                                transform: hoveredReaction === reaction.type
                                    ? 'scale(1.35) translateY(-6px)'
                                    : 'scale(1)',
                            }}
                        >
                            {reaction.emoji}
                        </button>
                    ))}
                </div>
            )}

            <style>{`
                @keyframes reactionPickerFadeIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.95); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}

/**
 * Utility: Get the display emoji for a reaction type
 */
export function getReactionEmoji(type) {
    const r = REACTIONS.find(r => r.type === type);
    return r ? r.emoji : '👍';
}

/**
 * Utility: Get reaction info
 */
export function getReactionInfo(type) {
    return REACTIONS.find(r => r.type === type) || REACTIONS[0];
}

export { REACTIONS };
