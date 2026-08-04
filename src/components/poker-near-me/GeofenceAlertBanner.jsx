/**
 * Geofence Alert Banner — Bottom-of-screen venue proximity notification
 * Extracted from poker-near-me.js for bundle splitting
 * Shows when user is physically near a poker venue (GPS required)
 */

import React, { useState, useEffect } from 'react';

const GEOFENCE_ALERT_TIMEOUT_MS = 30000;

export default function GeofenceAlertBanner({ venue, onCheckin, onReview, onDismiss }) {
  const [visible, setVisible] = useState(true);
  // BUG FIX: this used to be `venue?.id ?? null`, and the effect below bailed out when
  // it was falsy. Both call sites can pass a SOCIAL-PAGE geofence target (they branch on
  // is_social_page / social_page_id), and such a record may carry no `id` at all — so no
  // auto-dismiss timer was ever armed and this fixed, full-width, z-index 9999 banner
  // covered the bottom of the screen indefinitely until manually dismissed.
  const venueKey = venue ? (venue.id ?? venue.social_page_id ?? venue.name ?? 'venue') : null;

  // `visible` is also re-armed here: it was only ever flipped to false (dismiss / 30s
  // timeout) and never reset, so once the first alert expired the banner stayed null
  // forever — driving into range of a different venue rendered nothing.
  useEffect(() => {
    if (!venueKey) return undefined;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      if (onDismiss) onDismiss();
    }, GEOFENCE_ALERT_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueKey]);

  if (!visible || !venue) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      padding: '0 16px 16px',
      pointerEvents: 'none',
    }}>
      <div style={{
        maxWidth: 560,
        margin: '0 auto',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(212, 168, 83, 0.4)',
        borderRadius: 14,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
        pointerEvents: 'auto',
      }}>
        {/* Venue icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', marginBottom: 2 }}>
            You are near a poker venue!
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {venue.name}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onCheckin} style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'linear-gradient(135deg, #ffffff, #cbd5e1)',
            border: 'none', color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Check In</button>
          <button onClick={onReview} style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>Review</button>
          <button onClick={() => { setVisible(false); if (onDismiss) onDismiss(); }} style={{
            padding: '6px', borderRadius: 6,
            background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
