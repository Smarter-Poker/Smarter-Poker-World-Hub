import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';

const TIERS = {
  starter: {
    name: 'Starter',
    price: 99,
    tables: 5,
    staff: 3,
    sms: 100,
    features: ['Waitlist Management', 'Basic Analytics', 'SMS Notifications (100/mo)', 'Social Hub Page']
  },
  professional: {
    name: 'Professional',
    price: 199,
    tables: 15,
    staff: 10,
    sms: 500,
    features: ['Everything in Starter', 'Tournament Management', 'Advanced Analytics', 'SMS Notifications (500/mo)', 'Priority Support'],
    popular: true
  },
  enterprise: {
    name: 'Enterprise',
    price: 399,
    tables: 'Unlimited',
    staff: 'Unlimited',
    sms: 'Unlimited',
    features: ['Everything in Professional', 'API Access', 'White-label Option', 'Unlimited SMS', 'Dedicated Support']
  }
};

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationResult, setRegistrationResult] = useState(null);

  const [clubInfo, setClubInfo] = useState({
    name: '', address: '', city: '', state: '', zip: '',
    phone: '', email: '', website: '', tables: '', gamesOffered: []
  });

  const [ownerInfo, setOwnerInfo] = useState({
    name: '', email: '', password: '', confirmPassword: '', phone: ''
  });

  const [selectedTier, setSelectedTier] = useState('professional');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleClubInfoChange = (e) => {
    setClubInfo(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleOwnerInfoChange = (e) => {
    setOwnerInfo(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleGameToggle = (game) => {
    setClubInfo(prev => ({
      ...prev,
      gamesOffered: prev.gamesOffered.includes(game)
        ? prev.gamesOffered.filter(g => g !== game)
        : [...prev.gamesOffered, game]
    }));
  };

  const validateStep = (stepNum) => {
    setError('');
    if (stepNum === 1) {
      if (!clubInfo.name || !clubInfo.address || !clubInfo.city || !clubInfo.state || !clubInfo.zip || !clubInfo.phone || !clubInfo.email) {
        setError('Please fill in all required fields');
        return false;
      }
    }
    if (stepNum === 2) {
      if (!ownerInfo.name || !ownerInfo.email || !ownerInfo.password || !ownerInfo.phone) {
        setError('Please fill in all required fields');
        return false;
      }
      if (ownerInfo.password !== ownerInfo.confirmPassword) {
        setError('Passwords do not match');
        return false;
      }
      if (ownerInfo.password.length < 8) {
        setError('Password must be at least 8 characters');
        return false;
      }
    }
    if (stepNum === 3 && !agreedToTerms) {
      setError('You must agree to the terms and conditions');
      return false;
    }
    return true;
  };

  const nextStep = () => { if (validateStep(step)) setStep(step + 1); };
  const prevStep = () => { setStep(step - 1); setError(''); };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/commander/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: selectedTier, clubInfo, ownerInfo, skipPayment: true })
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Failed to create account'); return; }
      setRegistrationResult(result);
      setStep(4);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Head>
        <title>Register Your Club - Club Commander</title>
      </Head>

      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-3xl">♠️</div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Get Started with Club Commander</h1>
          <p className="text-gray-400">Set up your poker room in minutes - 14-day free trial</p>
        </div>

        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex justify-between relative">
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-700">
              <div className="h-full bg-purple-500 transition-all" style={{ width: `${((step - 1) / 3) * 100}%` }} />
            </div>
            {['Club Info', 'Owner Account', 'Select Plan', 'Complete'].map((label, idx) => (
              <div key={idx} className="flex flex-col items-center relative z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${step > idx + 1 ? 'bg-green-500 text-white' : step === idx + 1 ? 'bg-purple-500 text-white ring-4 ring-purple-500/30' : 'bg-gray-700 text-gray-400'
                  }`}>{step > idx + 1 ? '✓' : idx + 1}</div>
                <span className={`text-xs mt-2 ${step === idx + 1 ? 'text-white' : 'text-gray-500'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-2xl mx-auto bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50">
          {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm">⚠️ {error}</div>}

          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-white mb-6">Club Information</h2>
              <div><label className="block text-sm text-gray-300 mb-1.5">Club/Venue Name *</label><input type="text" name="name" value={clubInfo.name} onChange={handleClubInfoChange} className={inputClass} placeholder="e.g., Bellagio Poker Room" /></div>
              <div><label className="block text-sm text-gray-300 mb-1.5">Street Address *</label><input type="text" name="address" value={clubInfo.address} onChange={handleClubInfoChange} className={inputClass} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm text-gray-300 mb-1.5">City *</label><input type="text" name="city" value={clubInfo.city} onChange={handleClubInfoChange} className={inputClass} /></div>
                <div><label className="block text-sm text-gray-300 mb-1.5">State *</label><select name="state" value={clubInfo.state} onChange={handleClubInfoChange} className={inputClass}><option value="">Select</option>{US_STATES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="block text-sm text-gray-300 mb-1.5">ZIP *</label><input type="text" name="zip" value={clubInfo.zip} onChange={handleClubInfoChange} className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-gray-300 mb-1.5">Phone *</label><input type="tel" name="phone" value={clubInfo.phone} onChange={handleClubInfoChange} className={inputClass} /></div>
                <div><label className="block text-sm text-gray-300 mb-1.5">Email *</label><input type="email" name="email" value={clubInfo.email} onChange={handleClubInfoChange} className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-gray-300 mb-1.5">Website</label><input type="url" name="website" value={clubInfo.website} onChange={handleClubInfoChange} className={inputClass} /></div>
                <div><label className="block text-sm text-gray-300 mb-1.5">Tables</label><input type="number" name="tables" value={clubInfo.tables} onChange={handleClubInfoChange} className={inputClass} min="1" /></div>
              </div>
              <div><label className="block text-sm text-gray-300 mb-2">Games Offered</label><div className="flex flex-wrap gap-2">{['NLH', 'PLO', 'PLO8', 'Limit HE', 'Stud', 'Mixed'].map(game => (<button key={game} type="button" onClick={() => handleGameToggle(game)} className={`px-4 py-2 rounded-full text-sm ${clubInfo.gamesOffered.includes(game) ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300'}`}>{game}</button>))}</div></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-white mb-6">Create Owner Account</h2>
              <div><label className="block text-sm text-gray-300 mb-1.5">Full Name *</label><input type="text" name="name" value={ownerInfo.name} onChange={handleOwnerInfoChange} className={inputClass} /></div>
              <div><label className="block text-sm text-gray-300 mb-1.5">Email *</label><input type="email" name="email" value={ownerInfo.email} onChange={handleOwnerInfoChange} className={inputClass} /></div>
              <div><label className="block text-sm text-gray-300 mb-1.5">Phone *</label><input type="tel" name="phone" value={ownerInfo.phone} onChange={handleOwnerInfoChange} className={inputClass} /></div>
              <div><label className="block text-sm text-gray-300 mb-1.5">Password *</label><input type="password" name="password" value={ownerInfo.password} onChange={handleOwnerInfoChange} className={inputClass} placeholder="Min 8 characters" /></div>
              <div><label className="block text-sm text-gray-300 mb-1.5">Confirm Password *</label><input type="password" name="confirmPassword" value={ownerInfo.confirmPassword} onChange={handleOwnerInfoChange} className={inputClass} /></div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-white mb-6">Choose Your Plan</h2>
              <div className="space-y-4">
                {Object.entries(TIERS).map(([key, tier]) => (
                  <div key={key} onClick={() => setSelectedTier(key)} className={`relative p-5 rounded-xl border-2 cursor-pointer ${selectedTier === key ? 'border-purple-500 bg-purple-500/10' : 'border-gray-600 bg-gray-700/30'}`}>
                    {tier.popular && <span className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs rounded-full">Most Popular</span>}
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedTier === key ? 'border-purple-500 bg-purple-500' : 'border-gray-500'}`}>{selectedTier === key && <span className="text-white text-xs">✓</span>}</div>
                        <div><h3 className="text-xl font-semibold text-white">{tier.name}</h3><p className="text-gray-400 text-sm">Up to {tier.tables} tables - {tier.staff} staff - {tier.sms} SMS/mo</p></div>
                      </div>
                      <div><span className="text-3xl font-bold text-white">${tier.price}</span><span className="text-gray-400">/mo</span></div>
                    </div>
                    <ul className="mt-4 ml-8 space-y-1">{tier.features.map((f, i) => <li key={i} className="text-sm text-gray-300"><span className="text-green-400">✓</span> {f}</li>)}</ul>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl text-center text-white"><span className="font-semibold">14-day free trial</span> - No credit card required</div>
              <div className="flex items-start gap-3"><input type="checkbox" id="terms" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} className="mt-1 w-4 h-4 rounded" /><label htmlFor="terms" className="text-sm text-gray-300">I agree to the <a href="/legal/terms" className="text-purple-400">Terms</a> and <a href="/legal/privacy" className="text-purple-400">Privacy Policy</a></label></div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto text-4xl">✓</div>
              <h2 className="text-2xl font-semibold text-white">Welcome to Club Commander!</h2>
              <p className="text-gray-400">Your account has been created.</p>
              {registrationResult && <div className="bg-gray-700/50 rounded-xl p-5 text-left"><div className="flex justify-between mb-2"><span className="text-gray-400">Venue ID:</span><span className="text-white font-mono">{registrationResult.venueId}</span></div><div className="flex justify-between"><span className="text-gray-400">Plan:</span><span className="text-white">{selectedTier} (14-day trial)</span></div></div>}
              <button onClick={() => router.push('/commander/dashboard')} className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-semibold text-lg">Go to Dashboard</button>
            </div>
          )}

          {step < 3 && (
            <div className="flex justify-between mt-8 pt-6 border-t border-gray-700">
              <button onClick={prevStep} disabled={step === 1} className={`px-6 py-3 rounded-xl ${step === 1 ? 'bg-gray-700/50 text-gray-500' : 'bg-gray-600 text-white'}`}>Back</button>
              <button onClick={nextStep} className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl">Continue</button>
            </div>
          )}
          {step === 3 && (
            <div className="flex justify-between mt-8 pt-6 border-t border-gray-700">
              <button onClick={prevStep} className="px-6 py-3 rounded-xl bg-gray-600 text-white">Back</button>
              <button onClick={handleSubmit} disabled={loading || !agreedToTerms} className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl disabled:opacity-50">{loading ? 'Creating...' : 'Start Free Trial'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
