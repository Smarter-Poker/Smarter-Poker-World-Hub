/**
 * mobileGeofence.js — Mobile-ready geofence abstraction layer
 *
 * Provides a unified interface for geofencing that works across:
 *   1. Web browsers (delegates to existing GeofenceService)
 *   2. Capacitor/Ionic native apps
 *   3. React Native apps via native bridge
 *   4. PWA with background geolocation
 *
 * When the app is wrapped in a native shell (Capacitor, React Native),
 * this module registers background geofences via native APIs that persist
 * even when the app is terminated. On web, it falls back to the existing
 * foreground-only GeofenceService.
 *
 * Usage:
 *   const mgf = new MobileGeofenceService();
 *   await mgf.init(venues, userId);
 *   mgf.onEnter((venue) => { ... });
 *   mgf.destroy();
 */

import GeofenceService from './geofence';

// --------------------------------------------------------------------------
// Platform detection
// --------------------------------------------------------------------------

function isCapacitor() {
    return typeof window !== 'undefined' && !!window.Capacitor;
}

function isReactNative() {
    return typeof window !== 'undefined' && !!window.ReactNativeWebView;
}

function isNativeApp() {
    return isCapacitor() || isReactNative();
}

function isPWAStandalone() {
    if (typeof window === 'undefined') return false;
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
    );
}

// --------------------------------------------------------------------------
// Convert venue to native geofence payload
// --------------------------------------------------------------------------

/**
 * Convert a venue object to the standard payload expected by native
 * geofencing SDKs (Capacitor, React Native, etc.)
 *
 * @param {Object} venue - Venue with id, latitude, longitude, venue_type, name
 * @returns {Object} Native geofence registration payload
 */
export function toNativePayload(venue) {
    const RADIUS_BY_TYPE = {
        casino: 500,
        card_room: 300,
        poker_club: 200,
        charity: 200,
    };

    return {
        id: `geofence-${venue.id}`,
        identifier: venue.id,
        latitude: parseFloat(venue.latitude),
        longitude: parseFloat(venue.longitude),
        radius: RADIUS_BY_TYPE[venue.venue_type] || 300,
        notifyOnEntry: true,
        notifyOnExit: false,
        extras: {
            venueName: venue.name,
            venueType: venue.venue_type,
            venueId: venue.id,
        },
    };
}

// --------------------------------------------------------------------------
// Persistent geofence registry (survives app restart)
// --------------------------------------------------------------------------

const REGISTRY_KEY = 'smarter-poker-geofence-registry';

function _saveRegistry(venues) {
    try {
        if (typeof window === 'undefined') return;
        localStorage.setItem(REGISTRY_KEY, JSON.stringify({
            venues: venues.map(v => ({ id: v.id, name: v.name, latitude: v.latitude, longitude: v.longitude, venue_type: v.venue_type })),
            registeredAt: new Date().toISOString(),
        }));
    } catch { /* silently ignore */ }
}

