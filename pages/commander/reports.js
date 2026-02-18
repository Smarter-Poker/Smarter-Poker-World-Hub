/**
 * Staff Daily Reports Page
 * View and generate daily venue performance reports
 * Dark industrial sci-fi gaming theme
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  FileText,
  Calendar,
  Clock,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BarChart3,
  Award,
  Gift
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

function MetricCard({ label, value, change, changeLabel, icon: Icon, color = '#1877F2' }) {
  const isPositive = change > 0;
  const isNeutral = change === 0;

  return (
    <div className="cmd-panel p-4">
      <div className="flex items-start justify-between mb-2">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {change !== undefined && !isNeutral && (
          <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-[#31A24C]' : 'text-[#EF4444]'}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-[#B0B3B8]">{label}</p>
      {changeLabel && (
        <p className="text-xs text-[#3A3B3C] mt-1">{changeLabel}</p>
      )}
    </div>
  );
}

function GameSummaryRow({ game }) {
  return (
    <div className="flex items-center justify-between p-3 border-b border-[#3A3B3C] last:border-b-0">
      <div>
        <p className="font-medium text-white">
          {game.stakes} {game.game_type?.toUpperCase() || 'NLHE'}
        </p>
        <p className="text-sm text-[#B0B3B8]">
          Table {game.table_number}
        </p>
      </div>
      <div className="text-right">
        <p className="font-medium text-white">{game.hours_running}h</p>
        <p className="text-sm text-[#B0B3B8]">{game.unique_players} players</p>
      </div>
    </div>
  );
}

function PromotionSummaryRow({ promotion }) {
  return (
    <div className="flex items-center justify-between p-3 border-b border-[#3A3B3C] last:border-b-0">
      <div>
        <p className="font-medium text-white">{promotion.name}</p>
        <p className="text-sm text-[#B0B3B8]">{promotion.winners} winners</p>
      </div>
      <p className="font-bold text-[#31A24C]">${promotion.total_paid?.toLocaleString()}</p>
    </div>
  );
}

export default function StaffReportsPage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [report, setReport] = useState(null);
  const [exportMessage, setExportMessage] = useState(null);

  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login').catch(() => {});
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        router.push('/commander/login').catch(() => {});
        return;
      }
      setStaff(staffData);
      setVenueId(staffData.venue_id);
    } catch {
      router.push('/commander/login').catch(() => {});
    }
  }, [router]);

  useEffect(() => {
    if (venueId) {
      fetchReport();
    }
  }, [venueId, selectedDate]);

  async function fetchReport() {
    setLoading(true);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const res = await fetch(`/api/commander/reports/daily?venue_id=${venueId}&date=${dateStr}`);
      const data = await res.json();

      if (data.success) {
        setReport(data.data?.report);
      }
    } catch (err) {
      console.error('Fetch report failed:', err);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  function changeDate(days) {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    if (newDate <= new Date()) {
      setSelectedDate(newDate);
    }
  }

  async function handleExport() {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const res = await fetch(`/api/commander/reports/export?venue_id=${venueId}&date=${dateStr}&format=csv`);

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${dateStr}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setExportMessage({ type: 'success', text: 'Report Downloaded Successfully' });
      } else {
        setExportMessage({ type: 'error', text: 'Failed To Export Report' });
      }
    } catch (err) {
      console.error('Export failed:', err);
      setExportMessage({ type: 'error', text: 'Export Failed' });
    }
    setTimeout(() => setExportMessage(null), 3000);
  }

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const formattedDate = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  if (!staff) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <CommanderLayout title="Daily Reports">
      <div className="cmd-page">
        {/* Export Message */}
        {exportMessage && (
          <div
            className={`fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center text-white font-medium ${exportMessage.type === 'success' ? 'bg-[#31A24C]' : 'bg-[#EF4444]'
              }`}
          >
            {exportMessage.text}
          </div>
        )}

        {/* Action Bar */}
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-[#B0B3B8]">{report?.venue_name || 'Loading...'}</p>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 cmd-btn cmd-btn-primary"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Date Selector */}
          <div className="flex items-center justify-center gap-4 cmd-panel p-4">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 hover:bg-[#3A3B3C] rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[#B0B3B8]" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#1877F2]" />
              <span className="font-medium text-white">{formattedDate}</span>
              {isToday && (
                <span className="px-2 py-0.5 bg-[#31A24C]/10 text-[#31A24C] text-xs font-medium rounded">
                  Today
                </span>
              )}
            </div>
            <button
              onClick={() => changeDate(1)}
              disabled={isToday}
              className={`p-2 rounded-lg transition-colors ${isToday ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#3A3B3C]'
                }`}
            >
              <ChevronRight className="w-5 h-5 text-[#B0B3B8]" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : report ? (
            <>
              {/* Key Metrics */}
              <section>
                <h2 className="font-semibold text-white mb-3">Key Metrics</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard
                    icon={BarChart3}
                    label="Games Ran"
                    value={report.summary?.totalGames || 0}
                    change={report.comparisons?.gamesChange}
                    changeLabel="vs last week"
                    color="#1877F2"
                  />
                  <MetricCard
                    icon={Users}
                    label="Unique Players"
                    value={report.summary?.uniquePlayers || 0}
                    change={report.comparisons?.playersChange}
                    changeLabel="vs last week"
                    color="#31A24C"
                  />
                  <MetricCard
                    icon={Clock}
                    label="Table Hours"
                    value={`${report.summary?.totalHours || 0}h`}
                    change={report.comparisons?.hoursChange}
                    changeLabel="vs last week"
                    color="#F59E0B"
                  />
                  <MetricCard
                    icon={TrendingUp}
                    label="Peak Games"
                    value={report.summary?.peakConcurrent || 0}
                    color="#1877F2"
                  />
                </div>
              </section>

              {/* Secondary Metrics */}
              <section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="cmd-panel p-4">
                    <p className="text-sm text-[#B0B3B8]">Check-Ins</p>
                    <p className="text-xl font-bold text-white">{report.summary?.totalCheckIns || 0}</p>
                  </div>
                  <div className="cmd-panel p-4">
                    <p className="text-sm text-[#B0B3B8]">New Players</p>
                    <p className="text-xl font-bold text-white">{report.summary?.newPlayers || 0}</p>
                  </div>
                  <div className="cmd-panel p-4">
                    <p className="text-sm text-[#B0B3B8]">Avg Wait Time</p>
                    <p className="text-xl font-bold text-white">{report.summary?.avgWaitTime || 0}m</p>
                  </div>
                  <div className="cmd-panel p-4">
                    <p className="text-sm text-[#B0B3B8]">Comps Issued</p>
                    <p className="text-xl font-bold text-white">${report.summary?.compsIssued || 0}</p>
                  </div>
                </div>
              </section>

              {/* Games by Stakes */}
              <section>
                <h2 className="font-semibold text-white mb-3">Games By Stakes</h2>
                <div className="cmd-panel overflow-hidden">
                  {report.gamesByStakes?.length > 0 ? (
                    report.gamesByStakes.map((game, i) => (
                      <GameSummaryRow key={i} game={game} />
                    ))
                  ) : (
                    <div className="p-6 text-center text-[#B0B3B8]">No Games Recorded</div>
                  )}
                </div>
              </section>

              {/* Promotions Summary */}
              <section>
                <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#F59E0B]" />
                  Promotions
                </h2>
                <div className="cmd-panel overflow-hidden">
                  {report.promotions?.length > 0 ? (
                    report.promotions.map((promo, i) => (
                      <PromotionSummaryRow key={i} promotion={promo} />
                    ))
                  ) : (
                    <div className="p-6 text-center text-[#B0B3B8]">No Promotions Ran</div>
                  )}
                </div>
              </section>

              {/* Hourly Breakdown */}
              <section>
                <h2 className="font-semibold text-white mb-3">Hourly Activity</h2>
                <div className="cmd-panel p-4">
                  <div className="overflow-x-auto">
                    <div className="flex gap-2 min-w-fit">
                      {report.hourlyBreakdown?.map((hour, i) => (
                        <div key={i} className="flex flex-col items-center min-w-[60px]">
                          <div
                            className="w-8 bg-[#1877F2] rounded-t"
                            style={{ height: `${Math.max(hour.games * 8, 8)}px` }}
                          />
                          <p className="text-xs text-[#B0B3B8] mt-2">{hour.hour}</p>
                          <p className="text-xs font-medium text-white">{hour.games}g</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Staff on Duty */}
              <section>
                <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#B0B3B8]" />
                  Staff on Duty
                </h2>
                <div className="cmd-panel overflow-hidden">
                  {report.staffOnDuty?.map((member, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 border-b border-[#3A3B3C] last:border-b-0"
                    >
                      <div>
                        <p className="font-medium text-white">{member.name}</p>
                        <p className="text-sm text-[#B0B3B8]">{member.role}</p>
                      </div>
                      <span className="text-sm text-[#B0B3B8]">{member.hours}h</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="cmd-panel p-8 text-center">
              <FileText className="w-12 h-12 text-[#3A3B3C] mx-auto mb-3" />
              <p className="text-[#B0B3B8]">No Report Data Available</p>
              <p className="text-sm text-[#3A3B3C] mt-1">
                Reports are generated from daily activity
              </p>
            </div>
          )}
        </main>
      </div>
    </CommanderLayout>
  );
}
