/* ═══════════════════════════════════════════════════════════════════════════
   NEURAL FIELD CONTEXT — Public API for controlling the Neural Conduction Field
   Exposes setIntensity, pulse, and setTheme for cross-system integration
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { createContext, useContext, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 THEME CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
export interface NeuralTheme {
    neuronColor: string;
    glowColor: string;
    backgroundTint: string;
    brainLineColor: string;
    gridLineColor: string;
}

export const DEFAULT_THEME: NeuralTheme = {
    neuronColor: '#ffffff',
    glowColor: '#00dcff',
    backgroundTint: '#050510',
    brainLineColor: '#0066ff',
    gridLineColor: '#00f6ff',
};

// ─────────────────────────────────────────────────────────────────────────────
// ⚡ INTENSITY MODES
// ─────────────────────────────────────────────────────────────────────────────
export type IntensityMode = 'idle' | 'focus' | 'decision' | 'celebration';

export interface IntensityConfig {
    spawnRate: number;      // Particles per second
    speed: number;          // Base movement speed multiplier
    glowStrength: number;   // Glow intensity (0-1)
    pulseFrequency: number; // Random pulse frequency
}

export const INTENSITY_PRESETS: Record<IntensityMode, IntensityConfig> = {
    idle: {
        spawnRate: 0.3,
        speed: 0.5,
        glowStrength: 0.4,
        pulseFrequency: 0.1,
    },
    focus: {
        spawnRate: 0.6,
        speed: 0.8,
        glowStrength: 0.6,
        pulseFrequency: 0.2,
    },
    decision: {
        spawnRate: 1.0,
        speed: 1.2,
        glowStrength: 0.85,
        pulseFrequency: 0.4,
    },
    celebration: {
        spawnRate: 1.5,
        speed: 1.5,
        glowStrength: 1.0,
        pulseFrequency: 0.8,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 🌐 PUBLIC API INTERFACE
// ─────────────────────────────────────────────────────────────────────────────
export interface NeuralFieldAPI {
    /** Set the field intensity mode with optional strength multiplier */
    setIntensity: (mode: IntensityMode, strength?: number) => void;

    /** Trigger a pulse effect at optional coordinates */
    pulse: (at?: { x: number; y: number }, power?: number) => void;

    /** Update the visual theme */
    setTheme: (theme: Partial<NeuralTheme>) => void;

    /** Get current intensity config */
    getIntensity: () => IntensityConfig;

    /** Get current theme */
    getTheme: () => NeuralTheme;
}

// ─────────────────────────────────────────────────────────────────────────────
// 📍 CONTEXT
// ─────────────────────────────────────────────────────────────────────────────
const NeuralFieldContext = createContext<NeuralFieldAPI | null>(null);

export function useNeuralField(): NeuralFieldAPI {
    const context = useContext(NeuralFieldContext);
    if (!context) {
        // Return no-op API if used outside provider
        return {
            setIntensity: () => { },
            pulse: () => { },
            setTheme: () => { },
            getIntensity: () => INTENSITY_PRESETS.idle,
            getTheme: () => DEFAULT_THEME,
        };
    }
    return context;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏗️ PROVIDER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface NeuralFieldProviderProps {
    children: React.ReactNode;
    onIntensityChange?: (mode: IntensityMode, config: IntensityConfig) => void;
    onPulse?: (at: { x: number; y: number } | undefined, power: number) => void;
    onThemeChange?: (theme: NeuralTheme) => void;
}

export function NeuralFieldProvider({
    children,
    onIntensityChange,
    onPulse,
    onThemeChange,
}: NeuralFieldProviderProps) {
    const intensityRef = useRef<IntensityConfig>(INTENSITY_PRESETS.idle);
    const themeRef = useRef<NeuralTheme>(DEFAULT_THEME);

    const setIntensity = useCallback((mode: IntensityMode, strength: number = 1) => {
        const base = INTENSITY_PRESETS[mode];
        const scaled: IntensityConfig = {
            spawnRate: base.spawnRate * strength,
            speed: base.speed * strength,
            glowStrength: Math.min(base.glowStrength * strength, 1),
            pulseFrequency: base.pulseFrequency * strength,
        };
        intensityRef.current = scaled;
        onIntensityChange?.(mode, scaled);
    }, [onIntensityChange]);

    const pulse = useCallback((at?: { x: number; y: number }, power: number = 1) => {
        onPulse?.(at, power);
    }, [onPulse]);

    const setTheme = useCallback((updates: Partial<NeuralTheme>) => {
        themeRef.current = { ...themeRef.current, ...updates };
        onThemeChange?.(themeRef.current);
    }, [onThemeChange]);

    const getIntensity = useCallback(() => intensityRef.current, []);
    const getTheme = useCallback(() => themeRef.current, []);

    const api: NeuralFieldAPI = {
        setIntensity,
        pulse,
        setTheme,
        getIntensity,
        getTheme,
    };

    return (
        <NeuralFieldContext.Provider value={api}>
            {children}
        </NeuralFieldContext.Provider>
    );
}

export default NeuralFieldContext;
