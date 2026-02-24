/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Hand Histories | FULLY WIRED
 Facebook Dark Theme | Real Hand Data with Filters & Visualization
 ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';

// Facebook Dark Color Scheme
const FB = {
 primary: '#2374E1',
 background: '#18191A',
 cardBg: '#242526',
 textPrimary: '#E4E6EB',
 textSecondary: '#B0B3B8',
 border: '#3E4042',
 success: '#31A24C',
 danger: '#FA383E',
 gold: '#F7C52A',
 hover: '#3A3B3C',
};

// Card display helpers
const SUIT_SYMBOLS = { h: '', d: '', c: '', s: '' };
const SUIT_COLORS = { h: '#E74C3C', d: '#3498DB', c: '#27AE60', s: '#2C3E50' };

export default function HandHistories() {
 const router = useRouter();
 const { club: clubIdParam } = router.query;

 // State
 const [user, setUser] = useState(null);
 const [club, setClub] = useState(null);
 const [hands, setHands] = useState([]);
 const [isLoading, setIsLoading] = useState(true);

 // Filters
 const [period, setPeriod] = useState('all'); // 'today' | 'week' | 'month' | 'all'
 const [resultFilter, setResultFilter] = useState('all'); // 'all' | 'wins' | 'losses'
 const [gameType, setGameType] = useState('all'); // 'all' | 'nlhe' | 'plo' | 'mixed'

 // Pagination
 const [page, setPage] = useState(0);
 const [hasMore, setHasMore] = useState(true);
 const PAGE_SIZE = 20;

 // Detail modal
 const [selectedHand, setSelectedHand] = useState(null);

 // ═══════════════════════════════════════════════════════════════════════════
 // LOAD DATA
 // ═══════════════════════════════════════════════════════════════════════════
 const loadData = useCallback(async (reset = false) => {
 if (!clubIdParam) return;
 if (reset) setIsLoading(true);

 try {
 // Get authenticated user
 let authUser = null;
 if (typeof window !== 'undefined') {
 const explicitAuth = localStorage.getItem('smarter-poker-auth');
 if (explicitAuth) authUser = JSON.parse(explicitAuth)?.user || null;
 if (!authUser) {
 const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
 if (sbKeys.length > 0) authUser = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.user || null;
 }
 }
 if (!authUser) {
 const { data: { user: supaUser } } = await supabase.auth.getUser();
 authUser = supaUser;
 }
 setUser(authUser);

 // Get club data (try both club_id column formats)
 let clubData = null;
 const { data: clubByClubId } = await supabase
 .from('clubs')
 .select('*')
 .eq(isUUID ? 'id' : 'club_id', clubIdParam)
 .single();

 if (clubByClubId) {
 clubData = clubByClubId;
 } else {
 // Fallback: try numeric ID
 const { data: clubById } = await supabase
 .from('clubs')
 .select('*')
 .eq('id', clubIdParam)
 .single();
 clubData = clubById;
 }

 if (clubData) {
 setClub(clubData);

 // Build query with filters
 let query = supabase
 .from('hand_history')
 .select('*')
 .eq('user_id', authUser?.id)
 .order('created_at', { ascending: false })
 .range(reset ? 0 : page * PAGE_SIZE, (reset ? 0 : page) * PAGE_SIZE + PAGE_SIZE - 1);

 // Club filter - try both id and club_id
 query = query.or(`club_id.eq.${clubData.id},club_id.eq.${clubData.club_id}`);

 // Date filter
 const now = new Date();
 if (period === 'today') {
 const today = new Date(now.setHours(0, 0, 0, 0)).toISOString();
 query = query.gte('created_at', today);
 } else if (period === 'week') {
 const weekAgo = new Date(now.setDate(now.getDate() - 7)).toISOString();
 query = query.gte('created_at', weekAgo);
 } else if (period === 'month') {
 const monthAgo = new Date(now.setMonth(now.getMonth() - 1)).toISOString();
 query = query.gte('created_at', monthAgo);
 }

 // Result filter
 if (resultFilter === 'wins') {
 query = query.or('result.eq.win,profit.gt.0');
 } else if (resultFilter === 'losses') {
 query = query.or('result.eq.loss,profit.lt.0');
 }

 // Game type filter
 if (gameType !== 'all') {
 query = query.eq('game_type', gameType);
 }

 const { data: handData, error } = await query;

 if (error) {
 console.warn('[HandHistories] Query error:', error);
 // Fallback to simpler query
 const { data: fallbackData } = await supabase
 .from('hand_history')
 .select('*')
 .eq('user_id', authUser?.id)
 .order('created_at', { ascending: false })
 .limit(PAGE_SIZE);
 setHands(fallbackData || []);
 setHasMore(false);
 } else {
 if (reset) {
 setHands(handData || []);
 } else {
 setHands(prev => [...prev, ...(handData || [])]);
 }
 setHasMore((handData || []).length === PAGE_SIZE);
 }
 }
 } catch (e) {
 console.error('[HandHistories] Error loading data:', e);
 } finally {
 setIsLoading(false);
 }
 }, [clubIdParam, page, period, resultFilter, gameType]);

 useEffect(() => {
 setPage(0);
 loadData(true);
 }, [period, resultFilter, gameType, clubIdParam]);

 useEffect(() => {
 if (page > 0) loadData(false);
 }, [page]);

 // ═══════════════════════════════════════════════════════════════════════════
 // CARD RENDERING
 // ═══════════════════════════════════════════════════════════════════════════
 const parseCard = (cardStr) => {
 if (!cardStr || cardStr.length < 2) return null;
 const rank = cardStr.slice(0, -1).toUpperCase();
 const suit = cardStr.slice(-1).toLowerCase();
 return { rank, suit };
 };

 const renderCard = (cardStr, size = 'small') => {
 const card = parseCard(cardStr);
 if (!card) return null;

 const sizeStyles = {
 small: { width: '28px', height: '38px', fontSize: '12px' },
 medium: { width: '40px', height: '56px', fontSize: '16px' },
 large: { width: '52px', height: '72px', fontSize: '20px' },
 };

 const s = sizeStyles[size] || sizeStyles.small;

 return (
 <div key={cardStr} style={{
 ...s,
 background: '#fff',
 borderRadius: '4px',
 display: 'flex',
 flexDirection: 'column',
 alignItems: 'center',
 justifyContent: 'center',
 fontWeight: 700,
 color: SUIT_COLORS[card.suit] || '#000',
 border: '1px solid #ddd',
 boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
 }}>
 <span style={{ lineHeight: 1 }}>{card.rank}</span>
 <span style={{ lineHeight: 1, fontSize: size === 'large' ? '16px' : '10px' }}>
 {SUIT_SYMBOLS[card.suit] || card.suit}
 </span>
 </div>
 );
 };

 const renderCardRow = (cards, size = 'small') => {
 if (!cards) return null;
 const cardArray = Array.isArray(cards) ? cards : cards.split(/[\s,]+/);
 return (
 <div style={{ display: 'flex', gap: '4px' }}>
 {cardArray.map((c, i) => renderCard(c, size))}
 </div>
 );
 };

 // ═══════════════════════════════════════════════════════════════════════════
 // STYLES
 // ═══════════════════════════════════════════════════════════════════════════
 const S = {
 page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
 container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' },
 backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 },
 pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' },
 loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' },
 emptyState: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textSecondary },

 // Filters
 filterRow: { display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto' },
 filterBtn: { padding: '8px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', border: 'none', flexShrink: 0 },

 // Hand card
 handCard: { padding: '14px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '10px', cursor: 'pointer' },
 handHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
 handResult: { fontSize: '14px', fontWeight: 700, padding: '4px 10px', borderRadius: '4px' },
 handDate: { fontSize: '12px', color: FB.textSecondary },
 handCards: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' },
 handLabel: { fontSize: '11px', color: FB.textSecondary, marginBottom: '4px', textTransform: 'uppercase' },
 handInfo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
 handTable: { fontSize: '13px', color: FB.textSecondary },
 handProfit: { fontSize: '16px', fontWeight: 700 },

 // Modal
 modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
 modal: { background: FB.cardBg, borderRadius: '12px', width: '100%', maxWidth: '450px', overflow: 'hidden', border: `1px solid ${FB.border}`, maxHeight: '80vh', overflowY: 'auto' },
 modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${FB.border}`, position: 'sticky', top: 0, background: FB.cardBg },
 modalTitle: { fontSize: '18px', fontWeight: 700, color: FB.textPrimary },
 modalClose: { background: 'none', border: 'none', color: FB.textSecondary, fontSize: '24px', cursor: 'pointer', lineHeight: 1 },
 modalBody: { padding: '20px' },
 modalSection: { marginBottom: '20px' },
 modalLabel: { fontSize: '11px', color: FB.textSecondary, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' },

 // Load more
 loadMoreBtn: { width: '100%', padding: '14px', background: FB.hover, border: `1px solid ${FB.border}`, borderRadius: '6px', color: FB.textPrimary, fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginTop: '12px' },
 };

 const formatDate = (dateStr) => {
 if (!dateStr) return 'Unknown';
 const d = new Date(dateStr);
 return d.toLocaleString('en-US', {
 month: 'short',
 day: 'numeric',
 hour: 'numeric',
 minute: '2-digit',
 hour12: true
 });
 };

 const getHandLabel = (hand) => {
 if (hand.winning_hand) return hand.winning_hand;
 if (hand.hand_type) return hand.hand_type;
 if (hand.action) return hand.action;
 return 'Hand';
 };

 return (
 <>
 <SEOHead
 title="Club Arena — Hand Histories"
 description="Review Your Poker Hand Histories In Club Arena."
 canonical="/hub/club-arena/hand-histories"
 noindex={true}
 />

 <div style={S.page}>
 <UniversalHeader pageDepth={2} />

 <div style={S.container}>
 <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>
 &#8592; Back to Lobby
 </button>

 <h1 style={S.pageTitle}> Hand Histories</h1>

 {/* Period Filter */}
 <div style={S.filterRow}>
 {[
 { id: 'today', label: 'Today' },
 { id: 'week', label: 'This Week' },
 { id: 'month', label: 'This Month' },
 { id: 'all', label: 'All Time' },
 ].map(p => (
 <button
 key={p.id}
 style={{
 ...S.filterBtn,
 background: period === p.id ? FB.primary : FB.hover,
 color: period === p.id ? '#fff' : FB.textSecondary,
 }}
 onClick={() => setPeriod(p.id)}
 >
 {p.label}
 </button>
 ))}
 </div>

 {/* Result Filter */}
 <div style={S.filterRow}>
 {[
 { id: 'all', label: 'All Results' },
 { id: 'wins', label: 'Wins' },
 { id: 'losses', label: ' Losses' },
 ].map(r => (
 <button
 key={r.id}
 style={{
 ...S.filterBtn,
 background: resultFilter === r.id ? FB.primary : FB.hover,
 color: resultFilter === r.id ? '#fff' : FB.textSecondary,
 }}
 onClick={() => setResultFilter(r.id)}
 >
 {r.label}
 </button>
 ))}
 </div>

 {isLoading ? (
 <div style={S.loading}>Loading Hands...</div>
 ) : !user ? (
 <div style={S.emptyState}><p>Sign In To View Your Hands</p></div>
 ) : hands.length === 0 ? (
 <div style={S.emptyState}>
 <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
 <p>No Hands Found</p>
 <p style={{ fontSize: '13px', marginTop: '8px' }}>Play Some Poker To See Your History!</p>
 </div>
 ) : (
 <>
 {hands.map((hand, i) => {
 const isWin = hand.result === 'win' || (hand.profit && hand.profit > 0);
 return (
 <div
 key={hand.id || i}
 style={S.handCard}
 onClick={() => setSelectedHand(hand)}
 >
 <div style={S.handHeader}>
 <span style={{
 ...S.handResult,
 background: isWin ? FB.success : FB.danger,
 color: '#fff'
 }}>
 {isWin ? 'WIN' : 'LOSS'}
 </span>
 <span style={S.handDate}>{formatDate(hand.created_at)}</span>
 </div>

 {/* Cards */}
 <div style={S.handCards}>
 {hand.hole_cards && (
 <div>
 <div style={S.handLabel}>Your Cards</div>
 {renderCardRow(hand.hole_cards)}
 </div>
 )}
 {hand.board && (
 <div>
 <div style={S.handLabel}>Board</div>
 {renderCardRow(hand.board)}
 </div>
 )}
 </div>

 <div style={S.handInfo}>
 <span style={S.handTable}>
 {hand.table_name || 'Cash Game'} • {getHandLabel(hand)}
 </span>
 <span style={{
 ...S.handProfit,
 color: isWin ? FB.success : FB.danger
 }}>
 {isWin ? '+' : ''}{(hand.profit || hand.pot_size || 0).toLocaleString()}
 </span>
 </div>
 </div>
 );
 })}

 {hasMore && (
 <button
 style={S.loadMoreBtn}
 onClick={() => setPage(p => p + 1)}
 >
 Load More
 </button>
 )}
 </>
 )}
 </div>

 <ClubArenaBottomNav clubId={clubIdParam} activePage="hand-histories" />
 </div>

 {/* ═══════════════════════════════════════════════════════════════════════
 HAND DETAIL MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
 {selectedHand && (
 <div style={S.modalOverlay} onClick={() => setSelectedHand(null)}>
 <div style={S.modal} onClick={e => e.stopPropagation()}>
 <div style={S.modalHeader}>
 <span style={S.modalTitle}>Hand Details</span>
 <button style={S.modalClose} onClick={() => setSelectedHand(null)}>&times;</button>
 </div>
 <div style={S.modalBody}>
 {/* Result */}
 <div style={{ textAlign: 'center', marginBottom: '20px' }}>
 <div style={{
 display: 'inline-block',
 padding: '8px 20px',
 borderRadius: '6px',
 fontSize: '18px',
 fontWeight: 700,
 background: (selectedHand.profit > 0 || selectedHand.result === 'win') ? FB.success : FB.danger,
 color: '#fff'
 }}>
 {(selectedHand.profit > 0 || selectedHand.result === 'win') ? 'WON' : 'LOST'} {Math.abs(selectedHand.profit || selectedHand.pot_size || 0).toLocaleString()}
 </div>
 </div>

 {/* Your Cards */}
 {selectedHand.hole_cards && (
 <div style={S.modalSection}>
 <div style={S.modalLabel}>Your Hole Cards</div>
 {renderCardRow(selectedHand.hole_cards, 'large')}
 </div>
 )}

 {/* Board */}
 {selectedHand.board && (
 <div style={S.modalSection}>
 <div style={S.modalLabel}>Community Cards</div>
 {renderCardRow(selectedHand.board, 'large')}
 </div>
 )}

 {/* Hand Type */}
 {selectedHand.winning_hand && (
 <div style={S.modalSection}>
 <div style={S.modalLabel}>Final Hand</div>
 <div style={{ fontSize: '18px', fontWeight: 700, color: FB.gold }}>
 {selectedHand.winning_hand}
 </div>
 </div>
 )}

 {/* Details */}
 <div style={S.modalSection}>
 <div style={S.modalLabel}>Details</div>
 <div style={{ background: FB.background, padding: '12px', borderRadius: '6px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
 <span style={{ color: FB.textSecondary }}>Table</span>
 <span style={{ color: FB.textPrimary }}>{selectedHand.table_name || 'N/A'}</span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
 <span style={{ color: FB.textSecondary }}>Pot Size</span>
 <span style={{ color: FB.textPrimary }}>{(selectedHand.pot_size || 0).toLocaleString()}</span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
 <span style={{ color: FB.textSecondary }}>Date</span>
 <span style={{ color: FB.textPrimary }}>{formatDate(selectedHand.created_at)}</span>
 </div>
 {selectedHand.position && (
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span style={{ color: FB.textSecondary }}>Position</span>
 <span style={{ color: FB.textPrimary }}>{selectedHand.position}</span>
 </div>
 )}
 </div>
 </div>

 {/* Actions / Notes */}
 {selectedHand.actions && (
 <div style={S.modalSection}>
 <div style={S.modalLabel}>Actions</div>
 <div style={{ fontSize: '13px', color: FB.textSecondary, whiteSpace: 'pre-wrap' }}>
 {selectedHand.actions}
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 )}
 </>
 );
}
