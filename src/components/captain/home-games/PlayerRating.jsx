/**
 * PlayerRating Component - Rate/review players after home games
 * Reference: SCOPE_LOCK.md - Phase 4 Components
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState } from 'react';
import { Star, User, ThumbsUp, ThumbsDown, Send, X } from 'lucide-react';

const RATING_CATEGORIES = [
  { id: 'punctuality', label: 'Punctuality', description: 'Arrived on time' },
  { id: 'sportsmanship', label: 'Sportsmanship', description: 'Good attitude, graceful wins/losses' },
  { id: 'etiquette', label: 'Etiquette', description: 'Follows poker etiquette' },
  { id: 'payment', label: 'Payment', description: 'Handles buy-ins/cash outs properly' },
  { id: 'overall', label: 'Overall', description: 'Would play with again' }
];

function StarRating({ value, onChange, readOnly = false, size = 'md' }) {
  const [hoverValue, setHoverValue] = useState(0);
  const iconSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6';

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !readOnly && onChange(star)}
          onMouseEnter={() => !readOnly && setHoverValue(star)}
          onMouseLeave={() => !readOnly && setHoverValue(0)}
          className={`${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
          disabled={readOnly}
        >
          <Star
            className={`${iconSize} ${
              star <= (hoverValue || value)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export default function PlayerRating({
  playerId,
  playerName,
  eventId,
  onSubmit,
  onCancel,
  existingRating = null,
  isModal = false
}) {
  const [ratings, setRatings] = useState(
    existingRating?.ratings || {
      punctuality: 0,
      sportsmanship: 0,
      etiquette: 0,
      payment: 0,
      overall: 0
    }
  );
  const [comment, setComment] = useState(existingRating?.comment || '');
  const [wouldPlayAgain, setWouldPlayAgain] = useState(existingRating?.would_play_again ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleRatingChange = (category, value) => {
    setRatings((prev) => ({ ...prev, [category]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validate at least overall rating
    if (ratings.overall === 0) {
      setError('Please provide at least an overall rating');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/captain/home-games/events/${eventId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rated_player_id: playerId,
          ratings,
          comment: comment.trim() || null,
          would_play_again: wouldPlayAgain
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to submit rating');
      }

      onSubmit?.(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate average rating
  const avgRating =
    Object.values(ratings).filter((r) => r > 0).length > 0
      ? (Object.values(ratings).reduce((a, b) => a + b, 0) /
         Object.values(ratings).filter((r) => r > 0).length).toFixed(1)
      : '0.0';

  const content = (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Player Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
        <div className="h-12 w-12 rounded-full bg-[#1877F2] flex items-center justify-center text-white">
          <User className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{playerName || 'Player'}</h3>
          <p className="text-sm text-gray-500">Rate your experience</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-2xl font-bold text-gray-900">{avgRating}</div>
          <div className="text-xs text-gray-500">Average</div>
        </div>
      </div>

      {/* Rating Categories */}
      <div className="space-y-4">
        {RATING_CATEGORIES.map((category) => (
          <div key={category.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{category.label}</p>
              <p className="text-sm text-gray-500">{category.description}</p>
            </div>
            <StarRating
              value={ratings[category.id]}
              onChange={(value) => handleRatingChange(category.id, value)}
            />
          </div>
        ))}
      </div>

      {/* Would Play Again */}
      <div className="pt-4 border-t border-gray-200">
        <p className="font-medium text-gray-900 mb-3">Would you play with this person again?</p>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setWouldPlayAgain(true)}
            className={`flex-1 py-3 rounded-lg border-2 flex items-center justify-center gap-2 transition ${
              wouldPlayAgain === true
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <ThumbsUp className="h-5 w-5" />
            Yes
          </button>
          <button
            type="button"
            onClick={() => setWouldPlayAgain(false)}
            className={`flex-1 py-3 rounded-lg border-2 flex items-center justify-center gap-2 transition ${
              wouldPlayAgain === false
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <ThumbsDown className="h-5 w-5" />
            No
          </button>
        </div>
      </div>

      {/* Comment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Additional Comments (optional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Share your experience playing with this person..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1877F2] focus:border-[#1877F2] resize-none"
        />
        <p className="text-xs text-gray-500 text-right mt-1">{comment.length}/500</p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || ratings.overall === 0}
          className="flex-1 py-2 px-4 bg-[#1877F2] text-white rounded-lg hover:bg-[#1664d9] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>Submitting...</>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit Rating
            </>
          )}
        </button>
      </div>
    </form>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">{content}</div>
  );
}

// Display-only component for showing existing ratings
export function PlayerRatingDisplay({ ratings, wouldPlayAgain, comment, raterName }) {
  const avgRating =
    Object.values(ratings || {}).filter((r) => r > 0).length > 0
      ? (Object.values(ratings).reduce((a, b) => a + b, 0) /
         Object.values(ratings).filter((r) => r > 0).length).toFixed(1)
      : '0.0';

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StarRating value={Math.round(parseFloat(avgRating))} readOnly size="sm" />
          <span className="font-medium text-gray-900">{avgRating}</span>
        </div>
        {wouldPlayAgain !== null && (
          <span
            className={`text-sm px-2 py-1 rounded ${
              wouldPlayAgain
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {wouldPlayAgain ? 'Would play again' : 'Would not play again'}
          </span>
        )}
      </div>
      {comment && <p className="text-gray-600 text-sm">{comment}</p>}
      {raterName && <p className="text-xs text-gray-400">- {raterName}</p>}
    </div>
  );
}
