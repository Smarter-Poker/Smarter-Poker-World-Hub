/**
 * Offline Mutation Queue
 * ═══════════════════════════════════════════════════════
 * Catches failed mutations (likes, comments, profile saves)
 * when the user is offline. Stores them in localStorage,
 * then replays automatically when connectivity returns.
 *
 * Usage:
 *   import { queueMutation } from './offlineQueue';
 *   try { await supabase.from('posts').insert(data); }
 *   catch { queueMutation('insert', 'posts', data); }
 */

const QUEUE_KEY = 'sp-offline-queue';

/** Read the current queue from localStorage */
function getQueue() {
    try {
        return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch { return []; }
}

/** Save the queue to localStorage */
function saveQueue(queue) {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch { /* quota exceeded */ }
}

/**
 * Queue a failed mutation for later replay.
 * @param {'insert'|'update'|'delete'} action - The Supabase action type
 * @param {string} table - The table name
 * @param {object} payload - The data to send
 */
export function queueMutation(action, table, payload) {
    if (typeof window === 'undefined') return;
    const queue = getQueue();
    queue.push({
        action,
        table,
        payload,
        queuedAt: Date.now(),
    });
    saveQueue(queue);
}

/**
 * Replay all queued mutations. Called automatically when
 * the browser fires the 'online' event.
 */
async function replayQueue() {
    if (typeof window === 'undefined') return;
    const queue = getQueue();
    if (queue.length === 0) return;

    // Dynamic import to avoid circular dependency
    const { supabase } = await import('./supabase');
    const succeeded = [];

    for (let i = 0; i < queue.length; i++) {
        const { action, table, payload } = queue[i];
        try {
            if (action === 'insert') {
                await supabase.from(table).insert(payload);
            } else if (action === 'update') {
                const { id, ...rest } = payload;
                await supabase.from(table).update(rest).eq('id', id);
            } else if (action === 'delete') {
                await supabase.from(table).delete().eq('id', payload.id);
            }
            succeeded.push(i);
        } catch {
            // Leave failed items in queue for next attempt
        }
    }

    // Remove succeeded items
    if (succeeded.length > 0) {
        const remaining = queue.filter((_, idx) => !succeeded.includes(idx));
        saveQueue(remaining);
    }
}

// ── Auto-wire: replay when connectivity returns ──
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        // Small delay to let the connection stabilize
        setTimeout(replayQueue, 2000);
    });
}
