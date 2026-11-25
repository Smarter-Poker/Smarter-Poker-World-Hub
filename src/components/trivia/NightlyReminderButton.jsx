import { useCallback, useEffect, useRef, useState } from 'react';
import { TriviaGlassAction } from './console/TriviaConsole';
import { authedFetch } from '../../lib/authUtils';

export default function NightlyReminderButton({
    tournamentId = null,
    signedIn = false,
    onSignIn,
}) {
    const [optedIn, setOptedIn] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pending, setPending] = useState(false);
    const [statusNote, setStatusNote] = useState('');
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

    const handleToggle = async () => {
        if (!signedIn) {
            onSignIn?.();
            return;
        }
        if (pending) return;
        setPending(true);
        setStatusNote('');
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

    const label = !signedIn
        ? 'Sign In For 7:45 PM CT Alert'
        : pending
            ? 'Updating Alert'
            : optedIn
                ? '7:45 PM CT Reminder On'
                : 'Remind Me At 7:45 PM CT';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <TriviaGlassAction
                label={label}
                ink={optedIn ? 'green' : 'gold'}
                disabled={loading || pending}
                aria-pressed={signedIn ? optedIn : undefined}
                onClick={handleToggle}
            />
            {statusNote ? (
                <p className={`trivia-console-copy ${optedIn ? 'tc-ink--green' : 'tc-ink--muted'}`} role="status" style={{ margin: 0 }}>
                    {statusNote}
                </p>
            ) : null}
        </div>
    );
}
