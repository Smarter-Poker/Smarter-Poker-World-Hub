/**
 * indexeddb-pwa.js (W7-4)
 * PWA Offline Storage utility to persist the sessionLog and saved hands into
 * the browser's IndexedDB, preventing AbortErrors and allowing offline sandbox usage.
 */
import { openDB } from 'idb';

const DB_NAME = 'smarter-poker-sandbox';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_HANDS = 'saved_hands';

export async function initSandboxDB() {
    if (typeof window === 'undefined') return null;
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
                db.createObjectStore(STORE_SESSIONS, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORE_HANDS)) {
                db.createObjectStore(STORE_HANDS, { keyPath: 'id' });
            }
        },
    });
}

// -- SESSIONS (W3 local cache target) --
export async function idbSaveSessionLog(logArray) {
    try {
        const db = await initSandboxDB();
        if (!db) return;
        const tx = db.transaction(STORE_SESSIONS, 'readwrite');
        await tx.store.clear(); // Replace full log for simplicitiy
        for (const entry of logArray) {
            await tx.store.add({ ...entry, id: entry.id || Date.now() + Math.random() });
        }
        await tx.done;
    } catch (e) { console.warn('IDB Save Failed:', e); }
}

export async function idbLoadSessionLog() {
    try {
        const db = await initSandboxDB();
        if (!db) return [];
        return await db.getAll(STORE_SESSIONS);
    } catch (e) {
        console.warn('IDB Load Failed:', e);
        return [];
    }
}

// -- SAVED HANDS (W6-1 offline mirror) --
export async function idbSyncSavedHands(handsArray) {
    try {
        const db = await initSandboxDB();
        if (!db) return;
        const tx = db.transaction(STORE_HANDS, 'readwrite');
        await tx.store.clear();
        for (const hand of handsArray) {
            await tx.store.put(hand);
        }
        await tx.done;
    } catch (e) { console.warn('IDB Sync Failed:', e); }
}

export async function idbGetSavedHands() {
    try {
        const db = await initSandboxDB();
        if (!db) return [];
        return await db.getAll(STORE_HANDS);
    } catch (e) {
        console.warn('IDB Get Failed:', e);
        return [];
    }
}
