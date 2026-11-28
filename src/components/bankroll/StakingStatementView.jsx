/**
 * STAKING STATEMENT VIEW
 * The backer's read-only statement, rendered by /staking/statement/[token].
 * It shows only what fn_staking_statement returns (src/lib/bankroll/stakingStatement.mjs).
 */
import Head from 'next/head';
import { formatCurrency, formatCurrencyWithSign } from '../../lib/bankroll/currencyUtils';
import { CATEGORY_NAMES } from '../../lib/bankroll/ledgerReport.mjs';
import { parseLedgerDay } from '../../lib/bankroll/localDates.mjs';
import { statementTotals } from '../../lib/bankroll/stakingStatement.mjs';

// Every amount is a stored US dollar figure, shown in US dollars (the
// statement has no Display EUR: a backer is not signed in).
const usd = (dollars) => formatCurrency(dollars, false, { cents: true });
const usdSigned = (dollars) => formatCurrencyWithSign(dollars, false, { cents: true });
const dayText = (day) => parseLedgerDay(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const gameText = (category) => CATEGORY_NAMES[category] || 'Session';
const tone = (cents) => (cents > 0 ? '#4ade80' : cents < 0 ? '#f87171' : '#e7ebf2');

export default function StakingStatementView({ status, rows = [] }) {
    const totals = statementTotals(rows);
    const found = status === 'found' && totals.sessions > 0;
    return (
        <main style={styles.page}>
            <Head>
                <title>Staking Statement | Smarter.Poker</title>
                <meta name="robots" content="noindex, nofollow" />
                <meta name="referrer" content="no-referrer" />
                <meta name="description" content="A read-only staking statement shared from the Smarter.Poker Bankroll Manager." />
            </Head>
            <div style={styles.card}>
                <p style={styles.kicker}>Smarter.Poker Bankroll Manager</p>
                <h1 style={styles.title}>Staking Statement</h1>
                {found && (
                    <>
                        <p style={styles.sub}>
                            Read-Only. Shared With You By The Player. Amounts Are In US Dollars (USD), As Of The Last Update By The Player.
                        </p>
                        <dl style={styles.totals} data-testid="statement-totals">
                            <div style={styles.total}><dt style={styles.totalLabel}>Sessions</dt><dd style={styles.totalValue}>{totals.sessions}</dd></div>
                            <div style={styles.total}><dt style={styles.totalLabel}>Result (USD)</dt><dd style={{ ...styles.totalValue, color: tone(totals.grossCents) }}>{usdSigned(totals.grossCents / 100)}</dd></div>
                            <div style={styles.total}><dt style={styles.totalLabel}>Player Share (USD)</dt><dd style={styles.totalValue}>{usdSigned(totals.playerCents / 100)}</dd></div>
                            <div style={styles.total}><dt style={styles.totalLabel}>Backer Share (USD)</dt><dd style={styles.totalValue}>{usdSigned(totals.backerCents / 100)}</dd></div>
                            <div style={{ ...styles.total, gridColumn: '1 / -1' }}><dt style={styles.totalLabel}>Current Makeup (USD)</dt><dd style={styles.totalValue}>{usd(totals.makeupCents / 100)}</dd></div>
                        </dl>
                        <p style={styles.period}>{dayText(totals.firstDay)} To {dayText(totals.lastDay)}</p>
                        <ol style={styles.list} data-testid="statement-rows">
                            {rows.map((row, index) => {
                                const gross = Math.round(row.gross_result * 100);
                                return (
                                    <li key={`${row.entry_date}-${index}`} style={styles.row}>
                                        <div style={styles.rowTop}>
                                            <span style={styles.rowDay}>{dayText(row.entry_date)}</span>
                                            <span style={styles.rowGame}>{gameText(row.category)}</span>
                                            <span style={{ ...styles.rowResult, color: tone(gross) }}>{usdSigned(row.gross_result)}</span>
                                        </div>
                                        <dl style={styles.rowGrid}>
                                            <div><dt style={styles.cellLabel}>Player</dt><dd style={styles.cell}>{usdSigned(row.player_share)}</dd></div>
                                            <div><dt style={styles.cellLabel}>Backer</dt><dd style={styles.cell}>{usdSigned(row.backer_share)}</dd></div>
                                            <div><dt style={styles.cellLabel}>Makeup</dt><dd style={styles.cell}>{usd(row.makeup_before)} {'->'} {usd(row.makeup_after)}</dd></div>
                                        </dl>
                                    </li>
                                );
                            })}
                        </ol>
                        <p style={styles.note}>
                            A Losing Session Adds To Makeup. A Winning Session Repays Makeup First, And Only The Profit Beyond It Is Split.
                        </p>
                    </>
                )}
                {status === 'empty' && (
                    <div style={styles.empty} data-testid="statement-empty">
                        <h2 style={styles.emptyTitle}>No Sessions Linked Yet</h2>
                        <p style={styles.emptyText}>
                            This Link Is Active. Sessions Appear Here As The Player Links Them To The Deal.
                        </p>
                    </div>
                )}
                {!found && status !== 'error' && status !== 'empty' && (
                    <div style={styles.empty} data-testid="statement-unavailable">
                        <h2 style={styles.emptyTitle}>This Link Has Expired Or Was Revoked</h2>
                        <p style={styles.emptyText}>
                            Ask The Player For A New Link.
                        </p>
                    </div>
                )}
                {status === 'error' && (
                    <div style={styles.empty} data-testid="statement-error">
                        <h2 style={styles.emptyTitle}>This Statement Could Not Be Loaded</h2>
                        <p style={styles.emptyText}>Reload The Page In A Moment.</p>
                    </div>
                )}
            </div>
        </main>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        background: '#04060b',
        color: '#e7ebf2',
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: '24px 16px 48px',
        boxSizing: 'border-box',
    },
    card: { maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 },
    kicker: { margin: 0, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#8bd7ff', fontWeight: 700 },
    title: { margin: 0, fontSize: 26, fontWeight: 800 },
    sub: { margin: 0, fontSize: 13, lineHeight: 1.5, color: '#a5b7cc' },
    totals: { margin: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
    total: { background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 10, padding: '10px 12px', minWidth: 0 },
    totalLabel: { fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
    totalValue: { margin: '4px 0 0', fontSize: 17, fontWeight: 700, overflowWrap: 'anywhere' },
    period: { margin: 0, fontSize: 12, color: '#94a3b8' },
    list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
    row: { background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 10, padding: '10px 12px' },
    rowTop: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
    rowDay: { fontSize: 14, fontWeight: 600 },
    rowGame: { fontSize: 12, color: '#94a3b8', flex: 1 },
    rowResult: { fontSize: 15, fontWeight: 700 },
    rowGrid: { margin: '8px 0 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1.6fr', gap: 6 },
    cellLabel: { fontSize: 12, color: '#94a3b8' },
    cell: { margin: 0, fontSize: 13, overflowWrap: 'anywhere' },
    note: { margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 },
    empty: { padding: '28px 16px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.04)', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.08)' },
    emptyTitle: { margin: '0 0 8px', fontSize: 18, fontWeight: 700 },
    emptyText: { margin: 0, fontSize: 13, color: '#a5b7cc', lineHeight: 1.5 },
};
