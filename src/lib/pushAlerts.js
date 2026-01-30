/**
 * pushAlerts.js - Browser push notifications and in-app alert helpers
 * for venue proximity check-in / review prompts.
 *
 * Uses the Notification API where available and falls back to in-app alerts.
 */

const PREFS_KEY = 'smarter-poker-notification-prefs';

// --------------------------------------------------------------------------
// Permission helpers
// --------------------------------------------------------------------------

/**
 * Request browser Notification permission.
 * Returns the resulting permission string: 'granted' | 'denied' | 'default'.
 */
export async function requestPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    _savePrefs({ push: false });
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    _savePrefs({ push: true });
    return 'granted';
  }

  try {
    const result = await Notification.requestPermission();
    _savePrefs({ push: result === 'granted' });
    return result;
  } catch {
    _savePrefs({ push: false });
    return 'denied';
  }
}

// --------------------------------------------------------------------------
// Push (browser) notifications
// --------------------------------------------------------------------------

const ALERT_MESSAGES = {
  checkin: (name) => ({
    title: 'Poker Venue Nearby',
    body: `You're near ${name}! Check in and let others know you're here.`,
  }),
  review: (name) => ({
    title: 'Leave a Review',
    body: `Been to ${name}? Leave a review!`,
  }),
};

/**
 * Show a native browser Notification for a venue event.
 *
 * @param {Object} venue - venue object (needs at least `name`)
 * @param {'checkin'|'review'} type
 * @returns {Notification|null}
 */
export function showVenueAlert(venue, type = 'checkin') {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  const msgFn = ALERT_MESSAGES[type] || ALERT_MESSAGES.checkin;
  const { title, body } = msgFn(venue.name);

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `venue-${venue.id}-${type}`,
      renotify: false,
    });
    return notification;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// In-app alert builder (React-renderable data object)
// --------------------------------------------------------------------------

/**
 * Build a plain data object that the consuming component can render.
 *
 * @param {Object}   venue      - venue object
 * @param {Function} onCheckin  - callback for "Check In" action
 * @param {Function} onReview   - callback for "Leave Review" action
 * @param {Function} onDismiss  - callback for dismiss
 * @returns {{ venue, onCheckin, onReview, onDismiss }}
 */
export function showInAppAlert(venue, onCheckin, onReview, onDismiss) {
  return {
    venue,
    message: `You're near ${venue.name}!`,
    actions: {
      checkin: { label: 'Check In', onClick: onCheckin },
      review: { label: 'Leave Review', onClick: onReview },
    },
    onDismiss,
  };
}

// --------------------------------------------------------------------------
// localStorage preferences
// --------------------------------------------------------------------------

function _savePrefs(prefs) {
  try {
    if (typeof window === 'undefined') return;
    const existing = _loadPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...existing, ...prefs }));
  } catch {
    // silently ignore
  }
}

function _loadPrefs() {
  try {
    if (typeof window === 'undefined') return {};
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Returns the saved notification preferences.
 */
export function getPrefs() {
  return _loadPrefs();
}
