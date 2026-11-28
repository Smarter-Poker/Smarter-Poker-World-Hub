// Saving many ledger rows at once (Import Sessions, 2026-11-28).
//
// bankroll_ledger.external_ref is unique per player. A batch insert is one
// statement, so one row whose external_ref is already saved refuses the whole
// batch with 23505. That batch is retried row by row: rows already there are
// counted as already imported (never saved twice), the rest are saved. Any
// other failure stops the run and says how far it got.

/** A unique violation on bankroll_ledger.external_ref: that row was already saved. */
export function isExternalRefConflict(error) {
  return error?.code === '23505' && /external_ref/.test(String(error?.message || '') + ' ' + String(error?.details || ''));
}

/**
 * `insert(rows)` resolves to { data, error } with one returned row per row
 * sent. Resolves { saved, alreadyImported }; a failure throws an error that
 * carries `saved` and `alreadyImported` so far.
 */
export async function insertInBatches(entries, insert, { batchSize = 100, onProgress } = {}) {
  const saved = [];
  let alreadyImported = 0;
  try {
    for (let from = 0; from < entries.length; from += batchSize) {
      const batch = entries.slice(from, from + batchSize);
      const { data, error } = await insert(batch);
      if (error && isExternalRefConflict(error)) {
        for (const entry of batch) {
          const one = await insert([entry]);
          if (one.error && isExternalRefConflict(one.error)) { alreadyImported++; continue; }
          if (one.error) throw one.error;
          if (!one.data || one.data.length !== 1) throw new Error('Some Rows Were Not Saved');
          saved.push(...one.data);
        }
      } else {
        if (error) throw error;
        if (!data || data.length !== batch.length) throw new Error('Some Rows Were Not Saved');
        saved.push(...data);
      }
      if (onProgress) onProgress(saved.length + alreadyImported, entries.length);
    }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error?.message || error));
    failure.saved = saved;
    failure.alreadyImported = alreadyImported;
    throw failure;
  }
  return { saved, alreadyImported };
}
