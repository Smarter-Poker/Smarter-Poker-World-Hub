/**
 * Training Settings Context
 * ═══════════════════════════════════════════════════════════════════════════
 * Global context for training preferences (view mode, sound, timer)
 * Automatically syncs with Supabase user profile
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser } from '../lib/authUtils';

const TrainingSettingsContext = createContext();

// Hints are only available on levels 1, 2, and 3
const HINTS_MAX_LEVEL = 3;

export function TrainingSettingsProvider({ children }) {
    const [user, setUser] = useState(null);
    const [viewMode, setViewModeState] = useState('standard'); // 'standard' | 'pro'
    const [soundEnabled, setSoundEnabledState] = useState(true);
    const [timerEnabled, setTimerEnabledState] = useState(true);
    const [autoAdvanceEnabled, setAutoAdvanceEnabledState] = useState(false);
    const [hintsEnabled, setHintsEnabledState] = useState(true);
    const [loading, setLoading] = useState(true);


    // Load user and settings on mount
    useEffect(() => {
        const authUser = getAuthUser();
        setUser(authUser);

        if (authUser) {
            loadSettings(authUser.id);
        } else {
            setLoading(false);
        }
    }, []);

    const loadSettings = async (userId) => {
        try {
            // Training settings are stored in the profiles.settings JSONB column
            // (NOT as individual columns — those don't exist)
            const { data, error } = await supabase
                .from('profiles')
                .select('settings')
                .eq('id', userId)
                .maybeSingle();

            if (error) {
                // Column may not exist or query failed — fall back to localStorage
                console.warn('[TrainingSettings] DB query failed, using cached/default values:', error.message);
                loadFromLocalStorage();
                // Don't throw — use defaults and let the app continue
            } else if (data?.settings) {
                const s = data.settings;
                setViewModeState(s.training_view_mode || 'standard');
                setSoundEnabledState(s.training_sound_enabled ?? true);
                setTimerEnabledState(s.training_timer_enabled ?? true);
                setAutoAdvanceEnabledState(s.training_auto_advance ?? false);
                setHintsEnabledState(s.training_hints_enabled ?? true);
            } else {
                // No settings yet — load from localStorage if available
                loadFromLocalStorage();
            }
        } catch (error) {
            console.warn('[TrainingSettings] Unexpected load error:', error);
            loadFromLocalStorage();
        } finally {
            setLoading(false);
        }
    };

    // Fallback: load from localStorage when DB is unavailable
    const loadFromLocalStorage = () => {
        try {
            const cached = localStorage.getItem('training_settings');
            if (cached) {
                const s = JSON.parse(cached);
                setViewModeState(s.training_view_mode || 'standard');
                setSoundEnabledState(s.training_sound_enabled ?? true);
                setTimerEnabledState(s.training_timer_enabled ?? true);
                setAutoAdvanceEnabledState(s.training_auto_advance ?? false);
                setHintsEnabledState(s.training_hints_enabled ?? true);
            }
        } catch { /* use defaults */ }
    };

    const updateSettings = async (updates) => {
        if (!user) return;

        // Cache to localStorage immediately (instant persistence)
        try {
            const existing = JSON.parse(localStorage.getItem('training_settings') || '{}');
            localStorage.setItem('training_settings', JSON.stringify({ ...existing, ...updates }));
        } catch { /* best effort */ }

        try {
            // Merge into the profiles.settings JSONB column
            // First read current settings, then merge
            const { data: current } = await supabase
                .from('profiles')
                .select('settings')
                .eq('id', user.id)
                .maybeSingle();

            const mergedSettings = { ...(current?.settings || {}), ...updates };

            const { error } = await supabase
                .from('profiles')
                .update({ settings: mergedSettings })
                .eq('id', user.id);

            if (error) {
                console.warn('[TrainingSettings] Update error (saved locally):', error.message);
            } else {
                console.debug('[TrainingSettings] Updated:', updates);
            }
        } catch (error) {
            console.warn('[TrainingSettings] Update error:', error);
        }
    };

    const setViewMode = async (mode) => {
        setViewModeState(mode);
        await updateSettings({ training_view_mode: mode });
    };

    const setSoundEnabled = async (enabled) => {
        setSoundEnabledState(enabled);
        await updateSettings({ training_sound_enabled: enabled });
    };

    const setTimerEnabled = async (enabled) => {
        setTimerEnabledState(enabled);
        await updateSettings({ training_timer_enabled: enabled });
    };

    const setAutoAdvanceEnabled = async (enabled) => {
        setAutoAdvanceEnabledState(enabled);
        await updateSettings({ training_auto_advance: enabled });
    };

    const setHintsEnabled = async (enabled) => {
        setHintsEnabledState(enabled);
        await updateSettings({ training_hints_enabled: enabled });
    };

    // Helper to check if hints are available for a given level
    // Hints are ONLY available on levels 1, 2, and 3
    const areHintsAvailable = useCallback((currentLevel) => {
        return hintsEnabled && currentLevel <= HINTS_MAX_LEVEL;
    }, [hintsEnabled]);

    const value = {
        viewMode,
        setViewMode,
        soundEnabled,
        setSoundEnabled,
        timerEnabled,
        setTimerEnabled,
        autoAdvanceEnabled,
        setAutoAdvanceEnabled,
        hintsEnabled,
        setHintsEnabled,
        areHintsAvailable,
        HINTS_MAX_LEVEL,
        loading,
    };


    return (
        <TrainingSettingsContext.Provider value={value}>
            {children}
        </TrainingSettingsContext.Provider>
    );
}

export function useTrainingSettings() {
    const context = useContext(TrainingSettingsContext);
    if (!context) {
        throw new Error('useTrainingSettings must be used within TrainingSettingsProvider');
    }
    return context;
}
