/**
 * TOKE TRACKER COMPONENT
 * ═══════════════════════════════════════════════════════════════
 * Dealer income & expense tracking — gigs, downs, 35-min timer
 * SmarterPoker Dark UI — matches TripTracker pattern
 * ═══════════════════════════════════════════════════════════════
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Image as ImageIcon } from 'lucide-react';
import ReceiptScanner from './ReceiptScanner';
import DoubleDownPrompt from './toke/DoubleDownPrompt';
import AddDownModal from './toke/AddDownModal';
import AddExpenseModal from './toke/AddExpenseModal';
import CompletedEventsList from './toke/CompletedEventsList';
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
import { busEmit } from '../../engine/EventBus';

// ── Down type metadata ──
const DOWN_TYPES = [
    { id: 'cash', label: 'Cash Game', color: '#3b82f6' },
    { id: 'tournament', label: 'Tournament', color: '#38bdf8' },
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
    tournament: '#38bdf8',
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

// ── Helper: detect harmless AbortError (browser fetch cancellation) ──
const isAbortError = (err) => err?.name === 'AbortError' || (err?.message || '').includes('aborted');

function TokeTracker({ userId: userIdProp, refreshTrigger, standalone = false, tokePrefs = {} }) {
    const [activeGig, setActiveGig] = useState(null);
    const [completedGigs, setCompletedGigs] = useState([]);
    const [locations, setLocations] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);

    // ── Bulletproof userId: prop → getSafeUser → all localStorage keys ──
    const [localUserId, setLocalUserId] = useState(null);
    useEffect(() => {
        if (userIdProp) { setLocalUserId(userIdProp); return; }
        // Centralized fallback using getSafeUser (handles ALL auth key variants)
        (async () => {
            try {
                const { getSafeUser, getAuthUser } = await import('../../lib/authUtils');
                // Fast sync check first
                const syncUser = getAuthUser();
                if (syncUser?.id) { setLocalUserId(syncUser.id); return; }
                // Async fallback
                const user = await getSafeUser(supabase);
                if (user?.id) setLocalUserId(user.id);
            } catch (e) {
                console.warn('[TokeTracker] userId fallback failed:', e?.message);
            }
        })();
    }, [userIdProp]);
    const userId = userIdProp || localUserId;

    // ── Hardening: mounted ref prevents state updates after unmount ──
    const isMountedRef = useRef(true);
    useEffect(() => { return () => { isMountedRef.current = false; }; }, []);
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

    // Down inline edit state
    const [editingDownId, setEditingDownId] = useState(null);
    const [editingDownForm, setEditingDownForm] = useState(null);

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
    const [createError, setCreateError] = useState(null);
    const [isCreating, setIsCreating] = useState(false);

    // ── Resolved userId ref — caches the last known good userId for handlers ──
    const resolvedUserIdRef = useRef(null);
    useEffect(() => {
        if (userId) resolvedUserIdRef.current = userId;
    }, [userId]);

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

    // ── Load data (with silent auto-retry on first failure) ──
    const loadAttemptRef = useRef(0);
    const loadData = useCallback(async () => {
        if (!userId) { setIsLoading(false); return; }
        setIsLoading(true);
        setLoadError(null);

        // Hard failsafe escape hatch (15s)
        const failsafeId = setTimeout(() => {
            if (isMountedRef.current) {
                setIsLoading(false);
                // Don't show error on failsafe — just silently stop loading
                console.warn('[TokeTracker] loadData failsafe timeout fired');
            }
        }, 15000);

        try {
            const [active, gigs, locs] = await Promise.all([
                getActiveGig(userId),
                fetchGigs(userId),
                // Locations are non-critical — don't let AbortError crash the whole load
                getUserLocations(userId).catch(locErr => {
                    console.warn('[TokeTracker] getUserLocations failed (non-fatal):', locErr?.message);
                    return [];
                }),
            ]);
            loadAttemptRef.current = 0; // Reset on success
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
            // Silently suppress AbortErrors — always
            if (isAbortError(err)) {
                console.debug('[TokeTracker] loadData aborted (harmless — auto-retrying)');
                // Silent auto-retry after 2s
                if (loadAttemptRef.current < 2 && isMountedRef.current) {
                    loadAttemptRef.current++;
                    clearTimeout(failsafeId);
                    if (isMountedRef.current) setIsLoading(false);
                    setTimeout(() => { if (isMountedRef.current) loadData(); }, 2000);
                } else {
                    if (isMountedRef.current) setIsLoading(false);
                }
                return;
            }
            // Non-abort errors: auto-retry once silently, then show error
            if (loadAttemptRef.current < 1) {
                console.warn('[TokeTracker] loadData failed, auto-retrying:', err.message);
                loadAttemptRef.current++;
                clearTimeout(failsafeId);
                if (isMountedRef.current) setIsLoading(false);
                setTimeout(() => { if (isMountedRef.current) loadData(); }, 1500);
                return;
            }
            console.error('Error loading toke data:', err);
            if (isMountedRef.current) setLoadError(err.message || String(err));
        } finally {
            clearTimeout(failsafeId);
            if (isMountedRef.current) setIsLoading(false);
        }
    }, [userId]);

    // ── Debounced loadData for realtime — prevents flooding during multi-row ops ──
    const realtimeTimerRef = useRef(null);
    const debouncedLoadData = useCallback(() => {
        if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
                loadData();
                // Broadcast update so main Bankroll Dashboard and Toke Dashboard re-render
                window.dispatchEvent(new CustomEvent('bankroll-updated'));
            }
        }, 500);
    }, [loadData]);

    useEffect(() => {
        loadData();
        const handleSync = () => loadData();
        window.addEventListener('toke-data-updated', handleSync);
        return () => window.removeEventListener('toke-data-updated', handleSync);
    }, [loadData, refreshTrigger]);

    // ── Supabase Realtime — debounced auto-refresh on any change to gig data ──
    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`toke-realtime-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_gigs', filter: `user_id=eq.${userId}` }, debouncedLoadData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_gig_days', filter: `user_id=eq.${userId}` }, debouncedLoadData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_downs', filter: `user_id=eq.${userId}` }, debouncedLoadData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toke_expenses', filter: `user_id=eq.${userId}` }, debouncedLoadData)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [userId, debouncedLoadData]);

    // ── Auth state listener — re-load when session refreshes ──
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && isMountedRef.current) {
                loadData();
            }
        });
        return () => subscription?.unsubscribe();
    }, [loadData]);

    // ── Cleanup timers on unmount ──
    useEffect(() => {
        return () => {
            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
            if (liveHoursTickRef.current) clearInterval(liveHoursTickRef.current);
            if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
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

    const [showDoubleDownPrompt, setShowDoubleDownPrompt] = useState(false);
    const [promptDown, setPromptDown] = useState(null);

    const handleDoubleDownPrompt = useCallback((lastDown) => {
        setPromptDown(lastDown);
        setShowDoubleDownPrompt(true);
    }, []);

    const fireDownNotification = useCallback((lastDown) => {
        // 1. ALWAYS fire the in-app prompt regardless of system notification settings
        handleDoubleDownPrompt(lastDown);

        // 1b. Haptic feedback — attention-grabbing double buzz for mobile dealers
        try {
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                navigator.vibrate([200, 100, 200]);
            }
        } catch (e) { /* Silently fail if vibration API is blocked */ }

        if (tokePrefs.downTimerAlerts === false) return; // 🛡️ Respect user preference for OS Push Alerts

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

        // 2. Try browser notification as a bonus (ultra-safe for watchOS/iOS WebViews)
        try {
            if (typeof window !== 'undefined' && 'Notification' in window) {
                let perm;
                try { perm = Notification.permission; } catch (e) { /* ignore security errors */ }

                if (perm === 'granted') {
                    new Notification(title, {
                        body: message + '\nTap to respond.',
                        icon: '/icons/icon-192x192.png',
                        tag: 'toke-down-timer',
                        requireInteraction: true,
                    });
                }
            }
        } catch (e) {
            // Silently fail if blocked by sandbox
        }
    }, [tokePrefs.downTimerAlerts, handleDoubleDownPrompt]);

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
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
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
        if (tokePrefs.shiftNotifications === false && tokePrefs.downTimerAlerts === false) return;

        try {
            if (typeof window !== 'undefined' && 'Notification' in window) {
                let perm;
                try { perm = Notification.permission; } catch (e) { /* ignore strict-mode access throws */ }

                if (perm === 'default') {
                    // Safe call: older embedded WebKit might not return a Promise
                    const req = Notification.requestPermission();
                    if (req && typeof req.then === 'function') {
                        req.catch(() => { });
                    }
                }
            }
        } catch (err) {
            console.warn('[TokeTracker] Notification permission request blocked/unavailable:', err);
        }
    }, [tokePrefs.shiftNotifications, tokePrefs.downTimerAlerts]);

    // ── GIG CRUD Handlers ──
    const handleCreateGig = async (e) => {
        if (e?.preventDefault) e.preventDefault();
        if (isCreating) return; // Prevent double-clicks
        setCreateError(null);
        setIsCreating(true);
        console.log('[TokeTracker] handleCreateGig fired', { venue_name: newGig.venue_name, userId });

        if (!newGig.venue_name.trim()) {
            toast.error('Please select or enter a venue');
            setIsCreating(false);
            return;
        }

        // Centralized userId resolution using getSafeUser
        let actualUserId = userId || resolvedUserIdRef.current;

        if (!actualUserId) {
            console.warn('[TokeTracker] userId is null — resolving via getSafeUser');
            try {
                const { getSafeUser, restoreSessionBackup } = await import('../../lib/authUtils');
                // Try session backup recovery first
                restoreSessionBackup();
                const user = await getSafeUser(supabase);
                actualUserId = user?.id;
                if (actualUserId) {
                    console.log('[TokeTracker] getSafeUser resolved:', actualUserId);
                    // Cache for future calls
                    resolvedUserIdRef.current = actualUserId;
                }
            } catch (e) {
                console.warn('[TokeTracker] getSafeUser failed:', e?.message);
            }
        }

        if (!actualUserId) {
            console.error('[TokeTracker] ALL 4 userId resolution layers failed — user session is expired or missing');
            const errMsg = 'Session expired — please log out and log back in to start an event';
            setCreateError(errMsg);
            toast.error(errMsg, 8000);
            setIsCreating(false);
            return;
        }
        try {
            await createGig(actualUserId, {
                ...newGig,
                hourly_rate: parseFloat(newGig.hourly_rate) || 0,
            });
            toast.success('Event started!');
            busEmit.sessionStart('Toke Tracker');
            setShowCreateForm(false);
            setNewGig({ venue_name: '', venue_address: '', location_id: null, venue_type: 'casino', poker_venue_id: null, latitude: null, longitude: null, start_date: new Date().toISOString().split('T')[0], hourly_rate: '', notes: '' });
            await requestNotificationPermission();
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            // "Already active" — just load the existing event
            if (err?.message?.includes('already have an active')) {
                toast.info('You already have an active event — loading it now');
                setShowCreateForm(false);
                await loadData();
            } else if (err?.message?.includes('Insert failed')) {
                // Direct fetch insert failure — show the actual error
                console.error('[TokeTracker] createGig insert failed:', err);
                setCreateError(err.message);
                toast.error(err.message, 5000);
            } else if (isAbortError(err)) {
                // AbortError after all retries exhausted — tell user to try again
                console.error('[TokeTracker] createGig aborted after all retries');
                toast.error('Connection interrupted — please try again', 5000);
            } else {
                console.error('[TokeTracker] createGig failed:', err);
                toast.error(err.message || 'Failed to create event', 5000);
            }
        } finally {
            setIsCreating(false);
        }
    };

    const handleCompleteGig = async (mileageCount = 0) => {
        if (!userId) { toast.error('You must be logged in'); return; }
        if (!activeGig) return;
        try {
            await completeGig(userId, activeGig.id, parseFloat(mileageCount) || 0);
            toast.success('Event completed!');
            setConfirmComplete(false);
            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
            setTimerActive(false);
            await loadData();
            busEmit.sessionEnd('Toke Tracker');

            // Check for highly profitable session to trigger confetti
            if (activeGig && activeGig.totalTokes >= 300) {
                busEmit.celebration('confetti');
            }

            // Bus event: notify TokeDashboard + other hub cards that a gig was completed
            window.dispatchEvent(new CustomEvent('toke-gig-completed', {
                detail: { userId, gigId: activeGig.id }
            }));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to complete gig');
        }
    };

    const handleDeleteGig = async () => {
        if (!userId) { toast.error('You must be logged in'); return; }
        if (!activeGig) return;
        try {
            // Optimistic UI Update: Clear the event from the screen instantly
            setActiveGig(null);
            toast.success('Event deleted');
            setConfirmDelete(false);

            if (downTimerRef.current) clearTimeout(downTimerRef.current);
            if (timerTickRef.current) clearInterval(timerTickRef.current);
            setTimerActive(false);

            await deleteGig(userId, activeGig.id);
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to delete gig');
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
        if (!userId) { toast.error('You must be logged in'); return; }
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
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to update gig');
        }
    };

    // ── DOWN Handlers ──
    const handleAddDown = async () => {
        if (!userId) { toast.error('You must be logged in'); return; }
        if (!activeGig) return;
        const currentDay = activeGig.days?.find(d => !d.ended_at) || null;
        if (!currentDay) { toast.error('Close the current day first, then start a new day.'); return; }
        try {
            // Auto-end any currently active down (dealer can edit toke later)
            const activeDown = currentDay.downs?.find(d => !d.ended_at);
            if (activeDown) {
                await endDown(activeDown.id, activeDown.toke_amount || 0);
                if (downTimerRef.current) clearTimeout(downTimerRef.current);
                if (timerTickRef.current) clearInterval(timerTickRef.current);
                setTimerActive(false);
            }
            const gameType = downForm.down_type === 'cash'
                ? downForm.cash_variant
                : downForm.game_type || null;
            const down = await createDown(userId, activeGig.id, currentDay.id, {
                down_type: downForm.down_type,
                tournament_name: downForm.down_type === 'tournament' ? downForm.tournament_name : null,
                table_number: downForm.table_number || null,
                game_type: gameType,
                cash_stakes: downForm.down_type === 'cash' ? downForm.cash_stakes : null,
                cash_variant: downForm.down_type === 'cash' ? downForm.cash_variant : null,
            });
            toast.success(`${DOWN_TYPE_LABELS[downForm.down_type]} down started!`);
            setShowAddDown(false);
            setDownForm({ down_type: 'cash', tournament_name: '', table_number: '', game_type: '', cash_variant: 'Holdem', cash_stakes: '1/3', tournament_buyin: '' });
            startDownTimer(DOWN_TIMER_MS, down);
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to add down');
        }
    };

    // Begin toke-on-end flow: show inline toke input before closing the down
    const handleEndDownPrompt = (down) => {
        setEndingDown(down);
        setEndTokeValue(down.toke_amount > 0 ? String(down.toke_amount) : '');
    };

    const handleEndDownConfirm = async () => {
        if (!userId) { toast.error('You must be logged in'); return; }
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

            if (tokeAmt >= 100) {
                busEmit.celebration('confetti');
            }

            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to end down');
            // Still reload data to resync after optimistic update
            await loadData();
        }
    };

    // Legacy direct-end (called from non-dealing downs like break/brush when no toke needed)
    const handleEndDown = async (downId) => {
        if (!userId) { toast.error('You must be logged in'); return; }
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
            if (!isAbortError(err)) toast.error(err.message || 'Failed to end down');
        }
        await loadData();
        window.dispatchEvent(new CustomEvent('toke-data-updated'));
    };

    const handleDeleteDown = async (downId) => {
        if (!userId) { toast.error('You must be logged in'); return; }
        try {
            await deleteDown(downId);
            toast.success('Down deleted');
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to delete down');
        }
    };

    const handleSaveToke = async (downId) => {
        if (!userId) { toast.error('You must be logged in'); return; }
        try {
            await updateDownToke(downId, parseFloat(tokeEditValue) || 0);
            toast.success('Toke saved');
            setEditingTokeId(null);
            setTokeEditValue('');
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to save toke');
        }
    };

    const handleSaveMultiplier = async (downId) => {
        if (!userId) { toast.error('You must be logged in'); return; }
        try {
            await updateDownMultiplier(downId, parseFloat(multiplierEditValue) || 1.0);
            toast.success('Multiplier updated');
            setEditingMultiplierId(null);
            setMultiplierEditValue('');
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to update multiplier');
        }
    };

    const handleSaveDownEdit = async () => {
        if (!userId) { toast.error('You must be logged in'); return; }
        if (!editingDownId || !editingDownForm) return;

        try {
            const { error } = await supabase
                .from('toke_downs')
                .update({
                    tournament_name: editingDownForm.tournament_name || null,
                    tournament_buyin: editingDownForm.tournament_buyin ? parseFloat(editingDownForm.tournament_buyin) : null,
                    game_type: editingDownForm.game_type || null,
                    cash_stakes: editingDownForm.cash_stakes || null,
                    cash_variant: editingDownForm.cash_variant || null,
                    table_number: editingDownForm.table_number || null,
                })
                .eq('id', editingDownId);

            if (error) throw error;

            toast.success('Down updated');
            setEditingDownId(null);
            setEditingDownForm(null);
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to update down');
        }
    };

    // ── Day Handlers ──
    const handleCloseDay = async () => {
        if (!userId) { toast.error('You must be logged in'); return; }
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
            // Save notes BEFORE closing (prevents race condition / data loss)
            if (closeDayNotes.trim()) {
                await supabase.from('toke_gig_days').update({ notes: closeDayNotes.trim() }).eq('id', currentDay.id);
            }
            await closeDay(currentDay.id);
            toast.success(`Day ${currentDay.day_number} closed! 🎉`);
            setCloseDayNotes('');
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to close day');
            // Still reload to resync after optimistic update
            await loadData();
        }
    };

    const handleStartNewDay = async () => {
        if (!userId) { toast.error('You must be logged in'); return; }
        if (!activeGig) return;
        const openDay = activeGig.days?.find(d => !d.ended_at);
        if (openDay) { toast.error('Close the current day first.'); return; }
        try {
            const nextNum = (activeGig.days?.length || 0) + 1;
            await createDay(userId, activeGig.id, nextNum);
            toast.success(`Day ${nextNum} started!`);
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to start new day');
        }
    };

    // ── Expense Handlers ──
    const handleAddExpense = async (e) => {
        e.preventDefault();
        if (!userId) { toast.error('You must be logged in'); return; }
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
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to add expense');
        }
    };

    const handleDeleteExpense = async (expenseId) => {
        if (!confirm('Delete this expense?')) return;
        try {
            await deleteExpense(expenseId);
            toast.success('Expense deleted');
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            if (!isAbortError(err)) toast.error(err.message || 'Failed to delete expense');
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

    // Jarvis chips removed — clean input only

    // ── Report View ──
    const handleViewReport = async (gigId) => {
        try {
            const report = await getGigReport(userId, gigId);
            setSelectedReport(report);
        } catch (err) {
            toast.error('Failed to load event report');
        }
    };

    // ── Delete a completed event ──
    const handleDeleteCompletedGig = async (e, gigId) => {
        e.stopPropagation();
        if (!userId) { toast.error('You must be logged in'); return; }
        if (!confirm('Delete this completed event? This cannot be undone.')) return;
        try {
            await deleteGig(userId, gigId);
            toast.success('Event deleted');
            await loadData();
            window.dispatchEvent(new CustomEvent('toke-data-updated'));
        } catch (err) {
            toast.error(err.message || 'Failed to delete event');
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8, background: 'rgba(56,189,248,0.08)', border: '2px solid rgba(56,189,248,0.25)', boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.25)', borderRadius: 8, fontSize: 13 }}>
                                <span>🚗</span>
                                <span style={{ color: '#B0B3B8' }}>{gig.mileage.toLocaleString()} miles × ${rate}/mi</span>
                                <span style={{ color: '#38bdf8', fontWeight: 700 }}>= ${(gig.mileage * rate).toFixed(2)} deductible</span>
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
                            <span style={{ ...styles.reportStatValue, color: '#38bdf8' }}>{formatCurrency(stats.totalTokes)}</span>
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
                                    <div key={day.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '2px solid rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#B0B3B8' }}>
                                            Day {day.day_number} — {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b' }}>
                                            <span style={{ color: '#38bdf8', fontWeight: 700 }}>{formatCurrency(day.totalTokes || 0)}</span>
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
                            style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.07)', border: '2px solid rgba(255,255,255,0.15)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)', color: '#E4E6EB' }}
                        >
                            Copy Summary
                        </button>
                        <button
                            onClick={handleDownloadCSV}
                            style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(56,189,248,0.1)', border: '2px solid rgba(56,189,248,0.3)', boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.3)', color: '#38bdf8' }}
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

            {/* Tax Summary moved to Vault & Hamburger Menu */}

            {/* ── ACTIVE GIG VIEW ── */}
            {activeGig && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.activeGigCard}
                >
                    {/* ── LIVE EVENT HEADER ── */}
                    <div style={styles.activeHeader}>
                        <div style={styles.activeLed} />
                        <span style={styles.activeLabel}>LIVE EVENT</span>

                        {/* Event Admin Actions (Edit / Delete) */}
                        {!editMode && !confirmDelete && !confirmComplete && !confirmCloseDay && (
                            <div style={{ display: 'flex', gap: 6, marginLeft: 16 }}>
                                <button onClick={startEditing} style={styles.topActionBtn} title="Edit Event Details">✏️</button>
                                <button onClick={() => setConfirmDelete(true)} style={{ ...styles.topActionBtn, color: '#ef4444' }} title="Delete Event">🗑️</button>
                            </div>
                        )}

                        <span style={{
                            marginLeft: 'auto', fontSize: 13, fontWeight: 700,
                            background: isDayOpen ? 'rgba(56,189,248,0.15)' : 'rgba(100,116,139,0.15)',
                            color: isDayOpen ? '#38bdf8' : '#94a3b8',
                            border: `2px solid ${isDayOpen ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.1)'}`, boxShadow: `inset 0 0 0 1px ${isDayOpen ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 20, padding: '4px 12px',
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 16px', background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 12, border: '2px solid rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Edit Event</span>
                            </div>
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
                            <div style={{ display: 'flex', gap: 10 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={styles.formLabel}>Hourly Rate ($)</label>
                                    <input
                                        type="number" value={editForm.hourly_rate}
                                        onChange={e => setEditForm({ ...editForm, hourly_rate: e.target.value })}
                                        style={styles.formInput} step="0.01"
                                    />
                                </div>
                            </div>
                            <label style={styles.formLabel}>Notes</label>
                            <textarea
                                value={editForm.notes}
                                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                style={{ ...styles.formInput, minHeight: 80, resize: 'vertical' }}
                            />
                            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                                <button onClick={handleSaveEdit} style={{ ...styles.completeBtn, flex: 1 }}>Save Changes</button>
                                <button onClick={() => setEditMode(false)} style={{ ...styles.cancelEditBtn, flex: 1 }}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {/* ── PRIMARY LOGGING ACTIONS (MASSIVE + TOP MOUNTED) ── */}
                    {!editMode && isDayOpen && !confirmCloseDay && !confirmComplete && !confirmDelete && (
                        <div style={{ display: 'flex', gap: 12, margin: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 24 }}>
                            <button onClick={() => setShowAddDown(true)} style={{
                                ...styles.addDownBtn,
                                flex: 2,
                                padding: '24px 16px',
                                fontSize: 18,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 16,
                                boxShadow: '0 8px 32px rgba(56,189,248,0.15)',
                                background: 'linear-gradient(135deg, rgba(56,189,248,0.2) 0%, rgba(56,189,248,0.05) 100%)',
                                border: '2px solid rgba(56,189,248,0.5)', boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.5)',
                            }}>
                                <span style={{ fontSize: 32, lineHeight: 1, marginBottom: 8, color: '#38bdf8' }}>+</span>
                                <span style={{ fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Add Down</span>
                            </button>
                            <button onClick={() => setShowAddExpense(true)} style={{
                                ...styles.addExpenseBtn,
                                flex: 1,
                                padding: '24px 16px',
                                fontSize: 15,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 16,
                                background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)',
                                border: '2px solid rgba(239,68,68,0.3)', boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.3)',
                            }}>
                                <span style={{ fontSize: 28, lineHeight: 1, marginBottom: 8 }}>🧾</span>
                                <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>Expense</span>
                            </button>
                        </div>
                    )}

                    {/* Running Totals */}
                    {!editMode && (
                        <div style={{ ...styles.runningStats, gridTemplateColumns: 'repeat(4, 1fr)' }}>
                            <div style={styles.runningStat}>
                                <span style={styles.runningStatLabel}>Total Tokes</span>
                                <span style={{ ...styles.runningStatValue, color: '#38bdf8' }}>
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

                    {/* ── RUNNING TOTALS STATS ── */}

                    {/* ── CLOSED DAYS SUMMARY ── */}
                    {!editMode && closedDays.length > 0 && closedDays.map(day => (
                        <div key={day.id} style={styles.closedDayCard}>
                            <button
                                style={styles.closedDayHeader}
                                onClick={() => setCollapsedDays(prev => ({ ...prev, [day.id]: !prev[day.id] }))}
                            >
                                <span style={styles.closedDayLabel}>Day {day.day_number} — {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                <span style={styles.closedDayStats}>
                                    <span style={{ color: '#38bdf8' }}>{formatCurrency(day.totalTokes || 0)}</span>
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
                                            <div key={down.id} style={{ ...styles.downRow, border: `2px solid ${typeColor}`, boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.1)`, opacity: 0.8 }}>
                                                <div style={styles.downInfo}>
                                                    <span style={{ ...styles.downTypeBadge, background: `${typeColor}22`, color: typeColor, border: `2px solid ${typeColor}44`, boxShadow: `inset 0 0 0 1px ${typeColor}44` }}>
                                                        {DOWN_TYPE_LABELS[down.down_type]}{down.is_double_down && ' (x2)'}
                                                    </span>
                                                    {down.game_type && <span style={styles.downDetail}>{down.game_type}</span>}
                                                    {down.table_number && <span style={styles.downDetail}>T{down.table_number}</span>}
                                                    <span style={styles.downTime}>{formatDuration(duration)}</span>
                                                </div>
                                                <div style={styles.downRight}>
                                                    {(down.toke_amount || 0) > 0 && <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 12 }}>{formatCurrency(down.toke_amount)}</span>}
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
                                        <div key={exp.id} style={{ ...styles.downRow, border: '2px solid rgba(239,68,68,0.4)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', opacity: 0.8 }}>
                                            <div style={styles.downInfo}>
                                                <span style={{ ...styles.downTypeBadge, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '2px solid rgba(239,68,68,0.2)', boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.2)', fontSize: 10 }}>
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
                                        <div key={down.id} style={{ ...styles.downRow, border: `2px solid ${typeColor}`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' }}>
                                            <div style={styles.downInfo}>
                                                <span style={{ ...styles.downTypeBadge, background: `${typeColor}22`, color: typeColor, border: `2px solid ${typeColor}44`, boxShadow: `inset 0 0 0 1px ${typeColor}44` }}>
                                                    {DOWN_TYPE_LABELS[down.down_type]}{down.is_double_down && ' (x2)'}
                                                </span>
                                                {editingDownId === down.id ? (
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, marginBottom: 4 }}>
                                                        {down.down_type === 'tournament' ? (
                                                            <>
                                                                <input type="text" value={editingDownForm.tournament_name || ''} onChange={e => setEditingDownForm({ ...editingDownForm, tournament_name: e.target.value })} placeholder="Tournament Name" style={{ ...styles.tokeInput, width: 130 }} />
                                                                <input type="number" value={editingDownForm.tournament_buyin || ''} onChange={e => setEditingDownForm({ ...editingDownForm, tournament_buyin: e.target.value })} placeholder="Buy-in $" style={{ ...styles.tokeInput, width: 70 }} />
                                                            </>
                                                        ) : (
                                                            <>
                                                                <input type="text" value={editingDownForm.game_type || ''} onChange={e => setEditingDownForm({ ...editingDownForm, game_type: e.target.value })} placeholder="Variant" style={{ ...styles.tokeInput, width: 80 }} />
                                                                <input type="text" value={editingDownForm.cash_stakes || ''} onChange={e => setEditingDownForm({ ...editingDownForm, cash_stakes: e.target.value })} placeholder="Stakes" style={{ ...styles.tokeInput, width: 70 }} />
                                                            </>
                                                        )}
                                                        <input type="text" value={editingDownForm.table_number || ''} onChange={e => setEditingDownForm({ ...editingDownForm, table_number: e.target.value })} placeholder="Table #" style={{ ...styles.tokeInput, width: 60 }} />
                                                    </div>
                                                ) : (
                                                    <>
                                                        {down.tournament_name && <span style={styles.downDetail}>{down.tournament_name}</span>}
                                                        {down.tournament_buyin && parseFloat(down.tournament_buyin) > 0 && (
                                                            <span style={{ ...styles.downDetail, color: '#a78bfa', fontWeight: 600 }}>
                                                                ${parseFloat(down.tournament_buyin).toLocaleString()} buy-in
                                                            </span>
                                                        )}
                                                        {down.game_type && <span style={styles.downDetail}>{down.game_type}</span>}
                                                        {down.table_number && <span style={styles.downDetail}>T{down.table_number}</span>}
                                                    </>
                                                )}
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
                                                        <button onClick={() => { setEditingTokeId(down.id); setTokeEditValue(down.toke_amount || ''); }} style={{ ...styles.tokeDisplay, color: (down.toke_amount || 0) > 0 ? '#38bdf8' : '#64748b' }} title="Edit Toke">
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
                                                {editingDownId === down.id ? (
                                                    <>
                                                        <button onClick={handleSaveDownEdit} style={{ ...styles.downDeleteBtn, background: 'rgba(16,185,129,0.15)', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }} title="Save">✓</button>
                                                        <button onClick={() => { setEditingDownId(null); setEditingDownForm(null); }} style={styles.downDeleteBtn} title="Cancel">✕</button>
                                                        <button onClick={() => { if (confirm('Delete this down?')) handleDeleteDown(down.id); }} style={{ ...styles.downDeleteBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} title="Delete Down">🗑️</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {isOpen && <button onClick={() => handleEndDown(down.id)} style={styles.endDownSmallBtn}>End</button>}
                                                        <button onClick={() => { setEditingDownId(down.id); setEditingDownForm(down); }} style={{ ...styles.downDeleteBtn, color: '#64748b', borderColor: 'rgba(255,255,255,0.1)', background: 'transparent' }} title="Edit Down">✏️</button>
                                                    </>
                                                )}
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
                                    <div key={exp.id} style={{ ...styles.downRow, border: '2px solid #ef4444', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)' }}>
                                        <div style={styles.downInfo}>
                                            <span style={{ ...styles.downTypeBadge, background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '2px solid rgba(239,68,68,0.3)', boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.3)' }}>
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
                        {confirmCloseDay ? (
                            <div style={{ ...styles.confirmRow, flexDirection: 'column', alignItems: 'flex-start', gap: 10, width: '100%', background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 12, border: '2px solid rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}>
                                <span style={styles.confirmText}>Close out Day {currentDayNumber}? Add a note (optional):</span>
                                <input
                                    type="text"
                                    value={closeDayNotes}
                                    onChange={e => setCloseDayNotes(e.target.value)}
                                    placeholder="E.g. Short-Handed All Night, Big Tipped Table..."
                                    style={{ ...styles.formInput, width: '100%', padding: '12px 14px', fontSize: 14 }}
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleCloseDay(); }}
                                />
                                <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 4 }}>
                                    <button onClick={handleCloseDay} style={{ ...styles.confirmYes, flex: 1, padding: '12px' }}>✓ Close Day</button>
                                    <button onClick={() => { setConfirmCloseDay(false); setCloseDayNotes(''); }} style={{ ...styles.confirmNo, flex: 1, padding: '12px' }}>Cancel</button>
                                </div>
                            </div>
                        ) : null}

                        {!confirmCloseDay && !confirmComplete && !editMode ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                                {isDayOpen && <button onClick={() => setConfirmCloseDay(true)} style={{ ...styles.closeDayBtn, width: '100%' }}>✓ Close Day {currentDayNumber}</button>}
                                {!isDayOpen && <button onClick={handleStartNewDay} style={{ ...styles.startDayBtn, width: '100%' }}>▶ Start Day {(activeGig?.days?.length || 0) + 1}</button>}
                                {!isDayOpen && <button onClick={() => setConfirmComplete(true)} style={{ ...styles.completeBtn, width: '100%' }}>✓ Complete Final Event</button>}
                            </div>
                        ) : null}

                        {confirmComplete && !editMode ? (
                            <div style={{ ...styles.confirmRow, flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span style={styles.confirmText}>Finalize This Event? Enter Total Mileage:</span>
                                <div style={{ display: 'flex', gap: 10, width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                        type="number"
                                        value={mileageInput}
                                        onChange={e => setMileageInput(e.target.value)}
                                        placeholder="0 Miles"
                                        style={{ ...styles.formInput, width: 100, padding: '8px 12px' }}
                                    />
                                    {/* tax calculation logic moved strictly to Vault per Vault-Only compliance rule */}
                                    <button onClick={() => handleCompleteGig(mileageInput)} style={styles.confirmYes}>Yes, Complete</button>
                                    <button onClick={() => setConfirmComplete(false)} style={styles.confirmNo}>Cancel</button>
                                </div>
                            </div>
                        ) : null}
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
            )
            }

            {/* ── CREATE EVENT ── */}
            {
                !activeGig && !showCreateForm && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowCreateForm(true)}
                        style={styles.createGigBtn}
                    >
                        <div style={styles.addEventIcon}>+</div>
                        <div style={styles.createGigSub}>New Event</div>
                    </motion.button>
                )
            }

            <AnimatePresence>
                {showCreateForm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
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
                            placeholder="E.g. 15.00" step="0.01" style={styles.formInput}
                        />

                        <label style={styles.formLabel}>Notes</label>
                        <textarea
                            value={newGig.notes}
                            onChange={e => setNewGig({ ...newGig, notes: e.target.value })}
                            placeholder="Any Notes..." style={{ ...styles.formInput, minHeight: 60, resize: 'vertical' }}
                        />

                        <div style={styles.formActions}>
                            <button type="button" onClick={handleCreateGig} disabled={isCreating} style={{ ...styles.formSubmitBtn, opacity: isCreating ? 0.6 : 1, cursor: isCreating ? 'not-allowed' : 'pointer' }}>{isCreating ? 'Creating...' : 'Start Event'}</button>
                            <button type="button" onClick={() => setShowCreateForm(false)} style={styles.formCancelBtn}>Cancel</button>
                        </div>
                        {createError && (
                            <div style={{ margin: '8px 0 0', padding: '10px 14px', background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#fca5a5', fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
                                ⚠️ {createError}
                            </div>
                        )}
                    </motion.div>
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
                                How Much Did You Toke?
                            </h3>
                            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px' }}>
                                {endingDown.game_type || endingDown.down_type}
                                {endingDown.table_number ? ` · Table ${endingDown.table_number}` : ''}
                            </p>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <span style={{ fontSize: 22, color: '#38bdf8', fontWeight: 800 }}>$</span>
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
                                        border: '2px solid rgba(56,189,248,0.4)', borderRadius: 10,
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
            <AddDownModal
                show={showAddDown}
                downForm={downForm}
                setDownForm={setDownForm}
                onSubmit={handleAddDown}
                onClose={() => setShowAddDown(false)}
                styles={styles}
            />

            {/* ── ADD EXPENSE MODAL ── */}
            <AddExpenseModal
                show={showAddExpense}
                expenseForm={expenseForm}
                setExpenseForm={setExpenseForm}
                onSubmit={handleAddExpense}
                onClose={() => setShowAddExpense(false)}
                showScanner={showScanner}
                setShowScanner={setShowScanner}
                ReceiptScannerComponent={ReceiptScanner}
                userId={userId}
                styles={styles}
            />

            {/* ── DOUBLE DOWN PROMPT ── */}
            <DoubleDownPrompt
                show={showDoubleDownPrompt}
                promptDown={promptDown}
                onYes={handleDoubleDownYes}
                onNo={handleDoubleDownNo}
                styles={styles}
            />

            {/* ── COMPLETED EVENTS ── */}
            <CompletedEventsList
                completedGigs={completedGigs}
                isLoading={isLoading}
                loadError={loadError}
                onViewReport={handleViewReport}
                onSaveEdit={async (gigId, form) => {
                    if (!userId) { toast.error('You must be logged in'); throw new Error('Not logged in'); }
                    if (!form.venue_name.trim()) { toast.error('Venue name is required'); throw new Error('Venue required'); }
                    await updateGig(userId, gigId, { ...form, hourly_rate: parseFloat(form.hourly_rate) || 0 });
                    toast.success('Event updated!');
                    await loadData();
                    window.dispatchEvent(new CustomEvent('toke-data-updated'));
                }}
                onDeleteGig={handleDeleteCompletedGig}
                styles={styles}
            />

            {/* ── MONTHLY INCOME GOAL (at bottom) ── */}
            {
                (monthlyGoal > 0 || showGoalEdit) && (
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
                                    placeholder="Monthly $ Goal"
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
                            const barColor = pct >= 80 ? '#36bb6a' : pct >= 50 ? '#38bdf8' : '#f02849';
                            return (
                                <>
                                    <div style={styles.goalText}>
                                        You're At <strong style={{ color: barColor }}>${currentMonthTokes.toFixed(0)}</strong> Of <strong>${monthlyGoal.toLocaleString()}</strong> ({pct.toFixed(0)}%) — {daysLeft} Day{daysLeft !== 1 ? 's' : ''} Left
                                    </div>
                                    <div style={styles.goalBarBg}>
                                        <div style={{ ...styles.goalBarFill, width: `${pct}%`, background: barColor }} />
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )
            }

            {/* ── JARVIS DEALER REFERENCE PANEL ── */}
            <div style={styles.jarvisPanel}>
                <button style={styles.jarvisPanelHeader} onClick={() => setJarvisExpanded(e => !e)}>
                    <span style={styles.jarvisHeaderLeft}>
                        <img src="/images/jarvis-avatar-circle.png" alt="Jarvis" style={styles.jarvisAvatarImg} />
                        <div>
                            <div style={styles.jarvisTitle}>Jarvis — Dealer Reference</div>
                            <div style={styles.jarvisSub}>Ask For Rules, TDA Lookups & Game Refreshers</div>
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

                            {/* Input row */}
                            <div style={styles.jarvisInputRow}>
                                <input
                                    type="text"
                                    value={jarvisQuery}
                                    onChange={e => setJarvisQuery(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAskJarvis(); }}
                                    placeholder="Ask Jarvis Anything About Dealing..."
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
                                    Jarvis Is Thinking...
                                </div>
                            )}
                            {jarvisAnswer && !jarvisLoading && (
                                <div style={styles.jarvisAnswer}>
                                    <div style={styles.jarvisAnswerLabel}><img src="/images/jarvis-avatar-circle.png" alt="Jarvis" style={{ width: 20, height: 20, borderRadius: '50%', marginRight: 6, verticalAlign: 'middle' }} />Jarvis</div>
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

            {/* ── SET MONTHLY GOAL (below Jarvis) ── */}
            {
                !monthlyGoal && !showGoalEdit && (
                    <button style={styles.setGoalBtn} onClick={() => setShowGoalEdit(true)}>
                        <span style={styles.goalBtnIcon}>🎯</span>
                        Set Monthly Income Goal
                    </button>
                )
            }

            {/* ── DEALER VAULT (hidden in standalone mode) ── */}
            {!standalone && <DealerVault userId={userId} completedGigs={completedGigs} />}

            {/* ── YEARLY CALENDAR (hidden in standalone mode) ── */}
            {
                !standalone && (
                    <div style={styles.calendarWrapper}>
                        <TokeCalendar userId={userId} />
                    </div>
                )
            }
            {/* ── TAX SUMMARY MODAL ── */}
            {
                showTaxSummary && (
                    <TaxSummaryModal
                        completedGigs={completedGigs}
                        onClose={() => setShowTaxSummary(false)}
                    />
                )
            }
        </div >
    );
}

// ═══════════════════════════════════════════════════════════════
// STYLES — SmarterPoker Dark (matches TripTracker)
// ═══════════════════════════════════════════════════════════════
const styles = {
    container: { display: 'flex', flexDirection: 'column', gap: 20 },

    // Active Gig
    activeGigCard: {
        background: '#242526',
        border: '2px solid #3A3B3C',
        borderRadius: 12, padding: 20, position: 'relative',
    },
    activeHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
    activeLed: {
        width: 8, height: 8, borderRadius: '50%', background: '#38bdf8',
        boxShadow: '0 0 8px rgba(56, 189, 248, 0.6)', animation: 'pulse 2s infinite',
    },
    activeLabel: { fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: '#38bdf8', textTransform: 'uppercase' },
    activeGigName: { fontSize: 22, fontWeight: 700, color: '#E4E6EB', margin: '4px 0' },
    activeGigAddress: { fontSize: 13, color: '#B0B3B8', margin: '0 0 4px', fontStyle: 'italic' },
    activeGigMeta: { fontSize: 14, color: '#B0B3B8', margin: '0 0 16px' },

    // Running stats
    runningStats: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
    runningStat: { flex: '1 1 90px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#3A3B3C', borderRadius: 8, padding: '10px 8px' },
    runningStatLabel: { fontSize: 13, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, textAlign: 'center' },
    runningStatValue: { fontSize: 18, fontWeight: 700, color: '#E4E6EB' },

    // Timer
    timerBanner: {
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: 'rgba(56, 189, 248, 0.1)', border: '2px solid rgba(56, 189, 248, 0.3)',
        borderRadius: 10, padding: '10px 14px', marginBottom: 16,
    },
    timerIcon: { fontSize: 24, flexShrink: 0 },
    timerInfo: { flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column' },
    timerLabel: { fontSize: 13, fontWeight: 600, color: '#E4E6EB' },
    timerCountdown: { fontSize: 20, fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' },
    endDownBtn: {
        background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '2px solid rgba(239,68,68,0.3)',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        whiteSpace: 'nowrap',
    },

    // Downs list
    downsSection: { marginBottom: 16 },
    downsSectionTitle: { fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 8, letterSpacing: 0.5 },
    downsScroll: { maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 },
    downRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        background: '#3A3B3C', borderRadius: 6, padding: '8px 10px', flexWrap: 'wrap',
    },
    downInfo: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 100, flex: 1 },
    downTypeBadge: { fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' },
    downDetail: { fontSize: 12, color: '#B0B3B8', wordBreak: 'break-word' },
    downTime: { fontSize: 11, color: '#B0B3B8', whiteSpace: 'nowrap' },
    downRight: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 140 },
    tokeDisplay: {
        background: 'none', border: '2px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)', fontSize: 13,
        fontWeight: 700, cursor: 'pointer', padding: '0 6px',
        minWidth: 54, height: 26, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', borderRadius: 4, boxSizing: 'border-box',
    },
    tokeEditRow: { display: 'flex', alignItems: 'center', gap: 4 },
    tokeInput: {
        width: 60, padding: '4px 6px', background: '#242526', border: '2px solid #3A3B3C', boxShadow: 'inset 0 0 0 1px #3A3B3C',
        borderRadius: 4, color: '#fff', fontSize: 13, textAlign: 'right',
    },
    tokeSaveBtn: {
        background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '2px solid rgba(16,185,129,0.3)', boxShadow: 'inset 0 0 0 1px rgba(16,185,129,0.3)',
        borderRadius: 4, padding: '4px 8px', fontSize: 13, cursor: 'pointer', fontWeight: 700,
    },
    endDownSmallBtn: {
        background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '2px solid rgba(239,68,68,0.3)', boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.3)',
        borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        whiteSpace: 'nowrap',
    },
    downDeleteBtn: {
        background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.3)', boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.3)',
        borderRadius: 4, padding: '2px 6px', fontSize: 12, cursor: 'pointer', color: '#ef4444', lineHeight: 1,
    },

    // Actions
    activeActions: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' },
    editBtn: {
        background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '2px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        flex: '1 1 120px', textAlign: 'center', whiteSpace: 'nowrap',
    },
    addDownBtn: {
        background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '2px solid rgba(56, 189, 248, 0.3)',
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
        background: '#10b981', color: '#fff', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    confirmNo: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
    },

    // Delete
    topActionBtn: {
        background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '4px 10px', color: '#94a3b8', fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s ease'
    },
    deleteOverlay: {
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
        borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
    },
    deletePopup: { textAlign: 'center', padding: 20 },
    deletePopupText: { fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 16 },
    deleteConfirmBtn: {
        background: '#ef4444', color: '#fff', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    },
    deleteCancelBtn: {
        background: 'transparent', color: '#94a3b8', border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer',
    },

    // Create Gig
    createGigBtn: {
        background: 'linear-gradient(135deg, #242526 0%, #1c1e21 100%)', border: '2px solid #3A3B3C',
        borderRadius: 16, padding: '28px 20px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', width: '100%',
        transition: 'border-color 0.2s, box-shadow 0.2s',
    },
    addEventIcon: {
        width: 56, height: 56, borderRadius: '50%',
        background: 'linear-gradient(135deg, #2374e1, #1a5bb5)',
        border: '2px solid rgba(35,116,225,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 32, fontWeight: 300, color: '#fff',
        boxShadow: '0 0 20px rgba(35,116,225,0.3)',
    },
    createGigSub: { fontSize: 14, fontWeight: 600, color: '#B0B3B8', letterSpacing: '0.03em' },

    // Form
    createForm: {
        background: '#242526', border: '2px solid #3A3B3C',
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
        background: 'rgba(16,185,129,0.1)', border: '2px solid rgba(16,185,129,0.3)', boxShadow: 'inset 0 0 0 1px rgba(16,185,129,0.3)',
        borderRadius: 8, width: '100%', boxSizing: 'border-box'
    },
    removeReceiptBtn: {
        marginLeft: 'auto', background: 'transparent', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', color: '#10b981',
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
        background: 'transparent', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', padding: 4, cursor: 'pointer',
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
        background: 'linear-gradient(135deg, #2374e1, #1a5fc9)', color: '#fff', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
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
        border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', padding: 0, backgroundColor: 'transparent',
        width: '100%', maxWidth: 450,
        aspectRatio: '854 / 1018',
        boxShadow: '0 20px 60px rgba(0,0,0,0.8)', overflow: 'hidden',
        display: 'block',
    },
    imgMapBtn: {
        position: 'absolute', background: 'transparent', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', cursor: 'pointer', outline: 'none',
        WebkitAppearance: 'none', appearance: 'none',
        WebkitTapHighlightColor: 'rgba(0,0,0,0)', boxShadow: 'none'
    },
    imgMapInput: {
        width: '100%', height: '100%', background: 'transparent', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', color: '#fff', fontSize: 18,
        textAlign: 'left', textAlignLast: 'left', fontWeight: 600, outline: 'none', appearance: 'none',
        WebkitAppearance: 'none', boxShadow: 'none', WebkitTapHighlightColor: 'rgba(0,0,0,0)',
        paddingLeft: 12,
    },

    // Double down prompt
    promptCard: {
        background: '#242526', border: '2px solid rgba(56,189,248,0.4)', borderRadius: 16, padding: 28,
        width: '100%', maxWidth: 380, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    promptIcon: { fontSize: 48, marginBottom: 12 },
    promptTitle: { fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px' },
    promptSub: { fontSize: 14, color: '#94a3b8', margin: '0 0 20px' },
    promptActions: { display: 'flex', flexDirection: 'column', gap: 10 },
    promptYesBtn: {
        background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '2px solid rgba(56,189,248,0.4)',
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
        background: 'none', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', color: '#3b82f6', fontSize: 14,
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
    breakdownItem: { fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '2px solid rgba(255,255,255,0.1)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', color: '#94a3b8' },

    // Jarvis Panel
    jarvisPanel: {
        background: '#242526', border: '2px solid rgba(35,116,225,0.25)',
        borderRadius: 12, padding: '14px 16px', marginTop: 8,
    },
    jarvisPanelHeader: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', cursor: 'pointer', padding: 0, width: '100%',
    },
    jarvisHeaderLeft: { display: 'flex', alignItems: 'center', gap: 10 },
    jarvisIcon: { fontSize: 26 },
    jarvisAvatarImg: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
    jarvisTitle: { fontSize: 16, fontWeight: 700, color: '#E4E6EB', textAlign: 'left' },
    jarvisSub: { fontSize: 12, color: '#64748b', marginTop: 1, textAlign: 'left' },
    jarvisChevron: { fontSize: 14, color: '#64748b', transition: 'transform 0.2s', flexShrink: 0 },
    jarvisChips: {
        display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14, marginBottom: 12,
    },
    jarvisChip: {
        fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
        background: 'rgba(56,189,248,0.08)', color: '#38bdf8',
        border: '2px solid rgba(56,189,248,0.25)', boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.25)', transition: 'all 0.15s',
    },
    jarvisInputRow: { display: 'flex', gap: 8, marginBottom: 12 },
    jarvisInput: {
        flex: 1, padding: '10px 12px', background: 'rgba(0,0,0,0.4)',
        border: '2px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)', borderRadius: 8,
        color: '#fff', fontSize: 14, outline: 'none',
    },
    jarvisAskBtn: {
        background: '#2374e1', color: '#fff', border: '2px solid rgba(35,116,225,0.5)',
        borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700,
        cursor: 'pointer', flexShrink: 0,
        opacity: 1, transition: 'opacity 0.15s, background 0.15s',
    },
    jarvisLoading: {
        display: 'flex', alignItems: 'center', gap: 8,
        color: '#38bdf8', fontSize: 13, fontWeight: 600, padding: '10px 0',
    },
    jarvisLoadingDot: {
        width: 8, height: 8, borderRadius: '50%', background: '#38bdf8',
        animation: 'pulse 1s infinite',
    },
    jarvisAnswer: {
        background: 'rgba(0,0,0,0.25)', borderRadius: 10,
        padding: 14, border: '2px solid rgba(56,189,248,0.15)', boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.15)',
    },
    jarvisAnswerLabel: { fontSize: 11, fontWeight: 700, color: '#38bdf8', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
    jarvisAnswerText: { fontSize: 13, color: '#E4E6EB', lineHeight: 1.65, whiteSpace: 'pre-wrap' },
    jarvisHistory: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 },
    jarvisHistoryItem: {
        background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: '10px 12px',
        border: '2px solid rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
    },
    taxSummaryBtn: {
        width: '100%', padding: '13px', background: 'rgba(54,187,106,0.08)',
        border: '1px dashed rgba(54,187,106,0.4)', borderRadius: 10,
        color: '#36bb6a', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        textAlign: 'center',
    },
    // Event action row (edit/delete for completed events)
    eventActionRow: {
        display: 'flex', gap: 8, padding: '6px 14px 10px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
    },
    eventEditBtn: {
        flex: 1, padding: '6px 0', background: 'rgba(74,144,217,0.1)',
        border: '2px solid rgba(74,144,217,0.3)', boxShadow: 'inset 0 0 0 1px rgba(74,144,217,0.3)', borderRadius: 6,
        color: '#4A90D9', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        textAlign: 'center',
    },
    eventDeleteBtn: {
        flex: 1, padding: '6px 0', background: 'rgba(240,40,73,0.08)',
        border: '2px solid rgba(240,40,73,0.3)', boxShadow: 'inset 0 0 0 1px rgba(240,40,73,0.3)', borderRadius: 6,
        color: '#F02849', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        textAlign: 'center',
    },
    eventSaveBtn: {
        flex: 1, padding: '8px 0', background: 'rgba(54,187,106,0.15)',
        border: '2px solid rgba(54,187,106,0.4)', boxShadow: 'inset 0 0 0 1px rgba(54,187,106,0.4)', borderRadius: 6,
        color: '#36bb6a', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    eventCancelBtn: {
        padding: '8px 16px', background: 'rgba(255,255,255,0.06)',
        border: '2px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)', borderRadius: 6,
        color: '#B0B3B8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    },
    editInlineInput: {
        width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)',
        border: '2px solid rgba(255,255,255,0.15)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)', borderRadius: 6,
        color: '#E4E6EB', fontSize: 13, outline: 'none', boxSizing: 'border-box',
    },
    jarvisHistoryQ: { fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 4 },
    jarvisHistoryA: { fontSize: 12, color: '#B0B3B8', lineHeight: 1.55, whiteSpace: 'pre-wrap' },

    // Monthly Income Goal
    goalCard: {
        background: '#242526', border: '2px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '16px 20px',
    },
    goalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    goalTitle: { fontSize: 15, fontWeight: 700, color: '#E4E6EB' },
    goalEditBtn: {
        padding: '4px 12px', background: 'rgba(74,144,217,0.15)', border: '2px solid #4A90D9', boxShadow: 'inset 0 0 0 1px #4A90D9',
        borderRadius: 6, color: '#4A90D9', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    },
    goalText: { fontSize: 14, color: '#B0B3B8', marginBottom: 10, lineHeight: 1.5 },
    goalBarBg: { height: 8, background: '#3A3B3C', borderRadius: 4, overflow: 'hidden' },
    goalBarFill: { height: '100%', borderRadius: 4, transition: 'width 0.4s ease' },
    goalEditRow: { display: 'flex', gap: 8, alignItems: 'center' },
    goalInput: {
        flex: 1, padding: '10px 12px', background: '#18191A', border: '2px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        borderRadius: 8, color: '#E4E6EB', fontSize: 14, outline: 'none',
    },
    goalSaveBtn: {
        padding: '10px 16px', background: '#4A90D9', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    },
    goalCancelBtn: {
        padding: '10px 12px', background: '#3A3B3C', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        borderRadius: 8, color: '#B0B3B8', fontSize: 16, cursor: 'pointer',
    },
    setGoalBtn: {
        width: '100%', padding: '14px 20px', background: 'linear-gradient(135deg, rgba(35,116,225,0.12), rgba(35,116,225,0.06))',
        border: '2px solid rgba(35,116,225,0.35)', borderRadius: 12,
        color: '#60a5fa', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transition: 'background 0.2s, border-color 0.2s', marginTop: 10,
    },
    goalBtnIcon: { fontSize: 16 },

    // Calendar wrapper
    calendarWrapper: {
        background: '#242526', border: '2px solid rgba(255,255,255,0.07)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)',
        borderRadius: 12, padding: '14px 12px', marginTop: 8,
    },

    // Multi-day styles
    closedDayCard: {
        background: 'rgba(0,0,0,0.2)', border: '2px solid rgba(255,255,255,0.07)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)',
        borderRadius: 8, marginBottom: 6, overflow: 'hidden',
    },
    closedDayHeader: {
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        background: 'none', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)', cursor: 'pointer', width: '100%',
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
        background: '#10b981', color: '#fff', border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    confirmNo: {
        background: 'transparent', color: '#94a3b8',
        border: '2px solid rgba(255,255,255,0.15)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)', borderRadius: 8,
        padding: '8px 16px', fontSize: 13, cursor: 'pointer',
    },
};

export default memo(TokeTracker);

