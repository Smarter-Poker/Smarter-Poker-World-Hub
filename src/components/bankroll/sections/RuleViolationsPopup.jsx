/* The Rule Violation Alert / Goal Reached popup raised after an entry is logged.

   Moved verbatim out of pages/hub/bankroll-manager.js in the 2026-11-28 page
   split. The page still owns every piece of state and every handler and
   passes in exactly the ones this view reads, so its behaviour, text,
   accessible names and test ids are unchanged. */

import { motion } from 'framer-motion';

export default function RuleViolationsPopup({
  ruleViolations, setRuleViolations, violationsScrim
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      {...violationsScrim}
    >
      <motion.div
        className="sd-panel"
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 30 }}
        transition={{ type: 'spring', damping: 20, stiffness: 250 }}
        style={{
          padding: '24px 28px',
          maxWidth: 420,
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%',
            background: ruleViolations.some(v => v.severity === 'high') ? 'rgba(239,68,68,0.2)' : ruleViolations.some(v => v.severity === 'info') ? 'rgba(34,197,94,0.2)' : 'rgba(86, 200, 221,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>
            {ruleViolations.some(v => v.severity === 'high') ? '!' : ruleViolations.some(v => v.severity === 'info') ? '!' : '!'}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>
              {ruleViolations.some(v => v.severity === 'info') ? 'Goal Reached!' : 'Rule Violation Alert'}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
              {ruleViolations.length} rule{ruleViolations.length > 1 ? 's' : ''} Triggered
            </p>
          </div>
        </div>

        {/* Violations List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {ruleViolations.map((v, i) => (
            <div key={i} style={{
              background: v.severity === 'high' ? 'rgba(239,68,68,0.08)' : v.severity === 'info' ? 'rgba(34,197,94,0.08)' : 'rgba(86, 200, 221,0.08)',
              border: `2px solid ${v.severity === 'high' ? 'rgba(239,68,68,0.25)' : v.severity === 'info' ? 'rgba(34,197,94,0.25)' : 'rgba(86, 200, 221,0.25)'}`,
              borderRadius: 10,
              padding: '12px 14px',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: v.severity === 'high' ? '#f87171' : v.severity === 'info' ? '#4ade80' : '#94e7ff', marginBottom: 4 }}>
                {v.rule}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                <span>Limit: {v.limit}</span>
                <span style={{ fontWeight: 600, color: v.severity === 'high' ? '#ef4444' : v.severity === 'info' ? '#22c55e' : '#56c8dd' }}>
                  Actual: {v.actual}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={() => setRuleViolations([])}
          style={{
            width: '100%',
            minHeight: 44,
            touchAction: 'manipulation',
            padding: '12px',
            background: 'rgba(255,255,255,0.08)',
            border: '2px solid rgba(255,255,255,0.15)',
            borderRadius: 10,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Got It
        </button>
      </motion.div>
    </motion.div>
  );
}
