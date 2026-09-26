/**
 * Coordinates one replaceable request stream.
 *
 * Full refreshes supersede any older request. Append requests are refused
 * while a full refresh is unresolved, preventing an old cursor page from
 * racing a newer authoritative snapshot. Consumers must check `isCurrent()`
 * after every network response before mutating state.
 */
export function createLatestRequestGuard({ AbortControllerImpl = globalThis.AbortController } = {}) {
  if (typeof AbortControllerImpl !== 'function') {
    throw new Error('AbortController is required for request sequencing');
  }

  let sequence = 0;
  let activeController = null;
  let fullRefreshPending = false;

  return {
    begin({ append = false } = {}) {
      if (append && fullRefreshPending) return null;

      activeController?.abort();
      const controller = new AbortControllerImpl();
      const id = ++sequence;
      activeController = controller;
      if (!append) fullRefreshPending = true;

      return {
        id,
        signal: controller.signal,
        isCurrent: () => id === sequence && !controller.signal.aborted,
        finish: () => {
          if (id !== sequence) return false;
          if (!append) fullRefreshPending = false;
          activeController = null;
          return true;
        },
      };
    },

    abort() {
      sequence += 1;
      activeController?.abort();
      activeController = null;
      fullRefreshPending = false;
    },

    isFullRefreshPending() {
      return fullRefreshPending;
    },
  };
}
