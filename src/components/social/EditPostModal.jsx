/**
 * ✏️ EDIT POST MODAL
 * src/components/social/EditPostModal.jsx
 * 
 * Self-contained modal for editing an existing social post's text content.
 * Uses SocialService.updatePost() which already exists in the service layer.
 * 
 * SAFETY: This is a NEW file — no existing code is modified.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { busEmit } from '../../engine/EventBus';
import { broadcastSync, BROADCAST_TAB_ID } from '../../lib/broadcastSync';

const MAX_CHARS = 2000;

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5',
};

export default function EditPostModal({ post, onClose, onSaved, supabase }) {
    const [content, setContent] = useState(post?.content || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const textareaRef = useRef(null);
    const modalRef = useRef(null);

    // Focus textarea on mount
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            // Place cursor at end
            const len = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(len, len);
        }
    }, []);

    // Close with unsaved changes check
    const handleClose = useCallback(() => {
        if (saving) return;
        const hasChanges = content.trim() !== (post?.content || '').trim();
        if (hasChanges) {
            if (window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
                onClose();
            }
        } else {
            onClose();
        }
    }, [saving, content, post?.content, onClose]);

    // Close on Escape
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && !saving) handleClose();
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [saving, handleClose]);

    // Close on backdrop click
    const handleBackdrop = useCallback((e) => {
        if (e.target === modalRef.current && !saving) handleClose();
    }, [saving, handleClose]);

    const handleSave = async () => {
        const trimmed = content.trim();
        if (!trimmed) {
            setError('Post content cannot be empty');
            return;
        }
        if (trimmed === (post?.content || '').trim()) {
            onClose(); // No changes
            return;
        }
        if (trimmed.length > MAX_CHARS) {
            setError(`Content exceeds ${MAX_CHARS} character limit`);
            return;
        }

        setSaving(true);
        setError('');

        try {
            const { data, error: updateError } = await supabase
                .from('social_posts')
                .update({
                    content: trimmed,
                    updated_at: new Date().toISOString()
                })
                .eq('id', post.id)
                .select()
                .maybeSingle();

            if (updateError) throw updateError;
            // maybeSingle() returns null data on zero rows (RLS denial) — the
            // old code reported success while nothing was written.
            if (!data) throw new Error('Post not updated — you may not have permission');

            onSaved?.({
                ...post,
                content: trimmed,
                updated_at: new Date().toISOString(),
                isEdited: true
            });
            // Emit so feed views can refresh
            try { busEmit.socialPostEdited?.({ postId: post.id, content: trimmed }); } catch { /* non-critical */ }
            broadcastSync('smarter_poker_social_sync', { action: 'refresh_feed', tabId: BROADCAST_TAB_ID });
            onClose();
        } catch (err) {
            console.warn('Edit post failed:', err);
            setError('Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const charCount = content.length;
    const charPercentage = (charCount / MAX_CHARS) * 100;
    const hasChanges = content.trim() !== (post?.content || '').trim();

    return (
        <div
            ref={modalRef}
            onClick={handleBackdrop}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
                zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16, animation: 'editPostFadeIn 0.2s ease'
            }}
        >
            <div style={{
                background: C.card, borderRadius: 12, width: '100%', maxWidth: 520,
                boxShadow: '0 12px 48px rgba(0,0,0,0.3)', overflow: 'hidden',
                animation: 'editPostSlideUp 0.25s ease'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', borderBottom: `1px solid ${C.border}`
                }}>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>Edit Post</h3>
                    <button
                        onClick={handleClose}
                        disabled={saving}
                        style={{
                            width: 36, height: 36, borderRadius: '50%', border: 'none',
                            background: C.bg, cursor: 'pointer', fontSize: 18, color: C.textSec,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        aria-label="Close"
                    >✕</button>
                </div>

                {/* Content */}
                <div style={{ padding: '16px 20px' }}>
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => { setContent(e.target.value); setError(''); }}
                        maxLength={MAX_CHARS}
                        disabled={saving}
                        placeholder="What's on your mind?"
                        style={{
                            width: '100%', minHeight: 160, padding: 14, border: `1px solid ${C.border}`,
                            borderRadius: 10, fontSize: 16, color: C.text, background: C.bg,
                            resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
                            outline: 'none', boxSizing: 'border-box',
                            transition: 'border-color 0.2s'
                        }}
                        onFocus={(e) => e.target.style.borderColor = C.blue}
                        onBlur={(e) => e.target.style.borderColor = C.border}
                    />

                    {/* Character counter */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: 8
                    }}>
                        <div style={{ flex: 1, height: 3, background: '#E4E6EB', borderRadius: 2, marginRight: 12, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%', borderRadius: 2, transition: 'width 0.2s',
                                width: `${Math.min(charPercentage, 100)}%`,
                                background: charPercentage > 90 ? '#F02849' : charPercentage > 75 ? '#FFB800' : C.blue
                            }} />
                        </div>
                        <span style={{
                            fontSize: 12, fontWeight: 500, flexShrink: 0,
                            color: charPercentage > 90 ? '#F02849' : C.textSec
                        }}>{charCount}/{MAX_CHARS}</span>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            marginTop: 10, padding: '8px 12px', background: '#FEE2E2',
                            borderRadius: 8, fontSize: 13, color: '#DC2626', fontWeight: 500
                        }}>{error}</div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex', gap: 8, justifyContent: 'flex-end',
                    padding: '12px 20px', borderTop: `1px solid ${C.border}`
                }}>
                    <button
                        onClick={handleClose}
                        disabled={saving}
                        style={{
                            padding: '10px 20px', background: C.bg, border: 'none', borderRadius: 8,
                            fontWeight: 600, fontSize: 15, color: C.text, cursor: 'pointer'
                        }}
                    >Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !hasChanges || !content.trim()}
                        style={{
                            padding: '10px 24px', background: (saving || !hasChanges || !content.trim()) ? '#B0C4DE' : C.blue,
                            border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15,
                            color: 'white', cursor: (saving || !hasChanges) ? 'not-allowed' : 'pointer',
                            transition: 'background 0.2s'
                        }}
                    >{saving ? 'Saving...' : 'Save'}</button>
                </div>
            </div>

            <style>{`
                @keyframes editPostFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes editPostSlideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}
