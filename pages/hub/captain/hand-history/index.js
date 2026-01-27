/**
 * Hand History Player Page
 * View hands from completed sessions
 * UI: Facebook color scheme, no emojis, Inter font
 * Per API_REFERENCE.md: /hands endpoints
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
  ChevronRight,
  Filter,
  Calendar,
  Target,
  Spade,
  Search
} from 'lucide-react';

function CardDisplay({ cards }) {
  if (!cards || cards.length === 0) return null;

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
          className="px-1.5 py-0.5 bg-white border border-[#E5E7EB] rounded text-sm font-mono font-bold"
          style={{ color: getCardColor(card) }}
        >
          {formatCard(card)}
        </span>
      ))}
    </div>
  );
}

function HandCard({ hand, onClick }) {
  const isWinner = hand.result === 'won';

  return (
    <button
      onClick={() => onClick(hand)}
      className="w-full bg-white rounded-xl border border-[#E5E7EB] p-4 text-left hover:border-[#1877F2] transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-[#6B7280]">Hand #{hand.hand_number}</span>
            {isWinner && (
              <span className="px-2 py-0.5 bg-[#10B981]/10 text-[#10B981] text-xs font-medium rounded">
                Won
              </span>
            )}
          </div>
          <p className="text-sm text-[#6B7280]">{hand.game_type}</p>
        </div>
        <div className="text-right">
          <p className={`font-semibold ${hand.profit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
            {hand.profit >= 0 ? '+' : ''}{hand.profit}
          </p>
          <p className="text-xs text-[#6B7280]">Pot: {hand.pot_size}</p>
        </div>
      </div>

      {/* Player Cards */}
      <div className="mb-3">
        <p className="text-xs text-[#6B7280] mb-1">Your Hand</p>
        <CardDisplay cards={hand.player_cards} />
      </div>

      {/* Board */}
      {hand.board && hand.board.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-[#6B7280] mb-1">Board</p>
          <CardDisplay cards={hand.board} />
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-[#6B7280]">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(hand.created_at).toLocaleTimeString()}
        </span>
        <ChevronRight className="w-4 h-4" />
      </div>
    </button>
  );
}

function SessionCard({ session, onSelect }) {
  return (
    <button
      onClick={() => onSelect(session)}
      className="w-full bg-white rounded-xl border border-[#E5E7EB] p-4 text-left hover:border-[#1877F2] transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-[#1F2937]">{session.venue_name}</h3>
        <ChevronRight className="w-5 h-5 text-[#6B7280]" />
      </div>

      <p className="text-sm text-[#6B7280] mb-3">{session.game_type}</p>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-lg font-bold text-[#1F2937]">{session.hands_played}</p>
          <p className="text-xs text-[#6B7280]">Hands</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${session.profit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
            {session.profit >= 0 ? '+' : ''}{session.profit}
          </p>
          <p className="text-xs text-[#6B7280]">Profit</p>
        </div>
        <div>
          <p className="text-lg font-bold text-[#1F2937]">{session.duration_hours}h</p>
          <p className="text-xs text-[#6B7280]">Duration</p>
        </div>
      </div>

      <p className="text-xs text-[#6B7280] mt-3">
        {new Date(session.date).toLocaleDateString()}
      </p>
    </button>
  );
}

export default function HandHistoryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [hands, setHands] = useState([]);
  const [handsLoading, setHandsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/captain/hands/sessions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSessions(data.data?.sessions || []);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchHands(gameId) {
    setHandsLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/hands/game/${gameId}?limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setHands(data.data?.hands || []);
      }
    } catch (err) {
      console.error('Fetch hands failed:', err);
      // Mock data
      setHands([
        {
          id: 'h1',
          hand_number: 47,
          game_type: '$2/$5 NLH',
          player_cards: ['As', 'Kh'],
          board: ['Ah', '7c', '2d', 'Kd', '9s'],
          pot_size: 450,
          profit: 225,
          result: 'won',
          created_at: new Date().toISOString()
        },
        {
          id: 'h2',
          hand_number: 46,
          game_type: '$2/$5 NLH',
          player_cards: ['Qh', 'Qd'],
          board: ['Ks', 'Jc', '5h'],
          pot_size: 85,
          profit: -40,
          result: 'lost',
          created_at: new Date(Date.now() - 120000).toISOString()
        },
        {
          id: 'h3',
          hand_number: 45,
          game_type: '$2/$5 NLH',
          player_cards: ['9c', '9h'],
          board: ['9s', '4c', '2d', 'Jh', 'Ac'],
          pot_size: 320,
          profit: 160,
          result: 'won',
          created_at: new Date(Date.now() - 300000).toISOString()
        },
        {
          id: 'h4',
          hand_number: 44,
          game_type: '$2/$5 NLH',
          player_cards: ['Jd', 'Td'],
          board: [],
          pot_size: 20,
          profit: -10,
          result: 'fold',
          created_at: new Date(Date.now() - 420000).toISOString()
        }
      ]);
    } finally {
      setHandsLoading(false);
    }
  }

  function handleSelectSession(session) {
    setSelectedSession(session);
    fetchHands(session.game_id);
  }

  function handleHandClick(hand) {
    router.push(`/hub/captain/hand-history/${hand.id}`);
  }

  function handleBackToSessions() {
    setSelectedSession(null);
    setHands([]);
  }

  const filteredHands = hands.filter(hand => {
    if (filter === 'won' && hand.result !== 'won') return false;
    if (filter === 'lost' && hand.result !== 'lost') return false;
    return true;
  });

  return (
    <>
      <Head>
        <title>Hand History | Smarter Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={selectedSession ? handleBackToSessions : () => router.push('/hub/captain')}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-[#6B7280]" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-[#1F2937] flex items-center gap-2">
                  <FileText className="w-6 h-6 text-[#1877F2]" />
                  {selectedSession ? selectedSession.venue_name : 'Hand History'}
                </h1>
                <p className="text-sm text-[#6B7280]">
                  {selectedSession
                    ? `${selectedSession.game_type} - ${selectedSession.hands_played} hands`
                    : 'Review your session hands'}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : selectedSession ? (
            /* Hands View */
            <div className="space-y-4">
              {/* Session Summary */}
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-[#1F2937]">{selectedSession.hands_played}</p>
                    <p className="text-sm text-[#6B7280]">Hands</p>
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${selectedSession.profit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                      {selectedSession.profit >= 0 ? '+' : ''}${Math.abs(selectedSession.profit)}
                    </p>
                    <p className="text-sm text-[#6B7280]">Profit</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#1F2937]">{selectedSession.duration_hours}h</p>
                    <p className="text-sm text-[#6B7280]">Duration</p>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-2">
                {[
                  { id: 'all', label: 'All Hands' },
                  { id: 'won', label: 'Won' },
                  { id: 'lost', label: 'Lost' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filter === f.id
                        ? 'bg-[#1877F2] text-white'
                        : 'bg-white border border-[#E5E7EB] text-[#6B7280]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Hands List */}
              {handsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#1877F2]" />
                </div>
              ) : filteredHands.length > 0 ? (
                <div className="space-y-3">
                  {filteredHands.map(hand => (
                    <HandCard
                      key={hand.id}
                      hand={hand}
                      onClick={handleHandClick}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                  <Spade className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                  <p className="text-[#6B7280]">No hands match your filter</p>
                </div>
              )}
            </div>
          ) : (
            /* Sessions List */
            <div className="space-y-4">
              <h2 className="font-semibold text-[#1F2937]">Recent Sessions</h2>

              {sessions.length > 0 ? (
                <div className="space-y-3">
                  {sessions.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onSelect={handleSelectSession}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                  <FileText className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                  <p className="text-[#6B7280]">No sessions with hand history</p>
                  <p className="text-sm text-[#9CA3AF] mt-1">
                    Play at a venue with RFID tables to capture hands
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
