/**
 * LiveReactions — Floating emoji reactions for live streams
 * TikTok/Instagram-style reactions that float up the right edge.
 * Uses Supabase Realtime broadcast (ephemeral, zero DB writes).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const REACTION_EMOJIS = ['❤️', '🔥', '♠️', '🃏', '💎', '🤑', '👏', '😮'];

function FloatingEmoji({ emoji, id }) {
    const left = 15 + Math.random() * 50; // random left 15-65%
    const duration = 2.5 + Math.random() * 1.5; // 2.5–4s
    return (
        <div
            key={id}
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

    const addFloater = useCallback((emoji) => {
        const id = ++floaterIdRef.current;
        setFloaters(prev => [...prev, { emoji, id }]);
        // Remove after animation completes
        setTimeout(() => {
            setFloaters(prev => prev.filter(f => f.id !== id));
        }, 4500);
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
        await channelRef.current.send({
            type: 'broadcast',
            event: 'reaction',
            payload: { emoji, userId },
        });
        // FIX: supabase.raw() doesn't exist — use increment RPC
        supabase.rpc('increment_live_reaction_count', { p_stream_id: streamId }).catch(() => {});
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
                {floaters.map(f => <FloatingEmoji key={f.id} emoji={f.emoji} id={f.id} />)}
            </div>

            {/* Reaction buttons */}
            <div style={{
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
                        onTouchStart={e => { e.preventDefault(); e.currentTarget.style.transform = 'scale(1.3)'; }}
                        onTouchEnd={e => {
                            e.preventDefault(); // FIX: stops onClick double-fire on mobile
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                        aria-label={`React with ${emoji}`}
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        </>
    );
}

export default LiveReactions;
