/**
 * Player Rewards/Comps Page
 * View comp balance, earn rates, and redeem rewards
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Gift,
  Clock,
  DollarSign,
  TrendingUp,
  History,
  Star,
  ChevronRight,
  Loader2,
  Coffee,
  Utensils,
  CreditCard
} from 'lucide-react';

const REWARD_CATEGORIES = [
  { id: 'food', label: 'Food & Beverage', icon: Utensils, color: '#F59E0B' },
  { id: 'merchandise', label: 'Merchandise', icon: Gift, color: '#8B5CF6' },
  { id: 'freeplay', label: 'Free Play', icon: CreditCard, color: '#10B981' },
  { id: 'tournament', label: 'Tournament Entry', icon: Star, color: '#1877F2' }
];

function StatCard({ icon: Icon, label, value, subtext, color = '#1877F2' }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl font-bold text-[#1F2937]">{value}</p>
          <p className="text-sm text-[#6B7280]">{label}</p>
          {subtext && <p className="text-xs text-[#9CA3AF] mt-1">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ transaction }) {
  const isEarn = transaction.type === 'earn';
  const date = new Date(transaction.created_at);

  return (
    <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB] last:border-b-0">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isEarn ? 'bg-[#10B981]/10' : 'bg-[#1877F2]/10'
        }`}>
          {isEarn ? (
            <TrendingUp className="w-5 h-5 text-[#10B981]" />
          ) : (
            <Gift className="w-5 h-5 text-[#1877F2]" />
          )}
        </div>
        <div>
          <p className="font-medium text-[#1F2937]">{transaction.description}</p>
          <p className="text-sm text-[#6B7280]">
            {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
      </div>
      <span className={`font-semibold ${isEarn ? 'text-[#10B981]' : 'text-[#1877F2]'}`}>
        {isEarn ? '+' : '-'}${transaction.amount}
      </span>
    </div>
  );
}

export default function PlayerRewardsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [lifetimeEarned, setLifetimeEarned] = useState(0);
  const [earnRate, setEarnRate] = useState(1);
  const [hoursPlayed, setHoursPlayed] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [comingSoonMessage, setComingSoonMessage] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/login?redirect=/hub/captain/rewards');
      return;
    }
    fetchRewardsData();
  }, [router]);

  async function fetchRewardsData() {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const headers = { Authorization: `Bearer ${token}` };

      const [balanceRes, transactionsRes, ratesRes] = await Promise.all([
        fetch('/api/captain/comps/balances', { headers }),
        fetch('/api/captain/comps/transactions?limit=20', { headers }),
        fetch('/api/captain/comps/rates', { headers })
      ]);

      const balanceData = await balanceRes.json();
      const transactionsData = await transactionsRes.json();
      const ratesData = await ratesRes.json();

      if (balanceData.success) {
        setBalance(balanceData.data?.balance || 0);
        setLifetimeEarned(balanceData.data?.lifetime_earned || 0);
        setHoursPlayed(balanceData.data?.total_hours || 0);
      }
      if (transactionsData.success) {
        setTransactions(transactionsData.data?.transactions || []);
      }
      if (ratesData.success) {
        setEarnRate(ratesData.data?.rate_per_hour || 1);
      }
    } catch (err) {
      console.error('Fetch rewards failed:', err);
      setBalance(0);
      setLifetimeEarned(0);
      setHoursPlayed(0);
      setEarnRate(1);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleRedeem(category) {
    setComingSoonMessage(`Redemption for ${category.label} coming soon!`);
    setTimeout(() => setComingSoonMessage(null), 3000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>My Rewards | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Coming Soon Banner */}
        {comingSoonMessage && (
          <div className="fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center text-white font-medium bg-[#1877F2]">
            {comingSoonMessage}
          </div>
        )}

        {/* Header */}
        <header className="bg-[#1877F2] text-white">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-4">
              <Gift className="w-8 h-8" />
              <h1 className="text-2xl font-bold">My Rewards</h1>
            </div>

            {/* Balance Card */}
            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-sm text-white/80 mb-1">Available Balance</p>
              <p className="text-4xl font-bold">${balance}</p>
              <p className="text-sm text-white/80 mt-2">
                Earn ${earnRate}/hour played
              </p>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              icon={TrendingUp}
              label="Lifetime Earned"
              value={`$${lifetimeEarned}`}
              color="#10B981"
            />
            <StatCard
              icon={Clock}
              label="Hours Played"
              value={hoursPlayed}
              subtext="all time"
              color="#8B5CF6"
            />
          </div>

          {/* Redeem Options */}
          <div>
            <h2 className="font-semibold text-[#1F2937] mb-3">Redeem Rewards</h2>
            <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              {REWARD_CATEGORIES.map((category, index) => {
                const Icon = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => handleRedeem(category)}
                    className={`w-full flex items-center justify-between p-4 hover:bg-[#F9FAFB] transition-colors ${
                      index < REWARD_CATEGORIES.length - 1 ? 'border-b border-[#E5E7EB]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${category.color}15` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: category.color }} />
                      </div>
                      <span className="font-medium text-[#1F2937]">{category.label}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#9CA3AF]" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Transactions */}
          <div>
            <h2 className="font-semibold text-[#1F2937] mb-3 flex items-center gap-2">
              <History className="w-5 h-5 text-[#6B7280]" />
              Recent Activity
            </h2>
            {transactions.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                <History className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                <p className="text-[#6B7280]">No transactions yet</p>
                <p className="text-sm text-[#9CA3AF] mt-1">
                  Play poker to start earning rewards!
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
                {transactions.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-[#1877F2]/5 rounded-xl p-4">
            <h3 className="font-medium text-[#1877F2] mb-2">How It Works</h3>
            <ul className="text-sm text-[#6B7280] space-y-2">
              <li>Earn ${earnRate} for every hour you play</li>
              <li>Bonus rewards during promotional hours</li>
              <li>Redeem anytime for food, merchandise, or free play</li>
              <li>Balance never expires</li>
            </ul>
          </div>
        </main>
      </div>
    </>
  );
}
