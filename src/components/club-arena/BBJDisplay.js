/* ═══════════════════════════════════════════════════════════════════
   BAD BEAT JACKPOT — Interactive Display Component
   
   Updated with Futuristic Metal UI System, Real-time celebration
   listeners, haptics, and precise card/board logic.
   ═══════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import PlayingCard from '../poker/PlayingCard';
import { triggerHaptic } from '../../state/userPreferences';
import { getSupabase } from '../../config/supabaseClient';

const METAL = {
  bg: '#0d1117',
  panel: '#161b22',
  panelHover: '#21262d',
  border: '#30363d',
  cyan: '#00f2fe',
  cyanMuted: 'rgba(0, 242, 254, 0.2)',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  gold: '#FFD700',
  goldDark: '#B8860B',
  danger: '#fa383e',
  success: '#31a24c'
};

const STYLES = {
  container: {
    background: METAL.bg,
    color: METAL.text,
    fontFamily: '"Rajdhani", "Orbitron", sans-serif',
    borderRadius: '12px',
    border: `1px solid ${METAL.border}`,
    boxShadow: `0 8px 32px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)`,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    position: 'relative'
  },
  header: {
    background: `linear-gradient(180deg, ${METAL.panel} 0%, ${METAL.bg} 100%)`,
    padding: '20px',
    textAlign: 'center',
    borderBottom: `1px solid ${METAL.border}`,
    position: 'relative'
  },
  title: {
    fontFamily: '"Orbitron", sans-serif',
    fontSize: '28px',
    fontWeight: 800,
    color: METAL.cyan,
    textTransform: 'uppercase',
    letterSpacing: '2px',
    margin: '0 0 10px 0',
    textShadow: `0 0 15px ${METAL.cyanMuted}`
  },
  jackpotAmount: {
    fontSize: '48px',
    fontWeight: 900,
    color: METAL.gold,
    margin: 0,
    textShadow: '0 0 20px rgba(255, 215, 0, 0.4)',
    fontFamily: '"Orbitron", sans-serif',
    letterSpacing: '1px'
  },
  tabs: {
    display: 'flex',
    background: METAL.panel,
    borderBottom: `1px solid ${METAL.border}`
  },
  tab: (active) => ({
    flex: 1,
    padding: '12px',
    textAlign: 'center',
    cursor: 'pointer',
    fontWeight: active ? 700 : 500,
    color: active ? METAL.cyan : METAL.textMuted,
    borderBottom: active ? `3px solid ${METAL.cyan}` : '3px solid transparent',
    background: active ? `linear-gradient(180deg, transparent 0%, ${METAL.cyanMuted} 100%)` : 'transparent',
    transition: 'all 0.3s ease',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontSize: '14px'
  }),
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    background: METAL.bg
  },
  winnerCard: {
    background: METAL.panel,
    border: `1px solid ${METAL.border}`,
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    cursor: 'pointer'
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: `linear-gradient(135deg, ${METAL.goldDark}, ${METAL.gold})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    color: '#000',
    fontSize: '18px',
    boxShadow: '0 2px 8px rgba(255,215,0,0.3)',
    objectFit: 'cover'
  }
};

const capitalizeWords = (str) => {
  if (!str) return '';
  return str.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const parseAndSortCards = (cardString) => {
  if (!cardString) return [];
  const rawCards = cardString.match(/[a-zA-Z0-9]+/g) || [];
  const rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  return rawCards.sort((a, b) => {
    const valA = rankValues[a.charAt(0)] || 0;
    const valB = rankValues[b.charAt(0)] || 0;
    return valB - valA;
  });
};

const formatMoney = (n) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
};

const WinnersTab = ({ winners }) => {
  const [expandedId, setExpandedId] = useState(null);

  if (!winners || winners.length === 0) {
    return <div style={{ textAlign: 'center', color: METAL.textMuted, padding: '40px' }}>No jackpots hit yet.</div>;
  }

  return (
    <div>
      {winners.map(w => {
        const isExpanded = expandedId === w.id;
        const loserPayout = formatMoney(w.loserPayout);
        const winnerPayout = formatMoney(w.winnerPayout);
        const totalPayout = formatMoney(w.totalPayout);
        
        const loserCards = parseAndSortCards(w.loserCards);
        const winnerCards = parseAndSortCards(w.winnerCards);
        const boardCards = parseAndSortCards(w.boardCards || '');

        return (
          <div 
            key={w.id} 
            style={{
              ...STYLES.winnerCard,
              borderColor: isExpanded ? METAL.cyan : METAL.border,
              boxShadow: isExpanded ? `0 0 15px ${METAL.cyanMuted}` : STYLES.winnerCard.boxShadow
            }}
            onClick={() => {
              triggerHaptic('light');
              setExpandedId(isExpanded ? null : w.id);
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {w.loserAvatar ? (
                  <img src={w.loserAvatar} style={STYLES.avatar} alt="Avatar" />
                ) : (
                  <div style={STYLES.avatar}>{w.loserName.charAt(0)}</div>
                )}
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: METAL.text }}>{capitalizeWords(w.loserName)}</div>
                  <div style={{ fontSize: '13px', color: METAL.textMuted }}>{capitalizeWords(w.gameVariant)} - {new Date(w.awardedAt).toLocaleDateString()}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: METAL.gold }}>{loserPayout}</div>
                <div style={{ fontSize: '12px', color: METAL.textMuted }}>Total Pot: {totalPayout}</div>
              </div>
            </div>

            {isExpanded && (
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${METAL.border}`, animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: METAL.gold, fontWeight: 700 }}>{capitalizeWords(w.loserName)} (Bad Beat)</span>
                    <span style={{ color: METAL.textMuted }}>{capitalizeWords(w.loserHand)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {loserCards.map((c, i) => <PlayingCard key={i} card={c} size="md" />)}
                  </div>
                </div>

                {boardCards.length > 0 && (
                  <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                    <div style={{ color: METAL.cyan, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Community Board</div>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      {boardCards.map((c, i) => <PlayingCard key={i} card={c} size="md" />)}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {w.winnerAvatar ? (
                        <img src={w.winnerAvatar} style={{...STYLES.avatar, width: '24px', height: '24px', fontSize: '12px'}} alt="Avatar" />
                      ) : (
                        <div style={{...STYLES.avatar, width: '24px', height: '24px', fontSize: '12px'}}>{w.winnerName.charAt(0)}</div>
                      )}
                      <span style={{ color: METAL.text, fontWeight: 700 }}>{capitalizeWords(w.winnerName)} (Hand Winner)</span>
                    </div>
                    <span style={{ color: METAL.textMuted }}>{capitalizeWords(w.winnerHand)} - {winnerPayout}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {winnerCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const QualifyingHandsTab = ({ hands }) => {
  const demoHands = {
    'NLH': ['As','Ac','Ah','Ad','Ks'],
    'PLO4': ['Js','Jc','Jh','Jd','As'],
    'PLO5': ['8s','8c','8h','8d','As'],
    'PLO6': ['8s','8c','8h','8d','As']
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {Object.entries(hands || {}).map(([game, hand]) => {
        const cards = demoHands[game] || demoHands['NLH'];
        return (
          <div key={game} style={{...STYLES.winnerCard, display: 'flex', flexDirection: 'column', gap: '12px'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '18px', fontWeight: 700, color: METAL.cyan }}>{game}</span>
              <span style={{ color: METAL.textMuted }}>Minimum: {capitalizeWords(hand)}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {cards.map((c, i) => <PlayingCard key={i} card={c} size="md" />)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const BasicTab = ({ rules, tiers }) => (
  <div style={{ color: METAL.textMuted, fontSize: '14px', lineHeight: '1.6' }}>
    <h3 style={{ color: METAL.cyan, fontFamily: '"Orbitron", sans-serif' }}>General Rules</h3>
    <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
      {rules?.map((r, i) => <li key={i} style={{ marginBottom: '8px' }}>{capitalizeWords(r)}</li>)}
    </ul>
    
    <h3 style={{ color: METAL.cyan, fontFamily: '"Orbitron", sans-serif' }}>Payout Distribution</h3>
    <div style={{ display: 'flex', gap: '16px' }}>
      <div style={{ flex: 1, background: METAL.panel, padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
        <div style={{ color: METAL.gold, fontSize: '24px', fontWeight: 700 }}>50%</div>
        <div>Bad Beat Loser</div>
      </div>
      <div style={{ flex: 1, background: METAL.panel, padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
        <div style={{ color: METAL.text, fontSize: '24px', fontWeight: 700 }}>25%</div>
        <div>Hand Winner</div>
      </div>
      <div style={{ flex: 1, background: METAL.panel, padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
        <div style={{ color: METAL.text, fontSize: '24px', fontWeight: 700 }}>25%</div>
        <div>Table Share</div>
      </div>
    </div>
  </div>
);

export const BBJModal = ({ clubId, onClose }) => {
  const [activeTab, setActiveTab] = useState('winners');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [celebration, setCelebration] = useState(null);

  useEffect(() => {
    if (!clubId) return;
    fetch(`/api/club-arena/bbj?clubId=${clubId}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      });
  }, [clubId]);

  useEffect(() => {
    if (!clubId) return;
    const channel = getSupabase().channel('bbj_winners_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bbj_winners', filter: `club_id=eq.${clubId}` }, (payload) => {
        triggerHaptic('heavy');
        setTimeout(() => triggerHaptic('heavy'), 200);
        setTimeout(() => triggerHaptic('heavy'), 400);
        
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) {
            const ctx = new AC();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.5);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2);
            osc.start();
            osc.stop(ctx.currentTime + 2);
          }
        } catch(e) {}
        
        setCelebration(payload.new);
        
        fetch(`/api/club-arena/bbj?clubId=${clubId}`)
          .then(r => r.json())
          .then(d => setData(d));
      })
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [clubId]);

  if (loading) return <div style={{...STYLES.container, padding: '40px', justifyContent: 'center', alignItems: 'center'}}>Loading Jackpot...</div>;
  if (!data) return null;

  return (
    <div style={STYLES.container}>
      {celebration && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.9)', zIndex: 100,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          animation: 'fadeIn 0.5s ease'
        }}>
          <h1 style={{...STYLES.title, fontSize: '48px', color: METAL.gold, textShadow: '0 0 40px #FFD700'}}>JACKPOT HIT!</h1>
          <h2 style={{color: '#fff', fontSize: '24px'}}>{formatMoney(celebration.total_payout)}</h2>
          <button 
            onClick={() => { triggerHaptic('medium'); setCelebration(null); }}
            style={{marginTop: '20px', padding: '12px 24px', background: METAL.cyan, color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer'}}
          >
            AWESOME
          </button>
        </div>
      )}

      <div style={STYLES.header}>
        <div style={STYLES.title}>Bad Beat Jackpot</div>
        <div style={STYLES.jackpotAmount}>
          {formatMoney(data.pool?.amount || 0)}
        </div>
        {data.hourlyRate > 0 && (
          <div style={{ color: METAL.success, fontSize: '12px', marginTop: '8px', fontWeight: 700 }}>
            +{formatMoney(data.hourlyRate)} / hr
          </div>
        )}
      </div>

      <div style={STYLES.tabs}>
        <div style={STYLES.tab(activeTab === 'winners')} onClick={() => { triggerHaptic('light'); setActiveTab('winners'); }}>Recent Hits</div>
        <div style={STYLES.tab(activeTab === 'hands')} onClick={() => { triggerHaptic('light'); setActiveTab('hands'); }}>Qualifying</div>
        <div style={STYLES.tab(activeTab === 'rules')} onClick={() => { triggerHaptic('light'); setActiveTab('rules'); }}>Rules</div>
      </div>

      <div style={STYLES.content}>
        {activeTab === 'winners' && <WinnersTab winners={data.winners} />}
        {activeTab === 'hands' && <QualifyingHandsTab hands={data.qualifyingHands} />}
        {activeTab === 'rules' && <BasicTab rules={data.rules} tiers={data.tiers} />}
      </div>
    </div>
  );
};

export const BBJTicker = ({ clubId, onClick }) => {
  return (
    <div onClick={() => { triggerHaptic('medium'); onClick(); }} style={{ padding: '8px', background: METAL.panel, border: `1px solid ${METAL.border}`, borderRadius: '6px', cursor: 'pointer', textAlign: 'center', boxShadow: `0 0 10px ${METAL.cyanMuted}` }}>
      <div style={{ fontSize: '12px', color: METAL.cyan, fontWeight: 700, fontFamily: '"Orbitron", sans-serif' }}>BAD BEAT JACKPOT</div>
      <div style={{ fontSize: '16px', color: METAL.gold, fontWeight: 800, fontFamily: '"Orbitron", sans-serif' }}>CLICK TO VIEW</div>
    </div>
  );
};

export const useBBJ = (clubId) => {
  const [amount, setAmount] = useState(0);
  useEffect(() => {
    if (!clubId) return;
    const ch = getSupabase().channel('bbj_pools_live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bbj_pools', filter: `club_id=eq.${clubId}` }, (payload) => {
        setAmount(payload.new.pool_amount);
      }).subscribe();
    return () => getSupabase().removeChannel(ch);
  }, [clubId]);
  return { amount };
};
