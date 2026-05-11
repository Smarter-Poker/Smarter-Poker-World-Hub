import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// BUG FIX (TRAIN-STUDYGROUP-A11Y-1): SVG icon components replacing the
// study-group emoji set: 👑 admin marker, 📤 empty hand viewer, ✕ close,
// ➤ send arrow, ← back. Card-suit glyphs (♠♣♥♦) in hand strings remain
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
function UploadIcon({ size=48 })   { return <_Svg size={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></_Svg>; }
function CloseIcon({ size=16 })    { return <_Svg size={size}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></_Svg>; }
function SendIcon({ size=16 })     { return <_Svg size={size}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></_Svg>; }
function BackArrowIcon({ size=14 }){ return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function StarIcon({ size=14 })     {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}


export default function StudyGroupRoom() {
  const router = useRouter();
  const { roomId } = router.query;

  useTrainingBus('study-group');

  const [isCreating, setIsCreating] = useState(!roomId);
  const [roomName, setRoomName] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [activeHandInfo, setActiveHandInfo] = useState(null);

  // Mock real-time participants
  const [participants] = useState([
    { id: 1, name: 'Daniel B.', role: 'Admin', avatar: '/avatars/daniel.jpg' },
    { id: 2, name: 'GTO_Crusher', role: 'Member', avatar: '/avatars/user2.jpg' },
    { id: 3, name: 'RiverRat99', role: 'Member', avatar: '/avatars/user3.jpg' },
  ]);

  const handleCreateRoom = () => {
    if (!roomName) return;
    setIsCreating(false);
    // In a real app, this would create the room in Supabase and redirect to ?roomId=xxx
    router.push(`/hub/training/study-group?roomId=test-room-123`, undefined, { shallow: true });

    setMessages([
      {
        id: 1,
        sender: 'System',
        text: `Room "${roomName}" created. Waiting for others to join...`,
        isSystem: true,
        time: new Date().toLocaleTimeString(),
      },
    ]);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;

    setMessages([
      ...messages,
      {
        id: Date.now(),
        sender: 'You',
        text: inputMsg,
        isSystem: false,
        time: new Date().toLocaleTimeString(),
      },
    ]);
    setInputMsg('');
  };

  const loadDemoHand = () => {
    setActiveHandInfo({
      id: 'hand_772A',
      hero: 'A♠ K♠',
      villain: 'J♥ T♥',
      board: 'K♦ T♠ 4♣ 2♥ J♠',
      actionSummary: 'Villain jammed river, Hero called. Villain won two pair.',
      solverEval: 'Solver says: CALL is +1.2 EV. Hero played perfectly, just got coolered.',
    });

    setMessages([
      ...messages,
      {
        id: Date.now(),
        sender: 'System',
        text: 'Daniel B. loaded "Big River Call vs JTs" to the hand viewer.',
        isSystem: true,
        time: new Date().toLocaleTimeString(),
      },
    ]);
  };

  // Save session data
  useEffect(() => {
    if (!isCreating) {
      const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
      if (!token) return;
      authedFetch('/api/training/save-session', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'study-group',
          stats: {
            messagesSent: messages.filter((m) => m.sender === 'You').length,
            handsReviewed: activeHandInfo ? 1 : 0,
          },
        }),
      }).catch((e) => console.warn(e)).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    }
  }, [messages.length, activeHandInfo]);

  return (
    <PageTransition>
      <Head>
        <title>Study Group | Smarter.Poker</title>
      </Head>
      <UniversalHeader />

      <div style={styles.container}>
        <div style={styles.header}>
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
            <h1 style={styles.title}>COLLABORATIVE STUDY ROOM</h1>
            <p style={styles.subtitle}>Review Hands & Discuss Strategy in Real-Time</p>
          </div>
        </div>

        {isCreating ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={styles.createBox}
          >
            <h2>Create a New Study Room</h2>
            <p style={{ color: '#94a3b8', marginBottom: 24 }}>
              Invite friends, upload hands, and analyze GTO lines together.
            </p>

            <input
              type="text"
              placeholder="Enter Room Name (e.g. Sunday Million Review)..."
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              aria-label="Study room name"
              style={styles.roomInput}
            />
            <button type="button" aria-label="Start study room" onClick={handleCreateRoom} style={styles.createBtn}>
              Start Room
            </button>
          </motion.div>
        ) : (
          <div style={styles.roomLayout}>
            {/* Left: Participants & Hand Viewer */}
            <div style={styles.mainCol}>
              <div style={styles.participantsBar}>
                <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: 12, marginRight: 16 }}>
                  ONLINE (3)
                </div>
                {participants.map((p) => (
                  <div key={p.id} style={styles.participantChip}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#4ade80',
                        marginRight: 8,
                      }}
                    />
                    {p.name}{' '}
                    {/* TRAIN-STUDYGROUP-A11Y-1: SVG crown replaces 👑 */}
                    {p.role === 'Admin' && (
                      <span style={{ color: '#fbbf24', marginLeft: 4, display: 'inline-flex' }} role="img" aria-label="Admin">
                        <CrownIcon size={12} />
                      </span>
                    )}
                  </div>
                ))}
                <button type="button" aria-label="Generate invite link" style={styles.inviteBtn}>+ Invite Link</button>
              </div>

              <div style={styles.handViewer}>
                {activeHandInfo ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={styles.activeHand}
                  >
                    <div style={styles.handHeader}>
                      <h3 style={{ margin: 0 }}>{activeHandInfo.id} Overview</h3>
                      <button
                        type="button"
                        aria-label="Close active hand viewer"
                        style={styles.closeBtn}
                        onClick={() => setActiveHandInfo(null)}
                      >
                        {/* TRAIN-STUDYGROUP-A11Y-1: SVG close replaces ✕ */}
                        <CloseIcon size={16} />
                      </button>
                    </div>

                    <div style={styles.cardsDisplay}>
                      <div style={styles.playerBlock}>
                        <div style={styles.playerLabel}>HERO</div>
                        <div style={{ fontSize: 28 }}>{activeHandInfo.hero}</div>
                      </div>
                      <div style={styles.boardBlock}>
                        <div style={styles.playerLabel}>RUNOUT</div>
                        <div style={{ fontSize: 32, letterSpacing: 4 }}>{activeHandInfo.board}</div>
                      </div>
                      <div style={styles.playerBlock}>
                        <div style={styles.playerLabel}>VILLAIN</div>
                        <div style={{ fontSize: 28 }}>{activeHandInfo.villain}</div>
                      </div>
                    </div>

                    <div style={styles.actionLog}>
                      <strong>Action:</strong> {activeHandInfo.actionSummary}
                    </div>

                    <div style={styles.solverEval}>
                      {/* TRAIN-STUDYGROUP-A11Y-1: SVG star replaces ⭐ */}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#fbbf24' }} aria-hidden>
                        <StarIcon size={14} />
                        {activeHandInfo.solverEval}
                      </span>
                    </div>
                  </motion.div>
                ) : (
                  <div style={styles.emptyHandViewer}>
                    {/* TRAIN-STUDYGROUP-A11Y-1: SVG upload replaces 📤 */}
                    <div style={{ fontSize: 48, marginBottom: 16, display: 'inline-flex', justifyContent: 'center', color: '#475569' }} aria-hidden>
                      <UploadIcon size={48} />
                    </div>
                    <h3 style={{ margin: '0 0 8px 0' }}>No Hand Active</h3>
                    <p style={{ color: '#94a3b8', margin: '0 0 24px 0' }}>
                      Upload a hand history or load a saved bookmark to begin group analysis.
                    </p>
                    <button type="button" aria-label="Load a demo hand" onClick={loadDemoHand} style={styles.loadBtn}>
                      Load Demo Hand
                    </button>
                  </div>
                )}
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
                      alignSelf: m.sender === 'You' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {m.isSystem ? (
                      <div style={styles.systemMsg}>{m.text}</div>
                    ) : (
                      <div
                        style={{
                          ...styles.msgBubble,
                          background:
                            m.sender === 'You'
                              ? 'rgba(0, 212, 255, 0.2)'
                              : 'rgba(255,255,255,0.05)',
                          border:
                            m.sender === 'You'
                              ? '1px solid rgba(0, 212, 255, 0.4)'
                              : '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            marginBottom: 4,
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>{m.sender}</span>
                          <span>{m.time}</span>
                        </div>
                        <div style={{ fontSize: 14 }}>{m.text}</div>
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
                  style={styles.chatInput}
                />
                <button type="submit" aria-label="Send chat message" style={styles.sendBtn}>
                  {/* TRAIN-STUDYGROUP-A11Y-1: SVG send replaces ➤ */}
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
    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
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
    fontFamily: 'Orbitron, sans-serif',
    letterSpacing: 1,
    color: '#3b82f6',
  },
  subtitle: {
    margin: 0,
    color: '#94a3b8',
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
    background: '#3b82f6',
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
    color: '#3b82f6',
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
    background: '#3b82f6',
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
    color: '#94a3b8',
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
    fontSize: 11,
    color: '#94a3b8',
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
    color: '#4ade80',
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
    color: '#e2e8f0',
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
    color: '#94a3b8',
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
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    padding: '0 20px',
    borderRadius: '0 8px 8px 0',
    cursor: 'pointer',
    fontSize: 16,
  },
};
