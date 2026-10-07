import { useEffect } from 'react';

export const TRIVIA_RUNTIME_SETTINGS_KEY = 'trivia_settings';
export const TRIVIA_PREFERENCES_EVENT = 'trivia-preferences-changed';

function readRuntimePreferences() {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(TRIVIA_RUNTIME_SETTINGS_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        console.warn('[TriviaPrefs] Could not read runtime preferences:', error?.message || error);
        return {};
    }
}

export function applyTriviaPreferenceRuntime(preferences = readRuntimePreferences()) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.triviaReducedMotion = preferences.reducedMotion === true ? 'true' : 'false';
    root.dataset.triviaHighContrast = preferences.highContrast === true ? 'true' : 'false';
    root.dataset.triviaLargerText = preferences.largerText === true ? 'true' : 'false';
}

export function notifyTriviaPreferenceRuntime(preferences) {
    applyTriviaPreferenceRuntime(preferences);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(TRIVIA_PREFERENCES_EVENT, { detail: preferences }));
    }
}

export default function useTriviaPreferenceRuntime() {
    useEffect(() => {
        const sync = (event) => {
            if (event?.type === 'storage' && event.key && event.key !== TRIVIA_RUNTIME_SETTINGS_KEY) return;
            applyTriviaPreferenceRuntime(event?.detail || readRuntimePreferences());
        };
        sync();
        window.addEventListener('storage', sync);
        window.addEventListener(TRIVIA_PREFERENCES_EVENT, sync);
        return () => {
            window.removeEventListener('storage', sync);
            window.removeEventListener(TRIVIA_PREFERENCES_EVENT, sync);
        };
    }, []);
}
