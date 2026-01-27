/**
 * Player Home Games Hub
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * /hub/captain/home-games - Find and join home games
 */
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Home, MapPin, Calendar, Users, Clock, Lock, Globe,
  UserPlus, Search, Filter, QrCode, ChevronRight, Star
} from 'lucide-react';

function HomeGameCard({ game, onJoin }) {
  const gameDate = new Date(game.scheduled_date);
  const isPrivate = game.visibility === 'private';
  const isFull = game.rsvp_count >= game.max_players;

  return (
    <div
      className="bg-white rounded-xl border overflow-hidden hover:shadow-lg transition-shadow"
      style={{ borderColor: '#E5E7EB' }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {game.host_avatar ? (
              <img src={game.host_avatar} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#1877F220' }}
              >
                <Home size={20} style={{ color: '#1877F2' }} />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-gray-900">{game.name}</h3>
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <span>Hosted by {game.host_name || 'Anonymous'}</span>
                {game.host_rating && (
                  <span className="flex items-center gap-0.5 ml-2">
                    <Star size={12} fill="#F59E0B" className="text-yellow-500" />
                    {game.host_rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
            isPrivate ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'
          }`}>
            {isPrivate ? <Lock size={12} /> : <Globe size={12} />}
            {game.visibility}
          </span>
        </div>

        {/* Game details */}
        <div className="space-y-2 mb-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <span>{gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span className="text-gray-400">at</span>
            <span>{gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-gray-400" />
            <span>{game.city}, {game.state}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-400" />
            <span>{game.rsvp_count || 0} / {game.max_players} players</span>
            {isFull && <span className="text-red-500 text-xs">(Full)</span>}
          </div>
        </div>

        {/* Game type and stakes */}
        <div className="flex gap-2 mb-4">
          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
            {game.game_type?.toUpperCase() || 'NLHE'}
          </span>
          <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
            {game.stakes || '$1/$2'}
          </span>
          {game.min_buyin && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
              Min: ${game.min_buyin}
            </span>
          )}
        </div>

        {/* Description */}
        {game.description && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">
            {game.description}
          </p>
        )}

        {/* Action */}
        <button
          onClick={() => onJoin?.(game)}
          disabled={isFull}
          className={`w-full py-3 rounded-lg text-sm font-medium ${
            isFull
              ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
              : 'text-white'
          }`}
          style={!isFull ? { backgroundColor: '#1877F2' } : {}}
        >
          {isFull ? 'Game Full' : game.requires_approval ? 'Request to Join' : 'Join Game'}
        </button>
      </div>
    </div>
  );
}

export default function PlayerHomeGamesHub() {
  const router = useRouter();
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [joinCode, setJoinCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadGames();
  }, []);

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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="min-h-screen" style={{ backgroundColor: '#F9FAFB', fontFamily: 'Inter, sans-serif' }}>
        {/* Notification Banner */}
        {message && (
          <div
            className={`fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center text-white font-medium ${
              message.type === 'success' ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Header */}
        <header className="bg-white border-b" style={{ borderColor: '#E5E7EB' }}>
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Home size={28} style={{ color: '#1877F2' }} />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Home Games</h1>
                  <p className="text-sm text-gray-500">Find or host private poker games</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
                  style={{ borderColor: '#E5E7EB' }}
                >
                  <QrCode size={18} />
                  Join by Code
                </button>
                <button
                  onClick={() => router.push('/hub/captain/home-games/create')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: '#1877F2' }}
                >
                  <UserPlus size={18} />
                  Host Game
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Search */}
        <div className="bg-white border-b" style={{ borderColor: '#E5E7EB' }}>
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by city, game type, or host..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border"
                  style={{ borderColor: '#E5E7EB' }}
                />
              </div>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg border" style={{ borderColor: '#E5E7EB' }}>
                <Filter size={18} className="text-gray-600" />
                Filters
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
                  className="h-64 rounded-xl animate-pulse"
                  style={{ backgroundColor: '#E5E7EB' }}
                />
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="text-center py-12">
              <Home size={48} className="mx-auto text-gray-400 mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No home games found</h3>
              <p className="text-gray-500 mt-1">Be the first to host a game in your area!</p>
              <button
                onClick={() => router.push('/hub/captain/home-games/create')}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: '#1877F2' }}
              >
                Host a Game
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {games.map(game => (
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Join by Invite Code</h3>
              <p className="text-sm text-gray-500 mb-4">
                Enter the invite code or club code shared by the host
              </p>
              <input
                type="text"
                placeholder="Enter code (e.g., ABC123)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 rounded-lg border text-center text-lg font-mono tracking-wider"
                style={{ borderColor: '#E5E7EB' }}
                maxLength={8}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 py-3 rounded-lg text-sm font-medium border"
                  style={{ borderColor: '#E5E7EB' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleJoinByCode}
                  disabled={!joinCode.trim()}
                  className="flex-1 py-3 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#1877F2' }}
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
