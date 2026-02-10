/**
 * BANKROLL RULES CARD
 * Displays pre-made bankroll rules that users can toggle on/off
 * NO default rules — all rules start disabled until user enables them
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';

const PREMADE_RULES = [
  {
    rule_type: 'stop_loss_session',
    label: 'Session Stop-Loss',
    description: 'Alert when session loss exceeds this amount',
    defaultValue: 500,
    format: (v) => `$${v.toLocaleString()}`,
    unit: '$',
  },
  {
    rule_type: 'stop_loss_day',
    label: 'Daily Stop-Loss',
    description: 'Alert when total daily loss exceeds this amount',
    defaultValue: 1000,
    format: (v) => `$${v.toLocaleString()}`,
    unit: '$',
  },
  {
    rule_type: 'max_buyin_percent',
    label: 'Max Buy-In %',
    description: 'Alert when a single buy-in exceeds this % of bankroll',
    defaultValue: 5,
    format: (v) => `${v}%`,
    unit: '%',
  },
  {
    rule_type: 'win_goal_session',
    label: 'Session Win Goal',
    description: 'Notify when session profit reaches this amount',
    defaultValue: 1000,
    format: (v) => `$${v.toLocaleString()}`,
    unit: '$',
  },
  {
    rule_type: 'stop_loss_month',
    label: 'Monthly Stop-Loss',
    description: 'Alert when monthly loss exceeds this amount',
    defaultValue: 5000,
    format: (v) => `$${v.toLocaleString()}`,
    unit: '$',
  },
  {
    rule_type: 'time_limit_session',
    label: 'Session Time Limit',
    description: 'Alert when session exceeds this many hours',
    defaultValue: 8,
    format: (v) => `${v} hrs`,
    unit: 'hrs',
  },
];

export default function BankrollRulesCard({ userId }) {
  const [rules, setRules] = useState({}); // { rule_type: { id, value, is_active } }
  const [isLoading, setIsLoading] = useState(true);
  const [editingRule, setEditingRule] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadRules();
  }, [userId]);

  const loadRules = async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('bankroll_rules')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      const ruleMap = {};
      (data || []).forEach(r => {
        ruleMap[r.rule_type] = r;
      });
      setRules(ruleMap);
    } catch (err) {
      // Table may not exist
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (premadeRule) => {
    const existing = rules[premadeRule.rule_type];
    try {
      if (existing) {
        // Toggle is_active
        const newActive = !existing.is_active;
        const { error } = await supabase
          .from('bankroll_rules')
          .update({ is_active: newActive, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
        setRules(prev => ({
          ...prev,
          [premadeRule.rule_type]: { ...existing, is_active: newActive },
        }));
        toast.success(newActive ? `${premadeRule.label} enabled` : `${premadeRule.label} disabled`);
      } else {
        // Create new rule (enabled)
        const { data, error } = await supabase
          .from('bankroll_rules')
          .insert({
            user_id: userId,
            rule_type: premadeRule.rule_type,
            value: premadeRule.defaultValue,
            is_active: true,
            is_strict: false,
          })
          .select()
          .single();
        if (error) throw error;
        setRules(prev => ({ ...prev, [premadeRule.rule_type]: data }));
        toast.success(`${premadeRule.label} enabled`);
      }
    } catch (err) {
      console.error('[BankrollRules] Toggle error:', err);
      toast.error('Failed to update rule');
    }
  };

  const handleSaveValue = async (premadeRule) => {
    const existing = rules[premadeRule.rule_type];
    const newValue = parseFloat(editValue);
    if (isNaN(newValue) || newValue <= 0) {
      toast.error('Enter a valid number');
      return;
    }
    try {
      if (existing) {
        const { error } = await supabase
          .from('bankroll_rules')
          .update({ value: newValue, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
        setRules(prev => ({
          ...prev,
          [premadeRule.rule_type]: { ...existing, value: newValue },
        }));
      } else {
        const { data, error } = await supabase
          .from('bankroll_rules')
          .insert({
            user_id: userId,
            rule_type: premadeRule.rule_type,
            value: newValue,
            is_active: true,
            is_strict: false,
          })
          .select()
          .single();
        if (error) throw error;
        setRules(prev => ({ ...prev, [premadeRule.rule_type]: data }));
      }
      toast.success('Value updated');
      setEditingRule(null);
      setEditValue('');
    } catch (err) {
      toast.error('Failed to save');
    }
  };

  if (isLoading) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Bankroll Rules</h3>
        <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
          Loading rules...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Bankroll Rules</h3>
      <p style={styles.subtitle}>Toggle rules on or off. Tap the value to customize.</p>
      <div style={styles.ruleList}>
        {PREMADE_RULES.map((premade) => {
          const existing = rules[premade.rule_type];
          const isActive = existing?.is_active || false;
          const currentValue = existing?.value || premade.defaultValue;
          const isEditing = editingRule === premade.rule_type;

          return (
            <div key={premade.rule_type} style={{
              ...styles.ruleItem,
              opacity: isActive ? 1 : 0.5,
            }}>
              <div style={styles.ruleTop}>
                <div style={styles.ruleInfo}>
                  <span style={styles.ruleLabel}>{premade.label}</span>
                  <span style={styles.ruleDesc}>{premade.description}</span>
                </div>
                <button
                  onClick={() => handleToggle(premade)}
                  style={{
                    ...styles.toggle,
                    background: isActive ? '#2374e1' : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <div style={{
                    ...styles.toggleKnob,
                    transform: isActive ? 'translateX(16px)' : 'translateX(0)',
                  }} />
                </button>
              </div>
              {isActive && (
                <div style={styles.ruleValueRow}>
                  {isEditing ? (
                    <div style={styles.editRow}>
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={styles.editInput}
                        autoFocus
                        placeholder={String(currentValue)}
                      />
                      <span style={styles.editUnit}>{premade.unit}</span>
                      <button style={styles.saveBtn} onClick={() => handleSaveValue(premade)}>Save</button>
                      <button style={styles.cancelBtn} onClick={() => { setEditingRule(null); setEditValue(''); }}>✕</button>
                    </div>
                  ) : (
                    <button
                      style={styles.valueBtn}
                      onClick={() => { setEditingRule(premade.rule_type); setEditValue(String(currentValue)); }}
                    >
                      {premade.format(currentValue)} ✎
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    marginBottom: 24,
    padding: 16,
    background: 'linear-gradient(135deg, rgba(0,30,60,0.95), rgba(0,20,40,0.9))',
    border: '1px solid rgba(0,212,255,0.2)',
    borderRadius: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#2374e1',
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    margin: '0 0 14px',
  },
  ruleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  ruleItem: {
    padding: 12,
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.06)',
    transition: 'opacity 0.2s',
  },
  ruleTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ruleInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    marginRight: 12,
  },
  ruleLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
  },
  ruleDesc: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    border: 'none',
    padding: 3,
    cursor: 'pointer',
    position: 'relative',
    flexShrink: 0,
    transition: 'background 0.2s',
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 0.2s',
  },
  ruleValueRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  valueBtn: {
    background: 'none',
    border: 'none',
    color: '#2374e1',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
  },
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  editInput: {
    width: 80,
    padding: '4px 8px',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 4,
    color: '#fff',
    fontSize: 13,
  },
  editUnit: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  saveBtn: {
    padding: '4px 10px',
    background: '#2374e1',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  cancelBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 4px',
  },
};
