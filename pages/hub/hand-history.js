import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import supabase from '../../src/lib/supabase';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { eventBus } from '../../src/engine/EventBus';
import BottomNavBar from '../../src/components/ui/BottomNavBar';
import useVIP from '../../src/hooks/useVIP';
import useVIPGate from '../../src/hooks/useVIPGate';
import VIPGateModal from '../../src/components/ui/VIPGateModal';
import dynamic from 'next/dynamic';
import ImageCropModal from '../../src/components/poker/ImageCropModal';
import ReviewHandModal from '../../src/components/poker/ReviewHandModal';

const ShareableHandCard = dynamic(() => import('../../src/components/poker/ShareableHandCard'), { ssr: false });
// 2026-05-07 — UI-UX-Pro-Max icons (no-emoji-icons rule)
import { History, Check, X, Share2, Sparkles } from 'lucide-react';

const getSupabase = () => typeof window !== 'undefined' ? supabase : null;

// Card index → display string (matches engine output: 0-51)
const SUITS = ['c', 'd', 'h', 's'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
function cardStr(idx) {
  if (typeof idx === 'string') return idx; // already string like "Ah"
  if (typeof idx !== 'number' || idx < 0 || idx > 51) return '??';
  return RANKS[idx % 13] + SUITS[Math.floor(idx / 13)];
}
function isRed(card) {
  const s = typeof card === 'string' ? card : cardStr(card);
  return s.endsWith('h') || s.endsWith('d');
}
function cardToIdx(s) {
  if (!s || s.length !== 2) return null;
  const rank = RANKS.indexOf(s[0].toUpperCase());
  const suit = SUITS.indexOf(s[1].toLowerCase());
  if (rank === -1 || suit === -1) return null;
  return suit * 13 + rank;
}
function parseCards(str) {
  if (!str) return [];
  const tokens = str.replace(/[^A-Za-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
  return tokens.map(cardToIdx).filter(n => n !== null);
}

export default function HandHistoryPage() {
  useTrainingBus('hand-history');
  const [hands, setHands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filterTable, setFilterTable] = useState('all');
  const [sharingHand, setSharingHand] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const userIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const { isVip } = useVIP();
  const { allowed, showUpgradeModal, upgradeModalVisible, hideUpgradeModal, featureConfig } = useVIPGate('hand-history');

  useEffect(() => {
    const handlePaste = (e) => {
      const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
      if (!items) return;
      for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          setCropFile(blob);
          break;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCropFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processCroppedImage = async (base64Str) => {
    setCropFile(null); // Close crop modal

    // AI Scanner is VIP only
    if (!allowed) {
      showUpgradeModal();
      return;
    }

    setUploadingImage(true);
    try {
      const sessionStr = localStorage.getItem('smarter-poker-auth');
      const token = sessionStr ? JSON.parse(sessionStr).access_token : null;
      
      const res = await fetch('/api/poker/ai-hand-reader', { 
          method: 'POST', 
          headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ imageBase64: base64Str })
      });
      if (res.ok) {
        const { handData } = await res.json();
        setReviewData(handData);
        window.dispatchEvent(new CustomEvent('vip-status-changed')); // Force refresh to show deducted diamonds
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to parse image: ${errData.error || 'Server error'}`);
      }
    } catch(err) {
      console.warn("Upload error", err);
      alert("Error analyzing hand image.");
    }
    setUploadingImage(false);
  };

  const handleReviewSave = async (formData) => {
    try {
      const heroCards = parseCards(formData.hero_cards);
      const boardCards = parseCards(formData.board);
      const sbStr = formData.stakes?.split('/')[0]?.replace(/[^0-9]/g, '');
      const bbStr = formData.stakes?.split('/')[1]?.replace(/[^0-9]/g, '');
      const sb = sbStr ? parseInt(sbStr, 10) : 0;
      const bb = bbStr ? parseInt(bbStr, 10) : 0;
      const pot = parseInt((formData.pot_size || '0').replace(/[^0-9]/g, ''), 10);
      let heroNet = parseInt((formData.amount || '0').replace(/[^0-9-]/g, ''), 10);
      if (isNaN(heroNet)) heroNet = 0;
      if (formData.result === 'Lost' && heroNet > 0) heroNet = -heroNet; // fix sign

      const hand_data = {
        players: [
          { id: userIdRef.current, seatIndex: 1, holeCards: heroCards, netResult: heroNet, showedCards: heroCards.length > 0 }
        ],
        winners: formData.result === 'Won' ? [{ hand: 'Winning Hand', amount: pot }] : [],
        communityCards: boardCards,
        streets: {
          flop: { cards: boardCards.slice(0, 3), actions: [] },
          turn: { cards: boardCards.slice(3, 4), actions: [] },
          river: { cards: boardCards.slice(4, 5), actions: [] }
        }
      };

      const sbClient = getSupabase();
      await sbClient.from('hand_history').insert({
        user_id: userIdRef.current,
        player_ids: [userIdRef.current],
        table_id: 'AI-Scan',
        club_id: null,
        variant: formData.game_type || 'NLH',
        small_blind: sb,
        big_blind: bb,
        pot_total: pot,
        winner_ids: formData.result === 'Won' ? [userIdRef.current] : null,
        hand_data,
        completed_at: new Date().toISOString()
      });

      alert('Hand saved successfully!');
      eventBus.emit('DATA_MUTATED', 'hand_history_updated'); // Trigger real-time sync across connected tabs
      setReviewData(null);
      fetchHands();
    } catch (err) {
      console.warn(err);
      alert('Failed to save hand');
    }
  };

  // Fetch hand histories — query via player_ids contains
  const fetchHands = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      if (!userIdRef.current) {
        const { data: authData } = await sb.auth.getUser();
        const user = authData?.user;
        if (!user) { setLoading(false); return; }
        userIdRef.current = user.id;
      }
      let query = sb.from('hand_history')
        .select('id,table_id,club_id,hand_number,variant,small_blind,big_blind,player_ids,hand_data,pot_total,winner_ids,started_at,completed_at,created_at')
        .contains('player_ids', [userIdRef.current])
        .order('created_at', { ascending: false })
        .limit(allowed ? 1000 : 50);

      if (filterTable !== 'all') {
        query = query.eq('table_id', filterTable);
      }

      const { data } = await query;
      setHands(data || []);
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    setLoading(false);
  }, [filterTable, allowed]);

  useEffect(() => { fetchHands(); }, [fetchHands]);

  // I4: EventBus reactivity — auto-refresh when a hand completes
  useEffect(() => {
    const handler = (payload) => {
      if (payload === 'hand_history_updated') fetchHands();
    };
    const unsub = eventBus.on('DATA_MUTATED', handler);
    return () => { if (typeof unsub === 'function') unsub(); else eventBus.off('DATA_MUTATED', handler); };
  }, [fetchHands]);

  // Unique table IDs for filter
  const tableIds = useMemo(() => {
    const ids = [...new Set(hands.map(h => h.table_id).filter(Boolean))];
    return ids;
  }, [hands]);

  // Stats
  const stats = useMemo(() => {
    if (!hands.length) return null;
    const totalHands = hands.length;
    const totalPot = hands.reduce((a, h) => a + (h.pot_total || 0), 0);
    const avgPot = totalHands ? Math.round(totalPot / totalHands) : 0;
    const winsCount = hands.filter(h => (h.winner_ids || []).includes(userIdRef.current)).length;
    return { totalHands, totalPot, avgPot, winsCount, winPct: totalHands ? Math.round(winsCount / totalHands * 100) : 0 };
  }, [hands]);

  const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const T = {
    bg: '#0a0a0a', card: '#18191a', border: '#3E4042',
    text: '#E4E6EB', textSec: '#B0B3B8', textDim: '#65676B',
    green: '#4ade80', red: '#ef4444', gold: '#FFD700',
    accent: '#4facfe',
  };

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: T.bg, padding: '20px 16px', fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h1 style={{ color: T.text, fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={22} aria-hidden style={{ color: T.accent }} />
              <span>Hand history</span>
            </h1>
            {stats && (
              <span style={{ color: T.textSec, fontSize: 11, fontWeight: 600, display: 'block', marginTop: 4 }}>
                {stats.totalHands} hands • {stats.winPct}% win • Avg pot {stats.avgPot.toLocaleString()}
              </span>
            )}
          </div>
          <div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              style={{
                background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)', border: 'none',
                padding: '8px 14px', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', opacity: uploadingImage ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              <Sparkles size={14} aria-hidden />
              {uploadingImage ? 'Scanning...' : 'AI Scan'}
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileInput} accept="image/*" style={{ display: 'none' }} />
          </div>
        </div>

        {/* Table Filter */}
        {tableIds.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setFilterTable('all'); setLoading(true); }}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                background: filterTable === 'all' ? 'rgba(79,172,254,0.15)' : 'rgba(255,255,255,0.04)',
                border: filterTable === 'all' ? '1px solid rgba(79,172,254,0.4)' : `1px solid ${T.border}`,
                color: filterTable === 'all' ? T.accent : T.textSec,
              }}
            >All Tables</motion.button>
            {tableIds.map(tid => (
              <motion.button
                key={tid}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { setFilterTable(tid); setLoading(true); }}
                style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  background: filterTable === tid ? 'rgba(79,172,254,0.15)' : 'rgba(255,255,255,0.04)',
                  border: filterTable === tid ? '1px solid rgba(79,172,254,0.4)' : `1px solid ${T.border}`,
                  color: filterTable === tid ? T.accent : T.textSec,
                }}
              >{tid.length > 12 ? tid.slice(0, 12) + '…' : tid}</motion.button>
            ))}
          </div>
        )}

        {loading && (
          <div style={{ color: T.textSec, textAlign: 'center', padding: 40 }}>Loading hand histories...</div>
        )}

        {!loading && hands.length === 0 && (
          <div style={{ color: T.textDim, textAlign: 'center', padding: 40 }}>
            No hands recorded yet. Play some hands to see your history here!
          </div>
        )}

        {/* Hand List */}
        <AnimatePresence>
          {hands.map(h => {
            const hd = h.hand_data || {};
            const heroPlayer = (hd.players || []).find(p => String(p.id) === String(userIdRef.current));
            const heroWon = (h.winner_ids || []).includes(userIdRef.current);
            const heroNet = heroPlayer?.netResult || 0;
            const heroCards = heroPlayer?.holeCards || [];
            const winners = hd.winners || [];

            // Community cards — use hand_data.streets.flop/turn/river cards or communityCards
            const streets = hd.streets || {};
            const flopCards = streets.flop?.cards || [];
            const turnCards = streets.turn?.cards || [];
            const riverCards = streets.river?.cards || [];
            const allBoardCards = [...new Set([...flopCards, ...turnCards.slice(flopCards.length), ...riverCards.slice(turnCards.length)])].slice(0, 5);
            // Fallback to communityCards if streets didn't give us anything
            const board = allBoardCards.length > 0 ? allBoardCards : (hd.communityCards || []).slice(0, 5);

            // Action log from all streets
            const actionLog = [
              ...(streets.preflop?.actions || []),
              ...(streets.flop?.actions || []),
              ...(streets.turn?.actions || []),
              ...(streets.river?.actions || []),
            ];

            const isExpanded = expandedId === h.id;

            return (
              <motion.div
                key={h.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => setExpandedId(isExpanded ? null : h.id)}
                style={{
                  background: T.card, borderRadius: 10, padding: 12, marginBottom: 6,
                  border: `1px solid ${isExpanded ? (heroWon ? T.green : T.red) + '44' : T.border}`,
                  cursor: 'pointer', transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: T.text, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: heroWon ? T.green : T.red, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {heroWon ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}
                        {heroWon ? 'Won' : 'Lost'}
                      </span>
                      <span style={{ color: T.textDim, fontSize: 9 }}>Hand #{h.hand_number || '—'}</span>
                    </div>
                    <div style={{ color: T.textDim, fontSize: 9, marginTop: 2 }}>
                      {formatDate(h.completed_at || h.created_at)} • {h.small_blind}/{h.big_blind} {h.variant || 'NLH'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: 14, fontWeight: 800,
                      color: heroNet >= 0 ? T.green : T.red,
                    }}>
                      {heroNet >= 0 ? '+' : ''}{heroNet.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 8, color: T.textDim }}>pot {(h.pot_total || 0).toLocaleString()}</div>
                  </div>
                </div>

                {/* Expanded Detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', marginTop: 10 }}
                    >
                      {/* Hero Cards */}
                      {heroCards.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, color: T.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Your Cards</div>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {heroCards.map((c, i) => (
                              <div key={i} style={{
                                width: 28, height: 38, borderRadius: 4,
                                background: 'linear-gradient(135deg, #1a1a3e, #2a2a4e)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 800,
                                color: isRed(c) ? '#e53935' : '#fff',
                              }}>{cardStr(c)}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Board */}
                      {board.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, color: T.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Board</div>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {board.map((c, i) => (
                              <div key={i} style={{
                                width: 24, height: 32, borderRadius: 3,
                                background: 'linear-gradient(135deg, #0a0a1e, #1a1a3e)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 9, fontWeight: 800,
                                color: isRed(c) ? '#e53935' : '#fff',
                              }}>{cardStr(c)}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Winners */}
                      {winners.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, color: T.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Winners</div>
                          {winners.map((w, i) => (
                            <div key={i} style={{ fontSize: 10, color: T.green, fontWeight: 600 }}>
                              {w.hand || 'Winner'} — {(w.amount || 0).toLocaleString()} chips
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Players */}
                      {(hd.players || []).length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, color: T.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Players</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {(hd.players || []).map((pl, i) => (
                              <div key={i} style={{
                                fontSize: 9, color: pl.netResult >= 0 ? T.green : T.red, fontWeight: 600,
                                background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: 4,
                              }}>
                                {String(pl.id) === String(userIdRef.current) ? '⭐ You' : `Seat ${pl.seatIndex}`}
                                : {pl.netResult >= 0 ? '+' : ''}{pl.netResult}
                                {pl.showedCards && pl.holeCards ? ` [${pl.holeCards.map(c => cardStr(c)).join('')}]` : ''}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Log */}
                      {actionLog.length > 0 && (
                        <div>
                          <div style={{ fontSize: 8, color: T.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Action Log ({actionLog.length})</div>
                          <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                            {actionLog.map((a, i) => {
                              const isHero = String(a.playerId) === String(userIdRef.current);
                              return (
                                <div key={i} style={{ fontSize: 9, color: T.textSec, padding: '1px 0' }}>
                                  <span style={{ color: isHero ? T.accent : T.text, fontWeight: isHero ? 700 : 600 }}>
                                    {isHero ? '⭐ You' : `${a.playerId?.slice(0, 8) || 'Player'}`}
                                  </span>{' '}
                                  {a.type}{a.amount > 0 ? ` ${a.amount.toLocaleString()}` : ''}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Share Button */}
                      <div style={{ marginTop: 12, textAlign: 'right' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!allowed) {
                              showUpgradeModal();
                              return;
                            }
                            setSharingHand({
                              heroCards: heroCards.map(c => cardStr(c)),
                              board: board.map(c => cardStr(c)),
                              result: heroWon ? 'Won' : 'Lost',
                              amount: (heroNet >= 0 ? '+' : '') + heroNet.toLocaleString(),
                              stakes: h.small_blind + '/' + h.big_blind,
                              venue: h.table_id || 'Cash Game',
                              pot: (h.pot_total || 0).toLocaleString(),
                              playerName: 'Smarter.Poker User'
                            });
                          }}
                          style={{
                            background: 'rgba(79,172,254,0.1)', border: '1px solid rgba(79,172,254,0.3)',
                            color: T.accent, fontSize: 11, fontWeight: 700, padding: '6px 14px',
                            borderRadius: 20, cursor: 'pointer'
                          }}
                        >
                          <Share2 size={12} aria-hidden style={{ verticalAlign: '-1px', marginRight: 4 }} />Share hand card
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      
      {cropFile && <ImageCropModal file={cropFile} onCropComplete={processCroppedImage} onCancel={() => setCropFile(null)} />}
      {reviewData && <ReviewHandModal initialData={reviewData} onSave={handleReviewSave} onCancel={() => setReviewData(null)} />}
      
      {/* Modals */}
      {sharingHand && <ShareableHandCard hand={sharingHand} onClose={() => setSharingHand(null)} />}
      
      <VIPGateModal 
        visible={upgradeModalVisible}
        onClose={hideUpgradeModal}
        featureName="Hand History Pro"
        featureConfig={featureConfig}
      />
      
      <BottomNavBar />
    </div>
  );
}
