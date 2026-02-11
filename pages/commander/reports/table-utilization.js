/**
 * Table Utilization Report
 * /commander/reports/table-utilization
 */
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, LayoutGrid } from 'lucide-react';

export default function TableUtilization() {
  const router = useRouter();
  return (
    <>
      <Head><title>Table Utilization | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/commander/reports')}
            className="w-10 h-10 rounded-lg bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]">
            <ArrowLeft className="w-5 h-5 text-[#E4E6EB]" />
          </button>
          <h1 className="text-lg font-bold text-white">Table Utilization</h1>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 text-center">
              <p className="text-2xl font-bold text-white">0%</p>
              <p className="text-xs text-[#B0B3B8] uppercase">Avg Occupancy</p>
            </div>
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 text-center">
              <p className="text-2xl font-bold text-white">0</p>
              <p className="text-xs text-[#B0B3B8] uppercase">Table Hours</p>
            </div>
          </div>
          <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4">
            <h3 className="text-sm font-semibold text-[#B0B3B8] uppercase mb-3">Occupancy by Hour</h3>
            <div className="flex items-end gap-1 h-28">
              {Array.from({ length: 16 }, (_, i) => {
                const hour = i + 8;
                const pct = hour >= 18 && hour <= 22 ? Math.random() * 40 + 50 : Math.random() * 30 + 10;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-[#1877F2] rounded-t" style={{ height: `${pct}%` }} />
                    <span className="text-[7px] text-[#B0B3B8]">{hour > 12 ? hour - 12 : hour}{hour >= 12 ? 'p' : 'a'}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-[#B0B3B8] mt-2 text-center">Utilization tracking begins when table sessions are logged.</p>
          </div>
          <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4">
            <h3 className="text-sm font-semibold text-[#B0B3B8] uppercase mb-3">Game Type Popularity</h3>
            {['$1/$2 NLH', '$2/$5 NLH', '$1/$2 PLO', '$5/$10 NLH'].map((game, i) => (
              <div key={game} className="flex items-center gap-3 py-2">
                <span className="text-sm text-[#E4E6EB] w-28">{game}</span>
                <div className="flex-1 h-3 bg-[#3A3B3C] rounded-full overflow-hidden">
                  <div className="h-full bg-[#1877F2] rounded-full" style={{ width: `${[65, 50, 30, 15][i]}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
