/** Hydration may update untouched targets, never an action started since its read. */
export function createReelHydrationRevision() {
  let scope = null, revision = 0;
  let touched = new Map(), pending = new Set();
  const scopeOf = request => JSON.stringify([request.ownerId, request.revision]);
  const bind = request => {
    const next = scopeOf(request);
    if (scope !== next) { scope = next; revision = 0; touched = new Map(); pending = new Set(); }
    return next;
  };
  const key = (kind, target) => JSON.stringify([kind, target]);
  return {
    begin(request, kind, target) {
      const ownedScope = bind(request);
      if (!['reaction', 'save', 'follow'].includes(kind)) return () => {};
      const targetKey = key(kind, target);
      touched.set(targetKey, ++revision); pending.add(targetKey);
      let finished = false;
      return () => {
        if (finished || scope !== ownedScope) return;
        finished = true; pending.delete(targetKey); touched.set(targetKey, ++revision);
      };
    },
    capture(request) {
      const ownedScope = bind(request), captured = revision;
      // Include targets already pending when this read started, even if they settle before it.
      const initialPending = new Set(pending);
      return {
        merge(kind, incoming = {}, previous = {}) {
          if (!request.isCurrent() || scope !== ownedScope) return previous;
          const result = { ...incoming };
          for (const target of new Set([...Object.keys(incoming), ...Object.keys(previous)])) {
            const targetKey = key(kind, target);
            if ((touched.get(targetKey) || 0) > captured || initialPending.has(targetKey) || pending.has(targetKey)) {
              if (Object.hasOwn(previous, target)) result[target] = previous[target];
              else delete result[target];
            }
          }
          return result;
        },
        savedSet(incoming, previous) {
          const merged = this.merge('save', incoming, Object.fromEntries([...previous].map(id => [id, true])));
          return new Set(Object.keys(merged).filter(id => merged[id]));
        },
      };
    },
  };
}
