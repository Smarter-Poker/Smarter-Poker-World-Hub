import { cashoutUUID } from './cashoutReceipt.mjs';

// A terminal cashout can resolve once. Keep its operation identity after success
// as well as uncertainty/approval-pending, including dialog or page reopening.
export async function retainCashoutTerminalIntent(intent, { storage, locks, randomUUID, isCurrent,
  digest = bytes => globalThis.crypto.subtle.digest('SHA-256', bytes) }) {
  const { actorId, clubId, cashoutId, action, note } = intent;
  if (![actorId, clubId, cashoutId].every(cashoutUUID) || !['approve','cancel'].includes(action) ||
      typeof note !== 'string' || note.length > 500 || !isCurrent()) throw new Error('Cashout intent changed. Reopen it in the original account.');
  if (!storage || typeof locks?.request !== 'function' || typeof randomUUID !== 'function') {
    throw new Error('Durable cashout retry storage is unavailable.');
  }
  const normalizedNote = note.trim() || (action === 'approve' ? 'Approved' : 'Cancelled by agent');
  const tuple = JSON.stringify([actorId.toLowerCase(), clubId.toLowerCase(), cashoutId.toLowerCase(), action, normalizedNote]);
  const hashed = await digest(new TextEncoder().encode(tuple));
  const fingerprint = Array.from(new Uint8Array(hashed), byte => byte.toString(16).padStart(2, '0')).join('');
  if (!/^[0-9a-f]{64}$/.test(fingerprint) || !isCurrent()) throw new Error('Cashout intent changed before it could be retained.');
  const key = `cashout-terminal:v1:${fingerprint}`;
  return locks.request(key, { mode: 'exclusive' }, () => {
    if (!isCurrent()) throw new Error('Cashout intent changed before dispatch.');
    let saved = storage.getItem(key);
    if (saved !== null) {
      try { saved = JSON.parse(saved); } catch { throw new Error('Saved cashout operation could not be verified.'); }
      if (saved?.fingerprint !== fingerprint || !cashoutUUID(saved?.operationId)) throw new Error('Saved cashout operation could not be verified.');
      return saved.operationId.toLowerCase();
    }
    const operationId = randomUUID()?.toLowerCase();
    if (!cashoutUUID(operationId)) throw new Error('Cashout operation ID is unavailable.');
    const value = JSON.stringify({ fingerprint, operationId });
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error('Cashout operation could not be retained.');
    return operationId;
  });
}

// A monotonic fence catches A→B→A even if React never rendered account B.
export function createCashoutActorFence() {
  let actorId = null, generation = 0;
  return {
    update(next) { next = typeof next === 'string' ? next.toLowerCase() : null; if (next !== actorId) { actorId = next; generation += 1; } },
    capture(expected) {
      expected = typeof expected === 'string' ? expected.toLowerCase() : null;
      const epoch = generation;
      let valid = cashoutUUID(expected) && expected === actorId;
      return () => (valid = valid && actorId === expected && generation === epoch);
    },
  };
}
