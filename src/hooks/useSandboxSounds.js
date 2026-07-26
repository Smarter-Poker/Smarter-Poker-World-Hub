/**
 * useSandboxSounds — Sound effects hook for the Virtual Sandbox
 * Toggle-able via localStorage, fires on card deals, chip sounds, analysis complete
 *
 * The returned helpers are stable across renders (useCallback/useMemo) so memoized
 * children that receive them as props do not re-render on every parent update.
 */
import { useRef, useCallback, useMemo, useState, useEffect } from 'react';

const SOUND_URLS = {
    cardDeal: '/sounds/card-deal.mp3',
    chipClick: '/sounds/chip-click.mp3',
    analysisDing: '/sounds/analysis-ding.mp3',
};

const VOLUME = 0.3;

export default function useSandboxSounds() {
    const [soundEnabled, setSoundEnabled] = useState(false);
    const audioCache = useRef({});
    const brokenSounds = useRef({}); // keys whose asset failed to load — never retried

    // Init from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('sandbox-sounds');
            setSoundEnabled(saved === 'true');
        }
    }, []);

    // Release cached Audio elements on unmount
    useEffect(() => {
        const cache = audioCache.current;
        return () => {
            Object.keys(cache || {}).forEach(key => {
                const audio = cache[key];
                try {
                    audio?.pause?.();
                    if (audio) audio.src = '';
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                delete cache[key];
            });
        };
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
        if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
        if (brokenSounds.current[soundKey]) return; // asset missing — stop retrying
        try {
            const url = SOUND_URLS[soundKey];
            if (!url) return;
            // Reuse cached Audio objects
            if (!audioCache.current[soundKey]) {
                const audio = new Audio(url);
                audio.volume = VOLUME;
                // A missing /sounds/*.mp3 would otherwise warn on every single play
                audio.addEventListener('error', () => {
                    brokenSounds.current[soundKey] = true;
                    delete audioCache.current[soundKey];
                }, { once: true });
                audioCache.current[soundKey] = audio;
            }
            const audio = audioCache.current[soundKey];
            audio.currentTime = 0;
            audio.play().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // Ignore autoplay restrictions
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }, [soundEnabled]);

    const playCardDeal = useCallback(() => play('cardDeal'), [play]);
    const playChipClick = useCallback(() => play('chipClick'), [play]);
    const playAnalysisDing = useCallback(() => play('analysisDing'), [play]);

    return useMemo(() => ({
        soundEnabled,
        toggleSound,
        playCardDeal,
        playChipClick,
        playAnalysisDing,
    }), [soundEnabled, toggleSound, playCardDeal, playChipClick, playAnalysisDing]);
}
