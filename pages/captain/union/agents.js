/**
 * Union Agents Management Page
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, UserPlus, Users, Search, Filter, MoreVertical,
  DollarSign, TrendingUp, Shield, User, Loader2, X, Check
} from 'lucide-react';

function AgentCard({ agent, onEdit, onViewPlayers }) {
  const roleColors = {
    super_agent: { bg: 'bg-[#8B5CF6]/10', text: 'text-[#8B5CF6]' },
    agent: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]' },
    sub_agent: { bg: 'bg-[#6B7280]/10', text: 'text-[#6B7280]' }
  };

  const colors = roleColors[agent.role] || roleColors.agent;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {agent.avatar_url || agent.profiles?.avatar_url ? (
            <img
              src={agent.avatar_url || agent.profiles?.avatar_url}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
              <User className="w-5 h-5 text-[#1877F2]" />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-[#1F2937]">{agent.display_name}</h3>
            <p className="text-sm text-[#6B7280]">Code: {agent.agent_code}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
          {agent.role.replace('_', ' ')}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 py-3 border-t border-b border-[#E5E7EB] my-3">
        <div className="text-center">
          <p className="text-lg font-bold text-[#1F2937]">{agent.total_players_referred || 0}</p>
          <p className="text-xs text-[#6B7280]">Players</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[#1F2937]">{agent.active_players || 0}</p>
          <p className="text-xs text-[#6B7280]">Active</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[#10B981]">${(agent.total_commission_earned || 0).toLocaleString()}</p>
          <p className="text-xs text-[#6B7280]">Earned</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onViewPlayers?.(agent)}
          className="flex-1 py-2 text-sm font-medium text-[#1877F2] hover:bg-[#1877F2]/5 rounded-lg"
        >
          View Players
        </button>
        <button
          onClick={() => onEdit?.(agent)}
          className="flex-1 py-2 text-sm font-medium text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function CreateAgentModal({ isOpen, onClose, onSubmit, unionId }) {
  const [formData, setFormData] = useState({
    display_name: '',
    email: '',
    phone: '',
    role: 'agent',
    commission_rate: 10,
    commission_type: 'rake'
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!formData.display_name.trim()) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/unions/${unionId}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (data.success) {
        onSubmit?.(data.data?.agent);
        onClose();
        setFormData({
          display_name: '',
          email: '',
          phone: '',
          role: 'agent',
          commission_rate: 10,
          commission_type: 'rake'
        });
      }
    } catch (err) {
      console.error('Create agent error:', err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
          <h3 className="text-lg font-semibold text-[#1F2937]">Add Agent</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#F3F4F6] rounded-lg">
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Name *</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
              placeholder="Agent name"
              className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="agent@email.com"
                className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="555-123-4567"
                className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            >
              <option value="super_agent">Super Agent</option>
              <option value="agent">Agent</option>
              <option value="sub_agent">Sub Agent</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">Commission %</label>
              <input
                type="number"
                value={formData.commission_rate}
                onChange={(e) => setFormData(prev => ({ ...prev, commission_rate: parseFloat(e.target.value) || 0 }))}
                min="0"
                max="100"
                step="0.5"
                className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">Commission Type</label>
              <select
                value={formData.commission_type}
                onChange={(e) => setFormData(prev => ({ ...prev, commission_type: e.target.value }))}
                className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              >
                <option value="rake">Rake %</option>
                <option value="player_loss">Player Loss %</option>
                <option value="flat">Flat Fee</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#E5E7EB]">
          <button
            onClick={handleSubmit}
            disabled={!formData.display_name.trim() || submitting}
            className="w-full h-11 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
            Add Agent
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UnionAgentsPage() {
  const router = useRouter();
  const [unions, setUnions] = useState([]);
  const [selectedUnion, setSelectedUnion] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        router.push('/login');
        return;
      }

      const res = await fetch('/api/captain/unions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success && data.data?.owned_unions?.length > 0) {
        const unions = data.data.owned_unions;
        setUnions(unions);
        setSelectedUnion(unions[0]);
        loadAgents(unions[0].id);
      }
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadAgents(unionId) {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/unions/${unionId}/agents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        setAgents(data.data?.agents || []);
      }
    } catch (err) {
      console.error('Load agents error:', err);
    }
  }

  const filteredAgents = agents.filter(agent => {
    if (filter !== 'all' && agent.role !== filter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        agent.display_name?.toLowerCase().includes(query) ||
        agent.agent_code?.toLowerCase().includes(query) ||
        agent.email?.toLowerCase().includes(query)
      );
    }
    return true;
  });

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
        <title>Agents | {selectedUnion?.name || 'Union'}</title>
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/captain/union')}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg"
              >
                <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
              </button>
              <div>
                <h1 className="font-bold text-[#1F2937]">Agent Management</h1>
                <p className="text-sm text-[#6B7280]">{agents.length} agents</p>
              </div>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9]"
            >
              <UserPlus className="w-4 h-4" />
              Add Agent
            </button>
          </div>
        </header>

        {/* Filters */}
        <div className="bg-white border-b border-[#E5E7EB]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-10 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            >
              <option value="all">All Roles</option>
              <option value="super_agent">Super Agents</option>
              <option value="agent">Agents</option>
              <option value="sub_agent">Sub Agents</option>
            </select>
          </div>
        </div>

        <main className="max-w-6xl mx-auto px-4 py-6">
          {filteredAgents.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <Users className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#6B7280]">
                {searchQuery ? 'No agents match your search' : 'No agents yet'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg"
                >
                  Add First Agent
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAgents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onEdit={(a) => console.log('Edit agent:', a)}
                  onViewPlayers={(a) => router.push(`/captain/union/agents/${a.id}/players`)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <CreateAgentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={() => loadAgents(selectedUnion?.id)}
        unionId={selectedUnion?.id}
      />
    </>
  );
}
