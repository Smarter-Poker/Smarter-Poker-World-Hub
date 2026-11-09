import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { authedFetch, getAccessToken } from '../../../src/lib/authUtils';

const PRACTICE_ROUTE = '/hub/training/arena/mtt-015?level=1&source=pvp-lobby';

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
  const [creatingDuel, setCreatingDuel] = useState(false);
  const [activeDuel, setActiveDuel] = useState(null);
  const [duelTokenInput, setDuelTokenInput] = useState('');
  const [scoreboard, setScoreboard] = useState(null);
  const [loadingScoreboard, setLoadingScoreboard] = useState(false);
  const [duelError, setDuelError] = useState('');

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

  const handleCreateSignedDuel = async (gameIdOverride) => {
    const targetGame = gameIdOverride || selectedGameId || 'mtt-015';
    setSelectedGameId(targetGame);
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
        `/api/training/batch-preload?gameId=${encodeURIComponent(targetGame)}&level=1&variant=${encodeURIComponent(selectedVariant)}&sessionId=${encodeURIComponent(sessionSeed)}&createDuel=1`
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

  const buildDuelArenaHref = (duelObj, role) => {
    if (!duelObj?.duelToken) return PRACTICE_ROUTE;
    const params = new URLSearchParams({
      level: String(duelObj.level || 1),
      variant: String(duelObj.variant || 'nlh'),
      duelToken: String(duelObj.duelToken),
      source: 'pvp-duel',
    });
    if (role === 'challenger' && duelObj.challengerSessionId) {
      params.set('sessionId', String(duelObj.challengerSessionId));
    } else if (role === 'opponent') {
      params.set('sessionId', `duel_opp_${Date.now().toString(36)}`);
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
                    <div data-duel-winner-badge="true" style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(119,242,180,.4)', background: 'rgba(16,185,129,.18)', color: '#77f2b4', fontSize: 12, fontWeight: 900 }}>
                      {scoreboard.winner ? `Winner: ${scoreboard.winner}` : `Status: ${scoreboard.status}`}
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
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
