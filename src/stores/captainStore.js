/**
 * Captain Zustand Store
 * Centralized state management for Smarter Captain
 * Reference: IMPLEMENTATION_PHASES.md
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCaptainStore = create(
  persist(
    (set, get) => ({
      // Staff session state
      staff: null,
      venueId: null,
      venue: null,
      permissions: null,

      // Set staff session after PIN login
      setStaffSession: (staffData, venueData = null) => {
        set({
          staff: staffData,
          venueId: staffData?.venue_id || null,
          venue: venueData,
          permissions: staffData?.permissions || getDefaultPermissions(staffData?.role)
        });
      },

      // Clear staff session on logout
      clearStaffSession: () => {
        set({
          staff: null,
          venueId: null,
          venue: null,
          permissions: null
        });
        // Also clear localStorage for backwards compatibility
        if (typeof window !== 'undefined') {
          localStorage.removeItem('captain_staff');
        }
      },

      // Update venue info
      setVenue: (venue) => set({ venue }),

      // Active games cache
      games: [],
      gamesLoading: false,
      gamesLastFetch: null,

      setGames: (games) => set({
        games,
        gamesLastFetch: Date.now()
      }),

      setGamesLoading: (loading) => set({ gamesLoading: loading }),

      // Waitlist cache
      waitlist: [],
      waitlistLoading: false,
      waitlistLastFetch: null,

      setWaitlist: (waitlist) => set({
        waitlist,
        waitlistLastFetch: Date.now()
      }),

      setWaitlistLoading: (loading) => set({ waitlistLoading: loading }),

      // Tables cache
      tables: [],
      tablesLoading: false,

      setTables: (tables) => set({ tables }),
      setTablesLoading: (loading) => set({ tablesLoading: loading }),

      // Real-time updates
      addWaitlistEntry: (entry) => set(state => ({
        waitlist: [entry, ...state.waitlist]
      })),

      updateWaitlistEntry: (id, updates) => set(state => ({
        waitlist: state.waitlist.map(w =>
          w.id === id ? { ...w, ...updates } : w
        )
      })),

      removeWaitlistEntry: (id) => set(state => ({
        waitlist: state.waitlist.filter(w => w.id !== id)
      })),

      addGame: (game) => set(state => ({
        games: [game, ...state.games]
      })),

      updateGame: (id, updates) => set(state => ({
        games: state.games.map(g =>
          g.id === id ? { ...g, ...updates } : g
        )
      })),

      removeGame: (id) => set(state => ({
        games: state.games.filter(g => g.id !== id)
      })),

      // Activity feed
      activities: [],
      maxActivities: 50,

      addActivity: (activity) => set(state => ({
        activities: [
          { ...activity, id: Date.now(), timestamp: new Date().toISOString() },
          ...state.activities
        ].slice(0, state.maxActivities)
      })),

      clearActivities: () => set({ activities: [] }),

      // Notifications
      notifications: [],

      addNotification: (notification) => set(state => ({
        notifications: [
          { ...notification, id: Date.now(), read: false },
          ...state.notifications
        ]
      })),

      markNotificationRead: (id) => set(state => ({
        notifications: state.notifications.map(n =>
          n.id === id ? { ...n, read: true } : n
        )
      })),

      clearNotifications: () => set({ notifications: [] }),

      // UI state
      activeModal: null,
      modalData: null,

      openModal: (modalName, data = null) => set({
        activeModal: modalName,
        modalData: data
      }),

      closeModal: () => set({
        activeModal: null,
        modalData: null
      }),

      // Fetch helpers with caching
      shouldRefetchGames: () => {
        const { gamesLastFetch } = get();
        if (!gamesLastFetch) return true;
        return Date.now() - gamesLastFetch > 30000; // 30 second cache
      },

      shouldRefetchWaitlist: () => {
        const { waitlistLastFetch } = get();
        if (!waitlistLastFetch) return true;
        return Date.now() - waitlistLastFetch > 15000; // 15 second cache
      },

      // API fetch actions
      fetchGames: async (venueId) => {
        const { shouldRefetchGames, setGamesLoading, setGames } = get();
        if (!shouldRefetchGames()) return get().games;

        setGamesLoading(true);
        try {
          const res = await fetch(`/api/captain/games/venue/${venueId}`);
          const data = await res.json();
          if (data.success) {
            setGames(data.data?.games || []);
          }
          return data.data?.games || [];
        } catch (err) {
          console.error('Fetch games error:', err);
          return [];
        } finally {
          setGamesLoading(false);
        }
      },

      fetchWaitlist: async (venueId) => {
        const { shouldRefetchWaitlist, setWaitlistLoading, setWaitlist } = get();
        if (!shouldRefetchWaitlist()) return get().waitlist;

        setWaitlistLoading(true);
        try {
          const res = await fetch(`/api/captain/waitlist/venue/${venueId}`);
          const data = await res.json();
          if (data.success) {
            setWaitlist(data.data?.waitlist || []);
          }
          return data.data?.waitlist || [];
        } catch (err) {
          console.error('Fetch waitlist error:', err);
          return [];
        } finally {
          setWaitlistLoading(false);
        }
      },

      fetchTables: async (venueId) => {
        const { setTablesLoading, setTables } = get();
        setTablesLoading(true);
        try {
          const res = await fetch(`/api/captain/tables/venue/${venueId}`);
          const data = await res.json();
          if (data.success) {
            setTables(data.data?.tables || []);
          }
          return data.data?.tables || [];
        } catch (err) {
          console.error('Fetch tables error:', err);
          return [];
        } finally {
          setTablesLoading(false);
        }
      },

      // Force refresh (bypasses cache)
      forceRefreshGames: async (venueId) => {
        set({ gamesLastFetch: null });
        return get().fetchGames(venueId);
      },

      forceRefreshWaitlist: async (venueId) => {
        set({ waitlistLastFetch: null });
        return get().fetchWaitlist(venueId);
      }
    }),
    {
      name: 'captain-storage',
      partialize: (state) => ({
        staff: state.staff,
        venueId: state.venueId,
        venue: state.venue,
        permissions: state.permissions
      })
    }
  )
);

// Default permissions by role
function getDefaultPermissions(role) {
  const permissions = {
    owner: {
      manage_staff: true,
      manage_games: true,
      manage_waitlist: true,
      manage_settings: true,
      view_analytics: true,
      send_notifications: true
    },
    manager: {
      manage_staff: true,
      manage_games: true,
      manage_waitlist: true,
      manage_settings: true,
      view_analytics: true,
      send_notifications: true
    },
    floor: {
      manage_staff: false,
      manage_games: true,
      manage_waitlist: true,
      manage_settings: false,
      view_analytics: false,
      send_notifications: true
    },
    brush: {
      manage_staff: false,
      manage_games: false,
      manage_waitlist: true,
      manage_settings: false,
      view_analytics: false,
      send_notifications: true
    },
    dealer: {
      manage_staff: false,
      manage_games: false,
      manage_waitlist: false,
      manage_settings: false,
      view_analytics: false,
      send_notifications: false
    }
  };

  return permissions[role] || permissions.dealer;
}

// Player-side store for waitlist tracking
export const usePlayerCaptainStore = create(
  persist(
    (set, get) => ({
      // Current waitlist entries
      myWaitlists: [],
      myWaitlistsLoading: false,

      setMyWaitlists: (waitlists) => set({ myWaitlists: waitlists }),
      setMyWaitlistsLoading: (loading) => set({ myWaitlistsLoading: loading }),

      // Favorite venues
      favoriteVenues: [],
      addFavoriteVenue: (venueId) => set(state => ({
        favoriteVenues: [...new Set([...state.favoriteVenues, venueId])]
      })),
      removeFavoriteVenue: (venueId) => set(state => ({
        favoriteVenues: state.favoriteVenues.filter(id => id !== venueId)
      })),

      // Recent venues
      recentVenues: [],
      addRecentVenue: (venue) => set(state => ({
        recentVenues: [
          venue,
          ...state.recentVenues.filter(v => v.id !== venue.id)
        ].slice(0, 10)
      })),

      // Notification preferences
      notificationPrefs: {
        seatReady: true,
        waitlistUpdates: true,
        promotions: true,
        tournaments: true
      },
      setNotificationPref: (key, value) => set(state => ({
        notificationPrefs: { ...state.notificationPrefs, [key]: value }
      })),

      // Fetch my waitlists
      fetchMyWaitlists: async () => {
        const { setMyWaitlistsLoading, setMyWaitlists } = get();
        setMyWaitlistsLoading(true);
        try {
          const token = localStorage.getItem('smarter-poker-auth');
          const res = await fetch('/api/captain/waitlist/my', {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.success) {
            setMyWaitlists(data.data?.waitlists || []);
          }
          return data.data?.waitlists || [];
        } catch (err) {
          console.error('Fetch my waitlists error:', err);
          return [];
        } finally {
          setMyWaitlistsLoading(false);
        }
      }
    }),
    {
      name: 'captain-player-storage',
      partialize: (state) => ({
        favoriteVenues: state.favoriteVenues,
        recentVenues: state.recentVenues,
        notificationPrefs: state.notificationPrefs
      })
    }
  )
);

export default useCaptainStore;
