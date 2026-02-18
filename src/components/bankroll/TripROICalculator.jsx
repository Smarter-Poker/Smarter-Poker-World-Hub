/**
 * TRIP ROI CALCULATOR
 * Comprehensive expense breakdown and true ROI for poker trips
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';

export default function TripROICalculator({ trip, userId, displayEUR = false }) {
    const [expenses, setExpenses] = useState({
        hotel: 0,
        flights: 0,
        food: 0,
        transport: 0,
        tips: 0,
        other: 0
    });
    const [sessions, setSessions] = useState([]);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        if (trip?.id) {
            loadTripData();
        }
    }, [trip?.id]);

    async function loadTripData() {
        // Load trip expenses
        if (trip.expenses) {
            setExpenses({
                hotel: trip.expenses.hotel || 0,
                flights: trip.expenses.flights || 0,
                food: trip.expenses.food || 0,
                transport: trip.expenses.transport || 0,
                tips: trip.expenses.tips || 0,
                other: trip.expenses.other || 0
            });
        }

        // Load sessions for this trip
        const { data: tripSessions } = await supabase
            .from('bankroll_ledger')
            .select('id, entry_date, gross_in, gross_out, start_time, end_time')
            .eq('trip_id', trip.id)
            .order('entry_date', { ascending: true });

        setSessions(tripSessions || []);
    }

    async function saveExpenses() {
        await supabase
            .from('trips')
            .update({ expenses })
            .eq('id', trip.id);
        setIsEditing(false);
    }

    // Calculations
    const calculations = useMemo(() => {
        const totalExpenses = Object.values(expenses).reduce((a, b) => a + (Number(b) || 0), 0);
        const grossWinnings = sessions.reduce((sum, s) => sum + ((s.gross_out || 0) - (s.gross_in || 0)), 0);
        const netProfit = grossWinnings - totalExpenses;

        // Calculate hours played
        let totalHours = 0;
        sessions.forEach(s => {
            if (s.start_time && s.end_time) {
                const start = new Date(`2000-01-01 ${s.start_time}`);
                const end = new Date(`2000-01-01 ${s.end_time}`);
                if (end > start) {
                    totalHours += (end - start) / (1000 * 60 * 60);
                }
            }
        });

        // Days
        const tripDays = trip.end_date && trip.start_date
            ? Math.ceil((new Date(trip.end_date) - new Date(trip.start_date)) / (1000 * 60 * 60 * 24)) + 1
            : 1;

        return {
            totalExpenses,
            grossWinnings,
            netProfit,
            roi: totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0,
            costPerDay: tripDays > 0 ? totalExpenses / tripDays : 0,
            profitPerSession: sessions.length > 0 ? netProfit / sessions.length : 0,
            hourlyRate: totalHours > 0 ? netProfit / totalHours : 0,
            totalHours,
            sessionCount: sessions.length,
            tripDays
        };
    }, [expenses, sessions, trip]);

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h3 style={styles.title}>Trip ROI Analysis</h3>
                <button
                    onClick={() => isEditing ? saveExpenses() : setIsEditing(true)}
                    style={styles.editBtn}
                >
                    {isEditing ? 'Save' : 'Edit'}
                </button>
            </div>

            {/* Expense Breakdown */}
            <div style={styles.section}>
                <h4 style={styles.sectionTitle}>Expenses Breakdown</h4>
                <div style={styles.expenseGrid}>
                    {Object.entries(expenses).map(([key, value]) => (
                        <div key={key} style={styles.expenseItem}>
                            <span style={styles.expenseLabel}>
                                {key === 'hotel' ? 'Hotel' : key === 'flights' ? 'Flights' : key === 'food' ? 'Food' : key === 'transport' ? 'Transport' : key === 'tips' ? '' : 'Other'}
                                {' '}{key.charAt(0).toUpperCase() + key.slice(1)}
                            </span>
                            {isEditing ? (
                                <input
                                    type="number"
                                    value={value}
                                    onChange={(e) => setExpenses(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                                    style={styles.expenseInput}
                                />
                            ) : (
                                <span style={styles.expenseValue}>{formatCurrency(value, displayEUR)}</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* ROI Stats */}
            <div style={styles.section}>
                <h4 style={styles.sectionTitle}>ROI Metrics</h4>
                <div style={styles.roiGrid}>
                    <div style={styles.roiItem}>
                        <div style={styles.roiLabel}>Gross Winnings</div>
                        <div style={{
                            ...styles.roiValue,
                            color: calculations.grossWinnings >= 0 ? '#22c55e' : '#ef4444'
                        }}>
                            {formatCurrency(calculations.grossWinnings, displayEUR)}
                        </div>
                    </div>
                    <div style={styles.roiItem}>
                        <div style={styles.roiLabel}>Total Expenses</div>
                        <div style={styles.roiValue}>
                            {formatCurrency(calculations.totalExpenses, displayEUR)}
                        </div>
                    </div>
                    <div style={styles.roiItem}>
                        <div style={styles.roiLabel}>Net Profit</div>
                        <div style={{
                            ...styles.roiValue,
                            ...styles.roiHighlight,
                            color: calculations.netProfit >= 0 ? '#22c55e' : '#ef4444'
                        }}>
                            {formatCurrency(calculations.netProfit, displayEUR)}
                        </div>
                    </div>
                    <div style={styles.roiItem}>
                        <div style={styles.roiLabel}>ROI %</div>
                        <div style={{
                            ...styles.roiValue,
                            color: calculations.roi >= 0 ? '#22c55e' : '#ef4444'
                        }}>
                            {calculations.roi >= 0 ? '+' : ''}{calculations.roi.toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>

            {/* Additional Stats */}
            <div style={styles.section}>
                <h4 style={styles.sectionTitle}>Efficiency Metrics</h4>
                <div style={styles.statsRow}>
                    <div style={styles.statItem}>
                        <div style={styles.statLabel}>Cost/Day</div>
                        <div style={styles.statValue}>{formatCurrency(calculations.costPerDay, displayEUR)}</div>
                    </div>
                    <div style={styles.statItem}>
                        <div style={styles.statLabel}>Profit/Session</div>
                        <div style={{
                            ...styles.statValue,
                            color: calculations.profitPerSession >= 0 ? '#22c55e' : '#ef4444'
                        }}>
                            {formatCurrency(calculations.profitPerSession, displayEUR)}
                        </div>
                    </div>
                    <div style={styles.statItem}>
                        <div style={styles.statLabel}>Hourly Rate</div>
                        <div style={{
                            ...styles.statValue,
                            color: calculations.hourlyRate >= 0 ? '#22c55e' : '#ef4444'
                        }}>
                            {formatCurrency(calculations.hourlyRate, displayEUR)}/hr
                        </div>
                    </div>
                </div>
                <div style={styles.statsRow}>
                    <div style={styles.statItem}>
                        <div style={styles.statLabel}>Sessions</div>
                        <div style={styles.statValue}>{calculations.sessionCount}</div>
                    </div>
                    <div style={styles.statItem}>
                        <div style={styles.statLabel}>Days</div>
                        <div style={styles.statValue}>{calculations.tripDays}</div>
                    </div>
                    <div style={styles.statItem}>
                        <div style={styles.statLabel}>Hours Played</div>
                        <div style={styles.statValue}>{calculations.totalHours.toFixed(1)}</div>
                    </div>
                </div>
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
        marginBottom: 16,
    },
    title: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        margin: 0,
    },
    editBtn: {
        padding: '4px 12px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 6,
        color: '#2374e1',
        fontSize: 14,
        cursor: 'pointer',
    },
    section: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.6)',
        textTransform: 'uppercase',
        margin: '0 0 10px',
    },
    expenseGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
    },
    expenseItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 8,
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 6,
    },
    expenseLabel: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    expenseValue: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    expenseInput: {
        width: 70,
        padding: '4px 8px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 4,
        color: '#fff',
        fontSize: 14,
        textAlign: 'right',
    },
    roiGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
    },
    roiItem: {
        padding: 10,
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 8,
        textAlign: 'center',
    },
    roiLabel: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 4,
    },
    roiValue: {
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },
    roiHighlight: {
        fontSize: 16,
    },
    statsRow: {
        display: 'flex',
        gap: 8,
        marginBottom: 8,
    },
    statItem: {
        flex: 1,
        padding: 8,
        background: 'rgba(255, 255, 255, 0.02)',
        borderRadius: 6,
        textAlign: 'center',
    },
    statLabel: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 2,
    },
    statValue: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
};
