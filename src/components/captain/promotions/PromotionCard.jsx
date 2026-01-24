/**
 * PromotionCard Component
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * Displays a single promotion with details
 */
import React from 'react';
import { Gift, Clock, Calendar, DollarSign, Users, Trophy, Star } from 'lucide-react';

const PROMOTION_TYPE_LABELS = {
  high_hand: 'High Hand',
  bad_beat: 'Bad Beat',
  splash_pot: 'Splash Pot',
  happy_hour: 'Happy Hour',
  new_player: 'New Player',
  referral: 'Referral',
  loyalty: 'Loyalty',
  tournament_bonus: 'Tournament Bonus',
  cash_back: 'Cash Back',
  drawing: 'Drawing',
  other: 'Other'
};

const PROMOTION_TYPE_COLORS = {
  high_hand: '#22C55E',
  bad_beat: '#EF4444',
  splash_pot: '#3B82F6',
  happy_hour: '#F59E0B',
  new_player: '#8B5CF6',
  referral: '#EC4899',
  loyalty: '#1877F2',
  tournament_bonus: '#14B8A6',
  cash_back: '#6366F1',
  drawing: '#F97316',
  other: '#6B7280'
};

const STATUS_STYLES = {
  draft: { bg: '#374151', text: '#9CA3AF' },
  scheduled: { bg: '#1E40AF', text: '#93C5FD' },
  active: { bg: '#166534', text: '#86EFAC' },
  paused: { bg: '#92400E', text: '#FCD34D' },
  completed: { bg: '#1F2937', text: '#9CA3AF' },
  cancelled: { bg: '#7F1D1D', text: '#FCA5A5' }
};

export default function PromotionCard({
  promotion,
  onEdit,
  onViewAwards,
  compact = false
}) {
  const typeColor = PROMOTION_TYPE_COLORS[promotion.promotion_type] || PROMOTION_TYPE_COLORS.other;
  const statusStyle = STATUS_STYLES[promotion.status] || STATUS_STYLES.draft;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatPrize = () => {
    if (promotion.prize_value) {
      if (promotion.prize_type === 'cash' || promotion.prize_type === 'chips') {
        return `$${promotion.prize_value.toLocaleString()}`;
      }
      return `${promotion.prize_value} ${promotion.prize_type}`;
    }
    return promotion.prize_description || 'See details';
  };

  if (compact) {
    return (
      <div
        className="p-3 rounded-lg border cursor-pointer hover:border-blue-400 transition-colors"
        style={{ backgroundColor: '#1F2937', borderColor: '#374151' }}
        onClick={() => onEdit?.(promotion)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: typeColor }}
            />
            <span className="font-medium text-white text-sm">{promotion.name}</span>
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
          >
            {promotion.status}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-400">
          {PROMOTION_TYPE_LABELS[promotion.promotion_type]} - {formatPrize()}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: '#1F2937', borderColor: '#374151' }}
    >
      {/* Header */}
      <div
        className="p-4 border-b"
        style={{ borderColor: '#374151' }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${typeColor}20` }}
            >
              <Gift size={20} style={{ color: typeColor }} />
            </div>
            <div>
              <h3 className="font-semibold text-white">{promotion.name}</h3>
              <span className="text-sm" style={{ color: typeColor }}>
                {PROMOTION_TYPE_LABELS[promotion.promotion_type]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {promotion.is_featured && (
              <Star size={16} className="text-yellow-400 fill-yellow-400" />
            )}
            <span
              className="text-xs px-2 py-1 rounded-full font-medium"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
            >
              {promotion.status}
            </span>
          </div>
        </div>

        {promotion.description && (
          <p className="mt-3 text-sm text-gray-400 line-clamp-2">
            {promotion.description}
          </p>
        )}
      </div>

      {/* Details */}
      <div className="p-4 space-y-3">
        {/* Prize */}
        <div className="flex items-center gap-2 text-sm">
          <DollarSign size={16} className="text-green-400" />
          <span className="text-gray-400">Prize:</span>
          <span className="text-white font-medium">{formatPrize()}</span>
        </div>

        {/* Schedule */}
        {(promotion.start_date || promotion.end_date) && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={16} className="text-blue-400" />
            <span className="text-gray-400">
              {formatDate(promotion.start_date)} - {formatDate(promotion.end_date)}
            </span>
          </div>
        )}

        {/* Time */}
        {(promotion.start_time || promotion.end_time) && (
          <div className="flex items-center gap-2 text-sm">
            <Clock size={16} className="text-purple-400" />
            <span className="text-gray-400">
              {formatTime(promotion.start_time)} - {formatTime(promotion.end_time)}
            </span>
          </div>
        )}

        {/* Requirements */}
        {(promotion.min_stakes || promotion.qualifying_hands) && (
          <div className="flex items-center gap-2 text-sm">
            <Trophy size={16} className="text-yellow-400" />
            <span className="text-gray-400">
              {promotion.min_stakes && `Min Stakes: ${promotion.min_stakes}`}
              {promotion.min_stakes && promotion.qualifying_hands && ' | '}
              {promotion.qualifying_hands}
            </span>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 pt-2 border-t" style={{ borderColor: '#374151' }}>
          <div className="flex items-center gap-1 text-sm">
            <Users size={14} className="text-gray-500" />
            <span className="text-gray-400">{promotion.total_awarded || 0} awarded</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <DollarSign size={14} className="text-gray-500" />
            <span className="text-gray-400">
              ${(promotion.total_value_awarded || 0).toLocaleString()} total
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {(onEdit || onViewAwards) && (
        <div
          className="px-4 py-3 flex items-center gap-2 border-t"
          style={{ borderColor: '#374151', backgroundColor: '#111827' }}
        >
          {onEdit && (
            <button
              onClick={() => onEdit(promotion)}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: '#374151', color: '#E5E7EB' }}
            >
              Edit
            </button>
          )}
          {onViewAwards && (
            <button
              onClick={() => onViewAwards(promotion)}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: '#1877F2', color: '#FFFFFF' }}
            >
              View Awards
            </button>
          )}
        </div>
      )}
    </div>
  );
}
