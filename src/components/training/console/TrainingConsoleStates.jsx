import styles from '../../../styles/training/training-console-states.module.css';

/**
 * #SMARTERDESIGN loading skeleton for Training pages: steel-rimmed navy
 * panels with a quiet sweep, announced once as a status region.
 */
export function TrainingConsoleSkeleton({ label = 'Loading', metrics = 0, panels = 2, rows = 3 }) {
  return (
    <div className={styles.stack} role="status" aria-label={label} aria-busy="true">
      <p className={styles.label}>{label}</p>
      {metrics > 0 && (
        <div className={styles.metrics} style={{ '--cols': metrics % 3 === 0 ? 3 : Math.min(metrics, 2) }}>
          {Array.from({ length: metrics }).map((_, i) => (
            <div key={i} className={styles.panel} aria-hidden="true">
              <span className={`${styles.bar} ${styles.barTall}`} style={{ '--w': '46%' }} />
              <span className={styles.bar} style={{ '--w': '72%' }} />
            </div>
          ))}
        </div>
      )}
      {Array.from({ length: panels }).map((_, i) => (
        <div key={i} className={styles.panel} aria-hidden="true">
          <span className={`${styles.bar} ${styles.barTall}`} style={{ '--w': '58%' }} />
          {Array.from({ length: rows }).map((__, j) => (
            <span key={j} className={styles.bar} style={{ '--w': j % 3 === 0 ? '100%' : j % 3 === 1 ? '84%' : '64%' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A single steel status panel (signed out, unavailable, empty). */
export function TrainingConsoleStatus({ title, message, actionLabel, onAction, role = 'status' }) {
  return (
    <div className={`${styles.panel} ${styles.statusPanel}`} role={role}>
      <h2 className={styles.statusTitle}>{title}</h2>
      {message && <p className={styles.statusCopy}>{message}</p>}
      {actionLabel && onAction && (
        <button type="button" className={`sd-button sd-primary ${styles.action}`} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
