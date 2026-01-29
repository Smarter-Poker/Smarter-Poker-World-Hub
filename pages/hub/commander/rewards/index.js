/**
 * Player Rewards/Comps Page
 * View comp balance, earn rates, and redeem rewards
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
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
  CreditCard,
  Zap
} from 'lucide-react';

const REWARD_CATEGORIES = [
  { id: 'food', label: 'Food & Beverage', icon: Utensils, color: '#F59E0B' },
  { id: 'merchandise', label: 'Merchandise', icon: Gift, color: '#8B5CF6' },
  { id: 'freeplay', label: 'Free Play', icon: CreditCard, color: '#10B981' },
  { id: 'tournament', label: 'Tournament Entry', icon: Star, color: '#22D3EE' }
];

function StatCard({ icon: Icon, label, value, subtext, color = '#22D3EE' }) {
  return (
    <div className="cmd-panel p-4">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center border-2"
          style={{ backgroundColor: `${color}15`, borderColor: `${color}40` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-sm text-[#64748B]">{label}</p>
          {subtext && <p className="text-xs text-[#64748B] mt-1">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ transaction }) {
  const isEarn = transaction.type === 'earn';
  const date = new Date(transaction.created_at);

  return (
    <div className="flex items-center justify-between p-4 border-b border-[#4A5E78] last:border-b-0">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
          isEarn ? 'bg-[#10B981]/10 border-[#10B981]/30' : 'bg-[#22D3EE]/10 border-[#22D3EE]/30'
        }`}>
          {isEarn ? (
            <TrendingUp className="w-5 h-5 text-[#10B981]" />
          ) : (
            <Gift className="w-5 h-5 text-[#22D3EE]" />
          )}
        </div>
        <div>
          <p className="font-medium text-white">{transaction.description}</p>
          <p className="text-sm text-[#64748B]">
            {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
      </div>
      <span className={`font-bold ${isEarn ? 'text-[#10B981]' : 'text-[#22D3EE]'}`}>
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
      router.push('/login?redirect=/hub/commander/rewards');
      return;
    }
    fetchRewardsData();
  }, [router]);

  async function fetchRewardsData() {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const headers = { Authorization: `Bearer ${token}` };

      const [balanceRes, transactionsRes, ratesRes] = await Promise.all([
        fetch('/api/commander/comps/balances', { headers }),
        fetch('/api/commander/comps/transactions?limit=20', { headers }),
        fetch('/api/commander/comps/rates', { headers })
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
    if (balance <= 0) {
      setComingSoonMessage('No balance available to redeem');
      setTimeout(() => setComingSoonMessage(null), 3000);
      return;
    }

    // Prompt for redemption amount
    const amount = prompt(`Enter amount to redeem for ${category.label} (max $${balance}):`);
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return;
    }

    const redeemAmount = Math.min(parseFloat(amount), balance);

    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/commander/comps/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          category: category.id,
          amount: redeemAmount
        })
      });

      const data = await res.json();
      if (data.success) {
        setBalance(prev => prev - redeemAmount);
        setComingSoonMessage(`Successfully redeemed $${redeemAmount} for ${category.label}!`);
        fetchRewardsData(); // Refresh data
      } else {
        setComingSoonMessage(data.error || 'Redemption failed');
      }
    } catch (err) {
      console.error('Redeem failed:', err);
      setComingSoonMessage('Redemption failed. Please try again.');
    }
    setTimeout(() => setComingSoonMessage(null), 3000);
  }

  if (loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>My Rewards | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Coming Soon Banner */}
        {comingSoonMessage && (
          <div className="fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center font-bold bg-[#22D3EE]/20 border-b-2 border-[#22D3EE] text-[#22D3EE] uppercase tracking-wide">
            {comingSoonMessage}
          </div>
        )}

        {/* Header */}
        <header className="cmd-header-full">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="cmd-icon-box cmd-icon-box-glow w-14 h-14">
                <Gift className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-wider cmd-text-glow">MY REWARDS</h1>
            </div>

            {/* Balance Card */}
            <div className="cmd-inset rounded-xl p-5">
              <p className="text-sm text-[#64748B] mb-1 font-bold uppercase tracking-wide">Available Balance</p>
              <p className="cmd-stat-value">${balance}</p>
              <p className="text-sm text-[#64748B] mt-2 font-medium">
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
            <h2 className="font-bold text-white mb-3 uppercase tracking-wide text-sm">Redeem Rewards</h2>
            <div className="cmd-panel overflow-hidden p-0">
              {REWARD_CATEGORIES.map((category, index) => {
                const Icon = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => handleRedeem(category)}
                    className={`w-full flex items-center justify-between p-4 hover:bg-[#0F1C32] transition-colors ${
                      index < REWARD_CATEGORIES.length - 1 ? 'border-b border-[#4A5E78]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center border-2"
                        style={{ backgroundColor: `${category.color}15`, borderColor: `${category.color}40` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: category.color }} />
                      </div>
                      <span className="font-medium text-white">{category.label}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#64748B]" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Transactions */}
          <div>
            <h2 className="font-bold text-white mb-3 flex items-center gap-2 uppercase tracking-wide text-sm">
              <History className="w-5 h-5 text-[#64748B]" />
              Recent Activity
            </h2>
            {transactions.length === 0 ? (
              <div className="cmd-panel p-8 text-center">
                <div className="cmd-icon-box mx-auto mb-3">
                  <History className="w-7 h-7" />
                </div>
                <p className="text-[#64748B] font-medium">No transactions yet</p>
                <p className="text-sm text-[#64748B] mt-1">
                  Play poker to start earning rewards!
                </p>
              </div>
            ) : (
              <div className="cmd-panel overflow-hidden p-0">
                {transactions.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="cmd-inset rounded-xl p-5">
            <h3 className="font-bold text-[#22D3EE] mb-3 uppercase tracking-wide text-sm">How It Works</h3>
            <ul className="text-sm text-[#CBD5E1] space-y-2">
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
