import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

const TIERS = {
  home_game: {
    name: 'Home Game',
    price: 99,
    tables: 5,
    staff: 3,
    sms: 100,
    features: ['Waitlist Management', 'Tournament Management', 'Free Member Cards', 'Basic Analytics', 'Social Hub Page']
  },
  charity: {
    name: 'Charity',
    price: 199,
    tables: 15,
    staff: 10,
    sms: 500,
    features: ['Everything in Home Game', 'Floor View & Map', 'Dealer Rotation', 'Player Kiosk & Displays', 'Staff Accounts & Scheduling', 'Promotions Engine', 'Advanced Analytics & Reports'],
    popular: true
  },
  club: {
    name: 'Club',
    price: 399,
    tables: 'Unlimited',
    staff: 'Unlimited',
    sms: 'Unlimited',
    features: ['Everything in Charity', 'Paid Memberships (Fees)', 'Time-Based Seat Billing', 'Unlimited SMS', 'Priority Support']
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

  // Owner fields — just name & password. Email/phone come from clubInfo.
  const [ownerName, setOwnerName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [existingAccount, setExistingAccount] = useState(false);

  const [selectedTier, setSelectedTier] = useState('charity');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Promo code
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState(null); // null | 'checking' | 'valid' | 'invalid'
  const [promoMessage, setPromoMessage] = useState('');
  const [promoData, setPromoData] = useState(null);

  const validatePromoCode = async (code) => {
    if (!code.trim()) {
      setPromoStatus(null);
      setPromoMessage('');
      setPromoData(null);
      return;
    }
    setPromoStatus('checking');
    try {
      const res = await fetch('/api/promo/validate-promo-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() })
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setPromoStatus('valid');
        setPromoMessage(data.description || 'Promo code accepted!');
        setPromoData(data);
      } else {
        setPromoStatus('invalid');
        setPromoMessage(data.error || 'Invalid promo code');
        setPromoData(null);
      }
    } catch {
      setPromoStatus('invalid');
      setPromoMessage('Could not validate code');
      setPromoData(null);
    }
  };

  const handleClubInfoChange = (e) => {
    setClubInfo(prev => ({ ...prev, [e.target.name]: e.target.value }));
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
        setError('Please fill in all required club fields');
        return false;
      }
      if (!ownerName) {
        setError('Please enter the owner/manager name');
        return false;
      }
      if (!existingAccount) {
        if (!password) {
          setError('Please create a password for your account');
          return false;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          return false;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          return false;
        }
      }
    }
    if (stepNum === 2 && !agreedToTerms) {
      setError('Please agree to terms and conditions');
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) setStep(s => Math.min(s + 1, 3));
  };

  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    if (!validateStep(2)) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/commander/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubInfo,
          ownerInfo: {
            name: ownerName,
            email: clubInfo.email,
            phone: clubInfo.phone,
            password: existingAccount ? null : password,
          },
          selectedTier,
          existingAccount,
          skipPayment: true,
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Registration failed');

      // Redeem promo code if one was validated
      if (promoCode.trim() && promoStatus === 'valid' && data.userId) {
        try {
          await fetch('/api/promo/redeem-promo-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: promoCode.trim(), userId: data.userId })
          });
        } catch (e) {
          console.error('Promo redemption error:', e);
        }
      }

      setRegistrationResult(data);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-[#3A3B3C] border border-[#4E4F50] rounded-lg text-[#E4E6EB] placeholder-[#8A8D91] focus:border-[#1877F2] focus:ring-2 focus:ring-[#1877F2]/20 focus:outline-none";
  const steps = ['Club & Owner Info', 'Select Plan', 'Complete'];

  return (
    <div className="min-h-screen bg-[#18191A]">
      <Head><title>Register Your Club - Club Commander</title></Head>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Logo */}
        <div className="text-center mb-6">
          <img src="/images/club-commander-logo.jpg" alt="Club Commander" className="w-full max-w-md mx-auto rounded-lg" />
          <p className="text-[#B0B3B8] mt-4">Set Up Your Poker Room In Minutes - 14-Day Free Trial</p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-between items-center mb-8 relative">
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-[#3A3B3C]">
            <div className="h-full bg-[#1877F2] transition-all" style={{ width: `${((step - 1) / 2) * 100}%` }} />
          </div>
          {steps.map((label, idx) => (
            <div key={label} className="relative z-10 flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${step > idx + 1 ? 'bg-[#31A24C] text-white' : step === idx + 1 ? 'bg-[#1877F2] text-white ring-4 ring-[#1877F2]/30' : 'bg-[#3A3B3C] text-[#8A8D91]'}`}>{idx + 1}</div>
              <span className={`text-xs mt-2 ${step === idx + 1 ? 'text-[#E4E6EB]' : 'text-[#8A8D91]'}`}>{label}</span>
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-[#242526] rounded-xl p-8 border border-[#3A3B3C]">
          {error && <div className="mb-6 p-4 bg-[#F02849]/10 border border-[#F02849]/30 rounded-lg text-[#F02849]">{error}</div>}

          {/* Step 1: Club Info + Owner */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#E4E6EB] mb-6">Club Information</h2>
              <div><label className="block text-sm text-[#B0B3B8] mb-1.5">Club/Venue Name *</label><input type="text" name="name" value={clubInfo.name} onChange={handleClubInfoChange} className={inputClass} placeholder="Enter Your Venue Name" /></div>
              <div><label className="block text-sm text-[#B0B3B8] mb-1.5">Street Address *</label><input type="text" name="address" value={clubInfo.address} onChange={handleClubInfoChange} className={inputClass} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm text-[#B0B3B8] mb-1.5">City *</label><input type="text" name="city" value={clubInfo.city} onChange={handleClubInfoChange} className={inputClass} /></div>
                <div><label className="block text-sm text-[#B0B3B8] mb-1.5">State *</label><select name="state" value={clubInfo.state} onChange={handleClubInfoChange} className={inputClass}><option value="">Select</option>{US_STATES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="block text-sm text-[#B0B3B8] mb-1.5">ZIP *</label><input type="text" name="zip" value={clubInfo.zip} onChange={handleClubInfoChange} className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-[#B0B3B8] mb-1.5">Phone *</label><input type="tel" name="phone" value={clubInfo.phone} onChange={handleClubInfoChange} className={inputClass} /></div>
                <div><label className="block text-sm text-[#B0B3B8] mb-1.5">Email *</label><input type="email" name="email" value={clubInfo.email} onChange={handleClubInfoChange} className={inputClass} placeholder="Also Used For Your Login" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-[#B0B3B8] mb-1.5">Website</label><input type="url" name="website" value={clubInfo.website} onChange={handleClubInfoChange} className={inputClass} /></div>
                <div><label className="block text-sm text-[#B0B3B8] mb-1.5">Number Of Tables</label><input type="number" name="tables" value={clubInfo.tables} onChange={handleClubInfoChange} className={inputClass} /></div>
              </div>
              <div><label className="block text-sm text-[#B0B3B8] mb-2">Games Offered</label><div className="flex flex-wrap gap-2">{['NLH', 'PLO', 'PLO8', 'Limit HE', 'Stud', 'Mixed', 'Tournaments'].map(game => (<button key={game} type="button" onClick={() => handleGameToggle(game)} className={`px-4 py-2 rounded-full text-sm ${clubInfo.gamesOffered.includes(game) ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>{game}</button>))}</div></div>

              {/* Divider */}
              <div className="border-t border-[#3A3B3C] pt-6 mt-6">
                <h2 className="text-xl font-bold text-[#E4E6EB] mb-4">Owner / Manager</h2>
                <p className="text-sm text-[#8A8D91] mb-4">Your Club Email Above Will Be Used As Your Login. Just Add Your Name And Create A Password.</p>
              </div>

              <div><label className="block text-sm text-[#B0B3B8] mb-1.5">Your Full Name *</label><input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} className={inputClass} placeholder="Owner Or Manager Name" /></div>

              {/* Existing account toggle */}
              <div className="flex items-center gap-3 p-4 bg-[#3A3B3C]/40 rounded-lg">
                <input type="checkbox" id="existingAccount" checked={existingAccount} onChange={e => setExistingAccount(e.target.checked)} className="w-4 h-4 rounded" />
                <label htmlFor="existingAccount" className="text-sm text-[#B0B3B8]">I Already Have A Smarter.Poker Account With This Email</label>
              </div>

              {!existingAccount && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm text-[#B0B3B8] mb-1.5">Create Password *</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="Min 8 Characters" /></div>
                  <div><label className="block text-sm text-[#B0B3B8] mb-1.5">Confirm Password *</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} /></div>
                </div>
              )}

              {/* Promo Code */}
              <div className="border-t border-[#3A3B3C] pt-6 mt-6">
                <label className="block text-sm text-[#B0B3B8] mb-1.5">Promo Code (Optional)</label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={e => { setPromoCode(e.target.value); setPromoStatus(null); setPromoMessage(''); }}
                      className={inputClass}
                      placeholder="Enter Promo Code"
                    />
                    {promoStatus === 'valid' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#31A24C] text-lg">✓</span>}
                    {promoStatus === 'invalid' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#F02849] text-lg">✗</span>}
                    {promoStatus === 'checking' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8D91] text-sm">...</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => validatePromoCode(promoCode)}
                    disabled={!promoCode.trim() || promoStatus === 'checking'}
                    className="px-5 py-3 bg-[#1877F2] hover:bg-[#1664d9] text-white rounded-lg font-semibold text-sm disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
                {promoMessage && (
                  <p className={`text-sm mt-2 ${promoStatus === 'valid' ? 'text-[#31A24C]' : 'text-[#F02849]'}`}>
                    {promoMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Select Plan */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[#E4E6EB] mb-6">Select Your Plan</h2>
              <div className="grid gap-4">
                {Object.entries(TIERS).map(([key, tier]) => (
                  <div key={key} onClick={() => setSelectedTier(key)} className={`relative p-5 rounded-xl border-2 cursor-pointer ${selectedTier === key ? 'border-[#1877F2] bg-[#1877F2]/10' : 'border-[#3A3B3C] bg-[#3A3B3C]/30'}`}>
                    {tier.popular && <span className="absolute -top-3 left-4 px-3 py-1 bg-[#1877F2] text-white text-xs rounded-full">Most Popular</span>}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedTier === key ? 'border-[#1877F2] bg-[#1877F2]' : 'border-[#8A8D91]'}`}>{selectedTier === key && <span className="text-white text-xs">✓</span>}</div>
                        <div><div className="font-semibold text-[#E4E6EB]">{tier.name}</div><div className="text-sm text-[#B0B3B8]">{tier.tables} tables, {tier.staff} staff</div></div>
                      </div>
                      <div className="text-right"><span className="text-2xl font-bold text-[#E4E6EB]">${tier.price}</span><span className="text-[#8A8D91]">/mo</span></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-[#31A24C]/10 border border-[#31A24C]/30 rounded-xl text-center text-[#E4E6EB]"><span className="font-semibold">14-Day Free Trial</span> - No Credit Card Required</div>
              <div className="flex items-start gap-3"><input type="checkbox" id="terms" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} className="mt-1 w-4 h-4 rounded" /><label htmlFor="terms" className="text-sm text-[#B0B3B8]">I Agree To The <a href="/legal/terms" className="text-[#1877F2]">Terms</a> And <a href="/legal/privacy" className="text-[#1877F2]">Privacy Policy</a></label></div>
            </div>
          )}

          {/* Step 3: Complete */}
          {step === 3 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-[#31A24C] rounded-full flex items-center justify-center mx-auto text-4xl text-white">✓</div>
              <h2 className="text-2xl font-bold text-[#E4E6EB]">Welcome To Club Commander!</h2>
              <p className="text-[#B0B3B8]">Your Account Has Been Created. Your 14-day Trial Starts Now.</p>
              {registrationResult && <div className="bg-[#3A3B3C] rounded-xl p-5 text-left"><div className="flex justify-between mb-2"><span className="text-[#8A8D91]">Venue ID:</span><span className="text-[#E4E6EB] font-mono">{registrationResult.venueId}</span></div><div className="flex justify-between"><span className="text-[#8A8D91]">Plan:</span><span className="text-[#E4E6EB]">{selectedTier} (14-day trial)</span></div></div>}
              <button onClick={() => router.push('/commander/dashboard')} className="w-full py-4 bg-[#1877F2] hover:bg-[#1664d9] text-white rounded-xl font-semibold text-lg">Go To Dashboard</button>
            </div>
          )}

          {/* Navigation Buttons */}
          {step === 1 && (
            <div className="flex justify-end mt-8">
              <button onClick={nextStep} className="px-8 py-3 bg-[#1877F2] hover:bg-[#1664d9] text-white rounded-lg font-semibold">Continue To Plan Selection</button>
            </div>
          )}
          {step === 2 && (
            <div className="flex justify-between mt-8">
              <button onClick={prevStep} className="px-6 py-3 rounded-lg bg-[#3A3B3C] text-[#E4E6EB] hover:bg-[#4E4F50]">Back</button>
              <button onClick={handleSubmit} disabled={loading || !agreedToTerms} className="px-8 py-3 bg-[#1877F2] hover:bg-[#1664d9] text-white rounded-lg font-semibold disabled:opacity-50">{loading ? 'Creating...' : 'Start Free Trial'}</button>
            </div>
          )}
        </div>

        {/* Already have account link */}
        <div className="text-center mt-6">
          <Link href="/commander/login" className="text-[#B0B3B8] hover:text-[#E4E6EB]">
            Already Have A Club Commander Account? <span className="text-[#1877F2]">Sign In</span>
          </Link>
        </div>

        <p className="text-center text-[#65676B] text-xs mt-6">Powered By SMARTER.POKER</p>
      </div>
    </div>
  );
}
