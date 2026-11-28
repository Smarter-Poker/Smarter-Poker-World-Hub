import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { authedFetch, getAccessToken } from '../../../src/lib/authUtils';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/sessions-coaching.module.css';
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
  const router = useRouter();
  const [hands, setHands] = useState([]);
  const [handsError, setHandsError] = useState(null);
  const [loadingHands, setLoadingHands] = useState(false);
  const [handInputText, setHandInputText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState(null);
  const [lookupHandId, setLookupHandId] = useState('');
  const [lookupStatus, setLookupStatus] = useState(null);
  const fetchParticipantHands = useCallback(async () => {
    setLoadingHands(true);
    setHandsError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setHands([]);
        return;
      }
      const res = await authedFetch('/api/training/audit-hand-history');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success !== true || !Array.isArray(data.hands)) {
        throw new Error('Hand List Unavailable');
      }
      setHands(data.hands);
    } catch (_) {
      setHands([]);
      setHandsError('Could Not Load Your Synced Hands.');
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
        message: newlySynced.length > 0 ? `Synced ${newlySynced.length} Hands.` : 'Import Complete.',
      });
      await fetchParticipantHands();
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
      <main className={s.shell}>
        <TrainingPageHead slug="training-live-hud-sync" />
        <div className={s.page}>
          <section className={`sd-panel ${s.panel}`} aria-labelledby="live-hud-status-title">
            <p className={s.eyebrow}>Integration Status</p>
            <h2 id="live-hud-status-title" className={s.sectionTitle}>Not Connected Yet</h2>
            <p className={s.copy}>Physical Beacon Discovery And Bluetooth Pairing Are Not Connected To A Production Service Yet. This Page Will Not Simulate A Device, Connection, Signal Strength, Battery, Or Firmware Version.</p>
            <dl className={s.list}>
              {statusRows.map(([label, value]) => (
                <div key={label} className={s.row}>
                  <dt className={s.rowValue}>{label}</dt>
                  <dd className={value === 'Available' ? `${s.rowLabel} ${s.up}` : s.rowLabel}>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* AUTHENTICATED PARTICIPANT HAND RETRIEVAL & TRAIN THIS HAND */}
          <section data-live-hand-sync-panel="true" className={`sd-panel ${s.panel}`} aria-labelledby="live-hand-sync-title">
            <div className={s.panelHead}>
              <h2 id="live-hand-sync-title" className={s.sectionTitle}>Participant Hand Sync</h2>
              <button
                type="button"
                data-refresh-synced-hands="true"
                onClick={fetchParticipantHands}
                className={`sd-button ${s.button}`}
              >
                {loadingHands ? 'Syncing Hands...' : 'Refresh My Hands'}
              </button>
            </div>
            <p className={s.copy}>
              Retrieve Your Participant-Verified Club Arena Or Imported Hands And Launch Directly Into A Focused Arena Drill.
            </p>

            {/* Import & Sync Hand History */}
            <div className={s.askBlock}>
              <div className={s.panelHead}>
                <h3 className={s.subTitle}>Import Hand History</h3>
                <button
                  type="button"
                  data-load-sample-hand="true"
                  onClick={() => setHandInputText(SAMPLE_CLUB_ARENA_HAND)}
                  className={`sd-button ${s.button}`}
                >
                  Load Sample Hand
                </button>
              </div>
              <textarea
                data-sync-hand-input="true"
                className={s.input}
                aria-label="Hand History Text"
                value={handInputText}
                onChange={(e) => setHandInputText(e.target.value)}
                placeholder="Paste Club Arena, PokerStars, Or GGPoker Hand History Text..."
                rows={4}
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
              />
              <button
                type="button"
                data-sync-import-btn="true"
                disabled={importing || !handInputText.trim()}
                onClick={() => handleImportAndSync()}
                className={`sd-button ${importing || !handInputText.trim() ? '' : 'sd-primary'} ${s.button}`}
              >
                {importing ? 'Auditing & Syncing...' : 'Import & Sync Hand'}
              </button>
              {importFeedback && (
                <p data-sync-import-feedback="true" className={importFeedback.ok ? s.note : s.error} role="status">
                  {importFeedback.message}
                </p>
              )}
            </div>

            {/* Participant-Only Hand ID Lookup */}
            <div className={s.askBlock}>
              <h3 className={s.subTitle}>Verify Hand Retrieval By Hand ID</h3>
              <div className={s.actions}>
                <input
                  type="text"
                  data-lookup-hand-id="true"
                  className={s.input}
                  aria-label="Hand ID"
                  value={lookupHandId}
                  onChange={(e) => setLookupHandId(e.target.value)}
                  placeholder="Enter Hand ID (E.G. 994810241)"
                  style={{ flex: '1 1 200px', width: 'auto' }}
                />
                <button
                  type="button"
                  data-lookup-hand-btn="true"
                  onClick={handleLookupHandById}
                  className={`sd-button ${s.button}`}
                >
                  Verify & Retrieve Hand
                </button>
              </div>
              {lookupStatus && (
                <div
                  data-lookup-status="true"
                  data-lookup-code={lookupStatus.code || ''}
                  className={lookupStatus.ok || lookupStatus.loading ? s.note : s.error}
                  role="status"
                >
                  {lookupStatus.message}
                  {lookupStatus.hand?.drillHref && (
                    <p style={{ margin: '8px 0 0' }}><a className={`sd-button sd-primary ${s.button}`} href={lookupStatus.hand.drillHref}>Train This Hand</a></p>
                  )}
                </div>
              )}
            </div>

            {/* Participant-Verified Hands List with "Train This Hand" */}
            <div data-synced-hands-list="true" style={{ display: 'grid', gap: 10 }}>
              <h3 className={s.subTitle}>Your Synced Hands</h3>
              {handsError ? (
                <div role="alert" className={s.error} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span>{handsError}</span>
                  <button type="button" className={`sd-button ${s.button}`} onClick={fetchParticipantHands}>Retry</button>
                </div>
              ) : hands.length === 0 ? (
                <p className={s.note}>
                  {loadingHands
                    ? 'Loading Participant-Verified Hands...'
                    : 'No Synced Hands Yet. Import A Hand History To Practice A Decision.'}
                </p>
              ) : (
                hands.map((hand) => (
                  <article
                    key={hand.id}
                    data-synced-hand-row={hand.id}
                    data-hand-leak-priority={hand.leakPriorityRank}
                    data-estimated-ev-loss-bb={hand.estimatedEvLossBb}
                    className={`sd-metric ${s.card}`}
                  >
                    <div className={s.chips} style={{ gap: 6 }}>
                      <span className={s.tag}>
                        Leak Priority #{hand.leakPriorityRank}{hand.leakPriorityRank === 1 ? ' · #1 Highest EV Leak' : ''}
                      </span>
                      <span className={s.tag} style={Number.isFinite(hand.estimatedEvLossBb) ? { color: '#ff7a86' } : undefined}>
                        {Number.isFinite(hand.estimatedEvLossBb) ? `Estimated EV Loss: ${hand.estimatedEvLossBb} BB` : "EV Loss Unavailable"}
                      </span>
                    </div>
                    <strong className={s.rowLabel}>
                      Hand #{hand.id} · {hand.site || 'Club Arena'} ({hand.gameType || 'Cash'} {hand.stakes || '1/2'})
                    </strong>
                    <p className={s.facts}>
                      <span>Hero ({hand.heroPosition || 'BTN'}): <strong>{Array.isArray(hand.heroCards) && hand.heroCards.length > 0 ? hand.heroCards.join(' ') : 'Unavailable'}</strong></span>
                      <span>Board: <strong className={s.ice}>{Array.isArray(hand.board) && hand.board.length > 0 ? hand.board.join(' ') : 'Preflop'}</strong></span>
                      <span>Recommended: <strong className={s.ice}>{hand.recommendedAction || 'Unavailable'}</strong></span>
                    </p>
                    <a
                      data-train-this-hand="true"
                      data-train-top-imported-leak={hand.leakPriorityRank === 1 ? "true" : undefined}
                      data-drill-similar-spot-cta="true"
                      data-hand-id={hand.id}
                      href={hand.drillHref || `/hub/training/arena/cash-002?level=1&syncedHandId=${encodeURIComponent(hand.id)}`}
                      className={`sd-button sd-primary ${s.button}`}
                    >
                      Train This Hand →
                    </a>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className={`sd-panel ${s.panel}`} aria-labelledby="live-hud-workflow-title">
            <h2 id="live-hud-workflow-title" className={s.sectionTitle}>Supported Workflow</h2>
            <p className={s.copy}>Import A Real Hand-History File For Analysis And Review. Imported Decisions Are Parsed And Audited; They Are Not Replaced With Generated Device Telemetry.</p>
            <a href="/hub/training/hand-history-upload" className={`sd-button sd-primary ${s.button} ${s.primary}`}>
              Open Hand History Import →
            </a>
          </section>

          <section data-live-hud-sync-workflows="true" className={s.cardGrid} aria-label="Related Workflows">
            {clubArenaSyncRoutes.map((item) => (
              <article key={item.href} className={`sd-panel ${s.card}`} style={{ alignContent: 'space-between' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <h3 className={s.subTitle}>{item.title}</h3>
                  <p className={s.copy}>{item.subtitle}</p>
                </div>
                <a href={item.href} className={`sd-button ${s.button}`}>
                  {item.cta}
                </a>
              </article>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}
