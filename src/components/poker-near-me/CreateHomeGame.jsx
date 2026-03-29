/**
 * CreateHomeGame.jsx — List Your Home Game
 *
 * Simple form to create a home game listing visible in PNM search.
 * Submits to /api/poker/venues with venue_type='home_game'.
 * Requires authenticated user.
 */

import React, { useState, useCallback } from 'react';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
];

const GAME_TYPES = ['NLH', 'PLO', 'Mixed', 'Stud', 'HORSE', 'Cash + Tournament'];
const SCHEDULE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function CreateHomeGame({ userId, onSuccess, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    city: '',
    state: '',
    gameType: 'NLH',
    stakes: '',
    scheduleDays: [],
    startTime: '19:00',
    description: '',
    maxPlayers: '9',
    contactMethod: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleDay = (day) => {
    setForm(prev => ({
      ...prev,
      scheduleDays: prev.scheduleDays.includes(day)
        ? prev.scheduleDays.filter(d => d !== day)
        : [...prev.scheduleDays, day]
    }));
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!userId) { setError('Please log in to list a home game.'); return; }
    if (!form.name.trim()) { setError('Game name is required.'); return; }
    if (!form.city.trim()) { setError('City is required.'); return; }
    if (!form.state) { setError('State is required.'); return; }

    setSubmitting(true);
    setError(null);

    try {
      // Use the Supabase client to insert directly into poker_venues
      const { createClient } = await import('../../../src/lib/supabase');
      const supabase = (await import('../../../src/lib/supabase')).supabase;
      
      const { data, error: dbError } = await supabase
        .from('poker_venues')
        .insert([{
          name: form.name.trim(),
          city: form.city.trim(),
          state: form.state,
          venue_type: 'home_game',
          games_offered: [form.gameType],
          stakes_cash: form.stakes ? [form.stakes] : [],
          about: form.description || `Home game in ${form.city}, ${form.state}. ${form.gameType} - ${form.stakes || 'Various stakes'}. Schedule: ${form.scheduleDays.join(', ') || 'Contact for details'}. Start time: ${form.startTime}. Max ${form.maxPlayers} players.`,
          poker_tables: parseInt(form.maxPlayers, 10) > 0 ? 1 : 1,
          is_active: true,
          is_featured: false,
          has_tournaments: false,
          trust_score: 3.0,
          owner_id: userId,
          hours_weekday: form.startTime,
          hours_weekend: form.startTime,
          metadata: {
            source: 'user_submitted',
            game_type: form.gameType,
            stakes: form.stakes,
            schedule_days: form.scheduleDays,
            start_time: form.startTime,
            max_players: form.maxPlayers,
            contact_method: form.contactMethod,
            created_by: userId,
            created_at: new Date().toISOString(),
          },
        }])
        .select();

      if (dbError) throw dbError;
      
      setSuccess(true);
      setTimeout(() => onSuccess?.(data?.[0]), 1500);
    } catch (err) {
      console.error('Failed to create home game:', err);
      setError(err.message || 'Failed to list home game. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, userId, onSuccess]);

  if (success) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 24px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: '#22c55e', marginBottom: 8 }}>
          Home Game Listed
        </h3>
        <p style={{ fontSize: 14, color: 'rgba(200,214,229,0.6)' }}>
          Your game is now visible to players searching in {form.city}, {form.state}.
        </p>
      </div>
    );
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(110,231,239,0.04)',
    border: '1px solid rgba(110,231,239,0.15)',
    borderRadius: 10, color: '#e0e8f0',
    fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif',
    outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: 'rgba(200,214,229,0.6)', marginBottom: 6,
    letterSpacing: '0.02em',
  };

  return (
    <form onSubmit={handleSubmit} style={{
      padding: '20px 16px',
      fontFamily: 'Inter, system-ui, sans-serif',
      maxWidth: 500, margin: '0 auto',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05))',
          border: '1px solid rgba(34,197,94,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#e0e8f0', margin: 0 }}>
            List Your Home Game
          </h3>
          <p style={{ fontSize: 12, color: 'rgba(200,214,229,0.45)', margin: 0 }}>
            Visible to players searching nearby
          </p>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 16,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 10, color: '#f87171',
          fontSize: 13, fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {/* Game Name */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Game Name *</label>
        <input
          type="text"
          placeholder="e.g., Friday Night Poker"
          value={form.name}
          onChange={e => updateField('name', e.target.value)}
          style={inputStyle}
          required
        />
      </div>

      {/* City + State */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>City *</label>
          <input
            type="text"
            placeholder="e.g., Austin"
            value={form.city}
            onChange={e => updateField('city', e.target.value)}
            style={inputStyle}
            required
          />
        </div>
        <div>
          <label style={labelStyle}>State *</label>
          <select
            value={form.state}
            onChange={e => updateField('state', e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            required
          >
            <option value="">Select</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Game Type + Stakes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Game Type</label>
          <select
            value={form.gameType}
            onChange={e => updateField('gameType', e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {GAME_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Stakes</label>
          <input
            type="text"
            placeholder="e.g., $1/$2"
            value={form.stakes}
            onChange={e => updateField('stakes', e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Schedule Days */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Schedule Days</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SCHEDULE_DAYS.map(day => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              style={{
                padding: '6px 12px', borderRadius: 8,
                border: form.scheduleDays.includes(day)
                  ? '1px solid rgba(110,231,239,0.5)'
                  : '1px solid rgba(110,231,239,0.12)',
                background: form.scheduleDays.includes(day)
                  ? 'rgba(110,231,239,0.12)'
                  : 'transparent',
                color: form.scheduleDays.includes(day)
                  ? '#6ee7ef'
                  : 'rgba(200,214,229,0.4)',
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Start Time + Max Players */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Start Time</label>
          <input
            type="time"
            value={form.startTime}
            onChange={e => updateField('startTime', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Max Players</label>
          <input
            type="number"
            min="2" max="20"
            value={form.maxPlayers}
            onChange={e => updateField('maxPlayers', e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Contact */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Contact Method (optional)</label>
        <input
          type="text"
          placeholder="e.g., DM on Smarter.Poker or text 555-1234"
          value={form.contactMethod}
          onChange={e => updateField('contactMethod', e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Description */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Description (optional)</label>
        <textarea
          placeholder="Tell players about your game — house rules, buy-in range, food/drink situation..."
          value={form.description}
          onChange={e => updateField('description', e.target.value)}
          style={{
            ...inputStyle,
            minHeight: 80, resize: 'vertical',
          }}
        />
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 12 }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px',
              border: '1px solid rgba(200,214,229,0.15)',
              borderRadius: 12, background: 'transparent',
              color: 'rgba(200,214,229,0.5)',
              fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={{
            flex: 2, padding: '12px',
            border: 'none', borderRadius: 12,
            background: submitting
              ? 'rgba(34,197,94,0.15)'
              : 'linear-gradient(135deg, #22c55e, #16a34a)',
            color: submitting ? 'rgba(200,214,229,0.4)' : '#fff',
            fontSize: 14, fontWeight: 700,
            cursor: submitting ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: submitting ? 'none' : '0 4px 16px rgba(34,197,94,0.3)',
            transition: 'all 0.2s',
          }}
        >
          {submitting ? 'Listing...' : 'List Home Game'}
        </button>
      </div>
    </form>
  );
}
