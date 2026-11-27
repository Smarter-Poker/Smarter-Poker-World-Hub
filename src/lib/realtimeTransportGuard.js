/**
 * Authoritative Supabase Realtime WebSocket Transport & Lifecycle Guard.
 *
 * Root cause (2026-11-26 / 2026-11-27, DailyDigest.client_crash alert 449588):
 * `@supabase/realtime-js` / `@supabase/phoenix` invokes `new WebSocket(url)`
 * synchronously inside `channel.subscribe()` -> `realtime.connect()` ->
 * `socketAdapter.connect()`. In restricted/sandboxed browsers (Chrome 148-150
 * environments where `new WebSocket(...)` throws `Failed to construct 'WebSocket':
 * the provided URL is invalid.`, `SecurityError`, or when `WebSocket` is absent),
 * `RealtimeClient.connect()` rethrows `Error("WebSocket not available: ...")`
 * synchronously out of React `useEffect`, hitting the root ErrorBoundary and
 * crashing public pages (`/hub/venues/[id]`, `/hub/commander/leagues`,
 * `/hub/reels`, `/hub/promotions`, and any other `.channel().subscribe()` page).
 *
 * Hardening layers (defense-in-depth):
 *   1. Transport layer (`createResilientWebSocketTransport`): returns the exact
 *      native `WebSocket` untouched on healthy browsers; on synchronous
 *      constructor refusal or missing `WebSocket`, logs once, notifies the
 *      client guard, and returns a spec-shaped closed `RefusedWebSocket` facade
 *      so `@supabase/phoenix` transitions cleanly without throwing.
 *   2. Client & channel layer (`hardenSupabaseRealtime`): wraps
 *      `realtime.connect()`, `channel().subscribe()`, `channel.unsubscribe()`,
 *      and `removeChannel()` so no synchronous throw or unmount error can ever
 *      escape into React, and stops pointless reconnect storms after a
 *      deterministic constructor refusal.
 */

const HARDENED_CLIENT = Symbol.for('smarterPoker.supabaseRealtimeHardened');
const HARDENED_CHANNEL = Symbol.for('smarterPoker.supabaseChannelHardened');

function toError(err, fallback = 'WebSocket unavailable') {
    if (err instanceof Error) return err;
    const msg = typeof err === 'string' && err.trim() ? err : fallback;
    return new Error(msg);
}

/**
 * Minimal closed WebSocket facade returned ONLY when native `new WebSocket(...)`
 * is absent or throws synchronously. Matches the exact properties/callbacks
 * `@supabase/phoenix` (`transportConnect`) and `RealtimeAdmission` touch.
 */
export class RefusedWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url, error) {
        this.CONNECTING = 0;
        this.OPEN = 1;
        this.CLOSING = 2;
        this.CLOSED = 3;
        this.readyState = 3; // CLOSED
        this.url = String(url ?? '');
        this.protocol = '';
        this.extensions = '';
        this.bufferedAmount = 0;
        this.binaryType = 'blob';
        this.timeout = 0;
        this.onopen = null;
        this.onerror = null;
        this.onmessage = null;
        this.onclose = null;
        this._listeners = new Map();
        this._error = toError(error, 'WebSocket unavailable');

        // Dispatch error + close asynchronously so `transportConnect()` finishes
        // wiring `.onerror` / `.onclose` (and any `addEventListener` callers) first.
        queueMicrotask(() => {
            const errEvent = {
                type: 'error',
                message: this._error.message,
                error: this._error,
                target: this,
            };
            this._emit('error', errEvent);

            const closeEvent = {
                type: 'close',
                code: 1000,
                reason: 'WebSocket unavailable',
                wasClean: true,
                target: this,
            };
            this._emit('close', closeEvent);
        });
    }

    addEventListener(type, listener) {
        if (typeof listener !== 'function') return;
        let set = this._listeners.get(type);
        if (!set) {
            set = new Set();
            this._listeners.set(type, set);
        }
        set.add(listener);
    }

    removeEventListener(type, listener) {
        this._listeners.get(type)?.delete(listener);
    }

    dispatchEvent(event) {
        if (!event || !event.type) return false;
        this._emit(event.type, event);
        return true;
    }

    _emit(type, event) {
        const prop = this[`on${type}`];
        if (typeof prop === 'function') {
            try {
                prop.call(this, event);
            } catch {
                // Never propagate handler errors from degraded transport notifications.
            }
        }
        const listeners = this._listeners.get(type);
        if (listeners) {
            for (const fn of [...listeners]) {
                try {
                    fn.call(this, event);
                } catch {
                    // Never propagate listener errors from degraded transport notifications.
                }
            }
        }
    }

    send() {
        // No-op on a refused socket.
    }

    close() {
        // Already CLOSED.
    }
}

