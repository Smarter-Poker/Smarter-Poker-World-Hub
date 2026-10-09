/**
 * Geofence Alert Banner — Bottom-of-screen venue proximity notification
 * Extracted from poker-near-me.js for bundle splitting
 * Shows when user is physically near a poker venue (GPS required)
 */

import React, { useState, useEffect } from 'react';
import {
  PokerNearMePanelShell,
  PokerNearMeConsoleIcon,
} from './PokerNearMeConsole';
import styles from './PokerNearMeHomeGameConsole.module.css';

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
  }, [venueKey]);

  if (!visible || !venue) return null;

  return (
    <div className={styles.geofencePosition}>
      <PokerNearMePanelShell
        as="aside"
        role="status"
        aria-live="polite"
        className={styles.geofencePanel}
        bodyClassName={styles.geofenceBody}
      >
        <div className={styles.geofenceContent}>
          <PokerNearMeConsoleIcon name="location" className={styles.geofenceIcon} />

          <div className={styles.geofenceCopy}>
            <p className="pnc-label">Poker Venue Nearby</p>
            <p className={`pnc-data-row__value ${styles.venueName}`}>{venue.name}</p>
          </div>

          <div className={styles.geofenceActions}>
            <button
              type="button"
              onClick={onCheckin}
              className={`${styles.paintedAction} ${styles.paintedActionPrimary} ${styles.geofenceAction}`}
            >
              Check In
            </button>
            <button
              type="button"
              onClick={onReview}
              className={`${styles.paintedAction} ${styles.geofenceAction}`}
            >
              Review
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              title="Dismiss"
              onClick={() => { setVisible(false); if (onDismiss) onDismiss(); }}
              className={styles.iconAction}
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <PokerNearMeConsoleIcon name="close" />
            </button>
          </div>
        </div>
      </PokerNearMePanelShell>
    </div>
  );
}
