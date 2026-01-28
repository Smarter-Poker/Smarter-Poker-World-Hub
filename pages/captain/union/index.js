/**
 * Union Dashboard - Main view for union owners
 * Manage multiple venues, agents, and view cross-venue analytics
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import {
  Building2, Users, BarChart3, Settings, Plus, ChevronRight,
  TrendingUp, TrendingDown, Minus, Clock, DollarSign, Loader2,
  MapPin, Activity, UserPlus, Layers
} from 'lucide-react';

function StatCard({ title, value, change, icon: Icon, color = '#1877F2' }) {
  const isPositive = change > 0;
  const isNeutral = change === 0;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-sm ${
            isPositive ? 'text-[#10B981]' :
            isNeutral ? 'text-[#6B7280]' : 'text-[#EF4444]'
          }`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> :
             isNeutral ? <Minus className="w-4 h-4" /> :
             <TrendingDown className="w-4 h-4" />}
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-[#1F2937]">{value}</p>
      <p className="text-sm text-[#6B7280]">{title}</p>
    </div>
  );
}

function VenueCard({ venue, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl border border-[#E5E7EB] p-4 text-left hover:border-[#1877F2] transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-[#1F2937]">{venue.poker_venues?.name || 'Unknown Venue'}</h3>
          <p className="text-sm text-[#6B7280] flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" />
            {venue.poker_venues?.city}, {venue.poker_venues?.state}
          </p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          venue.tier === 'flagship' ? 'bg-[#8B5CF6]/10 text-[#8B5CF6]' :
          venue.tier === 'premium' ? 'bg-[#F59E0B]/10 text-[#F59E0B]' :
          'bg-[#6B7280]/10 text-[#6B7280]'
        }`}>
          {venue.tier}
        </span>
      </div>
      <div className="flex items-center gap-4 mt-3 text-sm">
        <span className="flex items-center gap-1 text-[#10B981]">
          <Activity className="w-4 h-4" />
          {venue.active_games || 0} active
        </span>
        <span className="flex items-center gap-1 text-[#6B7280]">
          <Users className="w-4 h-4" />
          {venue.waiting_players || 0} waiting
        </span>
      </div>
    </button>
  );
}

export default function UnionDashboard() {
  const router = useRouter();
  const [unions, setUnions] = useState([]);
  const [selectedUnion, setSelectedUnion] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUnions();
  }, []);

  useEffect(() => {
    if (selectedUnion) {
      loadAnalytics(selectedUnion.id);
    }
  }, [selectedUnion]);

  async function loadUnions() {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        router.push('/login?redirect=/captain/union');
        return;
      }

      const res = await fetch('/api/captain/unions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        const owned = data.data?.owned_unions || [];
        setUnions(owned);
        if (owned.length > 0) {
          setSelectedUnion(owned[0]);
        }
      }
    } catch (err) {
      console.error('Load unions error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadAnalytics(unionId) {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/unions/${unionId}/analytics?period=30d`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        setAnalytics(data.data);
      }
    } catch (err) {
      console.error('Load analytics error:', err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  if (unions.length === 0) {
    return (
      <>
        <Head>
          <title>Union Management | Captain</title>
        </Head>
        <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-[#1877F2]/10 flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-[#1877F2]" />
            </div>
            <h1 className="text-2xl font-bold text-[#1F2937] mb-2">Create Your Union</h1>
            <p className="text-[#6B7280] mb-6">
              Manage multiple poker venues under one organization. Track cross-venue analytics,
              manage agents, and share resources.
            </p>
            <button
              onClick={() => router.push('/captain/union/create')}
              className="px-6 py-3 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9]"
            >
              Create Union
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{selectedUnion?.name || 'Union'} | Captain</title>
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {selectedUnion?.logo_url ? (
                <img src={selectedUnion.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[#1877F2]/10 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-[#1877F2]" />
                </div>
              )}
              <div>
                <h1 className="font-bold text-[#1F2937]">{selectedUnion?.name}</h1>
                <p className="text-sm text-[#6B7280]">
                  {selectedUnion?.venue_count || 0} venues, {selectedUnion?.agent_count || 0} agents
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/captain/union/agents"
                className="px-4 py-2 text-[#6B7280] hover:text-[#1F2937] font-medium"
              >
                Agents
              </Link>
              <Link
                href="/captain/union/settings"
                className="p-2 hover:bg-[#F3F4F6] rounded-lg"
              >
                <Settings className="w-5 h-5 text-[#6B7280]" />
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          {/* Stats */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Total Venues"
              value={analytics?.summary?.total_venues || 0}
              icon={Building2}
              color="#1877F2"
            />
            <StatCard
              title="Active Games"
              value={analytics?.summary?.total_active_games || 0}
              icon={Activity}
              color="#10B981"
            />
            <StatCard
              title="Players Now"
              value={analytics?.summary?.total_players_in_games || 0}
              icon={Users}
              color="#8B5CF6"
            />
            <StatCard
              title="Sessions (30d)"
              value={analytics?.summary?.total_sessions || 0}
              change={12}
              icon={Clock}
              color="#F59E0B"
            />
          </section>

          {/* Venues Grid */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#1F2937]">Venues</h2>
              <button
                onClick={() => router.push('/captain/union/venues/add')}
                className="flex items-center gap-2 px-3 py-2 text-[#1877F2] font-medium hover:bg-[#1877F2]/5 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                Add Venue
              </button>
            </div>

            {analytics?.venues?.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                <Building2 className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                <p className="text-[#6B7280]">No venues in this union yet</p>
                <button
                  onClick={() => router.push('/captain/union/venues/add')}
                  className="mt-4 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg"
                >
                  Add First Venue
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(selectedUnion?.captain_union_venues || []).map(venue => (
                  <VenueCard
                    key={venue.id}
                    venue={{
                      ...venue,
                      ...analytics?.venues?.find(v => v.id === venue.venue_id)
                    }}
                    onClick={() => router.push(`/captain/dashboard?venue=${venue.venue_id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Quick Actions */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/captain/union/analytics')}
              className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-left hover:border-[#1877F2] transition-colors flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-lg bg-[#10B981]/10 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-[#10B981]" />
              </div>
              <div>
                <h3 className="font-semibold text-[#1F2937]">View Analytics</h3>
                <p className="text-sm text-[#6B7280]">Cross-venue reports</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#9CA3AF] ml-auto" />
            </button>

            <button
              onClick={() => router.push('/captain/union/agents')}
              className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-left hover:border-[#1877F2] transition-colors flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-lg bg-[#8B5CF6]/10 flex items-center justify-center">
                <UserPlus className="w-6 h-6 text-[#8B5CF6]" />
              </div>
              <div>
                <h3 className="font-semibold text-[#1F2937]">Manage Agents</h3>
                <p className="text-sm text-[#6B7280]">{selectedUnion?.agent_count || 0} agents</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#9CA3AF] ml-auto" />
            </button>

            <button
              onClick={() => router.push('/captain/union/settings')}
              className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-left hover:border-[#1877F2] transition-colors flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
                <Settings className="w-6 h-6 text-[#F59E0B]" />
              </div>
              <div>
                <h3 className="font-semibold text-[#1F2937]">Union Settings</h3>
                <p className="text-sm text-[#6B7280]">Configure options</p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#9CA3AF] ml-auto" />
            </button>
          </section>
        </main>
      </div>
    </>
  );
}
