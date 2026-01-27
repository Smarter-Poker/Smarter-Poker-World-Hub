/**
 * Hand Detail Page
 * View detailed hand replay and analysis
 * UI: Facebook color scheme, no emojis, Inter font
 * Per API_REFERENCE.md: /hands/:handId
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  FileText,
  ChevronLeft,
  Loader2,
  Clock,
  DollarSign,
  Users,
  Play,
  Share2,
  Target,
  Lightbulb,
  ChevronRight,
  ChevronDown
} from 'lucide-react';

function CardDisplay({ cards, size = 'md' }) {
  if (!cards || cards.length === 0) return null;

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-sm',
    md: 'px-2 py-1 text-lg',
    lg: 'px-3 py-2 text-xl'
  };

  function getCardColor(card) {
    const suit = card.slice(-1);
    return suit === 'h' || suit === 'd' ? '#DC2626' : '#1F2937';
  }

  function formatCard(card) {
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    const suitSymbols = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };
    return rank + (suitSymbols[suit] || suit);
  }

  return (
    <div className="flex gap-1">
      {cards.map((card, idx) => (
        <span
          key={idx}
          className={`bg-white border border-[#E5E7EB] rounded font-mono font-bold shadow-sm ${sizeClasses[size]}`}
          style={{ color: getCardColor(card) }}
        >
          {formatCard(card)}
        </span>
      ))}
    </div>
  );
}

function ActionLine({ action, isLast }) {
  const actionColors = {
    fold: '#6B7280',
    check: '#6B7280',
    call: '#1877F2',
    bet: '#F59E0B',
    raise: '#EF4444',
    'all-in': '#DC2626'
  };

  return (
    <div className={`flex items-center gap-3 py-2 ${!isLast ? 'border-b border-[#E5E7EB]' : ''}`}>
      <div className="w-8 h-8 bg-[#F3F4F6] rounded-full flex items-center justify-center text-sm font-medium text-[#6B7280]">
        {action.seat}
      </div>
      <div className="flex-1">
        <span
          className="font-medium"
          style={{ color: actionColors[action.action.toLowerCase()] || '#1F2937' }}
        >
          {action.action}
        </span>
        {action.amount && (
          <span className="text-[#6B7280] ml-2">${action.amount}</span>
        )}
      </div>
      <span className="text-xs text-[#9CA3AF]">{action.pot_after && `Pot: $${action.pot_after}`}</span>
    </div>
  );
}

function StreetSection({ street, actions, board }) {
  const [expanded, setExpanded] = useState(true);

  const streetLabels = {
    preflop: 'Preflop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River'
  };

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-[#F9FAFB]"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[#1F2937]">{streetLabels[street]}</span>
          {board && board.length > 0 && <CardDisplay cards={board} size="sm" />}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-[#6B7280] transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>

      {expanded && actions && actions.length > 0 && (
        <div className="px-4 py-2">
          {actions.map((action, idx) => (
            <ActionLine
              key={idx}
              action={action}
              isLast={idx === actions.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HandDetailPage() {
  const router = useRouter();
  const { handId } = router.query;

  const [loading, setLoading] = useState(true);
  const [hand, setHand] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (handId) {
      fetchHand();
    }
  }, [handId]);

  async function fetchHand() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/hands/${handId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setHand(data.data?.hand);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      setHand(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/hands/${handId}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success && data.data?.redirect_url) {
        router.push(data.data.redirect_url);
      }
    } catch (err) {
      console.error('Analysis failed:', err);
      // Demo redirect
      router.push(`/hub/godmode?hand=${handId}`);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Hand #${hand?.hand_number}`,
          text: `Check out this ${hand?.winning_hand || 'hand'} from my session!`,
          url: window.location.href
        });
      } catch (err) {
        // User cancelled or error
      }
    }
  }

  if (loading || !hand) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  const flopBoard = hand.board?.slice(0, 3) || [];
  const turnBoard = hand.board?.slice(3, 4) || [];
  const riverBoard = hand.board?.slice(4, 5) || [];

  return (
    <>
      <Head>
        <title>Hand #{hand.hand_number} | Smarter Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-[#6B7280]" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-[#1F2937]">
                    Hand #{hand.hand_number}
                  </h1>
                  <p className="text-sm text-[#6B7280]">{hand.venue_name}</p>
                </div>
              </div>
              <button
                onClick={handleShare}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              >
                <Share2 className="w-5 h-5 text-[#6B7280]" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {/* Result Card */}
          <div className={`rounded-xl p-4 ${
            hand.profit >= 0 ? 'bg-[#10B981]/10 border border-[#10B981]/20' : 'bg-[#EF4444]/10 border border-[#EF4444]/20'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#6B7280]">{hand.game_type}</p>
                <p className={`text-2xl font-bold ${hand.profit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {hand.profit >= 0 ? '+' : ''}${Math.abs(hand.profit)}
                </p>
                {hand.winning_hand && (
                  <p className="text-sm text-[#1F2937] mt-1">{hand.winning_hand}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-[#6B7280]">Pot Size</p>
                <p className="text-xl font-bold text-[#1F2937]">${hand.pot_size}</p>
              </div>
            </div>
          </div>

          {/* Your Cards */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
            <p className="text-sm text-[#6B7280] mb-2">Your Hand (Seat {hand.player_seat})</p>
            <CardDisplay cards={hand.player_cards} size="lg" />
          </div>

          {/* Final Board */}
          {hand.board && hand.board.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <p className="text-sm text-[#6B7280] mb-2">Board</p>
              <CardDisplay cards={hand.board} size="lg" />
            </div>
          )}

          {/* Action Replay */}
          <h2 className="font-semibold text-[#1F2937] pt-2">Action Replay</h2>

          <div className="space-y-3">
            {hand.actions_by_street?.preflop && (
              <StreetSection
                street="preflop"
                actions={hand.actions_by_street.preflop}
              />
            )}
            {flopBoard.length > 0 && (
              <StreetSection
                street="flop"
                board={flopBoard}
                actions={hand.actions_by_street?.flop}
              />
            )}
            {turnBoard.length > 0 && (
              <StreetSection
                street="turn"
                board={turnBoard}
                actions={hand.actions_by_street?.turn}
              />
            )}
            {riverBoard.length > 0 && (
              <StreetSection
                street="river"
                board={riverBoard}
                actions={hand.actions_by_street?.river}
              />
            )}
          </div>

          {/* Analyze Button */}
          <div className="pt-4">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full h-14 bg-[#1877F2] text-white font-semibold rounded-xl hover:bg-[#1665D8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Lightbulb className="w-5 h-5" />
                  Analyze with GodMode
                </>
              )}
            </button>
            <p className="text-center text-xs text-[#6B7280] mt-2">
              Get AI-powered analysis of your decisions
            </p>
          </div>

          {/* Metadata */}
          <div className="flex items-center justify-center gap-4 text-xs text-[#9CA3AF] pt-4">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(hand.created_at).toLocaleString()}
            </span>
          </div>
        </main>
      </div>
    </>
  );
}