function createWarnOnce(warnFn) {
    const seen = new Set();
    const log = typeof warnFn === 'function' ? warnFn : (...args) => console.warn(...args);
    return (err) => {
        const e = toError(err);
        const key = e.message || 'WebSocket unavailable';
        if (seen.has(key)) return;
        seen.add(key);
        try {
            log('[Realtime] WebSocket unavailable; degrading live updates cleanly:', key);
        } catch {
            // Ignore console errors in restricted runtimes.
        }
    };
}

/**
 * Returns a `WebSocket`-compatible transport constructor for Supabase Realtime.
 * Healthy browsers receive the exact native `WebSocket` instance untouched.
 * Browsers where `WebSocket` is absent or throws synchronously receive a closed
 * `RefusedWebSocket` facade instead of crashing the calling React effect.
 */
export function createResilientWebSocketTransport({ NativeSocket, onRefused, warn, _warnOnce } = {}) {
    const warnOnce = _warnOnce || createWarnOnce(warn);

    function ResilientWebSocket(url, protocols) {
        const Socket = NativeSocket ?? (typeof globalThis !== 'undefined' ? globalThis.WebSocket : undefined);
        if (typeof Socket === 'function') {
            try {
                return protocols === undefined ? new Socket(url) : new Socket(url, protocols);
            } catch (err) {
                const error = toError(err);
                warnOnce(error);
                if (typeof onRefused === 'function') {
                    try {
                        onRefused(error);
                    } catch {
                        // Ignore observer errors.
                    }
                }
                return new RefusedWebSocket(url, error);
            }
        }

        const missingErr = new Error('WebSocket constructor is not available in this runtime');
        warnOnce(missingErr);
        if (typeof onRefused === 'function') {
            try {
                onRefused(missingErr);
            } catch {
                // Ignore observer errors.
            }
        }
        return new RefusedWebSocket(url, missingErr);
    }

    ResilientWebSocket.CONNECTING = 0;
    ResilientWebSocket.OPEN = 1;
    ResilientWebSocket.CLOSING = 2;
    ResilientWebSocket.CLOSED = 3;

    return ResilientWebSocket;
}

function stopReconnectTimers(realtime) {
    if (!realtime || typeof realtime !== 'object') return;
    try {
        realtime.reconnectTimer?.reset?.();
    } catch {
        // Best-effort timer reset.
    }
    try {
        realtime.socketAdapter?.socket?.reconnectTimer?.reset?.();
    } catch {
        // Best-effort nested PhoenixSocket timer reset.
    }
    try {
        if (Array.isArray(realtime.channels)) {
            for (const ch of realtime.channels) {
                ch?.rejoinTimer?.reset?.();
                ch?.channel?.rejoinTimer?.reset?.();
            }
        }
    } catch {
        // Best-effort channel rejoin timer reset.
    }
}

/**
 * Idempotently hardens a Supabase client instance so synchronous Realtime
 * connection/subscription failures degrade cleanly instead of crashing React.
 */
