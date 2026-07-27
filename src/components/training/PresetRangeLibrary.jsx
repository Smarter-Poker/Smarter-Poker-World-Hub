/**
 * PresetRangeLibrary — GTO Wizard-Style Saved Range Library
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Browse, search, and study curated GTO ranges organized by game type,
 * position, and action. Each range shows the 13x13 grid with frequencies.
 */
import React, { useState, useMemo } from 'react';

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];

const RANGE_LIBRARY = [
  {
    id: 1, name: 'UTG Open (6-Max Cash)', category: 'RFI', position: 'UTG', gameType: 'Cash',
    description: 'Tight opening range from under-the-gun. ~15% of hands.',
    hands: 'AA,KK,QQ,JJ,TT,99,88,77,AKs,AQs,AJs,ATs,A5s,A4s,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,AKo,AQo,AJo,KQo',
  },
  {
    id: 2, name: 'BTN Open (6-Max Cash)', category: 'RFI', position: 'BTN', gameType: 'Cash',
    description: 'Wide button opening range. ~42% of hands.',
    hands: 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,QJs,QTs,Q9s,Q8s,Q7s,JTs,J9s,J8s,J7s,T9s,T8s,T7s,98s,97s,96s,87s,86s,85s,76s,75s,65s,64s,54s,53s,43s,AKo,AQo,AJo,ATo,A9o,A8o,A7o,KQo,KJo,KTo,K9o,QJo,QTo,Q9o,JTo,J9o,T9o,98o,87o',
  },
  {
    id: 3, name: 'BB Defend vs BTN', category: '3-Bet/Call', position: 'BB', gameType: 'Cash',
    description: 'Big blind defending range vs button open. ~55% of hands.',
    hands: 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,K4s,K3s,QJs,QTs,Q9s,Q8s,Q7s,Q6s,Q5s,JTs,J9s,J8s,J7s,J6s,T9s,T8s,T7s,T6s,98s,97s,96s,95s,87s,86s,85s,76s,75s,74s,65s,64s,63s,54s,53s,52s,43s,42s,32s,AKo,AQo,AJo,ATo,A9o,A8o,A7o,A6o,A5o,A4o,A3o,KQo,KJo,KTo,K9o,K8o,K7o,QJo,QTo,Q9o,Q8o,JTo,J9o,J8o,T9o,T8o,98o,97o,87o,86o,76o,65o',
  },
  {
    id: 4, name: 'CO 3-Bet vs UTG', category: '3-Bet/Call', position: 'CO', gameType: 'Cash',
    description: 'Polarized 3-bet range from cutoff vs UTG open. ~8% of hands.',
    hands: 'AA,KK,QQ,JJ,AKs,AQs,A5s,A4s,KQs,AKo,AQo,76s,87s,98s,T9s',
  },
  {
    id: 5, name: 'SB Shove 15bb (MTT)', category: 'Tournament', position: 'SB', gameType: 'MTT',
    description: 'Small blind push range at 15bb effective. ~42% of hands.',
    hands: 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,QJs,QTs,Q9s,Q8s,JTs,J9s,J8s,T9s,T8s,98s,97s,87s,76s,65s,54s,AKo,AQo,AJo,ATo,A9o,A8o,A7o,KQo,KJo,KTo,QJo,QTo,JTo',
  },
  {
    id: 6, name: 'BB Call vs SB Shove 15bb', category: 'Tournament', position: 'BB', gameType: 'MTT',
    description: 'Big blind calling range vs SB shove at 15bb. ~28% of hands.',
    hands: 'AA,KK,QQ,JJ,TT,99,88,77,66,AKs,AQs,AJs,ATs,A9s,A8s,A7s,KQs,KJs,KTs,QJs,QTs,JTs,AKo,AQo,AJo,ATo,A9o,KQo,KJo',
  },
];

function parseHands(handStr) {
  return new Set(handStr.split(','));
}

function getGridCell(r, c) {
  if (r === c) return RANKS[r] + RANKS[c]; // pair
  if (r < c) return RANKS[r] + RANKS[c] + 's'; // suited
  return RANKS[c] + RANKS[r] + 'o'; // offsuit
}

