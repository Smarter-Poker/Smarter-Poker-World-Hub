/**
 * Captain Staff Dashboard - Main terminal view
 * Reference: IMPLEMENTATION_PHASES.md - Step 1.5
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

export default function CaptainDashboard() {
  const router = useRouter();
  const { venue_id } = router.query;

  const [staff, setStaff] = useState(null);
  const [venue, setVenue] = useState(null);
  const [games, setGames] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Check staff session
  useEffect(() => {
    const storedStaff = localStorage.getItem('captain_staff');
    if (!storedStaff) {
      router.push(`/captain/login?venue_id=${venue_id}`);
      return;
    }

    const staffData = JSON.parse(storedStaff);
    if (staffData.venue_id !== venue_id) {
      localStorage.removeItem('captain_staff');
      router.push(`/captain/login?venue_id=${venue_id}`);
      return;
    }

    setStaff(staffData);
  }, [venue_id, router]);

  // Fetch data
  const fetchData = useCallback(async (showRefreshing = false) => {
    if (!venue_id) return;

    if (showRefreshing) setRefreshing(true);

    try {
      const [venueRes, gamesRes, waitlistRes] = await Promise.all([
        fetch(`/api/captain/venues/${venue_id}`),
        fetch(`/api/captain/games/venue/${venue_id}`),
        fetch(`/api/captain/waitlist/venue/${venue_id}`)
      ]);

      const [venueData, gamesData, waitlistData] = await Promise.all([
        venueRes.json(),
        gamesRes.json(),
        waitlistRes.json()
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

      setOnline(true);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setOnline(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [venue_id]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (staff && venue_id) {
      fetchData();

      // Auto-refresh every 30 seconds
      const interval = setInterval(() => fetchData(), 30000);
      return () => clearInterval(interval);
    }
  }, [staff, venue_id, fetchData]);

  // Handle logout
  function handleLogout() {
    localStorage.removeItem('captain_staff');
    router.push(`/captain/login?venue_id=${venue_id}`);
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

  // Handle seat player
  async function handleSeatPlayer(player) {
    // For now, show a simple prompt - in full implementation this would open a modal
    const seatNumber = window.prompt('Enter seat number (1-9):');
    if (!seatNumber) return;

    // Find an appropriate game
    const matchingGame = games.find(g =>
      g.game_type === player.game_type &&
      g.stakes === player.stakes &&
      ['waiting', 'running'].includes(g.status)
    );

    if (!matchingGame) {
      alert('No matching game found');
      return;
    }

    try {
      const res = await fetch(`/api/captain/waitlist/${player.id}/seat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_id: matchingGame.id,
          seat_number: parseInt(seatNumber)
        })
      });

      const data = await res.json();
      if (data.success) {
        addActivity('player_seated', `Seated ${player.player_name || 'Player'} at seat ${seatNumber}`);
        fetchData();
      } else {
        alert(data.error?.message || 'Failed to seat player');
      }
    } catch (error) {
      console.error('Failed to seat player:', error);
    }
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

  // Handle open game (placeholder for modal)
  function handleOpenGame() {
    alert('Open Game modal - to be implemented with full UI');
  }

  // Handle add walk-in (placeholder for modal)
  function handleAddWalkIn() {
    alert('Add Walk-In modal - to be implemented with full UI');
  }

  if (!staff) {
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
                {staff.display_name} ({staff.role})
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
              onViewWaitlist={() => {}}
              onManageTables={() => {}}
              onSendAnnouncement={() => {}}
              onSettings={() => {}}
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
          <section>
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
    </>
  );
}
