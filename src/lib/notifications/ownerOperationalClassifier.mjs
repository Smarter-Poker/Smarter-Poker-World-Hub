// Pure, dependency-free classifier for "is this row one of the owner's
// operational alerts, routed away from his personal view/phone". No node
// built-ins, no Supabase client, no env vars — safe to import from a
// browser bundle (src/lib/notificationVisibility.mjs) AND from server-only
// code (src/lib/push/operational-push-routing.mjs) without pulling either
// side's dependencies into the other.
//
// This mirrors the database's own predicate, public.fn_is_owner_operational_
// notification(uuid,text,text,jsonb) (supabase/components/owner-operational-
// notification-destination.sql). Three independent copies of this list have
// drifted before (CLAUDE.md 10.84's "three lists" lesson) — keep this the
// only place the type/title list is written, and have both callers import it.
export const OWNER_OPERATIONAL_ID = '47965354-0e56-43ef-931c-ddaab82af765';

export const OWNER_OPERATIONAL_TYPES = new Set([
  'financial_incident', 'financial_incident_resolved', 'financial_attestation',
  'engine_break_failed', 'engine_break_recovered', 'guarantee_bank_short',
  'guarantee_bank_recovered', 'estate_digest',
]);

function normalizeOwnerId(userId) {
  if (typeof userId !== 'string') return null;
  return userId.trim().replace(/^\{([^{}]+)\}$/, '$1').replace(/-/g, '').toLowerCase();
}

export function isOwnerId(userId) {
  const identity = normalizeOwnerId(userId);
  return identity !== null && identity === OWNER_OPERATIONAL_ID.replace(/-/g, '');
}

// `type`/`title` shaped for a push_outbox row (event/title) or a
// notifications row (type/title) — both use the same field names once the
// caller destructures them, so a single predicate serves both tables.
export function isOwnerOperationalRow(userId, { type, title, data } = {}) {
  if (!isOwnerId(userId)) return false;
  if (OWNER_OPERATIONAL_TYPES.has(type)) return true;
  if (type !== 'system') return false;
  if (title === 'Push Health Alert' || title === 'Notifications May Not Be Reaching This Device') return true;
  if (/^Horse Fleet (?:Alert|Recovered): /.test(String(title || ''))) return true;
  return typeof data?.component === 'string' && data.component === 'club-arena-engine'
    && typeof data?.alertname === 'string' && data.alertname.length > 0;
}
