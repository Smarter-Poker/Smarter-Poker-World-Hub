/**
 * LOCATION MEMORY ENGINE
 * Tracks and remembers performance at specific venues
 */

import { supabase } from '../supabase';

export interface LocationStats {
  locationId: string;
  name: string;
  lifetimeNet: number;
  pokerNet: number;
  nonPokerNet: number;
  sessionCount: number;
  totalHours: number;
  hourlyRate: number;
  lastVisit: string;
  winRate: number;
  topStake: string | null;
  worstCategory: string | null;
  worstCategoryLoss: number;
}

export interface LocationAlert {
  type: 'warning' | 'info' | 'danger';
  message: string;
  value?: string;
}

export interface StakePerformance {
  stakes: string;
  net: number;
  hours: number;
  hourlyRate: number;
  sessions: number;
}

/**
 * Get or create a location
 */
export async function getOrCreateLocation(
  userId: string,
  name: string,
  venueType: string = 'casino',
  latitude?: number,
  longitude?: number
): Promise<string> {
  // Try to find existing location
  const { data: existing } = await supabase
    .from('bankroll_locations')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', name)
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Create new location
  const { data: newLoc, error } = await supabase
    .from('bankroll_locations')
    .insert({
      user_id: userId,
      name,
      venue_type: venueType,
      latitude,
      longitude,
    })
    .select('id')
    .single();

  if (error) throw error;
  return newLoc.id;
}

/**
 * Get all locations for a user
 */
