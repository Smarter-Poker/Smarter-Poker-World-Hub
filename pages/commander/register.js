import { useState, useEffect } from 'react';
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
    priceId: 'price_starter_monthly', // Stripe price ID
    tables: 5,
    staff: 3,
    sms: 100,
    features: ['Waitlist Management', 'Basic Analytics', 'SMS Notifications (100/mo)', 'Social Hub Page']
  },
  professional: {
    name: 'Professional',
    price: 199,
    priceId: 'price_professional_monthly',
    tables: 15,
    staff: 10,
    sms: 500,
    features: ['Everything in Starter', 'Tournament Management', 'Advanced Analytics', 'SMS Notifications (500/mo)', 'Priority Support'],
    popular: true
  },
  enterprise: {
    name: 'Enterprise',
    price: 399,
    priceId: 'price_enterprise_monthly',
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

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      '::placeholder': { color: '#6b7280' }
    },
    invalid: { color: '#ef4444' }
  }
};

function PaymentForm({ onPaymentSuccess, selectedTier, ownerInfo, clubInfo, loading, setLoading, setError }) {
  const stripe = useStripe();
  const elements = useElements();

  const handlePayment = async () => {
    if (!stripe || !elements) return;
    
    setLoading(true);
    setError('');

    try {
      // Create payment method
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
        billing_details: {
          name: ownerInfo.name,
          email: ownerInfo.email,
          phone: ownerInfo.phone
        }
      });

      if (stripeError) {
        setError(stripeError.message);
        setLoading(false);
        return;
      }

      // Call our API to create subscription
      const response = await fetch('/api/commander/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
          tier: selectedTier,
          clubInfo,
          ownerInfo
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to create subscription');
        setLoading(false);
        return;
      }

      onPaymentSuccess(result);
    } catch (err) {
      setError(err.message || 'Payment failed');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-gray-700 border border-gray-600 rounded-lg">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>
      <button
        onClick={handlePayment}
        disabled={!stripe || loading}
        className="w-full py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Processing...' : `Start 14-Day Free Trial`}
      </button>
      <p className="text-xs text-gray-400 text-center">
        You won't be charged until your trial ends. Cancel anytime.
      </p>
    </div>
  );
}

function RegistrationWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationResult, setRegistrationResult] = useState(null);
  
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clubInfo.email)) {
        setError('Please enter a valid email address');
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerInfo.email)) {
        setError('Please enter a valid email address');
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

  const nextStep = async () => {
    if (!validateStep(step)) return;
    
    // On step 2, create the user account
    if (step === 2) {
      setLoading(true);
      try {
        // Check if email already exists
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', ownerInfo.email.toLowerCase())
          .single();
          
        if (existingUser) {
          setError('An account with this email already exists');
          setLoading(false);
          return;
        }
      } catch (e) {
        // No existing user, continue
      }
      setLoading(false);
    }
    
    setStep(step + 1);
  };

  const prevStep = () => {
    setStep(step - 1);
    setError('');
  };

  const handlePaymentSuccess = (result) => {
    setRegistrationResult(result);
    setStep(5);
    setLoading(false);
  };

  const handleSkipPayment = async () => {
    // For demo/testing - create account without payment
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/commander/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: selectedTier,
          clubInfo,
          ownerInfo,
          skipPayment: true // Trial without card
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to create account');
        setLoading(false);
        return;
      }

      handlePaymentSuccess(result);
    } catch (err) {
      setError(err.message || 'Registration failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Head>
        <title>Register Your Club - Club Commander</title>
        <meta name="description" content="Get started with Club Commander poker room management software" />
      </Head>
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <span className="text-3xl">♠️</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            Get Started with Club Commander
          </h1>
          <p className="text-gray-400">
            Set up your poker room in minutes • 14-day free trial
          </p>
        </div>

        {/* Progress Steps */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex justify-between relative">
            {/* Progress line */}
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-700">
              <div 
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${((step - 1) / 4) * 100}%` }}
              />
            </div>
            
            {['Club Info', 'Owner Account', 'Select Plan', 'Payment', 'Complete'].map((label, idx) => (
              <div key={idx} className="flex flex-col items-center relative z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  step > idx + 1 ? 'bg-green-500 text-white' :
                  step === idx + 1 ? 'bg-purple-500 text-white ring-4 ring-purple-500/30' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {step > idx + 1 ? '✓' : idx + 1}
                </div>
                <span className={`text-xs mt-2 font-medium ${step === idx + 1 ? 'text-white' : 'text-gray-500'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Form Container */}
        <div className="max-w-2xl mx-auto bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-gray-700/50">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm flex items-start gap-3">
              <span className="text-red-500">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Club Information */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-white mb-6">Club Information</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Club/Venue Name *</label>
                <input
                  type="text"
                  name="name"
                  value={clubInfo.name}
                  onChange={handleClubInfoChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  placeholder="e.g., Bellagio Poker Room"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Street Address *</label>
                <input
                  type="text"
                  name="address"
                  value={clubInfo.address}
                  onChange={handleClubInfoChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  placeholder="123 Main Street"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">City *</label>
                  <input
                    type="text"
                    name="city"
                    value={clubInfo.city}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">State *</label>
                  <select
                    name="state"
                    value={clubInfo.state}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  >
                    <option value="">Select</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">ZIP *</label>
                  <input
                    type="text"
                    name="zip"
                    value={clubInfo.zip}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                    placeholder="12345"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Phone *</label>
                  <input
                    type="tel"
                    name="phone"
                    value={clubInfo.phone}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Email *</label>
                  <input
                    type="email"
                    name="email"
                    value={clubInfo.email}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                    placeholder="contact@yourclub.com"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Website</label>
                  <input
                    type="url"
                    name="website"
                    value={clubInfo.website}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                    placeholder="https://"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Number of Poker Tables</label>
                  <input
                    type="number"
                    name="tables"
                    value={clubInfo.tables}
                    onChange={handleClubInfoChange}
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                    min="1"
                    max="100"
                    placeholder="e.g., 10"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Games Offered</label>
                <div className="flex flex-wrap gap-2">
                  {['NLH', 'PLO', 'PLO8', 'Limit HE', 'Stud', 'Mixed', 'Other'].map(game => (
                    <button
                      key={game}
                      type="button"
                      onClick={() => handleGameToggle(game)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
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
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-white mb-6">Create Owner Account</h2>
              <p className="text-gray-400 text-sm -mt-4 mb-6">This will be the primary administrator account for your club.</p>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  name="name"
                  value={ownerInfo.name}
                  onChange={handleOwnerInfoChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  placeholder="John Smith"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email (will be your login) *</label>
                <input
                  type="email"
                  name="email"
                  value={ownerInfo.email}
                  onChange={handleOwnerInfoChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Phone (for 2FA) *</label>
                <input
                  type="tel"
                  name="phone"
                  value={ownerInfo.phone}
                  onChange={handleOwnerInfoChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  placeholder="(555) 123-4567"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Password *</label>
                <input
                  type="password"
                  name="password"
                  value={ownerInfo.password}
                  onChange={handleOwnerInfoChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  placeholder="Minimum 8 characters"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm Password *</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={ownerInfo.confirmPassword}
                  onChange={handleOwnerInfoChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  placeholder="Re-enter your password"
                />
              </div>
            </div>
          )}

          {/* Step 3: Select Plan */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-white mb-6">Choose Your Plan</h2>
              
              <div className="space-y-4">
                {Object.entries(TIERS).map(([key, tier]) => (
                  <div
                    key={key}
                    onClick={() => setSelectedTier(key)}
                    className={`relative p-5 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedTier === key
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                    }`}
                  >
                    {tier.popular && (
                      <span className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold rounded-full">
                        Most Popular
                      </span>
                    )}
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                          selectedTier === key ? 'border-purple-500 bg-purple-500' : 'border-gray-500'
                        }`}>
                          {selectedTier === key && <span className="text-white text-xs">✓</span>}
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
                          <p className="text-gray-400 text-sm mt-1">
                            Up to {tier.tables} tables • {tier.staff} staff • {tier.sms} SMS/mo
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-3xl font-bold text-white">${tier.price}</span>
                        <span className="text-gray-400">/mo</span>
                      </div>
                    </div>
                    <ul className="mt-4 ml-8 space-y-1.5">
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
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Promo Code (optional)</label>
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white uppercase focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                  placeholder="Enter promo code"
                />
              </div>
            </div>
          )}

          {/* Step 4: Payment */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold text-white mb-6">Payment Details</h2>
              
              <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl mb-6">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-white font-semibold">{TIERS[selectedTier].name} Plan</span>
                    <p className="text-sm text-gray-400 mt-0.5">14-day free trial, then ${TIERS[selectedTier].price}/month</p>
                  </div>
                  <span className="text-2xl font-bold text-white">${TIERS[selectedTier].price}<span className="text-sm text-gray-400">/mo</span></span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Card Details</label>
                <Elements stripe={stripePromise}>
                  <PaymentForm 
                    onPaymentSuccess={handlePaymentSuccess}
                    selectedTier={selectedTier}
                    ownerInfo={ownerInfo}
                    clubInfo={clubInfo}
                    loading={loading}
                    setLoading={setLoading}
                    setError={setError}
                  />
                </Elements>
              </div>
              
              <div className="flex items-start gap-3 pt-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500"
                />
                <label htmlFor="terms" className="text-sm text-gray-300">
                  I agree to the <a href="/legal/terms" className="text-purple-400 hover:underline">Terms of Service</a> and <a href="/legal/privacy" className="text-purple-400 hover:underline">Privacy Policy</a>
                </label>
              </div>

              {/* Skip payment for testing */}
              <div className="pt-4 border-t border-gray-700">
                <button
                  onClick={handleSkipPayment}
                  disabled={!agreedToTerms || loading}
                  className="w-full py-2 text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50"
                >
                  Start trial without card →
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 5 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-green-500/30">
                <span className="text-4xl">✓</span>
              </div>
              
              <h2 className="text-2xl font-semibold text-white">Welcome to Club Commander!</h2>
              <p className="text-gray-400">Your account has been created successfully.</p>
              
              {registrationResult && (
                <div className="bg-gray-700/50 rounded-xl p-5 text-left space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Venue ID:</span>
                    <span className="text-white font-mono">{registrationResult.venueId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Subscription:</span>
                    <span className="text-white capitalize">{selectedTier} (14-day trial)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Login Email:</span>
                    <span className="text-white">{ownerInfo.email}</span>
                  </div>
                </div>
              )}
              
              <div className="bg-gray-700/50 rounded-xl p-5 text-left">
                <h3 className="font-semibold text-white mb-3">Next Steps:</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-300">
                  <li>Download the desktop app for the best experience</li>
                  <li>Set up your tables and staff accounts</li>
                  <li>Customize your Social Hub club page</li>
                  <li>Import your player database</li>
                </ol>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                <a
                  href="/downloads/ClubCommander-Setup.exe"
                  className="px-6 py-3 bg-purple-500 text-white rounded-xl hover:bg-purple-600 flex items-center justify-center gap-2 font-medium transition-all"
                >
                  <span>⬇️</span> Download for Windows
                </a>
                <a
                  href="/downloads/ClubCommander.dmg"
                  className="px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-500 flex items-center justify-center gap-2 font-medium transition-all"
                >
                  <span>⬇️</span> Download for Mac
                </a>
              </div>
              
              <button
                onClick={() => router.push('/commander/dashboard')}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 font-semibold text-lg transition-all shadow-lg shadow-green-500/30"
              >
                Go to Dashboard →
              </button>
            </div>
          )}

          {/* Navigation Buttons */}
          {step < 4 && (
            <div className="flex justify-between mt-8 pt-6 border-t border-gray-700">
              <button
                onClick={prevStep}
                disabled={step === 1}
                className={`px-6 py-3 rounded-xl font-medium transition-all ${
                  step === 1
                    ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-600 text-white hover:bg-gray-500'
                }`}
              >
                ← Back
              </button>
              
              <button
                onClick={nextStep}
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 font-medium disabled:opacity-50 transition-all shadow-lg shadow-purple-500/30"
              >
                {loading ? 'Please wait...' : 'Continue →'}
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="flex justify-start mt-8 pt-6 border-t border-gray-700">
              <button
                onClick={prevStep}
                className="px-6 py-3 rounded-xl font-medium bg-gray-600 text-white hover:bg-gray-500 transition-all"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
        
        {/* Trust badges */}
        <div className="max-w-2xl mx-auto mt-8 text-center">
          <div className="flex justify-center gap-6 text-gray-500 text-sm">
            <span className="flex items-center gap-1">🔒 SSL Secured</span>
            <span className="flex items-center gap-1">💳 Powered by Stripe</span>
            <span className="flex items-center gap-1">🚫 Cancel Anytime</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return <RegistrationWizard />;
}
