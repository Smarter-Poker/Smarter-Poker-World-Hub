/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MESSENGER PREFERENCE SYNC — bookmarks, labels, conversation themes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DEAD-WIRING FIX 2026-08-15.
 *
 * Both messengers (SmarterPokerMessenger and ClubArenaMessenger) carried a
 * near-identical `syncToSupabase` that UPSERTED bookmarks, labels and themes
 * and nothing else. Specifically:
 *
 *   * Nothing ever READ those tables back. Preferences lived in localStorage,
 *     so they looked like they persisted — until the user opened the messenger
 *     on a second device or cleared site data, at which point every bookmark,
 *     label and theme was gone. The rows were being written into a black hole.
 *
 *   * Nothing ever DELETED. Un-bookmarking a message or clearing a label only
 *     changed local state; the row stayed on the server. The moment a read-back
 *     existed, every previously-removed bookmark would have come straight back.
 *
 *   * Every failure was swallowed by a console.warn, which is why none of this
 *     was visible. All three tables were EMPTY platform-wide.
 *
 * The RLS behind them was also write-once (see the
 * messenger_prefs_rls_allow_update_delete_and_stop_cross_user_reads migration):
 * labels and themes had only INSERT + SELECT policies, so CHANGING a theme
 * raised "new row violates row-level security policy" and removing one deleted
 * zero rows without erroring.
 *
 * One module, used by both messengers, so the two copies cannot drift again.
 */

import { selectInBatches } from './inBatches.mjs';

/**
 * Resolve the signed-in user id without touching supabase.auth.getSession(),
 * which contends on the client's internal lock while the messenger is
 * mounting. Both messengers already did this; it lives here now.
 */
export function getMessengerUserId() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('smarter-poker-auth');
    const parsed = raw ? JSON.parse(raw) : null;
    const direct = parsed?.user?.id;
    if (direct) return direct;
    const sbKey = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (sbKey) return JSON.parse(localStorage.getItem(sbKey) || '{}')?.user?.id || null;
  } catch {
    /* localStorage unavailable or malformed — treat as signed out */
  }
  return null;
}

/**
 * Read the three synced preference groups back out of Supabase.
 * Returns null if we could not read at all (offline, signed out), which the
 * caller must distinguish from "read fine, user simply has nothing saved".
 */
export async function loadMessengerPrefs(sb, uid) {
  if (!sb || !uid) return null;
  try {
    const [bookmarksRes, labelsRes, themesRes] = await Promise.all([
      sb.from('messenger_bookmarks').select('message_id').eq('user_id', uid),
      sb.from('messenger_labels').select('message_id,label').eq('user_id', uid),
      sb.from('messenger_themes').select('conversation_id,theme_value').eq('user_id', uid),
    ]);
    if (bookmarksRes.error || labelsRes.error || themesRes.error) {
      console.warn(
        '[Messenger] preference read-back failed:',
        bookmarksRes.error?.message || labelsRes.error?.message || themesRes.error?.message
      );
      return null;
    }

    const labels = {};
    for (const row of labelsRes.data || []) {
      (labels[row.message_id] ||= []).push(row.label);
    }
    const themes = {};
    for (const row of themesRes.data || []) {
      themes[row.conversation_id] = row.theme_value;
    }
    return {
      bookmarks: (bookmarksRes.data || []).map((r) => ({ id: r.message_id })),
      labels,
      themes,
    };
  } catch (err) {
    console.warn('[Messenger] preference read-back threw:', err?.message || err);
    return null;
  }
}

// Separator for the composite label key. Built with fromCharCode rather than
// written literally: a raw 0x00 byte in the source makes git classify the file
// as binary (no diff, no blame), and the \u escape does not survive every
// pipeline this file travels through. NUL is the right separator because it
// cannot occur inside a UUID or inside a label.
const LABEL_KEY_SEP = String.fromCharCode(0);

/** Stable key set for a labels map: messageId and label joined by a NUL.
 *  NUL, not a space or a comma, because it cannot occur inside either half. */
function labelKeys(labelsMap) {
  const out = new Set();
  for (const [messageId, list] of Object.entries(labelsMap || {})) {
    for (const label of list || []) out.add(`${messageId}${LABEL_KEY_SEP}${label}`);
  }
  return out;
}

/**
 * Push a preference change to Supabase — additions AND removals.
 *
 * `prev` is the state before the change. Diffing against it is what makes an
 * un-bookmark actually reach the database; the old code only ever upserted, so
 * removals were local-only and would resurrect on any read.
 *
 * Fire-and-forget by design: a failed sync must never block the UI. Errors are
 * logged rather than thrown, but unlike the old code the log now names the
 * table and the operation so a broken policy is diagnosable from the console.
 */
