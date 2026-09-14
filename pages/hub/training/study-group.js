// TRAIN-CSS-TOKENS-BATCH5-57 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import { authedFetch } from '../../../src/lib/authUtils';
// TRAIN-WIRE-EMPTY-5f — adoption: shared empty-state primitive

// BUG FIX (TRAIN-STUDYGROUP-A11Y-1): SVG icon components replacing the
// study-group emoji set: crown admin marker, upload empty hand viewer, close,
// send arrow, back. Card-suit glyphs in hand strings remain
// (semantic). Same surface-specific a11y pattern as PR #320/#322/#324/
// #327-#356.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=16, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function CrownIcon({ size=12 })    { return <_Svg size={size}><path d="M2 7l5 5 5-9 5 9 5-5-2 12H4L2 7z"/><path d="M4 19h16"/></_Svg>; }
function SendIcon({ size=16 })     { return <_Svg size={size}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></_Svg>; }
function BackArrowIcon({ size=14 }){ return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }


export default function StudyGroupRoom() {
  const router = useRouter();
  const { roomId } = router.query;
  const mountedRef = useRef(true);
  const roomRequestRef = useRef(null);
  const roomRequestInFlightRef = useRef(false);

  useTrainingBus('study-group');

  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [inviteStatus, setInviteStatus] = useState(null);

  const loadRoom = useCallback(async ({ quiet = false } = {}) => {
    if (!roomId || roomRequestInFlightRef.current) return;
    const controller = new AbortController();
    roomRequestRef.current = controller;
    roomRequestInFlightRef.current = true;
    let timedOut = false;
    const deadline = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);
    if (!quiet && mountedRef.current) setLoading(true);
    try {
      const [roomResponse, messageResponse] = await Promise.all([
        authedFetch(`/api/training/study-groups/${roomId}`, { signal: controller.signal }),
        authedFetch(`/api/training/study-groups/${roomId}/messages`, { signal: controller.signal }),
      ]);
      const roomPayload = await roomResponse.json().catch(() => null);
      const messagePayload = await messageResponse.json().catch(() => null);
      if (!roomResponse.ok || !roomPayload?.group) throw new Error(roomPayload?.error || 'Study room could not be loaded');
      if (!messageResponse.ok || !messagePayload?.success) throw new Error(messagePayload?.error || 'Study room discussion could not be loaded');
      if (mountedRef.current && !controller.signal.aborted) {
        setGroup(roomPayload.group);
        setParticipants(roomPayload.members || []);
        setMessages(messagePayload.messages || []);
        setError(null);
      }
    } catch (loadError) {
      if (controller.signal.aborted && !timedOut) return;
      if (mountedRef.current) {
        setError(timedOut
          ? 'Study room verification timed out. Please try again.'
          : loadError?.message || 'Study room could not be loaded');
      }
    } finally {
      window.clearTimeout(deadline);
      if (roomRequestRef.current === controller) {
        roomRequestRef.current = null;
        roomRequestInFlightRef.current = false;
        if (!quiet && mountedRef.current) setLoading(false);
      }
    }
  }, [roomId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      roomRequestRef.current?.abort();
      roomRequestRef.current = null;
      roomRequestInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!roomId) return undefined;
    loadRoom();
    const refreshIfVisible = () => {
      if (typeof document === 'undefined' || !document.hidden) loadRoom({ quiet: true });
    };
    const timer = window.setInterval(refreshIfVisible, 5000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      const activeRequest = roomRequestRef.current;
      roomRequestRef.current = null;
      roomRequestInFlightRef.current = false;
      activeRequest?.abort();
    };
  }, [roomId, loadRoom]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const body = inputMsg.trim();
    if (!body || sending || !roomId) return;
    setSending(true);
    try {
      const response = await authedFetch(`/api/training/study-groups/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.message) throw new Error(payload?.error || 'Message could not be sent');
      setMessages((current) => [...current, payload.message]);
      setInputMsg('');
      setError(null);
    } catch (sendError) {
      setError(sendError?.message || 'Message could not be sent');
    } finally {
      setSending(false);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/hub/training/study-group-finder?join=${roomId}`);
      setInviteStatus('Invite Link Copied');
    } catch {
      setInviteStatus('Copy Failed');
    }
  };

  return (
    <PageTransition>
      <Head>
        <title>Study Group | Smarter.Poker</title>
      </Head>
      <UniversalHeader pageDepth={2} hideLeftIcon />

      <div className="sp-training-command sp-training-command--study-room" style={styles.container}>
        <div className="sp-command-header" style={styles.header}>
          <button
            type="button"
            aria-label="Back to training hub"
            onClick={() => router.push('/hub/training')}
            style={styles.backButton}
          >
            {/* TRAIN-STUDYGROUP-A11Y-1: SVG back arrow + visible label */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <BackArrowIcon size={14} />
              Hub
            </span>
          </button>
          <div>
            <h1 style={styles.title}>{group?.name || 'COLLABORATIVE STUDY ROOM'}</h1>
            <p style={styles.subtitle}>Persistent Member Room · Live Discussion Sync</p>
          </div>
        </div>

        <ErrorBanner message={error} onRetry={() => loadRoom()} />

        {!roomId ? (
          <motion.div
            className="sp-command-main sp-command-card-stage"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={styles.createBox}
          >
            <h2>Choose A Study Group</h2>
            <p style={{ color: 'var(--sp-fg-muted)', marginBottom: 24 }}>
              Join An Existing Room Or Create A New Persistent Study Group From The Finder.
            </p>
            <button type="button" aria-label="Open study group finder" onClick={() => router.push('/hub/training/study-group-finder')} style={styles.createBtn}>
              Open Study Group Finder
            </button>
          </motion.div>
        ) : loading && !group ? (
          <div className="sp-command-main" style={{ padding: 40, textAlign: 'center', color: 'var(--sp-fg-dim)' }}>
            Loading Study Room...
          </div>
        ) : (
          <div className="sp-command-main sp-command-room-layout" style={styles.roomLayout}>
            {/* Left: Participants & Hand Viewer */}
            <div style={styles.mainCol}>
              <div style={styles.participantsBar}>
                <div style={{ fontWeight: 700, color: 'var(--sp-fg-muted)', fontSize: 12, marginRight: 16 }}>
                  MEMBERS ({participants.length})
                </div>
                {participants.map((p) => (
                  <div key={p.user_id} style={styles.participantChip}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--sp-fg-dim)',
                        marginRight: 8,
                      }}
                    />
                    {p.profile?.display_name || p.profile?.username || 'Member'}{' '}
                    {/* TRAIN-STUDYGROUP-A11Y-1: SVG crown replaces emoji — ternary form (SWC parser in next 16.2.4 chokes on JSX-inside-&&-paren here, even with comment outside; see PR #362, #364, and build logs from dpl_HJeXm). */}
                    {p.role === 'owner' ? (
                      <span style={{ color: 'var(--sp-accent-amber)', marginLeft: 4, display: 'inline-flex' }} role="img" aria-label="Admin">
                        <CrownIcon size={12} />
                      </span>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={copyInvite}
                  aria-label="Copy study group invite link"
                  style={styles.inviteBtn}
                >
                  {inviteStatus || 'Copy Invite Link'}
                </button>
              </div>

              <div style={styles.handViewer}>
                <div style={styles.emptyHandViewer}>
                  <TrainerEmptyState
                    variant="no-data"
                    title="Verified Hand Review"
                    message="Import and validate a real hand before discussing it with the group. This room never inserts a demo hand or fabricated solver result."
                    cta={{
                      label: 'Open Hand History Upload',
                      onClick: () => router.push('/hub/training/hand-history-upload'),
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Right: Chat & Log */}
            <div style={styles.chatCol}>
              <div style={styles.chatHeader}>Room Chat & Event Log</div>
              <div style={styles.chatMessages}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      ...styles.messageWrapper,
                      alignSelf: m.mine ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {m.isSystem ? (
                      <div style={styles.systemMsg}>{m.body}</div>
                    ) : (
                      <div
                        style={{
                          ...styles.msgBubble,
                          background:
                            m.mine
                              ? 'rgba(0, 212, 255, 0.2)'
                              : 'rgba(255,255,255,0.05)',
                          border:
                            m.mine
                              ? '1px solid rgba(0, 212, 255, 0.4)'
                              : '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--sp-fg-muted)',
                            marginBottom: 4,
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>{m.mine ? 'You' : m.profile?.display_name || m.profile?.username || 'Member'}</span>
                          <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                        </div>
                        <div style={{ fontSize: 14 }}>{m.body}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendMessage} style={styles.chatInputForm}>
                <input
                  type="text"
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  placeholder="Type your strategic thoughts..."
                  aria-label="Chat message"
                  disabled={sending}
                  style={styles.chatInput}
                />
                <button type="submit" aria-label="Send chat message" disabled={sending || !inputMsg.trim()} style={styles.sendBtn}>
                  {/* TRAIN-STUDYGROUP-A11Y-1: SVG send replaces glyph */}
                  <SendIcon size={16} />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      <ConnectionToast />
    </PageTransition>
  );
}

const styles = {
  container: {
    minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
    background: 'linear-gradient(180deg, #05050A 0%, #0A0A15 100%)',
    padding: '24px 4vw 80px',
    color: '#fff',
    fontFamily: "'Inter', sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginBottom: 32,
    paddingBottom: 24,
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  backButton: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: 28,
    fontWeight: 900,
    fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif",
    letterSpacing: 1,
    color: 'var(--sp-accent-blue)',
  },
  subtitle: {
    margin: 0,
    color: 'var(--sp-fg-muted)',
    fontSize: 14,
  },
  createBox: {
    maxWidth: 500,
    margin: '60px auto',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: 40,
    borderRadius: 24,
    textAlign: 'center',
  },
  roomInput: {
    width: '100%',
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid #3b82f6',
    color: '#fff',
    padding: '16px 20px',
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 24,
    outline: 'none',
  },
  createBtn: {
    width: '100%',
    background: 'var(--sp-accent-blue)',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    border: 'none',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
  },
  roomLayout: {
    display: 'flex',
    gap: 24,
    height: '70vh',
  },
  mainCol: {
    flex: 2,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  chatCol: {
    flex: 1,
    background: 'rgba(10, 15, 30, 0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  participantsBar: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(10, 15, 30, 0.6)',
    border: '1px solid rgba(255,255,255,0.05)',
    padding: '12px 20px',
    borderRadius: 12,
    overflowX: 'auto',
  },
  participantChip: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.08)',
    padding: '6px 12px',
    borderRadius: 20,
    fontSize: 13,
    marginRight: 10,
  },
  inviteBtn: {
    marginLeft: 'auto',
    background: 'rgba(59, 130, 246, 0.2)',
    color: 'var(--sp-accent-blue)',
    border: '1px solid rgba(59, 130, 246, 0.5)',
    padding: '6px 16px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  handViewer: {
    flex: 1,
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  emptyHandViewer: {
    textAlign: 'center',
  },
  loadBtn: {
    background: 'var(--sp-accent-blue)',
    color: '#fff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: 8,
    fontWeight: 700,
    cursor: 'pointer',
  },
  activeHand: {
    width: '100%',
    height: '100%',
    padding: 32,
    display: 'flex',
    flexDirection: 'column',
  },
  handHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--sp-fg-muted)',
    fontSize: 20,
    cursor: 'pointer',
  },
  cardsDisplay: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.03)',
    padding: 32,
    borderRadius: 16,
    marginBottom: 24,
  },
  playerBlock: {
    textAlign: 'center',
    flex: 1,
  },
  boardBlock: {
    textAlign: 'center',
    flex: 2,
    borderLeft: '1px solid rgba(255,255,255,0.1)',
    borderRight: '1px solid rgba(255,255,255,0.1)',
    padding: '0 20px',
  },
  playerLabel: {
    fontSize: 12,
    color: 'var(--sp-fg-muted)',
    fontWeight: 700,
    letterSpacing: 2,
    marginBottom: 12,
  },
  actionLog: {
    background: 'rgba(0,0,0,0.5)',
    padding: 16,
    borderRadius: 8,
    fontSize: 15,
    marginBottom: 16,
  },
  solverEval: {
    background: 'rgba(74, 222, 128, 0.1)',
    border: '1px solid rgba(74, 222, 128, 0.3)',
    color: 'var(--sp-accent-green)',
    padding: 16,
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 15,
  },
  chatHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: 1,
    color: 'var(--sp-fg)',
  },
  chatMessages: {
    flex: 1,
    padding: 20,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  messageWrapper: {
    maxWidth: '85%',
    display: 'flex',
    flexDirection: 'column',
  },
  systemMsg: {
    fontSize: 12,
    color: 'var(--sp-fg-muted)',
    fontStyle: 'italic',
    alignSelf: 'center',
    margin: '8px 0',
    background: 'rgba(255,255,255,0.03)',
    padding: '4px 12px',
    borderRadius: 12,
  },
  msgBubble: {
    padding: '10px 14px',
    borderRadius: 12,
  },
  chatInputForm: {
    display: 'flex',
    padding: 16,
    borderTop: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(0,0,0,0.3)',
  },
  chatInput: {
    flex: 1,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '12px 16px',
    borderRadius: '8px 0 0 8px',
    outline: 'none',
    fontSize: 14,
  },
  sendBtn: {
    background: 'var(--sp-accent-blue)',
    color: '#fff',
    border: 'none',
    padding: '0 20px',
    borderRadius: '0 8px 8px 0',
    cursor: 'pointer',
    fontSize: 16,
  },
};
