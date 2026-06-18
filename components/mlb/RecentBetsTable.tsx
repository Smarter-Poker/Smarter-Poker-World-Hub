import React, { useState, useMemo } from 'react';

// Format currency helper
const formatCurrency = (val: number, showSign = false) => {
    if (val === undefined || val === null) return '$0.00';
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    const formatted = absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (showSign) {
        return val > 0 ? `+$${formatted}` : val < 0 ? `-$${formatted}` : `$${formatted}`;
    }
    return `$${formatted}`;
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
}

interface RecentBetsTableProps {
    bets: SimBet[];
}

type SortField = 'date' | 'market' | 'selection' | 'edge' | 'stake' | 'result' | 'pnl' | 'bankroll';
type SortDirection = 'asc' | 'desc';

export const RecentBetsTable: React.FC<RecentBetsTableProps> = ({ bets }) => {
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
        // Reset to first page on sort
        setCurrentPage(1);
    };

    const sortedBets = useMemo(() => {
        if (!bets) return [];
        return [...bets].sort((a, b) => {
            let aValue: any;
            let bValue: any;

            switch (sortField) {
                case 'date':
                    aValue = new Date(a.as_of_ts || 0).getTime();
                    bValue = new Date(b.as_of_ts || 0).getTime();
                    break;
                case 'market':
                    aValue = a.market || '';
                    bValue = b.market || '';
                    break;
                case 'selection':
                    aValue = a.selection || '';
                    bValue = b.selection || '';
                    break;
                case 'edge':
                    aValue = a.edge_pts || 0;
                    bValue = b.edge_pts || 0;
                    break;
                case 'stake':
                    aValue = a.stake || 0;
                    bValue = b.stake || 0;
                    break;
                case 'result':
                    aValue = a.result || '';
                    bValue = b.result || '';
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
        if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
        return <span style={{ marginLeft: '4px', color: '#00D4FF' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>;
    };

    const Th = ({ field, label, align = 'left' }: { field: SortField, label: string, align?: 'left' | 'right' | 'center' }) => (
        <th 
            onClick={() => handleSort(field)}
            style={{ 
                padding: '12px 16px', 
                fontWeight: 600, 
                whiteSpace: 'nowrap', 
                cursor: 'pointer',
                textAlign: align,
                userSelect: 'none'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : (align === 'center' ? 'center' : 'flex-start') }}>
                {label} <SortIcon field={field} />
            </div>
        </th>
    );

    return (
        <div style={{ width: '100%' }}>
            <div style={{ background: '#0d1117', border: '1px solid #2a3a4a', borderRadius: '12px', overflowX: 'auto', paddingBottom: '0px', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)', width: '100%' }}>
                <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #2a3a4a', color: '#8b9bb4', backgroundColor: '#1a2332' }}>
                            <Th field="date" label="Date" />
                            <Th field="market" label="Market" />
                            <Th field="selection" label="Selection" />
                            <Th field="edge" label="Edge" />
                            <Th field="stake" label="Stake" />
                            <Th field="result" label="Result" />
                            <Th field="pnl" label="P&L" />
                            <Th field="bankroll" label="Bankroll" align="right" />
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedBets.length > 0 ? paginatedBets.map((bet, i) => {
                            const dateObj = bet.as_of_ts ? new Date(bet.as_of_ts) : new Date();
                            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
                            
                            const pnl = bet.pnl || 0;
                            const isWin = pnl > 0 || bet.result === 'WIN';
                            const isLoss = pnl < 0 || bet.result === 'LOSS';
                            
                            return (
                                <tr key={bet.id || i} style={{ borderBottom: i < paginatedBets.length - 1 ? '1px solid #2a3a4a' : 'none' }}>
                                    <td style={{ padding: '12px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                        {dateStr}
                                    </td>
                                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                        <span style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '4px 8px', borderRadius: '4px', color: '#94A3B8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.02em' }}>
                                            {bet.market || 'Moneyline'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#F8FAFC', whiteSpace: 'nowrap' }}>{bet.selection || '-'}</td>
                                    <td style={{ padding: '12px 16px', color: '#00D4FF', fontWeight: 600, whiteSpace: 'nowrap' }}>+{(bet.edge_pts || 0).toFixed(2)}</td>
                                    <td style={{ padding: '12px 16px', color: '#94A3B8', whiteSpace: 'nowrap' }}>${(bet.stake || 0).toFixed(2)}</td>
                                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                                        <span style={{ 
                                            background: isWin ? 'rgba(0, 212, 255, 0.1)' : (isLoss ? 'rgba(255, 0, 85, 0.1)' : 'rgba(255, 255, 255, 0.05)'), 
                                            color: isWin ? '#00D4FF' : (isLoss ? '#FF0055' : '#8b9bb4'),
                                            padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px'
                                        }}>
                                            {bet.result || (isWin ? 'WIN' : (isLoss ? 'LOSS' : 'PUSH'))}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontWeight: 600, color: pnl > 0 ? '#00D4FF' : (pnl < 0 ? '#FF0055' : '#8b9bb4'), whiteSpace: 'nowrap' }}>
                                        {formatCurrency(pnl, true)}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#94A3B8', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {formatCurrency(bet.bankroll_after || 0)}
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>No data available</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 4px' }}>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                        Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, sortedBets.length)} of {sortedBets.length}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            style={{ 
                                padding: '6px 12px', 
                                background: currentPage === 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)', 
                                border: '1px solid rgba(255,255,255,0.1)', 
                                borderRadius: '6px', 
                                color: currentPage === 1 ? '#475569' : '#E2E8F0', 
                                fontSize: '12px', 
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Previous
                        </button>
                        <button 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            style={{ 
                                padding: '6px 12px', 
                                background: currentPage === totalPages ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)', 
                                border: '1px solid rgba(255,255,255,0.1)', 
                                borderRadius: '6px', 
                                color: currentPage === totalPages ? '#475569' : '#E2E8F0', 
                                fontSize: '12px', 
                                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s'
                            }}
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
