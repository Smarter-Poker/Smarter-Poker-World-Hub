/**
 * BANKROLL RULES CARD
 * Displays pre-made + custom bankroll rules that users can toggle on/off
 * Includes "Add Custom Rule" functionality
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
  const [rules, setRules] = useState({}); // { rule_type: { id, value, is_active, label, description, unit } }
  const [customRules, setCustomRules] = useState([]); // custom rules from DB
  const [isLoading, setIsLoading] = useState(true);
  const [editingRule, setEditingRule] = useState(null);
  const [editValue, setEditValue] = useState('');

  // "Add Custom Rule" form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newUnit, setNewUnit] = useState('$');
  const [isSaving, setIsSaving] = useState(false);

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
      const customs = [];
      (data || []).forEach(r => {
        if (r.rule_type?.startsWith('custom_')) {
          customs.push(r);
        } else {
          ruleMap[r.rule_type] = r;
        }
      });
      setRules(ruleMap);
      setCustomRules(customs);
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

  const handleToggleCustom = async (customRule) => {
    try {
      const newActive = !customRule.is_active;
      const { error } = await supabase
        .from('bankroll_rules')
        .update({ is_active: newActive, updated_at: new Date().toISOString() })
        .eq('id', customRule.id);
      if (error) throw error;
      setCustomRules(prev => prev.map(r =>
        r.id === customRule.id ? { ...r, is_active: newActive } : r
      ));
      toast.success(newActive ? 'Rule enabled' : 'Rule disabled');
    } catch (err) {
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

  const handleSaveCustomValue = async (customRule) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val <= 0) {
      toast.error('Enter a valid number');
      return;
    }
    try {
      const { error } = await supabase
        .from('bankroll_rules')
        .update({ value: val, updated_at: new Date().toISOString() })
        .eq('id', customRule.id);
      if (error) throw error;
      setCustomRules(prev => prev.map(r =>
        r.id === customRule.id ? { ...r, value: val } : r
      ));
      toast.success('Value updated');
      setEditingRule(null);
      setEditValue('');
    } catch (err) {
      toast.error('Failed to save');
    }
  };

  const handleAddCustomRule = async () => {
    if (!newLabel.trim()) {
      toast.error('Rule name is required');
      return;
    }
    const val = parseFloat(newValue);
    if (isNaN(val) || val <= 0) {
      toast.error('Enter a valid threshold value');
      return;
    }
    setIsSaving(true);
    try {
      const ruleType = `custom_${Date.now()}`;
      const { data, error } = await supabase
        .from('bankroll_rules')
        .insert({
          user_id: userId,
          rule_type: ruleType,
          value: val,
          is_active: true,
          is_strict: false,
          label: newLabel.trim(),
          description: newDescription.trim() || null,
          unit: newUnit,
        })
        .select()
        .single();
      if (error) throw error;
      setCustomRules(prev => [...prev, data]);
      setNewLabel('');
      setNewDescription('');
      setNewValue('');
      setNewUnit('$');
      setShowAddForm(false);
      toast.success('Custom rule created!');
    } catch (err) {
      console.error('[BankrollRules] Add custom error:', err);
      toast.error('Failed to create rule');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCustom = async (customRule) => {
    try {
      const { error } = await supabase
        .from('bankroll_rules')
        .delete()
        .eq('id', customRule.id);
      if (error) throw error;
      setCustomRules(prev => prev.filter(r => r.id !== customRule.id));
      toast.success('Rule deleted');
    } catch (err) {
      toast.error('Failed to delete rule');
    }
  };

  const formatCustomValue = (rule) => {
    const u = rule.unit || '$';
    if (u === '%') return `${rule.value}%`;
    if (u === 'hrs') return `${rule.value} hrs`;
    return `$${Number(rule.value).toLocaleString()}`;
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

        {/* Custom Rules */}
        {customRules.length > 0 && (
          <>
            <div style={{ margin: '12px 0 4px', borderTop: '1px solid #4a4b4c', paddingTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#b0b3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Custom Rules</span>
            </div>
            {customRules.map((cr) => {
              const isEditing = editingRule === cr.id;
              return (
                <div key={cr.id} style={{
                  ...styles.ruleItem,
                  opacity: cr.is_active ? 1 : 0.5,
                }}>
                  <div style={styles.ruleTop}>
                    <div style={styles.ruleInfo}>
                      <span style={styles.ruleLabel}>{cr.label || cr.rule_type}</span>
                      {cr.description && <span style={styles.ruleDesc}>{cr.description}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => handleDeleteCustom(cr)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer', padding: '2px 4px' }}
                        title="Delete Rule"
                      >
                        🗑
                      </button>
                      <button
                        onClick={() => handleToggleCustom(cr)}
                        style={{
                          ...styles.toggle,
                          background: cr.is_active ? '#2374e1' : 'rgba(255,255,255,0.1)',
                        }}
                      >
                        <div style={{
                          ...styles.toggleKnob,
                          transform: cr.is_active ? 'translateX(16px)' : 'translateX(0)',
                        }} />
                      </button>
                    </div>
                  </div>
                  {cr.is_active && (
                    <div style={styles.ruleValueRow}>
                      {isEditing ? (
                        <div style={styles.editRow}>
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            style={styles.editInput}
                            autoFocus
                            placeholder={String(cr.value)}
                          />
                          <span style={styles.editUnit}>{cr.unit || '$'}</span>
                          <button style={styles.saveBtn} onClick={() => handleSaveCustomValue(cr)}>Save</button>
                          <button style={styles.cancelBtn} onClick={() => { setEditingRule(null); setEditValue(''); }}>✕</button>
                        </div>
                      ) : (
                        <button
                          style={styles.valueBtn}
                          onClick={() => { setEditingRule(cr.id); setEditValue(String(cr.value)); }}
                        >
                          {formatCustomValue(cr)} ✎
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Add Custom Rule Button / Form */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          style={styles.addRuleBtn}
        >
          + Add Custom Rule
        </button>
      ) : (
        <div style={styles.addForm}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e4e6eb' }}>New Custom Rule</span>
            <button
              onClick={() => { setShowAddForm(false); setNewLabel(''); setNewDescription(''); setNewValue(''); setNewUnit('$'); }}
              style={{ background: 'none', border: 'none', color: '#b0b3b8', fontSize: 16, cursor: 'pointer' }}
            >✕</button>
          </div>
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Rule Name (e.g. Weekly Loss Limit)"
            style={styles.formInput}
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            style={{ ...styles.formInput, marginTop: 8 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              type="number"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Threshold Value"
              style={{ ...styles.formInput, flex: 1 }}
            />
            <select
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              style={styles.formSelect}
            >
              <option value="$">$</option>
              <option value="%">%</option>
              <option value="hrs">Hours</option>
            </select>
          </div>
          <button
            onClick={handleAddCustomRule}
            disabled={isSaving}
            style={{
              ...styles.saveBtn,
              width: '100%',
              marginTop: 12,
              padding: '10px 16px',
              fontSize: 13,
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {isSaving ? 'Saving...' : 'Create Rule'}
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    marginBottom: 24,
    padding: 16,
    background: '#242526',
    border: '1px solid #3a3b3c',
    borderRadius: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#e4e6eb',
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: 11,
    color: '#b0b3b8',
    margin: '0 0 14px',
  },
  ruleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  ruleItem: {
    padding: 12,
    background: '#3a3b3c',
    borderRadius: 8,
    border: '1px solid #4a4b4c',
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
    color: '#e4e6eb',
  },
  ruleDesc: {
    fontSize: 10,
    color: '#b0b3b8',
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
    borderTop: '1px solid #4a4b4c',
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
    background: '#18191a',
    border: '1px solid #4a4b4c',
    borderRadius: 4,
    color: '#e4e6eb',
    fontSize: 13,
  },
  editUnit: {
    fontSize: 11,
    color: '#b0b3b8',
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
    color: '#b0b3b8',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 4px',
  },
  addRuleBtn: {
    width: '100%',
    marginTop: 12,
    padding: '12px 16px',
    background: 'transparent',
    border: '1px dashed #4a4b4c',
    borderRadius: 8,
    color: '#2374e1',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  },
  addForm: {
    marginTop: 12,
    padding: 14,
    background: '#3a3b3c',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8,
    outline: '3px solid rgba(255,255,255,0.3)',
    outlineOffset: '2px',
  },
  formInput: {
    width: '100%',
    padding: '10px 12px',
    background: '#18191a',
    border: '1px solid #4a4b4c',
    borderRadius: 6,
    color: '#e4e6eb',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  formSelect: {
    padding: '10px 12px',
    background: '#18191a',
    border: '1px solid #4a4b4c',
    borderRadius: 6,
    color: '#e4e6eb',
    fontSize: 13,
    outline: 'none',
    minWidth: 80,
  },
};
