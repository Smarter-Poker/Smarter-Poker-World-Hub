/**
 * /hub/settings/notifications -- the notification settings screen.
 *
 * Every push notification in the product links here when something goes wrong,
 * and every "enable push" call to action lands here, so this route must exist
 * and must render for a signed-out user without crashing.
 */
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import PushNotificationToggle from '../../../src/components/notifications/PushNotificationToggle';
import { applyWireSubscriptionMode } from '../../../src/components/news/NewsletterCaptureBar';

// Mounted with key={userId}, so signing in as a different member always starts from a clean card.
function WeeklyWireCadenceCard() {
    const [mode, setMode] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState('');
    const saveInFlightRef = useRef(false);
    const saveSeqRef = useRef(0);

    useEffect(() => {
        let mounted = true;
        const token = getAccessToken();
        if (!token) {
            setFeedback('Sign In Again To Manage Email');
            setLoading(false);
            return undefined;
        }
        fetch('/api/news/subscribe?preferences=session', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => null) }))
            .then(({ ok, body }) => {
                if (!mounted) return;
                // A save that finished while this read was in flight is newer than this read.
                if (ok && body?.success && body?.currentMode) {
                    if (saveSeqRef.current === 0) setMode(body.currentMode);
                } else {
                    setFeedback('Unable To Load Preferences');
                }
            })
            .catch(() => {
                if (mounted) setFeedback('Unable To Load Preferences');
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, []);

    const handleSelectMode = async (targetMode) => {
        if (saveInFlightRef.current) return;
        const token = getAccessToken();
        if (!token) {
            setFeedback('Sign In Again To Save');
            return;
        }
        saveInFlightRef.current = true;
        setSaving(true);
        setFeedback('');
        try {
            const res = await fetch('/api/news/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action: 'preferences', mode: targetMode }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
                saveSeqRef.current += 1;
                setMode(data.currentMode || (targetMode === 'unsubscribe' ? 'unsubscribed' : targetMode));
                setFeedback('Saved');
                // Same cross-surface sync as /hub/email-preferences: every Weekly Wire capture bar follows.
                applyWireSubscriptionMode(targetMode);
            } else {
                setFeedback('Unable To Save');
            }
        } catch {
            setFeedback('Unable To Save');
        } finally {
            saveInFlightRef.current = false;
            setSaving(false);
        }
    };

    const MODES = [
        { key: 'all', label: 'All Updates And Rewards', desc: 'Receive All Weekly Wire Editions And Special Promotions' },
        { key: 'wire_only', label: 'Weekly Wire Only', desc: 'Receive Only The Sunday Weekly Wire Digest' },
        { key: 'snooze_30d', label: 'Pause For 30 Days', desc: 'Temporarily Pause Email Delivery For One Month' },
        { key: 'unsubscribe', label: 'Unsubscribe From Email', desc: 'Opt Out Of All Email Communications' },
    ];

    const isCurrent = (key) => {
        if (key === 'unsubscribe') {
            return mode === 'unsubscribe' || mode === 'unsubscribed';
        }
        return mode === key;
    };

    return (
        <div className="mt-8 rounded-xl border border-white/10 bg-[#111827] p-5">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-white">Weekly Wire And Email Cadence</h2>
                    <p className="mt-1 text-sm text-gray-400">
                        Choose How Often You Receive News, GTO Analysis And Tournament Alerts.
                    </p>
                </div>
                {feedback && (
                    <span className="rounded-full bg-[#4fc1b3]/20 px-3 py-1 text-xs font-semibold text-[#4fc1b3]">
                        {feedback}
                    </span>
                )}
            </div>

            {loading ? (
                <p className="mt-4 text-sm text-gray-500">Loading Preferences...</p>
            ) : (
                <div className="mt-4 space-y-3">
                    {MODES.map((item) => {
                        const active = isCurrent(item.key);
                        return (
                            <button
                                key={item.key}
                                type="button"
                                disabled={saving}
                                onClick={() => handleSelectMode(item.key)}
                                className={`flex w-full items-center justify-between rounded-lg border p-3.5 text-left transition-colors ${
                                    active
                                        ? 'border-[#4fc1b3] bg-[#4fc1b3]/10 text-white'
                                        : 'border-white/10 bg-[#0b1118] text-gray-300 hover:border-gray-600 hover:text-white'
                                }`}
                            >
                                <div>
                                    <div className="font-semibold text-white">{item.label}</div>
                                    <div className="text-xs text-gray-400">{item.desc}</div>
                                </div>
                                {active && (
                                    <span className="ml-3 rounded bg-[#4fc1b3] px-2 py-0.5 text-xs font-bold text-[#05070a]">
                                        Active
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function NotificationSettingsPage() {
    const router = useRouter();
    const [userId, setUserId] = useState(null);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        const user = getAuthUser();
        setUserId(user?.id || null);
        setChecked(true);
    }, []);

    return (
        <>
            <Head>
                <title>Notification Settings | Smarter Poker</title>
                <meta name="robots" content="noindex" />
            </Head>

            <div className="min-h-screen bg-[#0B1120] px-4 py-8 text-white">
                <div className="mx-auto w-full max-w-2xl">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="mb-4 text-sm text-gray-400 hover:text-white"
                    >
                        Back
                    </button>

                    <h1 className="text-2xl font-bold">Notifications</h1>
                    <p className="mt-1 text-sm text-gray-400">
                        Choose What Reaches Your Phone And What Stays In The App.
                    </p>

                    <div className="mt-6">
                        {!checked ? (
                            <p className="text-sm text-gray-500">Loading...</p>
                        ) : !userId ? (
                            <div className="rounded-xl border border-white/10 bg-[#111827] p-5">
                                <p className="text-sm text-gray-300">Sign In To Manage Your Notification Settings.</p>
                                <button
                                    type="button"
                                    onClick={() => router.push('/login')}
                                    className="mt-4 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-[#04211E]"
                                >
                                    Sign In
                                </button>
                            </div>
                        ) : (
                            <>
                                <PushNotificationToggle />
                                <WeeklyWireCadenceCard key={userId} />
                            </>
                        )}
                    </div>

                    <p className="mt-6 text-xs text-gray-500">
                        Notifications You Have Already Received Stay In The Bell For 90 Days.
                    </p>
                </div>
            </div>
        </>
    );
}
