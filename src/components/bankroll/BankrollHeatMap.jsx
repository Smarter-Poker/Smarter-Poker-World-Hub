/**
 * BANKROLL HEAT MAP
 * Calendar view with P/L coloring — driven by entries prop for real-time filter reactivity
 */

import { useState, useMemo } from 'react';

export default function BankrollHeatMap({ entries = [] }) {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const monthData = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);

        const dailyPL = {};
        entries.forEach(e => {
            const d = new Date(e.entry_date + 'T12:00:00');
            if (d >= startDate && D <= endDate) {
                const date = e.entry_date;
                if (!dailyPL[date]) dailyPL[date] = 0;
                dailyPL[date] += (e.gross_out || 0) - (e.gross_in || 0);
            }
        });
        return dailyPL;
    }, [entries, currentMonth]);

    function getColorForPL(pl) {
        if (pl === undefined) return 'rgba(255, 255, 255, 0.03)';
        if (pl > 500) return 'rgba(34, 197, 94, 0.6)';
        if (pl > 100) return 'rgba(34, 197, 94, 0.4)';
        if (pl > 0) return 'rgba(34, 197, 94, 0.2)';
        if (pl === 0) return 'rgba(255, 255, 255, 0.08)';
        if (pl > -100) return 'rgba(239, 68, 68, 0.2)';
        if (pl > -500) return 'rgba(239, 68, 68, 0.4)';
        return 'rgba(239, 68, 68, 0.6)';
    }

    function navigateMonth(delta) {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1));
    }

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

    const days = [];
    for (let i = 0; i < firstDay; i++) {
        days.push(<div key={`empty-${i}`} style={styles.emptyDay} />);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const pl = monthData[dateStr];
        const color = getColorForPL(pl);
        days.push(
            <div key={day} style={{ ...styles.day, background: color }} title={pl !== undefined ? `${dateStr}: $${pl.toLocaleString()}` : dateStr}>
                <span style={styles.dayNum}>{day}</span>
                {pl !== undefined && (
                    <span style={{ ...styles.dayPL, color: pl >= 0 ? '#22c55e' : '#ef4444' }}>
                        {pl >= 0 ? '+' : ''}{pl > 999 ? `${(pl / 1000).toFixed(1)}k` : pl}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <button onClick={() => navigateMonth(-1)} style={styles.navBtn}>‹</button>
                <h3 style={styles.title}>{monthName}</h3>
                <button onClick={() => navigateMonth(1)} style={styles.navBtn}>›</button>
            </div>
            <div style={styles.weekdays}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} style={styles.weekday}>{d}</div>
                ))}
            </div>
            <div style={styles.grid}>{days}</div>
            <div style={styles.legend}>
                <span style={{ ...styles.legendItem, background: 'rgba(239, 68, 68, 0.5)' }}>Loss</span>
                <span style={{ ...styles.legendItem, background: 'rgba(255, 255, 255, 0.08)' }}>Break-even</span>
                <span style={{ ...styles.legendItem, background: 'rgba(34, 197, 94, 0.5)' }}>Win</span>
            </div>
        </div>
    );
}

const styles = {
    container: {
        padding: 16,
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 12,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        margin: 0,
    },
    navBtn: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: 'none',
        color: '#fff',
        fontSize: 18,
        width: 28,
        height: 28,
        borderRadius: 6,
        cursor: 'pointer',
    },
    weekdays: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2,
        marginBottom: 4,
    },
    weekday: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        padding: '4px 0',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2,
    },
    day: {
        aspectRatio: '1',
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 2,
        minHeight: 36,
    },
    emptyDay: {
        aspectRatio: '1',
    },
    dayNum: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    dayPL: {
        fontSize: 8,
        fontWeight: 600,
    },
    legend: {
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    },
    legendItem: {
        fontSize: 9,
        color: 'rgba(255, 255, 255, 0.7)',
        padding: '3px 8px',
        borderRadius: 4,
    },
};
