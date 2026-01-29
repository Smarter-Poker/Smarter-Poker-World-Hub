/**
 * TournamentManager Component - Comprehensive tournament operations hub
 * Reference: SCOPE_LOCK.md - Phase 3 Components
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Trophy, Users, DollarSign, Clock, Play, Pause, SkipForward,
  UserPlus, UserMinus, Award, Settings, RefreshCw, AlertCircle
} from 'lucide-react';
import TournamentClock from './TournamentClock';
import TournamentEntryList from './TournamentEntryList';

const STATUS_STYLES = {
  scheduled: { bg: '#22D3EE20', text: '#22D3EE', label: 'Scheduled' },
  registering: { bg: '#3B82F620', text: '#3B82F6', label: 'Registering' },
  running: { bg: '#10B98120', text: '#10B981', label: 'Live' },
  paused: { bg: '#F59E0B20', text: '#F59E0B', label: 'Paused' },
  final_table: { bg: '#8B5CF620', text: '#8B5CF6', label: 'Final Table' },
  completed: { bg: '#4A5E7820', text: '#64748B', label: 'Completed' },
  cancelled: { bg: '#EF444420', text: '#EF4444', label: 'Cancelled' }
};

const TAB_OPTIONS = [
  { key: 'overview', label: 'Overview', icon: Trophy },
  { key: 'players', label: 'Players', icon: Users },
  { key: 'clock', label: 'Clock', icon: Clock },
  { key: 'payouts', label: 'Payouts', icon: DollarSign }
];

export default function TournamentManager({
  tournament,
  entries = [],
  onRefresh,
  onClockAction,
  onRegisterPlayer,
  onEliminate,
  onRebuy,
  onAddon,
  onUpdateChips,
  onUpdatePayout,
  isStaff = true,
  isLoading = false
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [registerName, setRegisterName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const statusStyle = STATUS_STYLES[tournament?.status] || STATUS_STYLES.scheduled;
  const isLive = tournament?.status === 'running' || tournament?.status === 'paused';
  const isRegistrationOpen = tournament?.status === 'registering' ||
    (tournament?.status === 'running' && tournament?.current_level <= (tournament?.late_reg_levels || 0));

  const activeEntries = entries.filter(e => ['seated', 'active'].includes(e.status));
  const eliminatedEntries = entries.filter(e => e.status === 'eliminated');
  const prizePool = tournament?.actual_prizepool || tournament?.prize_pool ||
    (entries.length * (tournament?.buyin_amount || 0));

  const handleClockAction = useCallback(async (action) => {
    setActionLoading(true);
    try {
      await onClockAction?.(action);
    } finally {
      setActionLoading(false);
    }
  }, [onClockAction]);

  const handleRegister = useCallback(async () => {
    if (!registerName.trim()) return;
    setActionLoading(true);
    try {
      await onRegisterPlayer?.({
        player_name: registerName.trim(),
        player_phone: registerPhone.trim() || undefined
      });
      setRegisterName('');
      setRegisterPhone('');
      setShowRegisterForm(false);
    } finally {
      setActionLoading(false);
    }
  }, [registerName, registerPhone, onRegisterPlayer]);

  if (!tournament) {
    return (
      <div className="cmd-panel p-8 text-center">
        <Trophy size={48} className="mx-auto text-[#4A5E78] mb-3" />
        <p className="text-[#64748B]">No tournament selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tournament Header */}
      <div className="cmd-panel cmd-corner-lights p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{tournament.name}</h2>
              <span
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
              >
                {statusStyle.label}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-[#64748B]">
              <span className="flex items-center gap-1">
                <Users size={14} />
                {activeEntries.length} / {entries.length} players
              </span>
              <span className="flex items-center gap-1">
                <DollarSign size={14} />
                ${prizePool.toLocaleString()} prize pool
              </span>
              <span className="flex items-center gap-1">
                <Clock size={14} />
                Level {tournament.current_level || 1}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRegistrationOpen && isStaff && (
              <button
                onClick={() => setShowRegisterForm(!showRegisterForm)}
                className="cmd-btn cmd-btn-primary flex items-center gap-2 text-sm"
              >
                <UserPlus size={16} />
                Register Player
              </button>
            )}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 rounded-lg border border-[#4A5E78] text-[#64748B] hover:text-[#22D3EE] hover:border-[#22D3EE] transition-colors"
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="bg-[#0B1426] rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-[#22D3EE]">{entries.length}</p>
            <p className="text-xs text-[#64748B]">Entries</p>
          </div>
          <div className="bg-[#0B1426] rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-[#10B981]">{activeEntries.length}</p>
            <p className="text-xs text-[#64748B]">Remaining</p>
          </div>
          <div className="bg-[#0B1426] rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-[#EF4444]">{eliminatedEntries.length}</p>
            <p className="text-xs text-[#64748B]">Eliminated</p>
          </div>
          <div className="bg-[#0B1426] rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-[#F59E0B]">
              ${(tournament.buyin_amount || 0) + (tournament.buyin_fee || 0)}
            </p>
            <p className="text-xs text-[#64748B]">Buy-in</p>
          </div>
        </div>
      </div>

      {/* Walk-in Registration Form */}
      {showRegisterForm && (
        <div className="cmd-panel p-4">
          <h3 className="font-medium text-white mb-3">Walk-in Registration</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={registerName}
              onChange={(e) => setRegisterName(e.target.value)}
              placeholder="Player name"
              className="flex-1 cmd-input"
            />
            <input
              type="tel"
              value={registerPhone}
              onChange={(e) => setRegisterPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="w-40 cmd-input"
            />
            <button
              onClick={handleRegister}
              disabled={!registerName.trim() || actionLoading}
              className="cmd-btn cmd-btn-primary text-sm disabled:opacity-50"
            >
              {actionLoading ? 'Adding...' : 'Add Entry'}
            </button>
            <button
              onClick={() => setShowRegisterForm(false)}
              className="cmd-btn cmd-btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-[#0B1426] rounded-lg p-1">
        {TAB_OPTIONS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-[#132240] text-[#22D3EE]'
                  : 'text-[#64748B] hover:text-white'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Clock Controls (if live) */}
          {isLive && isStaff && (
            <div className="cmd-panel p-4">
              <h3 className="font-medium text-white mb-3">Clock Controls</h3>
              <TournamentClock
                tournament={tournament}
                onPause={() => handleClockAction('pause')}
                onResume={() => handleClockAction('resume')}
                onNextLevel={() => handleClockAction('next_level')}
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleClockAction(tournament.clock_status === 'running' ? 'pause' : 'resume')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: tournament.clock_status === 'running' ? '#F59E0B' : '#10B981' }}
                >
                  {tournament.clock_status === 'running' ? <Pause size={16} /> : <Play size={16} />}
                  {tournament.clock_status === 'running' ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => handleClockAction('next_level')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border text-[#94A3B8] disabled:opacity-50"
                  style={{ borderColor: '#4A5E78' }}
                >
                  <SkipForward size={16} />
                  Next Level
                </button>
              </div>
            </div>
          )}

          {/* Tournament Details */}
          <div className="cmd-panel p-4">
            <h3 className="font-medium text-white mb-3">Tournament Details</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Game Type</span>
                <span className="text-white font-medium">{tournament.game_type?.toUpperCase() || 'NLHE'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Starting Chips</span>
                <span className="text-white font-medium">{(tournament.starting_chips || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Buy-in</span>
                <span className="text-white font-medium">
                  ${tournament.buyin_amount || 0} + ${tournament.buyin_fee || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Max Entries</span>
                <span className="text-white font-medium">{tournament.max_entries || 'Unlimited'}</span>
              </div>
              {tournament.allows_rebuys && (
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Rebuys</span>
                  <span className="text-[#F59E0B] font-medium">Allowed</span>
                </div>
              )}
              {tournament.allows_addon && (
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Add-on</span>
                  <span className="text-[#8B5CF6] font-medium">Allowed</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#64748B]">Late Registration</span>
                <span className="text-white font-medium">
                  {tournament.late_reg_levels ? `Through Level ${tournament.late_reg_levels}` : 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Average Stack</span>
                <span className="text-white font-medium">
                  {tournament.average_stack ? tournament.average_stack.toLocaleString() : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'players' && (
        <TournamentEntryList
          entries={entries}
          tournament={tournament}
          onEliminate={onEliminate}
          onRebuy={onRebuy}
          onAddon={onAddon}
          onUpdateChips={onUpdateChips}
          isStaff={isStaff}
          showActions={isLive}
        />
      )}

      {activeTab === 'clock' && (
        <div className="cmd-panel p-6">
          {isLive ? (
            <>
              <TournamentClock
                tournament={tournament}
                onPause={() => handleClockAction('pause')}
                onResume={() => handleClockAction('resume')}
                onNextLevel={() => handleClockAction('next_level')}
              />
              {isStaff && (
                <div className="mt-4 flex gap-2 justify-center">
                  <button
                    onClick={() => handleClockAction(tournament.clock_status === 'running' ? 'pause' : 'resume')}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: tournament.clock_status === 'running' ? '#F59E0B' : '#10B981' }}
                  >
                    {tournament.clock_status === 'running' ? <Pause size={18} /> : <Play size={18} />}
                    {tournament.clock_status === 'running' ? 'Pause Clock' : 'Resume Clock'}
                  </button>
                  <button
                    onClick={() => handleClockAction('next_level')}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium border text-[#94A3B8] disabled:opacity-50"
                    style={{ borderColor: '#4A5E78' }}
                  >
                    <SkipForward size={18} />
                    Advance Level
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <Clock size={48} className="mx-auto text-[#4A5E78] mb-3" />
              <p className="text-[#64748B]">
                {tournament.status === 'completed'
                  ? 'Tournament has ended'
                  : 'Tournament has not started yet'}
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'payouts' && (
        <div className="cmd-panel p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-white">Payout Structure</h3>
            <span className="text-sm text-[#64748B]">
              Prize Pool: <span className="text-[#10B981] font-medium">${prizePool.toLocaleString()}</span>
            </span>
          </div>

          {tournament.payout_structure && tournament.payout_structure.length > 0 ? (
            <div className="space-y-2">
              {tournament.payout_structure.map((payout, index) => {
                const amount = Math.round(prizePool * (payout.percentage / 100));
                const finisher = eliminatedEntries.find(e => e.finish_position === index + 1);

                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[#0B1426]"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                      style={{
                        backgroundColor: index === 0 ? '#F59E0B' :
                          index === 1 ? '#9CA3AF' :
                          index === 2 ? '#B45309' : '#6B7280'
                      }}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      {finisher ? (
                        <span className="text-white font-medium">
                          {finisher.player_name || finisher.profiles?.display_name || 'Unknown'}
                        </span>
                      ) : (
                        <span className="text-[#4A5E78] italic">TBD</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[#10B981] font-medium">${amount.toLocaleString()}</span>
                      <span className="text-xs text-[#4A5E78] ml-2">({payout.percentage}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <Award size={36} className="mx-auto text-[#4A5E78] mb-2" />
              <p className="text-[#64748B]">No payout structure defined</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
