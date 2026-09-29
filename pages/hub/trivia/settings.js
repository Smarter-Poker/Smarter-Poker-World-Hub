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

import { useState, useEffect, useRef } from 'react';
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
import { toTitleCase } from '../../../src/lib/trivia/titleCase';

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

/**
 * A two-state control printed as a lit word on the glass: "On" in green,
 * "Off" in muted ink. Native button semantics provide Enter and Space; the
 * switch role and aria-checked carry the state. Defined at module scope so a
 * re-render never remounts it (and never drops keyboard focus).
 */
function ToggleSwitch({ checked, onChange, label }) {
    return (
        <button
            type="button"
            className="tc-word trivia-progress-switch"
            role="switch"
            aria-checked={!!checked}
            aria-label={label}
            data-checked={checked ? 'true' : 'false'}
            onClick={onChange}
        >
            {checked ? 'On' : 'Off'}
        </button>
    );
}

function SettingRow({ title, description, status, stacked = false, children }) {
    return (
        <li className="trivia-progress-setting" data-layout={stacked ? 'stacked' : 'inline'}>
            <div className="trivia-progress-setting__row">
                <div className="trivia-progress-setting__copy">
                    <h2 className="trivia-progress-setting__title">{title}</h2>
                    <p className="trivia-progress-setting__description">{description}</p>
                </div>
                {!stacked && <div className="trivia-progress-setting__control">{children}</div>}
            </div>
            {stacked && children}
            {status}
        </li>
    );
}

function ChoiceRow({ label, options, value, onSelect }) {
    return (
        <div className="trivia-progress-choice-group" role="group" aria-label={label}>
            {options.map(option => (
                <button
                    type="button"
                    key={option}
                    className="tc-word trivia-progress-choice"
                    onClick={() => onSelect(option)}
                    aria-pressed={value === option}
                    data-selected={value === option ? 'true' : 'false'}
                >
                    {toTitleCase(option)}
                </button>
            ))}
        </div>
    );
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
    const [saveKey, setSaveKey] = useState('');

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

    // One pending clear at a time, and none after unmount.
    const flashTimerRef = useRef(null);
    useEffect(() => () => window.clearTimeout(flashTimerRef.current), []);

    const flash = (message, isError = false, key = '') => {
        setSaveMessage(message);
        setSaveIsError(isError);
        setSaveKey(key);
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setSaveMessage(''), 2500);
    };

    /**
     * Autosave every change (toggles AND difficulty - difficulty used to require
     * a manual Save button that then navigated away from the page after 1s).
     * Game-side settings are written first because they are local and cannot
     * fail; the account-level write rolls back the UI if it errors.
     */
    const persist = async (key, newPrefs, onRollback) => {
        writeGameSettings(newPrefs);
        if (!userId) {
            flash('Saved On This Device. Sign In To Sync Across Devices.', false, key);
            return;
        }
        try {
            await updateTriviaPreferences(userId, {
                soundEffects: newPrefs.soundEffects,
                timerEnabled: newPrefs.timerEnabled,
                hintsEnabled: newPrefs.hintsEnabled,
                difficulty: newPrefs.difficulty
            });
            flash('Settings Saved', false, key);
        } catch (error) {
            console.warn('Error auto-saving:', error);
            flash('Failed To Save. Please Try Again.', true, key);
            if (onRollback) onRollback();
        }
    };

    const handleToggle = (key) => {
        const oldValue = preferences[key];
        const newPrefs = { ...preferences, [key]: !oldValue };
        setPreferences(newPrefs);
        persist(key, newPrefs, () => {
            setPreferences(prev => ({ ...prev, [key]: oldValue }));
            writeGameSettings({ ...newPrefs, [key]: oldValue });
        });
    };

    const handleChoice = (key, value) => {
        const oldValue = preferences[key];
        if (oldValue === value) return;
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);
        persist(key, newPrefs, () => {
            setPreferences(prev => ({ ...prev, [key]: oldValue }));
            writeGameSettings({ ...newPrefs, [key]: oldValue });
        });
    };

    // Save feedback prints in the row that changed, where the player is looking.
    const statusFor = (key) => (saveMessage && saveKey === key ? (
        <p
            className={`trivia-progress-status ${saveIsError ? 'tc-ink--red' : 'tc-ink--green'}`}
            role={saveIsError ? 'alert' : 'status'}
            data-tone={saveIsError ? 'error' : 'success'}
        >
            {saveMessage}
        </p>
    ) : null);

    const toggles = [
        { key: 'soundEffects', title: 'Sound Effects', description: 'Countdown Heartbeat And Answer Feedback Sounds' },
        { key: 'haptics', title: 'Haptic Vibration', description: 'Vibrate As The Shot Clock Runs Down (Mobile Only)' },
        { key: 'screenShake', title: 'Screen Shake', description: 'Shake The Board In The Final Seconds Of A Question' },
        { key: 'timerEnabled', title: 'Timer', description: 'Show The Countdown Timer During Questions' },
        { key: 'hintsEnabled', title: 'Show Hints', description: 'Display Hints For Difficult Questions Where Available' },
    ];

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
                            pill={isLoading ? 'Loading' : userId ? 'Synced' : 'Local'}
                            pillInk={!isLoading && userId ? 'green' : 'blue'}
                            aria-labelledby="trivia-settings-title"
                            secondaryAction={{
                                label: 'Back To Trivia',
                                onClick: () => router.push('/hub/trivia'),
                            }}
                        >
                        <p className="trivia-progress-intro">
                            {userId
                                ? 'Customize Your Trivia Experience. Every Change Saves To Your Account.'
                                : 'Customize Your Trivia Experience. Signed Out, Changes Save On This Device Only.'}
                        </p>

                        {isLoading ? (
                            <p className="trivia-progress-state trivia-progress-state--loading" role="status">
                                Loading Settings
                            </p>
                        ) : (
                            <ul className="trivia-progress-settings-list" aria-label="Trivia Preferences">
                                {toggles.map(toggle => (
                                    <SettingRow
                                        key={toggle.key}
                                        title={toggle.title}
                                        description={toggle.description}
                                        status={statusFor(toggle.key)}
                                    >
                                        <ToggleSwitch
                                            label={toggle.title}
                                            checked={preferences[toggle.key]}
                                            onChange={() => handleToggle(toggle.key)}
                                        />
                                    </SettingRow>
                                ))}

                                <SettingRow
                                    title="Feedback Intensity"
                                    description="How Strong The Vibration, Shake And Audio Cues Feel"
                                    status={statusFor('intensity')}
                                    stacked
                                >
                                    <ChoiceRow
                                        label="Feedback Intensity"
                                        options={['low', 'medium', 'high']}
                                        value={preferences.intensity}
                                        onSelect={(value) => handleChoice('intensity', value)}
                                    />
                                </SettingRow>

                                <SettingRow
                                    title="Difficulty Level"
                                    description="Preferred Question Difficulty In Endless Mode"
                                    status={statusFor('difficulty')}
                                    stacked
                                >
                                    <ChoiceRow
                                        label="Difficulty Level"
                                        options={DIFFICULTY_OPTIONS}
                                        value={preferences.difficulty}
                                        onSelect={(value) => handleChoice('difficulty', value)}
                                    />
                                </SettingRow>
                            </ul>
                        )}
                        </TriviaConsole>
                    </main>
                </div>
    </PageTransition>
        </>
    );
}
