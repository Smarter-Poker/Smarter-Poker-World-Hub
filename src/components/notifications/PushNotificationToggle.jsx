/**
 * PushNotificationToggle -- the device enrollment card.
 *
 * Master switch for push on THIS device, plus the per-category toggles. Each
 * category toggle saves instantly (optimistic, with rollback on error) -- there
 * is deliberately no Save button, because a settings screen that silently
 * discards a toggle on navigation is worse than no settings screen.
 *
 * Props:
 *   title?         heading text
 *   description?   sub text
 *   showTypePrefs? render the per-category list (default true)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    enablePush, disablePush, sendTestPush,
    isWebPushSupported, notificationPermission,
    hasLocalSubscription, isIos, isIosStandalonePwa,
} from '../../lib/push-client';
import { getAccessToken } from '../../lib/authUtils';
import { groupedPushTypes } from '../../lib/push/push-prefs';
import { useToastStore } from '../../stores/toastStore';

// Belt-and-suspenders over the per-step timeouts inside push-client. If
// anything at all wedges, the spinner still resolves and the user gets a
// message instead of an eternal "Enabling...".
const STUCK_GUARD_MS = 120_000;

function Switch({ checked, disabled, onChange, label }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={[
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500',
                checked ? 'bg-teal-500' : 'bg-gray-600',
                disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
        >
            <span
                className={[
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    checked ? 'translate-x-6' : 'translate-x-1',
                ].join(' ')}
            />
        </button>
    );
}

export default function PushNotificationToggle({
    title = 'Device Notifications',
    description = 'Get alerts on this device even when Smarter Poker is closed.',
    showTypePrefs = true,
}) {
    const addToast = useToastStore((s) => s.addToast);

    const [supported, setSupported] = useState(true);
    const [permission, setPermission] = useState('default');
    const [subscribed, setSubscribed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [testing, setTesting] = useState(false);
    const [prefs, setPrefs] = useState({});
    const [muteAll, setMuteAll] = useState(false);
    const [quietHours, setQuietHours] = useState({ start: null, end: null, tz: null });
    const [dailyCap, setDailyCap] = useState(0);
    const [loadingPrefs, setLoadingPrefs] = useState(true);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const toast = useCallback((type, message) => {
        try { addToast({ type, message }); } catch { /* toast host may be absent */ }
    }, [addToast]);

    // ---- initial state ----------------------------------------------------
    useEffect(() => {
        (async () => {
            const ok = isWebPushSupported();
            if (!mounted.current) return;
            setSupported(ok);
            setPermission(notificationPermission());
            if (ok) {
                const has = await hasLocalSubscription();
                if (mounted.current) setSubscribed(has);
            }
        })();
    }, []);

    // ---- per-type preferences ---------------------------------------------
    const loadPrefs = useCallback(async () => {
        try {
            const token = getAccessToken();
            const res = await fetch('/api/notifications/push-types', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) return;
            const json = await res.json();
            if (!mounted.current) return;
            setPrefs(json.prefs || {});
            setMuteAll(json.muteAll === true);
            if (json.quietHours) setQuietHours(json.quietHours);
            if (typeof json.dailyCap === 'number') setDailyCap(json.dailyCap);
        } catch { /* non-fatal */ } finally {
            if (mounted.current) setLoadingPrefs(false);
        }
    }, []);

    useEffect(() => { loadPrefs(); }, [loadPrefs]);

    // ---- master switch ----------------------------------------------------
    const handleMaster = async (next) => {
        if (busy) return;
        setBusy(true);
        const guard = setTimeout(() => {
            if (mounted.current) {
                setBusy(false);
                toast('error', 'That took too long. Check your connection and try again.');
            }
        }, STUCK_GUARD_MS);

        try {
            if (next) {
                const result = await enablePush();
                if (!mounted.current) return;
                if (result.ok) {
                    setSubscribed(true);
                    setPermission('granted');
                    toast('success', 'Notifications enabled on this device');
                } else {
                    setPermission(notificationPermission());
                    toast('error', result.error || 'Could not enable notifications');
                }
            } else {
                await disablePush();
                if (!mounted.current) return;
                setSubscribed(false);
                toast('info', 'Notifications turned off on this device');
            }
        } finally {
            clearTimeout(guard);
            if (mounted.current) setBusy(false);
        }
    };

    // ---- test push ---------------------------------------------------------
    const handleTest = async () => {
        if (testing) return;
        setTesting(true);
        try {
            const result = await sendTestPush();
            if (!mounted.current) return;
            if (result.ok) toast('success', `Test sent to ${result.sent} device${result.sent === 1 ? '' : 's'}`);
            else toast('error', result.error || 'Test push did not go through');
        } finally {
            if (mounted.current) setTesting(false);
        }
    };

    // ---- category toggle (optimistic, instant save) ------------------------
    const handleType = async (key, enabled) => {
        const previous = prefs;
        const next = { ...prefs };
        if (enabled) delete next[key]; else next[key] = false;
        setPrefs(next); // optimistic

        try {
            const token = getAccessToken();
            const res = await fetch('/api/notifications/push-types', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ key, enabled }),
            });
            if (!res.ok) throw new Error('save failed');
        } catch {
            if (mounted.current) {
                setPrefs(previous); // rollback
                toast('error', 'Could not save that setting');
            }
        }
    };

    const handleMuteAll = async (next) => {
        const previous = muteAll;
        setMuteAll(next);
        try {
            const token = getAccessToken();
            const res = await fetch('/api/notifications/push-types', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ mute_all: next }),
            });
            if (!res.ok) throw new Error('save failed');
        } catch {
            if (mounted.current) {
                setMuteAll(previous);
                toast('error', 'Could not save that setting');
            }
        }
    };

    // ---- render ------------------------------------------------------------
    const saveQuietHours = async (next) => {
        const previous = quietHours;
        setQuietHours(next);
        try {
            const res = await authFetch('/api/notifications/push-types', {
                method: 'PATCH',
                body: JSON.stringify({
                    quiet_hours_start: next.start,
                    quiet_hours_end: next.end,
                    // Always send the zone alongside the window, otherwise a
                    // window saved on a phone in Chicago would be evaluated in
                    // UTC and fire at the wrong time.
                    quiet_hours_tz: next.tz
                        || Intl.DateTimeFormat().resolvedOptions().timeZone
                        || 'UTC',
                }),
            });
            if (!res.ok) throw new Error('save failed');
            // Deliberately does NOT re-read the response into state: a PATCH
            // that only changed the timezone would echo start/end as undefined
            // and silently switch quiet hours back off. Optimistic state plus
            // rollback-on-error is correct here.
        } catch {
            if (mounted.current) { setQuietHours(previous); toast('error', 'Could not save quiet hours'); }
        }
    };

    const saveDailyCap = async (value) => {
        const previous = dailyCap;
        setDailyCap(value);
        try {
            const res = await authFetch('/api/notifications/push-types', {
                method: 'PATCH',
                body: JSON.stringify({ daily_push_cap: value }),
            });
            if (!res.ok) throw new Error('save failed');
        } catch {
            if (mounted.current) { setDailyCap(previous); toast('error', 'Could not save the daily limit'); }
        }
    };

    const hourLabel = (h) => {
        if (h === null || typeof h === 'undefined') return 'Off';
        const am = h < 12;
        const twelve = h % 12 === 0 ? 12 : h % 12;
        return `${twelve}:00 ${am ? 'AM' : 'PM'}`;
    };
    const quietOn = quietHours.start !== null && quietHours.end !== null;

    const blocked = permission === 'denied';
    const needsIosInstall = !supported && isIos() && !isIosStandalonePwa();

    const dotClass = blocked ? 'bg-red-500' : subscribed ? 'bg-teal-400' : 'bg-gray-500';
    const statusText = blocked
        ? 'Blocked in browser settings'
        : subscribed ? 'On for this device' : 'Off';

    return (
        <div className="rounded-xl border border-white/10 bg-[#111827] p-5 text-white">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h3 className="text-base font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-gray-400">{description}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
                        <span>{busy ? 'Working...' : statusText}</span>
                    </div>
                </div>
                {supported && !blocked && (
                    <Switch
                        checked={subscribed}
                        disabled={busy}
                        onChange={handleMaster}
                        label="Enable push notifications on this device"
                    />
                )}
            </div>

            {needsIosInstall && (
                <div className="mt-4 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
                    On iPhone and iPad, notifications only work once Smarter Poker is on your
                    Home Screen. Tap Share, then Add to Home Screen, then open it from there.
                </div>
            )}

            {!supported && !needsIosInstall && (
                <div className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-gray-400">
                    This browser does not support push notifications.
                </div>
            )}

            {blocked && (
                <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
                    Notifications are blocked for smarter.poker. Open your browser site settings,
                    switch Notifications to Allow, then reload this page.
                </div>
            )}

            {subscribed && (
                <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="mt-4 rounded-lg border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-sm font-medium text-teal-200 hover:bg-teal-500/20 disabled:opacity-50"
                >
                    {testing ? 'Sending...' : 'Send Test Notification'}
                </button>
            )}

            {showTypePrefs && (
                <div className="mt-6 border-t border-white/10 pt-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-semibold">Mute Everything</h4>
                            <p className="text-xs text-gray-400">Stops every push without unsubscribing this device.</p>
                        </div>
                        <Switch checked={muteAll} onChange={handleMuteAll} label="Mute all push notifications" />
                    </div>

                    {/* Quiet hours: a poker product pushes around the clock.
                        Without this, a seat alert at 4am is a reason to turn
                        notifications off entirely and never come back. */}
                    <div className="mt-6 border-t border-white/10 pt-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-semibold">Quiet Hours</h4>
                                <p className="text-xs text-gray-400">
                                    Hold non-urgent alerts overnight. Calls, open seats and tournament
                                    starts still come through.
                                </p>
                            </div>
                            <Switch
                                checked={quietOn}
                                onChange={(next) => saveQuietHours(next
                                    ? { start: 22, end: 8, tz: quietHours.tz }
                                    : { start: null, end: null, tz: quietHours.tz })}
                                label="Enable quiet hours"
                            />
                        </div>

                        {quietOn && (
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                <label className="text-xs text-gray-400">
                                    From
                                    <select
                                        value={quietHours.start ?? 22}
                                        onChange={(e) => saveQuietHours({ ...quietHours, start: Number(e.target.value) })}
                                        className="ml-2 rounded-md border border-white/10 bg-[#0B1120] px-2 py-1 text-sm text-white"
                                    >
                                        {Array.from({ length: 24 }, (_, h) => (
                                            <option key={h} value={h}>{hourLabel(h)}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="text-xs text-gray-400">
                                    Until
                                    <select
                                        value={quietHours.end ?? 8}
                                        onChange={(e) => saveQuietHours({ ...quietHours, end: Number(e.target.value) })}
                                        className="ml-2 rounded-md border border-white/10 bg-[#0B1120] px-2 py-1 text-sm text-white"
                                    >
                                        {Array.from({ length: 24 }, (_, h) => (
                                            <option key={h} value={h}>{hourLabel(h)}</option>
                                        ))}
                                    </select>
                                </label>
                                <span className="text-xs text-gray-500">
                                    {quietHours.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}
                                </span>
                            </div>
                        )}

                        <div className="mt-5 flex items-center justify-between gap-4">
                            <div>
                                <h4 className="text-sm font-semibold">Daily Limit</h4>
                                <p className="text-xs text-gray-400">
                                    Cap non-urgent pushes per day. Urgent alerts are never capped.
                                </p>
                            </div>
                            <select
                                value={dailyCap}
                                onChange={(e) => saveDailyCap(Number(e.target.value))}
                                className="rounded-md border border-white/10 bg-[#0B1120] px-2 py-1 text-sm text-white"
                            >
                                <option value={0}>No limit</option>
                                {[5, 10, 20, 50].map((n) => (
                                    <option key={n} value={n}>{n} per day</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <h4 className="mt-6 text-sm font-semibold">Alert Categories</h4>
                    <p className="mb-3 text-xs text-gray-400">
                        Everything is on unless you switch it off. Changes save instantly.
                    </p>

                    {loadingPrefs ? (
                        <p className="text-sm text-gray-500">Loading categories...</p>
                    ) : (
                        groupedPushTypes().map(({ group, types }) => (
                            <div key={group} className="mb-5">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group}</p>
                                <div className="space-y-2">
                                    {types.map((t) => {
                                        const on = prefs[t.key] !== false;
                                        return (
                                            <div key={t.key} className="flex items-center justify-between gap-4 rounded-lg bg-white/5 px-3 py-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm">{t.label}</p>
                                                    <p className="truncate text-xs text-gray-500">{t.desc}</p>
                                                </div>
                                                <Switch
                                                    checked={on}
                                                    disabled={muteAll}
                                                    onChange={(next) => handleType(t.key, next)}
                                                    label={t.label}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
