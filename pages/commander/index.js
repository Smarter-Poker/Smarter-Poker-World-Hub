/**
 * Club Commander - Marketing Landing Page
 * Public page for poker rooms to learn about and sign up for Commander
 * Dark industrial sci-fi gaming theme
 */
import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Users, Clock, Trophy, DollarSign, Smartphone, Monitor,
  Check, ChevronRight, Play, Star, ArrowRight, Zap,
  Shield, BarChart3, Bell, Gift, Home, QrCode
} from 'lucide-react';

const FEATURES = [
  {
    icon: Users,
    title: 'Digital Waitlist',
    description: 'Players join from their phone. Staff manage everything from one screen. No more paper lists.'
  },
  {
    icon: Clock,
    title: 'Smart Wait Times',
    description: 'AI-powered predictions tell players exactly when their seat will be ready.'
  },
  {
    icon: Bell,
    title: 'SMS & Push Notifications',
    description: 'Automatic alerts when seats are ready. Players can shop, eat, or wait at the bar.'
  },
  {
    icon: Trophy,
    title: 'Tournament Management',
    description: 'Full tournament system with clock, blind structures, registration, and Hendon Mob export.'
  },
  {
    icon: Gift,
    title: 'Promotions & Comps',
    description: 'High hand jackpots, happy hours, and automated comp tracking based on play time.'
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Track player visits, table hours, revenue trends, and more in real-time.'
  },
  {
    icon: Home,
    title: 'Home Games',
    description: 'Let players organize and discover home games. QR codes and invite codes make joining easy.'
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Row-level security, audit logs, rate limiting, and API key management for integrations.'
  }
];

const PRICING = [
  {
    name: 'Starter',
    price: 'Free',
    description: 'For small rooms getting started',
    features: [
      'Up to 3 tables',
      'Basic waitlist',
      'SMS notifications (pay per use)',
      'Player app access',
      'Email support'
    ],
    cta: 'Get Started Free',
    highlighted: false
  },
  {
    name: 'Professional',
    price: '$299',
    period: '/month',
    description: 'For established poker rooms',
    features: [
      'Unlimited tables',
      'Full tournament system',
      'Unlimited SMS & push',
      'Promotions & comps',
      'Analytics dashboard',
      'Priority support',
      'Hendon Mob integration'
    ],
    cta: 'Start Free Trial',
    highlighted: true
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For casino poker rooms',
    features: [
      'Everything in Professional',
      'Multi-venue management',
      'Custom integrations',
      'API access',
      'Dedicated account manager',
      'On-site training',
      'SLA guarantee'
    ],
    cta: 'Contact Sales',
    highlighted: false
  }
];

const TESTIMONIALS = [
  {
    quote: "We cut our waitlist chaos in half. Players love getting texts when their seat is ready.",
    author: "Mike R.",
    role: "Floor Manager, Texas Card House",
    rating: 5
  },
  {
    quote: "The tournament clock alone is worth it. Export to Hendon Mob with one click saved us hours.",
    author: "Sarah L.",
    role: "Tournament Director, Bay 101",
    rating: 5
  },
  {
    quote: "Finally a modern system that doesn't cost $10k. Our players think we're a big casino now.",
    author: "James T.",
    role: "Owner, Private Club",
    rating: 5
  }
];

function FeatureCard({ icon: Icon, title, description }) {
  return (
    <div className="cmd-panel p-6 hover:border-[#22D3EE]/30 transition-all">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: '#22D3EE20' }}
      >
        <Icon size={24} style={{ color: '#22D3EE' }} />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-[#64748B]">{description}</p>
    </div>
  );
}