function _loadRegistry() {
    try {
        if (typeof window === 'undefined') return null;
        const raw = localStorage.getItem(REGISTRY_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function _clearRegistry() {
    try {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(REGISTRY_KEY);
    } catch { /* silently ignore */ }
}

// --------------------------------------------------------------------------
// MobileGeofenceService
// --------------------------------------------------------------------------

export default class MobileGeofenceService {
    constructor() {
        this._platform = 'web';
        this._webGf = null;
        this._onEnterCallback = null;
        this._nativeListenerCleanup = null;

        if (isCapacitor()) this._platform = 'capacitor';
        else if (isReactNative()) this._platform = 'react-native';
        else if (isPWAStandalone()) this._platform = 'pwa';
    }

    /**
     * Get the detected platform.
     * @returns {'web'|'capacitor'|'react-native'|'pwa'}
     */
    get platform() {
        return this._platform;
    }

    /**
     * Initialize geofencing with a list of venues.
     *
     * @param {Array} venues  - Venues with lat/lng
     * @param {string} userId - User ID for push notification targeting
     */
    async init(venues, userId) {
        if (!venues || venues.length === 0) {
            console.warn('[MobileGeofence] No venues to register');
            return;
        }

        // Save to persistent registry
        _saveRegistry(venues);

        switch (this._platform) {
            case 'capacitor':
                await this._initCapacitor(venues, userId);
                break;
            case 'react-native':
                await this._initReactNative(venues, userId);
                break;
            default:
                // Web + PWA: use foreground GeofenceService
                this._initWeb(venues);
                break;
        }
    }

    /**
     * Register a callback for geofence entry events.
     * @param {Function} callback - Receives venue object
     */
    onEnter(callback) {
        this._onEnterCallback = callback;

        // If web GeofenceService is already running, it's wired via init()
        // For native, wire native listener
        if (this._platform === 'capacitor') {
            this._wireCapacitorListener();
        } else if (this._platform === 'react-native') {
            this._wireReactNativeListener();
        }
    }

    /**
     * Get all registered geofences from persistent storage.
     * @returns {Array} Venue objects
     */
    getRegisteredGeofences() {
        const registry = _loadRegistry();
        return registry?.venues || [];
    }

    /**
     * Remove a specific geofence by venue ID.
     * @param {string} venueId
     */
    async removeGeofence(venueId) {
        const registry = _loadRegistry();
        if (registry?.venues) {
            registry.venues = registry.venues.filter(v => v.id !== venueId);
            _saveRegistry(registry.venues);
        }

        if (this._platform === 'capacitor' && window.Capacitor?.Plugins?.Geolocation) {
            try {
                await window.Capacitor.Plugins.BackgroundGeolocation?.removeGeofence({ id: `geofence-${venueId}` });
            } catch (err) {
                console.warn('[MobileGeofence] Failed to remove native geofence:', err);
            }
        }
    }

    /**
     * Remove all registered geofences.
     */
    async removeAll() {
        _clearRegistry();

        if (this._platform === 'capacitor' && window.Capacitor?.Plugins?.BackgroundGeolocation) {
            try {
                await window.Capacitor.Plugins.BackgroundGeolocation.removeGeofences();
            } catch (err) {
                console.warn('[MobileGeofence] Failed to remove all native geofences:', err);
            }
        }
    }

    /**
     * Stop all geofencing and clean up listeners.
     */
    destroy() {
        if (this._webGf) {
            this._webGf.stop();
            this._webGf = null;
        }

        if (this._nativeListenerCleanup) {
            this._nativeListenerCleanup();
            this._nativeListenerCleanup = null;
        }
    }

    // ====================================================================
    // Web (browser) implementation
    // ====================================================================

    _initWeb(venues) {
        this._webGf = new GeofenceService();
        this._webGf.start(venues, (venue) => {
            if (typeof this._onEnterCallback === 'function') {
                this._onEnterCallback(venue);
            }
        });
    }

    // ====================================================================
    // Capacitor (iOS/Android) implementation
    // ====================================================================

    async _initCapacitor(venues, userId) {
        try {
            // Check for @capacitor-community/background-geolocation plugin
            const bgGeo = window.Capacitor?.Plugins?.BackgroundGeolocation;

            if (!bgGeo) {
                console.warn('[MobileGeofence] BackgroundGeolocation plugin not available, falling back to web');
                this._platform = 'web';
                this._initWeb(venues);
                return;
            }

            // Configure background geolocation
            await bgGeo.configure({
                desiredAccuracy: 'HIGH',
                distanceFilter: 50,
                stationaryRadius: 25,
                stopOnTerminate: false,
                startOnBoot: true,
                debug: false,
                notificationTitle: 'Smarter.Poker',
                notificationText: 'Venue proximity tracking active',
            });

            // Register geofences for each venue
            for (const venue of venues) {
                if (!venue.latitude || !venue.longitude) continue;
                const payload = toNativePayload(venue);
                await bgGeo.addGeofence(payload);
            }

            // Start monitoring
            await bgGeo.start();
            console.log(`[MobileGeofence] ✅ Capacitor: Registered ${venues.length} geofences`);
        } catch (err) {
            console.error('[MobileGeofence] Capacitor init failed:', err);
            // Fall back to web
            this._platform = 'web';
            this._initWeb(venues);
        }
    }

    _wireCapacitorListener() {
        try {
            const bgGeo = window.Capacitor?.Plugins?.BackgroundGeolocation;
            if (!bgGeo) return;

            const handler = (event) => {
                if (event.action === 'ENTER' && typeof this._onEnterCallback === 'function') {
                    const venue = {
                        id: event.extras?.venueId || event.identifier,
                        name: event.extras?.venueName || 'Unknown Venue',
                        venue_type: event.extras?.venueType || 'poker_room',
                        latitude: event.latitude,
                        longitude: event.longitude,
                    };
                    this._onEnterCallback(venue);
                }
            };

            bgGeo.addListener('geofence', handler);
            this._nativeListenerCleanup = () => bgGeo.removeListener('geofence', handler);
        } catch (err) {
            console.warn('[MobileGeofence] Failed to wire Capacitor listener:', err);
        }
    }

    // ====================================================================
    // React Native implementation (via postMessage bridge)
    // ====================================================================

    async _initReactNative(venues, userId) {
        try {
            // Send geofence registration to React Native shell
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'REGISTER_GEOFENCES',
                payload: {
                    userId,
                    geofences: venues
                        .filter(v => v.latitude && v.longitude)
                        .map(v => toNativePayload(v)),
                },
            }));

            console.log(`[MobileGeofence] ✅ React Native: Sent ${venues.length} geofences to native shell`);
        } catch (err) {
            console.error('[MobileGeofence] React Native init failed:', err);
            this._platform = 'web';
            this._initWeb(venues);
        }
    }

    _wireReactNativeListener() {
        try {
            const handler = (event) => {
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

                    if (data.type === 'GEOFENCE_ENTER' && typeof this._onEnterCallback === 'function') {
                        this._onEnterCallback({
                            id: data.payload?.venueId,
                            name: data.payload?.venueName || 'Unknown Venue',
                            venue_type: data.payload?.venueType || 'poker_room',
                            latitude: data.payload?.latitude,
                            longitude: data.payload?.longitude,
                        });
                    }
                } catch { /* ignore malformed messages */ }
            };

            window.addEventListener('message', handler);
            this._nativeListenerCleanup = () => window.removeEventListener('message', handler);
        } catch (err) {
            console.warn('[MobileGeofence] Failed to wire React Native listener:', err);
        }
    }
}
