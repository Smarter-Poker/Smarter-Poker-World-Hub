/**
 * PromotionEditor Component
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * Create or edit promotions
 */
import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Calendar, Clock, DollarSign } from 'lucide-react';

const PROMOTION_TYPES = [
  { value: 'high_hand', label: 'High Hand' },
  { value: 'bad_beat', label: 'Bad Beat' },
  { value: 'splash_pot', label: 'Splash Pot' },
  { value: 'happy_hour', label: 'Happy Hour' },
  { value: 'new_player', label: 'New Player Bonus' },
  { value: 'referral', label: 'Referral Bonus' },
  { value: 'loyalty', label: 'Loyalty Reward' },
  { value: 'tournament_bonus', label: 'Tournament Bonus' },
  { value: 'cash_back', label: 'Cash Back' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'other', label: 'Other' }
];

const PRIZE_TYPES = [
  { value: 'cash', label: 'Cash' },
  { value: 'chips', label: 'Chips' },
  { value: 'freeroll', label: 'Freeroll Entry' },
  { value: 'merchandise', label: 'Merchandise' },
  { value: 'points', label: 'Points' },
  { value: 'other', label: 'Other' }
];

const GAME_TYPES = [
  { value: 'nlhe', label: "No Limit Hold'em" },
  { value: 'plo', label: 'Pot Limit Omaha' },
  { value: 'limit', label: 'Limit' },
  { value: 'mixed', label: 'Mixed Games' },
  { value: 'all', label: 'All Games' }
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

export default function PromotionEditor({
  promotion = null,
  venueId,
  onSave,
  onDelete,
  onClose,
  isLoading = false
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    promotion_type: 'high_hand',
    prize_type: 'cash',
    prize_value: '',
    prize_description: '',
    start_date: '',
    end_date: '',
    days_of_week: [],
    start_time: '',
    end_time: '',
    is_recurring: false,
    min_stakes: '',
    min_hours_played: '',
    min_buyin: '',
    game_types: [],
    qualifying_hands: '',
    status: 'draft',
    is_featured: false,
    terms_conditions: ''
  });

  useEffect(() => {
    if (promotion) {
      setFormData({
        name: promotion.name || '',
        description: promotion.description || '',
        promotion_type: promotion.promotion_type || 'high_hand',
        prize_type: promotion.prize_type || 'cash',
        prize_value: promotion.prize_value || '',
        prize_description: promotion.prize_description || '',
        start_date: promotion.start_date || '',
        end_date: promotion.end_date || '',
        days_of_week: promotion.days_of_week || [],
        start_time: promotion.start_time || '',
        end_time: promotion.end_time || '',
        is_recurring: promotion.is_recurring || false,
        min_stakes: promotion.min_stakes || '',
        min_hours_played: promotion.min_hours_played || '',
        min_buyin: promotion.min_buyin || '',
        game_types: promotion.game_types || [],
        qualifying_hands: promotion.qualifying_hands || '',
        status: promotion.status || 'draft',
        is_featured: promotion.is_featured || false,
        terms_conditions: promotion.terms_conditions || ''
      });
    }
  }, [promotion]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDayToggle = (day) => {
    setFormData(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day].sort()
    }));
  };

  const handleGameTypeToggle = (gameType) => {
    setFormData(prev => ({
      ...prev,
      game_types: prev.game_types.includes(gameType)
        ? prev.game_types.filter(g => g !== gameType)
        : [...prev.game_types, gameType]
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      venue_id: venueId,
      prize_value: formData.prize_value ? parseInt(formData.prize_value) : null,
      min_hours_played: formData.min_hours_played ? parseFloat(formData.min_hours_played) : null,
      min_buyin: formData.min_buyin ? parseInt(formData.min_buyin) : null
    };
    onSave(data);
  };

  const inputStyle = {
    backgroundColor: '#111827',
    borderColor: '#374151',
    color: '#E5E7EB'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl"
        style={{ backgroundColor: '#1F2937' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between p-4 border-b"
          style={{ backgroundColor: '#1F2937', borderColor: '#374151' }}
        >
          <h2 className="text-lg font-semibold text-white">
            {promotion ? 'Edit Promotion' : 'New Promotion'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase">Basic Information</h3>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                style={inputStyle}
                placeholder="e.g., High Hand Bonus"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                style={inputStyle}
                rows={3}
                placeholder="Describe the promotion..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Promotion Type *</label>
                <select
                  value={formData.promotion_type}
                  onChange={(e) => handleChange('promotion_type', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                  required
                >
                  {PROMOTION_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                >
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Prize */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase flex items-center gap-2">
              <DollarSign size={14} />
              Prize Details
            </h3>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Prize Type</label>
                <select
                  value={formData.prize_type}
                  onChange={(e) => handleChange('prize_type', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                >
                  {PRIZE_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Prize Value</label>
                <input
                  type="number"
                  value={formData.prize_value}
                  onChange={(e) => handleChange('prize_value', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                  placeholder="100"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.prize_description}
                  onChange={(e) => handleChange('prize_description', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                  placeholder="e.g., $100 cash"
                />
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase flex items-center gap-2">
              <Calendar size={14} />
              Schedule
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Start Date</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleChange('start_date', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">End Date</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => handleChange('end_date', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Start Time</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => handleChange('start_time', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">End Time</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => handleChange('end_time', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Days of Week</label>
              <div className="flex gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => handleDayToggle(day.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      formData.days_of_week.includes(day.value)
                        ? 'text-white'
                        : 'text-gray-400'
                    }`}
                    style={{
                      backgroundColor: formData.days_of_week.includes(day.value)
                        ? '#1877F2'
                        : '#374151'
                    }}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_recurring}
                onChange={(e) => handleChange('is_recurring', e.target.checked)}
                className="w-4 h-4 rounded border-gray-600"
              />
              <span className="text-sm text-gray-300">Recurring promotion</span>
            </label>
          </div>

          {/* Requirements */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase">Requirements</h3>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Min Stakes</label>
                <input
                  type="text"
                  value={formData.min_stakes}
                  onChange={(e) => handleChange('min_stakes', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                  placeholder="1/2"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Min Hours</label>
                <input
                  type="number"
                  step="0.5"
                  value={formData.min_hours_played}
                  onChange={(e) => handleChange('min_hours_played', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                  placeholder="2"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Min Buy-in</label>
                <input
                  type="number"
                  value={formData.min_buyin}
                  onChange={(e) => handleChange('min_buyin', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                  style={inputStyle}
                  placeholder="100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Eligible Games</label>
              <div className="flex flex-wrap gap-2">
                {GAME_TYPES.map(game => (
                  <button
                    key={game.value}
                    type="button"
                    onClick={() => handleGameTypeToggle(game.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      formData.game_types.includes(game.value)
                        ? 'text-white'
                        : 'text-gray-400'
                    }`}
                    style={{
                      backgroundColor: formData.game_types.includes(game.value)
                        ? '#1877F2'
                        : '#374151'
                    }}
                  >
                    {game.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Qualifying Hands</label>
              <input
                type="text"
                value={formData.qualifying_hands}
                onChange={(e) => handleChange('qualifying_hands', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                style={inputStyle}
                placeholder="e.g., Aces full or better"
              />
            </div>
          </div>

          {/* Options */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase">Options</h3>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_featured}
                onChange={(e) => handleChange('is_featured', e.target.checked)}
                className="w-4 h-4 rounded border-gray-600"
              />
              <span className="text-sm text-gray-300">Featured promotion (highlighted)</span>
            </label>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Terms & Conditions</label>
              <textarea
                value={formData.terms_conditions}
                onChange={(e) => handleChange('terms_conditions', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                style={inputStyle}
                rows={3}
                placeholder="Enter any terms and conditions..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: '#374151' }}>
            {promotion && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(promotion.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-red-400 hover:bg-red-900/20 transition-colors"
                disabled={isLoading}
              >
                <Trash2 size={16} />
                Delete
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-gray-400 hover:bg-gray-700 transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#1877F2', color: '#FFFFFF' }}
                disabled={isLoading || !formData.name}
              >
                <Save size={16} />
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
