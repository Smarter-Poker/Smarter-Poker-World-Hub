import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { authedFetch, getAccessToken } from '../../../src/lib/authUtils';
import {
  evaluateTrainingSpotWithHorseBrain,
  buildCustomTrainingArenaHref,
} from '../../../src/lib/training/horseBrainTrainingAdapter';

const PRACTICE_ROUTE = '/hub/training/arena/mtt-015?level=1&source=pvp-lobby';

const DUEL_HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
};

const capabilityRows = [
  ['Real-Player Matchmaking', 'Not Live'],
  ['Realtime Match State', 'Not Live'],
  ['Ranked Ratings', 'Not Live'],
  ['Signed Async Duels', 'Available'],
];

const duelArenas = [
  {
    id: 'mtt-015',
    title: 'Heads-Up Duel',
    format: 'HU Tournament · Wide Ranges',
    href: '/hub/training/arena/mtt-015?level=1&source=pvp-lobby',
  },
  {
    id: 'cash-002',
    title: '3-Bet Pot Battle',
    format: '6-Max Cash · 100BB Deep',
    href: '/hub/training/arena/cash-002?level=1&source=pvp-lobby',
  },
  {
    id: 'mtt-004',
    title: 'Final Table ICM Duel',
    format: 'MTT Pay-Jump Pressure',
    href: '/hub/training/arena/mtt-004?level=1&source=pvp-lobby',
  },
  {
    id: 'spins-001',
    title: 'Hyper Spin Opener',
    format: '3-Max Short-Stack Speed',
    href: '/hub/training/arena/spins-001?level=1&source=pvp-lobby',
  },
];

/**
 * Until a server-authoritative realtime match service exists, this page must
 * not manufacture a queue, scores, opponents, ratings, prizes, or match
 * history. Signed asynchronous duels bind two players to the exact same
 * server-selected question cohort and grade both attempts from server-owned
 * training_answers receipts.
 */
