/**
 * BROADCAST SYNC UTILITY
 * Centralized helper for cross-tab BroadcastChannel communication.
 * Eliminates fire-and-forget channel leaks by ensuring .close() is always called.
 *
 * Usage:
 *   import { broadcastSync } from '../../src/lib/broadcastSync';
 *   broadcastSync('smarter_poker_friends_sync', 'refresh');
 *   broadcastSync('smarter_poker_social_sync', { type: 'refresh_feed', ts: Date.now() });
 */

/**
 * Fire a one-shot BroadcastChannel message and immediately close.
 * Safe for SSG/SSR — silently no-ops if BroadcastChannel is unavailable.
 *
 * @param {string} channelName - The channel name to broadcast on
 * @param {*} message - The message payload (string, object, etc.)
 */
export function broadcastSync(channelName, message = 'refresh') {
    try {
        const bc = new BroadcastChannel(channelName);
        bc.postMessage(message);
        bc.close();
    } catch {
        // BroadcastChannel not supported (SSR, old browsers) — silent no-op
    }
}

/**
 * Create a persistent BroadcastChannel listener.
 * Returns a cleanup function to close the channel.
 * Use in useEffect return paths.
 *
 * @param {string} channelName - The channel name to listen on
 * @param {Function} handler - Callback invoked with the event data
 * @returns {Function} cleanup function that closes the channel
 */
export function listenBroadcast(channelName, handler) {
    let bc = null;
    try {
        bc = new BroadcastChannel(channelName);
        bc.onmessage = (event) => handler(event.data, event);
    } catch {
        // BroadcastChannel not supported — silent no-op
    }
    return () => {
        try { bc?.close(); } catch { /* noop */ }
    };
}
