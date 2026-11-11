/**
 * A PERSON ON SMARTER.POKER HAS A HEARTBEAT (2026-11-11)
 *
 * "Online" has one definition, the database's fn_profile_presence:
 * profiles.is_online AND a last_seen heartbeat under five minutes old (or a
 * live seat). Club Arena beats it from its app root every two minutes
 * (Club Arena src/lib/presenceHeartbeat.ts). The World Hub did not: last_seen
 * was written ONCE, when /hub/messenger mounted, and set offline again when it
 * unmounted. So a person chatting from the World Hub read "Offline" to the
 * person they were chatting with five minutes after opening the messenger,
 * and anyone who left the messenger page for the feed read offline at once.
 *
 * Dan, 2026-11-11: a Super Agent who had messaged him two minutes earlier
 * showed "Offline" in the conversation header. Production rows: their
 * last_seen was 15:02:57 UTC, they sent messages at 15:04:14 and 15:11:38,
 * and at 15:13:40 the header asked fn_profile_presence, whose heartbeat was
 * ten minutes old.
 *
 * This module is the World Hub's one heartbeat, mounted once in pages/_app.js
 * through src/hooks/usePresenceHeartbeat.js: one beat on start, one every
 * PRESENCE_HEARTBEAT_MS while the page is visible, one immediately when it
 * becomes visible or regains focus, none while hidden. It never writes
 * offline on unmount or navigation: leaving one page is not leaving the app,
 * and an unbeaten heartbeat goes stale on its own inside the window.
 *
 * Sending a message also counts (the owner's definition): the send route
 * stamps the sender's heartbeat when it confirms a new message
 * (src/lib/messenger/senderPresence.mjs), so no client can forget to.
 *
 * The Messenger "Active Status" toggle is honoured: while it is off this
 * device beats offline instead of online.
 *
 * Pure: every dependency is injected, so __tests__ can drive it with a fake
 * clock and document.
 */

/** How often a visible page beats. Well inside the five-minute window. */
export const PRESENCE_HEARTBEAT_MS = 120_000;

/** The database's online window (fn_profile_presence). */
export const PRESENCE_WINDOW_MS = 5 * 60_000;

/** A focus/visibility burst never beats more often than this. */
export const PRESENCE_MIN_GAP_MS = 15_000;

/** The Messenger menu's device-local Active Status setting. */
export const ACTIVE_STATUS_KEY = 'messenger-active-status';

/** True unless this device turned Messenger Active Status off. */
export function activeStatusEnabled(storage) {
  try {
    return storage?.getItem?.(ACTIVE_STATUS_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Start beating for `userId`. Returns stop().
 *
 * deps:
 *   send(userId, online) -> Promise   one write through fn_update_presence
 *   doc                                { visibilityState, addEventListener, removeEventListener }
 *   win                                { addEventListener, removeEventListener }
 *   storage                            localStorage-like (Active Status)
 *   now()                              epoch ms
 *   setInterval / clearInterval
 *   onError(err)                       reported once per run of failures
 */
export function startPresenceHeartbeat(userId, deps) {
  if (!userId || !deps || typeof deps.send !== 'function') return () => {};
  const {
    send,
    doc,
    win,
    storage,
    now = () => Date.now(),
    setInterval: every = setInterval,
    clearInterval: cancel = clearInterval,
    onError = () => {},
  } = deps;

  let stopped = false;
  let inFlight = false;
  let failing = false;
  let lastSentAt = -Infinity;
  let lastOnline = null;

  const hidden = () => doc?.visibilityState === 'hidden';

  const beat = (force = false) => {
    if (stopped || inFlight || hidden()) return;
    const online = activeStatusEnabled(storage);
    const at = now();
    // Active Status off: one offline write is enough until it changes.
    if (!online && lastOnline === false) return;
    if (!force && online === lastOnline && at - lastSentAt < PRESENCE_MIN_GAP_MS) return;
    inFlight = true;
    lastSentAt = at;
    Promise.resolve()
      .then(() => send(userId, online))
      .then((result) => {
        inFlight = false;
        if (result && result.error) throw result.error;
        failing = false;
        lastOnline = online;
      })
      .catch((err) => {
        inFlight = false;
        // A failed beat is retried by the next tick; allow it immediately.
        lastSentAt = -Infinity;
        lastOnline = null;
        if (!failing) onError(err);
        failing = true;
      });
  };

  const onReturn = () => beat(false);
  const tick = () => beat(true);

  beat(true);
  const timer = every(tick, PRESENCE_HEARTBEAT_MS);
  doc?.addEventListener?.('visibilitychange', onReturn);
  win?.addEventListener?.('focus', onReturn);
  win?.addEventListener?.('pageshow', onReturn);
  win?.addEventListener?.('online', onReturn);
  win?.addEventListener?.('storage', onReturn);

  return () => {
    stopped = true;
    cancel(timer);
    doc?.removeEventListener?.('visibilitychange', onReturn);
    win?.removeEventListener?.('focus', onReturn);
    win?.removeEventListener?.('pageshow', onReturn);
    win?.removeEventListener?.('online', onReturn);
    win?.removeEventListener?.('storage', onReturn);
  };
}
