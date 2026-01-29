/**
 * Player Home Games Hub
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * /hub/captain/home-games - Find and join home games
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Home, MapPin, Calendar, Users, Clock, Lock, Globe,
  UserPlus, Search, Filter, QrCode, ChevronRight, Star, Zap
} from 'lucide-react';

function HomeGameCard({ game, onJoin }) {
  const gameDate = new Date(game.scheduled_date);
  const isPrivate = game.visibility === 'private';
  const isFull = game.rsvp_count >= game.max_players;

  return (
    <div className="cap-panel cap-corner-lights overflow-hidden">
      {/* Corner glow lights */}
      <span className="cap-light cap-light-tl" />
      <span className="cap-light cap-light-br" />

      {/* Rivets */}
      <div className="absolute top-3 left-3"><span className="cap-rivet cap-rivet-sm" /></div>
      <div className="absolute top-3 right-3"><span className="cap-rivet cap-rivet-sm" /></div>

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {game.host_avatar ? (
              <img src={game.host_avatar} alt="" className="w-10 h-10 rounded-full border-2 border-[#4A5E78]" />
            ) : (
              <div className="cap-icon-box w-10 h-10">
                <Home size={20} />
              </div>
            )}
            <div>
              <h3 className="font-bold text-white">{game.name}</h3>
              <div className="flex items-center gap-1 text-sm text-[#64748B]">
                <span>Hosted by {game.host_name || 'Anonymous'}</span>
                {game.host_rating && (
                  <span className="flex items-center gap-0.5 ml-2 text-[#F59E0B]">
                    <Star size={12} fill="#F59E0B" />
                    {game.host_rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className={`cap-badge ${isPrivate ? 'cap-badge-chrome' : 'cap-badge-live'}`}>
            {isPrivate ? <Lock size={12} /> : <Globe size={12} />}
            {game.visibility}
          </span>
        </div>

        {/* Game details */}
        <div className="space-y-2 mb-4 text-sm text-[#CBD5E1]">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-[#64748B]" />
            <span>{gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span className="text-[#64748B]">at</span>
            <span>{gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-[#64748B]" />
            <span>{game.city}, {game.state}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#64748B]" />
            <span>{game.rsvp_count || 0} / {game.max_players} players</span>
            {isFull && <span className="text-[#EF4444] text-xs font-bold">(FULL)</span>}
          </div>
        </div>

        {/* Game type and stakes */}
        <div className="flex gap-2 mb-4">
          <span className="cap-badge cap-badge-primary">
            {game.game_type?.toUpperCase() || 'NLHE'}
          </span>
          <span className="cap-badge cap-badge-live">
            {game.stakes || '$1/$2'}
          </span>
          {game.min_buyin && (
            <span className="cap-badge cap-badge-chrome">
              Min: ${game.min_buyin}
            </span>
          )}
        </div>

        {/* Description */}
        {game.description && (
          <p className="text-sm text-[#64748B] mb-4 line-clamp-2">
            {game.description}
          </p>
        )}

        {/* Action */}
        <button
          onClick={() => onJoin?.(game)}
          disabled={isFull}
          className={`w-full ${isFull ? 'cap-btn cap-btn-secondary opacity-50 cursor-not-allowed' : 'cap-btn cap-btn-primary'} justify-center`}
        >
          {isFull ? 'GAME FULL' : game.requires_approval ? 'REQUEST TO JOIN' : 'JOIN GAME'}
        </button>
      </div>
    </div>
  );
}

export default function PlayerHomeGamesHub() {
  const router = useRouter();
  const [games, setGames] = useState([]);
  const [filteredGames, setFilteredGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [filters, setFilters] = useState({
    gameType: 'all',
    maxBuyin: '',
    daysAhead: 30
  });
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadGames();
  }, []);

  // Filter games when search or filters change
  useEffect(() => {
    let result = games;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(game =>
        game.name?.toLowerCase().includes(query) ||
        game.city?.toLowerCase().includes(query) ||
        game.state?.toLowerCase().includes(query) ||
        game.host_name?.toLowerCase().includes(query) ||
        game.game_type?.toLowerCase().includes(query) ||
        game.stakes?.toLowerCase().includes(query)
      );
    }

    // Game type filter
    if (filters.gameType !== 'all') {
      result = result.filter(game => game.game_type?.toLowerCase() === filters.gameType.toLowerCase());
    }

    // Max buyin filter
    if (filters.maxBuyin) {
      result = result.filter(game => !game.max_buyin || game.max_buyin <= parseInt(filters.maxBuyin));
    }

    // Days ahead filter
    if (filters.daysAhead) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + filters.daysAhead);
      result = result.filter(game => new Date(game.scheduled_date) <= cutoffDate);
    }

    setFilteredGames(result);
  }, [games, searchQuery, filters]);

  const loadGames = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/captain/home-games/groups?visibility=public,friends', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.groups) {
        setGames(data.groups);
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;

    try {
      const token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        router.push('/login?redirect=/hub/captain/home-games');
        return;
      }

      const res = await fetch(`/api/captain/home-games/join/${joinCode.trim()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.membership) {
        setMessage({ type: 'success', text: 'Successfully joined ' + (data.group?.name || 'the group') });
        setShowJoinModal(false);
        setJoinCode('');
        loadGames();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to join' });
      }
    } catch (err) {
      console.error('Join error:', err);
      setMessage({ type: 'error', text: 'Failed to join game' });
    }
    setTimeout(() => setMessage(null), 4000);
  };

  const handleJoinGame = (game) => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/login?redirect=/hub/captain/home-games');
      return;
    }
    router.push(`/hub/captain/home-games/${game.id}`);
  };

  return (
    <>
      <Head>
        <title>Home Games | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cap-page">
        {/* Notification Banner */}
        {message && (
          <div className={`fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center font-bold uppercase tracking-wide ${
            message.type === 'success'
              ? 'bg-[#10B981]/20 border-b-2 border-[#10B981] text-[#10B981]'
              : 'bg-[#EF4444]/20 border-b-2 border-[#EF4444] text-[#EF4444]'
          }`}>
            {message.text}
          </div>
        )}

        {/* Header */}
        <header className="cap-header-full">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="cap-icon-box cap-icon-box-glow w-14 h-14">
                  <Home className="w-7 h-7" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-white tracking-wider cap-text-glow">HOME GAMES</h1>
                  <p className="text-sm text-[#64748B] font-medium tracking-wide">Find or host private poker games</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="cap-btn cap-btn-secondary"
                >
                  <QrCode size={18} />
                  JOIN BY CODE
                </button>
                <button
                  onClick={() => router.push('/hub/captain/home-games/create')}
                  className="cap-btn cap-btn-primary"
                >
                  <UserPlus size={18} />
                  HOST GAME
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Search */}
        <div className="border-b-2 border-[#4A5E78] bg-[#0F1C32]">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  type="text"
                  placeholder="Search by city, game type, or host..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="cap-input pl-12"
                />
              </div>
              <button
                onClick={() => setShowFiltersModal(true)}
                className="cap-btn cap-btn-secondary"
              >
                <Filter size={18} />
                FILTERS
                {(filters.gameType !== 'all' || filters.maxBuyin) && (
                  <span className="w-2 h-2 bg-[#22D3EE] rounded-full shadow-[0_0_6px_rgba(34,211,238,0.6)]"></span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Games Grid */}
        <div className="max-w-6xl mx-auto px-4 py-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div
                  key={i}
                  className="h-64 rounded-xl animate-pulse bg-[#132240]"
                />
              ))}
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="cap-panel p-12 text-center">
              <div className="cap-icon-box mx-auto mb-4">
                <Home className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">
                {searchQuery || filters.gameType !== 'all' ? 'No matching games found' : 'No home games found'}
              </h3>
              <p className="text-[#64748B] mt-1">
                {searchQuery || filters.gameType !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Be the first to host a game in your area!'
                }
              </p>
              {searchQuery || filters.gameType !== 'all' ? (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilters({ gameType: 'all', maxBuyin: '', daysAhead: 30 });
                  }}
                  className="cap-btn cap-btn-secondary mt-4"
                >
                  CLEAR FILTERS
                </button>
              ) : (
                <button
                  onClick={() => router.push('/hub/captain/home-games/create')}
                  className="cap-btn cap-btn-primary mt-4"
                >
                  HOST A GAME
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGames.map(game => (
                <HomeGameCard
                  key={game.id}
                  game={game}
                  onJoin={handleJoinGame}
                />
              ))}
            </div>
          )}
        </div>

        {/* Join by Code Modal */}
        {showJoinModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="cap-panel cap-corner-lights p-6 w-full max-w-md mx-4">
              <span className="cap-light cap-light-tl" />
              <span className="cap-light cap-light-br" />
              <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wide">Join by Invite Code</h3>
              <p className="text-sm text-[#64748B] mb-4">
                Enter the invite code or club code shared by the host
              </p>
              <input
                type="text"
                placeholder="Enter code (e.g., ABC123)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="cap-input text-center text-lg font-mono tracking-wider"
                maxLength={8}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="cap-btn cap-btn-secondary flex-1 justify-center"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleJoinByCode}
                  disabled={!joinCode.trim()}
                  className="cap-btn cap-btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  JOIN
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filters Modal */}
        {showFiltersModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="cap-panel cap-corner-lights p-6 w-full max-w-md mx-4">
              <span className="cap-light cap-light-tl" />
              <span className="cap-light cap-light-br" />
              <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wide">Filter Games</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-[#CBD5E1] mb-2 uppercase tracking-wide">Game Type</label>
                  <select
                    value={filters.gameType}
                    onChange={(e) => setFilters(prev => ({ ...prev, gameType: e.target.value }))}
                    className="cap-input"
                  >
                    <option value="all">All Types</option>
                    <option value="nlhe">No Limit Hold'em</option>
                    <option value="plo">Pot Limit Omaha</option>
                    <option value="mixed">Mixed Games</option>
                    <option value="limit">Limit Hold'em</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#CBD5E1] mb-2 uppercase tracking-wide">Max Buy-in</label>
                  <select
                    value={filters.maxBuyin}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxBuyin: e.target.value }))}
                    className="cap-input"
                  >
                    <option value="">Any Amount</option>
                    <option value="100">Up to $100</option>
                    <option value="200">Up to $200</option>
                    <option value="500">Up to $500</option>
                    <option value="1000">Up to $1,000</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#CBD5E1] mb-2 uppercase tracking-wide">Days Ahead</label>
                  <select
                    value={filters.daysAhead}
                    onChange={(e) => setFilters(prev => ({ ...prev, daysAhead: parseInt(e.target.value) }))}
                    className="cap-input"
                  >
                    <option value="7">Next 7 days</option>
                    <option value="14">Next 14 days</option>
                    <option value="30">Next 30 days</option>
                    <option value="90">Next 90 days</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setFilters({ gameType: 'all', maxBuyin: '', daysAhead: 30 });
                  }}
                  className="cap-btn cap-btn-secondary flex-1 justify-center"
                >
                  RESET
                </button>
                <button
                  onClick={() => setShowFiltersModal(false)}
                  className="cap-btn cap-btn-primary flex-1 justify-center"
                >
                  APPLY FILTERS
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
