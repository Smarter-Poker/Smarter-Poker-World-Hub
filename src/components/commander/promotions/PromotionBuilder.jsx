/**
 * PromotionBuilder Component - Step-by-step promotion creation wizard
 * Reference: SCOPE_LOCK.md - Phase 5 Components
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState } from 'react';
import {
  Gift, DollarSign, Calendar, Clock, Settings,
  ChevronRight, ChevronLeft, Check, X, Star, Zap
} from 'lucide-react';

const PROMOTION_TYPES = [
  { value: 'high_hand', label: 'High Hand', description: 'Award best hand each period', color: '#22C55E', icon: Star },
  { value: 'bad_beat', label: 'Bad Beat', description: 'Jackpot for qualifying bad beats', color: '#EF4444', icon: Zap },
  { value: 'splash_pot', label: 'Splash Pot', description: 'Random pot bonuses', color: '#3B82F6', icon: DollarSign },
  { value: 'happy_hour', label: 'Happy Hour', description: 'Time-based bonus rewards', color: '#F59E0B', icon: Clock },
  { value: 'new_player', label: 'New Player', description: 'First-time player bonus', color: '#8B5CF6', icon: Gift },
  { value: 'referral', label: 'Referral', description: 'Refer a friend rewards', color: '#EC4899', icon: Gift },
  { value: 'loyalty', label: 'Loyalty', description: 'Reward returning players', color: '#22D3EE', icon: Star },
  { value: 'drawing', label: 'Drawing', description: 'Raffle / drawing entry', color: '#F97316', icon: Gift },
  { value: 'custom', label: 'Custom', description: 'Define your own promotion', color: '#6B7280', icon: Settings }
];

const PRIZE_TYPES = [
  { value: 'cash', label: 'Cash' },
  { value: 'chips', label: 'Chips' },
  { value: 'freeroll', label: 'Freeroll Entry' },
  { value: 'merchandise', label: 'Merchandise' },
  { value: 'points', label: 'Points/XP' },
  { value: 'other', label: 'Other' }
];

const GAME_TYPE_OPTIONS = [
  { value: 'all', label: 'All Games' },
  { value: 'nlhe', label: 'NLHE' },
  { value: 'plo', label: 'PLO' },
  { value: 'limit', label: 'Limit' },
  { value: 'mixed', label: 'Mixed' }
];

const STEPS = [
  { key: 'type', label: 'Type', icon: Gift },
  { key: 'details', label: 'Details', icon: Settings },
  { key: 'prize', label: 'Prize', icon: DollarSign },
  { key: 'schedule', label: 'Schedule', icon: Calendar },
  { key: 'review', label: 'Review', icon: Check }
];

export default function PromotionBuilder({
  venueId,
  onSubmit,
  onCancel,
  isLoading = false
}) {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    promotion_type: '',
    name: '',
    description: '',
    game_types: ['all'],
    min_stakes: '',
    qualifying_hand: '',
    prize_type: 'cash',
    prize_amount: '',
    prize_description: '',
    max_winners: 1,
    start_date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    is_recurring: false,
    recurring_days: [],
    is_featured: false
  });

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleGameType = (type) => {
    setFormData(prev => {
      if (type === 'all') return { ...prev, game_types: ['all'] };
      const types = prev.game_types.filter(t => t !== 'all');
      const exists = types.includes(type);
      const updated = exists ? types.filter(t => t !== type) : [...types, type];
      return { ...prev, game_types: updated.length === 0 ? ['all'] : updated };
    });
  };

  const toggleDay = (day) => {
    setFormData(prev => {
      const days = prev.recurring_days.includes(day)
        ? prev.recurring_days.filter(d => d !== day)
        : [...prev.recurring_days, day];
      return { ...prev, recurring_days: days };
    });
  };

  const canProceed = () => {
    switch (step) {
      case 0: return !!formData.promotion_type;
      case 1: return formData.name.trim().length > 0;
      case 2: return formData.prize_amount || formData.prize_description;
      case 3: return formData.start_date;
      default: return true;
    }
  };

  const handleSubmit = () => {
    onSubmit?.({
      venue_id: venueId,
      ...formData,
      prize_amount: formData.prize_amount ? parseFloat(formData.prize_amount) : null,
      max_winners: parseInt(formData.max_winners) || 1
    });
  };

  const selectedType = PROMOTION_TYPES.find(t => t.value === formData.promotion_type);

  return (
    <div className="space-y-4">
      {/* Step Indicator */}
      <div className="cmd-panel p-4">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;

            return (
              <div key={s.key} className="flex items-center">
                <button
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#22D3EE]/20 text-[#22D3EE]'
                      : isDone
                      ? 'text-[#10B981] hover:bg-[#132240]'
                      : 'text-[#4A5E78]'
                  }`}
                >
                  {isDone ? (
                    <Check size={16} className="text-[#10B981]" />
                  ) : (
                    <Icon size={16} />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={16} className="text-[#4A5E78] mx-1" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="cmd-panel cmd-corner-lights p-5">
        {/* Step 0: Select Type */}
        {step === 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Choose Promotion Type</h3>
            <div className="grid grid-cols-3 gap-3">
              {PROMOTION_TYPES.map(type => {
                const Icon = type.icon;
                const isSelected = formData.promotion_type === type.value;

                return (
                  <button
                    key={type.value}
                    onClick={() => updateField('promotion_type', type.value)}
                    className={`p-4 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'border-[#22D3EE] bg-[#22D3EE]/10'
                        : 'border-[#4A5E78] hover:border-[#64748B]'
                    }`}
                  >
                    <Icon size={24} style={{ color: type.color }} />
                    <p className="font-medium text-white mt-2">{type.label}</p>
                    <p className="text-xs text-[#64748B] mt-1">{type.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Details */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Promotion Details</h3>

            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">
                Name <span className="text-[#EF4444]">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder={selectedType ? `${selectedType.label} Promotion` : 'Promotion name'}
                className="w-full cmd-input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Describe the promotion rules..."
                className="w-full cmd-input min-h-[80px] resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Game Types</label>
              <div className="flex gap-2 flex-wrap">
                {GAME_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => toggleGameType(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      formData.game_types.includes(opt.value)
                        ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                        : 'border-[#4A5E78] text-[#64748B] hover:border-[#64748B]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Min Stakes</label>
                <input
                  type="text"
                  value={formData.min_stakes}
                  onChange={(e) => updateField('min_stakes', e.target.value)}
                  placeholder="e.g., 1/2"
                  className="w-full cmd-input"
                />
              </div>
              {(formData.promotion_type === 'high_hand' || formData.promotion_type === 'bad_beat') && (
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Qualifying Hand</label>
                  <input
                    type="text"
                    value={formData.qualifying_hand}
                    onChange={(e) => updateField('qualifying_hand', e.target.value)}
                    placeholder="e.g., Aces Full"
                    className="w-full cmd-input"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Prize */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Prize Configuration</h3>

            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Prize Type</label>
              <div className="flex gap-2 flex-wrap">
                {PRIZE_TYPES.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => updateField('prize_type', opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      formData.prize_type === opt.value
                        ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                        : 'border-[#4A5E78] text-[#64748B] hover:border-[#64748B]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">
                  Prize Amount ($)
                </label>
                <input
                  type="number"
                  value={formData.prize_amount}
                  onChange={(e) => updateField('prize_amount', e.target.value)}
                  placeholder="500"
                  className="w-full cmd-input"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">
                  Max Winners
                </label>
                <input
                  type="number"
                  value={formData.max_winners}
                  onChange={(e) => updateField('max_winners', e.target.value)}
                  className="w-full cmd-input"
                  min="1"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">
                Prize Description
              </label>
              <input
                type="text"
                value={formData.prize_description}
                onChange={(e) => updateField('prize_description', e.target.value)}
                placeholder="Describe the prize details..."
                className="w-full cmd-input"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={formData.is_featured}
                onChange={(e) => updateField('is_featured', e.target.checked)}
                className="w-5 h-5 rounded border-[#4A5E78]"
              />
              <span className="text-sm text-[#94A3B8]">Feature this promotion (shown prominently)</span>
            </label>
          </div>
        )}

        {/* Step 3: Schedule */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Schedule</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">
                  Start Date <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => updateField('start_date', e.target.value)}
                  className="w-full cmd-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">End Date</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => updateField('end_date', e.target.value)}
                  className="w-full cmd-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Start Time</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => updateField('start_time', e.target.value)}
                  className="w-full cmd-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">End Time</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => updateField('end_time', e.target.value)}
                  className="w-full cmd-input"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_recurring}
                onChange={(e) => updateField('is_recurring', e.target.checked)}
                className="w-5 h-5 rounded border-[#4A5E78]"
              />
              <span className="text-sm text-[#94A3B8]">Recurring promotion</span>
            </label>

            {formData.is_recurring && (
              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Repeat on</label>
                <div className="flex gap-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                    <button
                      key={day}
                      onClick={() => toggleDay(i)}
                      className={`w-10 h-10 rounded-lg text-xs font-medium border transition-colors ${
                        formData.recurring_days.includes(i)
                          ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                          : 'border-[#4A5E78] text-[#64748B] hover:border-[#64748B]'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Review Promotion</h3>

            <div className="bg-[#0B1426] rounded-lg p-4 space-y-3">
              {selectedType && (
                <div className="flex items-center gap-2">
                  <selectedType.icon size={20} style={{ color: selectedType.color }} />
                  <span className="font-medium text-white">{selectedType.label}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-[#64748B]">Name:</span>
                  <span className="text-white ml-2">{formData.name}</span>
                </div>
                {formData.description && (
                  <div className="col-span-2">
                    <span className="text-[#64748B]">Description:</span>
                    <span className="text-white ml-2">{formData.description}</span>
                  </div>
                )}
                <div>
                  <span className="text-[#64748B]">Prize:</span>
                  <span className="text-[#10B981] ml-2">
                    {formData.prize_amount ? `$${formData.prize_amount}` : formData.prize_description || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B]">Prize Type:</span>
                  <span className="text-white ml-2">{formData.prize_type}</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Max Winners:</span>
                  <span className="text-white ml-2">{formData.max_winners}</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Games:</span>
                  <span className="text-white ml-2">{formData.game_types.join(', ')}</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Start:</span>
                  <span className="text-white ml-2">{formData.start_date || '-'}</span>
                </div>
                <div>
                  <span className="text-[#64748B]">End:</span>
                  <span className="text-white ml-2">{formData.end_date || 'Ongoing'}</span>
                </div>
                {formData.is_recurring && (
                  <div className="col-span-2">
                    <span className="text-[#64748B]">Recurring:</span>
                    <span className="text-white ml-2">
                      {formData.recurring_days.map(d =>
                        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]
                      ).join(', ')}
                    </span>
                  </div>
                )}
                {formData.is_featured && (
                  <div className="col-span-2">
                    <span className="text-[#F59E0B]">Featured Promotion</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 0 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-2 px-6 h-12 border rounded-xl font-medium"
            style={{ borderColor: '#4A5E78', color: '#64748B' }}
          >
            <ChevronLeft size={18} />
            Back
          </button>
        ) : (
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-6 h-12 border rounded-xl font-medium"
            style={{ borderColor: '#4A5E78', color: '#64748B' }}
          >
            <X size={18} />
            Cancel
          </button>
        )}

        <div className="flex-1" />

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="cmd-btn cmd-btn-primary flex items-center gap-2 px-6 h-12 rounded-xl font-medium disabled:opacity-50"
          >
            Next
            <ChevronRight size={18} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isLoading || !canProceed()}
            className="flex items-center gap-2 px-6 h-12 rounded-xl font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#10B981' }}
          >
            <Check size={18} />
            {isLoading ? 'Creating...' : 'Create Promotion'}
          </button>
        )}
      </div>
    </div>
  );
}
