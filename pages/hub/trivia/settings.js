import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART } from '../../../src/config/triviaIntroArt.mjs';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useOnlineStatus from '../../../src/hooks/useOnlineStatus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import {
    DEFAULT_TRIVIA_PREFERENCES,
    getLocalTriviaPreferences,
    getTriviaPreferencesState,
    resolveTriviaPreferencesConflict,
    saveTriviaPreferencesLocally,
    syncPendingTriviaPreferences,
    updateTriviaPreferences,
} from '../../../src/services/triviaPreferences';
import {
    notifyTriviaPreferenceRuntime,
    TRIVIA_PREFERENCES_EVENT,
    TRIVIA_RUNTIME_SETTINGS_KEY,
} from '../../../src/hooks/useTriviaPreferenceRuntime';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import {
    createLatestRequestScope,
    createAccountOperationScope,
    shouldGateAccountOwnedRender,
} from '../../../src/lib/trivia/accountOperationScope.mjs';

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'];
const INTENSITY_OPTIONS = ['low', 'medium', 'high'];

function readGameSettings() {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(TRIVIA_RUNTIME_SETTINGS_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        delete parsed.showPanel;
        return parsed;
    } catch (error) {
        console.warn('[TriviaSettings] Could Not Read Runtime Settings:', error?.message || error);
        return {};
    }
}

function applyGameSettings(preferences) {
    if (typeof window === 'undefined') return;
    let audioApplied = true;
    try { triviaAudio.setMuted(!preferences.soundEffects); }
    catch (error) {
        audioApplied = false;
        console.warn('[TriviaSettings] Could Not Apply Audio:', error?.message || error);
    }
    try {
        const current = readGameSettings();
        const merged = {
            ...current,
            audio: preferences.soundEffects === true,
            soundEffects: preferences.soundEffects === true,
            timerEnabled: preferences.timerEnabled === true,
            hintsEnabled: preferences.hintsEnabled === true,
            difficulty: preferences.difficulty,
            haptics: preferences.haptics === true,
            screenShake: preferences.screenShake === true,
            intensity: preferences.intensity,
            reducedMotion: preferences.reducedMotion === true,
            highContrast: preferences.highContrast === true,
            largerText: preferences.largerText === true,
        };
        localStorage.setItem(TRIVIA_RUNTIME_SETTINGS_KEY, JSON.stringify(merged));
        notifyTriviaPreferenceRuntime(merged);
    } catch (error) {
        console.warn('[TriviaSettings] Could Not Apply Runtime Settings:', error?.message || error);
        return false;
    }
    return audioApplied;
}

function NativeToggle({ id, label, checked, onChange, disabled = false }) {
    return (
        <label className="trivia-progress-native-switch" htmlFor={id} data-checked={checked ? 'true' : 'false'}>
            <input id={id} type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
            <span aria-hidden="true" className="trivia-progress-native-switch__track"><span /></span>
            <span className="trivia-progress-native-switch__state">{checked ? 'On' : 'Off'}</span>
        </label>
    );
}

function SettingRow({ title, description, status, children }) {
    return (
        <li className="trivia-progress-setting">
            <div className="trivia-progress-setting__row">
                <div className="trivia-progress-setting__copy">
                    <h3 className="trivia-progress-setting__title">{title}</h3>
                    <p className="trivia-progress-setting__description">{description}</p>
                </div>
                <div className="trivia-progress-setting__control">{children}</div>
            </div>
            {status || null}
        </li>
    );
}

function ChoiceRow({ label, options, value, onSelect, disabled = false }) {
    return (
        <div className="trivia-progress-choice-group" role="group" aria-label={label}>
            {options.map((option) => (
                <button type="button" key={option} className="tc-word trivia-progress-choice" disabled={disabled} aria-pressed={value === option} data-selected={value === option ? 'true' : 'false'} onClick={() => onSelect(option)}>{toTitleCase(option)}</button>
            ))}
        </div>
    );
}

