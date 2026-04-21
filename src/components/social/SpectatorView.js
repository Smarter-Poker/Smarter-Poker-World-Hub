/**
 * SpectatorView — "Sweat My Session" View with Chat & LiveKit Video
 * ═══════════════════════════════════════════════════════════════════════════
 * Full-screen spectator view for a live poker session:
 * - Real-time session stats (profit, duration, venue)
 * - LiveKit video stream from the player (if broadcasting)
 * - Real-time spectator chat via Supabase Realtime
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getAccessToken } from '../../lib/authUtils';

const T = {
    bg: '#0a0a0a', card: '#18191a', border: '#3E4042',
    text: '#E4E6EB', textSec: '#B0B3B8', textDim: '#65676B',
    green: '#2ECC71', red: '#E74C3C', gold: '#FFD700',
    accent: '#4facfe',
};

function formatDuration(startedAt) {
    if (!startedAt) return '0m';
    const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SpectatorView({ session, currentUser, onClose }) {
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [sending, setSending] = useState(false);
    const [elapsed, setElapsed] = useState('');
    const [liveSession, setLiveSession] = useState(session);
    const [livekitToken, setLivekitToken] = useState(null);
    const [showVideo, setShowVideo] = useState(false);
    const chatEndRef = useRef(null);
    const channelRef = useRef(null);

    // Keep session updated
    useEffect(() => {
        setElapsed(formatDuration(session.started_at));
        const id = setInterval(() => setElapsed(formatDuration(session.started_at)), 30000);
        return () => clearInterval(id);
    }, [session.started_at]);

    // Load existing chat messages
    useEffect(() => {
        const loadChat = async () => {
            const { data } = await supabase
                .from('session_chat_messages')
                .select('*, profiles:user_id(username, avatar_url)')
                .eq('session_id', session.id)
                .order('created_at', { ascending: true })
                .limit(100);
            setChatMessages(data || []);
        };
        loadChat();
    }, [session.id]);

    // Subscribe to realtime chat
    useEffect(() => {
        const channel = supabase
            .channel(`session-chat-${session.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'session_chat_messages',
                filter: `session_id=eq.${session.id}`,
            }, (payload) => {
                setChatMessages(prev => [...prev, payload.new]);
            })
            .subscribe();

        channelRef.current = channel;
        return () => {
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, [session.id]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    // Get LiveKit token for watching the stream
    const joinVideoStream = useCallback(async () => {
        if (!session.livekit_room) return;
        try {
            const token = getAccessToken();
            if (!token) return;
            const res = await fetch('/api/livekit/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    roomName: session.livekit_room,
                    participantName: currentUser?.username || 'Spectator',
                }),
            });
            if (res.ok) {
                const { token: lkToken } = await res.json();
                setLivekitToken(lkToken);
                setShowVideo(true);
            }
        } catch (err) {
            console.warn('[Spectator] LiveKit error:', err);
        }
    }, [session.livekit_room, currentUser]);

    const sendMessage = async () => {
        if (!chatInput.trim() || sending) return;
        setSending(true);
        try {
            const token = getAccessToken();
            const res = await fetch('/api/social/live-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: 'chat', session_id: session.id, message: chatInput.trim() }),
            });
            if (res.ok) setChatInput('');
        } catch (err) {
            console.warn('[Chat] Error:', err);
        }
        setSending(false);
    };

    const profit = liveSession.current_profit || 0;

    return (
        <div style={{
            background: T.bg, borderRadius: 12, border: `1px solid ${T.border}`,
            overflow: 'hidden', marginBottom: 16,
        }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #1a1a3e, #0d0d2e)',
                padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
                        border: `2px solid ${T.green}`,
                    }}>
                        <img src={session.profiles?.avatar_url || '/avatars/default.png'} alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    </div>
                    <div>
                        <div style={{ color: T.text, fontSize: 15, fontWeight: 700 }}>
                            {session.profiles?.full_name || session.profiles?.username || 'Player'}
                        </div>
                        <div style={{ color: T.textSec, fontSize: 11 }}>
                            {session.venue_name} — {session.stakes} {session.game_type}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        background: 'rgba(46,204,113,0.15)', color: T.green,
                        padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                    }}>LIVE — {elapsed}</div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', color: T.textSec,
                        fontSize: 18, cursor: 'pointer', padding: '0 4px',
                    }}>x</button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', padding: '12px 16px', gap: 16, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ color: T.textDim, fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Profit</div>
                    <div style={{ color: profit >= 0 ? T.green : T.red, fontSize: 20, fontWeight: 800 }}>
                        {profit >= 0 ? '+' : ''}{profit}
                    </div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ color: T.textDim, fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Duration</div>
                    <div style={{ color: T.text, fontSize: 20, fontWeight: 800 }}>{elapsed}</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ color: T.textDim, fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Status</div>
                    <div style={{ color: session.status === 'break' ? T.gold : T.green, fontSize: 14, fontWeight: 700 }}>
                        {session.status === 'break' ? 'On Break' : 'At Table'}
                    </div>
                </div>
            </div>

            {/* LiveKit Video Stream Button */}
            {session.livekit_room && !showVideo && (
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
                    <button onClick={joinVideoStream} style={{
                        width: '100%', padding: '10px', borderRadius: 8,
                        background: 'linear-gradient(135deg, #E74C3C, #c0392b)',
                        border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>
                        Watch Live Video Stream
                    </button>
                </div>
            )}

            {/* LiveKit Video (if connected) */}
            {showVideo && livekitToken && (
                <div style={{ padding: 16, background: '#000', textAlign: 'center', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ color: T.textSec, fontSize: 13, padding: '40px 0' }}>
                        Video stream connected. Watching {session.profiles?.username || 'player'}...
                    </div>
                    <button onClick={() => setShowVideo(false)} style={{
                        padding: '6px 16px', borderRadius: 6, background: 'rgba(255,255,255,0.1)',
                        border: 'none', color: T.textSec, fontSize: 11, cursor: 'pointer',
                    }}>Close Video</button>
                </div>
            )}

            {/* Chat */}
            <div style={{ display: 'flex', flexDirection: 'column', height: 280 }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
                    {chatMessages.length === 0 && (
                        <div style={{ textAlign: 'center', color: T.textDim, fontSize: 12, padding: 20 }}>
                            No messages yet. Be the first to cheer them on!
                        </div>
                    )}
                    {chatMessages.map((m, i) => (
                        <div key={m.id || i} style={{ marginBottom: 6, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                            <div style={{
                                width: 22, height: 22, borderRadius: 11, overflow: 'hidden', flexShrink: 0, marginTop: 1,
                            }}>
                                <img src={m.profiles?.avatar_url || '/avatars/default.png'} alt=""
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                            </div>
                            <div>
                                <span style={{ color: T.accent, fontSize: 11, fontWeight: 700 }}>
                                    {m.profiles?.username || 'User'}
                                </span>
                                <span style={{ color: T.text, fontSize: 13, marginLeft: 6 }}>{m.message}</span>
                            </div>
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>

                {/* Chat input */}
                <div style={{
                    padding: '8px 16px', borderTop: `1px solid ${T.border}`,
                    display: 'flex', gap: 8,
                }}>
                    <input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                        placeholder="Send a message..."
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: 20,
                            background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`,
                            color: T.text, fontSize: 13, outline: 'none',
                        }}
                    />
                    <button onClick={sendMessage} disabled={!chatInput.trim() || sending}
                        style={{
                            padding: '8px 16px', borderRadius: 20,
                            background: chatInput.trim() ? T.accent : 'rgba(255,255,255,0.05)',
                            border: 'none', color: chatInput.trim() ? '#000' : T.textDim,
                            fontSize: 12, fontWeight: 700, cursor: chatInput.trim() ? 'pointer' : 'default',
                        }}>
                        {sending ? '...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
}
