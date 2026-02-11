/**
 * Revenue Report
 * /commander/reports/revenue
 */
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, DollarSign, TrendingUp, Trophy, Clock } from 'lucide-react';

export default function RevenueReport() {
  const router = useRouter();
  const categories = [
    { label: 'Tournament Fees', value: 0, icon: Trophy, color: '#1877F2' },
    { label: 'Time Charges', value: 0, icon: Clock, color: '#31A24C' },
    { label: 'Rake', value: 0, icon: DollarSign, color: '#F59E0B' },
    { label: 'Promotions', value: 0, icon: TrendingUp, color: '#B0B3B8' },
  ];

  return (
    <>
      <Head><title>Revenue | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/commander/reports')}
            className="w-10 h-10 rounded-lg bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]">
            <ArrowLeft className="w-5 h-5 text-[#E4E6EB]" />
          </button>
          <h1 className="text-lg font-bold text-white">Revenue Report</h1>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-5 text-center">
            <p className="text-xs text-[#B0B3B8] uppercase mb-1">Total Revenue</p>
            <p className="text-4xl font-bold text-[#31A24C]">$0</p>
            <p className="text-xs text-[#B0B3B8] mt-1">Revenue tracking begins when sessions and tournaments are processed</p>
          </div>
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.label} className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 flex items-center gap-3">
                <cat.icon className="w-5 h-5" style={{ color: cat.color }} />
                <span className="flex-1 text-sm text-[#E4E6EB]">{cat.label}</span>
                <span className="text-sm font-bold text-white">${cat.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4">
            <h3 className="text-sm font-semibold text-[#B0B3B8] uppercase mb-3">Revenue by Day</h3>
            <div className="flex items-end gap-1 h-24">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-[#31A24C]/30 rounded-t" style={{ height: `${Math.random() * 80 + 10}%` }} />
                  <span className="text-[8px] text-[#B0B3B8]">{['M','T','W','T','F','S','S'][i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
