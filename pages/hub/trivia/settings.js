/**
 * Trivia - Settings
 *
 * ONE settings system.
 *
 * This page used to write only to `triviaPreferences`
 * (soundEffects / timerEnabled / hintsEnabled / difficulty), which nothing in
 * the special modes ever read — meanwhile endless.js and survival-game.js
 * persisted a completely separate localStorage object, 'trivia_settings'
 * (haptics / audio / screenShake / intensity), that this page never showed.
 * Every control here was therefore decorative.
 *
 * Now every change is written to BOTH stores:
 *   - triviaPreferences  (unchanged contract — index.js and [mode].js read it)
 *   - localStorage 'trivia_settings'  (read by endless.js / survival-game.js)
 * and the haptics / screen-shake / intensity keys the games actually consume
 * are surfaced here for the first time. `soundEffects` and `audio` are kept in
 * sync so one toggle governs sound everywhere.
 *
 * SmarterPoker Dark color schema
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { getTriviaPreferences, updateTriviaPreferences } from '../../../src/services/triviaPreferences';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';

const GAME_SETTINGS_KEY = 'trivia_settings';

// 'expert' was offered here but does not exist in the trivia_questions schema
// (easy / medium / hard only), so choosing it filtered the pool to nothing.
const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'];

const DEFAULT_PREFERENCES = {
    // triviaPreferences-backed
    soundEffects: true,
    timerEnabled: true,
    hintsEnabled: false,
    difficulty: 'medium',
    // 'trivia_settings'-backed (consumed by endless.js / survival-game.js)
    haptics: true,
    screenShake: true,
    intensity: 'high'
};

/** Read the game-side settings object the game pages actually consume. */
function readGameSettings() {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(GAME_SETTINGS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) || {};
        // showPanel is transient UI state owned by the game pages — never a
        // persisted preference.
        delete parsed.showPanel;
        return parsed;
    } catch (e) {
        console.warn('[TriviaSettings] Could not read game settings:', e);
        return {};
    }
}

/**
 * Write the game-side settings object, merging so we never clobber keys we do
 * not manage. `audio` mirrors `soundEffects` — the games key sound off `audio`.
 */
function writeGameSettings(prefs) {
    if (typeof window === 'undefined') return false;
    // Sound is owned by triviaAudio (localStorage key 'trivia_audio_muted'),
    // which is what TriviaGame and every synthesized cue actually read. Writing
    // only `audio` here left a third, silently-diverging mute switch: turning
    // sound off on this page did nothing inside TriviaGame. Push the change to
    // the real owner first; `audio` below stays as a mirror for the game pages'
    // own settings blobs.
    let audioSynced = true;
    try { triviaAudio.setMuted(!prefs.soundEffects); }
    catch (e) {
        console.warn('[TriviaSettings] Could not set mute:', e?.message || e);
        audioSynced = false;
    }
    try {
        let existing = {};
        try { existing = JSON.parse(localStorage.getItem(GAME_SETTINGS_KEY) || '{}') || {}; } catch (e) { existing = {}; }
        delete existing.showPanel;
        const merged = {
            ...existing,
            audio: !!prefs.soundEffects,
            haptics: !!prefs.haptics,
            screenShake: !!prefs.screenShake,
            intensity: prefs.intensity,
            timerEnabled: !!prefs.timerEnabled,
            hintsEnabled: !!prefs.hintsEnabled,
            difficulty: prefs.difficulty
        };
        localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(merged));
        return audioSynced;
    } catch (e) {
        console.warn('[TriviaSettings] Could not persist game settings:', e);
        return false;
    }
}