function RangeGrid({ hands, size }) {
  const handSet = useMemo(() => parseHands(hands), [hands]);
  const cellSize = size || 22;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(13, ${cellSize}px)`, gap: 1 }}>
      {RANKS.map((_, r) =>
        RANKS.map((_, c) => {
          const hand = getGridCell(r, c);
          const inRange = handSet.has(hand);
          return (
            <div key={`${r}-${c}`} style={{
              width: cellSize, height: cellSize, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: cellSize < 24 ? 7 : 9, fontWeight: 600, fontFamily: 'monospace',
              background: inRange ? (r === c ? 'rgba(239,68,68,0.5)' : r < c ? 'rgba(59,130,246,0.5)' : 'rgba(16,185,129,0.5)') : 'rgba(255,255,255,0.03)',
              color: inRange ? '#fff' : 'rgba(255,255,255,0.15)',
              borderRadius: 2,
            }}>
              {hand}
            </div>
          );
        })
      )}
    </div>
  );
}

function PresetRangeLibrary() {
  const [selectedId, setSelectedId] = useState(null);
  const [filterCat, setFilterCat] = useState('All');
  const [filterGame, setFilterGame] = useState('All');
  const [searchText, setSearchText] = useState('');

  const categories = useMemo(() => ['All', ...new Set(RANGE_LIBRARY.map(r => r.category))], []);
  const gameTypes = useMemo(() => ['All', ...new Set(RANGE_LIBRARY.map(r => r.gameType))], []);

  const filtered = useMemo(() => {
    return RANGE_LIBRARY.filter(r => {
      if (filterCat !== 'All' && r.category !== filterCat) return false;
      if (filterGame !== 'All' && r.gameType !== filterGame) return false;
      if (searchText && !r.name.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [filterCat, filterGame, searchText]);

  const selected = selectedId ? RANGE_LIBRARY.find(r => r.id === selectedId) : null;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#06b6d4' }}>Range Library</h3>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text" placeholder="Search ranges..." value={searchText} onChange={e => setSearchText(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, flex: 1, minWidth: 120 }}
          />
          {categories.map(c => (
            <button key={c} onClick={() => setFilterCat(c)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: filterCat === c ? '#06b6d4' : 'rgba(255,255,255,0.06)',
              color: filterCat === c ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{c}</button>
          ))}
          {gameTypes.map(g => (
            <button key={g} onClick={() => setFilterGame(g)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: filterGame === g ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
              color: filterGame === g ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{g}</button>
          ))}
        </div>

        {/* Range List */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: selected ? 16 : 0 }}>
          {filtered.map(r => (
            <div key={r.id} onClick={() => setSelectedId(selectedId === r.id ? null : r.id)} style={{
              padding: 10, borderRadius: 8, cursor: 'pointer',
              background: selectedId === r.id ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${selectedId === r.id ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.06)'}`,
              transition: 'all 0.15s ease',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{r.name}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>{r.position}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>{r.gameType}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <RangeGrid hands={r.hands} size={16} />
              </div>
            </div>
          ))}
        </div>

        {/* Detail View */}
        {selected && (
          <div style={{ padding: 16, background: 'rgba(6,182,212,0.06)', borderRadius: 10, border: '1px solid rgba(6,182,212,0.15)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#06b6d4', marginBottom: 8 }}>{selected.name}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 12 }}>{selected.description}</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <RangeGrid hands={selected.hands} size={26} />
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Combos: <span style={{ color: '#fff', fontWeight: 700 }}>{selected.hands.split(',').length}</span></div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Position: <span style={{ color: '#06b6d4', fontWeight: 700 }}>{selected.position}</span></div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Category: <span style={{ color: '#8b5cf6', fontWeight: 700 }}>{selected.category}</span></div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Game: <span style={{ color: '#f59e0b', fontWeight: 700 }}>{selected.gameType}</span></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: 'rgba(239,68,68,0.5)' }} /> <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Pairs</span>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: 'rgba(59,130,246,0.5)' }} /> <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Suited</span>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: 'rgba(16,185,129,0.5)' }} /> <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Offsuit</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Range Library failed to load: {err.message}</div>;
  }
}

export default PresetRangeLibrary;
