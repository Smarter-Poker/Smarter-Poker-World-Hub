const TOPIC = 'social-video-authority';
const EVENT = 'managed_video_invalidated';
const entries = new WeakMap();

function openEntry(client) {
  const entry = {
    active: true,
    channel: null,
    listeners: new Set(),
    removing: null,
  };
  entry.channel = client
    .channel(TOPIC)
    .on('broadcast', { event: EVENT }, (message) => {
      if (!entry.active) return;
      for (const listener of entry.listeners) {
        listener({ type: 'broadcast', payload: message?.payload });
      }
    })
    .subscribe((status) => {
      if (!entry.active) return;
      for (const listener of entry.listeners) listener({ type: 'status', status });
    });
  entries.set(client, entry);
  return entry;
}

/**
 * Share the one exact Realtime topic per configured Supabase client. The
 * caller supplies the client, so importing this module never creates an auth
 * session or a browser connection at module scope.
 */
export function subscribeSocialAuthority(client, listener) {
  if (!client || typeof client.channel !== 'function' || typeof listener !== 'function') {
    return () => {};
  }

  const current = entries.get(client);
  if (current?.removing) {
    let cancelled = false;
    let unsubscribe = null;
    current.removing.finally(() => {
      if (!cancelled) unsubscribe = subscribeSocialAuthority(client, listener);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }

  const entry = current || openEntry(client);
  entry.listeners.add(listener);
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0 || entry.removing) return;
    entry.active = false;
    try {
      entry.removing = Promise.resolve(client.removeChannel(entry.channel))
        .catch(() => {})
        .finally(() => {
          if (entries.get(client) === entry) entries.delete(client);
        });
    } catch {
      if (entries.get(client) === entry) entries.delete(client);
    }
  };
}

export const SOCIAL_AUTHORITY_TOPIC = TOPIC;
export const SOCIAL_AUTHORITY_EVENT = EVENT;
