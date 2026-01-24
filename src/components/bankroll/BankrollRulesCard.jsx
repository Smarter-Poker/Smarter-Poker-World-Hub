/**
 * BANKROLL RULES CARD
 * Displays user's active bankroll rules and thresholds
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { fetchBankrollRules, updateBankrollRule } from '../../lib/bankroll/bankrollSelectors';

const RULE_LABELS = {
  stop_loss_session: 'Stop Loss (Session)',
  stop_loss_day: 'Stop Loss (Day)',
  stop_loss_month: 'Stop Loss (Month)',
  max_buyin_percent: 'Max Buy-In',
  max_mtt_percent: 'Max MTT Buy-In',
  shot_take_threshold: 'Shot-Take Threshold',
  win_goal_session: 'Win Goal (Session)',
  time_limit_session: 'Time Limit',
};

const RULE_FORMATS = {
  stop_loss_session: (v) => `$${v.toLocaleString()} / session`,
  stop_loss_day: (v) => `$${v.toLocaleString()} / day`,
  stop_loss_month: (v) => `$${v.toLocaleString()} / month`,
  max_buyin_percent: (v) => `${v}% of bankroll`,
  max_mtt_percent: (v) => `${v}% of bankroll`,
  shot_take_threshold: (v) => `${v} buy-ins`,
  win_goal_session: (v) => `$${v.toLocaleString()} / session`,
  time_limit_session: (v) => `${v} hours`,
};

function RuleItem({ rule, onToggle }) {
  const label = RULE_LABELS[rule.rule_type] || rule.rule_type;
  const value = RULE_FORMATS[rule.rule_type]
    ? RULE_FORMATS[rule.rule_type](rule.value)
    : `$${rule.value}`;

  return (
    <div style={styles.ruleItem}>
      <span
        style={{
          ...styles.ruleIndicator,
          color: rule.is_strict ? '#ef4444' : '#00D4FF',
        }}
      >
        {rule.is_strict ? '●' : '○'}
      </span>
      <span style={styles.ruleLabel}>{label}:</span>
      <span style={styles.ruleValue}>{value}</span>
    </div>
  );
}

export default function BankrollRulesCard({ userId }) {
  const [rules, setRules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    loadRules();
  }, [userId]);

  const loadRules = async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const data = await fetchBankrollRules(userId);
      setRules(data);
    } catch (error) {
      console.error('Error loading rules:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Bankroll Rules</h3>
        <div style={styles.loadingState}>
          {[1, 2].map((i) => (
            <div key={i} style={styles.loadingItem}>
              <div style={styles.loadingDot} />
              <div style={styles.loadingText} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Bankroll Rules</h3>
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No rules configured</p>
          <button style={styles.addButton}>+ Add Rule</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Bankroll Rules</h3>
      </div>
      <div style={styles.ruleList}>
        {rules.map((rule) => (
          <RuleItem key={rule.id} rule={rule} />
        ))}
      </div>
      <div style={styles.legend}>
        <span style={styles.legendItem}>
          <span style={{ color: '#00D4FF' }}>○</span> Advisory
        </span>
        <span style={styles.legendItem}>
          <span style={{ color: '#ef4444' }}>●</span> Strict
        </span>
      </div>
    </div>
  );
}

const styles = {
  container: {
    marginBottom: 24,
    padding: 16,
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    margin: 0,
  },
  ruleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  ruleItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
  },
  ruleIndicator: {
    fontSize: 10,
    flexShrink: 0,
  },
  ruleLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  ruleValue: {
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    marginLeft: 'auto',
  },
  legend: {
    display: 'flex',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
  legendItem: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
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
    gap: 8,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.1)',
  },
  loadingText: {
    height: 12,
    width: '100%',
    borderRadius: 4,
    background: 'rgba(255, 255, 255, 0.05)',
  },
  emptyState: {
    padding: '12px 0',
  },
  emptyText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    margin: '0 0 12px',
  },
  addButton: {
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    cursor: 'pointer',
  },
};
