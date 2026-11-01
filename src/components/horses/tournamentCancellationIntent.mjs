const DB_NAME = 'stable-tournament-cancellation-intents';
const STORE = 'requests';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = ['action', 'tournamentId', 'opId', 'reason'];
const same = (a, b) => fields.every(field => a?.[field] === b?.[field]);
function validate(request, key) {
  if (!request || request.action !== 'cancel_refund' || !UUID.test(request.opId || '') ||
      !UUID.test(request.tournamentId || '') || !key.endsWith(`:${request.tournamentId}`) ||
      typeof request.reason !== 'string' || request.reason.trim().length < 10 || request.reason.length > 500) {
    throw new Error('Saved Cancellation Operation Could Not Be Verified. Its Contents Are Preserved.');
  }
}
function openDatabase(boundary) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Durable Cancellation Storage Is Unavailable. No Request Was Sent.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    let refused = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onblocked = () => { refused = true; reject(new Error('Durable Cancellation Storage Is Blocked. No Request Was Sent.')); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (refused || boundary.expired) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
// IndexedDB read/compare/write and completion are the cross-renderer authority.
// Legacy localStorage is imported once, never erased or overwritten by this path.
async function runCancellationIntent(key, mode, request, isCurrent, boundary) {
  if (boundary.expired || !isCurrent()) throw new Error('The Account Or View Changed. Read The Original Operation.');
  if (mode !== 'read') validate(request, key);
  const db = await openDatabase(boundary);
  boundary.db = db;
  if (boundary.expired) { db.close(); throw new Error('Cancellation Storage Outcome Is Unknown. Read The Original Operation.'); }
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      boundary.tx = tx;
      const store = tx.objectStore(STORE);
      let result, failure;
      const refuse = error => { failure = error; tx.abort(); };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('Cancellation Storage Did Not Commit. No Request Was Sent.'));
      tx.onerror = () => { /* onabort owns the authoritative outcome. */ };
      const current = store.get(key);
      current.onsuccess = () => {
        try {
          if (boundary.expired || !isCurrent()) throw new Error('The Account Or View Changed. Read The Original Operation.');
          const legacy = localStorage.getItem(key);
          let row = current.result;
          if (!row) {
            const prior = legacy === null ? null : JSON.parse(legacy);
            if (legacy !== null) validate(prior, key);
            row = { request: prior, state: prior ? 'pending' : 'resolved', legacy };
            store.put(row, key);
          } else {
            if (!['pending', 'resolved'].includes(row.state) || (row.state === 'pending' && !row.request)) throw new Error('Saved Cancellation State Could Not Be Verified.');
            if (row.request) validate(row.request, key);
            if (legacy !== row.legacy) throw new Error('Another Legacy Cancellation Request Is Retained. Its Contents Are Preserved.');
          }
          if (mode === 'read') { result = row.state === 'pending' ? row.request : null; return; }
          const tombstone = store.get(`${key}:resolved:${request.opId}`);
          tombstone.onsuccess = () => {
            try {
              if (boundary.expired || !isCurrent()) throw new Error('The Account Or View Changed. Read The Original Operation.');
              if (mode === 'retain') {
                if (tombstone.result) throw new Error('This Cancellation Operation Is Already Resolved. Read Its Original Outcome.');
                if (row.state === 'pending' && !same(row.request, request)) throw new Error('Another Cancellation Request Is Retained. Reload To Read Its Outcome.');
                store.put({ ...row, request, state: 'pending' }, key);
                result = request;
              } else if (mode === 'resolve') {
                if (!same(row.request, request)) throw new Error('Another Cancellation Request Is Retained. Reload To Read Its Outcome.');
                if (tombstone.result && !same(tombstone.result, request)) throw new Error('Cancellation Receipt Identity Changed. Keep The Original Operation.');
                store.put(request, `${key}:resolved:${request.opId}`);
                store.put({ ...row, state: 'resolved' }, key);
                result = null;
              } else throw new Error('Cancellation Storage Action Is Unavailable.');
            } catch (error) { refuse(error); }
          };
        } catch (error) { refuse(error); }
      };
    });
  } finally { db.close(); }
}

// Use the existing operator console's 30-second whole-request boundary.
// Expiry never dispatches or clears intent; an already committed row stays recoverable.
export async function cancellationIntent(key, mode, request, isCurrent) {
  const boundary = { expired: false, tx: null, db: null };
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      boundary.expired = true;
      try { boundary.tx?.abort(); } catch { /* A committed transaction remains recoverable. */ }
      reject(new Error('Cancellation Storage Outcome Is Unknown. Read The Original Operation Before Retrying.'));
    }, 30000);
  });
  try {
    return await Promise.race([runCancellationIntent(key, mode, request, isCurrent, boundary), deadline]);
  } finally {
    clearTimeout(timer);
    boundary.db?.close();
  }
}
