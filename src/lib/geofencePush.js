/**
 * geofencePush.js — Bridge between GeofenceService and OneSignal Push
 *
 * When a user enters a geofence, this module fires a server-side push
 * notification via OneSignal so the alert is delivered to ALL subscribed
 * devices — even if the Bankroll Manager tab is not the active window.
 *
 * Falls back to the existing browser Notification API if the server
 * call fails or OneSignal is not configured.
 */

import { showVenueAlert } from './pushAlerts';

const GEOFENCE_PUSH_COOLDOWN_KEY = 'smarter-poker-geofence-push-cooldowns';
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours — matches GeofenceService

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Send a geofence proximity push notification via the server-side
 * OneSignal integration.
 *
 * @param {Object} venue   - Venue object (needs id, name, venue_type)
 * @param {string} userId  - Supabase auth user ID
 * @returns {Promise<boolean>} true if push was sent, false otherwise
 */
export async function sendGeofenceNotification(venue, userId) {
    if (!venue || !userId) {
        console.warn('[GeofencePush] Missing venue or userId');
        return false;
    }

    // Client-side cooldown check (prevents spamming server)
    if (_hasPushCooldown(venue.id)) {
        console.log(`[GeofencePush] Push cooldown active for venue ${venue.id}`);
        return false;
    }

    try {
        const res = await fetch('/api/notifications/geofence-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                venueId: venue.id,
                venueName: venue.name || 'Unknown Venue',
                venueType: venue.venue_type || 'poker_room',
            }),
        });

        const data = await res.json();

        if (data.success) {
            console.log(`[GeofencePush] ✅ Push sent for venue: ${venue.name}`);
            _setPushCooldown(venue.id);
            return true;
        }

        // Server couldn't send push — fall back to browser notification
        console.warn('[GeofencePush] Server push failed, falling back to browser:', data.error);
        showVenueAlert(venue, 'checkin');
        return false;
    } catch (err) {
        console.warn('[GeofencePush] Network error, falling back to browser:', err.message);
        showVenueAlert(venue, 'checkin');
        return false;
    }
}

// --------------------------------------------------------------------------
// Cooldown management (localStorage)
// --------------------------------------------------------------------------

function _hasPushCooldown(venueId) {
    try {
        if (typeof window === 'undefined') return false;
        const raw = localStorage.getItem(GEOFENCE_PUSH_COOLDOWN_KEY);
        if (!raw) return false;

        const cooldowns = JSON.parse(raw);
        const lastPush = cooldowns[venueId];
        if (!lastPush) return false;

        return Date.now() - lastPush < COOLDOWN_MS;
    } catch {
        return false;
    }
}

function _setPushCooldown(venueId) {
    try {
        if (typeof window === 'undefined') return;
        const raw = localStorage.getItem(GEOFENCE_PUSH_COOLDOWN_KEY);
        const cooldowns = raw ? JSON.parse(raw) : {};

        // Prune expired entries
        const now = Date.now();
        for (const key of Object.keys(cooldowns)) {
            if (now - cooldowns[key] > COOLDOWN_MS) {
                delete cooldowns[key];
            }
        }

        cooldowns[venueId] = now;
        localStorage.setItem(GEOFENCE_PUSH_COOLDOWN_KEY, JSON.stringify(cooldowns));
    } catch {
        // silently ignore
    }
}
