/**
 * LiveReactions — Floating emoji reactions for live streams
 * TikTok/Instagram-style reactions that float up the right edge.
 * Uses Supabase Realtime broadcast (ephemeral, zero DB writes).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const REACTION_EMOJIS = ['❤️', '🔥', '♠️', '🃏', '🤑', '👏', '😮'];

function FloatingEmoji({ emoji, id, left, duration }) {
    // FIX: left and duration pre-computed by parent — stable across re-renders
    return (
        <div
            style={{
                position: 'absolute',
                bottom: 0,
                left: `${left}%`,
                fontSize: 28,
                animation: `floatUp ${duration}s ease-out forwards`,
                pointerEvents: 'none',
                userSelect: 'none',
            }}
        >
            {emoji}
        </div>
    );
}

export function LiveReactions({ streamId, userId, isBroadcaster }) {
    const [floaters, setFloaters] = useState([]);
    const [reactionCounts, setReactionCounts] = useState({});
    const channelRef = useRef(null);
    const floaterIdRef = useRef(0);
    // BUG FIX (L2): store active floater timer IDs so we can cancel them on
    // unmount. Without this, if the component unmounts while a floater is
    // in-flight, setFloaters fires on an unmounted component.
    const floaterTimersRef = useRef(new Map());

    const addFloater = useCallback((emoji) => {
        const id = ++floaterIdRef.current;
        // FIX: compute random values here (stable per floater, not per render)
        const left = 15 + Math.random() * 50;
        const duration = 2.5 + Math.random() * 1.5;
        setFloaters(prev => [...prev, { emoji, id, left, duration }]);
        const timerId = setTimeout(() => {
            floaterTimersRef.current.delete(id);
            setFloaters(prev => prev.filter(f => f.id !== id));
        }, Math.round(duration * 1000) + 100);
        floaterTimersRef.current.set(id, timerId);
    }, []);

    // Cancel all pending floater timers on unmount
    useEffect(() => {
        return () => { floaterTimersRef.current.forEach(t => clearTimeout(t)); };
    }, []);

    useEffect(() => {
        if (!streamId) return;

        const ch = supabase.channel(`live-reactions-${streamId}`, {
            config: { broadcast: { self: false } },
        });

        ch.on('broadcast', { event: 'reaction' }, ({ payload }) => {
            if (payload?.emoji) {
                addFloater(payload.emoji);
                setReactionCounts(prev => ({
                    ...prev,
                    [payload.emoji]: (prev[payload.emoji] || 0) + 1,
                }));
            }
        }).subscribe();

        channelRef.current = ch;
        return () => { supabase.removeChannel(ch); };
    }, [streamId, addFloater]);

    const sendReaction = async (emoji) => {
        if (!channelRef.current) return;
        addFloater(emoji); // Show immediately for sender
        setReactionCounts(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
        // Broadcast to all viewers (ephemeral, instant)
        channelRef.current.send({
            type: 'broadcast',
            event: 'reaction',
            // BUG FIX (L1): removed userId from payload. Reactions are ephemeral
            // and anonymous — broadcasting the viewer's identity to all channel
            // subscribers is unnecessary and a privacy leak.
            payload: { emoji },
        }).catch(() => {}); // Non-fatal
        // BUG FIX (LR-1): persist to DB for analytics (fire-and-forget, non-blocking)
        // Without this, reaction_count was always 0 in end-stream analytics card.
        // BUG FIX (LR-2): log errors instead of swallowing — silent RLS/FK failures
        // made it impossible to diagnose missing reaction counts.
        if (streamId && userId) {
            supabase.from('live_reactions').insert({
                stream_id: streamId,
                sender_id: userId,
                emoji,
            }).then(({ error }) => {
                if (error) console.warn('[LiveReactions] DB persist failed:', error.message);
            }).catch((err) => {
                console.warn('[LiveReactions] DB persist threw:', err?.message || err);
            });
        }
    };

    return (
        <>
            <style>{`
                @keyframes floatUp {
                    0%   { transform: translateY(0) scale(1); opacity: 1; }
                    60%  { opacity: 1; }
                    100% { transform: translateY(-200px) scale(1.4); opacity: 0; }
                }
            `}</style>

            {/* Floating emojis overlay */}
            <div style={{
                position: 'absolute',
                bottom: 80,
                right: 12,
                width: 80,
                height: 200,
                pointerEvents: 'none',
                overflow: 'visible',
                zIndex: 20,
            }}>
                {floaters.map(f => <FloatingEmoji key={f.id} emoji={f.emoji} id={f.id} left={f.left} duration={f.duration} />)}
            </div>

            {/* Reaction buttons — hidden for broadcaster (they have FABs in same position) */}
            {!isBroadcaster && <div style={{
                position: 'absolute',
                bottom: 76,
                right: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '8px 12px',
                zIndex: 30,
            }}>
                {REACTION_EMOJIS.map(emoji => (
                    <button
                        key={emoji}
                        onClick={() => sendReaction(emoji)}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            border: 'none',
                            background: 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(8px)',
                            fontSize: 20,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'transform 0.1s',
                        }}
                        onMouseDown={e => { e.currentTarget.style.transform = 'scale(1.3)'; }}
                        onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                        onTouchStart={e => { e.currentTarget.style.transform = 'scale(1.3)'; }}
                        onTouchEnd={e => {
                            // FIX: Don't preventDefault here — let the synthetic click fire
                            // so sendReaction works on both mobile and desktop via onClick.
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                        aria-label={`React with ${emoji}`}
                    >
                        {emoji}
                    </button>
                ))}
            </div>}
        </>
    );
}

export default LiveReactions;
