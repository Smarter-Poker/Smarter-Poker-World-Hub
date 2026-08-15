/**
 * LiveReactions — Floating emoji reactions for live streams
 * TikTok/Instagram-style reactions that float up the right edge.
 * Uses Supabase Realtime broadcast (ephemeral, zero DB writes).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const REACTION_EMOJIS = ['❤️', '🔥', '♠️', '🃏', '🤑', '👏', '😮'];

// BUG-FIX-DEEP-AUDIT-R4 REACT-5: allowlist set for incoming broadcast
// payload validation. Untrusted channel sender (or compromised client)
// could send arbitrary strings as `emoji` — a 10MB payload or weird
// unicode would crash the renderer. We only render reactions that match
// the exact emoji set we ship in the UI.
const REACTION_EMOJI_SET = new Set(REACTION_EMOJIS);

// BUG-FIX-DEEP-AUDIT-R4 REACT-1: minimum interval between send events
// from a single client. Without this, holding any reaction button (or
// auto-clicking via console) lets one viewer flood the broadcast channel
// and the DB. 250ms gives a comfortable tap cadence without being a spam
// surface.
const SEND_THROTTLE_MS = 250;

// BUG-FIX-DEEP-AUDIT-R4 REACT-3: hard cap on simultaneous floating
// emojis. Hostile or buggy peers could broadcast 10k reactions/sec; the
// 4s float-out timer eventually clears them but during a burst we'd be
// rendering thousands of nodes at once, spiking CPU/GPU. Drop excess
// rather than render them.
const MAX_FLOATERS = 60;

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
    // BUG-FIX-DEEP-AUDIT-R4 REACT-2: `reactionCounts` was set but never
    // read anywhere in this component. Dead state that grew with every
    // reaction over the lifetime of a long stream. Removed — the
    // analytics card consumes the DB-persisted reaction_count via a
    // different path entirely.
    const channelRef = useRef(null);
    const floaterIdRef = useRef(0);
    // BUG FIX (L2): store active floater timer IDs so we can cancel them on
    // unmount. Without this, if the component unmounts while a floater is
    // in-flight, setFloaters fires on an unmounted component.
    const floaterTimersRef = useRef(new Map());
    // BUG-FIX-DEEP-AUDIT-R4 REACT-1: last send timestamp for client-side
    // throttle.
    const lastSendAtRef = useRef(0);

    const addFloater = useCallback((emoji) => {
        // BUG-FIX-DEEP-AUDIT-R4 REACT-3: hard cap. If we're already at
        // MAX_FLOATERS, drop the new one rather than render it. The
        // animation already feels chaotic above ~30 — 60 is the ceiling
        // before frame drops on mid-range mobile.
        if (floaterTimersRef.current.size >= MAX_FLOATERS) return;

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
            // BUG-FIX-DEEP-AUDIT-R4 REACT-5: validate against allowlist
            // before rendering. Rejects payloads with arbitrary strings,
            // huge buffers, or anything that isn't one of our 7 emojis.
            if (payload?.emoji && REACTION_EMOJI_SET.has(payload.emoji)) {
                addFloater(payload.emoji);
            }
        }).subscribe();

        channelRef.current = ch;
        return () => { supabase.removeChannel(ch); };
    }, [streamId, addFloater]);

    const sendReaction = async (emoji) => {
        if (!channelRef.current) return;
        // BUG-FIX-DEEP-AUDIT-R4 REACT-1: throttle. Drop sends that come
        // less than SEND_THROTTLE_MS after the previous one. No visible
        // feedback — a held button just sends at the throttle cadence
        // rather than queuing.
        const now = Date.now();
        if (now - lastSendAtRef.current < SEND_THROTTLE_MS) return;
        lastSendAtRef.current = now;
        // Sanity-check the local emoji too (defense in depth).
        if (!REACTION_EMOJI_SET.has(emoji)) return;

        addFloater(emoji); // Show immediately for sender
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
            // increment_live_reaction_count keeps live_streams.reaction_count
            // in sync (direct client writes to that column are blocked by
            // fn_live_streams_guard_update; the RPC was never called, so feed
            // tiles always showed 0 reactions).
            supabase.rpc('increment_live_reaction_count', { p_stream_id: streamId })
                .then(({ error }) => { if (error) console.warn('[LiveReactions] count RPC failed:', error.message); });
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
                        onClick={(e) => {
                            // BUG-FIX-6: stop propagation so the click doesn't bubble up to
                            // the chat-expand overlay div or any other parent click handler,
                            // which was causing false error messages when tapping emojis.
                            e.stopPropagation();
                            sendReaction(emoji);
                        }}
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
                        onTouchStart={e => { e.stopPropagation(); e.currentTarget.style.transform = 'scale(1.3)'; }}
                        onTouchEnd={e => {
                            e.stopPropagation();
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