export async function syncMessengerPrefs(sb, uid, next, prev) {
  if (!sb || !uid) return;

  const nextBookmarks = new Set((next?.bookmarks || []).map((b) => b?.id).filter(Boolean));
  const prevBookmarks = new Set((prev?.bookmarks || []).map((b) => b?.id).filter(Boolean));
  const nextLabels = labelKeys(next?.labels);
  const prevLabels = labelKeys(prev?.labels);
  const nextThemes = next?.themes || {};
  const prevThemes = prev?.themes || {};

  const ops = [];

  // ── Bookmarks ─────────────────────────────────────────────────────────────────
  const addedBookmarks = [...nextBookmarks].filter((id) => !prevBookmarks.has(id));
  if (addedBookmarks.length) {
    ops.push([
      'messenger_bookmarks insert',
      sb
        .from('messenger_bookmarks')
        .upsert(
          addedBookmarks.map((message_id) => ({ message_id, user_id: uid })),
          { onConflict: 'message_id,user_id' }
        ),
    ]);
  }
  const removedBookmarks = [...prevBookmarks].filter((id) => !nextBookmarks.has(id));
  if (removedBookmarks.length) {
    ops.push([
      'messenger_bookmarks delete',
      selectInBatches(removedBookmarks, (batch) => sb.from('messenger_bookmarks').delete().eq('user_id', uid).in('message_id', batch)),
    ]);
  }

  // ── Labels ────────────────────────────────────────────────────────────────────
  const addedLabels = [...nextLabels].filter((k) => !prevLabels.has(k));
  if (addedLabels.length) {
    ops.push([
      'messenger_labels insert',
      sb.from('messenger_labels').upsert(
        addedLabels.map((k) => {
          const [message_id, label] = k.split(LABEL_KEY_SEP);
          return { message_id, user_id: uid, label };
        }),
        { onConflict: 'message_id,user_id,label' }
      ),
    ]);
  }
  for (const k of [...prevLabels].filter((x) => !nextLabels.has(x))) {
    const [message_id, label] = k.split(LABEL_KEY_SEP);
    ops.push([
      'messenger_labels delete',
      sb
        .from('messenger_labels')
        .delete()
        .eq('user_id', uid)
        .eq('message_id', message_id)
        .eq('label', label),
    ]);
  }

  // ── Themes ────────────────────────────────────────────────────────────────────
  const changedThemes = Object.entries(nextThemes).filter(
    ([convId, value]) => prevThemes[convId] !== value
  );
  if (changedThemes.length) {
    ops.push([
      'messenger_themes upsert',
      sb.from('messenger_themes').upsert(
        changedThemes.map(([conversation_id, theme_value]) => ({
          conversation_id,
          user_id: uid,
          theme_value,
        })),
        { onConflict: 'conversation_id,user_id' }
      ),
    ]);
  }
  const clearedThemes = Object.keys(prevThemes).filter((convId) => !(convId in nextThemes));
  if (clearedThemes.length) {
    ops.push([
      'messenger_themes delete',
      selectInBatches(clearedThemes, (batch) => sb
        .from('messenger_themes')
        .delete()
        .eq('user_id', uid)
        .in('conversation_id', batch)),
    ]);
  }

  if (ops.length === 0) return;

  const results = await Promise.allSettled(ops.map(([, p]) => p));
  results.forEach((res, i) => {
    const label = ops[i][0];
    if (res.status === 'rejected') {
      console.warn(`[Messenger] ${label} threw:`, res.reason?.message || res.reason);
    } else if (res.value?.error) {
      console.warn(`[Messenger] ${label} failed:`, res.value.error.message);
    }
  });
}

/**
 * Merge what the server has over what localStorage had, on mount.
 *
 * Server wins for a group it actually has rows for. Where the server has
 * nothing but local does, local is kept and returned as `backfill` so the
 * caller can push it up — otherwise this change would silently delete
 * preferences that users accumulated during the whole period the read path
 * did not exist (all three tables are empty today, so this is the common case
 * on first load after this ships, not an edge case).
 */
export function mergeServerPrefs(local, server) {
  if (!server) return { prefs: local, backfill: false };

  const serverHasBookmarks = (server.bookmarks || []).length > 0;
  const serverHasLabels = Object.keys(server.labels || {}).length > 0;
  const serverHasThemes = Object.keys(server.themes || {}).length > 0;

  const localHasBookmarks = (local?.bookmarks || []).length > 0;
  const localHasLabels = Object.keys(local?.labels || {}).length > 0;
  const localHasThemes = Object.keys(local?.themes || {}).length > 0;

  return {
    prefs: {
      ...local,
      bookmarks: serverHasBookmarks ? server.bookmarks : local?.bookmarks || [],
      labels: serverHasLabels ? server.labels : local?.labels || {},
      themes: serverHasThemes ? server.themes : local?.themes || {},
    },
    backfill:
      (!serverHasBookmarks && localHasBookmarks) ||
      (!serverHasLabels && localHasLabels) ||
      (!serverHasThemes && localHasThemes),
  };
}
