/**
 * Agent Players Management Page
 * View and manage players referred by an agent
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
  Users,
  Search,
  Loader2,
  User,
  DollarSign,
  TrendingUp,
  Calendar,
  MoreVertical,
  UserPlus,
  X,
  Check,
  Clock,
  Activity
} from 'lucide-react';

function PlayerCard({ player, onViewDetails }) {
  const statusColors = {
    active: { bg: 'bg-[#10B981]/10', text: 'text-[#10B981]' },
    inactive: { bg: 'bg-[#6B7280]/10', text: 'text-[#6B7280]' },
    churned: { bg: 'bg-[#EF4444]/10', text: 'text-[#EF4444]' }
  };

  const colors = statusColors[player.status] || statusColors.active;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {player.avatar_url || player.profiles?.avatar_url ? (
            <img
              src={player.avatar_url || player.profiles?.avatar_url}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
              <User className="w-5 h-5 text-[#1877F2]" />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-[#1F2937]">
              {player.display_name || player.profiles?.display_name || 'Unknown Player'}
            </h3>
            <p className="text-sm text-[#6B7280]">
              Joined {new Date(player.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text} capitalize`}>
          {player.status || 'active'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 py-3 border-t border-[#E5E7EB]">
        <div className="text-center">
          <p className="text-lg font-bold text-[#1F2937]">{player.total_sessions || 0}</p>
          <p className="text-xs text-[#6B7280]">Sessions</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[#1F2937]">{player.total_hours || 0}h</p>
          <p className="text-xs text-[#6B7280]">Played</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[#10B981]">${(player.total_rake || 0).toLocaleString()}</p>
          <p className="text-xs text-[#6B7280]">Rake Gen.</p>
        </div>
      </div>

      {player.last_session_at && (
        <div className="pt-3 border-t border-[#E5E7EB]">
          <p className="text-xs text-[#6B7280] flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last played: {new Date(player.last_session_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

function AddPlayerModal({ isOpen, onClose, onSubmit, agentId }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSearch() {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.profiles) {
        setSearchResults(data.profiles);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit() {
    if (!selectedPlayer) return;

    setSubmitting(true);
    try {
      await onSubmit(selectedPlayer.id);
      onClose();
    } catch (err) {
      console.error('Add player error:', err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
          <h3 className="text-lg font-semibold text-[#1F2937]">Add Player</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#F3F4F6] rounded-lg">
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by name or email..."
              className="flex-1 h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 h-11 bg-[#1877F2] text-white rounded-lg hover:bg-[#1665D8] disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2">
            {searchResults.length === 0 ? (
              <p className="text-center text-[#6B7280] py-4">
                Search for a player to add
              </p>
            ) : (
              searchResults.map(player => (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayer(player)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    selectedPlayer?.id === player.id
                      ? 'border-[#1877F2] bg-[#1877F2]/5'
                      : 'border-[#E5E7EB] hover:border-[#1877F2]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {player.avatar_url ? (
                      <img src={player.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-[#1877F2]" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-[#1F2937]">{player.display_name}</p>
                      <p className="text-sm text-[#6B7280]">{player.email}</p>
                    </div>
                    {selectedPlayer?.id === player.id && (
                      <Check className="w-5 h-5 text-[#1877F2] ml-auto" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[#E5E7EB]">
          <button
            onClick={handleSubmit}
            disabled={!selectedPlayer || submitting}
            className="w-full h-11 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1665D8] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
            Add Player
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgentPlayersPage() {
  const router = useRouter();
  const { agentId } = router.query;

  const [agent, setAgent] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (agentId) {
      loadData();
    }
  }, [agentId]);

  async function loadData() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        router.push('/login');
        return;
      }

      // Load agent details
      const agentRes = await fetch(`/api/captain/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const agentData = await agentRes.json();
      if (agentData.success) {
        setAgent(agentData.data?.agent);
      }

      // Load agent's players
      const playersRes = await fetch(`/api/captain/agents/${agentId}/players`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const playersData = await playersRes.json();
      if (playersData.success) {
        setPlayers(playersData.data?.players || []);
      }
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPlayer(playerId) {
    const token = localStorage.getItem('smarter-poker-auth');
    const res = await fetch(`/api/captain/agents/${agentId}/players`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ player_id: playerId })
    });

    const data = await res.json();
    if (data.success) {
      loadData();
    }
  }

  const filteredPlayers = players.filter(player => {
    if (filter !== 'all' && player.status !== filter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const name = (player.display_name || player.profiles?.display_name || '').toLowerCase();
      return name.includes(query);
    }
    return true;
  });

  // Calculate summary stats
  const stats = {
    total: players.length,
    active: players.filter(p => p.status === 'active').length,
    totalRake: players.reduce((sum, p) => sum + (p.total_rake || 0), 0),
    totalSessions: players.reduce((sum, p) => sum + (p.total_sessions || 0), 0)
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{agent?.display_name || 'Agent'} Players | Captain</title>
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/captain/union/agents')}
                  className="p-2 hover:bg-[#F3F4F6] rounded-lg"
                >
                  <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-[#1F2937]">
                    {agent?.display_name || 'Agent'}'s Players
                  </h1>
                  <p className="text-sm text-[#6B7280]">
                    {stats.total} players, {stats.active} active
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1665D8]"
              >
                <UserPlus className="w-4 h-4" />
                Add Player
              </button>
            </div>
          </div>
        </header>

        {/* Stats */}
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <p className="text-sm text-[#6B7280]">Total Players</p>
              <p className="text-2xl font-bold text-[#1F2937]">{stats.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <p className="text-sm text-[#6B7280]">Active</p>
              <p className="text-2xl font-bold text-[#10B981]">{stats.active}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <p className="text-sm text-[#6B7280]">Total Sessions</p>
              <p className="text-2xl font-bold text-[#1877F2]">{stats.totalSessions}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <p className="text-sm text-[#6B7280]">Rake Generated</p>
              <p className="text-2xl font-bold text-[#10B981]">${stats.totalRake.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="max-w-6xl mx-auto px-4 pb-4">
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search players..."
                  className="w-full h-10 pl-10 pr-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-10 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="churned">Churned</option>
              </select>
            </div>
          </div>
        </div>

        {/* Players Grid */}
        <main className="max-w-6xl mx-auto px-4 pb-8">
          {filteredPlayers.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <Users className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#6B7280]">
                {searchQuery ? 'No players match your search' : 'No players yet'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg"
                >
                  Add First Player
                </button>
              )}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPlayers.map(player => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  onViewDetails={() => {}}
                />
              ))}
            </div>
          )}
        </main>

        {/* Add Player Modal */}
        <AddPlayerModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddPlayer}
          agentId={agentId}
        />
      </div>
    </>
  );
}
