/**
 * Hand History Player Page
 * View hands from completed sessions
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
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
  ChevronRight,
  Spade
} from 'lucide-react';

function CardDisplay({ cards }) {
  if (!cards || cards.length === 0) return null;

  function getCardColor(card) {
    const suit = card.slice(-1);
    return suit === 'h' || suit === 'd' ? '#DC2626' : '#FFFFFF';
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
          className="px-1.5 py-0.5 bg-[#0A1525] border border-[#4A5E78] rounded text-sm font-mono font-bold"
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
      className="w-full cmd-panel p-4 text-left hover:shadow-[0_0_15px_rgba(34,211,238,0.15)] hover:border-[#22D3EE]/50 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-[#64748B]">Hand #{hand.hand_number}</span>
            {isWinner && (
              <span className="px-2 py-0.5 bg-[#10B981]/15 text-[#10B981] text-xs font-medium rounded border border-[#10B981]/30">
                Won
              </span>
            )}
          </div>
          <p className="text-sm text-[#64748B]">{hand.game_type}</p>
        </div>
        <div className="text-right">
          <p className={`font-semibold ${hand.profit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
            {hand.profit >= 0 ? '+' : ''}{hand.profit}
          </p>
          <p className="text-xs text-[#64748B]">Pot: {hand.pot_size}</p>
        </div>
      </div>

      {/* Player Cards */}
      <div className="mb-3">
        <p className="text-xs text-[#64748B] mb-1">Your Hand</p>
        <CardDisplay cards={hand.player_cards} />
      </div>

      {/* Board */}
      {hand.board && hand.board.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-[#64748B] mb-1">Board</p>
          <CardDisplay cards={hand.board} />
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-[#64748B]">
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
      className="w-full cmd-panel p-4 text-left hover:shadow-[0_0_15px_rgba(34,211,238,0.15)] hover:border-[#22D3EE]/50 transition-all relative"
    >
      <div className="absolute top-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
      <div className="absolute top-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
      <div className="absolute bottom-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
      <div className="absolute bottom-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-white">{session.venue_name}</h3>
        <ChevronRight className="w-5 h-5 text-[#64748B]" />
      </div>

      <p className="text-sm text-[#64748B] mb-3">{session.game_type}</p>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-lg font-bold text-white">{session.hands_played}</p>
          <p className="text-xs text-[#64748B]">Hands</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${session.profit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
            {session.profit >= 0 ? '+' : ''}{session.profit}
          </p>
          <p className="text-xs text-[#64748B]">Profit</p>
        </div>
        <div>
          <p className="text-lg font-bold text-white">{session.duration_hours}h</p>
          <p className="text-xs text-[#64748B]">Duration</p>
        </div>
      </div>

      <p className="text-xs text-[#64748B] mt-3">
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
      const res = await fetch('/api/commander/hands/sessions', {
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
      const res = await fetch(`/api/commander/hands/game/${gameId}?limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setHands(data.data?.hands || []);
      }
    } catch (err) {
      console.error('Fetch hands failed:', err);
      setHands([]);
    } finally {
      setHandsLoading(false);
    }
  }

  function handleSelectSession(session) {
    setSelectedSession(session);
    fetchHands(session.game_id);
  }

  function handleHandClick(hand) {
    router.push(`/hub/commander/hand-history/${hand.id}`);
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
        <title>Hand History | Club Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-full sticky top-0 z-40">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={selectedSession ? handleBackToSessions : () => router.push('/hub/commander')}
                className="p-2 hover:bg-[#1A2E4A] rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-6 h-6 text-[#22D3EE]" />
                  {selectedSession ? selectedSession.venue_name : 'Hand History'}
                </h1>
                <p className="text-sm text-[#64748B]">
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
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
            </div>
          ) : selectedSession ? (
            /* Hands View */
            <div className="space-y-4">
              {/* Session Summary */}
              <div className="cmd-panel p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-white">{selectedSession.hands_played}</p>
                    <p className="text-sm text-[#64748B]">Hands</p>
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${selectedSession.profit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                      {selectedSession.profit >= 0 ? '+' : ''}${Math.abs(selectedSession.profit)}
                    </p>
                    <p className="text-sm text-[#64748B]">Profit</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{selectedSession.duration_hours}h</p>
                    <p className="text-sm text-[#64748B]">Duration</p>
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
                        ? 'bg-[#132240] text-[#22D3EE] border-2 border-[#22D3EE]'
                        : 'bg-[#0F1C32] text-[#64748B] border-2 border-[#4A5E78]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Hands List */}
              {handsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#22D3EE]" />
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
                <div className="cmd-panel p-8 text-center">
                  <div className="cmd-icon-box mx-auto mb-3">
                    <Spade className="w-12 h-12 text-[#64748B]" />
                  </div>
                  <p className="text-[#64748B]">No hands match your filter</p>
                </div>
              )}
            </div>
          ) : (
            /* Sessions List */
            <div className="space-y-4">
              <h2 className="font-semibold text-white">Recent Sessions</h2>

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
                <div className="cmd-panel p-8 text-center">
                  <div className="cmd-icon-box mx-auto mb-3">
                    <FileText className="w-12 h-12 text-[#64748B]" />
                  </div>
                  <p className="text-[#64748B]">No sessions with hand history</p>
                  <p className="text-sm text-[#64748B] mt-1">
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
