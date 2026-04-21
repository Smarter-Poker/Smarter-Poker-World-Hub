/**
 * useLocationPermission — Centralized location permission hook
 * 
 * Provides a standardized way to request location across the platform.
 * Features:
 *   - Device detection (iOS/Android/Desktop + browser name)
 *   - Permission state monitoring via Permissions API
 *   - Auto-retry when permission changes from denied → granted
 *   - localStorage persistence of last known location
 *   - Tiered fallback (high accuracy → low accuracy)
 *   - Exposes showModal state for LocationEnableModal integration
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const GPS_STORAGE_KEY = 'sp-user-gps';
const GPS_MAX_AGE_MS = 86400000; // 24 hours

function detectDeviceType() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/i.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

function detectBrowser() {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent || '';
  if (/CriOS/i.test(ua)) return 'Chrome';
  if (/FxiOS/i.test(ua)) return 'Firefox';
  if (/EdgiOS|Edg/i.test(ua)) return 'Edge';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Chrome/i.test(ua)) return 'Chrome';
  if (/Firefox/i.test(ua)) return 'Firefox';
  return 'browser';
}

export default function useLocationPermission(options = {}) {
  const {
    autoRequest = false,       // Auto-request GPS on mount
    autoRestoreSaved = true,   // Restore from localStorage on mount
    onSuccess = null,          // Callback when location is obtained
    onDenied = null,           // Callback when permission is denied
    highAccuracy = true,       // Use high accuracy GPS
    timeout = 15000,           // GPS timeout in ms
    maxAge = 60000,            // Max age for cached position
  } = options;

  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [permissionState, setPermissionState] = useState('prompt');
  const [showModal, setShowModal] = useState(false);
  const [deviceType] = useState(() => detectDeviceType());
  const [browserName] = useState(() => detectBrowser());
  const [locationLabel, setLocationLabel] = useState(null);

  const mountedRef = useRef(true);
  const requestedRef = useRef(false);

  // Monitor permission state
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions) return;

    let permStatus = null;
    navigator.permissions.query({ name: 'geolocation' }).then(status => {
      if (!mountedRef.current) return;
      setPermissionState(status.state);
      permStatus = status;
      
      status.onchange = () => {
        if (!mountedRef.current) return;
        setPermissionState(status.state);
        // Auto-retry when permission changes to granted
        if (status.state === 'granted' && !location) {
          requestLocation();
        }
      };
    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

    return () => {
      mountedRef.current = false;
      if (permStatus) permStatus.onchange = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore saved location on mount
  useEffect(() => {
    if (!autoRestoreSaved) return;
    try {
      const saved = localStorage.getItem(GPS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.lat && parsed.lng && parsed.time && (Date.now() - parsed.time) < GPS_MAX_AGE_MS) {
          setLocation({ lat: parsed.lat, lng: parsed.lng });
          setLocationLabel(parsed.label || `${parsed.lat.toFixed(3)}, ${parsed.lng.toFixed(3)}`);
          if (onSuccess) onSuccess({ lat: parsed.lat, lng: parsed.lng }, true);
        }
      }
    } catch (e) { /* ignore corrupt data */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-request on mount if configured
  useEffect(() => {
    if (autoRequest && !requestedRef.current) {
      requestedRef.current = true;
      setTimeout(() => requestLocation(), 600);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSuccess = useCallback((pos) => {
    if (!mountedRef.current) return;
    const { latitude: lat, longitude: lng } = pos.coords;
    setLocation({ lat, lng });
    setLoading(false);
    setError(null);
    setShowModal(false);
    setLocationLabel(`${lat.toFixed(3)}, ${lng.toFixed(3)}`);

    // Persist to localStorage
    try {
      localStorage.setItem(GPS_STORAGE_KEY, JSON.stringify({
        lat, lng, time: Date.now(), label: `${lat.toFixed(3)}, ${lng.toFixed(3)}`
      }));
    } catch (e) { /* storage full */ }

    if (onSuccess) onSuccess({ lat, lng }, false);
  }, [onSuccess]);

  const handleError = useCallback((err) => {
    if (!mountedRef.current) return;
    setLoading(false);

    if (err.code === 1) {
      // Permission denied
      setError('denied');
      setShowModal(true);
      if (onDenied) onDenied();
    } else if (err.code === 2) {
      setError('unavailable');
      setShowModal(true);
    } else if (err.code === 3) {
      setError('timeout');
      // Try low accuracy fallback
      if (highAccuracy && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (fallbackErr) => {
            if (!mountedRef.current) return;
            setError(fallbackErr.code === 1 ? 'denied' : 'unavailable');
            setShowModal(true);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
        return;
      }
      setShowModal(true);
    }
  }, [highAccuracy, handleSuccess, onDenied]);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('unsupported');
      setShowModal(true);
      return;
    }

    setLoading(true);
    setError(null);
    setLocationLabel('Locating...');

    // Safety timeout
    const safetyTimeout = setTimeout(() => {
      if (mountedRef.current) {
        setLoading(false);
        if (!location) {
          setLocationLabel(null);
        }
      }
    }, timeout + 5000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(safetyTimeout);
        handleSuccess(pos);
      },
      (err) => {
        clearTimeout(safetyTimeout);
        handleError(err);
      },
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: maxAge }
    );
  }, [highAccuracy, timeout, maxAge, location, handleSuccess, handleError]);

  const dismissModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const retryFromModal = useCallback(() => {
    setShowModal(false);
    requestLocation();
  }, [requestLocation]);

  const clearLocation = useCallback(() => {
    setLocation(null);
    setLocationLabel(null);
    setError(null);
    try { localStorage.removeItem(GPS_STORAGE_KEY); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  }, []);

  return {
    // Location data
    location,
    locationLabel,
    loading,
    error,
    
    // Permission
    permissionState,
    deviceType,
    browserName,
    
    // Modal control
    showModal,
    dismissModal,
    retryFromModal,
    
    // Actions
    requestLocation,
    clearLocation,
    setLocation,
    setLocationLabel,
  };
}
