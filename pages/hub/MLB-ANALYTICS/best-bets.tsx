import { useRouter } from 'next/router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import useSWR from 'swr';
import { 
    ArrowLeft, X, TrendingUp, TrendingDown, Info, SearchX, CalendarX, 
    Loader2, Activity, ChevronRight, Target, Zap, ChevronDown, ChevronUp
} from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';

const fetcher = async (url: string) => {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return await res.json();
    } catch (err) {
        logError('SWR Fetch', err);
        throw err;
    }
};

// MLB team abbreviation → team_id mapping for logos
const MLB_TEAM_IDS: Record<string, number> = {
    'NYY': 147, 'BOS': 111, 'TOR': 141, 'BAL': 110, 'TBR': 139, 'TB': 139,
    'HOU': 117, 'TEX': 140, 'OAK': 133, 'LAA': 108, 'SEA': 136,
    'CLE': 114, 'MIN': 142, 'CWS': 145, 'CHW': 145, 'DET': 116, 'KCR': 118, 'KC': 118,
    'ATL': 144, 'NYM': 121, 'PHI': 143, 'MIA': 146, 'WSN': 120, 'WAS': 120,
    'MIL': 158, 'CHC': 112, 'STL': 138, 'CIN': 113, 'PIT': 134,
    'LAD': 119, 'SF': 137, 'SFG': 137, 'ARI': 109, 'COL': 115, 'SDP': 135, 'SD': 135,
};

const detectBetCategory = (bet: any) => {
    const typeStr = ((bet.bet_type || '') + ' ' + (bet.market || '')).toLowerCase();
    const isPitcherProp = typeStr.includes('pitcher') || typeStr.includes('strikeout') || 
                          typeStr.includes('outs_recorded') || typeStr.includes('ip_') || typeStr.includes('walks') || typeStr.includes('earned_runs') || typeStr.includes('pitching_outs');
    const isPlayerProp = bet.bet_type === 'prop' || isPitcherProp || typeStr.includes('prop') || typeStr.includes('hits') || 
                         typeStr.includes('bases') || typeStr.includes('runs_batted_in') || typeStr.includes('rbis') || 
                         typeStr.includes('home_run') || typeStr.includes('hrr') || typeStr.includes('player');
    const isTeamBet = !isPlayerProp && (bet.bet_type === 'line' || bet.bet_type === 'game' || 
                      typeStr.includes('moneyline') || typeStr.includes('h2h') || typeStr.includes('ml') || typeStr.includes('total') || 
                      typeStr.includes('run_line') || typeStr.includes('runline') || typeStr.includes('spread'));
    return { isTeamBet, isPlayerProp, isPitcherProp };
};

