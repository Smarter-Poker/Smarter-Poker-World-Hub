/*
 * CALL SIGNALLING - ONE LISTENER, NEVER TORN DOWN BY A SEND (2026-10-31).
 *
 * Every signed-in tab listens on `call-signal:<own user id>`. Signals to
 * someone else are broadcast on `call-signal:<their id>`.
 *
 * The bug this replaces: the Supabase client returns the EXISTING channel when
 * asked for a topic it already has, and removes channels by topic. Messenger's
 * hang-up "notified" both `call-signal:<them>` and `call-signal:<me>`, then
 * removed both a second later - which removed this tab's own incoming-call
 * listener. After the first call ended, nobody could reach that user again
 * until they reloaded the page.
 *
 * Rules enforced here:
 *   - the own-topic channel is created once per user and only removed when the
 *     user signs out or changes;
 *   - a send never creates, borrows or removes the own-topic channel (a signal
 *     meant for the user's other devices goes out on the live listener);
 *   - sends to the same topic are serialised so two quick signals never share
 *     and then double-remove one temporary channel.
 */

const listeners = new Set();
let active = { client: null, userId: null, channel: null, ready: null };
const topicQueues = new Map();

function topicFor(userId) {
    return `call-signal:${userId}`;
}

function dispatch(event, payload) {
    for (const listener of [...listeners]) {
        try { listener(event, payload || {}); } catch (error) { console.warn('[callSignal] listener failed:', error?.message || error); }
    }
}

const EVENTS = ['incoming_call', 'call_ringing', 'call_accepted', 'call_declined', 'call_ended', 'call_handled'];

export function startCallSignal(client, userId) {
    if (!client || !userId) return null;
    if (active.client === client && active.userId === userId && active.channel) return active.ready;
    stopCallSignal();
    let channel = client.channel(topicFor(userId));
    for (const event of EVENTS) channel = channel.on('broadcast', { event }, message => dispatch(event, message?.payload));
    let joinedBefore = false;
    const ready = new Promise(resolve => {
        channel.subscribe(status => {
            if (status === 'SUBSCRIBED') {
                // A second SUBSCRIBED is a rejoin after the socket dropped (a
                // phone backgrounded, a network change). Anything broadcast in
                // between is gone, so listeners re-check for a ringing call.
                if (joinedBefore) dispatch('resubscribed', {});
                joinedBefore = true;
                resolve(true);
            }
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('[callSignal] listener status:', status);
                resolve(false);
            }
        });
    });
    active = { client, userId, channel, ready };
    return ready;
}

export function stopCallSignal() {
    const { client, channel } = active;
    active = { client: null, userId: null, channel: null, ready: null };
    if (client && channel) {
        try { client.removeChannel(channel); } catch (error) { console.warn('[callSignal] stop failed:', error?.message || error); }
    }
}

export function onCallSignal(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function callSignalUserId() {
    return active.userId;
}

async function sendOnce(client, topic, event, payload) {
    const realtimeTopic = `realtime:${topic}`;
    const existed = typeof client.getChannels === 'function'
        && client.getChannels().some(channel => channel.topic === realtimeTopic);
    const channel = client.channel(topic);
    try {
        if (!existed) {
            await new Promise(resolve => {
                const timer = setTimeout(resolve, 4000);
                channel.subscribe(status => {
                    if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        clearTimeout(timer);
                        resolve();
                    }
                });
            });
        }
        // send() delivers over the socket when joined and falls back to the
        // REST broadcast endpoint when it is not, so a slow join still sends.
        const result = await channel.send({ type: 'broadcast', event, payload });
        return result === 'ok';
    } finally {
        if (!existed) setTimeout(() => { try { client.removeChannel(channel); } catch { /* already gone */ } }, 1500);
    }
}

/**
 * Send a call signal to another user. Resolves true when Realtime accepted it.
 * Never throws.
 */
export function sendCallSignal(client, toUserId, event, payload = {}) {
    if (!client || !toUserId || !EVENTS.includes(event)) return Promise.resolve(false);
    const body = { ...payload, sentAt: Date.now() };
    if (toUserId === active.userId) return sendToOwnDevices(event, body);
    const topic = topicFor(toUserId);
    const previous = topicQueues.get(topic) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => sendOnce(client, topic, event, body)).catch(error => {
        console.warn('[callSignal] send failed:', error?.message || error);
        return false;
    });
    topicQueues.set(topic, next);
    next.finally(() => { if (topicQueues.get(topic) === next) topicQueues.delete(topic); });
    return next;
}

/**
 * Tell this user's OTHER tabs and devices something (for example "answered on
 * my phone, stop ringing"). Goes out on the live listener; broadcast `self` is
 * off, so this tab does not hear itself.
 */
export async function sendToOwnDevices(event, payload = {}) {
    const { channel } = active;
    if (!channel || !EVENTS.includes(event)) return false;
    try {
        const result = await channel.send({ type: 'broadcast', event, payload: { ...payload, sentAt: payload.sentAt || Date.now() } });
        return result === 'ok';
    } catch (error) {
        console.warn('[callSignal] own-device send failed:', error?.message || error);
        return false;
    }
}

/**
 * Last-chance signal while the page is closing. A websocket send cannot finish
 * during unload, so this posts to Realtime's REST broadcast endpoint with
 * keepalive. Best effort only.
 */
export function beaconCallSignal({ url, apiKey, accessToken }, toUserId, event, payload = {}) {
    if (!url || !apiKey || !toUserId || !EVENTS.includes(event) || typeof fetch !== 'function') return;
    try {
        fetch(`${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
            method: 'POST',
            keepalive: true,
            headers: {
                'Content-Type': 'application/json',
                apikey: apiKey,
                Authorization: `Bearer ${accessToken || apiKey}`,
            },
            body: JSON.stringify({ messages: [{ topic: topicFor(toUserId), event, payload: { ...payload, sentAt: Date.now() }, private: false }] }),
        }).catch(() => {});
    } catch { /* the page is closing */ }
}
