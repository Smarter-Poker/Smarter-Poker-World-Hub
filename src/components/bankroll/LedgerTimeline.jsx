/**
 * LEDGER TIMELINE
 * Displays chronological list of bankroll entries with edit/delete actions
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORY_COLORS = {
  poker_cash: '#22c55e',
  poker_mtt: '#eab308',
  casino_table: '#dc2626',
  slots: '#f97316',
  sports: '#f97316',
  expense: '#6b7280',
  trip_summary: '#3b82f6',
};

const CATEGORY_LABELS = {
  poker_cash: 'Poker Cash',
  poker_mtt: 'Tournament',
  casino_table: 'Table Game',
  slots: 'Slots',
  sports: 'Sports Bet',
  expense: 'Expense',
  trip_summary: 'Trip',
};

function CategoryIcon({ category }) {
  const color = CATEGORY_COLORS[category] || '#6b7280';

  const icons = {
    poker_cash: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" fill={color} />
        <circle cx="12" cy="12" r="5" fill={`${color}99`} />
        <circle cx="12" cy="12" r="2" fill={color} />
      </svg>
    ),
    poker_mtt: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 3L14.5 8H19L15.5 11.5L17 17L12 14L7 17L8.5 11.5L5 8H9.5L12 3Z" fill={color} />
      </svg>
    ),
    casino_table: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6" width="18" height="12" rx="2" fill={color} />
        <circle cx="8" cy="12" r="2" fill="#fff" />
        <circle cx="16" cy="12" r="2" fill="#fff" />
      </svg>
    ),
    slots: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="14" rx="2" fill={color} />
        <rect x="6" y="8" width="3" height="5" rx="1" fill="#fff" />
        <rect x="10.5" y="8" width="3" height="5" rx="1" fill="#fff" />
        <rect x="15" y="8" width="3" height="5" rx="1" fill="#fff" />
      </svg>
    ),
    sports: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" fill={color} stroke="#fff" strokeWidth="1" />
        <path d="M12 3C12 3 8 7 8 12C8 17 12 21 12 21" stroke="#fff" strokeWidth="1" />
        <path d="M12 3C12 3 16 7 16 12C16 17 12 21 12 21" stroke="#fff" strokeWidth="1" />
        <line x1="3" y1="12" x2="21" y2="12" stroke="#fff" strokeWidth="1" />
      </svg>
    ),
    expense: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 3L5 7V13C5 17 9 20 12 21C15 20 19 17 19 13V7L12 3Z" fill={color} />
        <path d="M9 12L11 14L15 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    trip_summary: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="8" width="16" height="10" rx="2" fill={color} />
        <path d="M8 8V6C8 4.9 8.9 4 10 4H14C15.1 4 16 4.9 16 6V8" stroke={color} strokeWidth="2" />
        <line x1="4" y1="13" x2="20" y2="13" stroke="#fff" strokeWidth="1.5" />
      </svg>
    ),
  };

  return icons[category] || icons.expense;
}

function formatDate(dateStr) {
  // Append T12:00:00 to avoid UTC midnight shifting to previous day in local timezone
  const safe = dateStr?.includes('T') ? dateStr : `${dateStr}T12:00:00`;
  const date = new Date(safe);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const hours = (end - start) / (1000 * 60 * 60);
  return `${hours.toFixed(1)} hrs`;
}

function EntryRow({ entry, index, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking anywhere outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const duration = formatDuration(entry.start_time, entry.end_time);

  // Build details string
  let details = '';
  if (entry.stakes) details = entry.stakes;
  else if (entry.casino_game) details = entry.casino_game;
  else if (entry.expense_type) details = entry.expense_type.replace('_', ' ');
  else if (entry.sport && entry.bet_type) details = `${entry.sport} ${entry.bet_type}`;
  else if (entry.tournament_name) details = entry.tournament_name;

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete?.(entry.id);
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      style={{ ...styles.entryRow, cursor: onEdit ? 'pointer' : 'default' }}
      onClick={() => onEdit?.(entry)}
    >
      <div style={styles.entryIcon}>
        <CategoryIcon category={entry.category} />
      </div>
      <div style={styles.entryContent}>
        <span style={styles.entryDate}>{formatDate(entry.entry_date)}:</span>
        <span style={styles.entryLabel}>
          {entry._isTripSummary ? entry._tripName : (CATEGORY_LABELS[entry.category] || entry.category)}
        </span>
        <span
          style={{
            ...styles.entryAmount,
            color: entry.net_result >= 0 ? '#22c55e' : '#ef4444',
          }}
        >
          {entry.net_result >= 0 ? '+' : '-'}${Math.abs(entry.net_result).toLocaleString()}
        </span>
        {entry._isTripSummary && (
          <span style={styles.entryDuration}>({entry._sessionCount} sessions)</span>
        )}
        {!entry._isTripSummary && duration && <span style={styles.entryDuration}>({duration})</span>}
        {entry.location_name && (
          <span style={styles.entryLocation}>at {entry.location_name}</span>
        )}
        {!entry._isTripSummary && details && !entry.location_name && (
          <span style={styles.entryDetails}>{details}</span>
        )}
      </div>
      {entry.emotional_tag && (
        <span
          style={{
            ...styles.emotionalTag,
            background:
              entry.emotional_tag === 'tilted'
                ? 'rgba(239, 68, 68, 0.2)'
                : entry.emotional_tag === 'confident'
                  ? 'rgba(34, 197, 94, 0.2)'
                  : 'rgba(255, 255, 255, 0.1)',
          }}
        >
          {entry.emotional_tag}
        </span>
      )}

      {/* Action Menu */}
      {(onEdit || onDelete) && (
        <div ref={menuRef} style={styles.actionContainer}>
          <button
            style={styles.menuButton}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); setConfirmDelete(false); }}
          >
            ⋯
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                style={styles.actionMenu}
                onClick={(e) => e.stopPropagation()}
              >
                {onEdit && (
                  <button
                    style={styles.actionItem}
                    onClick={() => { onEdit(entry); setMenuOpen(false); }}
                  >
                    ✏️ Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    style={{ ...styles.actionItem, color: confirmDelete ? '#fff' : '#ef4444', background: confirmDelete ? '#ef4444' : 'transparent' }}
                    onClick={handleDelete}
                  >
                    {confirmDelete ? '⚠️ Confirm Delete' : '🗑️ Delete'}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

export default function LedgerTimeline({ entries, isLoading, onEdit, onDelete }) {
  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={styles.loadingRow}>
            <div style={styles.loadingIcon} />
            <div style={styles.loadingContent}>
              <div style={styles.loadingText} />
              <div style={styles.loadingTextShort} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}></div>
        <p style={styles.emptyTitle}>No Entries Yet</p>
        <p style={styles.emptyText}>
          Start logging sessions to track your bankroll
        </p>
      </div>
    );
  }

  return (
    <div style={styles.timeline}>
      {entries.map((entry, index) => (
        <EntryRow key={entry.id} entry={entry} index={index} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}

const styles = {
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  entryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '2px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    transition: 'background 0.2s ease',
    position: 'relative',
  },
  entryIcon: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  entryContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  entryDate: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  entryLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
  },
  entryAmount: {
    fontSize: 14,
    fontWeight: 700,
  },
  entryDuration: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  entryLocation: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  entryDetails: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'capitalize',
  },
  emotionalTag: {
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 14,
    textTransform: 'capitalize',
    color: 'rgba(255, 255, 255, 0.7)',
    flexShrink: 0,
  },
  actionContainer: {
    position: 'relative',
    flexShrink: 0,
  },
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    letterSpacing: 2,
  },
  actionMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    background: '#1a2a44',
    border: '2px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    padding: 4,
    minWidth: 150,
    zIndex: 50,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  actionItem: {
    display: 'block',
    width: '100%',
    padding: '10px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.15s ease',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 10,
  },
  loadingIcon: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.05)',
    animation: 'pulse 1.5s infinite',
  },
  loadingContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  loadingText: {
    height: 14,
    width: '60%',
    borderRadius: 4,
    background: 'rgba(255, 255, 255, 0.05)',
    animation: 'pulse 1.5s infinite',
  },
  loadingTextShort: {
    height: 12,
    width: '40%',
    borderRadius: 4,
    background: 'rgba(255, 255, 255, 0.03)',
    animation: 'pulse 1.5s infinite',
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    margin: '0 0 8px',
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    margin: 0,
  },
};