export default function TriviaSettings() {
    useTrainingBus('trivia-settings');
    const router = useRouter();
    // Reactive auth — was empty-deps useEffect with getAuthUser(); preferences
    // never loaded if auth wasn't hydrated on first render.
    const { user: avatarUser, loading: avatarLoading } = useAvatar();
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [saveMessage, setSaveMessage] = useState('');
    const [saveIsError, setSaveIsError] = useState(false);

    const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

    useEffect(() => {
        if (avatarLoading) return;
        async function loadPreferences() {
            // Game-side settings load even for signed-out users — they live in
            // localStorage and still govern gameplay feedback.
            const gameSettings = readGameSettings();
            // triviaAudio is the authority on sound; seed the toggle from it so
            // the switch shown here is the switch the games obey.
            let audioIsOn = gameSettings.audio;
            try { audioIsOn = !triviaAudio.isMuted(); } catch (e) { /* keep the blob value */ }
            try {
                const user = avatarUser || getAuthUser();
                if (user) {
                    setUserId(user.id);
                    const prefs = await getTriviaPreferences(user.id);
                    setPreferences(prev => ({
                        ...prev,
                        ...gameSettings,
                        ...prefs,
                        // `audio` is the game-side name for soundEffects; if the
                        // stored account preference is missing, fall back to it.
                        soundEffects: audioIsOn ?? prefs?.soundEffects ?? prev.soundEffects
                    }));
                } else {
                    setPreferences(prev => ({ ...prev, ...gameSettings, soundEffects: audioIsOn ?? prev.soundEffects }));
                }
            } catch (error) {
                console.warn('Error loading preferences:', error);
                setPreferences(prev => ({ ...prev, ...gameSettings }));
            }
            setIsLoading(false);
        }

        loadPreferences();
    }, [avatarUser?.id, avatarLoading]);

    // Another tab (or a game page's own sound button) can flip the mute flag —
    // keep this toggle truthful instead of showing a stale value.
    useEffect(() => triviaAudio.onMuteChange((m) => {
        setPreferences(prev => (prev.soundEffects === !m ? prev : { ...prev, soundEffects: !m }));
    }), []);

    const flash = (message, isError = false) => {
        setSaveMessage(message);
        setSaveIsError(isError);
        setTimeout(() => setSaveMessage(''), 2500);
    };

    /**
     * Autosave every change (toggles AND difficulty — difficulty used to require
     * a manual Save button that then navigated away from the page after 1s).
     * Game-side settings are written first because they are local and cannot
     * fail; the account-level write rolls back the UI if it errors.
     */
    const persist = async (newPrefs, onRollback) => {
        writeGameSettings(newPrefs);
        if (!userId) {
            flash('Saved On This Device. Sign In To Sync Across Devices.');
            return;
        }
        try {
            await updateTriviaPreferences(userId, {
                soundEffects: newPrefs.soundEffects,
                timerEnabled: newPrefs.timerEnabled,
                hintsEnabled: newPrefs.hintsEnabled,
                difficulty: newPrefs.difficulty
            });
            flash('Settings Saved');
        } catch (error) {
            console.warn('Error auto-saving:', error);
            flash('Failed To Save. Please Try Again.', true);
            if (onRollback) onRollback();
        }
    };

    const handleToggle = (key) => {
        const oldValue = preferences[key];
        const newPrefs = { ...preferences, [key]: !oldValue };
        setPreferences(newPrefs);
        persist(newPrefs, () => {
            setPreferences(prev => ({ ...prev, [key]: oldValue }));
            writeGameSettings({ ...newPrefs, [key]: oldValue });
        });
    };

    const handleChoice = (key, value) => {
        const oldValue = preferences[key];
        if (oldValue === value) return;
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);
        persist(newPrefs, () => {
            setPreferences(prev => ({ ...prev, [key]: oldValue }));
            writeGameSettings({ ...newPrefs, [key]: oldValue });
        });
    };

    /** Native button semantics provide Enter and Space activation. The shared
     * progress chassis owns the visible two-state switch treatment. */
    const ToggleSwitch = ({ checked, onChange, label }) => (
        <button
            type="button"
            className="trivia-progress-switch"
            role="switch"
            aria-checked={!!checked}
            aria-label={label}
            data-checked={checked ? 'true' : 'false'}
            onClick={onChange}
            style={{ minWidth: 50, minHeight: 44 }}
        >
            <span className="trivia-progress-switch-track" aria-hidden="true">
                <span className="trivia-progress-switch-knob" />
            </span>
        </button>
    );

    const SettingRow = ({ title, description, children }) => (
        <section className="trivia-progress-setting-panel">
            <div className="trivia-progress-setting-row">
                <div className="trivia-progress-setting-copy">
                    <h2 className="trivia-progress-setting-title">{title}</h2>
                    <p className="trivia-progress-setting-description">{description}</p>
                </div>
                <div className="trivia-progress-setting-control">{children}</div>
            </div>
        </section>
    );

    const ChoiceRow = ({ label, options, value, onSelect }) => (
        <div className="trivia-progress-choice-group" role="group" aria-label={label}>
            {options.map(option => (
                <button
                    type="button"
                    key={option}
                    className="trivia-progress-choice"
                    onClick={() => onSelect(option)}
                    aria-pressed={value === option}
                    data-selected={value === option ? 'true' : 'false'}
                    style={{ minWidth: 76, minHeight: 44 }}
                >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
            ))}
        </div>
    );

    return (
        <>
            <SEOHead
                title="Trivia Settings"
                description="Customize Your Poker Trivia Experience With Difficulty, Sound, And Display Settings."
                canonical="/hub/trivia/settings"
                noindex={true}
            />

            <PageTransition>
                <div
                    className="trivia-progress-page trivia-progress-page--settings"
                    data-trivia-family="progress"
                    data-trivia-surface="settings"
                >
                    <UniversalHeader pageDepth={2} />

                    <main className="trivia-progress-shell">
                        <TriviaConsole
                            className="trivia-progress-console"
                            eyebrow="Player Controls"
                            title="Trivia Settings"
                            titleAs="h1"
                            titleId="trivia-settings-title"
                            subtitle="Changes Save Automatically"
                            aria-labelledby="trivia-settings-title"
                            secondaryAction={{
                                label: 'Back To Trivia',
                                onClick: () => router.push('/hub/trivia'),
                            }}
                        >
                        <p className="trivia-progress-subtitle">
                            Customize Your Trivia Experience. Changes Save Automatically.
                        </p>

                        {isLoading ? (
                            <div className="trivia-progress-state trivia-progress-state--loading" role="status">
                                Loading Settings...
                            </div>
                        ) : (
                            <section className="trivia-progress-settings-list" aria-label="Trivia Preferences">
                                <SettingRow
                                    title="Sound Effects"
                                    description="Countdown Heartbeat And Answer Feedback Sounds"
                                >
                                    <ToggleSwitch
                                        label="Sound Effects"
                                        checked={preferences.soundEffects}
                                        onChange={() => handleToggle('soundEffects')}
                                    />
                                </SettingRow>

                                <SettingRow
                                    title="Haptic Vibration"
                                    description="Vibrate As The Shot Clock Runs Down (Mobile Only)"
                                >
                                    <ToggleSwitch
                                        label="Haptic Vibration"
                                        checked={preferences.haptics}
                                        onChange={() => handleToggle('haptics')}
                                    />
                                </SettingRow>

                                <SettingRow
                                    title="Screen Shake"
                                    description="Shake The Board In The Final Seconds Of A Question"
                                >
                                    <ToggleSwitch
                                        label="Screen Shake"
                                        checked={preferences.screenShake}
                                        onChange={() => handleToggle('screenShake')}
                                    />
                                </SettingRow>

                                <SettingRow
                                    title="Timer"
                                    description="Show The Countdown Timer During Questions"
                                >
                                    <ToggleSwitch
                                        label="Timer"
                                        checked={preferences.timerEnabled}
                                        onChange={() => handleToggle('timerEnabled')}
                                    />
                                </SettingRow>

                                <SettingRow
                                    title="Show Hints"
                                    description="Display Hints For Difficult Questions Where Available"
                                >
                                    <ToggleSwitch
                                        label="Show Hints"
                                        checked={preferences.hintsEnabled}
                                        onChange={() => handleToggle('hintsEnabled')}
                                    />
                                </SettingRow>

                                <section className="trivia-progress-setting-panel">
                                    <h2 className="trivia-progress-setting-title">Feedback Intensity</h2>
                                    <p className="trivia-progress-setting-description">
                                        How Strong The Vibration, Shake And Audio Cues Feel
                                    </p>
                                    <ChoiceRow
                                        label="Feedback Intensity"
                                        options={['low', 'medium', 'high']}
                                        value={preferences.intensity}
                                        onSelect={(value) => handleChoice('intensity', value)}
                                    />
                                </section>

                                <section className="trivia-progress-setting-panel">
                                    <h2 className="trivia-progress-setting-title">Difficulty Level</h2>
                                    <p className="trivia-progress-setting-description">
                                        Preferred Question Difficulty In Endless Mode
                                    </p>
                                    <ChoiceRow
                                        label="Difficulty Level"
                                        options={DIFFICULTY_OPTIONS}
                                        value={preferences.difficulty}
                                        onSelect={(value) => handleChoice('difficulty', value)}
                                    />
                                </section>
                            </section>
                        )}

                        {saveMessage && (
                            <div
                                className="trivia-progress-status"
                                role={saveIsError ? 'alert' : 'status'}
                                data-tone={saveIsError ? 'error' : 'success'}
                            >
                                {saveMessage}
                            </div>
                        )}
                        </TriviaConsole>
                    </main>
                </div>
    </PageTransition>
        </>
    );
}
