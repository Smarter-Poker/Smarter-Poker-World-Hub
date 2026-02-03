/**
 * ReportGameModal - Report a live game at a venue
 * Allows players to report games running at poker venues
 */

import { useState } from 'react';

const GAME_TYPES = [
    { value: 'nlh', label: 'No-Limit Hold\'em' },
    { value: 'plo', label: 'Pot-Limit Omaha' },
    { value: 'plo8', label: 'PLO Hi-Lo' },
    { value: 'mixed', label: 'Mixed Games' },
    { value: 'stud', label: 'Seven Card Stud' },
    { value: 'omaha', label: 'Limit Omaha' },
    { value: 'other', label: 'Other' }
];

const COMMON_STAKES = [
    '1/2', '1/3', '2/5', '5/10', '10/20', '10/25', '25/50', '50/100'
];

const GAME_QUALITY = [
    { value: 'soft', label: 'Soft (Recreational)' },
    { value: 'average', label: 'Average' },
    { value: 'tough', label: 'Tough (Competitive)' }
];

export default function ReportGameModal({ venue, isOpen, onClose, onSubmit, user }) {
    const [formData, setFormData] = useState({
        game_type: 'nlh',
        stakes: '1/2',
        customStakes: '',
        seats_open: 0,
        waitlist_size: 0,
        table_count: 1,
        game_quality: '',
        notes: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const stakes = formData.stakes === 'custom' ? formData.customStakes : formData.stakes;

        if (!stakes) {
            setError('Please enter stakes');
            setLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/public/live-games', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user?.token || ''}`
                },
                body: JSON.stringify({
                    venue_id: venue.id,
                    game_type: formData.game_type,
                    stakes,
                    seats_open: parseInt(formData.seats_open) || 0,
                    waitlist_size: parseInt(formData.waitlist_size) || 0,
                    table_count: parseInt(formData.table_count) || 1,
                    game_quality: formData.game_quality || null,
                    notes: formData.notes || null
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to report game');
            }

            if (onSubmit) {
                onSubmit(data.game);
            }
            onClose();

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px'
        }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                borderRadius: '16px',
                padding: '24px',
                width: '100%',
                maxWidth: '480px',
                maxHeight: '90vh',
                overflow: 'auto'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#fff' }}>
                        Report Live Game
                    </h2>
                    <button onClick={onClose} style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255,255,255,0.5)',
                        cursor: 'pointer',
                        padding: '8px'
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Venue Info */}
                <div style={{
                    background: 'rgba(0, 212, 255, 0.1)',
                    border: '1px solid rgba(0, 212, 255, 0.2)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '20px'
                }}>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#00D4FF' }}>{venue?.name}</div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                        {venue?.city}, {venue?.state}
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    {/* Game Type */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
                            Game Type *
                        </label>
                        <select
                            value={formData.game_type}
                            onChange={e => handleChange('game_type', e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '14px'
                            }}
                        >
                            {GAME_TYPES.map(type => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Stakes */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
                            Stakes *
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                            {COMMON_STAKES.map(stake => (
                                <button
                                    key={stake}
                                    type="button"
                                    onClick={() => handleChange('stakes', stake)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        border: formData.stakes === stake ? '1px solid #00D4FF' : '1px solid rgba(255,255,255,0.2)',
                                        background: formData.stakes === stake ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                                        color: formData.stakes === stake ? '#00D4FF' : 'rgba(255,255,255,0.7)',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {stake}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => handleChange('stakes', 'custom')}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: formData.stakes === 'custom' ? '1px solid #00D4FF' : '1px solid rgba(255,255,255,0.2)',
                                    background: formData.stakes === 'custom' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                                    color: formData.stakes === 'custom' ? '#00D4FF' : 'rgba(255,255,255,0.7)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Custom
                            </button>
                        </div>
                        {formData.stakes === 'custom' && (
                            <input
                                type="text"
                                placeholder="e.g., 3/6, 20/40"
                                value={formData.customStakes}
                                onChange={e => handleChange('customStakes', e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '14px'
                                }}
                            />
                        )}
                    </div>

                    {/* Seats & Waitlist */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
                                Seats Open
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="10"
                                value={formData.seats_open}
                                onChange={e => handleChange('seats_open', e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
                                Waitlist Size
                            </label>
                            <input
                                type="number"
                                min="0"
                                value={formData.waitlist_size}
                                onChange={e => handleChange('waitlist_size', e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                    </div>

                    {/* Table Count */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
                            Tables Running
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="20"
                            value={formData.table_count}
                            onChange={e => handleChange('table_count', e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '14px'
                            }}
                        />
                    </div>

                    {/* Game Quality */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
                            Game Quality (Optional)
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {GAME_QUALITY.map(q => (
                                <button
                                    key={q.value}
                                    type="button"
                                    onClick={() => handleChange('game_quality', formData.game_quality === q.value ? '' : q.value)}
                                    style={{
                                        flex: 1,
                                        padding: '8px',
                                        borderRadius: '6px',
                                        border: formData.game_quality === q.value ? '1px solid #00D4FF' : '1px solid rgba(255,255,255,0.2)',
                                        background: formData.game_quality === q.value ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                                        color: formData.game_quality === q.value ? '#00D4FF' : 'rgba(255,255,255,0.7)',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {q.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notes */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
                            Notes (Optional)
                        </label>
                        <textarea
                            value={formData.notes}
                            onChange={e => handleChange('notes', e.target.value)}
                            placeholder="Any additional details about the game..."
                            rows={3}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '14px',
                                resize: 'vertical'
                            }}
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            marginBottom: '16px',
                            color: '#ef4444',
                            fontSize: '13px'
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Submit */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: '12px',
                                borderRadius: '8px',
                                background: 'rgba(255,255,255,0.1)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: '#fff',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                flex: 1,
                                padding: '12px',
                                borderRadius: '8px',
                                background: loading ? 'rgba(0, 212, 255, 0.5)' : 'linear-gradient(135deg, #00D4FF, #0099CC)',
                                border: 'none',
                                color: '#000',
                                fontSize: '14px',
                                fontWeight: 700,
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? 'Reporting...' : 'Report Game'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
