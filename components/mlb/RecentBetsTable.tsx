import React, { useState, useMemo } from 'react';

// Format currency helper
const formatCurrency = (val: number, showSign = false) => {
    if (val === undefined || val === null || isNaN(val)) return '$0.00';
    const absVal = Math.abs(val);
    const formatted = absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (showSign) {
        return val > 0 ? `+$${formatted}` : val < 0 ? `-$${formatted}` : `$${formatted}`;
    }
    return `$${formatted}`;
};

// The DB stores raw 'h2h' / 'total' and machine selections like 'over_8.5' / 'away'.
const marketLabel = (m: string) => (m === 'h2h' ? 'Moneyline' : m === 'total' ? 'Totals' : (m || '—'));

const prettySelection = (s: string) => {
    if (!s) return '—';
    const ou = s.match(/^(over|under)[_\s-]?([0-9.]+)$/i);
    if (ou) return `${ou[1].charAt(0).toUpperCase()}${ou[1].slice(1).toLowerCase()} ${ou[2]}`;
    const lower = s.toLowerCase();
    if (lower === 'home') return 'Home';
    if (lower === 'away') return 'Away';
    return s;
};

// Canonical five-tier palette — identical to src/lib/betScore.ts TIER_STYLE and best-bets.
const tierColor = (tier: string) => {
    switch ((tier || '').toUpperCase()) {
        case 'ELITE': return { color: '#00D4FF', bg: 'rgba(0,212,255,0.12)', border: 'rgba(0,212,255,0.4)' };
        case 'STRONG': return { color: '#34D399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.4)' };
        case 'LEAN': return { color: '#38BDF8', bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.4)' };
        case 'THIN': return { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.4)' };
        default: return { color: '#64748B', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.3)' };
    }
};

export interface SimBet {
    id?: string;
    as_of_ts: string;
    pnl: number;
    result: string;
    stake: number;
    bankroll_after: number;
    market: string;
    selection: string;
    edge_pts: number;
    bet_score?: number | null;
    bet_tier?: string | null;
    game_pk?: number | null;
}

interface RecentBetsTableProps {
    bets: SimBet[];
    isLoading?: boolean;
}

type SortField = 'date' | 'market' | 'selection' | 'score' | 'stake' | 'result' | 'pnl' | 'bankroll';
type SortDirection = 'asc' | 'desc';

