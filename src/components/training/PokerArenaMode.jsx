/**
 * PokerArenaMode — Competitive 1v1 Arena with Ranking
 * COMPETITIVE GAP CLOSER: Mirrors GTO Wizard's PokerArena
 * Competitive heads-up play with ELO ranking, seasons, and rewards
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const RANKS = [
  { name: 'Iron', range: '0-1199', color: '#64748b', icon: '●', div: ['III', 'II', 'I'] },
  { name: 'Bronze', range: '1200-1499', color: '#cd7f32', icon: '●', div: ['III', 'II', 'I'] },
  { name: 'Silver', range: '1500-1799', color: '#c0c0c0', icon: '●', div: ['III', 'II', 'I'] },
  { name: 'Gold', range: '1800-2099', color: '#ffd700', icon: '●', div: ['III', 'II', 'I'] },
  { name: 'Diamond', range: '2100+', color: '#06b6d4', icon: '◆', div: ['III', 'II', 'I'] },
];

const LEADERBOARD = [
  { rank: 1, name: 'SolverKing', elo: 2387, wins: 342, losses: 128, tier: 'Diamond I', streak: 8 },
  { rank: 2, name: 'GTOCrusher', elo: 2301, wins: 298, losses: 145, tier: 'Diamond II', streak: 5 },
  { rank: 3, name: 'NittyPro', elo: 2245, wins: 276, losses: 160, tier: 'Diamond II', streak: 3 },
  { rank: 4, name: 'BalancedPlay', elo: 2189, wins: 310, losses: 190, tier: 'Diamond III', streak: 2 },
  { rank: 5, name: 'RiverShark', elo: 2104, wins: 255, losses: 175, tier: 'Diamond III', streak: 1 },
  { rank: 6, name: 'FloatMaster', elo: 2055, wins: 230, losses: 168, tier: 'Gold I', streak: 4 },
  { rank: 7, name: 'BluffCatcher', elo: 1988, wins: 212, losses: 180, tier: 'Gold I', streak: 0 },
  { rank: 8, name: 'ValueTown', elo: 1920, wins: 195, losses: 165, tier: 'Gold II', streak: 2 },
];

const MATCH_HISTORY = [
  { opp: 'GTOCrusher', result: 'W', elo: '+18', hands: 24, score: 82, key_hand: 'Hero shoved river with nut blocker' },
  { opp: 'RiverShark', result: 'W', elo: '+15', hands: 31, score: 74, key_hand: 'Called light with 2nd pair, villain was bluffing' },
  { opp: 'NittyPro', result: 'L', elo: '-12', hands: 28, score: 65, key_hand: 'Overplayed top pair vs set on turn' },
  { opp: 'BalancedPlay', result: 'W', elo: '+20', hands: 19, score: 88, key_hand: 'Perfect 3-barrel bluff on scary runout' },
  { opp: 'FloatMaster', result: 'L', elo: '-14', hands: 35, score: 58, key_hand: 'Got floated and double-barreled into the nuts' },
];

export default function PokerArenaMode() {
  const [tab, setTab] = useState('play');
  const [searching, setSearching] = useState(false);
  const [matched, setMatched] = useState(false);

  const handleFindMatch = () => {
    setSearching(true);
    setMatched(false);
    setTimeout(() => { setSearching(false); setMatched(true); }, 2000);
  };

  const myElo = 1865;
  const myRank = RANKS.find(r => {
    const [min] = r.range.split('-').map(n => parseInt(n));
    return myElo >= min;
  }) || RANKS[0];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #ef4444, #f59e0b, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Poker Arena — Competitive 1v1
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>Play heads-up against real opponents. Climb the ranks. Prove your skills.</p>

      {/* My Rank Card */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        border: `1px solid ${myRank.color}30` }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b' }}>YOUR RANK</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: myRank.color }}>{myRank.icon} Gold II</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace' }}>{myElo}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>ELO Rating</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#22c55e' }}>142-98</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>W-L Record</div>
        </div>
      </div>

      {/* Tab Selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[{ id: 'play', label: 'Play', color: '#22c55e' }, { id: 'leaderboard', label: 'Leaderboard', color: '#f59e0b' }, { id: 'history', label: 'History', color: '#3b82f6' }, { id: 'ranks', label: 'Ranks', color: '#8b5cf6' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '6px 12px', borderRadius: 8, border: tab === t.id ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: tab === t.id ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: tab === t.id ? t.color : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'play' && (
          <motion.div key="play" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>»</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0', marginBottom: 4 }}>Heads-Up Hyper-Turbo</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>500 chips • 10/20 blinds • 2-min levels</div>
            <button onClick={handleFindMatch} disabled={searching}
              style={{ padding: '12px 32px', borderRadius: 12, border: 'none', cursor: searching ? 'wait' : 'pointer',
                background: searching ? 'rgba(245,158,11,0.3)' : matched ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg, #ef4444, #f59e0b)',
                fontSize: 16, fontWeight: 800, color: '#fff', minWidth: 200 }}>
              {searching ? '○ Finding opponent...' : matched ? '✓ Match Found — GTOCrusher (2301)' : '● Find Match'}
            </button>
            {matched && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                style={{ marginTop: 12, fontSize: 12, color: '#22c55e' }}>
                Starting in 3 seconds... Good luck!
              </motion.div>
            )}
          </motion.div>
        )}

        {tab === 'leaderboard' && (
          <motion.div key="lb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1fr 1fr 1fr', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['#', 'Player', 'ELO', 'Record', 'Streak'].map(h => (
                <div key={h} style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {LEADERBOARD.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1fr 1fr 1fr', padding: '8px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.03)', background: i < 3 ? 'rgba(255,215,0,0.03)' : 'transparent' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: i < 3 ? '#ffd700' : '#64748b' }}>#{p.rank}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{p.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', fontFamily: 'monospace' }}>{p.elo}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.wins}-{p.losses}</span>
                <span style={{ fontSize: 11, color: p.streak > 0 ? '#22c55e' : '#64748b' }}>{p.streak > 0 ? `▲${p.streak}` : '-'}</span>
              </div>
            ))}
          </motion.div>
        )}

        {tab === 'history' && (
          <motion.div key="hist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'grid', gap: 6 }}>
            {MATCH_HISTORY.map((m, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 12,
                borderLeft: `3px solid ${m.result === 'W' ? '#22c55e' : '#ef4444'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>vs {m.opp}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: m.result === 'W' ? '#22c55e' : '#ef4444' }}>{m.result === 'W' ? 'WIN' : 'LOSS'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: m.result === 'W' ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>{m.elo}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{m.hands} hands | GTOW Score: {m.score}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Key: {m.key_hand}</div>
              </div>
            ))}
          </motion.div>
        )}

        {tab === 'ranks' && (
          <motion.div key="ranks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'grid', gap: 8 }}>
            {RANKS.map((r, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 12,
                border: `1px solid ${r.color}30`, opacity: myElo >= parseInt(r.range) ? 1 : 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: r.color }}>{r.icon} {r.name}</span>
                  <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{r.range} ELO</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {r.div.map((d, j) => (
                    <span key={j} style={{ padding: '2px 8px', borderRadius: 4, background: `${r.color}10`, fontSize: 10, fontWeight: 700, color: r.color }}>
                      {r.name} {d}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
