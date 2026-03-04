/**
 * TOKE TRACKER COMPONENT
 * ═══════════════════════════════════════════════════════════════
 * Dealer income & expense tracking — gigs, downs, 35-min timer
 * Facebook Dark UI — matches TripTracker pattern
 * ═══════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Image as ImageIcon } from 'lucide-react';
import ReceiptScanner from './ReceiptScanner';
import TokeCalendar from './TokeCalendar';
import TokeDashboard from './TokeDashboard';
import DealerVault from './DealerVault';
import VenueIntelligence from './VenueIntelligence';
import TaxSummaryModal from './TaxSummaryModal';
import {
    getActiveGig,
    fetchGigs,
    createGig,
    updateGig,
    completeGig,
    deleteGig,
    createDay,
    closeDay,
    createDown,
    endDown,
    createDoubleDown,
    deleteDown,
    updateDownToke,
    updateDownMultiplier,
    createExpense,
    deleteExpense,
    getGigReport,
} from '../../lib/bankroll/tokeSelectors';
import { getUserLocations } from '../../lib/bankroll/locationMemory';
import { supabase } from '../../lib/supabase';
import VenueSelector from './VenueSelector';
import toast from '../../stores/toastStore';

// ── Down type metadata ──
const DOWN_TYPES = [
    { id: 'cash', label: 'Cash Game', color: '#3b82f6' },
    { id: 'tournament', label: 'Tournament', color: '#f59e0b' },
    { id: 'break', label: 'On Break', color: '#8b5cf6' },
    { id: 'brush', label: 'Brush', color: '#10b981' },
];

// ── Cash game variants ──
const CASH_GAME_VARIANTS = ['Holdem', 'PLO', 'Mixed'];
const CASH_GAME_STAKES = [
    '1/2', '1/3', '2/5', '3/5', '5/10', '10/20', '10/25', '25/50', '50/100', 'Other',
];

const DOWN_TYPE_LABELS = {
    cash: 'Cash Game',
    tournament: 'Tournament',
    break: 'On Break',
    brush: 'Brush',
};

const DOWN_TYPE_COLORS = {
    cash: '#3b82f6',
    tournament: '#f59e0b',
    break: '#8b5cf6',
    brush: '#10b981',
};

// 35 minutes in milliseconds
const DOWN_TIMER_MS = 35 * 60 * 1000;

const EXPENSE_CATEGORIES = [
    { id: 'food', label: 'Food & Beverage' },
    { id: 'ride_share', label: 'Ride Share' },
    { id: 'gas', label: 'Gas' },
    { id: 'air_fare', label: 'Air Fare' },
    { id: 'lodging', label: 'Lodging / Hotel' },
    { id: 'supplies', label: 'Supplies' },
    { id: 'other', label: 'Other' },
    { id: 'tip_out', label: 'Tip Out' },
];

export default function TokeTracker({ userId, refreshTrigger, standalone = false }) {
    const [activeGig, setActiveGig] = useState(null);
    const [completedGigs, setCompletedGigs] = useState([]);
    const [locations, setLocations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showAddDown, setShowAddDown] = useState(false);
    const [confirmComplete, setConfirmComplete] = useState(false);
    const [confirmCloseDay, setConfirmCloseDay] = useState(false);
    const [mileageInput, setMileageInput] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [collapsedDays, setCollapsedDays] = useState({});
    const [selectedReport, setSelectedReport] = useState(null);
    const [editForm, setEditForm] = useState({ venue_name: '', venue_address: '', hourly_rate: '', notes: '' });

    // Down form state
    const [downForm, setDownForm] = useState({
        down_type: 'cash',
        tournament_name: '',
        table_number: '',
        game_type: '',
        cash_variant: 'Holdem',
        cash_stakes: '1/3',
        tournament_buyin: '',
    });

    // Tax Summary modal
    const [showTaxSummary, setShowTaxSummary] = useState(false);

    // Toke edit state  
    const [editingTokeId, setEditingTokeId] = useState(null);
    const [tokeEditValue, setTokeEditValue] = useState('');

    // Multiplier edit state
    const [editingMultiplierId, setEditingMultiplierId] = useState(null);
    const [multiplierEditValue, setMultiplierEditValue] = useState('');

    // Expense state
    const [showAddExpense, setShowAddExpense] = useState(false);
    const [expenseForm, setExpenseForm] = useState({ category: 'food', amount: '', description: '', receipt_url: null });
    const [showScanner, setShowScanner] = useState(false);
    const [viewingReceiptUrl, setViewingReceiptUrl] = useState(null);

    // Jarvis Reference Panel state
    const [jarvisQuery, setJarvisQuery] = useState('');
    const [jarvisAnswer, setJarvisAnswer] = useState(null);
    const [jarvisLoading, setJarvisLoading] = useState(false);
    const [jarvisHistory, setJarvisHistory] = useState([]);
    const [jarvisExpanded, setJarvisExpanded] = useState(true);

    // Monthly Income Goal (localStorage)
    const [monthlyGoal, setMonthlyGoal] = useState(() => {
        try { return parseFloat(localStorage.getItem('toke_monthly_goal') || '0') || 0; }
        catch { return 0; }
    });
    const [goalInput, setGoalInput] = useState('');
    const [showGoalEdit, setShowGoalEdit] = useState(false);

    const currentMonthTokes = useMemo(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        return completedGigs.reduce((sum, gig) => {
            if (!gig.start_date) return sum;
            const d = new Date(gig.start_date + 'T12:00:00');
            if (d.getFullYear() !== y || d.getMonth() !== m) return sum;
            return sum + (gig.days || []).reduce((s2, day) =>
                s2 + (day.downs || []).reduce((s3, dn) => s3 + (dn.toke_amount || 0), 0), 0
            );
        }, 0);
    }, [completedGigs]);

    const saveGoal = () => {
        const val = parseFloat(goalInput) || 0;
        setMonthlyGoal(val);
        try { localStorage.setItem('toke_monthly_goal', String(val)); } catch { }
        setShowGoalEdit(false);
        setGoalInput('');
    };

    // Timer for 35-min down reminder
    const downTimerRef = useRef(null);
    const [timerActive, setTimerActive] = useState(false);
    const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);
    const timerTickRef = useRef(null);

    // Live hours ticker (updates every 60s without a DB call)
    const [liveHours, setLiveHours] = useState(0);
    const liveHoursTickRef = useRef(null);

    // Toke-on-end flow
    const [endingDown, setEndingDown] = useState(null); // the down being ended
    const [endTokeValue, setEndTokeValue] = useState('');

    // Day-close notes
    const [closeDayNotes, setCloseDayNotes] = useState('');

    // Green celebration flash after closing a day
    const [showCelebration, setShowCelebration] = useState(false);

    // Create event form state
    const [newGig, setNewGig] = useState({
        venue_name: '',
        venue_address: '',
        location_id: null,
        venue_type: 'casino',
        poker_venue_id: null,
        latitude: null,
        longitude: null,
        start_date: new Date().toISOString().split('T')[0],
        hourly_rate: '',
        notes: '',
    });

    // ── Load data ──
    const loadData = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            const [active, gigs, locs] = await Promise.all([
                getActiveGig(userId),
                fetchGigs(userId),
                getUserLocations(userId),
            ]);
            setActiveGig(active);
            setCompletedGigs(gigs.filter(g => g.status === 'completed'));
            setLocations(locs || []);

            // If there's an active down in the current open day, restart the timer
            const openDay = active?.days?.find((d) => !d.ended_at);
            if (openDay?.downs?.length) {
                const lastDown = openDay.downs[openDay.downs.length - 1];
                if (!lastDown.ended_at) {
                    const elapsed = Date.now() - new Date(lastDown.started_at).getTime();
                    const remaining = DOWN_TIMER_MS - elapsed;
                    if (remaining > 0) {
                        startDownTimer(remaining, lastDown);
                    }
                }
            }
        } catch (err) {
            console.error('Error loading toke data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadData(); }, [loadData, refreshTrigger]);

    // ── Supabase Realtime — auto-refresh on any change to gig data ──
    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`toke-realtime-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_gigs', filter: `user_id=eq.${userId}` }, () => loadData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_gig_days', filter: `user_id=eq.${userId}` }, () => loadData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_downs', filter: `user_id=eq.${userId}` }, () => loadData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_expenses', filter: `user_id=eq.${userId}` }, () => loadData())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [userId, loadData]);

    // ── Cleanup timers on unmount ──
    useEffect(() => {
        return () => {
            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
            if (liveHoursTickRef.current) clearInterval(liveHoursTickRef.current);
        };
    }, []);

    // ── Live hours ticker — recomputes every 60s from open day downs ──
    useEffect(() => {
        const computeLiveHours = () => {
            const openDay = activeGig?.days?.find(d => !d.ended_at);
            if (!openDay?.downs?.length) { setLiveHours(0); return; }
            let ms = 0;
            for (const d of openDay.downs) {
                const start = new Date(d.started_at).getTime();
                const end = d.ended_at ? new Date(d.ended_at).getTime() : Date.now();
                ms += end - start;
            }
            setLiveHours(Math.round((ms / (1000 * 60 * 60)) * 10) / 10);
        };

        computeLiveHours();
        if (liveHoursTickRef.current) clearInterval(liveHoursTickRef.current);
        liveHoursTickRef.current = setInterval(computeLiveHours, 60_000);
        return () => clearInterval(liveHoursTickRef.current);
    }, [activeGig]);

    // ── 35-min Down Timer ──
    const startDownTimer = useCallback((durationMs, lastDown) => {
        // Clear any existing timer
        if (downTimerRef.current) clearTimeout(downTimerRef.current);
        if (timerTickRef.current) clearInterval(timerTickRef.current);

        const endsAt = Date.now() + durationMs;
        setTimerActive(true);
        setTimerSecondsLeft(Math.ceil(durationMs / 1000));

        // Tick every second for countdown display
        timerTickRef.current = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            setTimerSecondsLeft(remaining);
            if (remaining <= 0) {
                clearInterval(timerTickRef.current);
                timerTickRef.current = null;
            }
        }, 1000);

        // Fire notification after duration
        downTimerRef.current = setTimeout(() => {
            setTimerActive(false);
            fireDownNotification(lastDown);
        }, durationMs);
    }, []);

    const fireDownNotification = useCallback((lastDown) => {
        const downLabel = DOWN_TYPE_LABELS[lastDown.down_type] || 'dealing';
        let message = '';
        let title = '⏰ Down Timer';

        if (lastDown.down_type === 'break') {
            title = '☕ Break Check';
            message = 'Are you still on break?';
        } else if (lastDown.down_type === 'brush') {
            title = '🧹 Brush Check';
            message = 'Are you still brushing?';
        } else {
            const tableInfo = lastDown.table_number ? ` (Table ${lastDown.table_number})` : '';
            title = '♠ Down Check';
            message = `Still dealing the same table${tableInfo}?`;
        }

        // Always fire the in-app prompt
        handleDoubleDownPrompt(lastDown);

        // Also try browser notification as a bonus
        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(title, {
                    body: message + '\nTap to respond.',
                    icon: '/icons/icon-192x192.png',
                    tag: 'toke-down-timer',
                    requireInteraction: true,
                });
            }
        } catch (e) {
            // Silently fail — the in-app prompt is the primary mechanism
        }
    }, []);

    const [showDoubleDownPrompt, setShowDoubleDownPrompt] = useState(false);
    const [promptDown, setPromptDown] = useState(null);

    const handleDoubleDownPrompt = useCallback((lastDown) => {
        setPromptDown(lastDown);
        setShowDoubleDownPrompt(true);
    }, []);

    const handleDoubleDownYes = async () => {
        if (!promptDown || !activeGig) return;
        const currentDay = activeGig.days?.find(d => !d.ended_at) || null;
        if (!currentDay) { toast.error('No open day — start a new day first.'); return; }
        // Optimistic: add a placeholder down immediately
        const tempDown = {
            id: `temp-${Date.now()}`,
            gig_id: activeGig.id,
            day_id: currentDay.id,
            user_id: userId,
            down_type: promptDown.down_type,
            game_type: promptDown.game_type,
            tournament_name: promptDown.tournament_name,
            table_number: promptDown.table_number,
            started_at: new Date().toISOString(),
            toke_amount: 0,
            is_double_down: true,
            down_multiplier: 1.0,
        };
        setActiveGig(prev => prev ? ({
            ...prev,
            days: prev.days?.map(d =>
                d.id === currentDay.id ? { ...d, downs: [...(d.downs || []), tempDown] } : d
            ) || [],
        }) : prev);
        setShowDoubleDownPrompt(false);
        setPromptDown(null);
        try {
            const down = await createDoubleDown(userId, activeGig.id, currentDay.id, promptDown);
            startDownTimer(DOWN_TIMER_MS, down);
            toast.success('Double down created!');
        } catch (err) {
            toast.error(err.message || 'Failed to create double down');
        }
        await loadData();
    };

    const handleDoubleDownNo = () => {
        setShowDoubleDownPrompt(false);
        setPromptDown(null);
        setShowAddDown(true);
    };

    // ── Request notification permission ──
    const requestNotificationPermission = useCallback(async () => {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }, []);

    // ── GIG CRUD Handlers ──
    const handleCreateGig = async (e) => {
        e.preventDefault();
        if (!newGig.venue_name.trim()) {
            toast.error('Please select or enter a venue');
            return;
        }
        try {
            await createGig(userId, {
                ...newGig,
                hourly_rate: parseFloat(newGig.hourly_rate) || 0,
            });
            toast.success('Event started!');
            setShowCreateForm(false);
            setNewGig({ venue_name: '', venue_address: '', location_id: null, venue_type: 'casino', poker_venue_id: null, latitude: null, longitude: null, start_date: new Date().toISOString().split('T')[0], hourly_rate: '', notes: '' });
            await requestNotificationPermission();
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to create gig');
        }
    };

    const handleCompleteGig = async (mileageCount = 0) => {
        if (!activeGig) return;
        try {
            await completeGig(userId, activeGig.id, parseFloat(mileageCount) || 0);
            toast.success('Event completed!');
            setConfirmComplete(false);
            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
            setTimerActive(false);
            await loadData();
            // Bus event: notify TokeDashboard + other hub cards that a gig was completed
            window.dispatchEvent(new CustomEvent('toke-gig-completed', {
                detail: { userId, gigId: activeGig.id }
            }));
        } catch (err) {
            toast.error(err.message || 'Failed to complete gig');
        }
    };

    const handleDeleteGig = async () => {
        if (!activeGig) return;
        try {
            await deleteGig(userId, activeGig.id);
            toast.success('Event deleted');
            setConfirmDelete(false);
            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
            setTimerActive(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to delete gig');
        }
    };

    const startEditing = () => {
        if (!activeGig) return;
        setEditForm({
            venue_name: activeGig.venue_name || '',
            venue_address: activeGig.venue_address || '',
            hourly_rate: activeGig.hourly_rate || '',
            notes: activeGig.notes || '',
        });
        setEditMode(true);
    };

    const handleSaveEdit = async () => {
        if (!activeGig) return;
        if (!editForm.venue_name.trim()) {
            toast.error('Venue name is required');
            return;
        }
        try {
            await updateGig(userId, activeGig.id, {
                ...editForm,
                hourly_rate: parseFloat(editForm.hourly_rate) || 0,
            });
            toast.success('Event updated!');
            setEditMode(false);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to update gig');
        }
    };

    // ── DOWN Handlers ──
    const handleAddDown = async () => {
        if (!activeGig) return;
        const currentDay = activeGig.days?.find(d => !d.ended_at) || null;
        if (!currentDay) { toast.error('Close the current day first, then start a new day.'); return; }
        try {
            const gameType = downForm.down_type === 'cash'
                ? downForm.cash_variant
                : downForm.game_type || null;
            const down = await createDown(userId, activeGig.id, currentDay.id, {
                down_type: downForm.down_type,
                tournament_name: downForm.down_type === 'tournament' ? downForm.tournament_name : null,
                table_number: downForm.table_number || null,
                game_type: gameType,
                tournament_buyin: downForm.down_type === 'tournament' && downForm.tournament_buyin
                    ? parseFloat(downForm.tournament_buyin) : null,
            });
            toast.success(`${DOWN_TYPE_LABELS[downForm.down_type]} down started!`);
            setShowAddDown(false);
            setDownForm({ down_type: 'cash', tournament_name: '', table_number: '', game_type: '', cash_variant: 'Holdem', cash_stakes: '1/3', tournament_buyin: '' });
            startDownTimer(DOWN_TIMER_MS, down);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to add down');
        }
    };

    // Begin toke-on-end flow: show inline toke input before closing the down
    const handleEndDownPrompt = (down) => {
        setEndingDown(down);
        setEndTokeValue(down.toke_amount > 0 ? String(down.toke_amount) : '');
    };

    const handleEndDownConfirm = async () => {
        if (!endingDown) return;
        const tokeAmt = parseFloat(endTokeValue) || 0;
        // Optimistic UI update
        setActiveGig(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                days: prev.days?.map(day => ({
                    ...day,
                    downs: day.downs?.map(d =>
                        d.id === endingDown.id
                            ? { ...d, ended_at: new Date().toISOString(), toke_amount: tokeAmt }
                            : d
                    ) || [],
                })) || [],
            };
        });
        setEndingDown(null);
        setEndTokeValue('');
        if (downTimerRef.current) clearTimeout(downTimerRef.current);
        if (timerTickRef.current) clearInterval(timerTickRef.current);
        setTimerActive(false);
        try {
            await endDown(endingDown.id, tokeAmt);
            toast.success('Down ended');
        } catch (err) {
            toast.error(err.message || 'Failed to end down');
        }
        await loadData();
    };

    // Legacy direct-end (called from non-dealing downs like break/brush when no toke needed)
    const handleEndDown = async (downId) => {
        const openDay = activeGig?.days?.find(d => !d.ended_at);
        const down = openDay?.downs?.find(d => d.id === downId);
        if (down && (down.down_type === 'cash' || down.down_type === 'brush')) {
            handleEndDownPrompt(down);
            return;
        }
        try {
            // Optimistic update
            setActiveGig(prev => prev ? ({
                ...prev,
                days: prev.days?.map(day => ({
                    ...day,
                    downs: day.downs?.map(d =>
                        d.id === downId ? { ...d, ended_at: new Date().toISOString() } : d
                    ) || [],
                })) || [],
            }) : prev);
            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
            setTimerActive(false);
            await endDown(downId);
            toast.success('Down ended');
        } catch (err) {
            toast.error(err.message || 'Failed to end down');
        }
        await loadData();
    };

    const handleDeleteDown = async (downId) => {
        try {
            await deleteDown(downId);
            toast.success('Down deleted');
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to delete down');
        }
    };

    const handleSaveToke = async (downId) => {
        try {
            await updateDownToke(downId, parseFloat(tokeEditValue) || 0);
            toast.success('Toke saved');
            setEditingTokeId(null);
            setTokeEditValue('');
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to save toke');
        }
    };

    const handleSaveMultiplier = async (downId) => {
        try {
            await updateDownMultiplier(downId, parseFloat(multiplierEditValue) || 1.0);
            toast.success('Multiplier updated');
            setEditingMultiplierId(null);
            setMultiplierEditValue('');
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to update multiplier');
        }
    };

    // ── Day Handlers ──
    const handleCloseDay = async () => {
        const currentDay = activeGig?.days?.find(d => !d.ended_at) || null;
        if (!currentDay) return;
        // Optimistic UI — mark day as ended immediately
        setActiveGig(prev => prev ? ({
            ...prev,
            days: prev.days?.map(d =>
                d.id === currentDay.id ? { ...d, ended_at: new Date().toISOString() } : d
            ) || [],
        }) : prev);
        setConfirmCloseDay(false);
        if (downTimerRef.current) clearTimeout(downTimerRef.current);
        if (timerTickRef.current) clearInterval(timerTickRef.current);
        setTimerActive(false);
        // Show celebration
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 1800);
        try {
            await closeDay(currentDay.id);
            // Save notes if any
            if (closeDayNotes.trim()) {
                await supabase.from('toke_gig_days').update({ notes: closeDayNotes.trim() }).eq('id', currentDay.id);
            }
            toast.success(`Day ${currentDay.day_number} closed! 🎉`);
            setCloseDayNotes('');
        } catch (err) {
            toast.error(err.message || 'Failed to close day');
        }
        await loadData();
    };

    const handleStartNewDay = async () => {
        if (!activeGig) return;
        const openDay = activeGig.days?.find(d => !d.ended_at);
        if (openDay) { toast.error('Close the current day first.'); return; }
        try {
            const nextNum = (activeGig.days?.length || 0) + 1;
            await createDay(userId, activeGig.id, nextNum);
            toast.success(`Day ${nextNum} started!`);
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to start new day');
        }
    };

    // ── Expense Handlers ──
    const handleAddExpense = async (e) => {
        e.preventDefault();
        if (!activeGig || !expenseForm.amount) {
            toast.error('Please enter an amount');
            return;
        }
        const currentDay = activeGig.days?.find(d => !d.ended_at) || null;
        if (!currentDay) { toast.error('Start a new day before adding expenses.'); return; }
        try {
            await createExpense(userId, activeGig.id, currentDay.id, {
                category: expenseForm.category,
                amount: parseFloat(expenseForm.amount) || 0,
                description: expenseForm.description || null,
                receipt_url: expenseForm.receipt_url || null,
            });
            toast.success('Expense added');
            setShowAddExpense(false);
            setExpenseForm({ category: 'food', amount: '', description: '', receipt_url: null });
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to add expense');
        }
    };

    const handleDeleteExpense = async (expenseId) => {
        if (!confirm('Delete this expense?')) return;
        try {
            await deleteExpense(expenseId);
            toast.success('Expense deleted');
            await loadData();
        } catch (err) {
            toast.error(err.message || 'Failed to delete expense');
        }
    };

    // ── Jarvis Dealer Reference ──
    const handleAskJarvis = async (query) => {
        const q = (query || jarvisQuery).trim();
        if (!q) return;
        setJarvisLoading(true);
        setJarvisAnswer(null);
        try {
            const res = await fetch('/api/jarvis/dealer-reference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q, history: jarvisHistory }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Jarvis error');
            setJarvisAnswer(data.answer);
            setJarvisHistory(prev => [
                ...prev.slice(-4),
                { question: q, answer: data.answer },
            ]);
            setJarvisQuery('');
        } catch (err) {
            toast.error(err.message || 'Jarvis unavailable — try again');
        } finally {
            setJarvisLoading(false);
        }
    };

    const JARVIS_CHIPS = [
        'TDA Rules Summary',
        'How to deal 2-7 Triple Draw',
        'Omaha Hi-Lo rules',
        'Razz dealing rules',
        'Button rules for a new game',
        'Running it twice rules',
        'Stud 8 dealing order',
        'Badugi hand rankings',
    ];

    // ── Report View ──
    const handleViewReport = async (gigId) => {
        try {
            const report = await getGigReport(userId, gigId);
            setSelectedReport(report);
        } catch (err) {
            toast.error('Failed to load event report');
        }
    };

    // ── Format helpers ──
    const formatDuration = (ms) => {
        const totalMinutes = Math.floor(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    const formatTimerDisplay = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const formatCurrency = (amount) => {
        return `$${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // ── Export helpers ──
    const handleCopyReport = () => {
        if (!selectedReport) return;
        const { gig, stats } = selectedReport;
        const lines = [
            `TOKE REPORT — ${gig.venue_name}`,
            `Date: ${new Date(gig.start_date + 'T12:00:00').toLocaleDateString()}${gig.end_date ? ` – ${new Date(gig.end_date + 'T12:00:00').toLocaleDateString()}` : ''}`,
            ``,
            `Total Tokes:   ${formatCurrency(stats.totalTokes)}`,
            `Hourly Pay:    ${formatCurrency(stats.hourlyPay)}`,
            `Expenses:      -${formatCurrency(stats.totalExpenses)}`,
            `Net Earnings:  ${formatCurrency(stats.totalEarnings)}`,
            `Hours Worked:  ${stats.totalHoursWorked.toFixed(1)}h`,
            `Avg Toke/Down: ${formatCurrency(stats.avgTokePerDown)}`,
            `Downs: ${stats.totalDowns}  (Cash: ${stats.cashDownCount} | Tourn: ${stats.tournamentDownCount} | Brush: ${stats.brushDownCount} | Break: ${stats.breakCount})`,
            `Mileage: ${gig.mileage || 0} mi`,
        ];
        if (selectedReport.days?.length > 0) {
            lines.push(``, `Daily Breakdown:`);
            for (const day of selectedReport.days) {
                lines.push(`  Day ${day.day_number}: ${formatCurrency(day.totalTokes || 0)} tokes | ${day.totalDowns || 0} downs | ${(day.totalHoursWorked || 0).toFixed(1)}h${day.notes ? ` | ${day.notes}` : ''}`);
            }
        }
        navigator.clipboard.writeText(lines.join('\n'))
            .then(() => toast.success('Report copied to clipboard!'))
            .catch(() => toast.error('Copy failed'));
    };

    const handleDownloadCSV = () => {
        if (!selectedReport) return;
        const { gig, downs, expenses } = selectedReport;
        const rows = [
            ['Type', 'Date', 'Game', 'Table', 'Started', 'Ended', 'Toke', 'Double', 'Multiplier', 'Notes'],
            ...(downs || []).map(d => [
                d.down_type,
                new Date(d.started_at).toLocaleDateString(),
                d.game_type || '',
                d.table_number || '',
                new Date(d.started_at).toLocaleTimeString(),
                d.ended_at ? new Date(d.ended_at).toLocaleTimeString() : '',
                d.toke_amount || 0,
                d.is_double_down ? 'Yes' : 'No',
                d.down_multiplier || 1,
                d.notes || '',
            ]),
            [],
            ['Expense Type', 'Amount', 'Description', 'Date'],
            ...(expenses || []).map(e => [
                e.category,
                e.amount || 0,
                e.description || '',
                new Date(e.created_at).toLocaleDateString(),
            ]),
        ];
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `toke-report-${gig.venue_name.replace(/\s+/g, '-')}-${gig.start_date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV downloaded!');
    };

    // ── Report Subview ──
    if (selectedReport) {
        const { gig, stats } = selectedReport;
        return (
            <div style={styles.container}>
                <button onClick={() => setSelectedReport(null)} style={styles.backBtn}>← Back To Events</button>
                <div style={styles.reportCard}>
                    <h2 style={styles.reportTitle}>{gig.venue_name}</h2>
                    {gig.venue_address && <p style={styles.reportAddress}>{gig.venue_address}</p>}
                    <p style={styles.reportDates}>
                        {new Date(gig.start_date + 'T12:00:00').toLocaleDateString()}
                        {gig.end_date && ` — ${new Date(gig.end_date + 'T12:00:00').toLocaleDateString()}`}
                        {' · '}{stats.durationDays} day{stats.durationDays !== 1 ? 's' : ''}
                    </p>

                    {/* Mileage IRS Deductible */}
                    {gig.mileage > 0 && (() => {
                        const year = gig.start_date ? parseInt(gig.start_date.slice(0, 4), 10) : new Date().getFullYear();
                        const irsRates = { 2025: 0.70, 2024: 0.67, 2023: 0.655, 2022: 0.585 };
                        const rate = irsRates[year] || 0.67;
                        return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, fontSize: 13 }}>
                                <span>🚗</span>
                                <span style={{ color: '#B0B3B8' }}>{gig.mileage.toLocaleString()} miles × ${rate}/mi</span>
                                <span style={{ color: '#f59e0b', fontWeight: 700 }}>= ${(gig.mileage * rate).toFixed(2)} deductible</span>
                            </div>
                        );
                    })()}

                    <div style={styles.reportStatsGrid}>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Total Earnings</span>
                            <span style={{ ...styles.reportStatValue, color: '#10b981' }}>{formatCurrency(stats.totalEarnings)}</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Total Tokes</span>
                            <span style={{ ...styles.reportStatValue, color: '#f59e0b' }}>{formatCurrency(stats.totalTokes)}</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Expenses</span>
                            <span style={{ ...styles.reportStatValue, color: '#ef4444' }}>{formatCurrency(stats.totalExpenses || 0)}</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Hourly Pay</span>
                            <span style={styles.reportStatValue}>{formatCurrency(stats.hourlyPay)}</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Hours Worked</span>
                            <span style={styles.reportStatValue}>{stats.totalHoursWorked.toFixed(1)}h</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Avg Toke/Down</span>
                            <span style={styles.reportStatValue}>{formatCurrency(stats.avgTokePerDown)}</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Mileage</span>
                            <span style={styles.reportStatValue}>{gig.mileage || 0} mi</span>
                        </div>
                        <div style={styles.reportStat}>
                            <span style={styles.reportStatLabel}>Per Day</span>
                            <span style={styles.reportStatValue}>{formatCurrency(stats.perDay)}</span>
                        </div>
                    </div>

                    <div style={styles.reportBreakdown}>
                        <h4 style={styles.reportBreakdownTitle}>Down Breakdown</h4>
                        <div style={styles.reportBreakdownGrid}>
                            <span style={styles.breakdownItem}>Cash: {stats.cashDownCount}</span>
                            <span style={styles.breakdownItem}>Tournament: {stats.tournamentDownCount}</span>
                            <span style={styles.breakdownItem}>Brush: {stats.brushDownCount}</span>
                            <span style={styles.breakdownItem}>Breaks: {stats.breakCount}</span>
                            <span style={styles.breakdownItem}>Double Downs: {stats.doubleDownCount}</span>
                        </div>
                    </div>

                    {/* Per-Day Breakdown */}
                    {selectedReport.days && selectedReport.days.length > 0 && (
                        <div style={{ ...styles.reportBreakdown, marginTop: 12 }}>
                            <h4 style={styles.reportBreakdownTitle}>Daily Breakdown</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {selectedReport.days.map(day => (
                                    <div key={day.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#B0B3B8' }}>
                                            Day {day.day_number} — {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b' }}>
                                            <span style={{ color: '#f59e0b', fontWeight: 700 }}>{formatCurrency(day.totalTokes || 0)}</span>
                                            <span>{day.totalDowns || 0} downs</span>
                                            <span>{(day.totalHoursWorked || 0).toFixed(1)}h</span>
                                            {(day.totalExpenses || 0) > 0 && <span style={{ color: '#ef4444' }}>-{formatCurrency(day.totalExpenses)}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Expenses Breakdown */}
                    {selectedReport.expenses && selectedReport.expenses.length > 0 && (
                        <div style={{ ...styles.reportBreakdown, marginTop: 12 }}>
                            <h4 style={styles.reportBreakdownTitle}>Expense Breakdown</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {selectedReport.expenses.map(exp => (
                                    <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                        <span style={{ color: '#B0B3B8', fontSize: 13 }}>
                                            {EXPENSE_CATEGORIES.find(c => c.id === exp.category)?.label || exp.category}
                                            {exp.description && ` — ${exp.description}`}
                                        </span>
                                        <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>-{formatCurrency(exp.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Export buttons */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <button
                            onClick={handleCopyReport}
                            style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#E4E6EB' }}
                        >
                            Copy Summary
                        </button>
                        <button
                            onClick={handleDownloadCSV}
                            style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}
                        >
                            📄 Download CSV
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Day-aware computed values ──
    const currentDay = activeGig?.days?.find(d => !d.ended_at) || null;
    const isDayOpen = !!currentDay;
    // currentDayNumber: open day's number, or the highest closed day's number when all closed
    const currentDayNumber = currentDay?.day_number
        ?? (activeGig?.days?.length ? activeGig.days[activeGig.days.length - 1].day_number : 1);
    const totalDays = activeGig?.days?.length || 0;
    const closedDays = activeGig?.days?.filter(d => d.ended_at) || [];
    const currentDown = currentDay?.downs?.length
        ? currentDay.downs[currentDay.downs.length - 1]
        : null;
    const isDownActive = currentDown && !currentDown.ended_at;

    return (
        <div style={styles.trackerContainer}>
            <AnimatePresence>
                {viewingReceiptUrl && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={styles.lightboxOverlay}
                        onClick={() => setViewingReceiptUrl(null)}
                    >
                        <img src={viewingReceiptUrl} alt="Receipt" style={styles.lightboxImage} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Celebration Day-Close Flash */}
            {showCelebration && (
                <div style={{
                    position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(16,185,129,0.08)',
                    animation: 'celebrationFade 1.8s ease-out forwards',
                }}>
                    <div style={{
                        fontSize: 64, lineHeight: 1,
                        animation: 'celebrationBounce 0.6s ease-out',
                    }}>🎉</div>
                </div>
            )}
            <style>{`
                @keyframes celebrationFade {
                    0%   { opacity: 0; background: rgba(16,185,129,0.15); }
                    20%  { opacity: 1; }
                    80%  { opacity: 1; }
                    100% { opacity: 0; background: rgba(16,185,129,0); }
                }
                @keyframes celebrationBounce {
                    0%   { transform: scale(0.5); opacity: 0; }
                    60%  { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); }
                }
            `}</style>

            {/* TokeDashboard — Dealer Analytics (hidden in standalone mode) */}
            {!standalone && <TokeDashboard userId={userId} refreshTrigger={completedGigs.length} />}

            {/* ── VENUE INTELLIGENCE (hidden in standalone mode) ── */}
            {!standalone && <VenueIntelligence gigs={completedGigs} />}

            {/* ── TAX SUMMARY BUTTON ── */}
            {completedGigs.length > 0 && (
                <button style={styles.taxSummaryBtn} onClick={() => setShowTaxSummary(true)}>
                    📄 Annual Tax Summary &amp; PDF Export
                </button>
            )}

            {/* ── MONTHLY INCOME GOAL ── */}
            {(monthlyGoal > 0 || showGoalEdit) && (
                <div style={styles.goalCard}>
                    <div style={styles.goalHeader}>
                        <span style={styles.goalTitle}>Monthly Goal</span>
                        <button style={styles.goalEditBtn} onClick={() => { setGoalInput(String(monthlyGoal)); setShowGoalEdit(true); }}>Edit</button>
                    </div>
                    {showGoalEdit ? (
                        <div style={styles.goalEditRow}>
                            <input
                                type="number"
                                style={styles.goalInput}
                                placeholder="Monthly $ goal"
                                value={goalInput}
                                onChange={e => setGoalInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && saveGoal()}
                                autoFocus
                            />
                            <button style={styles.goalSaveBtn} onClick={saveGoal}>Save</button>
                            <button style={styles.goalCancelBtn} onClick={() => setShowGoalEdit(false)}>×</button>
                        </div>
                    ) : (() => {
                        const pct = monthlyGoal > 0 ? Math.min(100, (currentMonthTokes / monthlyGoal) * 100) : 0;
                        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
                        const daysLeft = daysInMonth - new Date().getDate();
                        const barColor = pct >= 80 ? '#36bb6a' : pct >= 50 ? '#f59e0b' : '#f02849';
                        return (
                            <>
                                <div style={styles.goalText}>
                                    You're at <strong style={{ color: barColor }}>${currentMonthTokes.toFixed(0)}</strong> of <strong>${monthlyGoal.toLocaleString()}</strong> ({pct.toFixed(0)}%) — {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                                </div>
                                <div style={styles.goalBarBg}>
                                    <div style={{ ...styles.goalBarFill, width: `${pct}%`, background: barColor }} />
                                </div>
                            </>
                        );
                    })()}
                </div>
            )}
            {!monthlyGoal && !showGoalEdit && (
                <button style={styles.setGoalBtn} onClick={() => setShowGoalEdit(true)}>Set Monthly Income Goal</button>
            )}

            {/* ── ACTIVE GIG VIEW ── */}
            {activeGig && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.activeGigCard}
                >
                    {/* Delete X */}
                    <button onClick={() => setConfirmDelete(true)} style={styles.deleteX} title="Delete Event">✕</button>

                    <div style={styles.activeHeader}>
                        <div style={styles.activeLed} />
                        <span style={styles.activeLabel}>LIVE EVENT</span>
                        <span style={{
                            marginLeft: 'auto', fontSize: 12, fontWeight: 700,
                            background: isDayOpen ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                            color: isDayOpen ? '#f59e0b' : '#94a3b8',
                            border: `1px solid ${isDayOpen ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 20, padding: '3px 10px',
                        }}>
                            {isDayOpen ? `Day ${currentDayNumber} — In Progress` : `Day ${currentDayNumber} — Closed`}
                        </span>
                    </div>

                    {/* Gig Info (view vs edit) */}
                    {!editMode ? (
                        <>
                            <h2 style={styles.activeGigName}>{activeGig.venue_name}</h2>
                            {activeGig.venue_address && (
                                <p style={styles.activeGigAddress}>{activeGig.venue_address}</p>
                            )}
                            <p style={styles.activeGigMeta}>
                                Started {new Date(activeGig.start_date + 'T12:00:00').toLocaleDateString()}
                                {' · '}{totalDays} day{totalDays !== 1 ? 's' : ''} total
                                {activeGig.hourly_rate > 0 && ` · $${activeGig.hourly_rate}/hr`}
                            </p>
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 12px' }}>
                            <label style={styles.formLabel}>Venue / Location</label>
                            <VenueSelector
                                value={editForm.venue_name}
                                venueType={editForm.venue_type || 'casino'}
                                userId={userId}
                                onChange={(name, venueType, pokerVenueId) => {
                                    const match = locations.find(l => l.name.toLowerCase() === (name || '').toLowerCase());
                                    setEditForm(prev => ({
                                        ...prev,
                                        venue_name: name,
                                        venue_address: match?.state || prev.venue_address,
                                    }));
                                }}
                            />
                            <input
                                type="number" value={editForm.hourly_rate}
                                onChange={e => setEditForm({ ...editForm, hourly_rate: e.target.value })}
                                style={styles.formInput} step="0.01"
                            />
                            <textarea
                                value={editForm.notes}
                                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                style={{ ...styles.formInput, minHeight: 60, resize: 'vertical' }}
                            />
                        </div>
                    )}

                    {/* Running Totals */}
                    {!editMode && (
                        <div style={{ ...styles.runningStats, gridTemplateColumns: 'repeat(4, 1fr)' }}>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Total Tokes</span>
                                <span style={{ ...styles.runningStatValue, color: '#f59e0b' }}>
                                    {formatCurrency(activeGig.totalTokes || 0)}
                                </span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Downs</span>
                                <span style={styles.runningStatValue}>{activeGig.totalDowns || 0}</span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Hours</span>
                                <span style={styles.runningStatValue}>
                                    {(activeGig.totalHoursWorked || 0).toFixed(1)}h
                                </span>
                            </div>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Expenses</span>
                                <span style={{ ...styles.runningStatValue, color: '#ef4444' }}>
                                    {formatCurrency(activeGig.totalExpenses || 0)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ── CLOSED DAYS SUMMARY ── */}
                    {!editMode && closedDays.length > 0 && closedDays.map(day => (
                        <div key={day.id} style={styles.closedDayCard}>
                            <button
                                style={styles.closedDayHeader}
                                onClick={() => setCollapsedDays(prev => ({ ...prev, [day.id]: !prev[day.id] }))}
                            >
                                <span style={styles.closedDayLabel}>Day {day.day_number} — {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                <span style={styles.closedDayStats}>
                                    <span style={{ color: '#f59e0b' }}>{formatCurrency(day.totalTokes || 0)}</span>
                                    <span style={{ color: '#94a3b8' }}>·</span>
                                    <span>{day.totalDowns || 0} downs</span>
                                    <span style={{ color: '#94a3b8' }}>·</span>
                                    <span>{(day.totalHoursWorked || 0).toFixed(1)}h</span>
                                </span>
                                <span style={{ color: '#64748b', fontSize: 12 }}>{collapsedDays[day.id] ? '▸' : '▾'}</span>
                            </button>
                            {!collapsedDays[day.id] && day.downs && day.downs.length > 0 && (
                                <div style={styles.closedDayDowns}>
                                    {day.downs.map(down => {
                                        const typeColor = DOWN_TYPE_COLORS[down.down_type] || '#64748b';
                                        const duration = down.ended_at
                                            ? new Date(down.ended_at).getTime() - new Date(down.started_at).getTime()
                                            : 0;
                                        return (
                                            <div key={down.id} style={{ ...styles.downRow, borderLeft: `2px solid ${typeColor}`, opacity: 0.8 }}>
                                                <div style={styles.downInfo}>
                                                    <span style={{ ...styles.downTypeBadge, background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44` }}>
                                                        {DOWN_TYPE_LABELS[down.down_type]}{down.is_double_down && ' (x2)'}
                                                    </span>
                                                    {down.game_type && <span style={styles.downDetail}>{down.game_type}</span>}
                                                    {down.table_number && <span style={styles.downDetail}>T{down.table_number}</span>}
                                                    <span style={styles.downTime}>{formatDuration(duration)}</span>
                                                </div>
                                                <div style={styles.downRight}>
                                                    {(down.toke_amount || 0) > 0 && <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 12 }}>{formatCurrency(down.toke_amount)}</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {/* Closed day expenses */}
                            {!collapsedDays[day.id] && day.expenses && day.expenses.length > 0 && (
                                <div style={{ ...styles.closedDayDowns, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6 }}>
                                    {day.expenses.map(exp => (
                                        <div key={exp.id} style={{ ...styles.downRow, borderLeft: '2px solid rgba(239,68,68,0.4)', opacity: 0.8 }}>
                                            <div style={styles.downInfo}>
                                                <span style={{ ...styles.downTypeBadge, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', fontSize: 10 }}>
                                                    {EXPENSE_CATEGORIES.find(c => c.id === exp.category)?.label || exp.category}
                                                </span>
                                                {exp.description && <span style={styles.downDetail}>{exp.description}</span>}
                                            </div>
                                            <div style={styles.downRight}>
                                                <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 12 }}>-{formatCurrency(exp.amount)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* ── CURRENT DAY DOWNS ── */}
                    {!editMode && isDayOpen && currentDay && currentDay.downs && currentDay.downs.length > 0 && (
                        <div style={styles.downsSection}>
                            <h4 style={styles.downsSectionTitle}>Day {currentDayNumber} Downs ({currentDay.downs.length})</h4>
                            <div style={styles.downsScroll} data-scrollable>
                                {[...currentDay.downs].reverse().map(down => {
                                    const isOpen = !down.ended_at;
                                    const duration = isOpen
                                        ? Date.now() - new Date(down.started_at).getTime()
                                        : new Date(down.ended_at).getTime() - new Date(down.started_at).getTime();
                                    const typeColor = DOWN_TYPE_COLORS[down.down_type] || '#64748b';
                                    return (
                                        <div key={down.id} style={{ ...styles.downRow, borderLeft: `3px solid ${typeColor}` }}>
                                            <div style={styles.downInfo}>
                                                <span style={{ ...styles.downTypeBadge, background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44` }}>
                                                    {DOWN_TYPE_LABELS[down.down_type]}{down.is_double_down && ' (x2)'}
                                                </span>
                                                {down.tournament_name && <span style={styles.downDetail}>{down.tournament_name}</span>}
                                                {down.tournament_buyin && parseFloat(down.tournament_buyin) > 0 && (
                                                    <span style={{ ...styles.downDetail, color: '#a78bfa', fontWeight: 600 }}>
                                                        ${parseFloat(down.tournament_buyin).toLocaleString()} buy-in
                                                    </span>
                                                )}
                                                {down.game_type && <span style={styles.downDetail}>{down.game_type}</span>}
                                                {down.table_number && <span style={styles.downDetail}>T{down.table_number}</span>}
                                                <span style={styles.downTime}>
                                                    {new Date(down.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                                    {' · '}{formatDuration(duration)}
                                                </span>
                                            </div>
                                            <div style={styles.downRight}>
                                                {(down.down_type === 'cash' || down.down_type === 'brush') && (
                                                    editingTokeId === down.id ? (
                                                        <div style={styles.tokeEditRow}>
                                                            <input type="number" value={tokeEditValue} onChange={e => setTokeEditValue(e.target.value)} placeholder="$0" style={styles.tokeInput} autoFocus step="0.01" />
                                                            <button onClick={() => handleSaveToke(down.id)} style={styles.tokeSaveBtn}>✓</button>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => { setEditingTokeId(down.id); setTokeEditValue(down.toke_amount || ''); }} style={{ ...styles.tokeDisplay, color: (down.toke_amount || 0) > 0 ? '#f59e0b' : '#64748b' }} title="Edit Toke">
                                                            {(down.toke_amount || 0) > 0 ? formatCurrency(down.toke_amount) : '+ Toke'}
                                                        </button>
                                                    )
                                                )}
                                                {down.down_type === 'tournament' && (
                                                    editingMultiplierId === down.id ? (
                                                        <div style={styles.tokeEditRow}>
                                                            <select value={multiplierEditValue} onChange={e => setMultiplierEditValue(e.target.value)} style={{ ...styles.tokeInput, width: 70 }}>
                                                                <option value="1">1.0x</option>
                                                                <option value="1.2">1.2x</option>
                                                                <option value="1.5">1.5x</option>
                                                                <option value="2">2.0x</option>
                                                            </select>
                                                            <button onClick={() => handleSaveMultiplier(down.id)} style={styles.tokeSaveBtn}>✓</button>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => { setEditingMultiplierId(down.id); setMultiplierEditValue(down.down_multiplier || 1); }} style={{ ...styles.tokeDisplay, color: (down.down_multiplier || 1) > 1 ? '#8b5cf6' : '#64748b' }} title="Down Multiplier">
                                                            {(down.down_multiplier || 1).toFixed(1)}x
                                                        </button>
                                                    )
                                                )}
                                                {isOpen && <button onClick={() => handleEndDown(down.id)} style={styles.endDownSmallBtn}>End</button>}
                                                <button onClick={() => { if (confirm('Delete this down?')) handleDeleteDown(down.id); }} style={styles.downDeleteBtn}>✕</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── CURRENT DAY EXPENSES ── */}
                    {!editMode && isDayOpen && currentDay && currentDay.expenses && currentDay.expenses.length > 0 && (
                        <div style={{ ...styles.downsSection, marginTop: 8 }}>
                            <h4 style={styles.downsSectionTitle}>Day {currentDayNumber} Expenses ({currentDay.expenses.length})</h4>
                            <div style={styles.downsScroll}>
                                {currentDay.expenses.map(exp => (
                                    <div key={exp.id} style={{ ...styles.downRow, borderLeft: '3px solid #ef4444' }}>
                                        <div style={styles.downInfo}>
                                            <span style={{ ...styles.downTypeBadge, background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                                {EXPENSE_CATEGORIES.find(c => c.id === exp.category)?.label || exp.category}
                                            </span>
                                            {exp.receipt_url && <button style={styles.receiptIconBtn} onClick={() => setViewingReceiptUrl(exp.receipt_url)} title="View Receipt"><Camera size={14} color="#ef4444" /></button>}
                                            {exp.description && <span style={styles.downDetail}>{exp.description}</span>}
                                        </div>
                                        <div style={styles.downRight}>
                                            <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>-{formatCurrency(exp.amount)}</span>
                                            <button onClick={() => handleDeleteExpense(exp.id)} style={styles.downDeleteBtn}>✕</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={styles.activeActions}>
                        {editMode ? (
                            <>
                                <button onClick={handleSaveEdit} style={styles.completeBtn}>Save Changes</button>
                                <button onClick={() => setEditMode(false)} style={styles.cancelEditBtn}>Cancel</button>
                            </>
                        ) : confirmCloseDay ? (
                            <div style={{ ...styles.confirmRow, flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                                <span style={styles.confirmText}>Close out Day {currentDayNumber}? Add a note (optional):</span>
                                <input
                                    type="text"
                                    value={closeDayNotes}
                                    onChange={e => setCloseDayNotes(e.target.value)}
                                    placeholder="e.g. Short-handed all night, big tipped table..."
                                    style={{ ...styles.formInput, width: '100%', padding: '8px 12px', fontSize: 13 }}
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleCloseDay(); }}
                                />
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={handleCloseDay} style={styles.confirmYes}>✓ Close Day</button>
                                    <button onClick={() => { setConfirmCloseDay(false); setCloseDayNotes(''); }} style={styles.confirmNo}>Cancel</button>
                                </div>
                            </div>
                        ) : !confirmComplete ? (
                            <>
                                <button onClick={startEditing} style={styles.editBtn}>Edit</button>
                                {isDayOpen && <button onClick={() => setShowAddDown(true)} style={styles.addDownBtn}>+ Add Down</button>}
                                {isDayOpen && <button onClick={() => setShowAddExpense(true)} style={styles.addExpenseBtn}>+ Expense</button>}
                                {isDayOpen && <button onClick={() => setConfirmCloseDay(true)} style={styles.closeDayBtn}>✓ Close Day {currentDayNumber}</button>}
                                {!isDayOpen && <button onClick={handleStartNewDay} style={styles.startDayBtn}>▶ Start Day {(activeGig?.days?.length || 0) + 1}</button>}
                                {!isDayOpen && <button onClick={() => setConfirmComplete(true)} style={styles.completeBtn}>✓ Complete Event</button>}
                            </>
                        ) : (
                            <div style={{ ...styles.confirmRow, flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span style={styles.confirmText}>Finalize This Event? Enter Total Mileage:</span>
                                <div style={{ display: 'flex', gap: 10, width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                        type="number"
                                        value={mileageInput}
                                        onChange={e => setMileageInput(e.target.value)}
                                        placeholder="0 miles"
                                        style={{ ...styles.formInput, width: 100, padding: '8px 12px' }}
                                    />
                                    {mileageInput && parseFloat(mileageInput) > 0 && (() => {
                                        const yr = new Date().getFullYear();
                                        const IRS = { 2025: 0.70, 2024: 0.67, 2023: 0.655, 2022: 0.585, 2021: 0.56 };
                                        const rate = IRS[yr] || 0.67;
                                        return (
                                            <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                {parseFloat(mileageInput).toLocaleString()} mi × ${rate}/mi = <strong>${(parseFloat(mileageInput) * rate).toFixed(2)} deductible</strong>
                                            </span>
                                        );
                                    })()}
                                    <button onClick={() => handleCompleteGig(mileageInput)} style={styles.confirmYes}>Yes, Complete</button>
                                    <button onClick={() => setConfirmComplete(false)} style={styles.confirmNo}>Cancel</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Delete Confirmation */}
                    <AnimatePresence>
                        {confirmDelete && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={styles.deleteOverlay}>
                                <div style={styles.deletePopup}>
                                    <p style={styles.deletePopupText}>Delete This Event And All Downs?</p>
                                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                        <button onClick={handleDeleteGig} style={styles.deleteConfirmBtn}>Yes, Delete</button>
                                        <button onClick={() => setConfirmDelete(false)} style={styles.deleteCancelBtn}>Cancel</button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* ── CREATE EVENT ── */}
            {!activeGig && !showCreateForm && (
                <motion.button
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={() => setShowCreateForm(true)}
                    style={styles.createGigBtn}
                >
                    <div>
                        <div style={styles.createGigTitle}>Start A New Event</div>
                        <div style={styles.createGigSub}>Track Downs, Tokes, Income And Expenses</div>
                    </div>
                </motion.button>
            )}

            <AnimatePresence>
                {showCreateForm && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={handleCreateGig}
                        style={styles.createForm}
                    >
                        <h3 style={styles.formTitle}>New Event</h3>

                        <label style={styles.formLabel}>Venue / Location</label>
                        <VenueSelector
                            value={newGig.venue_name}
                            venueType={newGig.venue_type}
                            userId={userId}
                            onChange={(name, venueType, pokerVenueId, lat, lng) => {
                                const match = locations.find(l => l.name.toLowerCase() === (name || '').toLowerCase());
                                setNewGig(prev => ({
                                    ...prev,
                                    venue_name: name,
                                    location_id: match ? match.id : null,
                                    venue_type: venueType,
                                    poker_venue_id: pokerVenueId,
                                    latitude: lat,
                                    longitude: lng,
                                    venue_address: match?.state || '',
                                }));
                            }}
                        />

                        <label style={styles.formLabel}>Start Date</label>
                        <input
                            type="date" value={newGig.start_date}
                            onChange={e => setNewGig({ ...newGig, start_date: e.target.value })}
                            style={styles.formInput}
                        />

                        <label style={styles.formLabel}>Hourly Pay Rate</label>
                        <input
                            type="number" value={newGig.hourly_rate}
                            onChange={e => setNewGig({ ...newGig, hourly_rate: e.target.value })}
                            placeholder="e.g. 15.00" step="0.01" style={styles.formInput}
                        />

                        <label style={styles.formLabel}>Notes</label>
                        <textarea
                            value={newGig.notes}
                            onChange={e => setNewGig({ ...newGig, notes: e.target.value })}
                            placeholder="Any notes..." style={{ ...styles.formInput, minHeight: 60, resize: 'vertical' }}
                        />

                        <div style={styles.formActions}>
                            <button type="submit" style={styles.formSubmitBtn}>Start Event</button>
                            <button type="button" onClick={() => setShowCreateForm(false)} style={styles.formCancelBtn}>Cancel</button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* ── TOKE-ON-END MODAL ── */}
            <AnimatePresence>
                {endingDown && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={styles.modalOverlay}
                        onClick={() => { setEndingDown(null); setEndTokeValue(''); }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            style={{ ...styles.modalCard, maxWidth: 340, padding: '24px 20px' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                                How much did you toke?
                            </h3>
                            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px' }}>
                                {endingDown.game_type || endingDown.down_type}
                                {endingDown.table_number ? ` · Table ${endingDown.table_number}` : ''}
                            </p>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <span style={{ fontSize: 22, color: '#f59e0b', fontWeight: 800 }}>$</span>
                                <input
                                    type="number"
                                    value={endTokeValue}
                                    onChange={e => setEndTokeValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleEndDownConfirm(); }}
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0"
                                    autoFocus
                                    style={{
                                        flex: 1, padding: '12px 14px', background: 'rgba(0,0,0,0.4)',
                                        border: '2px solid rgba(245,158,11,0.4)', borderRadius: 10,
                                        color: '#fff', fontSize: 22, fontWeight: 700, outline: 'none',
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                <button
                                    onClick={handleEndDownConfirm}
                                    style={{ ...styles.confirmYes, flex: 1, padding: '12px', fontSize: 15, fontWeight: 800 }}
                                >
                                    ✓ End Down
                                </button>
                                <button
                                    onClick={() => { setEndingDown(null); setEndTokeValue(''); }}
                                    style={styles.confirmNo}
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── ADD DOWN MODAL ── */}
            <AnimatePresence>
                {showAddDown && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={styles.modalOverlay}
                    >
                        <motion.div
                            id="toke-pure-modal"
                            className="toke-modal-card"
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            style={styles.modalCard}
                        >
                            <style>{`
                                #toke-pure-modal.toke-modal-card {
                                    border: none !important;
                                    box-shadow: none !important;
                                    background-color: transparent !important;
                                }
                                #toke-pure-modal button.toke-img-map-element,
                                #toke-pure-modal input.toke-img-map-element,
                                #toke-pure-modal select.toke-img-map-element {
                                    border: none !important;
                                    outline: none !important;
                                    box-shadow: none !important;
                                    background-color: transparent !important;
                                    -webkit-tap-highlight-color: transparent !important;
                                    -webkit-appearance: none !important;
                                    appearance: none !important;
                                }
                                #toke-pure-modal button.toke-img-map-element:focus,
                                #toke-pure-modal button.toke-img-map-element:hover,
                                #toke-pure-modal button.toke-img-map-element:active {
                                    border: none !important;
                                    outline: none !important;
                                    box-shadow: none !important;
                                    background-color: transparent !important;
                                }
                                #toke-pure-modal select.toke-img-map-element option {
                                    background-color: #1a1a1a !important;
                                    color: #fff !important;
                                }
                            `}</style>
                            {/* ── IMAGE-MAPPED INTERACTIVE ZONES ── */}

                            {/* Down Type Selection Zones */}
                            <button
                                className="toke-img-map-element"
                                onClick={() => setDownForm({ ...downForm, down_type: 'cash' })}
                                style={{ ...styles.imgMapBtn, top: '12.5%', left: '8%', width: '41%', height: '16.5%' }}
                                title="Cash Game"
                            />
                            <button
                                className="toke-img-map-element"
                                onClick={() => setDownForm({ ...downForm, down_type: 'tournament' })}
                                style={{ ...styles.imgMapBtn, top: '12.5%', left: '51%', width: '41%', height: '16.5%' }}
                                title="Tournament"
                            />
                            <button
                                className="toke-img-map-element"
                                onClick={() => setDownForm({ ...downForm, down_type: 'break' })}
                                style={{ ...styles.imgMapBtn, top: '31%', left: '8%', width: '41%', height: '16.5%' }}
                                title="On Break"
                            />
                            <button
                                className="toke-img-map-element"
                                onClick={() => setDownForm({ ...downForm, down_type: 'brush' })}
                                style={{ ...styles.imgMapBtn, top: '31%', left: '51%', width: '41%', height: '16.5%' }}
                                title="Brush"
                            />

                            {/* Game Type Input Zone */}
                            {(downForm.down_type === 'cash' || downForm.down_type === 'tournament') && (
                                <div style={{ position: 'absolute', top: '55%', left: '7%', width: '86%', height: '9%', display: 'flex' }}>
                                    {downForm.down_type === 'cash' ? (
                                        <select
                                            className="toke-img-map-element"
                                            value={downForm.cash_variant}
                                            onChange={e => setDownForm({ ...downForm, cash_variant: e.target.value })}
                                            style={{ ...styles.imgMapInput, textAlign: 'left', paddingLeft: 12 }}
                                        >
                                            <option value="Holdem">Holdem</option>
                                            <option value="PLO">PLO</option>
                                            <option value="Mixed">Mixed</option>
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            className="toke-img-map-element"
                                            value={downForm.tournament_name || ''}
                                            onChange={e => setDownForm({ ...downForm, tournament_name: e.target.value })}
                                            style={{ ...styles.imgMapInput, textAlign: 'left', paddingLeft: 12 }}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Table Number Input Zone */}
                            {(downForm.down_type === 'cash' || downForm.down_type === 'tournament') && (
                                <div style={{ position: 'absolute', top: '70%', left: '7%', width: '86%', height: '9%', display: 'flex' }}>
                                    <input
                                        type="text"
                                        className="toke-img-map-element"
                                        value={downForm.table_number || ''}
                                        onChange={e => setDownForm({ ...downForm, table_number: e.target.value })}
                                        style={{ ...styles.imgMapInput, textAlign: 'left', paddingLeft: 12 }}
                                    />
                                </div>
                            )}

                            {/* Action Buttons */}
                            <button
                                className="toke-img-map-element"
                                onClick={handleAddDown}
                                style={{ ...styles.imgMapBtn, top: '82.5%', left: '9%', width: '56.5%', height: '9%' }}
                                title="Start Down"
                            />
                            <button
                                className="toke-img-map-element"
                                onClick={() => setShowAddDown(false)}
                                style={{ ...styles.imgMapBtn, top: '82.5%', left: '68.5%', width: '22.5%', height: '9%' }}
                                title="Cancel"
                            />
                        </motion.div>

                        {/* Tournament Buy-In — OUTSIDE image overlay (normal flow, no overlap) */}
                        {downForm.down_type === 'tournament' && (
                            <div style={{ padding: '10px 16px 2px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Buy-In Amount (optional)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 14, color: '#B0B3B8' }}>$</span>
                                    <input
                                        type="number"
                                        value={downForm.tournament_buyin || ''}
                                        onChange={e => setDownForm({ ...downForm, tournament_buyin: e.target.value })}
                                        placeholder="e.g. 200"
                                        style={{ ...styles.formInput, flex: 1, padding: '8px 12px', fontSize: 14 }}
                                    />
                                    {downForm.tournament_buyin && parseFloat(downForm.tournament_buyin) > 0 && (
                                        <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            Tracked for analysis
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── ADD EXPENSE MODAL ── */}
            <AnimatePresence>
                {showAddExpense && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={styles.modalOverlay}
                        onClick={() => { setShowAddExpense(false); setShowScanner(false); }}
                    >
                        {showScanner ? (
                            <div style={{ width: '100%', maxWidth: 450 }} onClick={e => e.stopPropagation()}>
                                <ReceiptScanner
                                    userId={userId}
                                    onScanComplete={({ imageUrl }) => {
                                        setExpenseForm({ ...expenseForm, receipt_url: imageUrl });
                                        setShowScanner(false);
                                    }}
                                />
                                <button type="button" onClick={() => setShowScanner(false)} style={{ ...styles.formCancelBtn, width: '100%', marginTop: 12 }}>Cancel Scan</button>
                            </div>
                        ) : (
                            <motion.form
                                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                                style={{ ...styles.promptCard, border: '2px solid rgba(239,68,68,0.4)' }}
                                onClick={e => e.stopPropagation()}
                                onSubmit={handleAddExpense}
                            >
                                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#E4E6EB', margin: '0 0 16px' }}>Add Expense</h3>

                                <label style={styles.formLabel}>Category</label>
                                <select
                                    value={expenseForm.category}
                                    onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                                    style={styles.formSelect}
                                >
                                    {EXPENSE_CATEGORIES.map(c => (
                                        <option key={c.id} value={c.id}>{c.label}</option>
                                    ))}
                                </select>

                                <label style={{ ...styles.formLabel, marginTop: 12 }}>Amount ($)</label>
                                <input
                                    type="number"
                                    value={expenseForm.amount}
                                    onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                    style={styles.formInput}
                                    step="0.01"
                                    autoFocus
                                />

                                <label style={{ ...styles.formLabel, marginTop: 12 }}>Description (optional)</label>
                                <input
                                    type="text"
                                    value={expenseForm.description}
                                    onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                                    style={styles.formInput}
                                />

                                <div style={{ marginTop: 16 }}>
                                    {expenseForm.receipt_url ? (
                                        <div style={styles.attachedReceiptBox}>
                                            <ImageIcon size={16} color="#10b981" />
                                            <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>Receipt Attached</span>
                                            <button type="button" onClick={() => setExpenseForm({ ...expenseForm, receipt_url: null })} style={styles.removeReceiptBtn}>✕</button>
                                        </div>
                                    ) : (
                                        <button type="button" onClick={() => setShowScanner(true)} style={styles.scanReceiptBtn}>
                                            <Camera size={16} /> Scan Receipt
                                        </button>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                    <button type="submit" style={{ ...styles.formSubmitBtn, background: '#ef4444', color: '#fff' }}>Add Expense</button>
                                    <button type="button" onClick={() => setShowAddExpense(false)} style={styles.formCancelBtn}>Cancel</button>
                                </div>
                            </motion.form>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── DOUBLE DOWN PROMPT ── */}
            <AnimatePresence>
                {showDoubleDownPrompt && promptDown && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={styles.modalOverlay}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            style={styles.promptCard}
                        >
                            <div style={styles.promptIcon}>35m</div>
                            <h3 style={styles.promptTitle}>
                                {promptDown.down_type === 'break' ? 'Still On Break?' :
                                    promptDown.down_type === 'brush' ? 'Still Brushing?' :
                                        'Same Table — Double Down?'}
                            </h3>
                            <p style={styles.promptSub}>
                                {promptDown.down_type === 'break' ? 'Your break has been going 35 minutes.' :
                                    promptDown.down_type === 'brush' ? 'Your brush down has been 35 minutes.' : (
                                        <>
                                            <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                                                {promptDown.game_type || DOWN_TYPE_LABELS[promptDown.down_type]}
                                                {promptDown.table_number ? ` · Table ${promptDown.table_number}` : ''}
                                            </span>
                                            {' — still at this table after 35 minutes?'}
                                        </>
                                    )}
                            </p>
                            <div style={styles.promptActions}>
                                <button onClick={handleDoubleDownYes} style={styles.promptYesBtn}>
                                    Yes, Double Down
                                </button>
                                <button onClick={handleDoubleDownNo} style={styles.promptNoBtn}>
                                    No, New Down
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── COMPLETED EVENTS ── */}
            <div style={styles.historySection}>
                <h3 style={styles.historyTitle}>Completed Events</h3>
                {isLoading ? (
                    <div style={styles.loadingPlaceholder}>Loading Events...</div>
                ) : completedGigs.length === 0 ? (
                    <div style={styles.emptyState}>No Completed Events Yet. Start Your First Event Above!</div>
                ) : (
                    <div style={styles.gigGrid}>
                        {completedGigs.map(gig => (
                            <motion.div
                                key={gig.id}
                                whileHover={{ scale: 1.02 }}
                                onClick={() => handleViewReport(gig.id)}
                                style={styles.gigCard}
                            >
                                <div style={styles.gigCardHeader}>
                                    <h4 style={styles.gigCardName}>{gig.venue_name}</h4>
                                    <span style={{ ...styles.gigCardTokes, color: '#f59e0b' }}>
                                        {formatCurrency(gig.totalTokes || 0)}
                                    </span>
                                </div>
                                <div style={styles.gigCardMeta}>
                                    <span>{new Date(gig.start_date + 'T12:00:00').toLocaleDateString()}</span>
                                    {gig.end_date && <span> — {new Date(gig.end_date + 'T12:00:00').toLocaleDateString()}</span>}
                                </div>
                                <div style={styles.gigCardFooter}>
                                    <span>{gig.totalDowns || 0} downs · {(gig.totalHoursWorked || 0).toFixed(1)}h</span>
                                    <span style={styles.viewReportLink}>View Report →</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── JARVIS DEALER REFERENCE PANEL ── */}
            <div style={styles.jarvisPanel}>
                <button style={styles.jarvisPanelHeader} onClick={() => setJarvisExpanded(e => !e)}>
                    <span style={styles.jarvisHeaderLeft}>
                        <span style={styles.jarvisIcon}>🤖</span>
                        <div>
                            <div style={styles.jarvisTitle}>Jarvis — Dealer Reference</div>
                            <div style={styles.jarvisSub}>Ask for rules, TDA lookups & game refreshers</div>
                        </div>
                    </span>
                    <span style={{ ...styles.jarvisChevron, transform: jarvisExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                </button>

                <AnimatePresence>
                    {jarvisExpanded && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden' }}
                        >
                            {/* Quick-pick chips */}
                            <div style={styles.jarvisChips}>
                                {JARVIS_CHIPS.map(chip => (
                                    <button
                                        key={chip}
                                        onClick={() => handleAskJarvis(chip)}
                                        style={styles.jarvisChip}
                                        disabled={jarvisLoading}
                                    >
                                        {chip}
                                    </button>
                                ))}
                            </div>

                            {/* Input row */}
                            <div style={styles.jarvisInputRow}>
                                <input
                                    type="text"
                                    value={jarvisQuery}
                                    onChange={e => setJarvisQuery(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAskJarvis(); }}
                                    placeholder="Ask Jarvis anything about dealing..."
                                    style={styles.jarvisInput}
                                    disabled={jarvisLoading}
                                />
                                <button
                                    onClick={() => handleAskJarvis()}
                                    style={styles.jarvisAskBtn}
                                    disabled={jarvisLoading || !jarvisQuery.trim()}
                                >
                                    {jarvisLoading ? '...' : 'Ask'}
                                </button>
                            </div>

                            {/* Answer area */}
                            {jarvisLoading && (
                                <div style={styles.jarvisLoading}>
                                    <span style={styles.jarvisLoadingDot} />
                                    Jarvis is thinking...
                                </div>
                            )}
                            {jarvisAnswer && !jarvisLoading && (
                                <div style={styles.jarvisAnswer}>
                                    <div style={styles.jarvisAnswerLabel}>🤖 Jarvis</div>
                                    <div style={styles.jarvisAnswerText}>{jarvisAnswer}</div>
                                </div>
                            )}

                            {/* History (last 3 previous Q&As) */}
                            {jarvisHistory.length > 0 && !jarvisAnswer && (
                                <div style={styles.jarvisHistory}>
                                    {jarvisHistory.slice(-3).reverse().map((item, i) => (
                                        <div key={i} style={styles.jarvisHistoryItem}>
                                            <div style={styles.jarvisHistoryQ}>Q: {item.question}</div>
                                            <div style={styles.jarvisHistoryA}>{item.answer}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── DEALER VAULT (hidden in standalone mode) ── */}
            {!standalone && <DealerVault userId={userId} completedGigs={completedGigs} />}

            {/* ── YEARLY CALENDAR (hidden in standalone mode) ── */}
            {!standalone && (
                <div style={styles.calendarWrapper}>
                    <TokeCalendar userId={userId} />
                </div>
            )}
            {/* ── TAX SUMMARY MODAL ── */}
            {showTaxSummary && (
                <TaxSummaryModal
                    completedGigs={completedGigs}
                    onClose={() => setShowTaxSummary(false)}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// STYLES — Facebook Dark (matches TripTracker)
// ═══════════════════════════════════════════════════════════════
const styles = {
    container: { display: 'flex', flexDirection: 'column', gap: 20 },

    // Active Gig
    activeGigCard: {
        background: '#242526',
        border: '1px solid #3A3B3C',
        borderRadius: 12, padding: 20, position: 'relative',
    },
    activeHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
    activeLed: {
        width: 8, height: 8, borderRadius: '50%', background: '#f59e0b',
        boxShadow: '0 0 8px rgba(245, 158, 11, 0.6)', animation: 'pulse 2s infinite',
    },
    activeLabel: { fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: '#f59e0b', textTransform: 'uppercase' },
    activeGigName: { fontSize: 22, fontWeight: 700, color: '#E4E6EB', margin: '4px 0' },
    activeGigAddress: { fontSize: 13, color: '#B0B3B8', margin: '0 0 4px', fontStyle: 'italic' },
    activeGigMeta: { fontSize: 14, color: '#B0B3B8', margin: '0 0 16px' },

    // Running stats
    runningStats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 },
    runningStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#3A3B3C', borderRadius: 8, padding: '10px 8px' },
    runningStatLabel: { fontSize: 14, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    runningStatValue: { fontSize: 18, fontWeight: 700, color: '#E4E6EB' },

    // Timer
    timerBanner: {
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(245, 158, 11, 0.1)', border: '2px solid rgba(245, 158, 11, 0.3)',
        borderRadius: 10, padding: '10px 14px', marginBottom: 16,
    },
    timerIcon: { fontSize: 24 },
    timerInfo: { flex: 1, display: 'flex', flexDirection: 'column' },
    timerLabel: { fontSize: 13, fontWeight: 600, color: '#E4E6EB' },
    timerCountdown: { fontSize: 20, fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace' },
    endDownBtn: {
        background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '2px solid rgba(239,68,68,0.3)',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },

    // Downs list
    downsSection: { marginBottom: 16 },
    downsSectionTitle: { fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 8, letterSpacing: 0.5 },
    downsScroll: { maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 },
    downRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        background: '#3A3B3C', borderRadius: 6, padding: '8px 10px',
    },
    downInfo: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, flex: 1 },
    downTypeBadge: { fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' },
    downDetail: { fontSize: 12, color: '#B0B3B8' },
    downTime: { fontSize: 11, color: '#B0B3B8' },
    downRight: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
    tokeDisplay: {
        background: 'none', border: '1px solid rgba(255,255,255,0.08)', fontSize: 13,
        fontWeight: 700, cursor: 'pointer', padding: '0 6px',
        minWidth: 54, height: 26, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', borderRadius: 4, boxSizing: 'border-box',
    },
    tokeEditRow: { display: 'flex', alignItems: 'center', gap: 4 },
    tokeInput: {
        width: 70, padding: '4px 6px', background: '#242526', border: '1px solid #3A3B3C',
        borderRadius: 4, color: '#fff', fontSize: 13, textAlign: 'right',
    },
    tokeSaveBtn: {
        background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)',
        borderRadius: 4, padding: '4px 8px', fontSize: 13, cursor: 'pointer', fontWeight: 700,
    },
    endDownSmallBtn: {
        background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    },
    downDeleteBtn: {
        background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 4, padding: '2px 6px', fontSize: 12, cursor: 'pointer', color: '#ef4444', lineHeight: 1,
    },

    // Actions
    activeActions: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    editBtn: {
        background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '2px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    addDownBtn: {
        background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '2px solid rgba(245, 158, 11, 0.3)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    addExpenseBtn: {
        background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '2px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    completeBtn: {
        background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '2px solid rgba(16, 185, 129, 0.3)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    cancelEditBtn: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer',
    },
    confirmRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    confirmText: { fontSize: 14, fontWeight: 600, color: '#E4E6EB' },
    confirmYes: {
        background: '#10b981', color: '#fff', border: 'none',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    confirmNo: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
    },

    // Delete
    deleteX: {
        position: 'absolute', top: 10, right: 10, width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6, color: '#8a8d91', fontSize: 14, cursor: 'pointer',
    },
    deleteOverlay: {
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
        borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
    },
    deletePopup: { textAlign: 'center', padding: 20 },
    deletePopupText: { fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 16 },
    deleteConfirmBtn: {
        background: '#ef4444', color: '#fff', border: 'none',
        borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    },
    deleteCancelBtn: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer',
    },

    // Create Gig
    createGigBtn: {
        background: '#242526', border: '1px dashed #3A3B3C',
        borderRadius: 12, padding: '24px 20px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', width: '100%',
    },
    createGigTitle: { fontSize: 18, fontWeight: 700, color: '#E4E6EB' },
    createGigSub: { fontSize: 13, color: '#B0B3B8' },

    // Form
    createForm: {
        background: '#242526', border: '1px solid #3A3B3C',
        borderRadius: 12, padding: 20, overflow: 'hidden',
    },
    formTitle: { fontSize: 18, fontWeight: 700, color: '#E4E6EB', margin: '0 0 16px' },
    formLabel: { fontSize: 13, fontWeight: 600, color: '#B0B3B8', marginBottom: 4, display: 'block', marginTop: 12 },
    formInput: {
        width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        transition: 'border-color 0.2s ease',
    },
    attachedReceiptBox: {
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
        borderRadius: 8, width: '100%', boxSizing: 'border-box'
    },
    removeReceiptBtn: {
        marginLeft: 'auto', background: 'transparent', border: 'none', color: '#10b981',
        fontSize: 16, cursor: 'pointer', padding: 4
    },
    scanReceiptBtn: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', padding: '12px', background: 'transparent',
        border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 8,
        color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.2s'
    },
    receiptIconBtn: {
        background: 'transparent', border: 'none', padding: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginLeft: 8, opacity: 0.8, transition: 'opacity 0.2s'
    },
    lightboxOverlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 11000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    },
    lightboxImage: {
        maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain',
        borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
    },
    formSelect: {
        width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23ffffff\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")',
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
        transition: 'border-color 0.2s ease',
    },
    checkboxRow: {
        display: 'flex', gap: 8, flexWrap: 'wrap',
    },
    checkboxLabel: {
        display: 'flex', alignItems: 'center', padding: '8px 14px',
        borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
        transition: 'all 0.15s ease',
    },
    formActions: { display: 'flex', gap: 10, marginTop: 16 },
    formSubmitBtn: {
        background: '#f59e0b', color: '#000', border: 'none',
        borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', flex: 1,
    },
    formCancelBtn: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer',
    },

    // Modal
    modalOverlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    modalCard: {
        position: 'relative',
        backgroundImage: 'url(/images/toke-add-down-bg.jpg)',
        backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
        border: 'none', padding: 0, backgroundColor: 'transparent',
        width: '100%', maxWidth: 450,
        aspectRatio: '854 / 1018',
        boxShadow: '0 20px 60px rgba(0,0,0,0.8)', overflow: 'hidden',
        display: 'block',
    },
    imgMapBtn: {
        position: 'absolute', background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none',
        WebkitAppearance: 'none', appearance: 'none',
        WebkitTapHighlightColor: 'rgba(0,0,0,0)', boxShadow: 'none'
    },
    imgMapInput: {
        width: '100%', height: '100%', background: 'transparent', border: 'none', color: '#fff', fontSize: 18,
        textAlign: 'left', textAlignLast: 'left', fontWeight: 600, outline: 'none', appearance: 'none',
        WebkitAppearance: 'none', boxShadow: 'none', WebkitTapHighlightColor: 'rgba(0,0,0,0)',
        paddingLeft: 12,
    },

    // Double down prompt
    promptCard: {
        background: '#242526', border: '2px solid rgba(245,158,11,0.4)', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 380, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    promptIcon: { fontSize: 48, marginBottom: 12 },
    promptTitle: { fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px' },
    promptSub: { fontSize: 14, color: '#94a3b8', margin: '0 0 20px' },
    promptActions: { display: 'flex', flexDirection: 'column', gap: 10 },
    promptYesBtn: {
        background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '2px solid rgba(245,158,11,0.4)',
        borderRadius: 10, padding: '12px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    },
    promptNoBtn: {
        background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '2px solid rgba(59,130,246,0.3)',
        borderRadius: 10, padding: '12px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    },

    // History
    historySection: { marginTop: 8 },
    historyTitle: { fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 },
    loadingPlaceholder: { padding: 20, textAlign: 'center', color: '#64748b', fontSize: 14 },
    emptyState: { padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '2px solid rgba(255,255,255,0.06)' },
    gigGrid: { display: 'flex', flexDirection: 'column', gap: 10 },
    gigCard: {
        background: 'rgba(36,37,38,0.8)', border: '2px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s',
    },
    gigCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    gigCardName: { fontSize: 16, fontWeight: 600, color: '#E4E6EB', margin: 0 },
    gigCardTokes: { fontSize: 16, fontWeight: 700 },
    gigCardMeta: { fontSize: 13, color: '#64748b', marginBottom: 6 },
    gigCardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748b' },
    viewReportLink: { color: '#3b82f6', fontWeight: 600 },

    // Report
    backBtn: {
        background: 'none', border: 'none', color: '#3b82f6', fontSize: 14,
        fontWeight: 600, cursor: 'pointer', padding: '4px 0', marginBottom: 8,
    },
    reportCard: {
        background: 'rgba(36,37,38,0.95)', border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 12, padding: 24,
    },
    reportTitle: { fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 4px' },
    reportAddress: { fontSize: 13, color: '#8A8D91', margin: '0 0 4px', fontStyle: 'italic' },
    reportDates: { fontSize: 14, color: '#64748b', margin: '0 0 20px' },
    reportStatsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 },
    reportStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 8px' },
    reportStatLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    reportStatValue: { fontSize: 18, fontWeight: 700, color: '#fff' },
    reportBreakdown: { background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 16 },
    reportBreakdownTitle: { fontSize: 14, fontWeight: 600, color: '#E4E6EB', margin: '0 0 10px' },
    reportBreakdownGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
    breakdownItem: { fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', color: '#94a3b8' },

    // Jarvis Panel
    jarvisPanel: {
        background: '#242526', border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 12, padding: '14px 16px', marginTop: 8,
    },
    jarvisPanelHeader: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%',
    },
    jarvisHeaderLeft: { display: 'flex', alignItems: 'center', gap: 10 },
    jarvisIcon: { fontSize: 26 },
    jarvisTitle: { fontSize: 16, fontWeight: 700, color: '#E4E6EB', textAlign: 'left' },
    jarvisSub: { fontSize: 12, color: '#64748b', marginTop: 1, textAlign: 'left' },
    jarvisChevron: { fontSize: 14, color: '#64748b', transition: 'transform 0.2s', flexShrink: 0 },
    jarvisChips: {
        display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14, marginBottom: 12,
    },
    jarvisChip: {
        fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
        background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
        border: '1px solid rgba(245,158,11,0.25)', transition: 'all 0.15s',
    },
    jarvisInputRow: { display: 'flex', gap: 8, marginBottom: 12 },
    jarvisInput: {
        flex: 1, padding: '10px 12px', background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
        color: '#fff', fontSize: 14, outline: 'none',
    },
    jarvisAskBtn: {
        background: '#f59e0b', color: '#000', border: 'none',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700,
        cursor: 'pointer', flexShrink: 0,
        opacity: 1, transition: 'opacity 0.15s',
    },
    jarvisLoading: {
        display: 'flex', alignItems: 'center', gap: 8,
        color: '#f59e0b', fontSize: 13, fontWeight: 600, padding: '10px 0',
    },
    jarvisLoadingDot: {
        width: 8, height: 8, borderRadius: '50%', background: '#f59e0b',
        animation: 'pulse 1s infinite',
    },
    jarvisAnswer: {
        background: 'rgba(0,0,0,0.25)', borderRadius: 10,
        padding: 14, border: '1px solid rgba(245,158,11,0.15)',
    },
    jarvisAnswerLabel: { fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
    jarvisAnswerText: { fontSize: 13, color: '#E4E6EB', lineHeight: 1.65, whiteSpace: 'pre-wrap' },
    jarvisHistory: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 },
    jarvisHistoryItem: {
        background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: '10px 12px',
        border: '1px solid rgba(255,255,255,0.05)',
    },
    taxSummaryBtn: {
        width: '100%', padding: '13px', background: 'rgba(54,187,106,0.08)',
        border: '1px dashed rgba(54,187,106,0.4)', borderRadius: 10,
        color: '#36bb6a', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        textAlign: 'center',
    },
    jarvisHistoryQ: { fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 4 },
    jarvisHistoryA: { fontSize: 12, color: '#B0B3B8', lineHeight: 1.55, whiteSpace: 'pre-wrap' },

    // Monthly Income Goal
    goalCard: {
        background: '#242526', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '16px 20px',
    },
    goalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    goalTitle: { fontSize: 15, fontWeight: 700, color: '#E4E6EB' },
    goalEditBtn: {
        padding: '4px 12px', background: 'rgba(74,144,217,0.15)', border: '1px solid #4A90D9',
        borderRadius: 6, color: '#4A90D9', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    },
    goalText: { fontSize: 14, color: '#B0B3B8', marginBottom: 10, lineHeight: 1.5 },
    goalBarBg: { height: 8, background: '#3A3B3C', borderRadius: 4, overflow: 'hidden' },
    goalBarFill: { height: '100%', borderRadius: 4, transition: 'width 0.4s ease' },
    goalEditRow: { display: 'flex', gap: 8, alignItems: 'center' },
    goalInput: {
        flex: 1, padding: '10px 12px', background: '#18191A', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8, color: '#E4E6EB', fontSize: 14, outline: 'none',
    },
    goalSaveBtn: {
        padding: '10px 16px', background: '#4A90D9', border: 'none',
        borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    },
    goalCancelBtn: {
        padding: '10px 12px', background: '#3A3B3C', border: 'none',
        borderRadius: 8, color: '#B0B3B8', fontSize: 16, cursor: 'pointer',
    },
    setGoalBtn: {
        width: '100%', padding: '13px', background: 'rgba(74,144,217,0.1)',
        border: '1px dashed rgba(74,144,217,0.4)', borderRadius: 10,
        color: '#4A90D9', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        textAlign: 'center',
    },

    // Calendar wrapper
    calendarWrapper: {
        background: '#242526', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12, padding: '14px 12px', marginTop: 8,
    },

    // Multi-day styles
    closedDayCard: {
        background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8, marginBottom: 6, overflow: 'hidden',
    },
    closedDayHeader: {
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        background: 'none', border: 'none', cursor: 'pointer', width: '100%',
    },
    closedDayLabel: { fontSize: 13, fontWeight: 700, color: '#B0B3B8', flex: 1, textAlign: 'left' },
    closedDayStats: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#64748b' },
    closedDayDowns: { padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 },
    closeDayBtn: {
        background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.35)',
        color: '#10b981', borderRadius: 8, padding: '8px 14px', fontSize: 13,
        fontWeight: 700, cursor: 'pointer',
    },
    startDayBtn: {
        background: 'rgba(59,130,246,0.12)', border: '2px solid rgba(59,130,246,0.35)',
        color: '#3b82f6', borderRadius: 8, padding: '8px 14px', fontSize: 13,
        fontWeight: 700, cursor: 'pointer',
    },
    confirmYes: {
        background: '#10b981', color: '#fff', border: 'none',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    confirmNo: {
        background: 'transparent', color: '#94a3b8',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
        padding: '8px 16px', fontSize: 13, cursor: 'pointer',
    },
};
