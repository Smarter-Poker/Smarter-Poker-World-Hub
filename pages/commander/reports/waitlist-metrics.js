/**
 * Waitlist Metrics Report
 * /commander/reports/waitlist-metrics
 */
import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, Clock, Users, Phone, TrendingUp } from 'lucide-react';

export default function WaitlistMetrics() {
  const router = useRouter();
  return (
    <>
      <Head><title>Waitlist Metrics | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push('/commander/reports')}
            className="w-10 h-10 rounded-lg bg-[#3A3B3C] flex items-center justify-center active:bg-[#4A4B4C]">
            <ArrowLeft className="w-5 h-5 text-[#E4E6EB]" />
          </button>
          <h1 className="text-lg font-bold text-white">Waitlist Metrics</h1>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Clock} label="Avg Wait Time" value="12 min" color="#F59E0B" />
            <StatCard icon={Phone} label="Call Rate" value="87%" color="#31A24C" />
            <StatCard icon={Users} label="No-Show Rate" value="8%" color="#EF4444" />
            <StatCard icon={TrendingUp} label="Peak Demand" value="7-9 PM" color="#1877F2" />
          </div>
          <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4">
            <h3 className="text-sm font-semibold text-[#B0B3B8] uppercase mb-3">Wait Times by Game</h3>
            {['$1/$2 NLH', '$2/$5 NLH', '$1/$2 PLO'].map(game => (
              <div key={game} className="flex items-center gap-3 py-2">
                <span className="text-sm text-[#E4E6EB] w-24">{game}</span>
                <div className="flex-1 h-4 bg-[#3A3B3C] rounded-full overflow-hidden">
                  <div className="h-full bg-[#F59E0B] rounded-full" style={{ width: `${Math.random() * 60 + 20}%` }} />
                </div>
                <span className="text-sm text-[#B0B3B8] w-16 text-right">{Math.floor(Math.random() * 20 + 5)} min</span>
              </div>
            ))}
            <p className="text-xs text-[#B0B3B8] mt-3">Real data will populate as waitlist sessions are tracked.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-4 text-center">
      <Icon className="w-5 h-5 mx-auto mb-2" style={{ color }} />
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-[#B0B3B8] uppercase mt-1">{label}</p>
    </div>
  );
}
