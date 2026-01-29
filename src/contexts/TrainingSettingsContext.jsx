/**
 * Training Settings Context
 * ═══════════════════════════════════════════════════════════════════════════
 * Global context for training preferences (view mode, sound, timer)
 * Automatically syncs with Supabase user profile
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser } from '../lib/authUtils';

const TrainingSettingsContext = createContext();

export function TrainingSettingsProvider({ children }) {
    const [user, setUser] = useState(null);
    const [viewMode, setViewModeState] = useState('standard'); // 'standard' | 'pro'
    const [soundEnabled, setSoundEnabledState] = useState(true);
    const [timerEnabled, setTimerEnabledState] = useState(true);
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
            const { data, error } = await supabase
                .from('profiles')
                .select('training_view_mode, training_sound_enabled, training_timer_enabled')
                .eq('id', userId)
                .single();

            if (error) throw error;

            if (data) {
                setViewModeState(data.training_view_mode || 'standard');
                setSoundEnabledState(data.training_sound_enabled ?? true);
                setTimerEnabledState(data.training_timer_enabled ?? true);
            }
        } catch (error) {
            console.error('[TrainingSettings] Load error:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateSettings = async (updates) => {
        if (!user) return;

        try {
            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', user.id);

            if (error) throw error;

            console.log('[TrainingSettings] Updated:', updates);
        } catch (error) {
            console.error('[TrainingSettings] Update error:', error);
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

    const value = {
        viewMode,
        setViewMode,
        soundEnabled,
        setSoundEnabled,
        timerEnabled,
        setTimerEnabled,
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
