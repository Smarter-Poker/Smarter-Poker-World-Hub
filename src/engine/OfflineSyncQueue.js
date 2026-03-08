/**
 * Offline Sync Queue — PWA Resilience Engine
 * ===================================================
 * Intercepts dropped/offline payloads (e.g., training progress saves)
 * and stores them securely in IndexedDB. Automatically drains the queue
 * upon detecting a 'window.ononline' event to sync with Supabase.
 */

const DB_NAME = 'SmarterPokerOfflineDB';
const STORE_NAME = 'mutation_queue';
const DB_VERSION = 1;

// Initialize IndexedDB
const initDB = () => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') return resolve(null); // SSR safety
        if (!window.indexedDB) {
            console.warn('[OfflineQueue] IndexedDB not supported.');
            return resolve(null);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('[OfflineQueue] DB Error:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('endpoint', 'endpoint', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
};

/**
 * Enqueue a failed mutation payload for later sync.
 * @param {string} endpoint - The API endpoint to hit on sync (e.g., '/api/training/save-progress')
 * @param {object} payload - The exact JSON payload to POST
 * @param {object} headers - Any required auth headers
 */
export const enqueueMutation = async (endpoint, payload, headers = {}) => {
    try {
        const db = await initDB();
        if (!db) return false;

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const mutation = {
            endpoint,
            payload,
            headers,
            timestamp: Date.now(),
            attempts: 0
        };

        await new Promise((resolve, reject) => {
            const req = store.add(mutation);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });

        console.log(`[OfflineQueue] Mutation queued for ${endpoint}`);
        return true;
    } catch (e) {
        console.error('[OfflineQueue] Failed to enqueue mutation:', e);
        return false;
    }
};

/**
 * Reads all pending mutations and attempts to POST them to the cloud.
 */
export const triggerBackgroundSync = async () => {
    if (typeof window === 'undefined' || !navigator.onLine) return;

    try {
        const db = await initDB();
        if (!db) return;

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const mutations = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });

        if (mutations.length === 0) return;
        console.log(`[OfflineQueue] Draining ${mutations.length} pending mutations...`);

        for (const item of mutations) {
            try {
                // Attempt to send
                const res = await fetch(item.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...item.headers },
                    body: JSON.stringify(item.payload)
                });

                if (res.ok) {
                    // Success -> delete from IndexedDB
                    await new Promise((resolve) => {
                        const delTx = db.transaction([STORE_NAME], 'readwrite');
                        delTx.objectStore(STORE_NAME).delete(item.id).onsuccess = resolve;
                    });
                    console.log(`[OfflineQueue] ✓ Synced mutation ID:${item.id}`);
                } else {
                    // Retry logic: increment attempts, eventually drop if dead
                    if (item.attempts >= 5) {
                        await new Promise((resolve) => {
                            const delTx = db.transaction([STORE_NAME], 'readwrite');
                            delTx.objectStore(STORE_NAME).delete(item.id).onsuccess = resolve;
                        });
                        console.error(`[OfflineQueue] ✗ Dropped mutation ID:${item.id} after 5 failed attempts.`);
                    } else {
                        item.attempts += 1;
                        await new Promise((resolve) => {
                            const putTx = db.transaction([STORE_NAME], 'readwrite');
                            putTx.objectStore(STORE_NAME).put(item).onsuccess = resolve;
                        });
                    }
                }
            } catch (networkErr) {
                // Still offline or CORS failure — skip and leave in DB for next pass
                break;
            }
        }
    } catch (e) {
        console.error('[OfflineQueue] Sync failure:', e);
    }
};

// ─── Auto-Bootstrapper ───
if (typeof window !== 'undefined') {
    // Attempt sync immediately on load just in case
    setTimeout(triggerBackgroundSync, 5000); // Wait 5s for React boot

    // Auto-fire whenever browser re-establishes connection
    window.addEventListener('online', () => {
        console.log('[OfflineQueue] Connection restored. Triggering sync...');
        triggerBackgroundSync();
    });
}
