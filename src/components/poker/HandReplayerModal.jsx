import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];

function cardIntToPath(card) {
  if (card === null || card === undefined) return null;
  const rank = Math.floor(card / 4);
  const suit = card % 4;
  return `/cards/${SUITS[suit]}_${RANKS[rank]}.png`;
}

function CardImg({ card, width = 48, faceDown = false, delay = 0, showdown = false, label = "", cardBackPath }) {
  const height = Math.round(width * 1.4);
  const backPath = cardBackPath || '/cards/back-default.png';
  const src = faceDown ? backPath : cardIntToPath(card);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      style={{
        width, height,
        borderRadius: 4, overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.1)',
        position: 'relative'
      }}
    >
      <img src={src} alt="card" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
      {label && !faceDown && (
        <div style={{
          position: 'absolute', bottom: 2, right: 2,
          background: 'rgba(0,0,0,0.8)', color: '#FFD700',
          fontSize: 9, padding: '2px 4px', borderRadius: 4, fontWeight: 'bold'
        }}>
          {label}
        </div>
      )}
    </motion.div>
  );
}

export default function HandReplayerModal({ handId, supabase, currentUserId, cardBackPath, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [handData, setHandData] = useState(null);
  const [events, setEvents] = useState([]);
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef(null);

  // ── 1. Fetch JSON Payload ──
  useEffect(() => {
    if (!handId || !supabase) return;
    
    let isMounted = true;
    let attempts = 0;
    
    const fetchHistory = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('hand_histories')
          .select('hand_data, rake')
          .eq('id', handId)
          .maybeSingle();

        if (fetchErr) throw fetchErr;
        
        if (data && data.hand_data) {
          if (isMounted) {
             const hd = data.hand_data;
             hd.rake = data.rake || 0;
             setHandData(hd);
             setLoading(false);
          }
        } else {
          // Retry logic since Supabase insertion might happen immediately after the modal opens
          attempts++;
          if (attempts < 5 && isMounted) {
            setTimeout(fetchHistory, 500);
          } else if (isMounted) {
            setError('Hand history could not be located in the database.');
            setLoading(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchHistory();
    return () => { isMounted = false; };
  }, [handId, supabase]);

  // ── 2. Flatten Timeline Events ──
  useEffect(() => {
    if (!handData) return;

    const timeline = [];
    
    // Initial Setup
    timeline.push({ type: 'init', desc: 'Hand Started' });
    
    // Preflop
    if (handData.streets?.preflop?.actions) {
       for (const a of handData.streets.preflop.actions) {
         if (['small_blind', 'big_blind', 'ante'].includes(a.type)) {
           timeline.push({ type: 'blind', action: a, desc: `${a.type.replace('_',' ')}: ${a.amount}` });
         } else {
           timeline.push({ type: 'action', street: 'Pre-Flop', action: a, desc: `${a.type} ${a.amount ? a.amount : ''}` });
         }
       }
    }
    
    // Flop
    if (handData.streets?.flop?.cards?.length > 0) {
      timeline.push({ type: 'deal', street: 'Flop', cards: handData.streets.flop.cards, desc: 'Flop Dealt' });
      for (const a of handData.streets.flop.actions || []) {
        timeline.push({ type: 'action', street: 'Flop', action: a, desc: `${a.type} ${a.amount ? a.amount : ''}` });
      }
    }
    
    // Turn
    if (handData.streets?.turn?.cards?.length > 0) {
      timeline.push({ type: 'deal', street: 'Turn', cards: handData.streets.turn.cards, desc: 'Turn Dealt' });
      for (const a of handData.streets.turn.actions || []) {
        timeline.push({ type: 'action', street: 'Turn', action: a, desc: `${a.type} ${a.amount ? a.amount : ''}` });
      }
    }
    
    // River
    if (handData.streets?.river?.cards?.length > 0) {
      timeline.push({ type: 'deal', street: 'River', cards: handData.streets.river.cards, desc: 'River Dealt' });
      for (const a of handData.streets.river.actions || []) {
        timeline.push({ type: 'action', street: 'River', action: a, desc: `${a.type} ${a.amount ? a.amount : ''}` });
      }
    }
    
    // Showdown / End
    timeline.push({ type: 'showdown', desc: 'Hand Complete' });
    
    setEvents(timeline);
    setStep(timeline.length - 1); // Start at the end by default
  }, [handData]);

  // ── 3. Auto-Play Engine ──
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setStep(s => {
          if (s >= events.length - 1) {
            setIsPlaying(false);
            return s;
          }
          return s + 1;
        });
      }, 1200); // 1.2s per physical action step
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, events.length]);

  // ── 4. Reconstruct State at Current Step ──
  const stateAtStep = useMemo(() => {
    if (!handData || events.length === 0) return null;
    
    // Clone starting state
    const ps = {};
    for (const p of handData.players) {
       ps[p.id] = {
         id: p.id,
         displayName: p.displayName,
         stack: p.startStack,
         invested: 0, // Street invested
         totalInvested: 0, // Total invested in hand
         status: 'active', // active, folded
         lastAction: null,
         holeCards: p.holeCards, // Know them if SHOWDOWN occurred or if it's the hero
         showedCards: p.showedCards || false,
       };
    }
    
    const state = {
      players: ps,
      board: [],
      potTotal: 0,
      pots: [], // Main/side pots handled generically in DVR
      completed: false,
    };
    
    for (let i = 0; i <= step; i++) {
       const ev = events[i];
       
       if (ev.type === 'blind') {
         const p = state.players[ev.action.playerId];
         if (p && ev.action.amount) {
           p.stack -= ev.action.amount;
           p.invested += ev.action.amount;
           p.totalInvested += ev.action.amount;
           p.lastAction = ev.action.type.replace('_', ' ');
         }
       }
       else if (ev.type === 'action') {
         const a = ev.action;
         const p = state.players[a.playerId];
         if (p) {
           if (a.type === 'fold') {
             p.status = 'folded';
             p.lastAction = 'Fold';
           } else {
             const amt = a.amount || 0;
             p.stack -= amt;
             p.invested += amt;
             p.totalInvested += amt;
             p.lastAction = a.type + (amt > 0 ? ` ${amt}` : '');
           }
         }
       }
       else if (ev.type === 'deal') {
         // Gather street pots
         let streetChips = 0;
         for (const pid in state.players) {
           streetChips += state.players[pid].invested;
           state.players[pid].invested = 0;
           if (state.players[pid].status !== 'folded') {
             state.players[pid].lastAction = null;
           }
         }
         state.potTotal += streetChips;
         state.board.push(...ev.cards);
       }
       else if (ev.type === 'showdown') {
         // Gather final river bets into pot
         let streetChips = 0;
         for (const pid in state.players) {
           streetChips += state.players[pid].invested;
           state.players[pid].invested = 0;
         }
         state.potTotal += streetChips;
         state.completed = true;
         
         // Award pot to winners
         if (handData.winners && handData.winners.length > 0) {
           for (const w of handData.winners) {
             const p = state.players[w.playerId];
             if (p && w.amount) {
               p.stack += w.amount;
               p.lastAction = `WON ${w.amount.toLocaleString()}`;
             }
           }
           state.potTotal = 0; // Empty the central pot as it has been distributed
         }
       }
    }
    
    return state;
  }, [handData, events, step]);

  // ── Render ──
  if (!handId) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
          zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 50, scale: 0.9 }} animate={{ y: 0, scale: 1 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'linear-gradient(145deg, #1e1e1e 0%, #121212 100%)',
            border: '1px solid #333',
            borderRadius: 16, width: 800, maxWidth: '95vw',
            boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>DVR REPLAYER</span>
              <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>Hand ID: {handId}</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: 24, cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ position: 'relative', height: 400, background: '#1c1e22', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {loading && <div style={{ color: '#888' }}>Initializing Timeline Data...</div>}
            {error && <div style={{ color: '#ff4d4f' }}>{error}</div>}
            
            {stateAtStep && (
              <div style={{ width: 600, height: 300, background: 'radial-gradient(ellipse at center, #235332 0%, #0d2812 100%)', borderRadius: 200, border: '6px solid #111', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                
                {/* Board Cards */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {stateAtStep.board.map((c, i) => (
                    <CardImg key={i} card={c} width={50} cardBackPath={cardBackPath} />
                  ))}
                  {/* Empty slots */}
                  {[...Array(5 - stateAtStep.board.length)].map((_, i) => (
                    <div key={`empty-${i}`} style={{ width: 50, height: 70, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, background: 'rgba(0,0,0,0.2)' }} />
                  ))}
                </div>

                {/* Pot Total */}
                <div style={{ position: 'absolute', top: '30%', background: 'rgba(0,0,0,0.6)', padding: '4px 12px', borderRadius: 12, border: '1px solid #444', color: '#FFD700', fontWeight: 'bold', fontSize: 14 }}>
                  POT: {stateAtStep.potTotal.toLocaleString()}
                </div>

                {/* Seats */}
                {Object.values(stateAtStep.players).map((p, i) => {
                  const numPlayers = Object.keys(stateAtStep.players).length;
                  const angle = (i / numPlayers) * Math.PI * 2 - Math.PI / 2;
                  const radiusX = 350;
                  const radiusY = 180;
                  const x = Math.cos(angle) * radiusX;
                  const y = Math.sin(angle) * radiusY;

                  const isFolded = p.status === 'folded';
                  const showFaces = p.holeCards && (stateAtStep.completed || p.showedCards || String(p.id) === String(currentUserId));

                  return (
                    <div key={p.id} style={{
                      position: 'absolute', transform: `translate(${x}px, ${y}px)`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      opacity: isFolded ? 0.4 : 1, transition: 'all 0.3s ease'
                    }}>
                      
                      {/* Action / Bets */}
                      {p.lastAction && (
                        <div style={{
                          marginBottom: 8, background: '#fff', color: '#000', padding: '2px 8px',
                          borderRadius: 4, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                        }}>
                          {p.lastAction}
                        </div>
                      )}

                      {/* Hole Cards */}
                      {!isFolded && (
                        <div style={{ display: 'flex', gap: 2, marginBottom: -10, zIndex: 10 }}>
                           {p.holeCards ? (
                             <>
                               <CardImg card={p.holeCards[0]} width={36} faceDown={!showFaces} cardBackPath={cardBackPath} />
                               <CardImg card={p.holeCards[1]} width={36} faceDown={!showFaces} cardBackPath={cardBackPath} />
                             </>
                           ) : (
                             <>
                               <CardImg faceDown width={36} cardBackPath={cardBackPath} />
                               <CardImg faceDown width={36} cardBackPath={cardBackPath} />
                             </>
                           )}
                        </div>
                      )}

                      {/* Avatar Plate */}
                      <div style={{
                        background: '#222', padding: '4px 12px', borderRadius: 8, border: '1px solid #444',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 100, zIndex: 11
                      }}>
                        <span style={{ color: '#fff', fontWeight: 600, fontSize: 12 }}>{p.displayName}</span>
                        <span style={{ color: '#4CAF50', fontSize: 11, fontFamily: 'monospace' }}>{p.stack.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline Controls */}
          <div style={{ padding: '16px 24px', background: '#111', borderTop: '1px solid #333', display: 'flex', alignItems: 'center', gap: 16 }}>
             
             <button
               onClick={() => setIsPlaying(!isPlaying)}
               disabled={!handData}
               style={{
                 background: isPlaying ? '#ff4d4f' : '#3498db', color: '#fff', border: 'none',
                 borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
                 cursor: 'pointer', fontSize: 18, boxShadow: '0 4px 12px rgba(0,0,0,0.4)', opacity: handData ? 1 : 0.5
               }}
             >
               {isPlaying ? '⏸' : '▶'}
             </button>

             <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 8 }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: 11 }}>
                 <span>Pre-Flop</span>
                 <span>Flop</span>
                 <span>Turn</span>
                 <span>River</span>
                 <span>Showdown</span>
               </div>
               <input
                 type="range"
                 min={0}
                 max={events.length > 0 ? events.length - 1 : 0}
                 value={step}
                 onChange={e => {
                   setStep(parseInt(e.target.value));
                   setIsPlaying(false);
                 }}
                 disabled={!handData}
                 style={{ width: '100%', cursor: 'pointer' }}
               />
               <div style={{ color: '#fff', textAlign: 'center', fontSize: 13, minHeight: 18 }}>
                 {events[step]?.desc || '...'}
               </div>
             </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
