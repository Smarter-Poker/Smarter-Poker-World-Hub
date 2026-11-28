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
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
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

export const STUDY_GROUP_ICONS = Object.freeze({
  CrownIcon,
  SendIcon,
  BackArrowIcon,
});

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
  const [isOnline, setIsOnline] = useState(true);
  const [practiceCopyStatus, setPracticeCopyStatus] = useState(null);
  const shareSpotHref = '/hub/training/arena/cash-002?start=1&source=study-group-share';

  const handleShareSpotToGroup = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${shareSpotHref}`);
      setPracticeCopyStatus('copied');
    } catch {
      setPracticeCopyStatus('failed');
    }
  };

  useEffect(() => {
    if (typeof navigator !== 'undefined') setIsOnline(navigator.onLine !== false);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

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
              <meta name="robots" content="noindex, nofollow" />
      </Head>
      <UniversalHeader pageDepth={2} hideLeftIcon />

      <div className={st.shell}>
        <TrainingPageHead slug="training-study-group" title="Study Group Room" note="Persistent Member Room · Live Discussion Sync" />

        <div className={st.page}>
        <ErrorBanner message={error} onRetry={() => loadRoom()} />

        {!isOnline && (
          <p role="status" data-offline-banner="true" className={st.notice}>
            Offline Mode Detected: Local Horse Brain Spot Evaluation Remains Active While Live Study Room Sync Waits For Reconnection.
          </p>
        )}

        <section data-study-group-spot-share="true" data-share-spot-href={shareSpotHref} aria-labelledby="group-practice-title" className={`sd-panel ${st.panel}`}>
          <h2 id="group-practice-title" className={st.title}>Practice With Your Group</h2>
          <p className={st.copy}>Open The Shared Study Drill Or Copy Its Link For Your Group.</p>
          <div className={st.actions}>
            <a className="sd-button sd-primary" href={shareSpotHref}>Play Study Drill</a>
            <button type="button" data-share-training-spot="true" onClick={handleShareSpotToGroup} className="sd-button">
              Copy Practice Link
            </button>
          </div>
          {practiceCopyStatus === 'copied' && <p data-share-spot-confirmed="true" role="status" className={st.notice}>Link Copied.</p>}
          {practiceCopyStatus === 'failed' && (
            <label className={st.field}>
              <span className={st.label}>Copy This Link</span>
              <input readOnly value={`${window.location.origin}${shareSpotHref}`} onFocus={(event) => event.target.select()} className={st.input} />
            </label>
          )}
        </section>

        {!roomId ? (
          <motion.section
            className={`sd-panel ${st.panel} ${st.state}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            aria-labelledby="choose-group-title"
          >
            <h2 id="choose-group-title" className={st.title}>Choose A Study Group</h2>
            <p className={st.copy}>
              Join An Existing Room Or Create A New Persistent Study Group From The Finder.
            </p>
            <button type="button" aria-label="Open study group finder" onClick={() => router.push('/hub/training/study-group-finder')} className={`sd-button sd-primary ${st.block}`}>
              Open Study Group Finder
            </button>
          </motion.section>
        ) : loading && !group ? (
          <section className={`sd-panel ${st.panel}`} role="status" aria-label="Loading Study Room">
            <div className={st.skeleton} aria-hidden><span /><span /><span /></div>
            <p className={st.small}>Loading Study Room...</p>
          </section>
        ) : (
          <div className={st.roomLayout}>
            {/* Left: Participants & Hand Viewer */}
            <div className={st.list}>
              <section className={`sd-panel ${st.panel}`} aria-labelledby="room-members-title">
                <div className={st.panelHead}>
                  <h2 id="room-members-title" className={st.title}>Members ({participants.length})</h2>
                  <button
                    type="button"
                    onClick={copyInvite}
                    aria-label="Copy study group invite link"
                    className="sd-button"
                  >
                    {inviteStatus || 'Copy Invite Link'}
                  </button>
                </div>
                <div className={st.chips}>
                  {participants.map((p) => (
                    <span key={p.user_id} className={st.tag}>
                      {p.profile?.display_name || p.profile?.username || 'Member'}{' '}
                      {/* TRAIN-STUDYGROUP-A11Y-1: SVG crown replaces emoji — ternary form (SWC parser in next 16.2.4 chokes on JSX-inside-&&-paren here, even with comment outside; see PR #362, #364, and build logs from dpl_HJeXm). */}
                      {p.role === 'owner' ? (
                        <span className={st.white} style={{ display: 'inline-flex' }} role="img" aria-label="Admin">
                          <CrownIcon size={12} />
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </section>

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

            {/* Right: Chat & Log */}
            <section className={`sd-panel ${st.chatPanel}`} aria-labelledby="room-chat-title">
              <h2 id="room-chat-title" className={`${st.title} ${st.chatHead}`}>Room Chat & Event Log</h2>
              <div className={st.chatMessages} aria-live="polite">
                {messages.length === 0 && <p className={st.small}>No Messages Yet. Start The Discussion.</p>}
                {messages.map((m) => (
                  <div key={m.id} className={st.messageWrap} data-mine={m.mine ? 'true' : undefined}>
                    {m.isSystem ? (
                      <div className={st.systemMsg}>{m.body}</div>
                    ) : (
                      <div className={st.bubble} data-mine={m.mine ? 'true' : undefined}>
                        <div className={st.bubbleMeta}>
                          <span>{m.mine ? 'You' : m.profile?.display_name || m.profile?.username || 'Member'}</span>
                          <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                        </div>
                        <div className={`${st.bubbleBody} no-capitalize`}>{m.body}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendMessage} className={st.chatForm}>
                <input
                  type="text"
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  placeholder="Type your strategic thoughts..."
                  aria-label="Chat message"
                  disabled={sending}
                  className={st.input}
                />
                <button type="submit" aria-label="Send chat message" disabled={sending || !inputMsg.trim()} className={`sd-button sd-primary ${st.close}`}>
                  {/* TRAIN-STUDYGROUP-A11Y-1: SVG send replaces glyph */}
                  <SendIcon size={16} />
                </button>
              </form>
            </section>
          </div>
        )}
        </div>
      </div>
      <ConnectionToast />
    </PageTransition>
  );
}

StudyGroupRoom.displayName = 'StudyGroupRoom';
