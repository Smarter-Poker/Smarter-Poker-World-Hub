/**
 * FLOP TEXTURE ANALYZER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Analyze flop textures and their strategic implications:
 * - Categorize flops by texture (dry, wet, monotone, paired, etc.)
 * - Show c-bet frequencies by texture type
 * - Equity distribution shifts on different textures
 * - Board interaction with common ranges
 * - Texture-specific strategy recommendations
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● FLOP TEXTURE DATABASE ●●●
const TEXTURES = [
  {
    id: 'dry_rainbow',
    name: 'Dry Rainbow',
    example: 'K♠ 7♦ 2♣',
    cards: ['K♠', '7♦', '2♣'],
    traits: ['No flush draws', 'No straight draws', 'Disconnected'],
    ipCbet: 72, oopCbet: 38,
    ipFreq: { bet33: 55, bet67: 17, check: 28 },
    oopFreq: { bet33: 25, bet67: 13, check: 62 },
    equityShift: 'IP advantage grows — fewer draws to protect against',
    strategy: 'High c-bet frequency with small sizing. Range advantage is strong. Bluff with any two overcards.',
    connectedness: 12, flushDraw: 0, straightDraw: 18, paired: false, highCard: 'K',
    rangeHits: { toppair: 22, overpair: 8, draws: 5, air: 65 },
  },
  {
    id: 'wet_twotone',
    name: 'Wet Two-Tone',
    example: 'T♠ 9♠ 7♦',
    cards: ['T♠', '9♠', '7♦'],
    traits: ['Flush draw present', 'Multiple straight draws', 'Connected'],
    ipCbet: 48, oopCbet: 28,
    ipFreq: { bet33: 20, bet67: 28, check: 52 },
    oopFreq: { bet33: 12, bet67: 16, check: 72 },
    equityShift: 'Equity runs closer — many draws available for both sides',
    strategy: 'Selective c-betting with polarized sizing. Check more medium-strength hands. Protect strong hands with larger bets.',
    connectedness: 88, flushDraw: 45, straightDraw: 72, paired: false, highCard: 'T',
    rangeHits: { toppair: 18, overpair: 6, draws: 42, air: 34 },
  },
  {
    id: 'monotone',
    name: 'Monotone',
    example: 'Q♥ 8♥ 3♥',
    cards: ['Q♥', '8♥', '3♥'],
    traits: ['All same suit', 'Flush possible', 'Draw-heavy'],
    ipCbet: 35, oopCbet: 22,
    ipFreq: { bet33: 25, bet67: 10, check: 65 },
    oopFreq: { bet33: 15, bet67: 7, check: 78 },
    equityShift: 'Dramatic equity leveling — flush draws dominate ranges',
    strategy: 'Very low c-bet frequency. Only bet with made flushes and nut flush draws. Check most of range.',
    connectedness: 25, flushDraw: 100, straightDraw: 22, paired: false, highCard: 'Q',
    rangeHits: { toppair: 15, overpair: 5, draws: 55, air: 25 },
  },
  {
    id: 'paired',
    name: 'Paired Board',
    example: 'J♠ J♦ 5♣',
    cards: ['J♠', 'J♦', '5♣'],
    traits: ['Board paired', 'Trip potential', 'Reduced combos'],
    ipCbet: 65, oopCbet: 32,
    ipFreq: { bet33: 50, bet67: 15, check: 35 },
    oopFreq: { bet33: 22, bet67: 10, check: 68 },
    equityShift: 'IP range advantage — paired board reduces villain\'s strong combos significantly',
    strategy: 'High c-bet frequency with small sizing. Few strong hands in either range. Bluff frequently as trips are rare.',
    connectedness: 8, flushDraw: 0, straightDraw: 12, paired: true, highCard: 'J',
    rangeHits: { toppair: 5, overpair: 8, draws: 8, air: 79 },
  },
  {
    id: 'broadway_heavy',
    name: 'Broadway Heavy',
    example: 'A♠ K♦ Q♣',
    cards: ['A♠', 'K♦', 'Q♣'],
    traits: ['All broadway cards', 'Straight possibilities', 'Hits wide ranges'],
    ipCbet: 42, oopCbet: 35,
    ipFreq: { bet33: 30, bet67: 12, check: 58 },
    oopFreq: { bet33: 22, bet67: 13, check: 65 },
    equityShift: 'Equities converge — both ranges hit this board heavily',
    strategy: 'Moderate c-bet frequency. Both ranges connect strongly. Focus on nut advantage with sets and straights.',
    connectedness: 95, flushDraw: 0, straightDraw: 85, paired: false, highCard: 'A',
    rangeHits: { toppair: 35, overpair: 0, draws: 28, air: 37 },
  },
  {
    id: 'low_connected',
    name: 'Low Connected',
    example: '6♠ 5♥ 4♦',
    cards: ['6♠', '5♥', '4♦'],
    traits: ['Low cards', 'Very connected', 'Favors BB range'],
    ipCbet: 38, oopCbet: 30,
    ipFreq: { bet33: 18, bet67: 20, check: 62 },
    oopFreq: { bet33: 18, bet67: 12, check: 70 },
    equityShift: 'BB range catches up — low connected boards favor defending ranges',
    strategy: 'Lower c-bet frequency from IP. OOP has many two-pair and straight combos. Size up when betting for protection.',
    connectedness: 92, flushDraw: 0, straightDraw: 78, paired: false, highCard: '6',
    rangeHits: { toppair: 12, overpair: 12, draws: 38, air: 38 },
  },
  {
    id: 'ace_high_dry',
    name: 'Ace-High Dry',
    example: 'A♣ 7♥ 2♦',
    cards: ['A♣', '7♥', '2♦'],
    traits: ['Ace high', 'Very dry', 'Strong IP advantage'],
    ipCbet: 78, oopCbet: 42,
    ipFreq: { bet33: 62, bet67: 16, check: 22 },
    oopFreq: { bet33: 30, bet67: 12, check: 58 },
    equityShift: 'Maximum IP range advantage — ace blocks BB\'s strongest hands',
    strategy: 'Very high c-bet frequency with small sizing. IP has massive range advantage. Bluff almost everything.',
    connectedness: 8, flushDraw: 0, straightDraw: 10, paired: false, highCard: 'A',
    rangeHits: { toppair: 28, overpair: 4, draws: 3, air: 65 },
  },
  {
    id: 'mid_twotone',
    name: 'Mid Two-Tone',
    example: '8♦ 6♦ 3♠',
    cards: ['8♦', '6♦', '3♠'],
    traits: ['Mid cards', 'Flush draw', 'Semi-connected'],
    ipCbet: 55, oopCbet: 30,
    ipFreq: { bet33: 38, bet67: 17, check: 45 },
    oopFreq: { bet33: 18, bet67: 12, check: 70 },
    equityShift: 'Moderate equity shift — flush draws keep BB in more pots',
    strategy: 'Medium c-bet frequency. Use small sizing with overcards, larger with strong hands. Check middle pairs.',
    connectedness: 45, flushDraw: 45, straightDraw: 35, paired: false, highCard: '8',
    rangeHits: { toppair: 15, overpair: 10, draws: 32, air: 43 },
  },
];

function getTextureColor(val) {
  if (val >= 75) return '#ef4444';
  if (val >= 50) return '#f59e0b';
  if (val >= 25) return '#3b82f6';
  return '#22c55e';
}

// ●●● TEXTURE METER ●●●
function TextureMeter({ label, value, max = 100 }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#94a3b8', fontSize: 9 }}>{label}</span>
        <span style={{ color: getTextureColor(value), fontSize: 9, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${(value / max) * 100}%`, height: '100%', borderRadius: 3, background: getTextureColor(value), transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

// ●●● RANGE HIT CHART ●●●
function RangeHitChart({ hits }) {
  const categories = [
    { key: 'toppair', label: 'Top Pair+', color: '#22c55e' },
    { key: 'overpair', label: 'Overpair', color: '#3b82f6' },
    { key: 'draws', label: 'Draws', color: '#f59e0b' },
    { key: 'air', label: 'Air', color: '#64748b' },
  ];
  return (
    <div style={{ display: 'flex', gap: 2, height: 28, borderRadius: 6, overflow: 'hidden' }}>
      {categories.map(c => (
        <div key={c.key} style={{
          width: `${hits[c.key]}%`, background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0.7, transition: 'width 0.3s', minWidth: hits[c.key] > 8 ? 'auto' : 0,
        }}>
          {hits[c.key] > 10 && <span style={{ color: '#fff', fontSize: 7, fontWeight: 700 }}>{c.label} {hits[c.key]}%</span>}
        </div>
      ))}
    </div>
  );
}

// ●●● CBET COMPARISON ●●●
function CbetComparison({ texture }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div>
        <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>IP C-Bet Strategy</div>
        <div style={{ color: '#22c55e', fontSize: 22, fontWeight: 800 }}>{texture.ipCbet}%</div>
        <div style={{ display: 'flex', gap: 2, height: 16, borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
          <div style={{ width: `${texture.ipFreq.bet33}%`, background: '#3b82f6', opacity: 0.6 }} />
          <div style={{ width: `${texture.ipFreq.bet67}%`, background: '#ef4444', opacity: 0.6 }} />
          <div style={{ width: `${texture.ipFreq.check}%`, background: '#64748b', opacity: 0.4 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <span style={{ color: '#3b82f6', fontSize: 8 }}>33%: {texture.ipFreq.bet33}%</span>
          <span style={{ color: '#ef4444', fontSize: 8 }}>67%: {texture.ipFreq.bet67}%</span>
          <span style={{ color: '#64748b', fontSize: 8 }}>Check: {texture.ipFreq.check}%</span>
        </div>
      </div>
      <div>
        <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>OOP C-Bet Strategy</div>
        <div style={{ color: '#f59e0b', fontSize: 22, fontWeight: 800 }}>{texture.oopCbet}%</div>
        <div style={{ display: 'flex', gap: 2, height: 16, borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
          <div style={{ width: `${texture.oopFreq.bet33}%`, background: '#3b82f6', opacity: 0.6 }} />
          <div style={{ width: `${texture.oopFreq.bet67}%`, background: '#ef4444', opacity: 0.6 }} />
          <div style={{ width: `${texture.oopFreq.check}%`, background: '#64748b', opacity: 0.4 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <span style={{ color: '#3b82f6', fontSize: 8 }}>33%: {texture.oopFreq.bet33}%</span>
          <span style={{ color: '#ef4444', fontSize: 8 }}>67%: {texture.oopFreq.bet67}%</span>
          <span style={{ color: '#64748b', fontSize: 8 }}>Check: {texture.oopFreq.check}%</span>
        </div>
      </div>
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function FlopTextureAnalyzer() {
  const [selectedTexture, setSelectedTexture] = useState(TEXTURES[0]);
  const [viewMode, setViewMode] = useState('detail'); // detail | compare

  const sortedByIpCbet = useMemo(() => [...TEXTURES].sort((a, b) => b.ipCbet - a.ipCbet), []);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Flop Texture Analyzer</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Understand how board texture affects strategy</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['detail', 'compare'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: viewMode === m ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: viewMode === m ? '#3b82f6' : '#64748b', fontSize: 10, fontWeight: 600,
              }}>{m === 'detail' ? 'Detail View' : 'Compare All'}</button>
            ))}
          </div>
        </div>

        {/* Texture selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', flexWrap: 'wrap' }}>
          {TEXTURES.map(t => (
            <button key={t.id} onClick={() => setSelectedTexture(t)} style={{
              padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
              background: selectedTexture.id === t.id ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.15)',
              border: selectedTexture.id === t.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              color: selectedTexture.id === t.id ? '#f1f5f9' : '#94a3b8', fontSize: 10, fontWeight: 600,
            }}>
              <div>{t.name}</div>
              <div style={{ color: '#64748b', fontSize: 8, marginTop: 1 }}>{t.example}</div>
            </button>
          ))}
        </div>

        {viewMode === 'detail' ? (
          <>
            {/* Board display */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {selectedTexture.cards.map((card, i) => (
                    <div key={i} style={{
                      width: 48, height: 64, borderRadius: 6, background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: card.includes('♥') || card.includes('♦') ? '#ef4444' : '#f1f5f9',
                      fontSize: 16, fontWeight: 800,
                    }}>{card}</div>
                  ))}
                </div>
                <div>
                  <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 800 }}>{selectedTexture.name}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {selectedTexture.traits.map((t, i) => (
                      <span key={i} style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 8, fontWeight: 600 }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Texture meters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <TextureMeter label="Connectedness" value={selectedTexture.connectedness} />
                <TextureMeter label="Flush Draw" value={selectedTexture.flushDraw} />
                <TextureMeter label="Straight Draw" value={selectedTexture.straightDraw} />
              </div>
            </div>

            {/* C-Bet comparison */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>C-Bet Frequencies</div>
              <CbetComparison texture={selectedTexture} />
            </div>

            {/* Range hits */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Range Distribution on This Board</div>
              <RangeHitChart hits={selectedTexture.rangeHits} />
              <div style={{ display: 'flex', gap: 10, marginTop: 6, justifyContent: 'center' }}>
                {[{ label: 'Top Pair+', color: '#22c55e' }, { label: 'Overpair', color: '#3b82f6' }, { label: 'Draws', color: '#f59e0b' }, { label: 'Air', color: '#64748b' }].map(c => (
                  <span key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.color }} />
                    <span style={{ color: '#94a3b8', fontSize: 8 }}>{c.label}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Equity shift */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Equity Dynamics</div>
              <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.5 }}>{selectedTexture.equityShift}</div>
            </div>

            {/* Strategy */}
            <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 12, border: '1px solid rgba(59,130,246,0.15)' }}>
              <div style={{ color: '#3b82f6', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Recommended Strategy</div>
              <div style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.6 }}>{selectedTexture.strategy}</div>
            </div>
          </>
        ) : (
          /* Compare All View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 60px 60px 60px 60px 1fr', gap: 4, padding: '4px 8px' }}>
              <span style={{ color: '#475569', fontSize: 8, fontWeight: 700 }}>TEXTURE</span>
              <span style={{ color: '#475569', fontSize: 8, fontWeight: 700, textAlign: 'center' }}>IP C-BET</span>
              <span style={{ color: '#475569', fontSize: 8, fontWeight: 700, textAlign: 'center' }}>OOP C-BET</span>
              <span style={{ color: '#475569', fontSize: 8, fontWeight: 700, textAlign: 'center' }}>CONNECT</span>
              <span style={{ color: '#475569', fontSize: 8, fontWeight: 700, textAlign: 'center' }}>FLUSH DR</span>
              <span style={{ color: '#475569', fontSize: 8, fontWeight: 700 }}>RANGE HITS</span>
            </div>
            {sortedByIpCbet.map(t => (
              <div key={t.id} onClick={() => { setSelectedTexture(t); setViewMode('detail'); }} style={{
                display: 'grid', gridTemplateColumns: '120px 60px 60px 60px 60px 1fr', gap: 4,
                padding: '8px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(0,0,0,0.1)', border: '1px solid transparent',
              }}>
                <div>
                  <div style={{ color: '#f1f5f9', fontSize: 11, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ color: '#64748b', fontSize: 9 }}>{t.example}</div>
                </div>
                <div style={{ color: '#22c55e', fontSize: 14, fontWeight: 800, textAlign: 'center' }}>{t.ipCbet}%</div>
                <div style={{ color: '#f59e0b', fontSize: 14, fontWeight: 800, textAlign: 'center' }}>{t.oopCbet}%</div>
                <div style={{ color: getTextureColor(t.connectedness), fontSize: 14, fontWeight: 800, textAlign: 'center' }}>{t.connectedness}</div>
                <div style={{ color: getTextureColor(t.flushDraw), fontSize: 14, fontWeight: 800, textAlign: 'center' }}>{t.flushDraw}</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <RangeHitChart hits={t.rangeHits} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Flop Texture Analyzer</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
