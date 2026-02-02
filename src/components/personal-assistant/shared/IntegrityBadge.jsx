/**
 * IntegrityBadge — Shows the "Not Live Play" badge
 * Per Masterplan: Must be visible at all times in sandbox/leak finder
 */

export default function IntegrityBadge({ variant = 'default' }) {
  const messages = {
    default: 'Not Live Play - No Real-Time Advice',
    leakFinder: 'Post-Session Review Only',
    training: 'Training Mode Active',
  };

  return (
    <div style={styles.badge}>
      <span style={styles.icon}>&#128274;</span>
      {messages[variant] || messages.default}
    </div>
  );
}

const styles = {
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: 'rgba(100, 181, 246, 0.1)',
    border: '1px solid rgba(100, 181, 246, 0.3)',
    borderRadius: 6,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  icon: {
    fontSize: 12,
  },
};
