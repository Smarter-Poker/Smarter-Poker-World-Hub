/**
 * HighHandDisplay Component - Display high hand winners and promotions
 * Reference: SCOPE_LOCK.md - Phase 5 Components
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  DollarSign,
  Clock,
  User,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Award,
  CheckCircle,
  XCircle
} from 'lucide-react';

// Card suit symbols
const SUITS = {
  s: { symbol: 'S', color: 'text-gray-900', name: 'Spades' },
  h: { symbol: 'H', color: 'text-red-500', name: 'Hearts' },
  d: { symbol: 'D', color: 'text-red-500', name: 'Diamonds' },
  c: { symbol: 'C', color: 'text-gray-900', name: 'Clubs' }
};

// Parse card string (e.g., "As" -> Ace of spades)
function parseCard(card) {
  if (!card || card.length < 2) return null;
  const rank = card.slice(0, -1).toUpperCase();
  const suit = card.slice(-1).toLowerCase();
  return { rank, suit: SUITS[suit] || SUITS.s };
}

// Display a single card
function Card({ card, size = 'md' }) {
  const parsed = parseCard(card);
  if (!parsed) return null;

  const sizeClasses = {
    sm: 'w-8 h-11 text-sm',
    md: 'w-10 h-14 text-base',
    lg: 'w-14 h-20 text-xl'
  };

  return (
    <div
      className={`${sizeClasses[size]} bg-white border border-gray-300 rounded shadow-sm flex flex-col items-center justify-center font-bold`}
    >
      <span className={parsed.suit.color}>{parsed.rank}</span>
      <span className={`${parsed.suit.color} text-xs`}>{parsed.suit.symbol}</span>
    </div>
  );
}

// Display a hand of cards
function CardHand({ cards, label, size = 'md' }) {
  if (!cards || cards.length === 0) return null;

  return (
    <div>
      {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
      <div className="flex gap-1">
        {cards.map((card, idx) => (
          <Card key={idx} card={card} size={size} />
        ))}
      </div>
    </div>
  );
}

// High hand entry card
function HighHandCard({ entry, onVerify, isStaff = false }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handCards = entry.hand_cards || [];
  const boardCards = entry.board_cards || [];

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#1877F2] flex items-center justify-center text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {entry.player_name || 'Player'}
              </p>
              <p className="text-sm text-gray-500">{entry.hand_description}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-green-600">
              ${entry.prize_amount?.toLocaleString() || 0}
            </p>
            <div className="flex items-center gap-1 text-xs">
              {entry.verified_at ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-3 w-3" />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-600">
                  <Clock className="h-3 w-3" />
                  Pending
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap gap-6">
            {/* Hand Cards */}
            {handCards.length > 0 && (
              <CardHand cards={handCards} label="Hole Cards" />
            )}

            {/* Board Cards */}
            {boardCards.length > 0 && (
              <CardHand cards={boardCards} label="Board" />
            )}
          </div>

          {/* Meta Info */}
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
            {entry.table_name && (
              <span>Table: {entry.table_name}</span>
            )}
            {entry.game_type && (
              <span>Game: {entry.game_type}</span>
            )}
            {entry.created_at && (
              <span>
                <Clock className="h-4 w-4 inline mr-1" />
                {new Date(entry.created_at).toLocaleString()}
              </span>
            )}
          </div>

          {/* Staff Actions */}
          {isStaff && !entry.verified_at && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onVerify?.(entry.id, true);
                }}
                className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Verify
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onVerify?.(entry.id, false);
                }}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center justify-center gap-2"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HighHandDisplay({
  venueId,
  promotionId,
  initialData = [],
  isStaff = false,
  showLeaderboard = true,
  maxEntries = 10,
  autoRefresh = true,
  refreshInterval = 30000
}) {
  const [highHands, setHighHands] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);

  // Fetch high hands
  const fetchHighHands = useCallback(async () => {
    if (!venueId) return;

    try {
      setError(null);
      const params = new URLSearchParams();
      if (venueId) params.append('venue_id', venueId);
      if (promotionId) params.append('promotion_id', promotionId);
      params.append('limit', maxEntries);
      params.append('offset', page * maxEntries);

      const res = await fetch(`/api/captain/high-hands?${params}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setHighHands(data.data || []);
      } else {
        throw new Error(data.error?.message || 'Failed to load high hands');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [venueId, promotionId, maxEntries, page]);

  // Initial load and auto-refresh
  useEffect(() => {
    setIsLoading(true);
    fetchHighHands();

    if (autoRefresh) {
      const interval = setInterval(fetchHighHands, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchHighHands, autoRefresh, refreshInterval]);

  // Handle verify/reject
  const handleVerify = async (id, approve) => {
    try {
      const res = await fetch(`/api/captain/high-hands/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verified_at: approve ? new Date().toISOString() : null,
          status: approve ? 'verified' : 'rejected'
        })
      });

      if (res.ok) {
        fetchHighHands();
      }
    } catch (err) {
      console.error('Failed to update high hand:', err);
    }
  };

  // Current winner (highest prize or most recent)
  const currentWinner = highHands.find((h) => h.verified_at) || highHands[0];

  // Leaderboard entries (excluding current if shown separately)
  const leaderboard = showLeaderboard
    ? highHands.filter((h) => h.id !== currentWinner?.id).slice(0, 5)
    : [];

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
        <p className="text-gray-600">{error}</p>
        <button
          onClick={fetchHighHands}
          className="mt-4 px-4 py-2 bg-[#1877F2] text-white rounded-lg hover:bg-[#1664d9]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current High Hand Banner */}
      {currentWinner && (
        <div className="bg-gradient-to-r from-[#1877F2] to-blue-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="h-6 w-6" />
              <h2 className="text-lg font-bold">Current High Hand</h2>
            </div>
            <button
              onClick={fetchHighHands}
              className="p-2 hover:bg-white/10 rounded-full transition"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center">
              <User className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <p className="text-2xl font-bold">{currentWinner.player_name || 'Player'}</p>
              <p className="text-blue-100">{currentWinner.hand_description}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">
                ${currentWinner.prize_amount?.toLocaleString() || 0}
              </p>
              {currentWinner.verified_at && (
                <span className="inline-flex items-center gap-1 text-sm text-green-300">
                  <CheckCircle className="h-4 w-4" />
                  Verified
                </span>
              )}
            </div>
          </div>

          {/* Current winner's cards */}
          {(currentWinner.hand_cards?.length > 0 || currentWinner.board_cards?.length > 0) && (
            <div className="mt-4 flex gap-4 pt-4 border-t border-white/20">
              {currentWinner.hand_cards?.length > 0 && (
                <CardHand cards={currentWinner.hand_cards} label="Hole Cards" size="sm" />
              )}
              {currentWinner.board_cards?.length > 0 && (
                <CardHand cards={currentWinner.board_cards} label="Board" size="sm" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {showLeaderboard && leaderboard.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#1877F2]" />
              Recent High Hands
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {leaderboard.map((entry, idx) => (
              <HighHandCard
                key={entry.id}
                entry={entry}
                isStaff={isStaff}
                onVerify={handleVerify}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {highHands.length === 0 && !isLoading && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No high hands recorded yet</p>
          <p className="text-sm text-gray-400 mt-1">
            High hands will appear here as they are submitted
          </p>
        </div>
      )}

      {/* Pagination */}
      {highHands.length >= maxEntries && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm text-gray-600">Page {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            className="p-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && highHands.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 text-[#1877F2] animate-spin" />
        </div>
      )}
    </div>
  );
}