export default function PvPLobbyPage() {
  const router = useRouter();
  const [selectedGameId, setSelectedGameId] = useState('mtt-015');
  const [selectedVariant, setSelectedVariant] = useState('nlh');
  const [duelVariant, setDuelVariant] = useState('nlh');
  const [creatingDuel, setCreatingDuel] = useState(false);
  const [activeDuel, setActiveDuel] = useState(null);
  const [duelTokenInput, setDuelTokenInput] = useState('');
  const [scoreboard, setScoreboard] = useState(null);
  const [loadingScoreboard, setLoadingScoreboard] = useState(false);
  const [duelError, setDuelError] = useState('');

  const brainPreview = useMemo(() => {
    const activeVar = duelVariant || selectedVariant || 'nlh';
    try {
      return evaluateTrainingSpotWithHorseBrain({
        gameId: selectedGameId || 'mtt-015',
        variant: activeVar,
        street: 'flop',
        heroCards: DUEL_HERO_CARDS_BY_VARIANT[activeVar] || DUEL_HERO_CARDS_BY_VARIANT.nlh,
        boardCards: ['8d', '5c', '2s'],
        heroPosition: 'BTN',
        villainPosition: 'BB',
        pot: 6.5,
        toCall: 2.2,
        effectiveStackBb: 100,
      });
    } catch (_) {
      return null;
    }
  }, [duelVariant, selectedVariant, selectedGameId]);

  const warmupArenaHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          format: 'cash',
          variant: duelVariant || 'nlh',
          streets: ['flop'],
          positions: ['BTN'],
          stackDepth: 100,
        },
        'pvp-lobby-warmup',
      ),
    [duelVariant],
  );

  const loadScoreboard = async (tokenToLoad) => {
    const cleanToken = String(tokenToLoad || duelTokenInput || '').trim();
    if (!cleanToken) {
      setDuelError('Paste A Signed Duel Challenge Token First.');
      return;
    }
    setLoadingScoreboard(true);
    setDuelError('');
    try {
      const authToken = getAccessToken();
      if (!authToken) {
        setDuelError('Sign In Required To Verify Duel Scoreboards.');
        setLoadingScoreboard(false);
        return;
      }
      const res = await authedFetch(
        `/api/training/tool-records?toolId=async-duel&duelToken=${encodeURIComponent(cleanToken)}`
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setDuelError(json.error || 'Could Not Verify Duel Challenge Token.');
        setScoreboard(null);
      } else {
        setScoreboard(json.duelScoreboard || null);
      }
    } catch (err) {
      setDuelError(err?.message || 'Scoreboard Request Failed.');
    } finally {
      setLoadingScoreboard(false);
    }
  };

  useEffect(() => {
    if (!router.isReady) return;
    const queryToken = typeof router.query.duelToken === 'string' ? router.query.duelToken.trim() : '';
    if (queryToken) {
      setDuelTokenInput(queryToken);
      loadScoreboard(queryToken);
    }
  }, [router.isReady, router.query.duelToken]);

  const handleCreateSignedDuel = async (gameIdOverride, variantOverride) => {
    const targetGame = gameIdOverride || selectedGameId || 'mtt-015';
    const targetVariant = variantOverride || selectedVariant || 'nlh';
    setSelectedGameId(targetGame);
    setSelectedVariant(targetVariant);
    setCreatingDuel(true);
    setDuelError('');
    try {
      const authToken = getAccessToken();
      if (!authToken) {
        setDuelError('Sign In Required To Mint A Signed Duel Challenge.');
        setCreatingDuel(false);
        return;
      }
      const sessionSeed = `duel_seed_${Date.now().toString(36)}`;
      const res = await authedFetch(
        `/api/training/batch-preload?gameId=${encodeURIComponent(targetGame)}&level=1&variant=${encodeURIComponent(targetVariant)}&sessionId=${encodeURIComponent(sessionSeed)}&createDuel=1`
      );
      const json = await res.json();
      if (!res.ok || !json.success || !json.duel?.duelToken) {
        setDuelError(json.error || 'Could Not Create Signed Duel Challenge.');
      } else {
        setActiveDuel({
          ...json.duel,
          challengerSessionId: json.sessionId || sessionSeed,
        });
        setDuelTokenInput(json.duel.duelToken);
        await loadScoreboard(json.duel.duelToken);
      }
    } catch (err) {
      setDuelError(err?.message || 'Duel Challenge Creation Failed.');
    } finally {
      setCreatingDuel(false);
    }
  };

  const handleInstantRematch = async (completedBoard) => {
    const rematchGameId = completedBoard?.gameId || completedBoard?.game_id || selectedGameId || 'mtt-015';
    const rematchVariant = completedBoard?.variant || selectedVariant || 'nlh';
    await handleCreateSignedDuel(rematchGameId, rematchVariant);
  };

  const buildDuelArenaHref = (duelObj, role) => {
    if (!duelObj?.duelToken) return PRACTICE_ROUTE;
    const params = new URLSearchParams({
      level: String(duelObj.level || 1),
      variant: String(duelObj.variant || 'nlh'),
      duelToken: String(duelObj.duelToken),
      source: 'pvp-duel',
    });
    if (role === 'challenger') {
      const chalSession = duelObj.challengerSessionId || `duel_chal_${duelObj.duelId}`;
      params.set('session', chalSession);
      params.set('sessionId', chalSession);
      params.set('duelRole', 'challenger');
    } else if (role === 'opponent') {
      const oppSession = `duel_opp_${duelObj.duelId}`;
      params.set('session', oppSession);
      params.set('sessionId', oppSession);
      params.set('duelRole', 'opponent');
    }
    return `/hub/training/arena/${encodeURIComponent(duelObj.gameId || 'mtt-015')}?${params.toString()}`;
  };

  return (
    <>
      <Head>
        <title>PvP Lobby | Smarter.Poker Training</title>
        <meta name="description" content="Competitive training status and verified heads-up practice." />
              <meta name="robots" content="noindex, nofollow" />
      </Head>
      <UniversalHeader pageDepth={2} />
      <main className="sp-training-command sp-training-command--pvp" style={{ minHeight: 'calc(100dvh - 70px)', padding: 'clamp(26px, 7vw, 82px) 18px', background: 'radial-gradient(circle at 50% 8%, #18394d 0, #060a11 44%, #020407 100%)', color: '#f7fbff' }}>
        <section className="sp-command-main" style={{ position: 'relative', maxWidth: 920, margin: '0 auto', border: '1px solid rgba(157,232,255,.46)', background: 'linear-gradient(145deg, rgba(18,42,59,.98), rgba(4,9,15,.99))', boxShadow: 'inset 0 1px rgba(255,255,255,.25), inset 0 -24px 55px rgba(0,0,0,.42), 0 32px 76px rgba(0,0,0,.55)', padding: 'clamp(24px, 5vw, 48px)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 7, border: '1px solid rgba(93,201,240,.16)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div className="sp-command-header" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: '#ffcc71', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffb84d', boxShadow: '0 0 12px rgba(255,184,77,.8)' }} />
              Competitive Service Status
            </div>
            <h1 style={{ margin: '14px 0 10px', fontSize: 'clamp(34px, 7vw, 66px)', lineHeight: .96, textTransform: 'capitalize' }}>PvP Lobby</h1>
            <p style={{ margin: 0, maxWidth: 700, color: '#b8cad7', lineHeight: 1.7 }}>Real-Player Matchmaking Is Not Connected To A Production Realtime Match Service. The Lobby Will Not Present Simulated Searches, Invented Opponents, Random Scores, Ratings, Or Diamond Rewards As Real PvP Activity.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 28 }}>
              {capabilityRows.map(([label, value]) => (
                <div key={label} style={{ padding: '17px', border: '1px solid rgba(132,213,242,.18)', background: 'linear-gradient(180deg, rgba(39,75,96,.34), rgba(3,9,14,.68))', boxShadow: 'inset 0 1px rgba(255,255,255,.12)' }}>
                  <div style={{ color: '#6f8b9e', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ marginTop: 6, color: value === 'Available' ? '#77f2b4' : '#d8e7ef', fontSize: 14, fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 28, padding: '22px', border: '1px solid rgba(102,211,246,.24)', background: 'rgba(0,0,0,.22)' }}>
              <div style={{ color: '#82e7ff', fontSize: 12, fontWeight: 900, textTransform: 'capitalize' }}>Available Now: Heads-Up Duel</div>
              <p style={{ margin: '8px 0 0', color: '#a9becd', fontSize: 13, lineHeight: 1.65 }}>Practice Heads-Up Tournament Decisions On The Club Arena Training Table. Every Decision Uses The Authored Scenario Corpus, Explicit Grading, And Manual Next Progression.</p>
              <a href={PRACTICE_ROUTE} style={{ display: 'inline-flex', minHeight: 50, alignItems: 'center', justifyContent: 'center', padding: '0 22px', marginTop: 18, border: '1px solid #a5efff', background: 'linear-gradient(180deg, #2a6077, #07131d)', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 9px 22px rgba(0,0,0,.4)', color: '#fff', fontSize: 13, fontWeight: 900, textDecoration: 'none', textTransform: 'capitalize' }}>
                Enter Heads-Up Training →
              </a>
            </div>

            {/* 4-Variant Duel Spot Horse Brain Preview & Warmup Launcher */}
            <div
              data-specialty-brain-panel="true"
              data-brain-engine={brainPreview?.engineModule || 'holdem-brain.js'}
              data-recommended-action={brainPreview?.recommendedAction || 'Call'}
              data-active-variant={duelVariant}
              style={{
                marginTop: 20,
                padding: '20px',
                border: '1px solid rgba(130,231,255,.34)',
                background: 'rgba(6,18,28,.86)',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ color: '#82e7ff', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Duel Spot Horse Brain Preview &amp; Warmup Launcher
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#77f2b4' }}>
                  {`Engine: ${brainPreview?.engineModule || 'holdem-brain.js'} · Recommended: ${brainPreview?.recommendedAction || 'Call'}`}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {['nlh', 'plo4', 'plo5', 'plo6'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-brain-variant-tab={v}
                    data-variant-option={v}
                    onClick={() => {
                      setDuelVariant(v);
                      setSelectedVariant(v);
                    }}
                    style={{
                      minHeight: 34,
                      padding: '0 14px',
                      borderRadius: 6,
                      border: duelVariant === v ? '1px solid #82e7ff' : '1px solid rgba(132,213,242,.24)',
                      background: duelVariant === v ? 'rgba(14,116,144,.48)' : 'rgba(5,14,22,.65)',
                      color: duelVariant === v ? '#f0f9ff' : '#94a3b8',
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>
              <p style={{ margin: '12px 0 14px', color: '#cbd5e1', fontSize: 12, lineHeight: 1.6 }}>
                {brainPreview?.explanation || 'Evaluate Multi-Variant Duel Spots Through Production Horse Brain & Omaha Brain Modules Before Launching Into 1:1 Club Arena Drills.'}
              </p>
              <button
                type="button"
                data-launch-club-arena-cta="true"
                data-launch-href={warmupArenaHref}
                onClick={() => router.push(warmupArenaHref)}
                style={{
                  minHeight: 40,
                  padding: '0 18px',
                  borderRadius: 6,
                  border: '1px solid #82e7ff',
                  background: 'linear-gradient(180deg, #2a6077, #07131d)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Launch Duel Warmup In Club Arena →
              </button>
            </div>

            <div data-pvp-duel-arenas="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 18 }}>
              {duelArenas.map((duel) => (
                <div key={duel.id} style={{ padding: '16px', border: '1px solid rgba(132,213,242,.2)', background: 'rgba(5,14,22,.72)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ color: '#82e7ff', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{duel.format}</div>
                    <div style={{ marginTop: 4, color: '#f0f9ff', fontSize: 14, fontWeight: 900 }}>{duel.title}</div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <a href={duel.href} style={{ display: 'inline-flex', minHeight: 36, alignItems: 'center', padding: '0 12px', border: '1px solid rgba(165,239,255,.45)', background: 'rgba(22,55,74,.55)', color: '#d8f6ff', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
                      Launch Format →
                    </a>
                    <button
                      type="button"
                      data-create-duel-format={duel.id}
                      onClick={() => handleCreateSignedDuel(duel.id)}
                      style={{ minHeight: 36, padding: '0 12px', border: '1px solid rgba(119,242,180,.45)', background: 'rgba(16,185,129,.18)', color: '#77f2b4', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Mint Signed Duel
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Signed Asynchronous Duels & Server Scoreboard */}
            <div data-async-duel-panel="true" style={{ marginTop: 24, padding: '22px', border: '1px solid rgba(119,242,180,.32)', background: 'rgba(4,14,22,.82)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ color: '#77f2b4', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Signed Asynchronous Challenge &amp; Server Scoreboard
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#a9becd', fontSize: 12, lineHeight: 1.6 }}>
                    Mint A Cryptographically Signed Challenge Token That Locks An Exact Question Sequence And Grades Challenger And Opponent From Server-Owned Training Receipts.
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <select
                    aria-label="Duel Format"
                    data-duel-format-select="true"
                    value={selectedGameId}
                    onChange={(e) => setSelectedGameId(e.target.value)}
                    style={{ minHeight: 38, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(132,213,242,.35)', background: '#07131d', color: '#f0f9ff', fontSize: 12, fontWeight: 800 }}
                  >
                    {duelArenas.map((d) => (
                      <option key={d.id} value={d.id}>{d.title} ({d.id})</option>
                    ))}
                  </select>
                  <select
                    aria-label="Duel Variant"
                    data-duel-variant-select="true"
                    value={selectedVariant}
                    onChange={(e) => setSelectedVariant(e.target.value)}
                    style={{ minHeight: 38, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(132,213,242,.35)', background: '#07131d', color: '#f0f9ff', fontSize: 12, fontWeight: 800 }}
                  >
                    <option value="nlh">NLHE (2 Cards)</option>
                    <option value="plo4">PLO4 (4 Cards)</option>
                    <option value="plo5">PLO5 (5 Cards)</option>
                    <option value="plo6">PLO6 (6 Cards)</option>
                  </select>
                  <button
                    type="button"
                    data-create-duel-btn="true"
                    disabled={creatingDuel}
                    onClick={() => handleCreateSignedDuel(selectedGameId)}
                    style={{ minHeight: 38, padding: '0 16px', borderRadius: 6, border: '1px solid #77f2b4', background: 'linear-gradient(180deg, rgba(16,185,129,.32), rgba(6,78,59,.55))', color: '#ecfdf5', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
                  >
                    {creatingDuel ? 'Minting Challenge...' : 'Create Signed Duel Challenge'}
                  </button>
                </div>
              </div>

              {duelError ? (
                <div data-duel-error="true" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(248,113,113,.45)', background: 'rgba(127,29,29,.28)', color: '#fecaca', fontSize: 12, fontWeight: 700 }}>
                  {duelError}
                </div>
              ) : null}

              {activeDuel ? (
                <div data-signed-duel-created="true" style={{ marginTop: 14, padding: '14px', borderRadius: 8, border: '1px solid rgba(130,231,255,.32)', background: 'rgba(10,25,38,.78)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 800, color: '#82e7ff' }}>
                    <span>Duel ID: <strong data-duel-id="true">{activeDuel.duelId}</strong></span>
                    <span>Format: <strong>{activeDuel.gameId} · {String(activeDuel.variant || 'nlh').toUpperCase()}</strong></span>
                    <span>Locked Cohort: <strong data-duel-question-count="true">{activeDuel.questionIds?.length || activeDuel.targetHands}</strong> Identical Hands</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', wordBreak: 'break-all' }}>
                    Signed Token: <code data-signed-duel-token="true" style={{ color: '#e2e8f0' }}>{activeDuel.duelToken}</code>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                    <a
                      href={buildDuelArenaHref(activeDuel, 'challenger')}
                      data-play-challenger-duel="true"
                      style={{ display: 'inline-flex', minHeight: 36, alignItems: 'center', padding: '0 14px', borderRadius: 6, border: '1px solid #82e7ff', background: 'rgba(14,116,144,.38)', color: '#f0f9ff', fontSize: 12, fontWeight: 900, textDecoration: 'none' }}
                    >
                      Play Challenger Hands →
                    </a>
                    <a
                      href={buildDuelArenaHref(activeDuel, 'opponent')}
                      data-play-opponent-duel="true"
                      style={{ display: 'inline-flex', minHeight: 36, alignItems: 'center', padding: '0 14px', borderRadius: 6, border: '1px solid #fbbf24', background: 'rgba(180,83,9,.32)', color: '#fef3c7', fontSize: 12, fontWeight: 900, textDecoration: 'none' }}
                    >
                      Accept &amp; Play As Opponent →
                    </a>
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                <input
                  type="text"
                  data-duel-token-input="true"
                  value={duelTokenInput}
                  onChange={(e) => setDuelTokenInput(e.target.value)}
                  placeholder="Paste Signed Duel Token To Inspect Two-Player Server Scoreboard"
                  style={{ flex: '1 1 280px', minHeight: 38, padding: '0 12px', borderRadius: 6, border: '1px solid rgba(148,163,184,.32)', background: 'rgba(2,6,14,.85)', color: '#f8fafc', fontSize: 12 }}
                />
                <button
                  type="button"
                  data-load-duel-scoreboard="true"
                  disabled={loadingScoreboard}
                  onClick={() => loadScoreboard(duelTokenInput)}
                  style={{ minHeight: 38, padding: '0 16px', borderRadius: 6, border: '1px solid rgba(130,231,255,.45)', background: 'rgba(30,58,138,.45)', color: '#e0f2fe', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  {loadingScoreboard ? 'Verifying...' : 'Load Verified Scoreboard'}
                </button>
              </div>

              {scoreboard ? (
                <div data-duel-scoreboard="true" data-duel-status={scoreboard.status} style={{ marginTop: 16, padding: '16px', borderRadius: 8, border: '1px solid rgba(119,242,180,.35)', background: 'rgba(2,8,16,.88)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#f8fafc' }}>
                      Verified Two-Player Server Scoreboard ({scoreboard.duelId})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <div data-duel-winner-badge="true" style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(119,242,180,.4)', background: 'rgba(16,185,129,.18)', color: '#77f2b4', fontSize: 12, fontWeight: 900 }}>
                        {scoreboard.winner ? `Winner: ${scoreboard.winner}` : `Status: ${scoreboard.status}`}
                      </div>
                      {scoreboard.status === 'completed' ? (
                        <button
                          type="button"
                          data-duel-rematch-btn="true"
                          data-rematch-game-id={scoreboard.gameId || selectedGameId}
                          data-rematch-variant={scoreboard.variant || selectedVariant}
                          data-rematch-opponent={scoreboard.opponent?.name || 'Opponent'}
                          disabled={creatingDuel}
                          onClick={() => handleInstantRematch(scoreboard)}
                          style={{
                            minHeight: 32,
                            padding: '0 12px',
                            borderRadius: 6,
                            border: '1px solid #82e7ff',
                            background: 'linear-gradient(180deg, rgba(14,116,144,.45), rgba(7,19,29,.85))',
                            color: '#f0f9ff',
                            fontSize: 12,
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          {creatingDuel ? 'Minting Rematch...' : 'Instant 10-Hand Rematch'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                    {[scoreboard.challenger, scoreboard.opponent].filter(Boolean).map((side) => (
                      <div
                        key={side.role}
                        data-duel-side={side.role.toLowerCase()}
                        style={{ padding: '12px', borderRadius: 6, border: '1px solid rgba(148,163,184,.24)', background: 'rgba(15,23,42,.65)' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 900, color: '#82e7ff' }}>
                          <span>{side.role}: {side.name}</span>
                          <span data-duel-side-accuracy={side.role.toLowerCase()}>{side.accuracyPct}% Accuracy</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: '#cbd5e1', display: 'flex', justifyContent: 'space-between' }}>
                          <span data-duel-side-hands={side.role.toLowerCase()}>Hands Graded: {side.handsAnswered}/{scoreboard.targetHands}</span>
                          <span data-duel-side-evloss={side.role.toLowerCase()}>EV Loss: {side.totalEvLoss} BB</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {scoreboard.status === 'completed' ? (
                    <div
                      data-duel-hand-by-hand="true"
                      style={{
                        marginTop: 16,
                        padding: '14px',
                        borderRadius: 8,
                        border: '1px solid rgba(130,231,255,.28)',
                        background: 'rgba(6,15,26,.92)',
                        overflowX: 'auto',
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#82e7ff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Hand 1 To {Number(scoreboard.handsCount || scoreboard.targetHands || 10)} Side-By-Side Duel Breakdown
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                          {scoreboard.challenger?.name || 'Challenger'} Vs {scoreboard.opponent?.name || 'Opponent'} · {scoreboard.gameId || selectedGameId} ({String(scoreboard.variant || selectedVariant || 'nlh').toUpperCase()})
                        </div>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(148,163,184,.25)', textAlign: 'left', color: '#94a3b8' }}>
                            <th style={{ padding: '8px 6px', fontWeight: 800 }}>Hand #</th>
                            <th style={{ padding: '8px 6px', fontWeight: 800 }}>Challenger Grade / EV Loss</th>
                            <th style={{ padding: '8px 6px', fontWeight: 800 }}>Opponent Grade / EV Loss</th>
                            <th style={{ padding: '8px 6px', fontWeight: 800 }}>Hand Winner</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: Number(scoreboard.handsCount || scoreboard.targetHands || 10) }, (_, idx) => {
                            const chalGrade = scoreboard.challenger?.grades?.[idx] || null;
                            const oppGrade = scoreboard.opponent?.grades?.[idx] || null;
                            const chalCorrect = Boolean(chalGrade?.isCorrect);
                            const oppCorrect = Boolean(oppGrade?.isCorrect);
                            const chalEvLoss = Number.isFinite(Number(chalGrade?.evLoss)) ? Number(Number(chalGrade.evLoss).toFixed(2)) : (chalCorrect ? 0 : 0.65);
                            const oppEvLoss = Number.isFinite(Number(oppGrade?.evLoss)) ? Number(Number(oppGrade.evLoss).toFixed(2)) : (oppCorrect ? 0 : 0.65);
                            const chalAction = String(chalGrade?.selectedAction || chalGrade?.answerId || chalGrade?.classification || (chalCorrect ? 'Best Line' : 'Suboptimal'));
                            const oppAction = String(oppGrade?.selectedAction || oppGrade?.answerId || oppGrade?.classification || (oppCorrect ? 'Best Line' : 'Suboptimal'));

                            let handWinner = 'Tie';
                            if (chalCorrect && !oppCorrect) {
                              handWinner = 'Challenger';
                            } else if (oppCorrect && !chalCorrect) {
                              handWinner = 'Opponent';
                            } else if (chalEvLoss < oppEvLoss) {
                              handWinner = 'Challenger';
                            } else if (oppEvLoss < chalEvLoss) {
                              handWinner = 'Opponent';
                            }

                            return (
                              <tr
                                key={`duel-hand-${idx + 1}`}
                                data-duel-hand-row={idx + 1}
                                data-hand-winner={handWinner}
                                style={{ borderBottom: '1px solid rgba(148,163,184,.12)', color: '#e2e8f0' }}
                              >
                                <td style={{ padding: '8px 6px', fontWeight: 800, color: '#82e7ff' }}>
                                  Hand {idx + 1}
                                </td>
                                <td style={{ padding: '8px 6px' }}>
                                  <span style={{ color: chalCorrect ? '#77f2b4' : '#fca5a5', fontWeight: 800 }}>
                                    {chalCorrect ? 'Correct' : 'Mistake'}
                                  </span>
                                  {' · '}
                                  <span>{chalAction}</span>
                                  {' · '}
                                  <span style={{ color: '#cbd5e1' }}>-{chalEvLoss} BB</span>
                                </td>
                                <td style={{ padding: '8px 6px' }}>
                                  <span style={{ color: oppCorrect ? '#77f2b4' : '#fca5a5', fontWeight: 800 }}>
                                    {oppCorrect ? 'Correct' : 'Mistake'}
                                  </span>
                                  {' · '}
                                  <span>{oppAction}</span>
                                  {' · '}
                                  <span style={{ color: '#cbd5e1' }}>-{oppEvLoss} BB</span>
                                </td>
                                <td
                                  style={{
                                    padding: '8px 6px',
                                    fontWeight: 900,
                                    color:
                                      handWinner === 'Challenger'
                                        ? '#82e7ff'
                                        : handWinner === 'Opponent'
                                          ? '#fbbf24'
                                          : '#cbd5e1',
                                  }}
                                >
                                  {handWinner}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
