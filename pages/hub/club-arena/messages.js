/* ═══════════════════════════════════════════════════════════════
   Club Arena Messages — Native Hub Page (replaces iframe)
   Real-time club chat with auto-polling and composer
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiCall, apiGet } from '../../../src/lib/club-arena/apiClient';
import s from '../../../src/styles/UnionDashboard.module.css';

const formatTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function ClubArenaMessagesPage() {
  useTrainingBus('club-arena-messages');
  const router = useRouter();

  const [clubId, setClubId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);

  const chatEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);
  const failCountRef = useRef(0);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Smart auto-scroll: only if user is near the bottom
  const scrollToBottom = useCallback((force = false) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (force || isNearBottom) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const loadMessages = useCallback(async (cId, isInitial = false) => {
    try {
      const res = await apiGet(`/api/club-arena/club-chat?clubId=${cId}&limit=100`);
      if (mountedRef.current && res.messages) {
        setMessages(prev => {
          // Merge optimistic messages (negative ids) with server messages
          const optimistic = prev.filter(m => m._optimistic && !res.messages.some(rm => rm.message === m.message && rm.user_id === m.user_id));
          return [...res.messages, ...optimistic];
        });
        setTimeout(() => scrollToBottom(isInitial), 50);
        failCountRef.current = 0;
        if (mountedRef.current) setConnectionLost(false);
      }
    } catch (err) {
      console.error('[messages] load fail:', err);
      failCountRef.current++;
      if (failCountRef.current >= 3 && mountedRef.current) {
        setConnectionLost(true);
      }
    }
  }, [scrollToBottom]);

  // Auth + init
  useEffect(() => {
    let cancelled = false;
    let authSub = null;

    const init = async (session) => {
      if (cancelled) return;
      setUserId(session.user.id);

      const qClub = router.query.club || router.query.clubId;
      const { supabase } = await import('../../../src/lib/supabase');
      let targetClub = qClub;

      if (!targetClub) {
        const { data: mem } = await supabase.from('club_members').select('club_id').eq('user_id', session.user.id).limit(1).maybeSingle();
        targetClub = mem?.club_id;
      }

      if (targetClub && !cancelled) {
        setClubId(targetClub);
        await loadMessages(targetClub, true);
        setLoading(false);
      } else if (!cancelled) {
        setError('No club found.');
        setLoading(false);
      }
    };

    (async () => {
      const { supabase } = await import('../../../src/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await init(session); return; }

      const timeout = setTimeout(() => { if (!cancelled) { setError('login_required'); setLoading(false); } }, 3000);
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
        clearTimeout(timeout);
        if (sess && !cancelled) await init(sess);
        else if (!cancelled) { setError('login_required'); setLoading(false); }
        subscription?.unsubscribe();
      });
      authSub = subscription;
    })();

    return () => { cancelled = true; authSub?.unsubscribe?.(); };
  }, [router.query.club, router.query.clubId, loadMessages]);

  // Auto-polling every 10s
  useEffect(() => {
    if (!clubId) return;
    pollRef.current = setInterval(() => loadMessages(clubId), 10000);
    return () => clearInterval(pollRef.current);
  }, [clubId, loadMessages]);

  // Send message (optimistic)
  const handleSend = async () => {
    if (!draft.trim() || !clubId || sending) return;
    const msgText = draft.trim();
    const optimisticMsg = {
      id: `opt-${Date.now()}`,
      user_id: userId,
      message: msgText,
      created_at: new Date().toISOString(),
      display_name: 'You',
      _optimistic: true,
    };
    setDraft('');
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      setSending(true);
      await apiCall('/api/club-arena/club-chat', { clubId, message: msgText });
      await loadMessages(clubId, true);
    } catch (err) {
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      alert('Failed to send: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (loading) {
    return (
      <HubErrorBoundary name="Messages">
        <SEOHead title="Messages | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}><div className={s.loading}>Connecting to Chat...</div></div>
      </HubErrorBoundary>
    );
  }

  return (
    <HubErrorBoundary name="Messages">
      <SEOHead title="Messages | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>

          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Session Expired</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : (
            <>

          {/* Connection Lost Banner */}
          {connectionLost && (
            <div style={{ background: '#FA383E22', border: '1px solid #FA383E44', borderRadius: '8px', padding: '10px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#FA383E', fontSize: '13px', fontWeight: 600 }}>⚠️ Connection lost — retrying...</span>
              <button onClick={() => { failCountRef.current = 0; setConnectionLost(false); loadMessages(clubId); }} className={s.btnGhost} style={{ fontSize: '12px', padding: '4px 12px', color: '#FA383E', border: '1px solid #FA383E' }}>↻ Retry Now</button>
            </div>
          )}

          {/* Header */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>💬 Club Chat</div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}>
                <button className={s.btnGhost}>🏠 Lobby</button>
              </Link>
            </div>
          </div>

          {/* Chat Window */}
          <div style={{
            background: '#242526', borderRadius: '12px', border: '1px solid #3A3B3C',
            display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', minHeight: '400px',
          }}>
            {/* Messages Scroll Area */}
            <div
              ref={scrollContainerRef}
              style={{
                flex: 1, overflowY: 'auto', padding: '16px',
                display: 'flex', flexDirection: 'column', gap: '8px',
              }}
            >
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#65676B', padding: '60px 20px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>💬</div>
                  <div style={{ fontSize: '16px' }}>No messages yet. Start the conversation!</div>
                </div>
              ) : messages.map(msg => {
                const isMe = msg.user_id === userId;
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex', gap: '10px',
                      flexDirection: isMe ? 'row-reverse' : 'row',
                      alignItems: 'flex-end',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                      background: isMe ? '#2374E1' : '#3A3B3C',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', fontSize: '14px',
                    }}>
                    {(() => {
                      const safeAvatar = msg.avatar_url && /^https:\/\//i.test(msg.avatar_url) ? msg.avatar_url : null;
                      return safeAvatar
                        ? <img src={safeAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (msg.display_name || 'P')[0].toUpperCase();
                    })()}
                    </div>

                    {/* Bubble */}
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px', borderRadius: '16px',
                      background: isMe ? '#2374E1' : '#3A3B3C',
                      color: '#E4E6EB',
                      borderBottomRightRadius: isMe ? '4px' : '16px',
                      borderBottomLeftRadius: isMe ? '16px' : '4px',
                    }}>
                      {!isMe && (
                        <div style={{ fontSize: '11px', color: '#B0B3B8', fontWeight: 700, marginBottom: '4px' }}>
                          {msg.display_name || 'Player'}
                        </div>
                      )}
                      <div style={{ fontSize: '14px', lineHeight: '1.4', wordBreak: 'break-word' }}>{msg.message}</div>
                      <div style={{ fontSize: '10px', color: isMe ? 'rgba(255,255,255,0.5)' : '#65676B', marginTop: '4px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '4px', alignItems: 'center' }}>
                        {msg._optimistic && <span style={{ color: '#F5A623' }}>⏳</span>}
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Composer */}
            <div style={{
              padding: '12px 16px', borderTop: '1px solid #3A3B3C',
              display: 'flex', gap: '12px', alignItems: 'center', background: '#18191A',
              borderRadius: '0 0 12px 12px',
            }}>
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                maxLength={500}
                style={{
                  flex: 1, background: '#3A3B3C', border: 'none', borderRadius: '20px',
                  padding: '10px 16px', color: '#E4E6EB', fontSize: '14px', outline: 'none',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                style={{
                  background: draft.trim() ? '#2374E1' : '#3A3B3C',
                  color: '#fff', border: 'none', borderRadius: '50%',
                  width: '40px', height: '40px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: draft.trim() ? 'pointer' : 'default',
                  fontSize: '18px', transition: 'background 0.2s',
                }}
              >
                {sending ? '⏳' : '➤'}
              </button>
            </div>
          </div>
        </>
          )}
        </div>
      </div>
    </HubErrorBoundary>
  );
}
