/**
 * Staff Daily Reports Page
 * View and generate daily venue performance reports
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
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

function MetricCard({ label, value, change, changeLabel, icon: Icon, color = '#1877F2' }) {
  const isPositive = change > 0;
  const isNeutral = change === 0;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-2">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {change !== undefined && !isNeutral && (
          <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-[#1F2937]">{value}</p>
      <p className="text-sm text-[#6B7280]">{label}</p>
      {changeLabel && (
        <p className="text-xs text-[#9CA3AF] mt-1">{changeLabel}</p>
      )}
    </div>
  );
}

function GameSummaryRow({ game }) {
  return (
    <div className="flex items-center justify-between p-3 border-b border-[#E5E7EB] last:border-b-0">
      <div>
        <p className="font-medium text-[#1F2937]">
          {game.stakes} {game.game_type?.toUpperCase() || 'NLHE'}
        </p>
        <p className="text-sm text-[#6B7280]">
          Table {game.table_number}
        </p>
      </div>
      <div className="text-right">
        <p className="font-medium text-[#1F2937]">{game.hours_running}h</p>
        <p className="text-sm text-[#6B7280]">{game.unique_players} players</p>
      </div>
    </div>
  );
}

function PromotionSummaryRow({ promotion }) {
  return (
    <div className="flex items-center justify-between p-3 border-b border-[#E5E7EB] last:border-b-0">
      <div>
        <p className="font-medium text-[#1F2937]">{promotion.name}</p>
        <p className="text-sm text-[#6B7280]">{promotion.winners} winners</p>
      </div>
      <p className="font-bold text-[#10B981]">${promotion.total_paid?.toLocaleString()}</p>
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

  useEffect(() => {
    const storedStaff = localStorage.getItem('captain_staff');
    if (!storedStaff) {
      router.push('/captain/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        router.push('/captain/login');
        return;
      }
      setStaff(staffData);
      setVenueId(staffData.venue_id);
    } catch {
      router.push('/captain/login');
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
      const res = await fetch(`/api/captain/reports/daily?venue_id=${venueId}&date=${dateStr}`);
      const data = await res.json();

      if (data.success) {
        setReport(data.data?.report);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      // Mock data
      setReport({
        date: selectedDate.toISOString().split('T')[0],
        venue_name: 'Bellagio Poker Room',
        summary: {
          totalGames: 18,
          totalHours: 156,
          uniquePlayers: 89,
          newPlayers: 12,
          peakConcurrent: 14,
          avgWaitTime: 18,
          totalCheckIns: 142,
          compsIssued: 450
        },
        comparisons: {
          gamesChange: 12,
          playersChange: 8,
          hoursChange: -5
        },
        gamesByStakes: [
          { stakes: '$1/$3', game_type: 'nlhe', table_number: 1, hours_running: 16, unique_players: 32 },
          { stakes: '$2/$5', game_type: 'nlhe', table_number: 3, hours_running: 14, unique_players: 28 },
          { stakes: '$5/$10', game_type: 'nlhe', table_number: 5, hours_running: 10, unique_players: 18 },
          { stakes: '$1/$2', game_type: 'plo', table_number: 7, hours_running: 8, unique_players: 14 }
        ],
        promotions: [
          { name: 'High Hand Bonus', winners: 12, total_paid: 6000 },
          { name: 'Bad Beat Jackpot', winners: 0, total_paid: 0 },
          { name: 'Splash Pot', winners: 8, total_paid: 400 }
        ],
        hourlyBreakdown: [
          { hour: '6 AM', games: 4, players: 28 },
          { hour: '9 AM', games: 6, players: 42 },
          { hour: '12 PM', games: 10, players: 68 },
          { hour: '3 PM', games: 12, players: 82 },
          { hour: '6 PM', games: 14, players: 96 },
          { hour: '9 PM', games: 12, players: 84 },
          { hour: '12 AM', games: 8, players: 54 }
        ],
        staffOnDuty: [
          { name: 'Mike Johnson', role: 'Floor Manager', hours: 8 },
          { name: 'Sarah Williams', role: 'Brush', hours: 8 },
          { name: 'Tom Davis', role: 'Brush', hours: 6 }
        ]
      });
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

  function handleExport() {
    // In production, this would generate a PDF or CSV
    alert('Report export functionality would be implemented here');
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
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Daily Reports | Smarter Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/captain/dashboard')}
                  className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-[#6B7280]" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-[#1F2937] flex items-center gap-2">
                    <FileText className="w-6 h-6 text-[#1877F2]" />
                    Daily Reports
                  </h1>
                  <p className="text-sm text-[#6B7280]">{report?.venue_name || 'Loading...'}</p>
                </div>
              </div>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white rounded-lg hover:bg-[#1665D8] transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Date Selector */}
          <div className="flex items-center justify-center gap-4 bg-white rounded-xl border border-[#E5E7EB] p-4">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[#6B7280]" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#1877F2]" />
              <span className="font-medium text-[#1F2937]">{formattedDate}</span>
              {isToday && (
                <span className="px-2 py-0.5 bg-[#10B981]/10 text-[#10B981] text-xs font-medium rounded">
                  Today
                </span>
              )}
            </div>
            <button
              onClick={() => changeDate(1)}
              disabled={isToday}
              className={`p-2 rounded-lg transition-colors ${
                isToday ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#F3F4F6]'
              }`}
            >
              <ChevronRight className="w-5 h-5 text-[#6B7280]" />
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
                <h2 className="font-semibold text-[#1F2937] mb-3">Key Metrics</h2>
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
                    color="#10B981"
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
                    color="#8B5CF6"
                  />
                </div>
              </section>

              {/* Secondary Metrics */}
              <section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                    <p className="text-sm text-[#6B7280]">Check-ins</p>
                    <p className="text-xl font-bold text-[#1F2937]">{report.summary?.totalCheckIns || 0}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                    <p className="text-sm text-[#6B7280]">New Players</p>
                    <p className="text-xl font-bold text-[#1F2937]">{report.summary?.newPlayers || 0}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                    <p className="text-sm text-[#6B7280]">Avg Wait Time</p>
                    <p className="text-xl font-bold text-[#1F2937]">{report.summary?.avgWaitTime || 0}m</p>
                  </div>
                  <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                    <p className="text-sm text-[#6B7280]">Comps Issued</p>
                    <p className="text-xl font-bold text-[#1F2937]">${report.summary?.compsIssued || 0}</p>
                  </div>
                </div>
              </section>

              {/* Games by Stakes */}
              <section>
                <h2 className="font-semibold text-[#1F2937] mb-3">Games by Stakes</h2>
                <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
                  {report.gamesByStakes?.length > 0 ? (
                    report.gamesByStakes.map((game, i) => (
                      <GameSummaryRow key={i} game={game} />
                    ))
                  ) : (
                    <div className="p-6 text-center text-[#6B7280]">No games recorded</div>
                  )}
                </div>
              </section>

              {/* Promotions Summary */}
              <section>
                <h2 className="font-semibold text-[#1F2937] mb-3 flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#F59E0B]" />
                  Promotions
                </h2>
                <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
                  {report.promotions?.length > 0 ? (
                    report.promotions.map((promo, i) => (
                      <PromotionSummaryRow key={i} promotion={promo} />
                    ))
                  ) : (
                    <div className="p-6 text-center text-[#6B7280]">No promotions ran</div>
                  )}
                </div>
              </section>

              {/* Hourly Breakdown */}
              <section>
                <h2 className="font-semibold text-[#1F2937] mb-3">Hourly Activity</h2>
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                  <div className="overflow-x-auto">
                    <div className="flex gap-2 min-w-fit">
                      {report.hourlyBreakdown?.map((hour, i) => (
                        <div key={i} className="flex flex-col items-center min-w-[60px]">
                          <div
                            className="w-8 bg-[#1877F2] rounded-t"
                            style={{ height: `${Math.max(hour.games * 8, 8)}px` }}
                          />
                          <p className="text-xs text-[#6B7280] mt-2">{hour.hour}</p>
                          <p className="text-xs font-medium text-[#1F2937]">{hour.games}g</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Staff on Duty */}
              <section>
                <h2 className="font-semibold text-[#1F2937] mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#6B7280]" />
                  Staff on Duty
                </h2>
                <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
                  {report.staffOnDuty?.map((member, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 border-b border-[#E5E7EB] last:border-b-0"
                    >
                      <div>
                        <p className="font-medium text-[#1F2937]">{member.name}</p>
                        <p className="text-sm text-[#6B7280]">{member.role}</p>
                      </div>
                      <span className="text-sm text-[#6B7280]">{member.hours}h</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <FileText className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#6B7280]">No report data available</p>
              <p className="text-sm text-[#9CA3AF] mt-1">
                Reports are generated from daily activity
              </p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