function SettingsSection({ id, title, children }) {
    return (
        <section className="trivia-progress-settings-group" aria-labelledby={id}>
            <h2 id={id} className="trivia-progress-heading">{title}</h2>
            <ul className="trivia-progress-settings-list">{children}</ul>
        </section>
    );
}

export default function TriviaSettings() {
    useTrainingBus('trivia-settings');
    const router = useRouter();
    const online = useOnlineStatus();
    const { user: avatarUser, loading: avatarLoading } = useAvatar();
    const [userId, setUserId] = useState(null);
    const accountOperationScopeRef = useRef(null);
    if (!accountOperationScopeRef.current) {
        accountOperationScopeRef.current = createAccountOperationScope();
    }
    const loadRequestScopeRef = useRef(null);
    if (!loadRequestScopeRef.current) {
        loadRequestScopeRef.current = createLatestRequestScope();
    }
    const requestIdentityRef = useRef(undefined);
    const resolvedAccountId = avatarLoading
        ? userId
        : (avatarUser?.id || getAuthUser()?.id || null);
    if (!avatarLoading) {
        accountOperationScopeRef.current.transition(resolvedAccountId);
        if (requestIdentityRef.current !== resolvedAccountId) {
            requestIdentityRef.current = resolvedAccountId;
            loadRequestScopeRef.current.invalidate();
        }
    }
    const [preferences, setPreferences] = useState({ ...DEFAULT_TRIVIA_PREFERENCES });
    const [cloudPreferences, setCloudPreferences] = useState(null);
    const [syncStatus, setSyncStatus] = useState('loading');
    const [syncRevision, setSyncRevision] = useState(0);
    const [message, setMessage] = useState('');
    const [messageTone, setMessageTone] = useState('');
    const [messageKey, setMessageKey] = useState('');
    const timerRef = useRef(null);
    const loadedIdentityRef = useRef(undefined);

    const flash = useCallback((text, tone = 'success', key = 'sync') => {
        setMessage(text);
        setMessageTone(tone);
        setMessageKey(key);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setMessage(''), 4000);
    }, []);

    const applyState = useCallback((state) => {
        setPreferences(state.preferences);
        setCloudPreferences(state.cloudPreferences || null);
        setSyncStatus(state.status);
        setSyncRevision(Math.max(0, Number(state.revision) || 0));
        applyGameSettings(state.preferences);
    }, []);

    const load = useCallback(async () => {
        if (avatarLoading) return;
        const resolvedUserId = resolvedAccountId;
        const operationScope = accountOperationScopeRef.current.capture();
        const loadRequest = loadRequestScopeRef.current.begin();
        // A same-account storage/online refresh must not race an in-flight
        // mutation. begin() returns null while that mutation owns the scope;
        // its success or rollback applies the one authoritative visible copy.
        if (loadRequest === null) return;
        // The render boundary above is the sole owner of identity transitions.
        // An old storage-listener callback can briefly survive until its
        // effect cleanup runs; it must never transition the scope back to the
        // prior account and make stale work current again.
        if (operationScope.identity !== resolvedUserId) return;
        const isCurrent = () => accountOperationScopeRef.current.isCurrent(operationScope)
            && loadRequestScopeRef.current.isCurrent(loadRequest);
        if (loadedIdentityRef.current !== resolvedUserId) {
            loadedIdentityRef.current = resolvedUserId;
            const cached = getLocalTriviaPreferences(resolvedUserId);
            window.clearTimeout(timerRef.current);
            setUserId(resolvedUserId);
            setPreferences(cached);
            setCloudPreferences(null);
            setSyncRevision(0);
            setMessage('');
            setMessageTone('');
            setMessageKey('');
            applyGameSettings(cached);
        }
        setSyncStatus('loading');
        try {
            if (resolvedUserId && !online) {
                const cached = getLocalTriviaPreferences(resolvedUserId);
                if (!isCurrent()) return;
                setPreferences(cached);
                setSyncStatus('stale');
                applyGameSettings(cached);
                return;
            }
            const state = await getTriviaPreferencesState(resolvedUserId);
            if (!isCurrent()) return;
            applyState(state);
        } catch (error) {
            if (!isCurrent()) return;
            console.warn('[TriviaSettings] Load Failed:', error?.message || error);
            const cached = getLocalTriviaPreferences(resolvedUserId);
            if (!isCurrent()) return;
            setPreferences(cached);
            setSyncStatus(resolvedUserId ? 'stale' : 'local');
            applyGameSettings(cached);
            flash(resolvedUserId ? 'Cloud Settings Could Not Be Read. Showing This Device Copy.' : 'Showing This Device Settings.', 'error');
        }
    }, [applyState, avatarLoading, flash, online, resolvedAccountId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => () => {
        loadRequestScopeRef.current.invalidate();
        window.clearTimeout(timerRef.current);
    }, []);

    useEffect(() => {
        const syncOtherTab = (event) => {
            if (event.type === TRIVIA_PREFERENCES_EVENT) return;
            if (event.key && !event.key.startsWith('sp-trivia-prefs') && event.key !== TRIVIA_RUNTIME_SETTINGS_KEY) return;
            load();
        };
        window.addEventListener('storage', syncOtherTab);
        return () => window.removeEventListener('storage', syncOtherTab);
    }, [load]);

    const accountBoundaryPending = shouldGateAccountOwnedRender({
        loading: avatarLoading,
        resolvedIdentity: resolvedAccountId,
        loadedIdentity: userId,
    });
    const locked = accountBoundaryPending || ['loading', 'saving', 'conflict'].includes(syncStatus);

    const persist = async (key, next) => {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const mutation = loadRequestScopeRef.current.beginMutation();
        if (mutation === null) return;
        const isCurrent = () => accountOperationScopeRef.current.isCurrent(operationScope)
            && loadRequestScopeRef.current.isMutationCurrent(mutation);
        const operationUserId = operationScope.identity;
        const previous = preferences;
        const previousSyncStatus = syncStatus;
        try {
            setPreferences(next);
            applyGameSettings(next);
            if (!operationUserId) {
                saveTriviaPreferencesLocally(null, next, { pending: false, baseRevision: 0 });
                setSyncStatus('local');
                flash('Saved On This Device.', 'success', key);
                return;
            }
            if (!online) {
                saveTriviaPreferencesLocally(operationUserId, next, { pending: true, baseRevision: syncRevision });
                setSyncStatus('pending');
                flash('Saved On This Device. Cloud Sync Is Pending.', 'warning', key);
                return;
            }
            setSyncStatus('saving');
            const saved = await updateTriviaPreferences(operationUserId, next);
            if (!isCurrent()) return;
            const revision = Math.max(0, Number(saved?._sync?.revision) || syncRevision + 1);
            const authoritativePreferences = { ...next, ...(saved || {}) };
            delete authoritativePreferences._sync;
            setPreferences(authoritativePreferences);
            applyGameSettings(authoritativePreferences);
            setSyncRevision(revision);
            setCloudPreferences(authoritativePreferences);
            setSyncStatus('cloud');
            flash('Saved To Your Account.', 'success', key);
        } catch (error) {
            if (!isCurrent()) return;
            console.warn('[TriviaSettings] Save Failed:', error?.message || error);
            if (error?.code === 'trivia_preferences_conflict') {
                saveTriviaPreferencesLocally(operationUserId, next, { pending: true, baseRevision: syncRevision });
                setCloudPreferences(error.cloudPreferences || null);
                setSyncRevision(Math.max(0, Number(error.revision) || syncRevision));
                setSyncStatus('conflict');
                flash('Another Device Changed These Settings. Choose Which Copy To Keep.', 'warning', 'sync');
                return;
            }
            setPreferences(previous);
            applyGameSettings(previous);
            const preservePendingDeviceCopy = ['pending', 'stale'].includes(previousSyncStatus);
            saveTriviaPreferencesLocally(operationUserId, previous, {
                pending: preservePendingDeviceCopy,
                baseRevision: syncRevision,
            });
            setSyncStatus(preservePendingDeviceCopy ? 'pending' : 'error');
            flash(
                preservePendingDeviceCopy
                    ? 'Cloud Save Failed. The New Change Was Rolled Back; Your Earlier Device Copy Still Awaits Sync.'
                    : 'Save Failed. The Change Was Rolled Back.',
                'error',
                key,
            );
        } finally {
            loadRequestScopeRef.current.endMutation(mutation);
        }
    };

    const update = (key, value) => {
        if (locked || preferences[key] === value) return;
        persist(key, { ...preferences, [key]: value });
    };

    const retrySync = async () => {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const operationUserId = operationScope.identity;
        if (!operationUserId || !online) {
            flash('Connect To The Internet To Retry Cloud Sync.', 'warning');
            return;
        }
        const mutation = loadRequestScopeRef.current.beginMutation();
        if (mutation === null) return;
        const isCurrent = () => accountOperationScopeRef.current.isCurrent(operationScope)
            && loadRequestScopeRef.current.isMutationCurrent(mutation);
        setSyncStatus('saving');
        try {
            const state = await syncPendingTriviaPreferences(operationUserId);
            if (!isCurrent()) return;
            applyState(state);
            flash(state.status === 'conflict' ? 'Choose Which Settings To Keep.' : 'Cloud Sync Complete.', state.status === 'conflict' ? 'warning' : 'success');
        } catch (error) {
            if (!isCurrent()) return;
            console.warn('[TriviaSettings] Retry Failed:', error?.message || error);
            setSyncStatus('error');
            flash('Cloud Sync Failed. This Device Copy Was Kept.', 'error');
        } finally {
            loadRequestScopeRef.current.endMutation(mutation);
        }
    };

    const resolveConflict = async (choice) => {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null) || !operationScope.identity) return;
        const operationUserId = operationScope.identity;
        const mutation = loadRequestScopeRef.current.beginMutation();
        if (mutation === null) return;
        const isCurrent = () => accountOperationScopeRef.current.isCurrent(operationScope)
            && loadRequestScopeRef.current.isMutationCurrent(mutation);
        setSyncStatus('saving');
        try {
            const state = await resolveTriviaPreferencesConflict(operationUserId, choice);
            if (!isCurrent()) return;
            applyState(state);
            flash(choice === 'cloud' ? 'Cloud Settings Restored On This Device.' : 'This Device Settings Saved To Your Account.');
        } catch (error) {
            if (!isCurrent()) return;
            console.warn('[TriviaSettings] Conflict Resolution Failed:', error?.message || error);
            setSyncStatus('conflict');
            flash('Conflict Resolution Failed. No Copy Was Discarded.', 'error');
        } finally {
            loadRequestScopeRef.current.endMutation(mutation);
        }
    };

    const restoreDefaults = () => persist('restore', { ...DEFAULT_TRIVIA_PREFERENCES });
    const statusMessage = message ? (
        <p className={`trivia-progress-status tc-ink--${messageTone === 'error' ? 'red' : messageTone === 'warning' ? 'gold' : 'green'}`} role={messageTone === 'error' ? 'alert' : 'status'}>{message}</p>
    ) : null;
    const syncLabel = accountBoundaryPending ? 'Loading' : ({
        loading: 'Loading', local: 'Local', cloud: 'Cloud', stale: 'Offline Copy', pending: 'Sync Pending', conflict: 'Conflict', saving: 'Saving', error: 'Retry Needed',
    }[syncStatus] || 'Local');

    return (
        <TriviaErrorBoundary pageName="Settings">
            <>
                <SEOHead title="Trivia Settings" description="Control Gameplay, Feedback, Accessibility, Privacy, Notifications, And Sync For Poker Trivia." canonical="/hub/trivia/settings" noindex />
                <PageTransition>
                    <div className="trivia-progress-page trivia-progress-page--settings" data-trivia-family="progress" data-trivia-surface="settings">
                        <UniversalHeader pageDepth={2} />
                        <main className="trivia-progress-shell" aria-labelledby="trivia-settings-title">
                            <TriviaConsole
                                className="trivia-progress-console"
                                eyebrow="Player Controls"
                                title="Trivia Settings"
                                titleAs="h1"
                                titleId="trivia-settings-title"
                                subtitle="Accessible Local And Cloud Controls"
                                pill={syncLabel}
                                pillInk={!accountBoundaryPending && ['conflict', 'error'].includes(syncStatus) ? 'red' : !accountBoundaryPending && (syncStatus === 'pending' || syncStatus === 'stale') ? 'gold' : !accountBoundaryPending && syncStatus === 'cloud' ? 'green' : 'blue'}
                                secondaryAction={{ label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') }}
                            >
                                <ResponsiveModeArt art={TRIVIA_INTRO_ART.settings} priority />
                                {accountBoundaryPending ? (
                                    <p className="trivia-progress-state trivia-progress-state--loading" role="status">Loading Account Settings</p>
                                ) : <div className="trivia-progress-content trivia-progress-content--settings">
                                    <p className="trivia-progress-intro">{userId ? 'Signed-In Changes Autosave To Your Account When Online.' : 'Signed-Out Changes Stay On This Device.'}</p>
                                    {syncStatus === 'stale' ? <section className="trivia-progress-notice trivia-progress-notice--warning" role="status"><p>Offline Copy. Cloud Values Could Not Be Checked.</p></section> : null}
                                    {syncStatus === 'pending' ? <section className="trivia-progress-notice trivia-progress-notice--warning" role="status"><p>This Device Has Changes Waiting For Cloud Sync.</p><button type="button" className="tc-word" onClick={retrySync}>Retry Sync</button></section> : null}
                                    {syncStatus === 'error' ? <section className="trivia-progress-notice trivia-progress-notice--warning" role="alert"><p>The Last Cloud Action Failed. Your Prior Settings Remain Active.</p><button type="button" className="tc-word" onClick={retrySync}>Retry Cloud Read</button></section> : null}
                                    {syncStatus === 'conflict' ? (
                                        <section className="trivia-progress-conflict" role="alert" aria-labelledby="trivia-settings-conflict">
                                            <h2 id="trivia-settings-conflict" className="trivia-progress-heading">Settings Conflict</h2>
                                            <p>This Device And Your Cloud Account Both Changed. Nothing Was Overwritten.</p>
                                            <div className="trivia-progress-conflict__actions">
                                                <button type="button" className="tc-word" onClick={() => resolveConflict('device')}>Use This Device</button>
                                                <button type="button" className="tc-word" disabled={!cloudPreferences} onClick={() => resolveConflict('cloud')}>Use Cloud</button>
                                            </div>
                                        </section>
                                    ) : null}
                                    {messageKey === 'sync' || messageKey === 'restore' ? statusMessage : null}

                                    <div className="trivia-progress-settings-grid">
                                        <SettingsSection id="trivia-settings-gameplay" title="Gameplay">
                                            <SettingRow title="Timer Visibility" description="Show The Countdown During Questions" status={messageKey === 'timerEnabled' ? statusMessage : null}><NativeToggle id="trivia-setting-timer" label="Timer Visibility" checked={preferences.timerEnabled} disabled={locked} onChange={(value) => update('timerEnabled', value)} /></SettingRow>
                                            <SettingRow title="Question Hints" description="Show Hints Where A Question Supports Them" status={messageKey === 'hintsEnabled' ? statusMessage : null}><NativeToggle id="trivia-setting-hints" label="Question Hints" checked={preferences.hintsEnabled} disabled={locked} onChange={(value) => update('hintsEnabled', value)} /></SettingRow>
                                            <SettingRow title="Difficulty" description="Preferred Endless Mode Question Difficulty" status={messageKey === 'difficulty' ? statusMessage : null}><ChoiceRow label="Difficulty" options={DIFFICULTY_OPTIONS} value={preferences.difficulty} disabled={locked} onSelect={(value) => update('difficulty', value)} /></SettingRow>
                                        </SettingsSection>

                                        <SettingsSection id="trivia-settings-feedback" title="Feedback">
                                            <SettingRow title="Sound Effects" description="Countdown And Answer Feedback Audio" status={messageKey === 'soundEffects' ? statusMessage : null}><NativeToggle id="trivia-setting-sound" label="Sound Effects" checked={preferences.soundEffects} disabled={locked} onChange={(value) => update('soundEffects', value)} /></SettingRow>
                                            <SettingRow title="Haptic Vibration" description="Mobile Vibration During Time Pressure" status={messageKey === 'haptics' ? statusMessage : null}><NativeToggle id="trivia-setting-haptics" label="Haptic Vibration" checked={preferences.haptics} disabled={locked} onChange={(value) => update('haptics', value)} /></SettingRow>
                                            <SettingRow title="Screen Shake" description="Board Motion During Final Countdown" status={messageKey === 'screenShake' ? statusMessage : null}><NativeToggle id="trivia-setting-shake" label="Screen Shake" checked={preferences.screenShake} disabled={locked} onChange={(value) => update('screenShake', value)} /></SettingRow>
                                            <SettingRow title="Feedback Intensity" description="Strength Of Audio, Haptic, And Motion Cues" status={messageKey === 'intensity' ? statusMessage : null}><ChoiceRow label="Feedback Intensity" options={INTENSITY_OPTIONS} value={preferences.intensity} disabled={locked} onSelect={(value) => update('intensity', value)} /></SettingRow>
                                        </SettingsSection>

                                        <SettingsSection id="trivia-settings-accessibility" title="Accessibility">
                                            <SettingRow title="Reduced Motion" description="Suppress Nonessential Trivia Animation And Shake" status={messageKey === 'reducedMotion' ? statusMessage : null}><NativeToggle id="trivia-setting-motion" label="Reduced Motion" checked={preferences.reducedMotion} disabled={locked} onChange={(value) => update('reducedMotion', value)} /></SettingRow>
                                            <SettingRow title="High Contrast" description="Increase Separation Between Text, Rules, And Black Surfaces" status={messageKey === 'highContrast' ? statusMessage : null}><NativeToggle id="trivia-setting-contrast" label="High Contrast" checked={preferences.highContrast} disabled={locked} onChange={(value) => update('highContrast', value)} /></SettingRow>
                                            <SettingRow title="Larger Text" description="Increase Live Trivia Body And Control Text" status={messageKey === 'largerText' ? statusMessage : null}><NativeToggle id="trivia-setting-text" label="Larger Text" checked={preferences.largerText} disabled={locked} onChange={(value) => update('largerText', value)} /></SettingRow>
                                        </SettingsSection>

                                        <SettingsSection id="trivia-settings-notifications" title="Notifications">
                                            <SettingRow title="Trivia Notifications" description="No Trivia-Specific Notification Subscription Is Active. Notification Controls Will Appear Only When A Maintained Delivery API Exists."><span className="tc-ink--muted">Not Available</span></SettingRow>
                                        </SettingsSection>

                                        <SettingsSection id="trivia-settings-privacy" title="Privacy">
                                            <SettingRow title="Leaderboard Identity" description="Verified Boards Use The Display Name Stored With A Score. This Page Does Not Offer A Privacy Change Without An Authoritative Profile API."><span className="tc-ink--muted">Read Only</span></SettingRow>
                                        </SettingsSection>

                                        <SettingsSection id="trivia-settings-sync" title="Sync">
                                            <SettingRow title="Storage Contract" description={userId ? (online ? 'Account Cloud With A Device Cache' : 'Device Cache Until Cloud Is Reachable') : 'This Device Only'}><span className={syncStatus === 'cloud' ? 'tc-ink--green' : syncStatus === 'conflict' || syncStatus === 'error' ? 'tc-ink--red' : 'tc-ink--blue'}>{syncLabel}</span></SettingRow>
                                            <li className="trivia-progress-setting trivia-progress-setting--actions"><button type="button" className="tc-word" disabled={locked} onClick={restoreDefaults}>Restore Defaults</button>{userId && ['pending', 'error', 'stale'].includes(syncStatus) ? <button type="button" className="tc-word" disabled={!online} onClick={retrySync}>Retry Sync</button> : null}</li>
                                        </SettingsSection>
                                    </div>
                                </div>}
                            </TriviaConsole>
                        </main>
                    </div>
                </PageTransition>
            </>
        </TriviaErrorBoundary>
    );
}
