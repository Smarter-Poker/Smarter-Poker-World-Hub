import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { authedFetch, getAccessToken } from '../../../src/lib/authUtils';

const SAMPLE_CLUB_ARENA_HAND = `PokerStars Hand #994810241: Hold'em No Limit ($1/$2 USD) - 2026/11/09 15:30:00 ET
Table 'ClubArena_6Max_1' 6-max Seat #1 is the button
Seat 1: Hero ($200.00 in chips)
Seat 2: SmallBlind ($200.00 in chips)
Seat 3: BigBlind ($200.00 in chips)
SmallBlind: posts small blind $1.00
BigBlind: posts big blind $2.00
*** HOLE CARDS ***
Dealt to Hero [As Kd]
Hero: raises $5.00 to $5.00
SmallBlind: folds
BigBlind: calls $3.00
*** FLOP *** [Qs 7d 2c]
BigBlind: checks
Hero: bets $4.00
BigBlind: folds
Uncalled bet ($4.00) returned to Hero
Hero collected $11.00 from pot
*** SUMMARY ***
Total pot $11.00 | Rake $0.00
Board [Qs 7d 2c]`;

const statusRows = [
  ['Beacon Service', 'Not Configured'],
  ['Bluetooth Bridge', 'Unavailable In Web App'],
  ['Account Pairing', 'Authenticated Hand Sync'],
  ['Imported Hands', 'Available'],
];

const clubArenaSyncRoutes = [
  {
    title: 'Hand History Import',
    subtitle: 'Upload Club Arena Or Standard Hand Histories For Audited Decision Review.',
    href: '/hub/training/hand-history-upload',
    cta: 'Open Hand History Import →',
  },
  {
    title: 'Replay Theater',
    subtitle: 'Step Through Imported Hands Street By Street On The Interactive Felt.',
    href: '/hub/training/replay-theater',
    cta: 'Open Replay Theater →',
  },
  {
    title: 'Session Dashboard',
    subtitle: 'Review Verified EV Loss, Accuracy, And Positional Leaks Across Completed Drills.',
    href: '/hub/training/session-dashboard',
    cta: 'Open Session Dashboard →',
  },
  {
    title: 'Club Arena Cash Blueprint',
    subtitle: 'Drill 6-Max Cash Game Spots On The Full Club Arena Table Layout.',
    href: '/hub/training/arena/cash-001?level=1',
    cta: 'Launch Cash Blueprint →',
  },
];

/**
 * There is no production beacon discovery or pairing API today. The previous
 * page generated a beacon name, signal, battery level, and firmware with
 * Math.random(), then emitted a completed training session. This surface now
 * reports the integration state honestly and provides authenticated
 * participant-only hand retrieval and "Train This Hand" drill launches.
 */
