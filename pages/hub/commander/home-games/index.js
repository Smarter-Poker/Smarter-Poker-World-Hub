/**
 * Player Home Games Hub
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * /hub/commander/home-games - Find and join home games
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Home, MapPin, Calendar, Users, Clock, Lock, Globe,
  UserPlus, Search, Filter, QrCode, ChevronRight, Star, Zap
} from 'lucide-react';
import EventCard from '../../../../src/components/commander/home-games/EventCard';
import GroupCard from '../../../../src/components/commander/home-games/GroupCard';

/* Inline HomeGameCard replaced by shared GroupCard component */

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
  const [activeTab, setActiveTab] = useState('my-games');
  const [discoverGames, setDiscoverGames] = useState([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    if (activeTab === 'discover' && discoverGames.length === 0) {
      loadDiscoverGames();
    }
  }, [activeTab]);

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
      const res = await fetch('/api/commander/home-games/groups?visibility=public,friends', {
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
        router.push('/auth/login?redirect=/hub/commander/home-games');
        return;
      }

      const res = await fetch(`/api/commander/home-games/join/${joinCode.trim()}`, {
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

  const loadDiscoverGames = async () => {
    setDiscoverLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/commander/home-games/discover?type=groups&limit=20', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.groups) {
        setDiscoverGames(data.groups);
      }
    } catch (err) {
      console.error('Discover load error:', err);
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleJoinGame = (game) => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/auth/login?redirect=/hub/commander/home-games');
      return;
    }
    router.push(`/hub/commander/home-games/${game.id}`);
  };

  return (
    <>
      <Head>
        <title>Home Games | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
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
        <header className="cmd-header-full">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="cmd-icon-box cmd-icon-box-glow w-14 h-14">
                  <Home className="w-7 h-7" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-white tracking-wider cmd-text-glow">HOME GAMES</h1>
                  <p className="text-sm text-[#64748B] font-medium tracking-wide">Find or host private poker games</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="cmd-btn cmd-btn-secondary"
                >
                  <QrCode size={18} />
                  JOIN BY CODE
                </button>
                <button
                  onClick={() => router.push('/hub/commander/home-games/create')}
                  className="cmd-btn cmd-btn-primary"
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
                  className="cmd-input pl-12"
                />
              </div>
              <button
                onClick={() => setShowFiltersModal(true)}
                className="cmd-btn cmd-btn-secondary"
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

        {/* Tabs */}
        <div className="border-b-2 border-[#4A5E78] bg-[#0F1C32]">
          <div className="max-w-6xl mx-auto px-4 flex gap-1">
            <button
              onClick={() => setActiveTab('my-games')}
              className={`px-4 py-3 text-sm font-bold uppercase tracking-wide border-b-2 transition-colors ${
                activeTab === 'my-games'
                  ? 'border-[#22D3EE] text-[#22D3EE]'
                  : 'border-transparent text-[#64748B] hover:text-white'
              }`}
            >
              My Games
            </button>
            <button
              onClick={() => setActiveTab('discover')}
              className={`px-4 py-3 text-sm font-bold uppercase tracking-wide border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'discover'
                  ? 'border-[#22D3EE] text-[#22D3EE]'
                  : 'border-transparent text-[#64748B] hover:text-white'
              }`}
            >
              <Globe size={16} />
              Discover
            </button>
          </div>
        </div>

        {/* Games Grid */}
        <div className="max-w-6xl mx-auto px-4 py-6">
          {activeTab === 'discover' ? (
            discoverLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-64 rounded-xl animate-pulse bg-[#132240]" />
                ))}
              </div>
            ) : discoverGames.length === 0 ? (
              <div className="cmd-panel p-12 text-center">
                <div className="cmd-icon-box mx-auto mb-4">
                  <Globe className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-white">No public games found</h3>
                <p className="text-[#64748B] mt-1">Check back later or host your own game</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {discoverGames.map(game => (
                  <GroupCard
                    key={game.id}
                    group={{
                      ...game,
                      is_private: false,
                      member_count: game.member_count || 0,
                      default_game_type: game.default_game_type,
                      default_stakes: game.default_stakes
                    }}
                    onClick={() => handleJoinGame(game)}
                  />
                ))}
              </div>
            )
          ) : isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div
                  key={i}
                  className="h-64 rounded-xl animate-pulse bg-[#132240]"
                />
              ))}
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="cmd-panel p-12 text-center">
              <div className="cmd-icon-box mx-auto mb-4">
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
                  className="cmd-btn cmd-btn-secondary mt-4"
                >
                  CLEAR FILTERS
                </button>
              ) : (
                <button
                  onClick={() => router.push('/hub/commander/home-games/create')}
                  className="cmd-btn cmd-btn-primary mt-4"
                >
                  HOST A GAME
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGames.map(game => (
                <GroupCard
                  key={game.id}
                  group={{
                    ...game,
                    is_private: game.visibility === 'private',
                    member_count: game.rsvp_count || 0,
                    default_game_type: game.game_type,
                    default_stakes: game.stakes
                  }}
                  onClick={() => handleJoinGame(game)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Join by Code Modal */}
        {showJoinModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="cmd-panel cmd-corner-lights p-6 w-full max-w-md mx-4">
              <span className="cmd-light cmd-light-tl" />
              <span className="cmd-light cmd-light-br" />
              <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wide">Join by Invite Code</h3>
              <p className="text-sm text-[#64748B] mb-4">
                Enter the invite code or club code shared by the host
              </p>
              <input
                type="text"
                placeholder="Enter code (e.g., ABC123)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="cmd-input text-center text-lg font-mono tracking-wider"
                maxLength={8}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="cmd-btn cmd-btn-secondary flex-1 justify-center"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleJoinByCode}
                  disabled={!joinCode.trim()}
                  className="cmd-btn cmd-btn-primary flex-1 justify-center disabled:opacity-50"
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
            <div className="cmd-panel cmd-corner-lights p-6 w-full max-w-md mx-4">
              <span className="cmd-light cmd-light-tl" />
              <span className="cmd-light cmd-light-br" />
              <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wide">Filter Games</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-[#CBD5E1] mb-2 uppercase tracking-wide">Game Type</label>
                  <select
                    value={filters.gameType}
                    onChange={(e) => setFilters(prev => ({ ...prev, gameType: e.target.value }))}
                    className="cmd-input"
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
                    className="cmd-input"
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
                    className="cmd-input"
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
                  className="cmd-btn cmd-btn-secondary flex-1 justify-center"
                >
                  RESET
                </button>
                <button
                  onClick={() => setShowFiltersModal(false)}
                  className="cmd-btn cmd-btn-primary flex-1 justify-center"
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
