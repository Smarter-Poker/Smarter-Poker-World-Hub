import { randomUUID } from 'node:crypto';
import { ALERT_TASK_ID, recordOperationalAlerts } from '../operationalAlerts.mjs';
import { resolveOperationalPushMetadata } from './operational-push-metadata.mjs';

// Dan's explicit operational-alert destination. Ordinary customer notifications
// and other recipients retain their existing delivery/preferences.
export const ALERT_OWNER_ID = '47965354-0e56-43ef-931c-ddaab82af765';
export const ROUTED_REASON = 'operational_routed_to_codex';
const TYPES = new Set([
  'financial_incident', 'financial_incident_resolved', 'financial_attestation',
  'engine_break_failed', 'engine_break_recovered', 'guarantee_bank_short',
  'guarantee_bank_recovered', 'estate_digest',
]);

export function isOwnerOperationalPush(userId, row = {}) {
  // PostgreSQL accepts case, braces and alternate hyphen grouping for the same
  // UUID. Compare the identity before the first database round trip, retaining
  // the original caller string in the event evidence.
  if (typeof userId !== 'string') return false;
  const identity = userId.trim().replace(/^\{([^{}]+)\}$/, '$1').replace(/-/g, '').toLowerCase();
  if (identity !== ALERT_OWNER_ID.replace(/-/g, '')) return false;
  if (TYPES.has(row.event)) return true;
  // These are the actual legacy system-notification producers. Do not mute
  // the whole system category: it also carries account-security notices.
  return row.event === 'system' && (
    row.title === 'Push Health Alert'
    || row.title === 'Notifications May Not Be Reaching This Device'
    || /^Horse Fleet (?:Alert|Recovered): /.test(String(row.title || ''))
  );
}

function inboxEvent(row, resolution) {
  const recovered = /(?:_resolved|_recovered)$/.test(row.event)
    || (row.event === 'system' && /^Horse Fleet Recovered: /.test(String(row.title || '')));
  return {
    source: 'owner-operational-push',
    event_key: row.id,
    alertname: `${row.event}:${row.title || 'Operational notification'}`.slice(0, 240),
    status: recovered ? 'resolved' : 'firing',
    severity: resolution?.severity || 'warning',
    payload: { original_push: row, push_metadata: resolution?.metadata
      || { status: 'unresolved', reason: 'metadata_unavailable' }, target_task_id: ALERT_TASK_ID },
  };
}

// Notification producers also retain structured engine alert identity. This
// function receives the original notification, never a caller-provided linked
// UUID treated as proof of another notification's content.
export function isOwnerOperationalNotification(userId, row = {}) {
  if (isOwnerOperationalPush(userId, { event: row.type, title: row.title })) return true;
  return isOwnerOperationalPush(userId, { event: 'system', title: 'Push Health Alert' })
    && row.type === 'system' && row.data?.component === 'club-arena-engine'
    && typeof row.data?.alertname === 'string' && row.data.alertname.length > 0;
}

// One bounded retry for the exact original in its owning request. The original
// is already durable; failure remains pending and never falls back to a phone.
export async function retryOwnerNotificationDestination(supabase, notificationId) {
  try {
    const { data, error } = await supabase.rpc('fn_retry_owner_notification_destination', { p_notification_id: notificationId })
      .abortSignal(AbortSignal.timeout(9000));
    if (error) throw new Error(error.message);
    if (!data || data.notification_id !== notificationId || data.target_task_id !== ALERT_TASK_ID
        || (data.inbox_event_id !== null
          && (!Number.isSafeInteger(data.inbox_event_id) || data.inbox_event_id <= 0))) {
      throw new Error('Invalid operational destination retry receipt');
    }
    return { eventId: data.inbox_event_id, error: null };
  } catch (error) {
    return { eventId: null, error: error?.message || String(error) };
  }
}

// Inbox delivery does not depend on phone credentials. During a provider
// configuration fault, read only operational rows and preserve every ordinary
// customer's queue state and retry budget. Concurrent routing shares the same
// durable inbox identity; it never sends to a device.
export async function routeQueuedOperationalPushes(supabase, record = recordOperationalAlerts) {
  try {
    const { data, error } = await supabase.from('push_outbox').select('*')
      .eq('recipient_user_id', ALERT_OWNER_ID)
      .in('status', ['pending', 'processing'])
      .or(`event.in.(${[...TYPES].join(',')}),and(event.eq.system,or(title.eq.Push Health Alert,title.eq.Notifications May Not Be Reaching This Device,title.like.Horse Fleet Alert: *,title.like.Horse Fleet Recovered: *))`)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(300);
    if (error) throw new Error(`Operational outbox read failed: ${error.message}`);
    if (!Array.isArray(data)) throw new Error('Operational outbox returned an invalid row set');
    return await routeOperationalPushRows(supabase, data, record);
  } catch (error) {
    return { remaining: [], routed: 0, pending: 0, error: error?.message || String(error) };
  }
}

