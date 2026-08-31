import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/router';

export default function ReviewHandModal({ initialData, onSave, onCancel }) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    game_type: initialData?.game_type || 'NLH',
    stakes: initialData?.stakes || '',
    pot_size: initialData?.pot_size || '',
    hero_cards: Array.isArray(initialData?.hero_cards) ? initialData.hero_cards.join(', ') : '',
    board: [
      ...(initialData?.board?.flop || []),
      initialData?.board?.turn,
      initialData?.board?.river
    ].filter(Boolean).join(', '),
    result: initialData?.result || '',
    amount: initialData?.amount_won_lost || '',
    notes: initialData?.notes || ''
  });

  const handleChange = (field, val) => setFormData(prev => ({ ...prev, [field]: val }));

  const handleAnalyze = () => {
    // Navigate to Personal Assistant and pass JSON string safely
    const payload = btoa(JSON.stringify(initialData));
    router.push(`/hub/personal-assistant?handPayload=${payload}`);
  };

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5,5,10,0.95)', zIndex: 99999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        style={{
        background: '#18191a', border: '1px solid #3E4042', borderRadius: 12,
        width: '90%', maxWidth: 460, padding: 24, paddingBottom: 16,
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 800 }}>Review AI Data</h2>
          <div style={{
            background: `rgba(${initialData?.confidence_score > 80 ? '74, 222, 128' : '239, 68, 68'}, 0.1)`,
            color: initialData?.confidence_score > 80 ? '#4ade80' : '#ef4444',
            padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700
          }}>
            Confidence: {initialData?.confidence_score || 'N/A'}%
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: '#B0B3B8', fontWeight: 600 }}>Stakes</label>
            <input type="text" value={formData.stakes} onChange={e => handleChange('stakes', e.target.value)}
              style={{ width: '100%', background: '#0a0a0a', border: '1px solid #3E4042', color: '#fff', padding: 8, borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#B0B3B8', fontWeight: 600 }}>Pot Size</label>
            <input type="text" value={formData.pot_size} onChange={e => handleChange('pot_size', e.target.value)}
              style={{ width: '100%', background: '#0a0a0a', border: '1px solid #3E4042', color: '#fff', padding: 8, borderRadius: 6 }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#B0B3B8', fontWeight: 600 }}>Your Cards</label>
          <input type="text" value={formData.hero_cards} onChange={e => handleChange('hero_cards', e.target.value)}
            style={{ width: '100%', background: '#0a0a0a', border: '1px solid #3E4042', color: '#fff', padding: 8, borderRadius: 6 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#B0B3B8', fontWeight: 600 }}>Board Cards</label>
          <input type="text" value={formData.board} onChange={e => handleChange('board', e.target.value)}
            style={{ width: '100%', background: '#0a0a0a', border: '1px solid #3E4042', color: '#fff', padding: 8, borderRadius: 6 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: '#B0B3B8', fontWeight: 600 }}>Net Result</label>
            <input type="text" value={formData.amount} onChange={e => handleChange('amount', e.target.value)}
              style={{ width: '100%', background: '#0a0a0a', border: '1px solid #3E4042', color: '#fff', padding: 8, borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#B0B3B8', fontWeight: 600 }}>Context</label>
            <input type="text" value={formData.notes} onChange={e => handleChange('notes', e.target.value)}
              style={{ width: '100%', background: '#0a0a0a', border: '1px solid #3E4042', color: '#fff', padding: 8, borderRadius: 6 }} />
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid #3E4042', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Discard
            </button>
            <button onClick={handleSave} style={{ flex: 1, padding: 12, background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 800 }}>
              Confirm & Save
            </button>
          </div>
          
          <button onClick={handleAnalyze} style={{ width: '100%', padding: 12, background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 800, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Analyze With Jarvis
          </button>
        </div>
      </motion.div>
    </div>
  );
}