export async function getUserLocations(userId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('bankroll_locations')
    .select('id, name')
    .eq('user_id', userId)
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * Get comprehensive stats for a location
 */
export async function getLocationStats(
  userId: string,
  locationId: string
): Promise<LocationStats | null> {
  // Get location info
  const { data: location } = await supabase
    .from('bankroll_locations')
    .select('id, name')
    .eq('id', locationId)
    .single();

  if (!location) return null;

  // Get all entries for this location
  const { data: entries } = await supabase
    .from('bankroll_ledger')
    .select('category, net_result, start_time, end_time, entry_date, stakes')
    .eq('user_id', userId)
    .eq('location_id', locationId)
    .eq('is_revision', false)
    .order('entry_date', { ascending: false });

  if (!entries || entries.length === 0) {
    return {
      locationId: location.id,
      name: location.name,
      lifetimeNet: 0,
      pokerNet: 0,
      nonPokerNet: 0,
      sessionCount: 0,
      totalHours: 0,
      hourlyRate: 0,
      lastVisit: '',
      winRate: 0,
      topStake: null,
      worstCategory: null,
      worstCategoryLoss: 0,
    };
  }

  let lifetimeNet = 0;
  let pokerNet = 0;
  let nonPokerNet = 0;
  let totalHours = 0;
  let wins = 0;

  const categoryTotals: Record<string, number> = {};
  const stakeTotals: Record<string, { net: number; hours: number; sessions: number }> = {};

  entries.forEach((e) => {
    lifetimeNet += e.net_result || 0;
    if (e.net_result > 0) wins++;

    if (e.category === 'poker_cash' || e.category === 'poker_mtt') {
      pokerNet += e.net_result || 0;
    } else if (e.category !== 'expense') {
      nonPokerNet += e.net_result || 0;
    }

    // Track category losses
    if (!categoryTotals[e.category]) categoryTotals[e.category] = 0;
    categoryTotals[e.category] += e.net_result || 0;

    // Track stake performance
    if (e.stakes && e.category === 'poker_cash') {
      if (!stakeTotals[e.stakes]) {
        stakeTotals[e.stakes] = { net: 0, hours: 0, sessions: 0 };
      }
      stakeTotals[e.stakes].net += e.net_result || 0;
      stakeTotals[e.stakes].sessions += 1;
      if (e.start_time && e.end_time) {
        const hours =
          (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) /
          (1000 * 60 * 60);
        stakeTotals[e.stakes].hours += hours;
      }
    }

    // Calculate hours
    if (e.start_time && e.end_time) {
      const hours =
        (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) /
        (1000 * 60 * 60);
      totalHours += hours;
    }
  });

  // Find worst non-expense category
  let worstCategory: string | null = null;
  let worstCategoryLoss = 0;
  Object.entries(categoryTotals).forEach(([cat, net]) => {
    if (cat !== 'expense' && net < worstCategoryLoss) {
      worstCategory = cat;
      worstCategoryLoss = net;
    }
  });

  // Find top performing stake
  let topStake: string | null = null;
  let topStakeHourly = -Infinity;
  Object.entries(stakeTotals).forEach(([stakes, stats]) => {
    if (stats.hours >= 5) {
      const hourly = stats.net / stats.hours;
      if (hourly > topStakeHourly) {
        topStakeHourly = hourly;
        topStake = stakes;
      }
    }
  });

  return {
    locationId: location.id,
    name: location.name,
    lifetimeNet,
    pokerNet,
    nonPokerNet,
    sessionCount: entries.length,
    totalHours,
    hourlyRate: totalHours > 0 ? lifetimeNet / totalHours : 0,
    lastVisit: entries[0]?.entry_date || '',
    winRate: entries.length > 0 ? (wins / entries.length) * 100 : 0,
    topStake,
    worstCategory,
    worstCategoryLoss,
  };
}

/**
 * Get alerts for a location
 */
export async function getLocationAlerts(
  userId: string,
  locationId: string
): Promise<LocationAlert[]> {
  const stats = await getLocationStats(userId, locationId);
  if (!stats) return [];

  const alerts: LocationAlert[] = [];

  // Lifetime loss warning
  if (stats.lifetimeNet < -1000) {
    alerts.push({
      type: 'warning',
      message: `Lifetime ${stats.lifetimeNet >= 0 ? '+' : '-'}$${Math.abs(
        Math.round(stats.lifetimeNet)
      ).toLocaleString()} at ${stats.name}`,
      value: `${stats.lifetimeNet >= 0 ? '+' : '-'}$${Math.abs(
        Math.round(stats.lifetimeNet)
      ).toLocaleString()}`,
    });
  }

  // Non-poker leak warning
  if (stats.nonPokerNet < -500) {
    alerts.push({
      type: 'danger',
      message: `Non-poker gambling losses at this venue`,
      value: `-$${Math.abs(Math.round(stats.nonPokerNet)).toLocaleString()}`,
    });
  }

  // Negative hourly warning
  if (stats.totalHours > 20 && stats.hourlyRate < 0) {
    alerts.push({
      type: 'warning',
      message: `Negative hourly rate over ${Math.round(stats.totalHours)} hours`,
      value: `${stats.hourlyRate >= 0 ? '+' : ''}$${Math.round(stats.hourlyRate)}/hr`,
    });
  }

  // Worst category alert
  if (stats.worstCategory && stats.worstCategoryLoss < -500) {
    const categoryLabels: Record<string, string> = {
      casino_table: 'Table Games',
      slots: 'Slots',
      sports: 'Sports',
      poker_cash: 'Cash Games',
      poker_mtt: 'Tournaments',
    };
    alerts.push({
      type: stats.worstCategory === 'slots' ? 'danger' : 'warning',
      message: `${categoryLabels[stats.worstCategory] || stats.worstCategory} losses here`,
      value: `-$${Math.abs(Math.round(stats.worstCategoryLoss)).toLocaleString()}`,
    });
  }

  return alerts;
}

/**
 * Get stake performance at a location
 */
export async function getStakePerformanceAtLocation(
  userId: string,
  locationId: string
): Promise<StakePerformance[]> {
  const { data } = await supabase
    .from('bankroll_ledger')
    .select('stakes, net_result, start_time, end_time')
    .eq('user_id', userId)
    .eq('location_id', locationId)
    .eq('category', 'poker_cash')
    .eq('is_revision', false)
    .not('stakes', 'is', null);

  if (!data) return [];

  const stakeStats: Record<string, StakePerformance> = {};

  data.forEach((e) => {
    if (!e.stakes) return;
    if (!stakeStats[e.stakes]) {
      stakeStats[e.stakes] = {
        stakes: e.stakes,
        net: 0,
        hours: 0,
        hourlyRate: 0,
        sessions: 0,
      };
    }
    stakeStats[e.stakes].net += e.net_result || 0;
    stakeStats[e.stakes].sessions += 1;
    if (e.start_time && e.end_time) {
      const hours =
        (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) /
        (1000 * 60 * 60);
      stakeStats[e.stakes].hours += hours;
    }
  });

  // Calculate hourly rates
  Object.values(stakeStats).forEach((s) => {
    s.hourlyRate = s.hours > 0 ? s.net / s.hours : 0;
  });

  return Object.values(stakeStats).sort((a, b) => b.hourlyRate - a.hourlyRate);
}

/**
 * Store assistant memory for a location
 */
export async function storeLocationMemory(
  userId: string,
  locationId: string,
  memoryType: 'goal' | 'warning' | 'promise' | 'pattern' | 'justification' | 'intervention',
  content: string,
  severity: number = 1
): Promise<void> {
  await supabase.from('bankroll_assistant_memory').insert({
    user_id: userId,
    location_id: locationId,
    memory_type: memoryType,
    content,
    severity,
  });
}

/**
 * Get assistant memories for a location
 */
export async function getLocationMemories(
  userId: string,
  locationId: string
): Promise<{ type: string; content: string; createdAt: string }[]> {
  const { data } = await supabase
    .from('bankroll_assistant_memory')
    .select('memory_type, content, created_at')
    .eq('user_id', userId)
    .eq('location_id', locationId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  return (
    data?.map((m) => ({
      type: m.memory_type,
      content: m.content,
      createdAt: m.created_at,
    })) || []
  );
}

/**
 * Try to detect location from coordinates
 */
export async function detectNearbyLocation(
  userId: string,
  latitude: number,
  longitude: number,
  radiusKm: number = 0.5
): Promise<{ id: string; name: string } | null> {
  // Simple bounding box approach
  const latDelta = radiusKm / 111; // ~111km per degree latitude
  const lonDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

  const { data } = await supabase
    .from('bankroll_locations')
    .select('id, name')
    .eq('user_id', userId)
    .gte('latitude', latitude - latDelta)
    .lte('latitude', latitude + latDelta)
    .gte('longitude', longitude - lonDelta)
    .lte('longitude', longitude + lonDelta)
    .limit(1)
    .single();

  return data || null;
}