// Called before preference suppression, age suppression or digest formation.
// A failed inbox or bookkeeping request never makes a row phone-deliverable.
// Its existing durable outbox row remains available for an exact-ID retry.
export async function routeOperationalPushRows(supabase, rows, record = recordOperationalAlerts) {
  const operational = rows.filter((row) => isOwnerOperationalPush(row.recipient_user_id, row));
  const remaining = rows.filter((row) => !isOwnerOperationalPush(row.recipient_user_id, row));
  if (!operational.length) return { remaining, routed: 0, pending: 0, error: null };
  let routed = 0;
  try {
    // The inbox accepts 200 events; the dispatcher can claim 300. Preserve
    // each receipt boundary instead of creating an oversized poisoned batch.
    for (let start = 0; start < operational.length; start += 200) {
      const group = operational.slice(start, start + 200);
      const metadata = await resolveOperationalPushMetadata(supabase, group);
      const receipts = await record(group.map((row) => inboxEvent(row, metadata.get(row.id))));
      if (!Array.isArray(receipts) || receipts.length !== group.length
        || receipts.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
        throw new Error('Operational inbox returned an invalid receipt');
      }
      const { error } = await supabase.from('push_outbox')
        .update({ status: 'skipped', claimed_at: null, failure_reason: ROUTED_REASON })
        .in('id', group.map((row) => row.id))
        .in('status', ['pending', 'processing']);
      if (error) throw new Error(`Operational push receipt finalization failed: ${error.message}`);
      routed += group.length;
    }
    return { remaining, routed, pending: 0, error: null };
  } catch (error) {
    // Retain unsent rows for normal claim recovery. The task's independent
    // historical reader also consumes them, including exhausted claims.
    try {
      const ids = operational.slice(routed).map((row) => row.id);
      await supabase.from('push_outbox')
        .update({ status: 'pending', claimed_at: null, failure_reason: 'operational_inbox_pending' })
        .in('id', ids).eq('status', 'processing');
    } catch { /* original durable rows remain; expose failure below */ }
    return { remaining, routed, pending: operational.length - routed, error: error?.message || String(error) };
  }
}

export async function enqueueOperationalPush(supabase, args, record = recordOperationalAlerts) {
  const row = {
    id: randomUUID(), recipient_user_id: args.userId,
    title: String(args.title || 'Smarter Poker').slice(0, 120),
    body: String(args.body || '').slice(0, 500), url: args.url || '/hub',
    event: args.event, tag: args.tag || null,
    related_entity_id: args.relatedEntityId || null,
    status: 'processing', claimed_at: new Date().toISOString(),
  };
  const out = { sent: false, outboxId: null, skipped: false, reason: null, accepted: 0 };
  try {
    const { data, error } = await supabase.from('push_outbox').insert(row).select('id').maybeSingle();
    if (error) throw new Error(`Operational outbox insert failed: ${error.message}`);
    if (data?.id !== row.id) throw new Error('Operational outbox did not acknowledge the original event ID');
    out.outboxId = row.id;
    const result = await routeOperationalPushRows(supabase, [row], record);
    out.skipped = result.routed === 1;
    out.reason = out.skipped ? ROUTED_REASON : 'operational_inbox_pending';
    if (result.error) out.error = result.error;
  } catch (error) {
    // Still never send a phone alert. If the outbox insert itself failed,
    // attempt durable inbox storage directly and report its actual outcome.
    try {
      const metadata = await resolveOperationalPushMetadata(supabase, [row]);
      const receipts = await record([inboxEvent(row, metadata.get(row.id))]);
      if (!Array.isArray(receipts) || receipts.length !== 1
          || !Number.isSafeInteger(receipts[0]) || receipts[0] <= 0) {
        throw new Error('Operational inbox returned an invalid receipt');
      }
      out.skipped = true;
      out.reason = ROUTED_REASON;
    } catch (inboxError) {
      out.reason = 'operational_persistence_failed';
      out.error = `${error?.message || error}; ${inboxError?.message || inboxError}`;
    }
  }
  return out;
}
