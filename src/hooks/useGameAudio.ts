/**
 * 🎮 USE GAME AUDIO - React Hook for Audio & Haptics
 * 
 * Provides safe audio/haptics integration for the Director engine.
 * Handles:
 * - Audio unlocking on first user interaction
 * - Mute state management
 * - Action-based sound triggers
 * - Haptic feedback for mobile
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
    getSoundManager,
    getHapticsManager,
    SoundManager,
    HapticsManager,
    SoundEvent
} from '../lib/SoundManager';
import type { ActionType } from '../types/poker';

interface UseGameAudioOptions {
    autoUnlock?: boolean;
}

interface UseGameAudioReturn {
    // State
    isMuted: boolean;
    isUnlocked: boolean;

    // Controls
    toggleMute: () => void;
    setMuted: (muted: boolean) => void;
    unlock: () => Promise<void>;

    // Sound triggers
    playCardDeal: () => void;
    playChipSlide: () => void;
    playTurnAlert: () => void;
    playSuccess: () => void;
    playError: () => void;
    playTick: () => void;
    playAction: (action: ActionType) => void;

    // Haptics triggers
    hapticTap: () => void;
    hapticMedium: () => void;
    hapticStrong: () => void;
    hapticError: () => void;
    hapticSuccess: () => void;
    hapticTick: () => void;
}

export function useGameAudio(options: UseGameAudioOptions = {}): UseGameAudioReturn {
    const [isMuted, setIsMutedState] = useState(false);
    const [isUnlocked, setIsUnlocked] = useState(false);

    const soundManagerRef = useRef<SoundManager | null>(null);
    const hapticsManagerRef = useRef<HapticsManager | null>(null);

    // Initialize managers on mount
    useEffect(() => {
        soundManagerRef.current = getSoundManager();
        hapticsManagerRef.current = getHapticsManager();
    }, []);

    /**
     * 🔓 Unlock audio (must be called from user gesture)
     */
    const unlock = useCallback(async () => {
        if (!soundManagerRef.current) return;

        await soundManagerRef.current.unlock();
        setIsUnlocked(true);
    }, []);

    /**
     * 🔇 Toggle mute state
     */
    const toggleMute = useCallback(() => {
        if (!soundManagerRef.current) return;

        const newMuted = soundManagerRef.current.toggleMute();
        setIsMutedState(newMuted);
    }, []);

    /**
     * 🔇 Set mute state directly
     */
    const setMuted = useCallback((muted: boolean) => {
        if (!soundManagerRef.current) return;

        soundManagerRef.current.setMuted(muted);
        setIsMutedState(muted);
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // SOUND TRIGGERS
    // ═══════════════════════════════════════════════════════════════════════

    const playCardDeal = useCallback(() => {
        soundManagerRef.current?.playCardDeal();
        hapticsManagerRef.current?.tap();
    }, []);

    const playChipSlide = useCallback(() => {
        soundManagerRef.current?.playChipSlide();
        hapticsManagerRef.current?.tap();
    }, []);

    const playTurnAlert = useCallback(() => {
        soundManagerRef.current?.playTurnAlert();
        hapticsManagerRef.current?.medium();
    }, []);

    const playSuccess = useCallback(() => {
        soundManagerRef.current?.playSuccess();
        hapticsManagerRef.current?.success();
    }, []);

    const playError = useCallback(() => {
        soundManagerRef.current?.playError();
        hapticsManagerRef.current?.error();
    }, []);

    const playTick = useCallback(() => {
        soundManagerRef.current?.playTick();
        hapticsManagerRef.current?.tick();
    }, []);

    /**
     * 🎯 Play sound based on poker action type
     */
    const playAction = useCallback((action: ActionType) => {
        if (!soundManagerRef.current) return;

        switch (action) {
            case 'FOLD':
                soundManagerRef.current.play('FOLD', { volume: 0.4 });
                hapticsManagerRef.current?.tap();
                break;
            case 'CHECK':
                soundManagerRef.current.play('CHECK', { volume: 0.3 });
                hapticsManagerRef.current?.tap();
                break;
            case 'CALL':
                soundManagerRef.current.play('CALL', { volume: 0.4 });
                soundManagerRef.current.playChipSlide();
                hapticsManagerRef.current?.tap();
                break;
            case 'RAISE':
            case 'BET':
                soundManagerRef.current.play('RAISE', { volume: 0.5 });
                soundManagerRef.current.playChipSlide();
                hapticsManagerRef.current?.medium();
                break;
            case 'ALL_IN':
                soundManagerRef.current.play('ALL_IN', { volume: 0.6 });
                hapticsManagerRef.current?.strong();
                break;
            case 'ANTE':
            case 'BLIND_SB':
            case 'BLIND_BB':
                soundManagerRef.current.playChipSlide();
                break;
            case 'POT_SWEEP':
                soundManagerRef.current.play('POT_WIN', { volume: 0.5 });
                break;
            default:
                // Unknown action - no sound
                break;
        }
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // HAPTICS TRIGGERS (Direct access for custom use)
    // ═══════════════════════════════════════════════════════════════════════

    const hapticTap = useCallback(() => {
        hapticsManagerRef.current?.tap();
    }, []);

    const hapticMedium = useCallback(() => {
        hapticsManagerRef.current?.medium();
    }, []);

    const hapticStrong = useCallback(() => {
        hapticsManagerRef.current?.strong();
    }, []);

    const hapticError = useCallback(() => {
        hapticsManagerRef.current?.error();
    }, []);

    const hapticSuccess = useCallback(() => {
        hapticsManagerRef.current?.success();
    }, []);

    const hapticTick = useCallback(() => {
        hapticsManagerRef.current?.tick();
    }, []);

    return {
        // State
        isMuted,
        isUnlocked,

        // Controls
        toggleMute,
        setMuted,
        unlock,

        // Sound triggers
        playCardDeal,
        playChipSlide,
        playTurnAlert,
        playSuccess,
        playError,
        playTick,
        playAction,

        // Haptics triggers
        hapticTap,
        hapticMedium,
        hapticStrong,
        hapticError,
        hapticSuccess,
        hapticTick,
    };
}