function PricingCard({ plan, highlighted, onAction }) {
  return (
    <div
      className={`p-6 rounded-2xl border ${
        highlighted
          ? 'border-[#22D3EE] ring-2 ring-[#22D3EE] ring-opacity-50 bg-[#0F2A3E]'
          : 'border-[#4A5E78] bg-[#0F1D32]'
      }`}
    >
      {highlighted && (
        <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-[#22D3EE]/10 text-[#22D3EE] mb-4">
          Most Popular
        </span>
      )}
      <h3 className="text-xl font-bold text-white">{plan.name}</h3>
      <div className="mt-2 mb-4">
        <span className="text-4xl font-bold text-white">{plan.price}</span>
        {plan.period && <span className="text-[#64748B]">{plan.period}</span>}
      </div>
      <p className="text-[#64748B] mb-6">{plan.description}</p>
      <ul className="space-y-3 mb-6">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check size={18} className="text-[#10B981] flex-shrink-0 mt-0.5" />
            <span className="text-[#94A3B8]">{feature}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={() => onAction?.(plan)}
        className={`w-full py-3 rounded-xl font-medium transition-colors ${
          highlighted
            ? 'cmd-btn cmd-btn-primary'
            : 'cmd-btn cmd-btn-secondary'
        }`}
      >
        {plan.cta}
      </button>
    </div>
  );
}

export default function CommanderLanding() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [showDemo, setShowDemo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleGetStarted() {
    router.push('/commander/onboarding');
  }

  function handleFreeTrial() {
    router.push('/commander/onboarding?plan=pro');
  }

  function handleContactSales() {
    window.location.href = 'mailto:sales@smarter.poker?subject=Commander Enterprise Inquiry';
  }

  function handleWatchDemo() {
    setShowDemo(true);
  }

  function handlePricingAction(plan) {
    if (plan.name === 'Starter') {
      handleGetStarted();
    } else if (plan.name === 'Professional') {
      handleFreeTrial();
    } else if (plan.name === 'Enterprise') {
      handleContactSales();
    }
  }

  async function handleEmailSubmit() {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      // Store lead email
      await fetch('/api/commander/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'landing_page' })
      });
      router.push(`/commander/onboarding?email=${encodeURIComponent(email)}`);
    } catch (err) {
      console.error('Submit error:', err);
      router.push('/commander/onboarding');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Club Commander - Modern Poker Room Management</title>
        <meta name="description" content="Digital waitlist, tournament clock, promotions, and more. Free for small rooms, powerful for casinos." />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className="min-h-screen" style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#0B1426' }}>
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 bg-[#0F1D32]/80 backdrop-blur-md z-50 border-b border-[#4A5E78]">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#22D3EE' }}
              >
                <Zap size={24} className="text-white" />
              </div>
              <span className="text-xl font-bold text-white">Club Commander</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-[#64748B] hover:text-white">Features</a>
              <a href="#pricing" className="text-[#64748B] hover:text-white">Pricing</a>
              <a href="#testimonials" className="text-[#64748B] hover:text-white">Reviews</a>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/commander/login" className="text-[#64748B] hover:text-white">
                Staff Login
              </Link>
              <button
                onClick={handleGetStarted}
                className="cmd-btn cmd-btn-primary"
              >
                Get Started
              </button>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="pt-32 pb-20 px-4 bg-[#0B1426]">
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-6">
              Poker Room Management
              <br />
              <span style={{ color: '#22D3EE' }}>Made Simple</span>
            </h1>
            <p className="text-xl text-[#64748B] max-w-2xl mx-auto mb-8">
              Digital waitlists, tournament clocks, player comps, and analytics.
              Everything you need to run a modern poker room.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <button
                onClick={handleFreeTrial}
                className="cmd-btn cmd-btn-primary px-8 py-4 text-lg flex items-center gap-2"
              >
                Start Free Trial
                <ArrowRight size={20} />
              </button>
              <button
                onClick={handleWatchDemo}
                className="cmd-btn cmd-btn-secondary px-8 py-4 text-lg flex items-center gap-2"
              >
                <Play size={20} />
                Watch Demo
              </button>
            </div>

            {/* Hero Image Placeholder */}
            <div
              className="max-w-5xl mx-auto rounded-2xl shadow-2xl overflow-hidden border border-[#4A5E78]"
              style={{ backgroundColor: '#1F2937', aspectRatio: '16/9' }}
            >
              <div className="h-full flex items-center justify-center text-[#4A5E78]">
                <div className="text-center">
                  <Monitor size={64} className="mx-auto mb-4 text-[#4A5E78]" />
                  <p className="text-lg">Dashboard Preview</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Logos */}
        <section className="py-12 border-y border-[#4A5E78] bg-[#0F1D32]">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-sm text-[#64748B] mb-6">Trusted by poker rooms across Texas, California, and beyond</p>
            <div className="flex items-center justify-center gap-12 opacity-50 grayscale">
              {/* Placeholder for actual logos */}
              <span className="text-xl font-bold text-[#4A5E78]">Texas Card House</span>
              <span className="text-xl font-bold text-[#4A5E78]">Bay 101</span>
              <span className="text-xl font-bold text-[#4A5E78]">The Lodge</span>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-20 px-4 bg-[#0F1D32]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Everything Your Poker Room Needs
              </h2>
              <p className="text-xl text-[#64748B] max-w-2xl mx-auto">
                From waitlist management to tournament operations, we've got you covered.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {FEATURES.map((feature, i) => (
                <FeatureCard key={i} {...feature} />
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-20 px-4 bg-[#0B1426]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-xl text-[#64748B] max-w-2xl mx-auto">
                Start free, upgrade as you grow. No hidden fees.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {PRICING.map((plan, i) => (
                <PricingCard key={i} plan={plan} highlighted={plan.highlighted} onAction={handlePricingAction} />
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" className="py-20 px-4 bg-[#0F1D32]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Loved by Poker Rooms
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {TESTIMONIALS.map((t, i) => (
                <div key={i} className="cmd-panel p-6">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} size={18} fill="#F59E0B" className="text-yellow-500" />
                    ))}
                  </div>
                  <p className="text-[#94A3B8] mb-4">"{t.quote}"</p>
                  <div>
                    <p className="font-semibold text-white">{t.author}</p>
                    <p className="text-sm text-[#64748B]">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cmd-header-full py-20 px-4">
          <div className="max-w-3xl mx-auto text-center text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Modernize Your Poker Room?
            </h2>
            <p className="text-xl opacity-90 mb-8">
              Join hundreds of poker rooms already using Club Commander.
              Start your free trial today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
                className="cmd-input w-full sm:w-80"
              />
              <button
                onClick={handleEmailSubmit}
                disabled={submitting}
                className="w-full sm:w-auto px-8 py-3 rounded-xl bg-white text-[#0B1426] font-semibold hover:bg-gray-100 disabled:opacity-50"
              >
                {submitting ? 'Loading...' : 'Get Started'}
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-4 bg-[#070D1A] text-[#64748B]">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#22D3EE]">
                  <Zap size={18} className="text-white" />
                </div>
                <span className="font-bold text-white">Club Commander</span>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <Link href="/privacy" className="hover:text-white">Privacy</Link>
                <Link href="/terms" className="hover:text-white">Terms</Link>
                <a href="mailto:support@smarter.poker" className="hover:text-white">Support</a>
                <a href="mailto:contact@smarter.poker" className="hover:text-white">Contact</a>
              </div>
              <p className="text-sm">Part of Smarter.Poker</p>
            </div>
          </div>
        </footer>

        {/* Demo Modal */}
        {showDemo && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="cmd-panel cmd-corner-lights w-full max-w-4xl">
              <div className="flex items-center justify-between p-4 border-b border-[#4A5E78]">
                <h3 className="text-lg font-semibold text-white">Club Commander Demo</h3>
                <button
                  onClick={() => setShowDemo(false)}
                  className="p-2 hover:bg-[#132240] rounded-lg text-[#64748B]"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="aspect-video bg-[#070D1A] flex items-center justify-center">
                <div className="text-center text-white">
                  <Play size={64} className="mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Demo video coming soon</p>
                  <p className="text-sm text-[#64748B] mt-2">In the meantime, start your free trial to explore the platform</p>
                  <button
                    onClick={() => {
                      setShowDemo(false);
                      handleFreeTrial();
                    }}
                    className="cmd-btn cmd-btn-primary mt-4"
                  >
                    Start Free Trial
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
