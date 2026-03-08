/**
 * useSandboxSounds — Sound effects hook for the Virtual Sandbox
 * Toggle-able via localStorage, fires on card deals, chip sounds, analysis complete
 */
import { useRef, useCallback, useState, useEffect } from 'react';

const SOUND_URLS = {
    cardDeal: '/sounds/card-deal.mp3',
    chipClick: '/sounds/chip-click.mp3',
    analysisDing: '/sounds/analysis-ding.mp3',
};

export default function useSandboxSounds() {
    const [soundEnabled, setSoundEnabled] = useState(false);
    const audioCache = useRef({});

    // Init from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('sandbox-sounds');
            setSoundEnabled(saved === 'true');
        }
    }, []);

    // Toggle and persist
    const toggleSound = useCallback(() => {
        setSoundEnabled(prev => {
            const next = !prev;
            if (typeof window !== 'undefined') localStorage.setItem('sandbox-sounds', String(next));
            return next;
        });
    }, []);

    // Play a sound
    const play = useCallback((soundKey) => {
        if (!soundEnabled) return;
        try {
            const url = SOUND_URLS[soundKey];
            if (!url) return;
            // Reuse cached Audio objects
            if (!audioCache.current[soundKey]) {
                audioCache.current[soundKey] = new Audio(url);
                audioCache.current[soundKey].volume = 0.3;
            }
            const audio = audioCache.current[soundKey];
            audio.currentTime = 0;
            audio.play().catch(() => { }); // Ignore autoplay restrictions
        } catch (e) { /* silent */ }
    }, [soundEnabled]);

    return {
        soundEnabled,
        toggleSound,
        playCardDeal: () => play('cardDeal'),
        playChipClick: () => play('chipClick'),
        playAnalysisDing: () => play('analysisDing'),
    };
}
