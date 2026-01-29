/**
 * TournamentClock Component - Live tournament clock display
 * Reference: SCOPE_LOCK.md - Phase 3 Components
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Users, Trophy, Coins } from 'lucide-react';

export default function TournamentClock({
  tournamentId,
  initialData,
  onLevelChange,
  isStaff = false,
  fullscreen = false
}) {
  const [clockData, setClockData] = useState(initialData);
  const [timeRemaining, setTimeRemaining] = useState(initialData?.clock?.timeRemaining || 0);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch clock state
  const fetchClockState = useCallback(async () => {
    try {
      const res = await fetch(`/api/captain/tournaments/${tournamentId}/clock`);
      const data = await res.json();
      if (res.ok) {
        setClockData(data);
        setTimeRemaining(data.clock?.timeRemaining || 0);
      }
    } catch (error) {
      console.error('Failed to fetch clock state:', error);
    }
  }, [tournamentId]);

  // Poll for updates every 10 seconds
  useEffect(() => {
    fetchClockState();
    const interval = setInterval(fetchClockState, 10000);
    return () => clearInterval(interval);
  }, [fetchClockState]);

  // Countdown timer
  useEffect(() => {
    if (!clockData?.clock?.isRunning || clockData?.clock?.isPaused) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0) {
          // Level ended - trigger refresh
          fetchClockState();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [clockData?.clock?.isRunning, clockData?.clock?.isPaused, fetchClockState]);

  // Clock actions
  const handleAction = async (action, extra = {}) => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('supabase_token');
      const res = await fetch(`/api/captain/tournaments/${tournamentId}/clock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action, ...extra })
      });

      const data = await res.json();
      if (res.ok) {
        await fetchClockState();
        if (action === 'next_level' || action === 'previous_level') {
          onLevelChange?.(data.tournament.current_level);
        }
      } else {
        alert(data.error || 'Action failed');
      }
    } catch (error) {
      console.error('Clock action error:', error);
      alert('Failed to perform action');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatChips = (amount) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount?.toString() || '0';
  };

  if (!clockData) {
    return (
      <div className="bg-[#1F2937] rounded-lg p-8 text-center">
        <p className="text-white">Loading tournament clock...</p>
      </div>
    );
  }

  const { tournament, clock, currentBlind, nextBlind } = clockData;
  const isRunning = clock?.isRunning && !clock?.isPaused;
  const isPaused = clock?.isPaused;

  // Time warning colors
  const getTimeColor = () => {
    if (timeRemaining <= 30) return 'text-[#EF4444]'; // Red - last 30 seconds
    if (timeRemaining <= 60) return 'text-[#F59E0B]'; // Yellow - last minute
    return 'text-white';
  };

  return (
    <div className={`bg-[#1F2937] rounded-lg overflow-hidden ${fullscreen ? 'min-h-screen' : ''}`}>
      {/* Header */}
      <div className="bg-[#111827] px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-xl">{tournament.name}</h2>
          <p className="text-[#4A5E78] text-sm">Level {(tournament.current_level || 0) + 1}</p>
        </div>
        <div className={`px-3 py-1 rounded text-sm font-medium ${
          tournament.status === 'running' ? 'bg-[#10B981] text-white' :
          tournament.status === 'paused' ? 'bg-[#F59E0B] text-white' :
          tournament.status === 'final_table' ? 'bg-[#8B5CF6] text-white' :
          'bg-[#6B7280] text-white'
        }`}>
          {tournament.status === 'final_table' ? 'Final Table' : tournament.status?.toUpperCase()}
        </div>
      </div>

      {/* Main Clock Display */}
      <div className="px-6 py-8 text-center">
        {/* Blinds */}
        {currentBlind && (
          <div className="mb-6">
            <p className="text-[#4A5E78] text-sm uppercase tracking-wider mb-2">Blinds</p>
            <p className="text-white text-5xl font-bold">
              {formatChips(currentBlind.smallBlind)} / {formatChips(currentBlind.bigBlind)}
            </p>
            {currentBlind.ante > 0 && (
              <p className="text-[#22D3EE] text-xl mt-2">
                Ante: {formatChips(currentBlind.ante)}
              </p>
            )}
          </div>
        )}

        {/* Timer */}
        <div className="mb-6">
          <p className={`text-8xl font-mono font-bold ${getTimeColor()}`}>
            {formatTime(timeRemaining)}
          </p>
          {isPaused && (
            <p className="text-[#F59E0B] text-xl mt-2 animate-pulse">PAUSED</p>
          )}
        </div>

        {/* Next Level Preview */}
        {nextBlind && (
          <div className="bg-[#374151] rounded-lg px-6 py-4 inline-block">
            <p className="text-[#4A5E78] text-sm">Next Level</p>
            <p className="text-white text-xl font-semibold">
              {formatChips(nextBlind.smallBlind)} / {formatChips(nextBlind.bigBlind)}
              {nextBlind.ante > 0 && ` (${formatChips(nextBlind.ante)} ante)`}
            </p>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 px-6 pb-6">
        <div className="bg-[#374151] rounded-lg p-4 text-center">
          <Users className="w-6 h-6 mx-auto mb-2 text-[#22D3EE]" />
          <p className="text-2xl font-bold text-white">{tournament.players_remaining || 0}</p>
          <p className="text-sm text-[#4A5E78]">Remaining</p>
        </div>
        <div className="bg-[#374151] rounded-lg p-4 text-center">
          <Coins className="w-6 h-6 mx-auto mb-2 text-[#10B981]" />
          <p className="text-2xl font-bold text-white">{formatChips(tournament.average_stack)}</p>
          <p className="text-sm text-[#4A5E78]">Avg Stack</p>
        </div>
        <div className="bg-[#374151] rounded-lg p-4 text-center">
          <Trophy className="w-6 h-6 mx-auto mb-2 text-[#F59E0B]" />
          <p className="text-2xl font-bold text-white">{tournament.current_entries || 0}</p>
          <p className="text-sm text-[#4A5E78]">Entries</p>
        </div>
      </div>

      {/* Staff Controls */}
      {isStaff && (
        <div className="border-t border-[#374151] px-6 py-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => handleAction('previous_level')}
              disabled={isLoading || tournament.current_level === 0}
              className="p-3 rounded-lg bg-[#374151] text-white hover:bg-[#4B5563] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Previous Level"
            >
              <SkipBack className="w-6 h-6" />
            </button>

            {tournament.status === 'scheduled' || tournament.status === 'registration' ? (
              <button
                onClick={() => handleAction('start')}
                disabled={isLoading}
                className="px-8 py-3 rounded-lg bg-[#10B981] text-white font-semibold hover:bg-[#059669] disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Play className="w-6 h-6" />
                Start Tournament
              </button>
            ) : isRunning ? (
              <button
                onClick={() => handleAction('pause')}
                disabled={isLoading}
                className="px-8 py-3 rounded-lg bg-[#F59E0B] text-white font-semibold hover:bg-[#D97706] disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Pause className="w-6 h-6" />
                Pause
              </button>
            ) : isPaused ? (
              <button
                onClick={() => handleAction('resume')}
                disabled={isLoading}
                className="px-8 py-3 rounded-lg bg-[#10B981] text-white font-semibold hover:bg-[#059669] disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Play className="w-6 h-6" />
                Resume
              </button>
            ) : null}

            <button
              onClick={() => handleAction('next_level')}
              disabled={isLoading}
              className="p-3 rounded-lg bg-[#374151] text-white hover:bg-[#4B5563] disabled:opacity-50 transition-colors"
              title="Next Level"
            >
              <SkipForward className="w-6 h-6" />
            </button>
          </div>

          {/* Additional controls */}
          {['running', 'paused', 'final_table'].includes(tournament.status) && (
            <div className="flex items-center justify-center gap-4 mt-4">
              {tournament.status !== 'final_table' && (
                <button
                  onClick={() => handleAction('final_table')}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-lg border border-[#8B5CF6] text-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white transition-colors"
                >
                  Final Table
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to end this tournament?')) {
                    handleAction('end');
                  }
                }}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg border border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white transition-colors"
              >
                End Tournament
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Compact version for dashboard
export function TournamentClockCompact({ tournamentId, initialData }) {
  const [clockData, setClockData] = useState(initialData);
  const [timeRemaining, setTimeRemaining] = useState(initialData?.clock?.timeRemaining || 0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/captain/tournaments/${tournamentId}/clock`);
        const data = await res.json();
        if (res.ok) {
          setClockData(data);
          setTimeRemaining(data.clock?.timeRemaining || 0);
        }
      } catch (error) {
        console.error('Failed to fetch clock:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [tournamentId]);

  useEffect(() => {
    if (!clockData?.clock?.isRunning) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [clockData?.clock?.isRunning]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!clockData) return null;

  const { currentBlind } = clockData;

  return (
    <div className="bg-[#1F2937] rounded-lg p-4 text-center">
      <p className="text-[#4A5E78] text-xs mb-1">
        Level {(clockData.tournament?.current_level || 0) + 1}
      </p>
      {currentBlind && (
        <p className="text-white font-bold">
          {currentBlind.smallBlind}/{currentBlind.bigBlind}
        </p>
      )}
      <p className="text-2xl font-mono text-white mt-1">
        {formatTime(timeRemaining)}
      </p>
    </div>
  );
}
