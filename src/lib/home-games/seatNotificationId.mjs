import { createHash } from 'node:crypto';

const SEAT_NOTIFICATION_NAMESPACE = 'smarter.poker/home-game-seat-request/v1';

function requiredIdentity(value, label) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

/**
 * Produce one stable UUID for a host/event/requester notification claim.
 * Supplying it as notifications.id turns the existing primary key into an
 * atomic cross-instance claim, so concurrent serverless retries cannot both
 * dispatch push and messenger side effects.
 */
export function homeGameSeatNotificationId({ hostUserId, eventId, requesterUserId }) {
  const identity = [
    SEAT_NOTIFICATION_NAMESPACE,
    requiredIdentity(hostUserId, 'hostUserId'),
    requiredIdentity(eventId, 'eventId'),
    requiredIdentity(requesterUserId, 'requesterUserId'),
  ].join('\u001f');
  const bytes = createHash('sha256').update(identity).digest();

  // Mark the deterministic value as an RFC 4122 variant UUID. Version 8 is
  // reserved for application-defined identifiers and fits this SHA-256 key.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
