/**
 * VENUE INTELLIGENCE
 * ═══════════════════════════════════════════════════════════════
 * Career analytics derived from completed gigs — zero new DB queries
 * SmarterPoker Dark UI — matches TokeTracker pattern
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useMemo } from 'react';

const METAL = {
    base: '#1C1E21', mid: '#242526', elevated: '#3A3B3C', darkest: '#18191A',
    highlight: 'rgba(255,255,255,0.08)', primary: '#4A90D9', primaryDim: 'rgba(74,144,217,0.15)',
    success: '#36bb6a', warn: '#f59e0b', textPrimary: '#E4E6EB', textSecondary: '#B0B3B8',
};

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

const GAME_TYPE_MAP = {
    Holdem: "Hold'em", PLO: 'PLO', Mixed: 'Mixed',
    tournament: 'Tournament', brush: 'Brush', break: 'Break', other: 'Other',
};

const BUYIN_BRACKETS = [
    { label: '$1k+', min: 1000, max: Infinity },
    { label: '$500–$999', min: 500, max: 999.99 },
    { label: '$250–$499', min: 250, max: 499.99 },
    { label: '$100–$249', min: 100, max: 249.99 },
    { label: '<$100', min: 0, max: 99.99 },
];

// ── Helpers ──────────────────────────────────────────────────────

function computeGigStats(gig) {
    // Use gig.downs[] directly (attached by fetchGigs for analytics)
    const downs = gig.downs || [];
    let totalTokes = 0;
    let totalHours = 0;
    for (const down of downs) {
        totalTokes += down.toke_amount || 0;
        // Only count dealing downs for hours (not breaks — they inflate the denominator unfairly)
        const isDealing = down.down_type === 'cash' || down.down_type === 'tournament' || down.down_type === 'brush';
        if (isDealing && down.started_at && down.ended_at) {
            totalHours += (new Date(down.ended_at) - new Date(down.started_at)) / (1000 * 60 * 60);
        }
    }
    return { totalTokes, totalHours, downs };
}

// ── Main Component ───────────────────────────────────────────────

export default function VenueIntelligence({ gigs = [] }) {
    const [expanded, setExpanded] = useState(true);
    const [venueSort, setVenueSort] = useState('toke_hr');
    const [venueOpen, setVenueOpen] = useState(true);
    const [gameOpen, setGameOpen] = useState(true);
    const [tourneyOpen, setTourneyOpen] = useState(true);

    // ── Venue Performance Ranking ──────────────────────────────
    const venueRanking = useMemo(() => {
        const map = {};
        for (const gig of gigs) {
            const venue = gig.venue_name || 'Unknown Venue';
            if (!map[venue]) map[venue] = { venue, totalTokes: 0, totalHours: 0, events: 0 };
            const { totalTokes, totalHours } = computeGigStats(gig);
            map[venue].totalTokes += totalTokes;
            map[venue].totalHours += totalHours;
            map[venue].events += 1;
        }
        const arr = Object.values(map);
        for (const v of arr) v.tokePerHr = v.totalHours > 0 ? v.totalTokes / v.totalHours : 0;
        const sorted = {
            toke_hr: [...arr].sort((a, b) => b.tokePerHr - a.tokePerHr),
            total: [...arr].sort((a, b) => b.totalTokes - a.totalTokes),
            events: [...arr].sort((a, b) => b.events - a.events),
        };
        return sorted[venueSort];
    }, [gigs, venueSort]);

    // ── Game Type Profitability ────────────────────────────────
    const gameTypeStats = useMemo(() => {
        const map = {};
        for (const gig of gigs) {
            for (const down of gig.downs || []) {
                const gt = down.down_type === 'cash'
                    ? (down.game_type || 'Holdem')
                    : (down.down_type === 'tournament' ? 'tournament' : down.down_type);
                if (!map[gt]) map[gt] = { gameType: gt, totalTokes: 0, totalDowns: 0 };
                map[gt].totalTokes += down.toke_amount || 0;
                map[gt].totalDowns += 1;
            }
        }
        return Object.values(map)
            .map(gt => ({ ...gt, avgTokePerDown: gt.totalDowns > 0 ? gt.totalTokes / gt.totalDowns : 0 }))
            .sort((a, b) => b.avgTokePerDown - a.avgTokePerDown);
    }, [gigs]);

    // ── Tournament Buy-In Bracket Analysis ────────────────────
    const tournamentBrackets = useMemo(() => {
        const bracketMap = {};
        for (const b of BUYIN_BRACKETS) bracketMap[b.label] = { label: b.label, totalTokes: 0, totalDowns: 0 };

        let hasTourneyData = false;
        for (const gig of gigs) {
            for (const down of gig.downs || []) {  // use gig.downs directly
                if (down.down_type !== 'tournament') continue;
                hasTourneyData = true;
                const buyin = down.tournament_buyin;
                if (!buyin) continue;
                const bracket = BUYIN_BRACKETS.find(b => buyin >= b.min && buyin <= b.max);
                if (!bracket) continue;
                bracketMap[bracket.label].totalTokes += down.toke_amount || 0;
                bracketMap[bracket.label].totalDowns += 1;
            }
        }
        if (!hasTourneyData) return null;

        return BUYIN_BRACKETS
            .map(b => ({
                ...bracketMap[b.label],
                avgTokePerDown: bracketMap[b.label].totalDowns > 0
                    ? bracketMap[b.label].totalTokes / bracketMap[b.label].totalDowns
                    : 0,
            }))
            .filter(b => b.totalDowns > 0);
    }, [gigs]);

    const totalEvents = gigs.length;
    const totalTokesAllTime = useMemo(() =>
        gigs.reduce((sum, gig) => sum + computeGigStats(gig).totalTokes, 0), [gigs]
    );

    if (totalEvents === 0) return null;

    return (
        <div style={s.card}>
            {/* Header */}
            <button style={s.header} onClick={() => setExpanded(v => !v)}>
                <div style={s.headerLeft}>
                    <span style={s.headerIcon}></span>
                    <div>
                        <div style={s.headerTitle}>Career Intelligence</div>
                        <div style={s.headerSub}>{totalEvents} Events · ${totalTokesAllTime.toFixed(0)} Total Tokes</div>
                    </div>
                </div>
                <span style={{ ...s.chevron, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </button>

            {!expanded ? null : (
                <div style={s.body}>

                    {/* ── Venue Performance Ranking ── */}
                    <div style={s.panel}>
                        <button style={s.panelHeader} onClick={() => setVenueOpen(v => !v)}>
                            <span style={s.panelTitle}>Venue Performance</span>
                            <span style={s.panelChevron}>{venueOpen ? '▲' : '▼'}</span>
                        </button>
                        {venueOpen && (
                            <>
                                <div style={s.sortRow}>
                                    {[
                                        { key: 'toke_hr', label: '$/hr' },
                                        { key: 'total', label: 'Total $' },
                                        { key: 'events', label: '# Events' },
                                    ].map(opt => (
                                        <button
                                            key={opt.key}
                                            style={{ ...s.sortBtn, ...(venueSort === opt.key ? s.sortBtnActive : {}) }}
                                            onClick={() => setVenueSort(opt.key)}
                                        >{opt.label}</button>
                                    ))}
                                </div>
                                <div style={s.venueList}>
                                    {venueRanking.map((v, i) => (
                                        <div key={v.venue} style={s.venueRow}>
                                            <span style={s.venueRank}>
                                                {i < 3 ? RANK_MEDALS[i] : <span style={s.rankNum}>#{i + 1}</span>}
                                            </span>
                                            <div style={s.venueInfo}>
                                                <div style={s.venueName}>{v.venue}</div>
                                                <div style={s.venueMeta}>
                                                    {v.events} event{v.events !== 1 ? 's' : ''}
                                                    {v.totalHours > 0 && ` · ${v.totalHours.toFixed(1)}h`}
                                                </div>
                                            </div>
                                            <div style={s.venueStats}>
                                                <div style={s.venueTotal}>${v.totalTokes.toFixed(0)}</div>
                                                {v.tokePerHr > 0 && <div style={s.venueRate}>${v.tokePerHr.toFixed(2)}/hr</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── Game Type Profitability ── */}
                    {gameTypeStats.length > 0 && (
                        <div style={s.panel}>
                            <button style={s.panelHeader} onClick={() => setGameOpen(v => !v)}>
                                <span style={s.panelTitle}>🃏 Game Type Profitability</span>
                                <span style={s.panelChevron}>{gameOpen ? '▲' : '▼'}</span>
                            </button>
                            {gameOpen && (
                                <div style={s.tableWrapper}>
                                    <table style={s.table}>
                                        <thead>
                                            <tr style={s.thead}>
                                                <th style={s.th}>Game</th>
                                                <th style={{ ...s.th, textAlign: 'right' }}>Total $</th>
                                                <th style={{ ...s.th, textAlign: 'right' }}>Downs</th>
                                                <th style={{ ...s.th, textAlign: 'right' }}>$/Down</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {gameTypeStats.map((gt, i) => (
                                                <tr key={gt.gameType} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                                                    <td style={s.td}>{GAME_TYPE_MAP[gt.gameType] || gt.gameType}</td>
                                                    <td style={{ ...s.td, textAlign: 'right', color: METAL.success }}>${gt.totalTokes.toFixed(0)}</td>
                                                    <td style={{ ...s.td, textAlign: 'right' }}>{gt.totalDowns}</td>
                                                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: METAL.textPrimary }}>${gt.avgTokePerDown.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tournament Buy-In Analysis ── */}
                    {tournamentBrackets && tournamentBrackets.length > 0 && (
                        <div style={s.panel}>
                            <button style={s.panelHeader} onClick={() => setTourneyOpen(v => !v)}>
                                <span style={s.panelTitle}>Tournament Buy-In Analysis</span>
                                <span style={s.panelChevron}>{tourneyOpen ? '▲' : '▼'}</span>
                            </button>
                            {tourneyOpen && (
                                <div style={s.tableWrapper}>
                                    <table style={s.table}>
                                        <thead>
                                            <tr style={s.thead}>
                                                <th style={s.th}>Buy-In</th>
                                                <th style={{ ...s.th, textAlign: 'right' }}>Downs</th>
                                                <th style={{ ...s.th, textAlign: 'right' }}>Total $</th>
                                                <th style={{ ...s.th, textAlign: 'right' }}>Avg $/Down</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tournamentBrackets.map((b, i) => (
                                                <tr key={b.label} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                                                    <td style={{ ...s.td, fontWeight: 700, color: METAL.textPrimary }}>{b.label}</td>
                                                    <td style={{ ...s.td, textAlign: 'right' }}>{b.totalDowns}</td>
                                                    <td style={{ ...s.td, textAlign: 'right', color: METAL.success }}>${b.totalTokes.toFixed(0)}</td>
                                                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: b.avgTokePerDown >= 20 ? METAL.success : METAL.warn }}>
                                                        ${b.avgTokePerDown.toFixed(2)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div style={s.tourneyNote}>
                                        Log Buy-In Amounts When Starting Tournament Downs To Populate This Table
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Styles ────────────────────────────────────────────────────────
const s = {
    card: { background: METAL.mid, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' },
    header: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', background: 'transparent', border: 'none', cursor: 'pointer', color: METAL.textPrimary },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
    headerIcon: { fontSize: 24 },
    headerTitle: { fontSize: 17, fontWeight: 700, color: METAL.textPrimary },
    headerSub: { fontSize: 13, color: METAL.textSecondary, marginTop: 2 },
    chevron: { fontSize: 18, color: METAL.textSecondary, transition: 'transform 0.2s' },
    body: { borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 0 },
    panel: { borderBottom: '1px solid rgba(255,255,255,0.06)' },
    panelHeader: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'transparent', border: 'none', cursor: 'pointer' },
    panelTitle: { fontSize: 14, fontWeight: 700, color: METAL.textPrimary },
    panelChevron: { fontSize: 12, color: METAL.textSecondary },
    sortRow: { display: 'flex', gap: 8, padding: '0 16px 12px' },
    sortBtn: { padding: '6px 12px', background: METAL.darkest, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: METAL.textSecondary, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
    sortBtnActive: { background: METAL.primaryDim, border: '1px solid #4A90D9', color: '#4A90D9' },
    venueList: { padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 0 },
    venueRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
    venueRank: { fontSize: 20, width: 28, flexShrink: 0, textAlign: 'center' },
    rankNum: { fontSize: 14, color: METAL.textSecondary, fontWeight: 700 },
    venueInfo: { flex: 1, minWidth: 0 },
    venueName: { fontSize: 14, fontWeight: 600, color: METAL.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    venueMeta: { fontSize: 12, color: METAL.textSecondary, marginTop: 2 },
    venueStats: { textAlign: 'right', flexShrink: 0 },
    venueTotal: { fontSize: 15, fontWeight: 700, color: METAL.success },
    venueRate: { fontSize: 12, color: METAL.textSecondary },
    tableWrapper: { overflowX: 'auto', padding: '0 16px 12px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    thead: { background: METAL.darkest },
    th: { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: METAL.textSecondary, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' },
    td: { padding: '10px 10px', fontSize: 14, color: METAL.textSecondary, borderBottom: '1px solid rgba(255,255,255,0.04)' },
    trEven: { background: 'transparent' },
    trOdd: { background: 'rgba(0,0,0,0.15)' },
    tourneyNote: { fontSize: 12, color: METAL.textSecondary, padding: '8px 0 4px', fontStyle: 'italic' },
};
