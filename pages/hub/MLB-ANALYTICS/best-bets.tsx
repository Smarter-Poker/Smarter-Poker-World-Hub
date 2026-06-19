import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import Image from 'next/image';
import { 
    ArrowLeft, X, TrendingUp, TrendingDown, Info, SearchX, CalendarX, 
    Loader2, Activity, ChevronRight, Star, Target, Zap, DollarSign,
    BarChart2, Shield, AlertTriangle, Trophy
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

// Detect if a bet is a player prop (not a team bet)
const detectBetCategory = (bet: any) => {
    const type = (bet.bet_type || '').toLowerCase();
    const isPitcherProp = type.includes('pitcher') || type.includes('strikeout') || 
                           type.includes('outs_recorded') || type.includes('ip_') || type.includes('walks') || type.includes('earned_runs');
                           
    const isPlayerProp = isPitcherProp || type.includes('prop') || type.includes('hits') || 
                          type.includes('bases') || type.includes('runs_batted_in') || type.includes('rbis') || 
                          type.includes('home_run') || type.includes('player');
                          
    const isTeamBet = !isPlayerProp && (type.includes('moneyline') || type === 'ml' || type.includes('total') || 
                      type.includes('run_line') || type.includes('runline') || type.includes('spread'));
                      
    return { isTeamBet, isPlayerProp, isPitcherProp };
};

// MLB Headshot CDN URL
const getPlayerImageUrl = (playerId: number | null | undefined) => {
    if (!playerId) return null;
    return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/silo/current`;
};

// MLB Team logo (official MLB CDN)
const getTeamLogoUrl = (teamId: number | null | undefined) => {
    if (!teamId) return null;
    return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
};

// Format odds nicely
const formatOdds = (o: any) => {
    if (!o) return '';
    const num = Number(o);
    if (isNaN(num)) return String(o);
    return num > 0 ? `+${num}` : `${num}`;
};

// Format win confidence
const formatWinPct = (wc: any) => {
    if (wc == null) return 'N/A';
    const n = Number(wc);
    if (n > 0 && n <= 1) return (n * 100).toFixed(1) + '%';
    return n.toFixed(1) + '%';
};

// ──────────────────────────────────────────────────────────────────────────────
// Fullscreen Modal Component
// ──────────────────────────────────────────────────────────────────────────────
const BetDetailModal = ({ bet, onClose }: { bet: any; onClose: () => void }) => {
    const { isTeamBet, isPlayerProp, isPitcherProp } = detectBetCategory(bet);
    const [imgError, setImgError] = useState(false);

    // Prevent body scroll when modal open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const isElite = bet.bet_tier === 'ELITE';
    const isStrong = bet.bet_tier === 'STRONG';
    const tierColor = isElite ? '#FF00FF' : isStrong ? '#00D4FF' : '#FFD700';
    const tierGlow = isElite ? 'rgba(255,0,255,0.4)' : isStrong ? 'rgba(0,212,255,0.4)' : 'rgba(255,215,0,0.4)';

    // Format line
    let lineStr = '';
    if (bet.line !== null && bet.line !== undefined) {
        const numLine = Number(bet.line);
        const type = (bet.bet_type || '').toLowerCase();
        const isSpread = type === 'run_line' || type === 'runline' || type === 'spread';
        lineStr = isSpread && numLine > 0 ? `+${numLine}` : `${numLine}`;
    }

    const playerImageUrl = !imgError ? getPlayerImageUrl(bet.player_id) : null;
    const teamId = bet.team_id || (bet.team ? MLB_TEAM_IDS[bet.team?.toUpperCase()] : null);
    const teamLogoUrl = getTeamLogoUrl(teamId);

    // Pitcher W/L display
    const wins = bet.pitcher_wins != null ? bet.pitcher_wins : null;
    const losses = bet.pitcher_losses != null ? bet.pitcher_losses : null;
    const era = bet.pitcher_era != null ? Number(bet.pitcher_era).toFixed(2) : null;
    const hasPitcherStats = wins !== null || losses !== null || era !== null;

    return (
        <div 
            className="fixed inset-0 z-[9999] flex flex-col"
            style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div 
                className="relative flex flex-col w-full max-w-lg mx-auto h-full overflow-y-auto"
                style={{ background: 'linear-gradient(180deg, #0d1117 0%, #1a2332 100%)' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top border glow */}
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${tierColor}, transparent)`, boxShadow: `0 0 20px ${tierGlow}` }} />

                {/* Header bar */}
                <div className="sticky top-0 z-10 flex justify-between items-center px-4 py-3 border-b border-[#3d4f5f]" style={{ background: 'rgba(13,17,23,0.95)', backdropFilter: 'blur(10px)' }}>
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Bet Details</div>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full border border-[#3d4f5f] text-slate-400 hover:text-white hover:border-[#00D4FF] transition-all active:scale-95"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Hero Section — Image + Identity */}
                <div className="flex flex-col items-center pt-6 pb-5 px-4 border-b border-[#3d4f5f] relative overflow-hidden">
                    {/* BG glow */}
                    <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%, ${tierGlow.replace('0.4', '0.08')} 0%, transparent 70%)` }} />
                    
                    {/* Image Container */}
                    <div className="relative mb-4">
                        {isTeamBet ? (
                            // MLB Team Logo
                            teamLogoUrl ? (
                                <div className="w-24 h-24 flex items-center justify-center bg-[#1a2332] rounded-full border-2 border-[#3d4f5f] p-3 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                                    <img 
                                        src={teamLogoUrl} 
                                        alt={bet.team || 'MLB'}
                                        className="w-full h-full object-contain"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                </div>
                            ) : (
                                <div className="w-24 h-24 flex items-center justify-center bg-[#1a2332] rounded-full border-2 border-[#3d4f5f] shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                                    <span className="text-3xl font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>MLB</span>
                                </div>
                            )
                        ) : playerImageUrl ? (
                            // Player Headshot
                            <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 shadow-[0_0_25px_rgba(0,0,0,0.6)]" style={{ borderColor: tierColor }}>
                                <img
                                    src={playerImageUrl}
                                    alt={bet.player_name || bet.selection}
                                    className="w-full h-full object-cover object-top"
                                    onError={() => setImgError(true)}
                                />
                            </div>
                        ) : (
                            // Fallback avatar
                            <div className="w-24 h-24 flex items-center justify-center bg-[#1a2332] rounded-full border-2 shadow-[0_0_20px_rgba(0,0,0,0.5)]" style={{ borderColor: tierColor }}>
                                <Target size={36} style={{ color: tierColor }} />
                            </div>
                        )}

                        {/* Tier Badge */}
                        <div 
                            className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-sm text-[9px] font-extrabold tracking-widest uppercase"
                            style={{ background: tierColor, color: '#000', boxShadow: `0 0 10px ${tierGlow}` }}
                        >
                            {bet.bet_tier || 'BET'}
                        </div>
                    </div>

                    {/* Player/Team Name */}
                    <div className="text-center">
                        <div className="text-2xl font-extrabold text-white uppercase tracking-wider mb-1" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(255,255,255,0.15)' }}>
                            {bet.player_name || bet.selection?.split(' ').slice(0, -1).join(' ') || bet.team || 'Unknown'}
                        </div>
                        
                        {/* Team Name (for player bets) */}
                        {!isTeamBet && bet.team_name && (
                            <div className="inline-flex items-center gap-1.5 bg-[#1a2332] border border-[#3d4f5f] px-3 py-1 rounded-full mt-1">
                                <div className="w-2 h-2 rounded-full" style={{ background: tierColor }} />
                                <span className="text-[11px] font-bold text-slate-300 tracking-wider uppercase">{bet.team_name}</span>
                            </div>
                        )}

                        {/* Matchup */}
                        {bet.matchup && (
                            <div className="text-[11px] font-bold text-slate-400 mt-2 tracking-widest uppercase">{bet.matchup}</div>
                        )}
                    </div>

                    {/* Pitcher Stats Bar — only for pitcher props */}
                    {isPitcherProp && hasPitcherStats && (
                        <div className="flex gap-4 mt-4 bg-[#0d1117] border border-[#3d4f5f] rounded-lg px-4 py-2.5 w-full justify-center">
                            {wins !== null && losses !== null && (
                                <div className="text-center">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Record</div>
                                    <div className="text-[15px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{wins}–{losses}</div>
                                </div>
                            )}
                            {era !== null && (
                                <div className="text-center">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">ERA</div>
                                    <div className="text-[15px] font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 6px rgba(0,212,255,0.4)' }}>{era}</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* BET INFO */}
                <div className="px-4 py-4 border-b border-[#3d4f5f]">
                    <div className="text-[10px] font-extrabold text-[#00D4FF] mb-3 uppercase tracking-widest">Bet Details</div>
                    
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        {/* Bet / Line */}
                        <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3">
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Selection</div>
                            <div className="text-[13px] font-extrabold text-white uppercase leading-tight" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                {bet.selection} {lineStr}
                            </div>
                        </div>

                        {/* Bet Type */}
                        <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3">
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Market</div>
                            <div className="text-[13px] font-extrabold text-slate-300 uppercase leading-tight" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                {bet.bet_type?.replace(/_/g, ' ') || '—'}
                            </div>
                        </div>
                    </div>

                    {/* Odds + Book */}
                    {(bet.best_price || bet.best_book) && (
                        <div className="bg-[#1a2332] border-2 border-[#3d4f5f] rounded-lg p-3 flex justify-between items-center">
                            <div>
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Best Odds</div>
                                <div className="text-[22px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 8px rgba(255,255,255,0.15)' }}>
                                    {formatOdds(bet.best_price)}
                                </div>
                            </div>
                            {bet.best_book && (
                                <div className="text-right">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Book</div>
                                    <div className="text-[13px] font-extrabold text-[#00D4FF] uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{bet.best_book}</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* METRICS GRID */}
                <div className="px-4 py-4 border-b border-[#3d4f5f]">
                    <div className="text-[10px] font-extrabold text-[#00D4FF] mb-3 uppercase tracking-widest">Key Metrics</div>
                    
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        {/* Bet Score */}
                        <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Score</div>
                            <div className="text-[22px] font-extrabold" style={{ fontFamily: '"Rajdhani", sans-serif', color: tierColor, textShadow: `0 0 8px ${tierGlow}` }}>
                                {bet.bet_score ?? '—'}
                            </div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest">/100</div>
                        </div>

                        {/* Win Probability */}
                        <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Win Prob</div>
                            <div className="text-[18px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                {formatWinPct(bet.win_confidence)}
                            </div>
                        </div>

                        {/* EV% */}
                        {bet.ev_pct !== null && bet.ev_pct !== undefined && (
                            <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">EV%</div>
                                <div className="text-[18px] font-extrabold" style={{ fontFamily: '"Rajdhani", sans-serif', color: Number(bet.ev_pct) > 0 ? '#00D4FF' : '#FF6B6B', textShadow: Number(bet.ev_pct) > 0 ? '0 0 6px rgba(0,212,255,0.4)' : 'none' }}>
                                    {Number(bet.ev_pct) > 0 ? '+' : ''}{Number(bet.ev_pct).toFixed(1)}%
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Second row: edge, kelly, etc. */}
                    <div className="grid grid-cols-3 gap-2">
                        {bet.edge !== null && bet.edge !== undefined && (
                            <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Edge</div>
                                <div className="text-[15px] font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    {Number(bet.edge) > 0 ? '+' : ''}{Number(bet.edge).toFixed(1)}pts
                                </div>
                            </div>
                        )}
                        {bet.ev_kelly !== null && bet.ev_kelly !== undefined && (
                            <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Stake</div>
                                <div className="text-[15px] font-extrabold text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    {Number(bet.ev_kelly).toFixed(1)}u
                                </div>
                            </div>
                        )}
                        {bet.rank !== null && bet.rank !== undefined && (
                            <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Rank</div>
                                <div className="text-[15px] font-extrabold text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    #{bet.rank}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Market probs */}
                    {(bet.market_novig_prob !== null && bet.market_novig_prob !== undefined) && (
                        <div className="mt-3 bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3">
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Market No-Vig Prob</div>
                                    <div className="text-[14px] font-extrabold text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                        {(Number(bet.market_novig_prob) * 100).toFixed(1)}%
                                    </div>
                                </div>
                                {bet.implied_prob_novig !== null && bet.implied_prob_novig !== undefined && (
                                    <div className="text-right">
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Model Prob</div>
                                        <div className="text-[14px] font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                            {(Number(bet.implied_prob_novig) * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ANALYSIS / SCORE FACTORS */}
                {bet.score_factors && bet.score_factors.length > 0 && (
                    <div className="px-4 py-4 border-b border-[#3d4f5f]">
                        <div className="text-[10px] font-extrabold text-[#00D4FF] mb-3 uppercase tracking-widest">
                            {bet.score_verdict || 'Analysis'}
                        </div>
                        <div className="flex flex-col gap-2">
                            {bet.score_factors.map((factor: any, i: number) => (
                                <div key={i} className="flex gap-3 items-start bg-[#0d1117] p-3 rounded-lg border border-[#2a3a4a]">
                                    <div className="mt-0.5 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md border border-[#3d4f5f] bg-[#1a2332]">
                                        {factor.dir === 'up' && <TrendingUp size={12} className="text-[#00D4FF]" />}
                                        {factor.dir === 'down' && <TrendingDown size={12} className="text-[#FF00FF]" />}
                                        {factor.dir === 'info' && <Info size={12} className="text-slate-400" />}
                                    </div>
                                    <div className="text-[12px] text-slate-300 leading-relaxed font-bold tracking-wide flex-1">
                                        {factor.text}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Pitcher full stats if available */}
                {isPitcherProp && (
                    <div className="px-4 py-4 border-b border-[#3d4f5f]">
                        <div className="text-[10px] font-extrabold text-[#FF00FF] mb-3 uppercase tracking-widest flex items-center gap-2">
                            <Zap size={12} /> Pitcher Profile
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {era !== null && (
                                <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">ERA</div>
                                    <div className="text-[18px] font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 6px rgba(0,212,255,0.4)' }}>{era}</div>
                                </div>
                            )}
                            {wins !== null && losses !== null && (
                                <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">W – L</div>
                                    <div className="text-[18px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{wins} – {losses}</div>
                                </div>
                            )}
                            {bet.pitcher_fip !== null && bet.pitcher_fip !== undefined && (
                                <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">FIP</div>
                                    <div className="text-[18px] font-extrabold text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{Number(bet.pitcher_fip).toFixed(2)}</div>
                                </div>
                            )}
                            {bet.pitcher_siera !== null && bet.pitcher_siera !== undefined && (
                                <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">SIERA</div>
                                    <div className="text-[18px] font-extrabold text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{Number(bet.pitcher_siera).toFixed(2)}</div>
                                </div>
                            )}
                            {bet.pitcher_so !== null && bet.pitcher_so !== undefined && (
                                <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-lg p-3 text-center">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Season K's</div>
                                    <div className="text-[18px] font-extrabold text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{bet.pitcher_so}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Disclaimer */}
                <div className="px-4 py-5 mt-auto">
                    <div className="text-[10px] text-slate-500 text-center leading-relaxed font-bold tracking-wide">
                        <strong className="text-[#00D4FF]">Analysis Only — Not Betting Advice.</strong>
                        <br />Bet Score ranks value (EV + confidence). Not a guarantee. Bet responsibly.
                    </div>
                </div>
            </div>
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
// Compact Bet Card (always clickable to open modal)
// ──────────────────────────────────────────────────────────────────────────────
const BetCard = ({ bet, rank, onClick }: { bet: any; rank: number; onClick: () => void }) => {
    const formatOddsLocal = (o: any) => {
        if (!o) return '';
        const num = Number(o);
        if (isNaN(num)) return String(o);
        return num > 0 ? `+${num}` : `${num}`;
    };

    const isElite = bet.bet_tier === 'ELITE';
    const isStrong = bet.bet_tier === 'STRONG';
    const tierColor = isElite ? '#FF00FF' : isStrong ? '#00D4FF' : '#FFD700';
    const tierGlow = isElite ? '0 0 10px rgba(255,0,255,0.3)' : isStrong ? '0 0 10px rgba(0,212,255,0.3)' : '0 0 10px rgba(255,215,0,0.3)';

    let lineStr = '';
    if (bet.line !== null && bet.line !== undefined) {
        const numLine = Number(bet.line);
        const type = (bet.bet_type || '').toLowerCase();
        const isSpread = type === 'run_line' || type === 'runline' || type === 'spread';
        lineStr = isSpread && numLine > 0 ? `+${numLine}` : `${numLine}`;
    }

    const { isTeamBet, isPitcherProp } = detectBetCategory(bet);
    const playerImageUrl = getPlayerImageUrl(bet.player_id);
    const teamId = bet.team_id || (bet.team ? MLB_TEAM_IDS[bet.team?.toUpperCase()] : null);
    const teamLogoUrl = getTeamLogoUrl(teamId);
    const [imgError, setImgError] = useState(false);

    return (
        <div
            className="relative bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-[#00D4FF] hover:shadow-[0_4px_25px_rgba(0,212,255,0.1)] active:scale-[0.98] cursor-pointer touch-manipulation group"
            onClick={() => {
                onClick();
                if (navigator.vibrate) try { navigator.vibrate(10); } catch(e) {}
            }}
        >
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: tierColor, boxShadow: tierGlow }} />

            <div className="pl-4 pr-4 py-3 flex items-center gap-3">
                {/* Rank */}
                <div className="text-[11px] font-extrabold text-slate-500 w-4 text-center flex-shrink-0" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                    {rank}
                </div>

                {/* Player/Team Thumbnail */}
                <div className="flex-shrink-0">
                    {isTeamBet && teamLogoUrl ? (
                        <div className="w-10 h-10 flex items-center justify-center bg-[#1a2332] rounded-lg border border-[#3d4f5f] p-1.5">
                            <img src={teamLogoUrl} alt={bet.team || 'MLB'} className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                    ) : !isTeamBet && playerImageUrl && !imgError ? (
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 bg-[#1a2332]" style={{ borderColor: tierColor }}>
                            <img src={playerImageUrl} alt={bet.selection} className="w-full h-full object-cover object-top" onError={() => setImgError(true)} />
                        </div>
                    ) : (
                        <div className="w-10 h-10 flex items-center justify-center bg-[#1a2332] rounded-full border-2" style={{ borderColor: tierColor }}>
                            <Target size={16} style={{ color: tierColor }} />
                        </div>
                    )}
                </div>

                {/* Main Info */}
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-slate-400 mb-0.5 tracking-widest uppercase truncate">{bet.matchup}</div>
                    <div className="text-[14px] font-extrabold text-white leading-tight uppercase tracking-wide truncate" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                        {bet.selection} {lineStr}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span 
                            className="px-1.5 py-0.5 rounded-sm text-[8px] font-extrabold tracking-widest uppercase"
                            style={{ background: `${tierColor}22`, color: tierColor, border: `1px solid ${tierColor}55` }}
                        >
                            {bet.bet_tier}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                            {formatWinPct(bet.win_confidence)} win
                        </span>
                        {bet.ev_pct !== null && bet.ev_pct !== undefined && (
                            <span className="text-[10px] font-extrabold" style={{ color: Number(bet.ev_pct) > 0 ? '#00D4FF' : '#FF6B6B' }}>
                                {Number(bet.ev_pct) > 0 ? '+' : ''}{Number(bet.ev_pct).toFixed(1)}% EV
                            </span>
                        )}
                        {isPitcherProp && bet.pitcher_era != null && (
                            <span className="text-[10px] font-bold text-[#FF00FF]">
                                ERA {Number(bet.pitcher_era).toFixed(2)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Right: Score + Odds + Arrow */}
                <div className="flex-shrink-0 text-right flex flex-col items-end gap-1">
                    <div className="text-[18px] font-extrabold" style={{ fontFamily: '"Rajdhani", sans-serif', color: tierColor, textShadow: `0 0 6px ${tierColor}66` }}>
                        {bet.bet_score}
                    </div>
                    <div className="text-[12px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                        {formatOddsLocal(bet.best_price)}
                    </div>
                    <div className="text-slate-600 group-hover:text-[#00D4FF] transition-colors">
                        <ChevronRight size={16} />
                    </div>
                </div>
            </div>

            {/* Bottom book tag */}
            {bet.best_book && (
                <div className="px-4 pb-2 -mt-1">
                    <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">{bet.best_book}</span>
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
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
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
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF00FF]/50 shadow-[0_0_20px_rgba(255,0,255,0.15)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20" />
                        <Activity className="w-12 h-12 text-[#FF00FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF00FF] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load data. Please try again later.</p>
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

    const filteredBets = bets.filter((b: any) => {
        if (filter === 'ALL') return true;
        const type = b.bet_type?.toLowerCase() || '';
        if (filter === 'ML' && (type === 'moneyline' || type === 'ml')) return true;
        if (filter === 'TOTAL' && type === 'total') return true;
        if (filter === 'RUN LINE' && (type === 'run_line' || type === 'runline' || type === 'spread')) return true;
        if (filter === 'PROPS' && (type.includes('prop') || type.includes('hits') || type.includes('bases') || type.includes('runs') || type.includes('pitcher') || type.includes('strikeout'))) return true;
        return false;
    });

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            <SEOHead
                title="Best Bets | MLB Analytics"
                description="Daily MLB Betting Edges Surfaced By AI Models."
                noIndex={true}
            />

            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            {/* Page Header */}
            <div className="bg-gradient-to-b from-[#0d1117] to-[#1a2332] border-b-[3px] border-[#3d4f5f] p-4 flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div>
                    <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-[#00D4FF] text-[10px] font-extrabold no-underline tracking-widest uppercase hover:text-white transition-colors">
                        <ArrowLeft size={14} /> DASHBOARD
                    </Link>
                    <h1 className="m-0 mt-2 mb-0.5 text-2xl md:text-3xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>
                        Best <span className="text-[#00D4FF]" style={{ textShadow: '0 0 10px rgba(0,212,255,0.4)' }}>Bets</span>
                    </h1>
                    <p className="m-0 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                        Ranked By Bet Score • {officialDate || todayStr || 'Loading...'}
                    </p>
                </div>
                <div className="text-right bg-[#0a0a15] p-2 rounded-sm border border-[#3d4f5f] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                    <div className="text-[#00D4FF] text-[11px] font-extrabold tracking-widest uppercase" style={{ textShadow: '0 0 5px rgba(0,212,255,0.3)' }}>MLB EDGE</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest border-t border-[#3d4f5f] pt-1">SCORE 0–100</div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Value + Confidence</div>
                </div>
            </div>

            <div className="p-4 w-full max-w-2xl mx-auto box-border relative">
                {/* Background Glows */}
                <div className="absolute top-10 left-10 w-64 h-64 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[100px] opacity-[0.03] pointer-events-none" />
                <div className="absolute bottom-10 right-10 w-64 h-64 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[100px] opacity-[0.02] pointer-events-none" />

                {/* Stale Warning */}
                {isStale && !isLoading && (
                    <div className="bg-[#1a2332] border-[3px] border-[#FFD700]/50 rounded-xl p-4 mb-5 shadow-[0_0_15px_rgba(255,215,0,0.1)] relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-[#FFD700]" />
                        <div className="text-[#FFD700] text-[13px] font-extrabold tracking-widest mb-1 flex items-center gap-2 uppercase">
                            <CalendarX size={16} /> STALE SLATE — NOT ACTIONABLE
                        </div>
                        <div className="text-slate-300 text-xs font-bold leading-snug tracking-wide">
                            These Picks Are From {officialDate || 'A Previous Date'}, Not Today ({todayStr}).
                        </div>
                    </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-3 mb-5">
                    {[
                        { label: 'BETS', value: isLoading && !data ? null : stats.totalBets, color: 'text-white' },
                        { label: 'ELITE', value: isLoading && !data ? null : stats.eliteBets, color: 'text-[#FF00FF]', glow: 'drop-shadow-[0_0_5px_rgba(255,0,255,0.5)]' },
                        { label: 'TOP SCORE', value: isLoading && !data ? null : (stats.topScore ? (Number(stats.topScore) % 1 !== 0 ? Number(stats.topScore).toFixed(1) : stats.topScore) : 0), color: 'text-[#00D4FF]', glow: 'drop-shadow-[0_0_5px_rgba(0,212,255,0.5)]' },
                        { label: 'TOP LOCK', value: isLoading && !data ? null : `${(Number(stats.topLock) || 0).toFixed(0)}%`, color: 'text-slate-300' },
                    ].map(({ label, value, color, glow }) => (
                        <div key={label} className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-3 px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                            <div className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">{label}</div>
                            {value === null ? (
                                <Loader2 className="w-5 h-5 animate-spin mx-auto mt-2 text-[#00D4FF]" />
                            ) : (
                                <div className={`text-xl font-extrabold mt-1 ${color} ${glow || ''}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>{value}</div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-3 mb-4" style={{ WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                    <style dangerouslySetInnerHTML={{ __html: `div::-webkit-scrollbar { display: none; }` }} />
                    {['ALL', 'ML', 'TOTAL', 'RUN LINE', 'PROPS'].map(f => (
                        <button
                            key={f}
                            onClick={() => {
                                setFilter(f);
                                if (navigator.vibrate) try { navigator.vibrate(15); } catch(e) {}
                            }}
                            className={`px-5 py-2 rounded-sm border-[2px] text-[10px] font-extrabold tracking-widest whitespace-nowrap cursor-pointer touch-manipulation transition-all uppercase ${
                                filter === f
                                    ? 'bg-[#1a2332] text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                                    : 'bg-[#0d1117] text-slate-400 border-[#3d4f5f] hover:border-[#5a6a7a] hover:text-slate-300'
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* Bet List */}
                {isLoading && !data ? (
                    <div className="text-center py-20 bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                        <Loader2 className="w-10 h-10 animate-spin text-[#00D4FF] mx-auto mb-4" />
                        <div className="text-[13px] font-extrabold text-[#00D4FF] tracking-widest uppercase animate-pulse">SCANNING DATABASE...</div>
                    </div>
                ) : isStale || filteredBets.length === 0 ? (
                    <div className="text-center py-16 px-5 bg-[#0d1117] border-[3px] border-dashed border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                        <div className="mb-4 text-[#3d4f5f] flex justify-center">
                            {isStale || (filteredBets.length === 0 && filter === 'ALL') ? <CalendarX size={48} /> : <SearchX size={48} />}
                        </div>
                        <div className="text-[15px] font-extrabold text-white mb-2 uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            {isStale || (filteredBets.length === 0 && filter === 'ALL') ? 'No Qualifying Bets For Today.' : 'No Bets Found For This Filter.'}
                        </div>
                        <div className="text-[11px] font-bold tracking-wide text-slate-400 leading-relaxed uppercase">
                            {isStale || (filteredBets.length === 0 && filter === 'ALL') ? 'Model Is Respecting The Market.' : 'Try Selecting A Different Bet Type.'}
                            <br />Edges Surface When The Model Sees Meaningful Divergence From The Closing Line.
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {filteredBets.map((bet: any, idx: number) => (
                            <BetCard
                                key={`${bet.game_pk}-${bet.selection}-${idx}`}
                                bet={bet}
                                rank={idx + 1}
                                onClick={() => openModal(bet)}
                            />
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div className="mt-8 mb-4 p-4 bg-[#1a2332] border border-[#3d4f5f] rounded-sm text-[10px] font-bold tracking-wide text-slate-400 text-center leading-relaxed shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                    <strong className="text-[#00D4FF]">Analysis Only — Not Betting Advice.</strong>
                    <br />
                    <span className="uppercase text-slate-300">Bet Score (0–100)</span> Ranks VALUE (Expected Return + Confidence).
                    <br />
                    <span className="uppercase text-slate-300">Top Lock</span> = Most Likely To Win Regardless Of Price.
                    <br />
                    <span className="uppercase text-slate-300">EV%</span> = Expected Return Per $1. Stake = ¼-Kelly. An Edge Is No Guarantee.
                </div>
            </div>

            <BottomNavBar />

            {/* Fullscreen Modal */}
            {selectedBet && <BetDetailModal bet={selectedBet} onClose={closeModal} />}
        </div>
    );
}
