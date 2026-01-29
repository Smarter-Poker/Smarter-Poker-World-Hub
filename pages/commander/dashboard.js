/**
 * Commander Staff Dashboard - Main terminal view
 * Based on PokerAtlas TableCaptain / Bravo Poker patterns
 * Dark industrial sci-fi gaming theme
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  LogOut, RefreshCw, Wifi, WifiOff, Menu, X,
  Trophy, Gift, BarChart3, Users, Settings, Home, Grid3X3, QrCode, FileText, AlertTriangle, UserCog, Video,
  Lightbulb, Clock, ArrowRightLeft, ChevronRight
} from 'lucide-react';
import GameGrid from '../../src/components/commander/staff/GameGrid';
import WaitlistManager from '../../src/components/commander/staff/WaitlistManager';
import QuickActions from '../../src/components/commander/staff/QuickActions';
import ActivityFeed, { createActivity } from '../../src/components/commander/staff/ActivityFeed';
import OpenGameModal from '../../src/components/commander/modals/OpenGameModal';
import AddWalkInModal from '../../src/components/commander/modals/AddWalkInModal';
import SeatPlayerModal from '../../src/components/commander/modals/SeatPlayerModal';
import { useRealtimeUpdates } from '../../src/lib/commander/useRealtimeUpdates';

export default function CommanderDashboard() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [venue, setVenue] = useState(null);
  const [games, setGames] = useState([]);
  const [tables, setTables] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [showOpenGameModal, setShowOpenGameModal] = useState(false);
  const [showAddWalkInModal, setShowAddWalkInModal] = useState(false);
  const [showSeatPlayerModal, setShowSeatPlayerModal] = useState(false);
  const [playerToSeat, setPlayerToSeat] = useState(null);
  const [showNav, setShowNav] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [waitTimePredictions, setWaitTimePredictions] = useState([]);

  const navItems = [
    { href: '/commander/dashboard', label: 'Dashboard', icon: Home, active: true },
    { href: '/commander/tables', label: 'Tables', icon: Grid3X3 },
    { href: '/commander/tournaments', label: 'Tournaments', icon: Trophy },
    { href: '/commander/promotions', label: 'Promotions', icon: Gift },
    { href: '/commander/marketplace', label: 'Marketplace', icon: Users },
    { href: '/commander/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/commander/reports', label: 'Daily Reports', icon: FileText },
    { href: '/commander/incidents', label: 'Incidents', icon: AlertTriangle },
    { href: '/commander/dealers', label: 'Dealers', icon: UserCog },
    { href: '/commander/streaming', label: 'Streaming', icon: Video },
    { href: '/commander/qr-code', label: 'Check-In QR', icon: QrCode },
    { href: '/commander/staff', label: 'Staff', icon: Users },
    { href: '/commander/settings', label: 'Settings', icon: Settings },
  ];

  // Check staff session on mount
  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        localStorage.removeItem('commander_staff');
        router.push('/commander/login');
        return;
      }

      setStaff(staffData);
      setVenueId(staffData.venue_id);

      // Set venue name from stored data if available
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }
    } catch (err) {
      localStorage.removeItem('commander_staff');
      router.push('/commander/login');
    }
  }, [router]);

  // Fetch data
  const fetchData = useCallback(async (showRefreshing = false) => {
    if (!venueId) return;

    if (showRefreshing) setRefreshing(true);

    try {
      const storedStaff = localStorage.getItem('commander_staff');
      const staffSession = storedStaff || '{}';

      const [venueRes, gamesRes, waitlistRes, tablesRes, balanceRes, waitTimeRes] = await Promise.all([
        fetch(`/api/commander/venues/${venueId}`),
        fetch(`/api/commander/games/venue/${venueId}`),
        fetch(`/api/commander/waitlist/venue/${venueId}`),
        fetch(`/api/commander/tables/venue/${venueId}`),
        fetch(`/api/commander/ai/table-balance/${venueId}`, {
          headers: { 'x-staff-session': staffSession }
        }).catch(() => ({ ok: false })),
        fetch(`/api/commander/ai/wait-time/${venueId}`).catch(() => ({ ok: false }))
      ]);

      const [venueData, gamesData, waitlistData, tablesData] = await Promise.all([
        venueRes.json(),
        gamesRes.json(),
        waitlistRes.json(),
        tablesRes.json()
      ]);

      // Parse AI data separately (non-critical)
      if (balanceRes.ok) {
        try {
          const balanceData = await balanceRes.json();
          if (balanceData.success) {
            setAiSuggestions(balanceData.data?.suggestions || []);
          }
        } catch (e) { /* ignore */ }
      }

      if (waitTimeRes.ok) {
        try {
          const waitTimeData = await waitTimeRes.json();
          if (waitTimeData.success) {
            setWaitTimePredictions(waitTimeData.data?.predictions || []);
          }
        } catch (e) { /* ignore */ }
      }

      if (venueData.success) {
        setVenue(venueData.data.venue);
      }

      if (gamesData.success) {
        setGames(gamesData.data.games || []);
      }

      if (waitlistData.success) {
        setWaitlists(waitlistData.data.waitlists || []);
      }

      if (tablesData.success) {
        setTables(tablesData.data.tables || []);
      }

      setOnline(true);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setOnline(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [venueId]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (staff && venueId) {
      fetchData();

      // Auto-refresh every 30 seconds
      const interval = setInterval(() => fetchData(), 30000);
      return () => clearInterval(interval);
    }
  }, [staff, venueId, fetchData]);

  // Real-time updates
  const handleRealtimeUpdate = useCallback((type, payload) => {
    // Add activity for the change
    if (payload.eventType === 'INSERT') {
      if (type === 'waitlist') {
        addActivity('notification_sent', 'New player joined waitlist');
      } else if (type === 'games') {
        addActivity('success', 'New game started');
      }
    }
    // Refresh data to get latest state
    fetchData();
  }, [fetchData]);

  useRealtimeUpdates(venueId, handleRealtimeUpdate, !!staff);

  // Handle logout
  function handleLogout() {
    localStorage.removeItem('commander_staff');
    router.push('/commander/login');
  }

  // Handle call player
  async function handleCallPlayer(player) {
    try {
      const res = await fetch(`/api/commander/waitlist/${player.id}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notify_sms: true, notify_push: true })
      });

      const data = await res.json();
      if (data.success) {
        addActivity('player_called', `Called ${player.player_name || 'Player'} for seat`);
        fetchData();
      }
    } catch (error) {
      console.error('Failed to call player:', error);
    }
  }

  // Handle seat player - open modal
  function handleSeatPlayer(player) {
    setPlayerToSeat(player);
    setShowSeatPlayerModal(true);
  }

  // Handle player seated from modal
  function handlePlayerSeated({ player, game, seat_number }) {
    addActivity('player_seated', `Seated ${player.player_name || 'Player'} at seat ${seat_number} on ${game.table_name || 'Table ' + game.table_number}`);
    fetchData();
  }

  // Handle remove player
  async function handleRemovePlayer(player) {
    if (!window.confirm(`Remove ${player.player_name || 'Player'} from waitlist?`)) return;

    try {
      const res = await fetch(`/api/commander/waitlist/${player.id}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (data.success) {
        addActivity('player_removed', `Removed ${player.player_name || 'Player'} from waitlist`);
        fetchData();
      }
    } catch (error) {
      console.error('Failed to remove player:', error);
    }
  }

  // Add activity to feed
  function addActivity(type, message, details = null) {
    setActivities(prev => [
      createActivity(type, message, details),
      ...prev
    ].slice(0, 50));
  }

  // Handle open game
  function handleOpenGame() {
    setShowOpenGameModal(true);
  }

  // Handle game selection - show game details or navigate to table view
  function handleGameSelect(game) {
    setSelectedGame(game);
    // Navigate to table management view for this game
    router.push(`/commander/tables?game=${game.id}`);
  }

  // Handle game opened
  function handleGameOpened(game) {
    addActivity('success', `Opened ${game.stakes} ${game.game_type.toUpperCase()} on Table ${game.table_number || game.table_id}`);
    fetchData();
  }

  // Handle add walk-in
  function handleAddWalkIn() {
    setShowAddWalkInModal(true);
  }

  // Handle walk-in added
  function handleWalkInAdded(entry) {
    addActivity('player_seated', `Added ${entry.player_name || 'Walk-in'} to ${entry.stakes} ${entry.game_type.toUpperCase()} waitlist`);
    fetchData();
  }

  if (!staff || loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <div className="animate-pulse text-[#64748B]">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{venue?.name || 'Dashboard'} | Club Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="font-bold text-white text-lg">{venue?.name || 'Loading...'}</h1>
              <p className="text-sm text-[#64748B]">
                {staff.display_name || staff.role} ({staff.role})
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm">
                {online ? (
                  <Wifi className="w-4 h-4 text-[#10B981]" />
                ) : (
                  <WifiOff className="w-4 h-4 text-[#EF4444]" />
                )}
                {lastRefresh && (
                  <span className="text-[#64748B] hidden sm:inline">
                    {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>

              <button
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="p-2 rounded-lg hover:bg-[#0B1426] transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 text-[#64748B] ${refreshing ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => setShowNav(true)}
                className="p-2 rounded-lg hover:bg-[#0B1426] transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                title="Menu"
              >
                <Menu className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          {/* Quick Actions */}
          <section>
            <QuickActions
              onOpenGame={handleOpenGame}
              onAddWalkIn={handleAddWalkIn}
              onViewWaitlist={() => document.getElementById('waitlist-section')?.scrollIntoView({ behavior: 'smooth' })}
              onManageTables={() => router.push('/commander/tables')}
              onSendAnnouncement={() => router.push('/commander/announcements')}
              onSettings={() => router.push('/commander/settings')}
              permissions={staff.permissions}
            />
          </section>

          {/* Games and Waitlist */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Games Grid */}
            <section className="lg:col-span-2">
              <h2 className="text-lg font-semibold text-white mb-4">Active Games</h2>
              <GameGrid
                games={games}
                onGameSelect={handleGameSelect}
                onOpenGame={handleOpenGame}
              />
            </section>

            {/* Activity Feed */}
            <section className="lg:col-span-1">
              <h2 className="text-lg font-semibold text-white mb-4">Activity</h2>
              <ActivityFeed activities={activities} />
            </section>
          </div>

          {/* AI Insights Panel */}
          {(aiSuggestions.length > 0 || waitTimePredictions.length > 0) && (
            <section className="bg-gradient-to-r from-[#22D3EE]/5 to-[#8B5CF6]/5 rounded-xl border border-[#22D3EE]/20 p-4">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-[#22D3EE]" />
                <h2 className="text-lg font-semibold text-white">AI Insights</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Table Balance Suggestions */}
                {aiSuggestions.length > 0 && (
                  <div className="cmd-panel p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowRightLeft className="w-4 h-4 text-[#8B5CF6]" />
                      <h3 className="font-medium text-white">Table Balance</h3>
                    </div>
                    <div className="space-y-3">
                      {aiSuggestions.slice(0, 3).map((suggestion, idx) => (
                        <div key={idx} className={`p-3 rounded-lg ${
                          suggestion.priority === 'high' ? 'bg-[#EF4444]/10' : 'bg-[#0B1426]'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-white">
                              Move {suggestion.player?.name || 'player'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              suggestion.priority === 'high'
                                ? 'bg-[#EF4444]/10 text-[#EF4444]'
                                : 'bg-[#F59E0B]/10 text-[#F59E0B]'
                            }`}>
                              {suggestion.priority}
                            </span>
                          </div>
                          <p className="text-xs text-[#64748B]">
                            Table {suggestion.fromTable?.number} ({suggestion.fromTable?.current_players}p)
                            <ChevronRight className="w-3 h-3 inline mx-1" />
                            Table {suggestion.toTable?.number} ({suggestion.toTable?.current_players}p)
                          </p>
                          <p className="text-xs text-[#64748B] mt-1">{suggestion.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Wait Time Predictions */}
                {waitTimePredictions.length > 0 && (
                  <div className="cmd-panel p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-[#10B981]" />
                      <h3 className="font-medium text-white">Wait Time Estimates</h3>
                    </div>
                    <div className="space-y-2">
                      {waitTimePredictions
                        .filter(p => p.current_waitlist > 0)
                        .slice(0, 5)
                        .map((prediction, idx) => (
                          <div key={idx} className="flex items-center justify-between py-2 border-b border-[#4A5E78] last:border-0">
                            <div>
                              <span className="text-sm font-medium text-white">
                                {prediction.stakes} {prediction.game_type?.toUpperCase()}
                              </span>
                              <span className="text-xs text-[#64748B] ml-2">
                                ({prediction.current_waitlist} waiting)
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-semibold text-white">
                                ~{prediction.estimated_minutes} min
                              </span>
                              <span className="text-xs text-[#64748B] ml-1">
                                ({Math.round(prediction.confidence * 100)}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      {waitTimePredictions.every(p => p.current_waitlist === 0) && (
                        <p className="text-sm text-[#64748B] text-center py-2">No players waiting</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Waitlist Manager */}
          <section id="waitlist-section">
            <h2 className="text-lg font-semibold text-white mb-4">Waitlist</h2>
            <WaitlistManager
              waitlists={waitlists}
              onCallPlayer={handleCallPlayer}
              onSeatPlayer={handleSeatPlayer}
              onRemovePlayer={handleRemovePlayer}
              onAddWalkIn={handleAddWalkIn}
            />
          </section>
        </main>
      </div>

      {/* Modals */}
      <OpenGameModal
        isOpen={showOpenGameModal}
        onClose={() => setShowOpenGameModal(false)}
        onSubmit={handleGameOpened}
        tables={tables}
        venueId={venueId}
      />

      <AddWalkInModal
        isOpen={showAddWalkInModal}
        onClose={() => setShowAddWalkInModal(false)}
        onSubmit={handleWalkInAdded}
        venueId={venueId}
        activeGames={games}
      />

      <SeatPlayerModal
        isOpen={showSeatPlayerModal}
        onClose={() => {
          setShowSeatPlayerModal(false);
          setPlayerToSeat(null);
        }}
        onSubmit={handlePlayerSeated}
        player={playerToSeat}
        games={games}
      />

      {/* Navigation Drawer */}
      {showNav && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowNav(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-[#0F1C32] shadow-xl">
            <div className="p-4 border-b border-[#4A5E78] flex items-center justify-between">
              <h2 className="font-semibold text-white">Menu</h2>
              <button
                onClick={() => setShowNav(false)}
                className="p-2 hover:bg-[#132240] rounded-lg"
              >
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>
            <nav className="p-2">
              {navItems.map(({ href, label, icon: Icon, active }) => (
                <button
                  key={href}
                  onClick={() => {
                    setShowNav(false);
                    router.push(href);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    active
                      ? 'bg-[#22D3EE]/10 text-[#22D3EE]'
                      : 'text-[#64748B] hover:bg-[#132240]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{label}</span>
                </button>
              ))}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#4A5E78]">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