export default function LiveHudSyncPage() {
  const [hands, setHands] = useState([]);
  const [loadingHands, setLoadingHands] = useState(false);
  const [handInputText, setHandInputText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState(null);
  const [lookupHandId, setLookupHandId] = useState('');
  const [lookupStatus, setLookupStatus] = useState(null);

  const fetchParticipantHands = useCallback(async () => {
    setLoadingHands(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setHands([]);
        setLoadingHands(false);
        return;
      }
      const res = await authedFetch('/api/training/audit-hand-history');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && Array.isArray(data.hands)) {
        setHands(data.hands);
      }
    } catch (err) {
      console.warn('[LiveHudSync] Failed to load participant hands:', err?.message);
    } finally {
      setLoadingHands(false);
    }
  }, []);

  useEffect(() => {
    fetchParticipantHands();
  }, [fetchParticipantHands]);

  const handleImportAndSync = useCallback(async (textOverride = null) => {
    const raw = typeof textOverride === 'string' ? textOverride : handInputText;
    if (!raw.trim()) return;
    setImporting(true);
    setImportFeedback(null);
    try {
      const res = await authedFetch('/api/training/audit-hand-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handHistoryText: raw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setImportFeedback({
          ok: false,
          message: data?.error || `Hand import failed (${res.status}).`,
        });
        return;
      }
      const newlySynced = Array.isArray(data.syncedHands) ? data.syncedHands : [];
      setImportFeedback({
        ok: true,
        message: `Synced ${newlySynced.length || 1} Participant-Verified Hand(s) Ready For Training.`,
      });
      if (newlySynced.length > 0) {
        setHands((prev) => {
          const merged = [...newlySynced, ...prev];
          const seen = new Set();
          return merged.filter((item) => {
            const key = String(item.id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });
      } else {
        await fetchParticipantHands();
      }
    } catch (err) {
      setImportFeedback({
        ok: false,
        message: err?.message || 'Hand import failed.',
      });
    } finally {
      setImporting(false);
    }
  }, [handInputText, fetchParticipantHands]);

  const handleLookupHandById = useCallback(async () => {
    const id = lookupHandId.trim();
    if (!id) return;
    setLookupStatus({ loading: true, code: null, message: 'Verifying Participant Access...' });
    try {
      const res = await authedFetch(`/api/training/audit-hand-history?handId=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setLookupStatus({
          loading: false,
          ok: false,
          status: 403,
          code: data?.code || 'PARTICIPANT_ACCESS_DENIED',
          message: data?.error || 'Participant-Only Access: You Were Not Dealt Into This Hand.',
        });
        return;
      }
      if (!res.ok || !data?.success || !data?.hand) {
        setLookupStatus({
          loading: false,
          ok: false,
          status: res.status,
          code: data?.code || 'HAND_NOT_FOUND',
          message: data?.error || `Hand #${id} Could Not Be Retrieved (${res.status}).`,
        });
        return;
      }
      setLookupStatus({
        loading: false,
        ok: true,
        status: 200,
        code: 'PARTICIPANT_VERIFIED',
        hand: data.hand,
        message: `Participant Access Verified For Hand #${data.hand.id}.`,
      });
      setHands((prev) => {
        if (prev.some((h) => String(h.id) === String(data.hand.id))) return prev;
        return [data.hand, ...prev];
      });
    } catch (err) {
      setLookupStatus({
        loading: false,
        ok: false,
        status: 500,
        code: 'LOOKUP_ERROR',
        message: err?.message || 'Hand Lookup Failed.',
      });
    }
  }, [lookupHandId]);

  return (
    <>
      <Head>
        <title>Live HUD Sync | Smarter.Poker Training</title>
        <meta name="description" content="Live table integration status and supported hand import." />
              <meta name="robots" content="noindex, nofollow" />
      </Head>
      <UniversalHeader pageDepth={2} />
      <main style={{ minHeight: 'calc(100dvh - 70px)', padding: 'clamp(26px, 7vw, 82px) 18px', background: 'radial-gradient(circle at 50% 8%, #14394f 0, #060b12 43%, #020407 100%)', color: '#f7fbff' }}>
        <section style={{ position: 'relative', maxWidth: 860, margin: '0 auto', border: '1px solid rgba(157,232,255,.46)', background: 'linear-gradient(145deg, rgba(18,42,59,.98), rgba(4,9,15,.99))', boxShadow: 'inset 0 1px rgba(255,255,255,.25), inset 0 -24px 55px rgba(0,0,0,.42), 0 32px 76px rgba(0,0,0,.55)', padding: 'clamp(24px, 5vw, 48px)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 7, border: '1px solid rgba(93,201,240,.16)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: '#ffcc71', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffb84d', boxShadow: '0 0 12px rgba(255,184,77,.8)' }} />
              Integration Status
            </div>
            <h1 style={{ margin: '14px 0 10px', fontSize: 'clamp(32px, 7vw, 62px)', lineHeight: .98, textTransform: 'capitalize' }}>Live HUD Sync</h1>
            <p style={{ margin: 0, maxWidth: 670, color: '#b8cad7', lineHeight: 1.7 }}>Physical Beacon Discovery And Bluetooth Pairing Are Not Connected To A Production Service Yet. This Page Will Not Simulate A Device, Connection, Signal Strength, Battery, Or Firmware Version.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 28 }}>
              {statusRows.map(([label, value]) => (
                <div key={label} style={{ padding: '16px 17px', border: '1px solid rgba(132,213,242,.18)', background: 'linear-gradient(180deg, rgba(39,75,96,.34), rgba(3,9,14,.68))', boxShadow: 'inset 0 1px rgba(255,255,255,.12)' }}>
                  <div style={{ color: '#6f8b9e', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ marginTop: 6, color: value === 'Available' ? '#77f2b4' : '#d8e7ef', fontSize: 14, fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* AUTHENTICATED PARTICIPANT HAND RETRIEVAL & TRAIN THIS HAND */}
            <div
              data-live-hand-sync-panel="true"
              style={{
                marginTop: 28,
                padding: '22px',
                border: '1px solid rgba(102,211,246,.34)',
                background: 'rgba(3,12,20,.78)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ color: '#82e7ff', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Authenticated Participant Hand Sync
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#a9becd', fontSize: 13, lineHeight: 1.55 }}>
                    Retrieve Your Participant-Verified Club Arena Or Imported Hands And Launch Directly Into A Focused Arena Drill.
                  </p>
                </div>
                <button
                  type="button"
                  data-refresh-synced-hands="true"
                  onClick={fetchParticipantHands}
                  style={{
                    minHeight: 38,
                    padding: '0 14px',
                    border: '1px solid rgba(165,239,255,.45)',
                    background: 'rgba(22,55,74,.65)',
                    color: '#e0f7ff',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {loadingHands ? 'Syncing Hands...' : 'Refresh My Hands'}
                </button>
              </div>

              {/* Import & Sync Hand History Box */}
              <div style={{ marginTop: 16, padding: 14, border: '1px solid rgba(132,213,242,.18)', background: 'rgba(0,0,0,.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#cfe9f7' }}>
                    Import Hand History Into Participant Sync
                  </span>
                  <button
                    type="button"
                    data-load-sample-hand="true"
                    onClick={() => setHandInputText(SAMPLE_CLUB_ARENA_HAND)}
                    style={{
                      padding: '4px 10px',
                      border: '1px solid rgba(132,213,242,.35)',
                      background: 'rgba(20,48,66,.55)',
                      color: '#82e7ff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Load Sample Hand
                  </button>
                </div>
                <textarea
                  data-sync-hand-input="true"
                  value={handInputText}
                  onChange={(e) => setHandInputText(e.target.value)}
                  placeholder="Paste Club Arena, PokerStars, Or GGPoker Hand History Text..."
                  rows={4}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: 10,
                    background: 'rgba(2,8,14,.85)',
                    border: '1px solid rgba(132,213,242,.25)',
                    color: '#e6f6ff',
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    data-sync-import-btn="true"
                    disabled={importing || !handInputText.trim()}
                    onClick={() => handleImportAndSync()}
                    style={{
                      minHeight: 40,
                      padding: '0 18px',
                      border: '1px solid #a5efff',
                      background: 'linear-gradient(180deg, #2a6077, #07131d)',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: importing ? 'wait' : 'pointer',
                    }}
                  >
                    {importing ? 'Auditing & Syncing...' : 'Import & Sync Hand'}
                  </button>
                  {importFeedback && (
                    <span
                      data-sync-import-feedback="true"
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: importFeedback.ok ? '#77f2b4' : '#fca5a5',
                      }}
                    >
                      {importFeedback.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Participant-Only Hand ID Lookup */}
              <div style={{ marginTop: 14, padding: 14, border: '1px solid rgba(132,213,242,.18)', background: 'rgba(0,0,0,.3)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#cfe9f7', marginBottom: 8 }}>
                  Verify Participant-Only Hand Retrieval By Hand ID
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    data-lookup-hand-id="true"
                    value={lookupHandId}
                    onChange={(e) => setLookupHandId(e.target.value)}
                    placeholder="Enter Hand ID (e.g. 994810241)"
                    style={{
                      flex: '1 1 220px',
                      minHeight: 38,
                      padding: '0 12px',
                      background: 'rgba(2,8,14,.85)',
                      border: '1px solid rgba(132,213,242,.25)',
                      color: '#e6f6ff',
                      fontSize: 12,
                    }}
                  />
                  <button
                    type="button"
                    data-lookup-hand-btn="true"
                    onClick={handleLookupHandById}
                    style={{
                      minHeight: 38,
                      padding: '0 16px',
                      border: '1px solid rgba(165,239,255,.45)',
                      background: 'rgba(22,55,74,.65)',
                      color: '#d8f6ff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Verify & Retrieve Hand
                  </button>
                </div>
                {lookupStatus && (
                  <div
                    data-lookup-status="true"
                    data-lookup-code={lookupStatus.code || ''}
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      color: lookupStatus.ok ? '#77f2b4' : '#fca5a5',
                    }}
                  >
                    {lookupStatus.message}
                  </div>
                )}
              </div>

              {/* Participant-Verified Hands List with "Train This Hand" */}
              <div data-synced-hands-list="true" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                {hands.length === 0 ? (
                  <div style={{ padding: 14, border: '1px solid rgba(132,213,242,.14)', color: '#9bb4c4', fontSize: 12 }}>
                    {loadingHands
                      ? 'Loading Participant-Verified Hands...'
                      : 'No Synced Hands Yet. Click Load Sample Hand And Import & Sync Hand Above To Test Participant-Only Retrieval And Train This Hand.'}
                  </div>
                ) : (
                  hands.map((hand) => (
                    <div
                      key={hand.id}
                      data-synced-hand-row={hand.id}
                      style={{
                        padding: '14px 16px',
                        border: '1px solid rgba(132,213,242,.26)',
                        background: 'rgba(8,22,34,.82)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ color: '#e6f6ff', fontSize: 13, fontWeight: 900 }}>
                          Hand #{hand.id} · {hand.site || 'Club Arena'} ({hand.gameType || 'Cash'} {hand.stakes || '1/2'})
                        </div>
                        <div style={{ marginTop: 4, color: '#9bb4c4', fontSize: 12 }}>
                          Hero ({hand.heroPosition || 'BTN'}):{' '}
                          <strong style={{ color: '#77f2b4' }}>
                            {Array.isArray(hand.heroCards) && hand.heroCards.length > 0 ? hand.heroCards.join(' ') : 'As Kd'}
                          </strong>
                          {' · '}
                          Board:{' '}
                          <strong style={{ color: '#82e7ff' }}>
                            {Array.isArray(hand.board) && hand.board.length > 0 ? hand.board.join(' ') : 'Preflop'}
                          </strong>
                        </div>
                      </div>
                      <a
                        data-train-this-hand="true"
                        data-hand-id={hand.id}
                        href={hand.drillHref || `/hub/training/arena/cash-002?level=1&syncedHandId=${encodeURIComponent(hand.id)}`}
                        style={{
                          display: 'inline-flex',
                          minHeight: 38,
                          alignItems: 'center',
                          padding: '0 16px',
                          border: '1px solid #77f2b4',
                          background: 'linear-gradient(180deg, rgba(16,185,129,.32), rgba(6,78,59,.65))',
                          color: '#ecfdf5',
                          fontSize: 12,
                          fontWeight: 900,
                          textDecoration: 'none',
                        }}
                      >
                        Train This Hand →
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ marginTop: 28, padding: '20px', border: '1px solid rgba(102,211,246,.24)', background: 'rgba(0,0,0,.22)' }}>
              <div style={{ color: '#82e7ff', fontSize: 12, fontWeight: 900, textTransform: 'capitalize' }}>Supported Workflow</div>
              <p style={{ margin: '8px 0 0', color: '#a9becd', fontSize: 13, lineHeight: 1.65 }}>Import A Real Hand-History File For Analysis And Review. Imported Decisions Are Parsed And Audited; They Are Not Replaced With Generated Device Telemetry.</p>
              <a href="/hub/training/hand-history-upload" style={{ display: 'inline-flex', minHeight: 48, alignItems: 'center', padding: '0 20px', marginTop: 18, border: '1px solid #a5efff', background: 'linear-gradient(180deg, #2a6077, #07131d)', color: '#fff', fontSize: 13, fontWeight: 900, textDecoration: 'none', textTransform: 'capitalize' }}>
                Open Hand History Import →
              </a>
            </div>

            <div data-live-hud-sync-workflows="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 20 }}>
              {clubArenaSyncRoutes.map((item) => (
                <div key={item.href} style={{ padding: '18px', border: '1px solid rgba(132,213,242,.2)', background: 'rgba(5,14,22,.72)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ color: '#e6f6ff', fontSize: 14, fontWeight: 900 }}>{item.title}</div>
                    <p style={{ margin: '6px 0 0', color: '#9bb4c4', fontSize: 12, lineHeight: 1.55 }}>{item.subtitle}</p>
                  </div>
                  <a href={item.href} style={{ display: 'inline-flex', minHeight: 38, alignItems: 'center', padding: '0 14px', border: '1px solid rgba(165,239,255,.45)', background: 'rgba(22,55,74,.55)', color: '#d8f6ff', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
                    {item.cta}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
