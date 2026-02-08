import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '@/lib/supabaseClient';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

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
    features: ['Everything in Starter', 'Tournament Management', 'Advanced Analytics', 'SMS Notifications (500/mo)', 'Priority Support']
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

function RegistrationWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form state
  const [clubInfo, setClubInfo] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    email: '',
    website: '',
    tables: '',
    gamesOffered: []
  });
  
  const [ownerInfo, setOwnerInfo] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: ''
  });
  
  const [selectedTier, setSelectedTier] = useState('professional');
  const [promoCode, setPromoCode] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleClubInfoChange = (e) => {
    const { name, value } = e.target;
    setClubInfo(prev => ({ ...prev, [name]: value }));
  };

  const handleOwnerInfoChange = (e) => {
    const { name, value } = e.target;
    setOwnerInfo(prev => ({ ...prev, [name]: value }));
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
      if (!/^\d{5}(-\d{4})?$/.test(clubInfo.zip)) {
        setError('Please enter a valid ZIP code');
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
    
    if (stepNum === 4) {
      if (!agreedToTerms) {
        setError('You must agree to the terms and conditions');
        return false;
      }
    }
    
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    setStep(step - 1);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Head>
        <title>Register Your Club - Club Commander</title>
      </Head>
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Get Started with Club Commander
          </h1>
          <p className="text-gray-400">
            Set up your poker room in minutes
          </p>
        </div>

        {/* Progress Steps */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex justify-between">
            {['Club Info', 'Owner Account', 'Select Plan', 'Payment', 'Complete'].map((label, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step > idx + 1 ? 'bg-green-500 text-white' :
                  step === idx + 1 ? 'bg-purple-500 text-white' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {step > idx + 1 ? '✓' : idx + 1}
                </div>
                <span className={`text-xs mt-1 ${step === idx + 1 ? 'text-white' : 'text-gray-500'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Form Container */}
        <div className="max-w-2xl mx-auto bg-gray-800/50 backdrop-blur rounded-xl p-8 shadow-2xl">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Club Information */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-white mb-4">Club Information</h2>
              
              <div>
                <label className="block text-sm text-gray-300 mb-1">Club/Venue Name *</label>
                <input
                  type="text"
                  name="name"
                  value={clubInfo.name}
                  onChange={handleClubInfoChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                  placeholder="e.g., Bellagio Poker Room"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-1">Street Address *</label>
                <input
                  type="text"
                  name="address"
                  value={clubInfo.address}
                  onChange={handleClubInfoChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">City *</label>
                  <input
                    type="text"
                    name="city"
                    value={clubInfo.city}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">State *</label>
                  <select
                    name="state"
                    value={clubInfo.state}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">Select</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">ZIP *</label>
                  <input
                    type="text"
                    name="zip"
                    value={clubInfo.zip}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Phone *</label>
                  <input
                    type="tel"
                    name="phone"
                    value={clubInfo.phone}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Email *</label>
                  <input
                    type="email"
                    name="email"
                    value={clubInfo.email}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Website</label>
                  <input
                    type="url"
                    name="website"
                    value={clubInfo.website}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                    placeholder="https://"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Number of Poker Tables</label>
                  <input
                    type="number"
                    name="tables"
                    value={clubInfo.tables}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                    min="1"
                    max="100"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-2">Games Offered</label>
                <div className="flex flex-wrap gap-2">
                  {['NLH', 'PLO', 'PLO8', 'Limit HE', 'Stud', 'Mixed', 'Other'].map(game => (
                    <button
                      key={game}
                      type="button"
                      onClick={() => handleGameToggle(game)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        clubInfo.gamesOffered.includes(game)
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {game}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Owner Account */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-white mb-4">Create Owner Account</h2>
              
              <div>
                <label className="block text-sm text-gray-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  name="name"
                  value={ownerInfo.name}
                  onChange={handleOwnerInfoChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-1">Email (will be your login) *</label>
                <input
                  type="email"
                  name="email"
                  value={ownerInfo.email}
                  onChange={handleOwnerInfoChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-1">Phone (for 2FA) *</label>
                <input
                  type="tel"
                  name="phone"
                  value={ownerInfo.phone}
                  onChange={handleOwnerInfoChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-1">Password *</label>
                <input
                  type="password"
                  name="password"
                  value={ownerInfo.password}
                  onChange={handleOwnerInfoChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                  placeholder="Minimum 8 characters"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-1">Confirm Password *</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={ownerInfo.confirmPassword}
                  onChange={handleOwnerInfoChange}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Step 3: Select Plan */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-white mb-4">Choose Your Plan</h2>
              
              <div className="grid gap-4">
                {Object.entries(TIERS).map(([key, tier]) => (
                  <div
                    key={key}
                    onClick={() => setSelectedTier(key)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedTier === key
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
                        <p className="text-gray-400 text-sm">
                          Up to {tier.tables} tables • {tier.staff} staff • {tier.sms} SMS/mo
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-3xl font-bold text-white">${tier.price}</span>
                        <span className="text-gray-400">/mo</span>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1">
                      {tier.features.map((feature, idx) => (
                        <li key={idx} className="text-sm text-gray-300 flex items-center gap-2">
                          <span className="text-green-400">✓</span> {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              
              <div className="pt-4">
                <label className="block text-sm text-gray-300 mb-1">Promo Code (optional)</label>
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                  placeholder="Enter promo code"
                />
              </div>
            </div>
          )}

          {/* Step 4: Payment */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-white mb-4">Payment Details</h2>
              
              <div className="p-4 bg-gray-700/50 rounded-lg mb-4">
                <div className="flex justify-between text-white">
                  <span>{TIERS[selectedTier].name} Plan</span>
                  <span>${TIERS[selectedTier].price}/month</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">14-day free trial included</p>
              </div>
              
              <div>
                <label className="block text-sm text-gray-300 mb-2">Card Details</label>
                <div className="p-4 bg-gray-700 border border-gray-600 rounded-lg">
                  {/* Stripe Card Element would go here */}
                  <div className="text-gray-400 text-center py-4">
                    [Stripe Card Input]
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-2 pt-4">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1"
                />
                <label htmlFor="terms" className="text-sm text-gray-300">
                  I agree to the <a href="/terms" className="text-purple-400 hover:underline">Terms of Service</a> and <a href="/privacy" className="text-purple-400 hover:underline">Privacy Policy</a>
                </label>
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 5 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                <span className="text-4xl">✓</span>
              </div>
              
              <h2 className="text-2xl font-semibold text-white">Welcome to Club Commander!</h2>
              <p className="text-gray-400">Your account has been created successfully.</p>
              
              <div className="bg-gray-700/50 rounded-lg p-4 text-left">
                <h3 className="font-semibold text-white mb-2">Next Steps:</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-300">
                  <li>Download the desktop app for the best experience</li>
                  <li>Set up your tables and staff accounts</li>
                  <li>Customize your Social Hub club page</li>
                </ol>
              </div>
              
              <div className="flex gap-4 justify-center pt-4">
                <a
                  href="/downloads/club-commander-setup.exe"
                  className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2"
                >
                  <span>⬇</span> Download for Windows
                </a>
                <a
                  href="/downloads/club-commander.dmg"
                  className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 flex items-center gap-2"
                >
                  <span>⬇</span> Download for Mac
                </a>
              </div>
              
              <button
                onClick={() => router.push('/commander/dashboard')}
                className="px-8 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                Go to Dashboard →
              </button>
            </div>
          )}

          {/* Navigation Buttons */}
          {step < 5 && (
            <div className="flex justify-between mt-8">
              <button
                onClick={prevStep}
                disabled={step === 1}
                className={`px-6 py-2 rounded-lg ${
                  step === 1
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-600 text-white hover:bg-gray-500'
                }`}
              >
                ← Back
              </button>
              
              <button
                onClick={nextStep}
                disabled={loading}
                className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
              >
                {loading ? 'Processing...' : step === 4 ? 'Start Free Trial' : 'Continue →'}
              </button>
            </div>
          )}
        </div>
        
        {/* Trust badges */}
        <div className="max-w-2xl mx-auto mt-8 text-center">
          <p className="text-gray-500 text-sm">
            🔒 Secure payment processing by Stripe • 14-day free trial • Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Elements stripe={stripePromise}>
      <RegistrationWizard />
    </Elements>
  );
}
