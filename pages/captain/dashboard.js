/**
 * Captain Staff Dashboard - Main terminal view
 * Based on PokerAtlas TableCaptain / Bravo Poker patterns
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { LogOut, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import GameGrid from '../../src/components/captain/staff/GameGrid';
import WaitlistManager from '../../src/components/captain/staff/WaitlistManager';
import QuickActions from '../../src/components/captain/staff/QuickActions';
import ActivityFeed, { createActivity } from '../../src/components/captain/staff/ActivityFeed';
import OpenGameModal from '../../src/components/captain/modals/OpenGameModal';
import AddWalkInModal from '../../src/components/captain/modals/AddWalkInModal';
import SeatPlayerModal from '../../src/components/captain/modals/SeatPlayerModal';
import { useRealtimeUpdates } from '../../src/lib/captain/useRealtimeUpdates';

export default function CaptainDashboard() {
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

  // Check staff session on mount
  useEffect(() => {
    const storedStaff = localStorage.getItem('captain_staff');
    if (!storedStaff) {
      router.push('/captain/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        localStorage.removeItem('captain_staff');
        router.push('/captain/login');
        return;
      }

      setStaff(staffData);
      setVenueId(staffData.venue_id);

      // Set venue name from stored data if available
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }
    } catch (err) {
      localStorage.removeItem('captain_staff');
      router.push('/captain/login');
    }
  }, [router]);

  // Fetch data
  const fetchData = useCallback(async (showRefreshing = false) => {
    if (!venueId) return;

    if (showRefreshing) setRefreshing(true);

    try {
      const [venueRes, gamesRes, waitlistRes, tablesRes] = await Promise.all([
        fetch(`/api/captain/venues/${venueId}`),
        fetch(`/api/captain/games/venue/${venueId}`),
        fetch(`/api/captain/waitlist/venue/${venueId}`),
        fetch(`/api/captain/tables/venue/${venueId}`)
      ]);

      const [venueData, gamesData, waitlistData, tablesData] = await Promise.all([
        venueRes.json(),
        gamesRes.json(),
        waitlistRes.json(),
        tablesRes.json()
      ]);

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
    localStorage.removeItem('captain_staff');
    router.push('/captain/login');
  }

  // Handle call player
  async function handleCallPlayer(player) {
    try {
      const res = await fetch(`/api/captain/waitlist/${player.id}/call`, {
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
      const res = await fetch(`/api/captain/waitlist/${player.id}`, {
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
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="animate-pulse text-[#6B7280]">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{venue?.name || 'Dashboard'} | Smarter Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="font-bold text-[#1F2937] text-lg">{venue?.name || 'Loading...'}</h1>
              <p className="text-sm text-[#6B7280]">
                {staff.display_name || staff.role} ({staff.role})
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                {online ? (
                  <Wifi className="w-4 h-4 text-[#10B981]" />
                ) : (
                  <WifiOff className="w-4 h-4 text-[#EF4444]" />
                )}
                {lastRefresh && (
                  <span className="text-[#6B7280] hidden sm:inline">
                    {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>

              <button
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="p-2 rounded-lg hover:bg-[#F9FAFB] transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 text-[#6B7280] ${refreshing ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-[#FEF2F2] text-[#6B7280] hover:text-[#EF4444] transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
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
              onManageTables={() => router.push('/captain/tables')}
              onSendAnnouncement={() => router.push('/captain/announcements')}
              onSettings={() => router.push('/captain/settings')}
              permissions={staff.permissions}
            />
          </section>

          {/* Games and Waitlist */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Games Grid */}
            <section className="lg:col-span-2">
              <h2 className="text-lg font-semibold text-[#1F2937] mb-4">Active Games</h2>
              <GameGrid
                games={games}
                onGameSelect={(game) => console.log('Selected game:', game)}
                onOpenGame={handleOpenGame}
              />
            </section>

            {/* Activity Feed */}
            <section className="lg:col-span-1">
              <h2 className="text-lg font-semibold text-[#1F2937] mb-4">Activity</h2>
              <ActivityFeed activities={activities} />
            </section>
          </div>

          {/* Waitlist Manager */}
          <section id="waitlist-section">
            <h2 className="text-lg font-semibold text-[#1F2937] mb-4">Waitlist</h2>
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
    </>
  );
}
