/**
 * modalHistoryCore: the framework-free engine behind useModalHistory.
 *
 * WHY a separate file: the hook is React + Next glue; the decisions (which
 * modal a back gesture closes, when to pop our own entry, what to tell the
 * Next router) are pure bookkeeping over `window.history`, and they need a
 * real test with a fake history stack. This file imports nothing, so
 * `__tests__/modal-history-core.test.mjs` loads it straight into node.
 *
 * The model:
 * - Every open modal owns ONE history entry, pushed with
 *   `{ spModal: true, spModalId, spModalDepth }`. `spModalDepth` is the
 *   number of modal entries on the stack including this one.
 * - On `popstate` the landed entry's depth (0 for a page entry) says which
 *   modals are gone: every registered entry with a depth greater than the
 *   landed depth has been popped. Only those close. A back gesture with two
 *   sheets stacked therefore closes the top one and leaves the one under it.
 * - A programmatic close (X, Done, unmount) whose entry is on top calls
 *   `history.back()` once and marks the entry `closing`, so the resulting
 *   popstate is recognised and `onClose` is NOT fired a second time.
 * - `shouldRouterHandlePop(state)` is what the Next router asks through
 *   `beforePopState`: it answers false whenever the pop is a modal close, so
 *   Next does not re-run the route (its `routeChangeComplete` handler in
 *   pages/_app.js scrolls to the top and hides the page for the transition,
 *   which is exactly what a modal close must not do).
 * - Opening while a close pop is still in flight queues the push until the
 *   pop lands, so the in-flight pop cannot swallow the new entry.
 */

const entries = new Map(); // id -> { id, depth, onClose, status }
let nextId = 1;
let closingTimer = null;
const CLOSING_FALLBACK_MS = 400;

function getHistory(win) {
  if (!win || !win.history) return null;
  return win.history;
}

export function landedDepth(state) {
  return state && state.spModal && typeof state.spModalDepth === 'number' ? state.spModalDepth : 0;
}

function currentDepth(win) {
  const h = getHistory(win);
  return h ? landedDepth(h.state) : 0;
}

function hasClosingEntry() {
  for (const e of entries.values()) if (e.status === 'closing') return true;
  return false;
}

function push(win, entry) {
  const h = getHistory(win);
  if (!h || typeof h.pushState !== 'function') return false;
  const depth = currentDepth(win) + 1;
  try {
    h.pushState({ spModal: true, spModalId: entry.id, spModalDepth: depth }, '');
  } catch (_) {
    return false;
  }
  entry.depth = depth;
  entry.status = 'open';
  return true;
}

function flushQueued(win) {
  for (const e of entries.values()) {
    if (e.status === 'queued') {
      if (!push(win, e)) entries.delete(e.id);
    }
  }
}

function armClosingFallback(win) {
  if (closingTimer || typeof setTimeout !== 'function') return;
  closingTimer = setTimeout(() => {
    closingTimer = null;
    // The popstate for our back() never arrived (some embedded webviews drop
    // it). Treat the closing entries as gone and let queued ones through.
    for (const e of entries.values()) if (e.status === 'closing') entries.delete(e.id);
    flushQueued(win);
  }, CLOSING_FALLBACK_MS);
}

/**
 * Register an open modal. Returns its id. `onClose` is a getter so the hook
 * can hand over the latest callback without re-registering.
 */
export function openModalEntry(win, getOnClose) {
  const entry = { id: nextId++, depth: 0, getOnClose, status: 'queued' };
  entries.set(entry.id, entry);
  if (hasClosingEntry()) {
    // Wait for the in-flight pop; flushQueued pushes us when it lands.
    return entry.id;
  }
  if (!push(win, entry)) entries.delete(entry.id);
  return entry.id;
}

/**
 * The modal closed itself (X, Done, unmount). Pops our entry if it is on top;
 * otherwise just forgets it (the entry is buried under something else and
 * will be discarded by a later back gesture without closing anything).
 */
export function closeModalEntry(win, id) {
  const entry = entries.get(id);
  if (!entry) return;
  if (entry.status === 'queued') {
    entries.delete(id);
    return;
  }
  if (entry.status !== 'open') return;
  const h = getHistory(win);
  const state = h ? h.state : null;
  if (state && state.spModal && state.spModalId === id && typeof h.back === 'function') {
    entry.status = 'closing';
    try {
      h.back();
      armClosingFallback(win);
    } catch (_) {
      entries.delete(id);
    }
    return;
  }
  entries.delete(id);
}

/** True while this id owns a live (pushed, not closing) entry. */
export function isModalEntryOpen(id) {
  const e = entries.get(id);
  return !!e && e.status === 'open';
}

/**
 * Handle a popstate. Returns the ids whose onClose was fired (for tests).
 */
export function handlePopState(win, state) {
  const landed = landedDepth(state);
  const fired = [];
  if (closingTimer && typeof clearTimeout === 'function') {
    clearTimeout(closingTimer);
    closingTimer = null;
  }
  for (const e of Array.from(entries.values())) {
    if (e.status === 'queued') continue;
    if (e.depth <= landed) continue; // still on the stack (or forward onto it)
    const wasClosing = e.status === 'closing';
    entries.delete(e.id);
    if (wasClosing) continue; // our own back(): onClose already ran
    fired.push(e.id);
    const cb = typeof e.getOnClose === 'function' ? e.getOnClose() : null;
    if (typeof cb === 'function') {
      try {
        cb();
      } catch (_) {
        // A throwing onClose must not stop the other entries from settling.
      }
    }
  }
  flushQueued(win);
  return fired;
}

/**
 * For Next's `Router.beforePopState`: false when this pop is a modal close
 * that we handle ourselves, true when the router should run the route.
 */
export function shouldRouterHandlePop(state) {
  const landed = landedDepth(state);
  for (const e of entries.values()) {
    if (e.status !== 'queued' && e.depth > landed) return false;
  }
  return true;
}

/** Test hook: wipe the registry between cases. */
export function resetModalHistoryForTests() {
  entries.clear();
  nextId = 1;
  if (closingTimer && typeof clearTimeout === 'function') clearTimeout(closingTimer);
  closingTimer = null;
}

export function openModalCount() {
  let n = 0;
  for (const e of entries.values()) if (e.status !== 'queued') n += 1;
  return n;
}
