import { useCallback, useEffect, useRef, useState } from 'react';
import { TriviaGlassAction } from './console/TriviaConsole';
import { authedFetch } from '../../lib/authUtils';
import {
    enablePush,
    hasLocalSubscription,
    isWebPushSupported,
    notificationPermission,
} from '../../lib/push-client';

export default function NightlyReminderButton({
    tournamentId = null,
    signedIn = false,
    onSignIn,
}) {
    const [optedIn, setOptedIn] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pending, setPending] = useState(false);
    const [statusNote, setStatusNote] = useState('');
    const [pushSupported, setPushSupported] = useState(false);
    const [pushPermission, setPushPermission] = useState('unsupported');
    const [devicePushSubscribed, setDevicePushSubscribed] = useState(false);
    const [pushPending, setPushPending] = useState(false);
    const [pushErrorNote, setPushErrorNote] = useState('');
    const requestIdRef = useRef(0);

    const loadStatus = useCallback(async (signal) => {
        const requestId = ++requestIdRef.current;
        if (!signedIn) {
            setOptedIn(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const qs = tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : '';
            const response = await authedFetch(`/api/trivia/nightly-reminder${qs}`, { method: 'GET', signal });
            const payload = await response.json().catch(() => ({}));
            if (signal?.aborted || requestIdRef.current !== requestId) return;
            if (response.ok && payload?.success) {
                setOptedIn(Boolean(payload.optedIn));
            }
        } catch (err) {
            if (err?.name === 'AbortError' || signal?.aborted || requestIdRef.current !== requestId) return;
            // Non-blocking status check
        } finally {
            if (!signal?.aborted && requestIdRef.current === requestId) {
                setLoading(false);
            }
        }
    }, [signedIn, tournamentId]);

    useEffect(() => {
        const controller = new AbortController();
        void loadStatus(controller.signal);
        return () => controller.abort();
    }, [loadStatus]);

    // Passive browser push capability inspection only - NEVER prompts permission on mount.
    useEffect(() => {
        if (!signedIn || !optedIn) {
            setDevicePushSubscribed(false);
            setPushErrorNote('');
            return undefined;
        }
        const supported = isWebPushSupported();
        setPushSupported(supported);
        if (!supported) {
            setPushPermission('unsupported');
            setDevicePushSubscribed(false);
            return undefined;
        }
        const perm = notificationPermission();
        setPushPermission(perm);
        if (perm !== 'granted') {
            setDevicePushSubscribed(false);
            return undefined;
        }
        let cancelled = false;
        void hasLocalSubscription()
            .then((subscribed) => {
                if (!cancelled) setDevicePushSubscribed(Boolean(subscribed));
            })
            .catch(() => {
                if (!cancelled) setDevicePushSubscribed(false);
            });
        return () => {
            cancelled = true;
        };
    }, [signedIn, optedIn]);

    const handleToggle = async () => {
        if (!signedIn) {
            onSignIn?.();
            return;
        }
        if (pending) return;
        setPending(true);
        setStatusNote('');
        setPushErrorNote('');
        try {
            const response = await authedFetch('/api/trivia/nightly-reminder', {
                method: 'POST',
                body: JSON.stringify({
                    tournamentId: tournamentId || undefined,
                    enabled: !optedIn,
                    channel: 'in_app_push',
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(payload?.error || 'reminder_toggle_failed');
            }
            const nextState = Boolean(payload.optedIn);
            setOptedIn(nextState);
            setStatusNote(nextState
                ? '7:45 PM CT Alert Scheduled For Tonight.'
                : 'Nightly Alert Turned Off.');
        } catch {
            setStatusNote('Could Not Update Nightly Alert Right Now.');
        } finally {
            setPending(false);
        }
    };

    // Explicit user-gesture Web Push subscription opt-in.
    const handleEnableDevicePush = async () => {
        if (!signedIn || !optedIn || pushPending) return;
        setPushPending(true);
        setPushErrorNote('');
        try {
            const result = await enablePush();
            if (result?.ok) {
                setPushPermission('granted');
                setDevicePushSubscribed(true);
            } else {
                const nextPerm = result?.permission || notificationPermission();
                setPushPermission(nextPerm);
                setDevicePushSubscribed(false);
                if (nextPerm !== 'denied') {
                    setPushErrorNote(result?.error || 'Could Not Enable Device Push Alerts Right Now.');
                }
            }
        } catch {
            setPushPermission(notificationPermission());
            setDevicePushSubscribed(false);
            setPushErrorNote('Could Not Enable Device Push Alerts Right Now.');
        } finally {
            setPushPending(false);
        }
    };

    const label = !signedIn
        ? 'Sign In For 7:45 PM CT Alert'
        : pending
            ? 'Updating Alert'
            : optedIn
                ? '7:45 PM CT Reminder On'
                : 'Remind Me At 7:45 PM CT';

    const showDevicePushCta = signedIn
        && optedIn
        && pushSupported
        && (pushPermission === 'default' || (pushPermission === 'granted' && !devicePushSubscribed));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <TriviaGlassAction
                label={label}
                ink={optedIn ? 'green' : 'blue'}
                disabled={loading || pending}
                aria-pressed={signedIn ? optedIn : undefined}
                onClick={handleToggle}
            />
            {statusNote ? (
                <p className={`trivia-console-copy ${optedIn ? 'tc-ink--green' : 'tc-ink--muted'}`} role="status" style={{ margin: 0 }}>
                    {statusNote}
                </p>
            ) : null}
            {signedIn && optedIn && pushSupported && pushPermission === 'granted' && devicePushSubscribed ? (
                <p
                    className="trivia-console-copy tc-ink--cyan"
                    role="status"
                    data-device-push-status="active"
                    style={{ margin: 0 }}
                >
                    Device Push Alerts Active
                </p>
            ) : null}
            {signedIn && optedIn && pushSupported && pushPermission === 'denied' ? (
                <p
                    className="trivia-console-copy tc-ink--muted"
                    role="status"
                    data-device-push-status="denied"
                    style={{ margin: 0 }}
                >
                    Browser Push Blocked - In-App Alert Active
                </p>
            ) : null}
            {showDevicePushCta ? (
                <button
                    type="button"
                    className="sd-button"
                    data-enable-device-push="true"
                    disabled={pushPending}
                    onClick={handleEnableDevicePush}
                    style={{ minHeight: '44px', width: '100%' }}
                >
                    {pushPending ? 'Enabling Device Push Alerts...' : 'Enable Device Push Alerts'}
                </button>
            ) : null}
            {pushErrorNote ? (
                <p className="trivia-console-copy tc-ink--muted" role="status" style={{ margin: 0 }}>
                    {pushErrorNote}
                </p>
            ) : null}
        </div>
    );
}