export const RecentBetsTable: React.FC<RecentBetsTableProps> = ({ bets, isLoading = false }) => {
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc'); // Default to desc for new field
        }
        setCurrentPage(1); // Reset to first page on sort
    };

    const sortedBets = useMemo(() => {
        return [...(bets || [])].sort((a, b) => {
            let aValue: any;
            let bValue: any;

            switch (sortField) {
                case 'date':
                    aValue = new Date(a.as_of_ts || 0).getTime();
                    bValue = new Date(b.as_of_ts || 0).getTime();
                    break;
                case 'market':
                    aValue = (a.market || '').toLowerCase();
                    bValue = (b.market || '').toLowerCase();
                    break;
                case 'selection':
                    aValue = (a.selection || '').toLowerCase();
                    bValue = (b.selection || '').toLowerCase();
                    break;
                case 'score':
                    aValue = a.bet_score ?? -1;
                    bValue = b.bet_score ?? -1;
                    break;
                case 'stake':
                    aValue = a.stake || 0;
                    bValue = b.stake || 0;
                    break;
                case 'result':
                    aValue = (a.result || '').toLowerCase();
                    bValue = (b.result || '').toLowerCase();
                    break;
                case 'pnl':
                    aValue = a.pnl || 0;
                    bValue = b.pnl || 0;
                    break;
                case 'bankroll':
                    aValue = a.bankroll_after || 0;
                    bValue = b.bankroll_after || 0;
                    break;
                default:
                    aValue = 0;
                    bValue = 0;
            }

            if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [bets, sortField, sortDirection]);

    const totalPages = Math.ceil(sortedBets.length / rowsPerPage);
    const paginatedBets = sortedBets.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span className="opacity-30 ml-1" aria-hidden="true">↕</span>;
        return <span className="ml-1 text-[#00D4FF]" aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
    };

    const Th = ({ field, label, align = 'left' }: { field: SortField, label: string, align?: 'left' | 'right' | 'center' }) => (
        <th
            scope="col"
            aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
            className={`py-3 px-4 font-semibold whitespace-nowrap text-${align}`}
        >
            <button
                type="button"
                onClick={() => handleSort(field)}
                className={`flex items-center w-full select-none cursor-pointer bg-transparent border-0 text-inherit font-inherit uppercase tracking-widest ${align === 'right' ? 'justify-end' : (align === 'center' ? 'justify-center' : 'justify-start')}`}
                aria-label={`Sort by ${label}`}
            >
                {label} <SortIcon field={field} />
            </button>
        </th>
    );

    return (
        <div className="w-full relative">
            <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl overflow-x-auto pb-0 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] w-full relative z-10">
                <table className="w-full md:min-w-[760px] border-collapse text-left text-[13px] block md:table">
                    <thead className="hidden md:table-header-group">
                        <tr className="border-b-[2px] border-[#3d4f5f] text-[#8b9bb4] bg-[#1a2332] uppercase tracking-widest text-[11px]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            <Th field="date" label="Date" />
                            <Th field="market" label="Market" />
                            <Th field="selection" label="Selection" />
                            <Th field="score" label="Score" />
                            <Th field="stake" label="Stake" />
                            <Th field="result" label="Result" />
                            <Th field="pnl" label="P&L" />
                            <Th field="bankroll" label="Bankroll" align="right" />
                        </tr>
                    </thead>
                    <tbody className="block md:table-row-group">
                        {isLoading ? (
                            Array.from({ length: 10 }).map((_, i) => (
                                <tr key={`skeleton-${i}`} className={`block md:table-row border-b border-[#2a3a4a] animate-pulse ${i < 9 ? 'mb-2 md:mb-0 pb-2 md:pb-0' : ''}`}>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 border-b border-white/5 md:border-0"><span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Date</span><div className="h-4 bg-slate-800 rounded w-16"></div></td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 border-b border-white/5 md:border-0"><span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Market</span><div className="h-4 bg-slate-800 rounded w-20"></div></td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 border-b border-white/5 md:border-0"><span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Selection</span><div className="h-4 bg-slate-800 rounded w-32"></div></td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 border-b border-white/5 md:border-0"><span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Score</span><div className="h-4 bg-slate-800 rounded w-16"></div></td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 border-b border-white/5 md:border-0"><span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Stake</span><div className="h-4 bg-slate-800 rounded w-12"></div></td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 border-b border-white/5 md:border-0"><span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Result</span><div className="h-4 bg-slate-800 rounded w-16"></div></td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 border-b border-white/5 md:border-0"><span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">P&L</span><div className="h-4 bg-slate-800 rounded w-20"></div></td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 md:border-0"><span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Bankroll</span><div className="h-4 bg-slate-800 rounded w-20"></div></td>
                                </tr>
                            ))
                        ) : paginatedBets.length > 0 ? paginatedBets.map((bet, i) => {
                            const dateObj = bet.as_of_ts ? new Date(bet.as_of_ts) : null;
                            const dateStr = dateObj && !isNaN(dateObj.getTime())
                                ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
                                : '—';

                            const pnl = bet.pnl || 0;
                            const isWin = pnl > 0 || bet.result === 'WIN';
                            const isLoss = pnl < 0 || bet.result === 'LOSS';
                            const tc = tierColor(bet.bet_tier || '');
                            const edge = Number(bet.edge_pts || 0);
                            const edgeStr = `${edge >= 0 ? '+' : ''}${edge.toFixed(2)} edge pts`;

                            return (
                                <tr key={bet.id || i} className={`block md:table-row border-b border-[#2a3a4a] ${i < paginatedBets.length - 1 ? 'mb-4 md:mb-0 pb-2 md:pb-0' : ''} hover:bg-[#1a2332]/50 transition-colors`}>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 text-slate-500 whitespace-nowrap border-b border-white/5 md:border-0 bg-white/[0.02] md:bg-transparent rounded-t-md md:rounded-none">
                                        <span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Date</span>
                                        <span className="text-right md:text-left">{dateStr}</span>
                                    </td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 whitespace-nowrap border-b border-white/5 md:border-0">
                                        <span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Market</span>
                                        <span className="bg-white/5 py-1 px-2 rounded text-slate-300 text-[11px] font-bold tracking-[0.02em] text-right md:text-left">
                                            {marketLabel(bet.market)}
                                        </span>
                                    </td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 text-slate-50 whitespace-nowrap border-b border-white/5 md:border-0">
                                        <span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Selection</span>
                                        <span className="text-right md:text-left capitalize">{prettySelection(bet.selection)}</span>
                                    </td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 whitespace-nowrap border-b border-white/5 md:border-0" title={edgeStr}>
                                        <span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Score</span>
                                        {bet.bet_score != null ? (
                                            <span
                                                className="inline-flex items-center gap-1.5"
                                                aria-label={`Bet score ${bet.bet_score}${bet.bet_tier ? `, ${bet.bet_tier} tier` : ''}`}
                                            >
                                                <span className="font-extrabold" style={{ color: tc.color }}>{bet.bet_score}</span>
                                                {bet.bet_tier && (
                                                    <span className="py-0.5 px-1.5 rounded text-[9px] font-extrabold tracking-wide" style={{ color: tc.color, background: tc.bg, border: `1px solid ${tc.border}` }}>
                                                        {bet.bet_tier}
                                                    </span>
                                                )}
                                            </span>
                                        ) : (
                                            <span className="text-[#00D4FF] font-semibold">{edge >= 0 ? '+' : ''}{edge.toFixed(2)}</span>
                                        )}
                                    </td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 text-slate-400 whitespace-nowrap border-b border-white/5 md:border-0">
                                        <span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Stake</span>
                                        <span className="text-right md:text-left">${(bet.stake || 0).toFixed(2)}</span>
                                    </td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 whitespace-nowrap border-b border-white/5 md:border-0">
                                        <span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">Result</span>
                                        <span className={`py-1 px-2 rounded text-[10px] font-extrabold tracking-wide text-right md:text-left ${isWin ? 'bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30' : isLoss ? 'bg-[#FF0055]/10 text-[#FF0055] border border-[#FF0055]/30' : 'bg-white/5 text-[#8b9bb4] border border-white/10'}`}>
                                            {bet.result || (isWin ? 'WIN' : (isLoss ? 'LOSS' : 'PUSH'))}
                                        </span>
                                    </td>
                                    <td className={`flex justify-between items-center py-2 px-4 md:table-cell md:py-3 font-semibold whitespace-nowrap border-b border-white/5 md:border-0 ${pnl > 0 ? 'text-[#00D4FF]' : (pnl < 0 ? 'text-[#FF0055]' : 'text-[#8b9bb4]')}`}>
                                        <span className="md:hidden font-bold text-slate-400 text-[10px] uppercase tracking-wider">P&L</span>
                                        <span className="text-right md:text-left">{formatCurrency(pnl, true)}</span>
                                    </td>
                                    <td className="flex justify-between items-center py-2 px-4 md:table-cell md:py-3 font-semibold text-slate-400 whitespace-nowrap md:text-right bg-[#00D4FF]/5 md:bg-transparent rounded-b-md md:rounded-none">
                                        <span className="md:hidden font-bold text-[#00D4FF] text-[10px] uppercase tracking-wider">Bankroll</span>
                                        <span className="text-right">{formatCurrency(bet.bankroll_after || 0)}</span>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr className="block md:table-row"><td colSpan={8} className="p-6 text-center text-slate-400 block md:table-cell">No data available</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4 px-1">
                    <div className="text-xs text-slate-500">
                        Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, sortedBets.length)} of {sortedBets.length}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className={`py-1.5 px-3 rounded-md text-xs transition-all duration-200 border ${currentPage === 1 ? 'bg-white/2 border-white/10 text-slate-600 cursor-not-allowed' : 'bg-white/5 border-white/10 text-slate-200 cursor-pointer hover:bg-white/10'}`}
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className={`py-1.5 px-3 rounded-md text-xs transition-all duration-200 border ${currentPage === totalPages ? 'bg-white/2 border-white/10 text-slate-600 cursor-not-allowed' : 'bg-white/5 border-white/10 text-slate-200 cursor-pointer hover:bg-white/10'}`}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecentBetsTable;
