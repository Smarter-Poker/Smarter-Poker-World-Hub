const MAX_ROWS = 300;
const LOOKUP_BATCH = 200;
const SEVERITIES = new Set(['critical', 'warning', 'info']);

function uuid(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^\{([^{}]+)\}$/, '$1').replace(/-/g, '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// PostgreSQL left(text,n) counts code points, unlike JS String.slice's UTF-16
// units. The DB notification mirror uses left(title,120)/left(message,500).
const left = (value, count) => Array.from(value).slice(0, count).join('');

function unresolved(notificationId, reason) {
  return { severity: 'warning', metadata: { status: 'unresolved', reason,
    notification_id: notificationId } };
}

/**
 * Resolve severity only from the exact mirrored notification, never a push
 * caller's severity or a related id alone. Returns one Map entry per input id;
 * original input objects are untouched. Unknown metadata cannot block intake.
 * This helper owns no inbox/outbox writes and sends no notifications.
 */
export async function resolveOperationalPushMetadata(supabase, rows, { timeoutMs = 1500 } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('Expected push rows');
  const result = new Map();
  const linked = [];
  for (const row of rows) {
    const id = uuid(row.related_entity_id);
    const recipient = uuid(row.recipient_user_id);
    result.set(row.id, unresolved(id, row.related_entity_id == null ? 'no_notification_link' : 'unverified_notification'));
    if (id && recipient) linked.push({ row, id, recipient });
  }
  if (rows.length > MAX_ROWS) {
    for (const { row, id } of linked) result.set(row.id, unresolved(id, 'lookup_batch_limit'));
    return result;
  }
  const budget = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(2000, timeoutMs)) : 1500;
  for (let start = 0; start < linked.length; start += LOOKUP_BATCH) {
    const group = linked.slice(start, start + LOOKUP_BATCH);
    const ids = [...new Set(group.map((item) => item.id))];
    const recipients = [...new Set(group.map((item) => item.recipient))];
    const abort = new AbortController();
    let timer;
    try {
      const query = supabase.from('notifications').select('id,user_id,type,title,message,data')
        .in('id', ids).in('user_id', recipients).limit(ids.length).abortSignal(abort.signal);
      const response = await Promise.race([
        query,
        new Promise((_, reject) => {
          timer = setTimeout(() => { abort.abort(); reject(new Error('metadata_timeout')); }, budget);
        }),
      ]);
      if (response?.error) throw new Error('metadata_lookup_failed');
      const data = response?.data;
      if (!Array.isArray(data) || data.length > ids.length) throw new Error('metadata_invalid_response');
      const notices = new Map();
      for (const notice of data) {
        const id = uuid(notice?.id);
        if (!id || !ids.includes(id) || notices.has(id)) throw new Error('metadata_invalid_response');
        notices.set(id, notice);
      }
      for (const { row, id, recipient } of group) {
        const notice = notices.get(id);
        if (!notice || uuid(notice.user_id) !== recipient || notice.type !== row.event
            || typeof notice.title !== 'string' || row.title !== left(notice.title, 120)
            || (notice.message != null && typeof notice.message !== 'string')
            || row.body !== left(notice.message ?? notice.title, 500)) continue;
        const severity = notice.data?.severity;
        if (!SEVERITIES.has(severity)) {
          result.set(row.id, unresolved(id, 'severity_unavailable'));
          continue;
        }
        result.set(row.id, { severity, metadata: { status: 'verified',
          notification_id: id, recipient_user_id: recipient, event: notice.type, severity } });
      }
    } catch (error) {
      const reason = abort.signal.aborted || error?.message === 'metadata_timeout' ? 'lookup_timeout'
        : error?.message === 'metadata_invalid_response' ? 'invalid_lookup_response' : 'lookup_failed';
      for (const { row, id } of group) result.set(row.id, unresolved(id, reason));
    } finally {
      clearTimeout(timer);
    }
  }
  return result;
}
