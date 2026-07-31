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
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
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
    if (typeof window === 'undefined') return;
    // Sound is owned by triviaAudio (localStorage key 'trivia_audio_muted'),
    // which is what TriviaGame and every synthesized cue actually read. Writing
    // only `audio` here left a third, silently-diverging mute switch: turning
    // sound off on this page did nothing inside TriviaGame. Push the change to
    // the real owner first; `audio` below stays as a mirror for the game pages'
    // own settings blobs.
    try { triviaAudio.setMuted(!prefs.soundEffects); }
    catch (e) { console.warn('[TriviaSettings] Could not set mute:', e?.message || e); }
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
    } catch (e) {
        console.warn('[TriviaSettings] Could not persist game settings:', e);
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
            flash('Saved on this device. Sign in to sync across devices.');
            return;
        }
        try {
            await updateTriviaPreferences(userId, {
                soundEffects: newPrefs.soundEffects,
                timerEnabled: newPrefs.timerEnabled,
                hintsEnabled: newPrefs.hintsEnabled,
                difficulty: newPrefs.difficulty
            });
            flash('Settings saved');
        } catch (error) {
            console.warn('Error auto-saving:', error);
            flash('Failed to save. Please try again.', true);
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

    /**
     * Accessible toggle. Was a click-only <div> with no role, no tab stop and
     * no keyboard handling — unusable with a keyboard or a screen reader.
     */
    const ToggleSwitch = ({ checked, onChange, label }) => (
        <div
            role="switch"
            aria-checked={!!checked}
            aria-label={label}
            tabIndex={0}
            onClick={onChange}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    onChange();
                }
            }}
            style={{
                width: '50px',
                height: '26px',
                flexShrink: 0,
                background: checked ? '#2374e1' : '#3a3b3c',
                borderRadius: '13px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s'
            }}
        >
            <div style={{
                width: '22px',
                height: '22px',
                background: '#fff',
                borderRadius: '50%',
                position: 'absolute',
                top: '2px',
                left: checked ? '26px' : '2px',
                transition: 'left 0.2s'
            }} />
        </div>
    );

    const SettingRow = ({ title, description, children }) => (
        <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '180px', flex: 1 }}>
                    <div style={{ color: '#e4e6eb', fontWeight: 'bold', marginBottom: '4px' }}>{title}</div>
                    <div style={{ color: '#65676b', fontSize: '14px' }}>{description}</div>
                </div>
                {children}
            </div>
        </div>
    );

    const ChoiceRow = ({ options, value, onSelect }) => (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {options.map(option => (
                <button
                    key={option}
                    onClick={() => onSelect(option)}
                    aria-pressed={value === option}
                    style={{
                        flex: '1 1 auto',
                        minWidth: '76px',
                        padding: '12px',
                        background: value === option ? '#2374e1' : '#3a3b3c',
                        border: value === option ? 'none' : '1px solid #4e4f50',
                        color: '#e4e6eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: value === option ? 'bold' : 'normal',
                        textTransform: 'capitalize'
                    }}
                >
                    {option}
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
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#18191a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '800px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/trivia')}
                            style={{
                                background: 'rgba(35, 116, 225, 0.1)',
                                border: '1px solid rgba(35, 116, 225, 0.3)',
                                color: '#2374e1',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            Back to Trivia
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#e4e6eb', marginBottom: '12px' }}>
                            Trivia Settings
                        </h1>
                        <p style={{ color: '#65676b', marginBottom: '12px' }}>
                            Customize Your Trivia Experience. Changes Save Automatically.
                        </p>

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>
                                Loading Settings...
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '20px', marginTop: '28px' }}>
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

                                <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', padding: '20px' }}>
                                    <div style={{ color: '#e4e6eb', fontWeight: 'bold', marginBottom: '4px' }}>Feedback Intensity</div>
                                    <div style={{ color: '#65676b', fontSize: '14px', marginBottom: '12px' }}>
                                        How Strong The Vibration, Shake And Audio Cues Feel
                                    </div>
                                    <ChoiceRow
                                        options={['low', 'medium', 'high']}
                                        value={preferences.intensity}
                                        onSelect={(value) => handleChoice('intensity', value)}
                                    />
                                </div>

                                <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', padding: '20px' }}>
                                    <div style={{ color: '#e4e6eb', fontWeight: 'bold', marginBottom: '4px' }}>Difficulty Level</div>
                                    <div style={{ color: '#65676b', fontSize: '14px', marginBottom: '12px' }}>
                                        Preferred Question Difficulty In Endless Mode
                                    </div>
                                    <ChoiceRow
                                        options={DIFFICULTY_OPTIONS}
                                        value={preferences.difficulty}
                                        onSelect={(value) => handleChoice('difficulty', value)}
                                    />
                                </div>
                            </div>
                        )}

                        {saveMessage && (
                            <div
                                role="status"
                                style={{
                                    marginTop: '20px',
                                    padding: '12px',
                                    background: saveIsError ? 'rgba(240, 40, 73, 0.2)' : 'rgba(49, 162, 76, 0.2)',
                                    border: `1px solid ${saveIsError ? 'rgba(240, 40, 73, 0.4)' : 'rgba(49, 162, 76, 0.4)'}`,
                                    borderRadius: '8px',
                                    color: saveIsError ? '#f02849' : '#31a24c',
                                    textAlign: 'center'
                                }}
                            >
                                {saveMessage}
                            </div>
                        )}
                    </div>
                </div>
                  <BottomNavBar />
    </PageTransition>
        </>
    );
}
