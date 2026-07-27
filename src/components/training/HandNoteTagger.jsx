/**
 * HAND NOTE TAGGER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Tag, annotate, and organize reviewed hands:
 * - Color-coded tags (leak, exploitable, standard, interesting, review)
 * - Free-text notes per hand
 * - Filter and search by tags
 * - Export tagged collection
 * - Star/favorite system
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● TAG DEFINITIONS ●●●
const TAGS = [
  { id: 'leak', label: 'Leak', color: '#ef4444', icon: '●' },
  { id: 'exploit', label: 'Exploitable', color: '#f59e0b', icon: '●' },
  { id: 'standard', label: 'Standard', color: '#22c55e', icon: '●' },
  { id: 'interesting', label: 'Interesting', color: '#3b82f6', icon: '●' },
  { id: 'review', label: 'Review Later', color: '#a855f7', icon: '●' },
  { id: 'bluff', label: 'Bluff Spot', color: '#ec4899', icon: '◆' },
  { id: 'value', label: 'Value Spot', color: '#14b8a6', icon: '●' },
  { id: 'tilt', label: 'Tilt Play', color: '#f97316', icon: '▲' },
];

// ●●● SAMPLE HANDS ●●●
const INITIAL_HANDS = [
  { id: 1, hand: 'A♠K♥', board: 'K♠ 8♦ 3♣ J♥ 2♠', position: 'BTN', action: 'Bet → Call → Check', result: '+12.5bb', tags: ['standard', 'value'], starred: false, note: 'Standard top pair value line. Could have bet bigger on river.', evLoss: 0.2 },
  { id: 2, hand: 'Q♥J♥', board: 'T♠ 9♠ 2♣ 8♦', position: 'CO', action: 'Raise → Bet → Bet', result: '+28.3bb', tags: ['interesting'], starred: true, note: 'Hit the straight on turn. Villain had flush draw.', evLoss: 0.0 },
  { id: 3, hand: '7♠6♠', board: 'A♣ K♦ 4♠ 9♠ 3♥', position: 'BTN', action: 'Call → Call → Bluff', result: '-15.0bb', tags: ['leak', 'bluff'], starred: false, note: 'Bad river bluff into station. Should have given up.', evLoss: 8.5 },
  { id: 4, hand: 'A♣A♥', board: 'Q♠ J♦ T♣ 2♥ K♠', position: 'UTG', action: 'Raise → 4-Bet → Check → Fold', result: '-22.0bb', tags: ['review', 'tilt'], starred: true, note: 'Folded aces on 4-straight board. Probably too tight but felt like a fold.', evLoss: 3.2 },
  { id: 5, hand: 'K♦Q♦', board: 'K♣ 7♥ 2♦ 5♦ A♦', position: 'BB', action: 'Check → Call → Raise', result: '+45.0bb', tags: ['interesting', 'value'], starred: true, note: 'Backdoor flush completed. Check-raised river for max value.', evLoss: 0.0 },
  { id: 6, hand: '9♠9♦', board: 'A♠ K♥ Q♠ J♦', position: 'MP', action: 'Call → Fold', result: '-3.0bb', tags: ['standard'], starred: false, note: 'Easy fold on scary board. Not much else to do here.', evLoss: 0.1 },
  { id: 7, hand: 'T♣8♣', board: 'J♠ 9♥ 3♣ 7♦', position: 'BTN', action: 'Raise → Bet → Bet', result: '+18.5bb', tags: ['exploit', 'bluff'], starred: false, note: 'Open-ended straight draw hit. Semi-bluff on flop was key.', evLoss: 0.5 },
  { id: 8, hand: '5♥5♣', board: '5♠ K♦ 8♣ K♠ 2♥', position: 'SB', action: 'Call → Check → Bet → Bet', result: '+52.0bb', tags: ['value', 'interesting'], starred: true, note: 'Full house! Slow played flop, villain had Kx and paid off.', evLoss: 1.0 },
];

// ●●● MAIN COMPONENT ●●●
export default function HandNoteTagger() {
  const [hands, setHands] = useState(INITIAL_HANDS);
  const [filterTag, setFilterTag] = useState(null);
  const [filterStarred, setFilterStarred] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [editText, setEditText] = useState('');
  const [sortBy, setSortBy] = useState('id'); // id | evLoss | result

  const filteredHands = useMemo(() => {
    let filtered = [...hands];
    if (filterTag) filtered = filtered.filter(h => h.tags.includes(filterTag));
    if (filterStarred) filtered = filtered.filter(h => h.starred);
    if (searchText) {
      const s = searchText.toLowerCase();
      filtered = filtered.filter(h =>
        h.hand.toLowerCase().includes(s) || h.note.toLowerCase().includes(s) ||
        h.position.toLowerCase().includes(s) || h.board.toLowerCase().includes(s)
      );
    }
    if (sortBy === 'evLoss') filtered.sort((a, b) => b.evLoss - a.evLoss);
    else if (sortBy === 'result') filtered.sort((a, b) => parseFloat(b.result) - parseFloat(a.result));
    return filtered;
  }, [hands, filterTag, filterStarred, searchText, sortBy]);

  const toggleTag = (handId, tagId) => {
    setHands(prev => prev.map(h =>
      h.id === handId
        ? { ...h, tags: h.tags.includes(tagId) ? h.tags.filter(t => t !== tagId) : [...h.tags, tagId] }
        : h
    ));
  };

  const toggleStar = (handId) => {
    setHands(prev => prev.map(h => h.id === handId ? { ...h, starred: !h.starred } : h));
  };

  const saveNote = (handId) => {
    setHands(prev => prev.map(h => h.id === handId ? { ...h, note: editText } : h));
    setEditingNote(null);
  };

  // Stats summary
  const tagCounts = TAGS.map(t => ({ ...t, count: hands.filter(h => h.tags.includes(t.id)).length }));
  const totalEVLoss = hands.reduce((a, h) => a + h.evLoss, 0);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Hand Notes</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
              {filteredHands.length} hands • {hands.filter(h => h.starred).length} starred • Total EV Loss: {totalEVLoss.toFixed(1)}bb
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['id', 'evLoss', 'result'].map(s => (
              <button key={s} onClick={() => setSortBy(s)} style={{
                padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: sortBy === s ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                color: sortBy === s ? '#fff' : '#94a3b8', fontSize: 10, fontWeight: 600,
              }}>{s === 'id' ? 'Recent' : s === 'evLoss' ? 'EV Loss' : 'Result'}</button>
            ))}
          </div>
        </div>

        {/* Search + Star filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Search hands, notes, positions..."
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.3)', color: '#f1f5f9', fontSize: 11,
            }}
          />
          <button onClick={() => setFilterStarred(!filterStarred)} style={{
            padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: filterStarred ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)',
            color: filterStarred ? '#f59e0b' : '#94a3b8', fontSize: 13,
          }}>★</button>
        </div>

        {/* Tag filters */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={() => setFilterTag(null)} style={{
            padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
            background: !filterTag ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
            color: !filterTag ? '#f1f5f9' : '#64748b', fontSize: 10, fontWeight: 600,
          }}>All ({hands.length})</button>
          {tagCounts.filter(t => t.count > 0).map(t => (
            <button key={t.id} onClick={() => setFilterTag(filterTag === t.id ? null : t.id)} style={{
              padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: filterTag === t.id ? `${t.color}20` : 'rgba(255,255,255,0.04)',
              color: filterTag === t.id ? t.color : '#64748b', fontSize: 10, fontWeight: 600,
              border: filterTag === t.id ? `1px solid ${t.color}30` : '1px solid transparent',
            }}>{t.icon} {t.label} ({t.count})</button>
          ))}
        </div>

        {/* Hands list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredHands.map(hand => (
            <div key={hand.id} style={{
              background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10,
              border: '1px solid rgba(255,255,255,0.04)',
            }}>
              {/* Hand header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <button onClick={() => toggleStar(hand.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0,
                  color: hand.starred ? '#f59e0b' : '#475569',
                }}>★</button>
                <span style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 800 }}>{hand.hand}</span>
                <span style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(245,158,11,0.1)' }}>
                  {hand.position}
                </span>
                <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>{hand.board}</span>
                <span style={{
                  color: hand.result.startsWith('+') ? '#22c55e' : '#ef4444',
                  fontSize: 13, fontWeight: 800,
                }}>{hand.result}</span>
                {hand.evLoss > 0 && (
                  <span style={{ color: '#ef4444', fontSize: 9, fontWeight: 600, padding: '1px 4px', borderRadius: 3, background: 'rgba(239,68,68,0.1)' }}>
                    -{hand.evLoss.toFixed(1)}bb EV
                  </span>
                )}
              </div>

              {/* Action line */}
              <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>{hand.action}</div>

              {/* Tags */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                {hand.tags.map(tagId => {
                  const tag = TAGS.find(t => t.id === tagId);
                  return tag ? (
                    <span key={tagId} onClick={() => toggleTag(hand.id, tagId)} style={{
                      padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                      background: `${tag.color}15`, color: tag.color, fontSize: 9, fontWeight: 600,
                      border: `1px solid ${tag.color}25`,
                    }}>{tag.icon} {tag.label} ✕</span>
                  ) : null;
                })}
                {/* Add tag dropdown */}
                {TAGS.filter(t => !hand.tags.includes(t.id)).length > 0 && (
                  <select
                    value="" onChange={e => e.target.value && toggleTag(hand.id, e.target.value)}
                    style={{
                      padding: '2px 4px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(0,0,0,0.3)', color: '#64748b', fontSize: 9, cursor: 'pointer',
                    }}
                  >
                    <option value="">+ Tag</option>
                    {TAGS.filter(t => !hand.tags.includes(t.id)).map(t => (
                      <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Note */}
              {editingNote === hand.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={editText} onChange={e => setEditText(e.target.value)} style={{
                    flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.3)', color: '#f1f5f9', fontSize: 10,
                  }} />
                  <button onClick={() => saveNote(hand.id)} style={{
                    padding: '4px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: '#22c55e', color: '#fff', fontSize: 9, fontWeight: 700,
                  }}>Save</button>
                  <button onClick={() => setEditingNote(null)} style={{
                    padding: '4px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: 9,
                  }}>Cancel</button>
                </div>
              ) : (
                <div onClick={() => { setEditingNote(hand.id); setEditText(hand.note); }}
                  style={{ color: '#94a3b8', fontSize: 10, cursor: 'pointer', padding: '4px 0', fontStyle: hand.note ? 'normal' : 'italic' }}>
                  {hand.note || 'Click to add note...'}
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredHands.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: '#475569', fontSize: 12 }}>
            No hands match your filters
          </div>
        )}
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Hand Notes</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
