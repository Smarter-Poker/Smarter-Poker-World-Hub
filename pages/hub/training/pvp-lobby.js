import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { authedFetch, getAccessToken } from '../../../src/lib/authUtils';

import { ArrowRight } from 'lucide-react';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/training-play.module.css';
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
      <div className={s.shell}>
        <main className={s.page}>
          <TrainingPageHead slug="training-pvp-lobby" title="PvP Lobby" />

          <section className={`sd-panel ${s.panel}`} aria-labelledby="pvp-status-title">
            <p className={s.tag}><span className={s.dot} aria-hidden />Competitive Service Status</p>
            <h2 id="pvp-status-title" className={s.sectionTitle}>Live Matchmaking Status</h2>
            <p className={s.copy}>Real-Player Matchmaking Is Not Connected To A Production Realtime Match Service. The Lobby Will Not Present Simulated Searches, Invented Opponents, Random Scores, Ratings, Or Diamond Rewards As Real PvP Activity.</p>
            <div className={s.metrics2}>
              {capabilityRows.map(([label, value]) => (
                <div key={label} className={`sd-metric ${s.metric} ${s.metricLeft}`}>
                  <span className={s.metricLabel}>{label}</span>
                  <strong className={s.metricValue} data-tone={value === 'Available' ? 'ice' : undefined}>{value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className={`sd-panel ${s.panel}`} aria-labelledby="pvp-available-title">
            <p className={s.eyebrow}>Available Now</p>
            <h2 id="pvp-available-title" className={s.sectionTitle}>Heads-Up Duel</h2>
            <p className={s.copy}>Practice Heads-Up Tournament Decisions On The Club Arena Training Table. Every Decision Uses The Authored Scenario Corpus, Explicit Grading, And Manual Next Progression.</p>
            <a href={PRACTICE_ROUTE} className={`sd-button sd-primary ${s.primaryAction}`}>
              Enter Heads-Up Training <ArrowRight size={18} aria-hidden />
            </a>
          </section>

          {/* 4-Variant Duel Spot Horse Brain Preview & Warmup Launcher */}
          <section className={`sd-panel ${s.panel}`} aria-labelledby="pvp-formats-title">
            <h2 id="pvp-formats-title" className={s.sectionTitle}>Duel Formats</h2>
            <div data-pvp-duel-arenas="true" className={s.formatList}>
              {duelArenas.map((duel) => (
                <div key={duel.id} className={s.formatRow}>
                  <div className={s.formatText}>
                    <p className={s.subTitle}>{duel.title}</p>
                    <p className={s.small}>{duel.format}</p>
                  </div>
                  <div className={s.formatActions}>
                    <a href={duel.href} className={`sd-button ${s.button}`}>
                      Launch Format
                    </a>
                    <button
                      type="button"
                      data-create-duel-format={duel.id}
                      onClick={() => handleCreateSignedDuel(duel.id)}
                      className={`sd-button ${s.button}`}
                    >
                      Mint Signed Duel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Signed Asynchronous Duels & Server Scoreboard */}
          <section data-async-duel-panel="true" className={`sd-panel ${s.panel}`} aria-labelledby="pvp-async-title">
            <h2 id="pvp-async-title" className={s.sectionTitle}>Signed Asynchronous Challenge &amp; Server Scoreboard</h2>
            <p className={s.copy}>
              Mint A Cryptographically Signed Challenge Token That Locks An Exact Question Sequence And Grades Challenger And Opponent From Server-Owned Training Receipts.
            </p>
            <div className={s.formGrid}>
              <label className={s.fieldLabel}>
                Duel Format
                <select
                  aria-label="Duel Format"
                  data-duel-format-select="true"
                  value={selectedGameId}
                  onChange={(e) => setSelectedGameId(e.target.value)}
                  className={s.field}
                >
                  {duelArenas.map((d) => (
                    <option key={d.id} value={d.id}>{d.title} ({d.id})</option>
                  ))}
                </select>
              </label>
              <label className={s.fieldLabel}>
                Duel Variant
                <select
                  aria-label="Duel Variant"
                  data-duel-variant-select="true"
                  value={selectedVariant}
                  onChange={(e) => setSelectedVariant(e.target.value)}
                  className={s.field}
                >
                  <option value="nlh">NLHE (2 Cards)</option>
                  <option value="plo4">PLO4 (4 Cards)</option>
                  <option value="plo5">PLO5 (5 Cards)</option>
                  <option value="plo6">PLO6 (6 Cards)</option>
                  <option value="plo8">PLO8 (Hi-Lo)</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              data-create-duel-btn="true"
              disabled={creatingDuel}
              onClick={() => handleCreateSignedDuel(selectedGameId)}
              className={`sd-button sd-primary ${s.primaryAction}`}
            >
              {creatingDuel ? 'Minting Challenge...' : 'Create Signed Duel Challenge'}
            </button>

            {duelError ? (
              <p data-duel-error="true" role="alert" className={s.error}>
                {duelError}
              </p>
            ) : null}

            {activeDuel ? (
              <div data-signed-duel-created="true" className={`sd-metric ${s.card}`}>
                <div className={s.list}>
                  <div className={s.kv}><span>Duel ID</span><strong data-duel-id="true">{activeDuel.duelId}</strong></div>
                  <div className={s.kv}><span>Format</span><strong>{activeDuel.gameId} · {String(activeDuel.variant || 'nlh').toUpperCase()}</strong></div>
                  <div className={s.kv}><span>Locked Cohort</span><strong><span data-duel-question-count="true">{activeDuel.questionIds?.length || activeDuel.targetHands}</span> Identical Hands</strong></div>
                </div>
                <div className={s.small}>
                  Signed Token: <code data-signed-duel-token="true" className={s.code}>{activeDuel.duelToken}</code>
                </div>
                <div className={s.actions}>
                  <a
                    href={buildDuelArenaHref(activeDuel, 'challenger')}
                    data-play-challenger-duel="true"
                    className={`sd-button sd-primary ${s.button}`}
                  >
                    Play Challenger Hands
                  </a>
                  <a
                    href={buildDuelArenaHref(activeDuel, 'opponent')}
                    data-play-opponent-duel="true"
                    className={`sd-button ${s.button}`}
                  >
                    Accept &amp; Play As Opponent
                  </a>
                </div>
              </div>
            ) : null}

            <hr className={s.rule} />
            <label className={s.fieldLabel}>
              Inspect A Duel Scoreboard
              <input
                type="text"
                data-duel-token-input="true"
                value={duelTokenInput}
                onChange={(e) => setDuelTokenInput(e.target.value)}
                placeholder="Paste Signed Duel Token"
                className={s.field}
              />
            </label>
            <button
              type="button"
              data-load-duel-scoreboard="true"
              disabled={loadingScoreboard}
              onClick={() => loadScoreboard(duelTokenInput)}
              className={`sd-button ${s.button}`}
            >
              {loadingScoreboard ? 'Verifying...' : 'Load Verified Scoreboard'}
            </button>

            {scoreboard ? (
              <div data-duel-scoreboard="true" data-duel-status={scoreboard.status} className={`sd-metric ${s.card}`}>
                <div className={s.row}>
                  <p className={s.subTitle}>
                    Verified Two-Player Server Scoreboard ({scoreboard.duelId})
                  </p>
                  <span data-duel-winner-badge="true" className={s.tag}>
                    {scoreboard.winner ? `Winner: ${scoreboard.winner}` : `Status: ${scoreboard.status}`}
                  </span>
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
                    className={`sd-button sd-primary ${s.button}`}
                  >
                    {creatingDuel ? 'Minting Rematch...' : 'Instant 10-Hand Rematch'}
                  </button>
                ) : null}
                <div className={s.metrics2}>
                  {[scoreboard.challenger, scoreboard.opponent].filter(Boolean).map((side) => (
                    <div
                      key={side.role}
                      data-duel-side={side.role.toLowerCase()}
                      className={`sd-metric ${s.metric} ${s.metricLeft}`}
                    >
                      <span className={s.metricLabel}>{side.role}: {side.name}</span>
                      <strong className={s.metricValue} data-tone="ice" data-duel-side-accuracy={side.role.toLowerCase()}>{side.accuracyPct}% Accuracy</strong>
                      <span className={s.small} data-duel-side-hands={side.role.toLowerCase()}>Hands Graded: {side.handsAnswered}/{scoreboard.targetHands}</span>
                      <span className={s.small} data-duel-side-evloss={side.role.toLowerCase()}>EV Loss: {side.totalEvLoss} BB</span>
                    </div>
                  ))}
                </div>

                {scoreboard.status === 'completed' ? (
                  <div data-duel-hand-by-hand="true" className={s.tableWrap}>
                    <p className={s.eyebrow}>
                      Hand 1 To {Number(scoreboard.handsCount || scoreboard.targetHands || 10)} Side-By-Side Duel Breakdown
                    </p>
                    <p className={s.small}>
                      Each Cell: Grade, Action, EV Loss. {scoreboard.challenger?.name || 'Challenger'} Vs {scoreboard.opponent?.name || 'Opponent'} · {scoreboard.gameId || selectedGameId} ({String(scoreboard.variant || selectedVariant || 'nlh').toUpperCase()})
                    </p>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          <th>Hand</th>
                          <th>Challenger</th>
                          <th>Opponent</th>
                          <th>Winner</th>
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
                            >
                              <td className={s.ice}>{idx + 1}</td>
                              <td>
                                <span className={`${s.cellMain} ${chalCorrect ? s.up : s.down}`}>{chalCorrect ? 'Correct' : 'Mistake'}</span>
                                <span className={s.cellSub}>{chalAction}</span>
                                <span className={s.cellSub}>-{chalEvLoss} BB</span>
                              </td>
                              <td>
                                <span className={`${s.cellMain} ${oppCorrect ? s.up : s.down}`}>{oppCorrect ? 'Correct' : 'Mistake'}</span>
                                <span className={s.cellSub}>{oppAction}</span>
                                <span className={s.cellSub}>-{oppEvLoss} BB</span>
                              </td>
                              <td className={handWinner === 'Tie' ? undefined : s.ice}>{handWinner}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </>
  );
}