const getPlayerImageUrl = (playerId: number | null | undefined) => {
    if (!playerId) return null;
    return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/silo/current`;
};

const getTeamLogoUrl = (teamId: number | null | undefined) => {
    if (!teamId) return null;
    return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
};

const formatOdds = (o: any) => {
    if (!o) return '—';
    const num = Number(o);
    if (isNaN(num)) return String(o);
    return num > 0 ? `+${num}` : `${num}`;
};

const formatWinPct = (wc: any) => {
    if (wc == null) return 'N/A';
    const n = Number(wc);
    if (n > 0 && n <= 1) return (n * 100).toFixed(1) + '%';
    return n.toFixed(1) + '%';
};

// Tier colors: no pink/purple — cyan for ELITE, gold for STRONG, slate for others
const getTierColors = (tier: string) => {
    if (tier === 'ELITE') return { color: '#00D4FF', glow: 'rgba(0,212,255,0.35)', bg: 'rgba(0,212,255,0.12)', border: 'rgba(0,212,255,0.4)' };
    if (tier === 'STRONG') return { color: '#FFD700', glow: 'rgba(255,215,0,0.35)', bg: 'rgba(255,215,0,0.10)', border: 'rgba(255,215,0,0.4)' };
    return { color: '#8a9ba8', glow: 'rgba(138,155,168,0.2)', bg: 'rgba(138,155,168,0.08)', border: 'rgba(138,155,168,0.3)' };
};

// ──────────────────────────────────────────────────────────────────────────────
// Fullscreen Modal Component
// ──────────────────────────────────────────────────────────────────────────────
const BetDetailModal = ({ bet, onClose }: { bet: any; onClose: () => void }) => {
    const { isTeamBet, isPlayerProp, isPitcherProp } = detectBetCategory(bet);
    const [imgError, setImgError] = useState(false);
    const { color: tierColor, glow: tierGlow, bg: tierBg } = getTierColors(bet.bet_tier || '');

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    let lineStr = '';
    if (bet.line !== null && bet.line !== undefined) {
        const numLine = Number(bet.line);
        const typeStr = ((bet.bet_type || '') + ' ' + (bet.market || '')).toLowerCase();
        const isSpread = typeStr.includes('run_line') || typeStr.includes('runline') || typeStr.includes('spread');
        lineStr = isSpread && numLine > 0 ? `+${numLine}` : `${numLine}`;
    }

    const playerImageUrl = !imgError ? getPlayerImageUrl(bet.player_id) : null;
    const teamId = bet.team_id || (bet.team ? MLB_TEAM_IDS[bet.team.toUpperCase()] : null);
    const teamLogoUrl = getTeamLogoUrl(teamId);

    const wins = bet.pitcher_wins != null ? bet.pitcher_wins : null;
    const losses = bet.pitcher_losses != null ? bet.pitcher_losses : null;
    const era = bet.pitcher_era != null ? Number(bet.pitcher_era).toFixed(2) : null;

    return (
        <div 
            className="fixed inset-0 z-[9999] flex flex-col"
            style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div 
                className="relative flex flex-col w-full max-w-lg mx-auto h-full overflow-y-auto"
                style={{ background: 'linear-gradient(180deg, #0d1117 0%, #131e2e 100%)' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top border glow */}
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${tierColor}, transparent)`, boxShadow: `0 0 20px ${tierGlow}` }} />

                {/* Header bar */}
                <div className="sticky top-0 z-10 flex justify-between items-center px-4 py-3 border-b border-[#2a3a4a]" style={{ background: 'rgba(13,17,23,0.97)', backdropFilter: 'blur(10px)' }}>
                    <div className="text-[10px] font-black text-[#5a6a7a] uppercase tracking-widest font-mono">Bet Details</div>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-sm border border-[#3d4f5f] text-slate-400 hover:text-white hover:border-[#00D4FF] transition-all active:scale-95"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Hero Section */}
                <div className="flex flex-col items-center pt-5 pb-4 px-4 border-b border-[#2a3a4a] relative overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%, ${tierGlow.replace('0.35', '0.06')} 0%, transparent 70%)` }} />
                    
                    <div className="relative mb-3">
                        {isTeamBet ? (
                            teamLogoUrl ? (
                                <div className="w-20 h-20 flex items-center justify-center bg-[#0d1117] rounded-full border-2 border-[#3d4f5f] p-2.5 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                                    <img src={teamLogoUrl} alt={bet.team || 'MLB'} className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </div>
                            ) : (
                                <div className="w-20 h-20 flex items-center justify-center bg-[#0d1117] rounded-full border-2 border-[#3d4f5f]">
                                    <span className="text-2xl font-black text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>MLB</span>
                                </div>
                            )
                        ) : playerImageUrl ? (
                            <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 shadow-[0_0_20px_rgba(0,0,0,0.6)]" style={{ borderColor: tierColor }}>
                                <img src={playerImageUrl} alt={bet.player_name || bet.selection} className="w-full h-full object-cover object-top" onError={() => setImgError(true)} />
                            </div>
                        ) : (
                            <div className="w-20 h-20 flex items-center justify-center bg-[#0d1117] rounded-full border-2" style={{ borderColor: tierColor }}>
                                <Target size={32} style={{ color: tierColor }} />
                            </div>
                        )}
                        <div 
                            className="absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-sm text-[9px] font-black tracking-widest uppercase"
                            style={{ background: tierColor, color: '#000' }}
                        >
                            {bet.bet_tier || 'BET'}
                        </div>
                    </div>

                    <div className="text-center">
                        <div className="text-[22px] font-black text-white uppercase tracking-wider mb-0.5" style={{ fontFamily: '"Orbitron", sans-serif', fontSize: '18px' }}>
                            {bet.player_name || bet.selection?.split(' ').slice(0, -1).join(' ') || bet.team || 'Unknown'}
                        </div>
                        {!isTeamBet && bet.team_name && (
                            <div className="inline-flex items-center gap-1 bg-[#0d1117] border border-[#3d4f5f] px-2.5 py-0.5 rounded-sm mt-1">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: tierColor }} />
                                <span className="text-[10px] font-black text-slate-300 tracking-wider uppercase">{bet.team_name}</span>
                            </div>
                        )}
                        {bet.matchup && (
                            <div className="text-[10px] font-black text-[#5a6a7a] mt-1.5 tracking-widest uppercase font-mono">{bet.matchup}</div>
                        )}
                    </div>
                </div>

                {/* Bet Info */}
                <div className="px-4 py-3 border-b border-[#2a3a4a]">
                    <div className="text-[9px] font-black text-[#00D4FF] mb-2 uppercase tracking-widest font-mono">Bet Details</div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5">
                            <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Selection</div>
                            <div className="text-[14px] font-black text-white uppercase leading-tight" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                {bet.selection} {lineStr}
                            </div>
                        </div>
                        <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5">
                            <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Market</div>
                            <div className="text-[13px] font-black text-slate-300 uppercase leading-tight" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                {bet.market?.replace(/_/g, ' ') || bet.bet_type?.replace(/_/g, ' ') || '—'}
                            </div>
                        </div>
                    </div>
                    {(bet.best_price || bet.best_book) && (
                        <div className="bg-[#0d1420] border-2 border-[#3d4f5f] rounded-sm p-3 flex justify-between items-center">
                            <div>
                                <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Best Odds</div>
                                <div className="text-[26px] font-black text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    {formatOdds(bet.best_price)}
                                </div>
                            </div>
                            {bet.best_book && (
                                <div className="text-right">
                                    <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Book</div>
                                    <div className="text-[14px] font-black text-[#00D4FF] uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{bet.best_book}</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Key Metrics */}
                <div className="px-4 py-3 border-b border-[#2a3a4a]">
                    <div className="text-[9px] font-black text-[#00D4FF] mb-2 uppercase tracking-widest font-mono">Key Metrics</div>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                            <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Score</div>
                            <div className="text-[24px] font-black" style={{ fontFamily: '"Rajdhani", sans-serif', color: tierColor }}>
                                {bet.bet_score ?? '—'}
                            </div>
                            <div className="text-[8px] text-[#3d4f5f] uppercase tracking-widest font-mono">/100</div>
                        </div>
                        <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                            <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Win%</div>
                            <div className="text-[20px] font-black text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                {formatWinPct(bet.win_confidence)}
                            </div>
                        </div>
                        {bet.ev_pct !== null && bet.ev_pct !== undefined && (
                            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">EV%</div>
                                <div className="text-[20px] font-black" style={{ fontFamily: '"Rajdhani", sans-serif', color: Number(bet.ev_pct) > 0 ? '#00D4FF' : '#FF6B6B' }}>
                                    {Number(bet.ev_pct) > 0 ? '+' : ''}{Number(bet.ev_pct).toFixed(1)}%
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {bet.edge !== null && bet.edge !== undefined && (
                            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Edge</div>
                                <div className="text-[16px] font-black text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    {Number(bet.edge) > 0 ? '+' : ''}{Number(bet.edge).toFixed(1)}pts
                                </div>
                            </div>
                        )}
                        {bet.ev_kelly !== null && bet.ev_kelly !== undefined && (
                            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Stake</div>
                                <div className="text-[16px] font-black text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    {Number(bet.ev_kelly).toFixed(1)}u
                                </div>
                            </div>
                        )}
                        {bet.rank !== null && bet.rank !== undefined && (
                            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Rank</div>
                                <div className="text-[16px] font-black text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    #{bet.rank}
                                </div>
                            </div>
                        )}
                    </div>
                    {(bet.market_novig_prob !== null && bet.market_novig_prob !== undefined) && (
                        <div className="mt-2 bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5">
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Market No-Vig</div>
                                    <div className="text-[14px] font-black text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                        {(Number(bet.market_novig_prob) * 100).toFixed(1)}%
                                    </div>
                                </div>
                                {bet.implied_prob_novig !== null && bet.implied_prob_novig !== undefined && (
                                    <div className="text-right">
                                        <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Model Prob</div>
                                        <div className="text-[14px] font-black text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                            {(Number(bet.implied_prob_novig) * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Analysis */}
                {bet.score_factors && bet.score_factors.length > 0 && (
                    <div className="px-4 py-3 border-b border-[#2a3a4a]">
                        <div className="text-[9px] font-black text-[#00D4FF] mb-2 uppercase tracking-widest font-mono">
                            {bet.score_verdict || 'Analysis'}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {bet.score_factors.map((factor: any, i: number) => (
                                <div key={i} className="flex gap-2.5 items-start bg-[#0a0f1a] p-2.5 rounded-sm border border-[#2a3a4a]">
                                    <div className="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-sm border border-[#3d4f5f] bg-[#0d1117]">
                                        {factor.dir === 'up' && <TrendingUp size={10} className="text-[#00D4FF]" />}
                                        {factor.dir === 'down' && <TrendingDown size={10} className="text-[#FF6B6B]" />}
                                        {factor.dir === 'info' && <Info size={10} className="text-slate-400" />}
                                    </div>
                                    <div className="text-[11px] text-slate-300 leading-relaxed font-bold tracking-wide flex-1 font-mono">
                                        {factor.text}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Pitcher Profile */}
                {isPitcherProp && (
                    <div className="px-4 py-3 border-b border-[#2a3a4a]">
                        <div className="text-[9px] font-black text-[#FFD700] mb-2 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                            <Zap size={10} /> Pitcher Profile
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {era !== null && (
                                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                    <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">ERA</div>
                                    <div className="text-[18px] font-black text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{era}</div>
                                </div>
                            )}
                            {wins !== null && losses !== null && (
                                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                    <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">W–L</div>
                                    <div className="text-[18px] font-black text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{wins}–{losses}</div>
                                </div>
                            )}
                            {bet.pitcher_fip !== null && bet.pitcher_fip !== undefined && (
                                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                    <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">FIP</div>
                                    <div className="text-[18px] font-black text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{Number(bet.pitcher_fip).toFixed(2)}</div>
                                </div>
                            )}
                            {bet.pitcher_so !== null && bet.pitcher_so !== undefined && (
                                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                    <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5 font-mono">Season K</div>
                                    <div className="text-[18px] font-black text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{bet.pitcher_so}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Disclaimer */}
                <div className="px-4 py-4 mt-auto">
                    <div className="text-[9px] text-[#5a6a7a] text-center leading-relaxed font-black tracking-wide font-mono uppercase">
                        Analysis Only — Not Betting Advice.<br />
                        <span className="text-[#8a9ba8]">Bet Score ranks value (EV + confidence). Bet responsibly.</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
// Inline Bet Row — inside a game box
// ──────────────────────────────────────────────────────────────────────────────
const BetRow = ({ bet, rank, onClick }: { bet: any; rank: number; onClick: () => void }) => {
    const { color: tierColor, bg: tierBg, border: tierBorder } = getTierColors(bet.bet_tier || '');
    const { isTeamBet, isPitcherProp } = detectBetCategory(bet);

    let lineStr = '';
    if (bet.line !== null && bet.line !== undefined) {
        const numLine = Number(bet.line);
        const typeStr = ((bet.bet_type || '') + ' ' + (bet.market || '')).toLowerCase();
        const isSpread = typeStr.includes('run_line') || typeStr.includes('runline') || typeStr.includes('spread');
        lineStr = isSpread && numLine > 0 ? `+${numLine}` : `${numLine}`;
    }

    // Detect market label
    const typeStr = ((bet.bet_type || '') + ' ' + (bet.market || '')).toLowerCase();
    let marketLabel = 'ML';
    if (typeStr.includes('total')) marketLabel = 'TOT';
    else if (typeStr.includes('run_line') || typeStr.includes('runline') || typeStr.includes('spread')) marketLabel = 'RL';
    else if (typeStr.includes('prop') || typeStr.includes('strikeout') || typeStr.includes('pitcher')) marketLabel = 'PROP';

    return (
        <div
            className="flex items-center gap-2 px-3 py-2 border-b border-[#1a2530] last:border-b-0 cursor-pointer hover:bg-[#0d1420] active:bg-[#0a0f1a] transition-colors touch-manipulation group"
            onClick={() => {
                onClick();
                if (navigator.vibrate) try { navigator.vibrate(8); } catch(e) {}
            }}
        >
            {/* Left accent */}
            <div className="w-[3px] h-8 rounded-full flex-shrink-0" style={{ background: tierColor, boxShadow: `0 0 6px ${tierColor}66` }} />

            {/* Rank */}
            <div className="text-[11px] font-black text-[#3d4f5f] w-4 text-center flex-shrink-0 font-mono">{rank}</div>

            {/* Market pill */}
            <div
                className="flex-shrink-0 px-1.5 py-0.5 rounded-sm text-[9px] font-black tracking-widest uppercase w-9 text-center"
                style={{ background: tierBg, color: tierColor, border: `1px solid ${tierBorder}` }}
            >
                {marketLabel}
            </div>

            {/* Selection */}
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-black text-white uppercase tracking-wide truncate leading-tight" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                    {bet.selection} {lineStr}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-black text-[#5a6a7a] font-mono">{formatWinPct(bet.win_confidence)} win</span>
                    {bet.ev_pct !== null && bet.ev_pct !== undefined && (
                        <span className="text-[10px] font-black font-mono" style={{ color: Number(bet.ev_pct) > 0 ? '#00D4FF' : '#FF6B6B' }}>
                            {Number(bet.ev_pct) > 0 ? '+' : ''}{Number(bet.ev_pct).toFixed(1)}% EV
                        </span>
                    )}
                    {isPitcherProp && bet.pitcher_era != null && (
                        <span className="text-[10px] font-black text-[#FFD700] font-mono">
                            ERA {Number(bet.pitcher_era).toFixed(2)}
                        </span>
                    )}
                </div>
            </div>

            {/* Right: Score + Odds */}
            <div className="flex-shrink-0 text-right flex flex-col items-end">
                <div className="text-[20px] font-black leading-none" style={{ fontFamily: '"Rajdhani", sans-serif', color: tierColor }}>
                    {bet.bet_score}
                </div>
                <div className="text-[12px] font-black text-slate-300 font-mono leading-none mt-0.5">
                    {formatOdds(bet.best_price)}
                </div>
            </div>

            <ChevronRight size={14} className="flex-shrink-0 text-[#3d4f5f] group-hover:text-[#00D4FF] transition-colors" />
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
// Game Box — groups all bets for a single matchup
// ──────────────────────────────────────────────────────────────────────────────
const GameBox = ({ matchup, bets, onBetClick }: { matchup: string; bets: any[]; onBetClick: (bet: any) => void }) => {
    const [collapsed, setCollapsed] = useState(false);

    // Extract team names from matchup "MIL @ ATL" format
    const parts = matchup ? matchup.split('@').map((s: string) => s.trim()) : [];
    const awayTeamAbbr = parts[0] || '';
    const homeTeamAbbr = parts[1] || '';
    const awayTeamId = MLB_TEAM_IDS[awayTeamAbbr.toUpperCase()];
    const homeTeamId = MLB_TEAM_IDS[homeTeamAbbr.toUpperCase()];

    // Try to get team names from first bet
    const firstBet = bets[0];

    // Best score in this game group
    const topScore = Math.max(...bets.map(b => Number(b.bet_score) || 0));

    // Top tier
    const haElite = bets.some(b => b.bet_tier === 'ELITE');
    const hasStrong = bets.some(b => b.bet_tier === 'STRONG');
    const groupTierColor = haElite ? '#00D4FF' : hasStrong ? '#FFD700' : '#3d4f5f';

    return (
        <div className="relative bg-gradient-to-b from-[#131e2e] to-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg mx-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-1px_0_rgba(0,0,0,0.4),0_6px_20px_rgba(0,0,0,0.6)] hover:border-[#3d5a6a] transition-all duration-200 overflow-hidden">
            {/* Corner screws */}
            <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />
            <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />
            <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] shadow-inner" />

            {/* Left neon edge */}
            <div className="absolute top-[15%] bottom-[15%] left-[-2px] w-[3px] rounded-r-md opacity-60" style={{ background: groupTierColor, boxShadow: `0 0 8px ${groupTierColor}` }} />

            {/* Game Header */}
            <button
                className="w-full flex items-center justify-between px-5 py-3 border-b border-[#2a3a4a] touch-manipulation"
                onClick={() => setCollapsed(c => !c)}
            >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Team logos */}
                    <div className="flex items-center gap-1.5">
                        {awayTeamId && (
                            <div className="w-7 h-7 bg-[#0a0a15] border border-[#2a3a4a] rounded-full flex items-center justify-center p-0.5">
                                <img src={getTeamLogoUrl(awayTeamId) || ''} alt={awayTeamAbbr} className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                        )}
                        <span className="text-[9px] font-black text-[#5a6a7a] font-mono">@</span>
                        {homeTeamId && (
                            <div className="w-7 h-7 bg-[#0a0a15] border border-[#2a3a4a] rounded-full flex items-center justify-center p-0.5">
                                <img src={getTeamLogoUrl(homeTeamId) || ''} alt={homeTeamAbbr} className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0 text-left">
                        <div className="text-[12px] font-black text-white uppercase tracking-[0.12em] truncate" style={{ fontFamily: '"Orbitron", sans-serif', fontSize: '11px' }}>
                            {matchup}
                        </div>
                        <div className="text-[9px] font-black text-[#5a6a7a] font-mono tracking-widest">
                            {bets.length} BET{bets.length !== 1 ? 'S' : ''} · TOP SCORE: <span style={{ color: groupTierColor }}>{topScore}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {haElite && (
                        <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-black tracking-widest uppercase bg-[rgba(0,212,255,0.12)] text-[#00D4FF] border border-[rgba(0,212,255,0.35)]">
                            ELITE
                        </span>
                    )}
                    {collapsed ? <ChevronDown size={14} className="text-[#5a6a7a]" /> : <ChevronUp size={14} className="text-[#5a6a7a]" />}
                </div>
            </button>

            {/* Bet rows */}
            {!collapsed && (
                <div>
                    {bets.map((bet: any, idx: number) => (
                        <BetRow
                            key={`${bet.game_pk}-${bet.selection}-${idx}`}
                            bet={bet}
                            rank={idx + 1}
                            onClick={() => onBetClick(bet)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────
export default function BestBetsPage() {
    const router = useRouter();
    const [filter, setFilter] = useState('ALL');
    const [selectedBet, setSelectedBet] = useState<any | null>(null);
    const [todayStr, setTodayStr] = useState<string>('');

    useEffect(() => {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        setTodayStr(formatter.format(new Date()));
    }, []);

    const { data, error, isLoading } = useSWR('/api/mlb/best-bets', fetcher, {
        refreshInterval: 60000,
    });

    const openModal = useCallback((bet: any) => setSelectedBet(bet), []);
    const closeModal = useCallback(() => setSelectedBet(null), []);

    if (error || data?.error) {
        logError('UI Error', error || (typeof data !== 'undefined' ? data?.error : null));
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-sm border-2 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.1)] relative overflow-hidden">
                        <div className="absolute left-0 top-0 w-1 h-full bg-red-500" />
                        <Activity className="w-10 h-10 text-red-400 mx-auto mb-3" />
                        <h2 className="text-xl font-black text-white uppercase tracking-wider mb-1" style={{ fontFamily: '"Orbitron", sans-serif' }}>System Error</h2>
                        <p className="text-red-400 font-black uppercase tracking-widest text-[10px] font-mono">Failed to load data. Please try again.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    const bets = data?.bets || [];
    const officialDate = data?.officialDate || null;
    const stats = data?.stats || { totalBets: 0, eliteBets: 0, topScore: 0, topLock: 0 };
    const isStale = !!(todayStr && officialDate && officialDate < todayStr);

    // Filter bets
    const filteredBets = bets.filter((b: any) => {
        if (filter === 'ALL') return true;
        const typeStr = ((b.bet_type || '') + ' ' + (b.market || '')).toLowerCase();
        if (filter === 'ML' && (typeStr.includes('moneyline') || typeStr.includes('h2h') || typeStr.includes('ml'))) return true;
        if (filter === 'TOTAL' && typeStr.includes('total')) return true;
        if (filter === 'RUN LINE' && (typeStr.includes('run_line') || typeStr.includes('runline') || typeStr.includes('spread'))) return true;
        if (filter === 'PROPS' && (typeStr.includes('prop') || typeStr.includes('hits') || typeStr.includes('bases') || typeStr.includes('runs') || typeStr.includes('pitcher') || typeStr.includes('strikeout') || typeStr.includes('player') || typeStr.includes('hrr') || typeStr.includes('walks'))) return true;
        return false;
    });

    // Group bets by matchup
    const gameGroups = useMemo(() => {
        const groups = new Map<string, any[]>();
        for (const bet of filteredBets) {
            const key = bet.matchup || 'Unknown Matchup';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(bet);
        }
        // Sort groups: most total bet score first
        return Array.from(groups.entries()).sort((a, b) => {
            const aTop = Math.max(...a[1].map((x: any) => Number(x.bet_score) || 0));
            const bTop = Math.max(...b[1].map((x: any) => Number(x.bet_score) || 0));
            return bTop - aTop;
        });
    }, [filteredBets]);

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            <SEOHead
                title="Best Bets | MLB Analytics"
                description="Daily MLB Betting Edges Surfaced By AI Models."
                noIndex={true}
            />

            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            {/* Page Header — Metal Vault Style */}
            <header className="relative px-4 pt-4 pb-4 bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[3px] border-[#3d4f5f] shadow-[0_6px_25px_rgba(0,0,0,0.7)] z-10">
                {/* Decorative corner bolts */}
                <div className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)]" />
                <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)]" />

                <div className="flex items-start justify-between gap-3">
                    <div>
                        <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-[#00D4FF] text-[9px] font-black no-underline tracking-widest uppercase hover:text-white transition-colors font-mono mb-1">
                            <ArrowLeft size={12} /> Dashboard
                        </Link>
                        <h1 className="m-0 text-[28px] font-black text-white uppercase tracking-[0.12em] leading-none drop-shadow-[0_0_6px_rgba(255,255,255,0.15)]" style={{ fontFamily: '"Orbitron", sans-serif' }}>
                            Best <span className="text-[#00D4FF] drop-shadow-[0_0_10px_rgba(0,212,255,0.6)]">Bets</span>
                        </h1>
                        <p className="m-0 text-[9px] font-black tracking-widest text-[#5a6a7a] uppercase font-mono mt-1">
                            Ranked By Bet Score · {officialDate || todayStr || '—'}
                        </p>
                    </div>
                    <div className="text-right bg-[#0a0a15] px-2.5 py-2 rounded-sm border border-[#2a3a4a] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                        <div className="text-[#00D4FF] text-[10px] font-black tracking-widest uppercase font-mono drop-shadow-[0_0_4px_rgba(0,212,255,0.4)]">MLB Edge</div>
                        <div className="text-[9px] font-black text-[#5a6a7a] mt-0.5 uppercase tracking-widest border-t border-[#2a3a4a] pt-1 font-mono">Score 0–100</div>
                        <div className="text-[8px] font-black text-[#3d4f5f] uppercase tracking-widest font-mono">Value + Conf</div>
                    </div>
                </div>

                {/* Stats bar */}
                <div className="grid grid-cols-4 gap-2 mt-3">
                    {[
                        { label: 'Bets', value: isLoading && !data ? null : stats.totalBets, color: '#ffffff' },
                        { label: 'Elite', value: isLoading && !data ? null : stats.eliteBets, color: '#00D4FF' },
                        { label: 'Top Score', value: isLoading && !data ? null : (stats.topScore ? (Number(stats.topScore) % 1 !== 0 ? Number(stats.topScore).toFixed(1) : stats.topScore) : 0), color: '#FFD700' },
                        { label: 'Top Lock', value: isLoading && !data ? null : `${(Number(stats.topLock) || 0).toFixed(0)}%`, color: '#8a9ba8' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="bg-[#0a0a15] border border-[#2a3a4a] rounded-sm py-2 px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            <div className="text-[8px] font-black text-[#5a6a7a] tracking-widest uppercase font-mono">{label}</div>
                            {value === null ? (
                                <Loader2 className="w-4 h-4 animate-spin mx-auto mt-1 text-[#00D4FF]" />
                            ) : (
                                <div className="text-[22px] font-black mt-0.5 leading-none" style={{ fontFamily: '"Rajdhani", sans-serif', color }}>{value}</div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Bottom neon strip */}
                <div className="absolute bottom-0 left-[10%] right-[10%] h-[2px] bg-[#00D4FF] shadow-[0_0_8px_#00D4FF,0_0_16px_rgba(0,212,255,0.3)] rounded-t-full" />
            </header>

            <div className="w-full max-w-2xl mx-auto">
                {/* Filter Tabs */}
                <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5 border-b border-[#1a2530]" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                    {['ALL', 'ML', 'TOTAL', 'RUN LINE', 'PROPS'].map(f => (
                        <button
                            key={f}
                            onClick={() => {
                                setFilter(f);
                                if (navigator.vibrate) try { navigator.vibrate(12); } catch(e) {}
                            }}
                            className={`px-3 py-1.5 rounded-sm border text-[9px] font-black tracking-widest whitespace-nowrap cursor-pointer touch-manipulation transition-all uppercase font-mono ${
                                filter === f
                                    ? 'bg-[#0d1420] text-[#00D4FF] border-[#00D4FF] shadow-[0_0_8px_rgba(0,212,255,0.25)]'
                                    : 'bg-[#0a0a15] text-[#5a6a7a] border-[#2a3a4a] hover:border-[#3d4f5f] hover:text-slate-300'
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* Stale Warning */}
                {isStale && !isLoading && (
                    <div className="mx-3 mt-3 bg-[#1a1500] border-2 border-amber-500/40 rounded-sm p-3 shadow-[0_0_12px_rgba(245,158,11,0.08)] relative overflow-hidden">
                        <div className="absolute left-0 top-0 w-1 h-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
                        <div className="pl-2 text-amber-500 text-[11px] font-black tracking-widest uppercase font-mono flex items-center gap-2">
                            <CalendarX size={13} /> Stale Slate — Not Actionable
                        </div>
                        <div className="pl-2 text-amber-600/70 text-[10px] font-black uppercase tracking-wider mt-0.5 font-mono">
                            Picks from {officialDate || 'previous date'}, not today ({todayStr}).
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="flex flex-col gap-3 pt-3 pb-4">
                    {isLoading && !data ? (
                        <div className="text-center py-16 mx-3 bg-[#0d1117] border-2 border-[#2a3a4a] rounded-sm shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                            <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mx-auto mb-3" />
                            <div className="text-[11px] font-black text-[#00D4FF] tracking-widest uppercase animate-pulse font-mono">Scanning Database...</div>
                        </div>
                    ) : gameGroups.length === 0 ? (
                        <div className="text-center py-14 px-5 mx-3 bg-[#0d1117] border-2 border-dashed border-[#2a3a4a] rounded-sm shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                            <div className="mb-3 text-[#3d4f5f] flex justify-center">
                                {filter === 'ALL' ? <CalendarX size={40} /> : <SearchX size={40} />}
                            </div>
                            <div className="text-[15px] font-black text-white mb-1.5 uppercase tracking-wider font-mono">
                                {filter === 'ALL' ? 'No Qualifying Bets Today.' : 'No Bets For This Filter.'}
                            </div>
                            <div className="text-[10px] font-black tracking-widest text-[#5a6a7a] uppercase font-mono">
                                {filter === 'ALL' ? 'Model is respecting the market.' : 'Try a different bet type.'}
                            </div>
                        </div>
                    ) : (
                        gameGroups.map(([matchup, gameBets]) => (
                            <GameBox
                                key={matchup}
                                matchup={matchup}
                                bets={gameBets}
                                onBetClick={openModal}
                            />
                        ))
                    )}
                </div>

                {/* Footer */}
                {gameGroups.length > 0 && (
                    <div className="mx-3 mb-4 px-3 py-3 bg-[#0d1117] border border-[#2a3a4a] rounded-sm text-center">
                        <div className="text-[9px] font-black tracking-widest text-[#5a6a7a] uppercase font-mono leading-relaxed">
                            <span className="text-[#00D4FF]">Analysis Only</span> — Not Betting Advice.{' '}
                            Score (0–100) ranks EV + Confidence. EV% = Expected Return Per $1. Bet Responsibly.
                        </div>
                    </div>
                )}
            </div>

            <BottomNavBar />

            {/* Fullscreen Modal */}
            {selectedBet && <BetDetailModal bet={selectedBet} onClose={closeModal} />}
        </div>
    );
}
