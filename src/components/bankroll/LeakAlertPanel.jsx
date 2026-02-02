/**
 * LEAK ALERT PANEL
 * Displays assistant alerts for detected leaks and patterns
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLocationStats, getLocationAlerts } from '../../lib/bankroll/locationMemory';

const ALERT_ICONS = {
  venue: '◆',
  category: '●',
  stake: '▲',
  pattern: '◇',
  time: '◐',
  expense: '◈',
};

const ALERT_COLORS = {
  1: '#6b7280',
  2: '#3b82f6',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
};

function AlertItem({ alert }) {
  const color = ALERT_COLORS[alert.severity] || ALERT_COLORS[3];
  const icon = ALERT_ICONS[alert.type] || '●';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      style={styles.alertItem}
    >
      <span style={{ ...styles.alertIcon, color }}>{icon}</span>
      <div style={styles.alertContent}>
        <div style={styles.alertHeader}>
          <span style={styles.alertTitle}>{alert.title}</span>
          <span style={{ ...styles.alertValue, color }}>{alert.value}</span>
        </div>
        <span style={styles.alertMessage}>{alert.message}</span>
      </div>
    </motion.div>
  );
}

export default function LeakAlertPanel({ leakAnalysis, locationId, isLoading }) {
  const [locationAlerts, setLocationAlerts] = useState([]);

  // Convert leak analysis to display alerts
  const displayAlerts = leakAnalysis?.topLeaks?.map((leak) => ({
    id: leak.id,
    type: leak.type,
    severity: leak.severity,
    title: leak.title,
    value: leak.value,
    message: leak.message,
  })) || [];

  // Add any location-specific alerts
  const allAlerts = [...displayAlerts, ...locationAlerts];

  if (isLoading) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Assistant Alerts</h3>
        <div style={styles.loadingState}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={styles.loadingItem}>
              <div style={styles.loadingIcon} />
              <div style={styles.loadingText} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (allAlerts.length === 0) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Assistant Alerts</h3>
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>✓</span>
          <p style={styles.emptyText}>No active alerts</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Assistant Alerts</h3>
      <div style={styles.alertList}>
        <AnimatePresence>
          {allAlerts.map((alert, index) => (
            <AlertItem key={alert.id || index} alert={alert} />
          ))}
        </AnimatePresence>
      </div>

      {/* Recommendations */}
      {leakAnalysis?.recommendations?.length > 0 && (
        <div style={styles.recommendations}>
          <h4 style={styles.recTitle}>Recommendations</h4>
          <ul style={styles.recList}>
            {leakAnalysis.recommendations.slice(0, 2).map((rec, i) => (
              <li key={i} style={styles.recItem}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    marginBottom: 24,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 14,
    margin: 0,
  },
  alertList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 12,
  },
  alertItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  alertIcon: {
    fontSize: 12,
    marginTop: 2,
    flexShrink: 0,
  },
  alertContent: {
    flex: 1,
    minWidth: 0,
  },
  alertHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    flexWrap: 'wrap',
  },
  alertTitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  alertValue: {
    fontSize: 12,
    fontWeight: 700,
  },
  alertMessage: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    display: 'block',
    marginTop: 2,
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 12,
  },
  loadingItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  loadingIcon: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.1)',
  },
  loadingText: {
    height: 12,
    width: '70%',
    borderRadius: 4,
    background: 'rgba(255, 255, 255, 0.05)',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '16px 0',
    marginTop: 8,
  },
  emptyIcon: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
  },
  emptyText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    margin: 0,
  },
  recommendations: {
    marginTop: 16,
    padding: 12,
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  recTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.6)',
    margin: '0 0 8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  recList: {
    margin: 0,
    paddingLeft: 16,
  },
  recItem: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
  },
};