export function hardenSupabaseRealtime(client, { onRefused, warn, _warnOnce } = {}) {
    if (!client || typeof client !== 'object') return client;
    if (client[HARDENED_CLIENT]) return client;

    const warnOnce = _warnOnce || createWarnOnce(warn);
    let degradedError = null;

    const markDegraded = (err) => {
        const error = toError(err);
        degradedError = error;
        warnOnce(error);
        stopReconnectTimers(client.realtime);
        if (typeof onRefused === 'function') {
            try {
                onRefused(error);
            } catch {
                // Ignore observer errors.
            }
        }
        // Schedule a post-microtask timer reset too, because RefusedWebSocket's
        // async `onclose` runs in a microtask and PhoenixSocket's `onConnClose`
        // may arm `reconnectTimer` right then.
        queueMicrotask(() => {
            queueMicrotask(() => {
                stopReconnectTimers(client.realtime);
            });
        });
    };

    const realtime = client.realtime;
    if (realtime && typeof realtime.connect === 'function') {
        const origConnect = realtime.connect.bind(realtime);
        realtime.connect = function guardedConnect(...args) {
            if (degradedError) {
                stopReconnectTimers(realtime);
                return;
            }
            try {
                return origConnect(...args);
            } catch (err) {
                markDegraded(err);
                return;
            }
        };
    }

    if (typeof client.channel === 'function') {
        const origChannel = client.channel.bind(client);
        client.channel = function guardedChannel(...args) {
            const ch = origChannel(...args);
            if (!ch || typeof ch !== 'object' || ch[HARDENED_CHANNEL]) return ch;

            if (typeof ch.subscribe === 'function') {
                const origSubscribe = ch.subscribe.bind(ch);
                ch.subscribe = function guardedSubscribe(callback, timeout) {
                    if (degradedError) {
                        if (typeof callback === 'function') {
                            const err = degradedError;
                            queueMicrotask(() => {
                                try {
                                    callback('CHANNEL_ERROR', err);
                                } catch {
                                    // Never throw out of degraded callback notification.
                                }
                            });
                        }
                        return ch;
                    }
                    try {
                        return origSubscribe(callback, timeout);
                    } catch (err) {
                        const error = toError(err);
                        markDegraded(error);
                        if (typeof callback === 'function') {
                            queueMicrotask(() => {
                                try {
                                    callback('CHANNEL_ERROR', error);
                                } catch {
                                    // Never throw out of degraded callback notification.
                                }
                            });
                        }
                        return ch;
                    }
                };
            }

            if (typeof ch.unsubscribe === 'function') {
                const origUnsubscribe = ch.unsubscribe.bind(ch);
                ch.unsubscribe = function guardedUnsubscribe(...unsubArgs) {
                    try {
                        const res = origUnsubscribe(...unsubArgs);
                        if (res && typeof res.catch === 'function') {
                            return res.catch(() => 'ok');
                        }
                        return res;
                    } catch {
                        return Promise.resolve('ok');
                    }
                };
            }

            Object.defineProperty(ch, HARDENED_CHANNEL, { value: true, enumerable: false });
            return ch;
        };
    }

    if (typeof client.removeChannel === 'function') {
        const origRemoveChannel = client.removeChannel.bind(client);
        client.removeChannel = function guardedRemoveChannel(channel) {
            if (!channel) return Promise.resolve('ok');
            try {
                const res = origRemoveChannel(channel);
                if (res && typeof res.catch === 'function') {
                    return res.catch(() => 'ok');
                }
                return res;
            } catch {
                return Promise.resolve('ok');
            }
        };
    }

    Object.defineProperty(client, HARDENED_CLIENT, {
        value: { markDegraded, getDegradedError: () => degradedError },
        enumerable: false,
    });
    return client;
}

/**
 * Factory wrapper for browser Supabase clients: trims URL/key, wires the
 * resilient WebSocket transport, and hardens `realtime.connect`, `channel().subscribe()`,
 * and `removeChannel()` against synchronous WebSocket refusals.
 */
export function createHardenedSupabaseClient(createClientFn, url, key, options = {}, guardOpts = {}) {
    const safeUrl = String(url || '').trim();
    const safeKey = String(key || '').trim();
    const warnOnce = createWarnOnce(guardOpts.warn);
    let clientRef = null;

    const existingTransport = options?.realtime?.transport;
    const transport = createResilientWebSocketTransport({
        NativeSocket: guardOpts.NativeSocket ?? existingTransport,
        warn: guardOpts.warn,
        _warnOnce: warnOnce,
        onRefused: (err) => {
            clientRef?.[HARDENED_CLIENT]?.markDegraded?.(err);
            if (typeof guardOpts.onRefused === 'function') {
                try {
                    guardOpts.onRefused(err);
                } catch {
                    // Ignore observer errors.
                }
            }
        },
    });

    const mergedOptions = {
        ...options,
        realtime: {
            ...(options?.realtime || {}),
            transport,
        },
    };

    clientRef = createClientFn(safeUrl, safeKey, mergedOptions);
    return hardenSupabaseRealtime(clientRef, { warn: guardOpts.warn, _warnOnce: warnOnce });
}
