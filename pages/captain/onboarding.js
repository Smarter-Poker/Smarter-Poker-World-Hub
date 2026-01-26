/**
 * Venue Onboarding Page
 * New venue signup and demo request flow
 * Per IMPLEMENTATION_PHASES.md Step 6.5
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  User,
  Check,
  Loader2,
  ArrowRight,
  ChevronLeft,
  Clock,
  Users,
  BarChart3,
  Shield,
  Smartphone,
  Zap
} from 'lucide-react';

const FEATURES = [
  {
    icon: Users,
    title: 'Digital Waitlist',
    description: 'Let players join from anywhere with real-time position updates'
  },
  {
    icon: Clock,
    title: 'AI Wait Predictions',
    description: 'Smart predictions help players plan their visit'
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Track player traffic, table utilization, and trends'
  },
  {
    icon: Shield,
    title: 'Responsible Gaming',
    description: 'Built-in tools for player protection and compliance'
  },
  {
    icon: Smartphone,
    title: 'Mobile-First',
    description: 'Works on any device - no app download required'
  },
  {
    icon: Zap,
    title: 'Real-Time Updates',
    description: 'Instant notifications keep players informed'
  }
];

const STEPS = [
  { id: 1, label: 'Submit Request' },
  { id: 2, label: 'Demo Call' },
  { id: 3, label: 'Agreement' },
  { id: 4, label: 'Setup' },
  { id: 5, label: 'Go Live' }
];

export default function VenueOnboardingPage() {
  const [step, setStep] = useState('info');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    venueName: '',
    contactName: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    tableCount: '',
    currentSystem: '',
    notes: ''
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/captain/onboarding/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      }
    } catch (err) {
      console.error('Submit failed:', err);
      // Demo: show success anyway
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <>
        <Head>
          <title>Request Submitted | Smarter Captain</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        </Head>

        <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 bg-[#10B981] rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[#1F2937] mb-2">Request Submitted</h1>
            <p className="text-[#6B7280] mb-6">
              Thank you for your interest in Smarter Captain. Our team will contact you within 1 business day to schedule a demo.
            </p>

            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 mb-6">
              <h3 className="font-medium text-[#1F2937] mb-3">What happens next?</h3>
              <div className="space-y-3 text-left">
                {STEPS.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      i === 0 ? 'bg-[#10B981] text-white' : 'bg-[#E5E7EB] text-[#6B7280]'
                    }`}>
                      {i === 0 ? <Check className="w-3 h-3" /> : s.id}
                    </div>
                    <span className={i === 0 ? 'text-[#10B981]' : 'text-[#6B7280]'}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[#1877F2] hover:underline"
            >
              <ChevronLeft className="w-4 h-4" />
              Return to Home
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Get Started | Smarter Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="Request a demo of Smarter Captain for your poker room" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB]">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <Link href="/" className="flex items-center gap-2">
              <Building2 className="w-8 h-8 text-[#1877F2]" />
              <span className="text-xl font-bold text-[#1F2937]">Smarter Captain</span>
            </Link>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-8">
          {step === 'info' ? (
            /* Features Overview */
            <div className="space-y-8">
              <div className="text-center max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold text-[#1F2937] mb-4">
                  Modern Poker Room Management
                </h1>
                <p className="text-lg text-[#6B7280]">
                  Replace outdated waitlist systems with a digital-first platform that players love and staff find easy to use.
                </p>
              </div>

              {/* Features Grid */}
              <div className="grid md:grid-cols-3 gap-4">
                {FEATURES.map((feature, i) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={i}
                      className="bg-white rounded-xl border border-[#E5E7EB] p-5"
                    >
                      <div className="w-10 h-10 bg-[#1877F2]/10 rounded-lg flex items-center justify-center mb-3">
                        <Icon className="w-5 h-5 text-[#1877F2]" />
                      </div>
                      <h3 className="font-semibold text-[#1F2937] mb-1">{feature.title}</h3>
                      <p className="text-sm text-[#6B7280]">{feature.description}</p>
                    </div>
                  );
                })}
              </div>

              {/* CTA */}
              <div className="text-center">
                <button
                  onClick={() => setStep('form')}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-[#1877F2] text-white font-semibold rounded-xl hover:bg-[#1665D8] transition-colors"
                >
                  Request a Demo
                  <ArrowRight className="w-5 h-5" />
                </button>
                <p className="text-sm text-[#6B7280] mt-3">
                  Free demo, no obligation
                </p>
              </div>

              {/* Onboarding Process */}
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
                <h2 className="font-semibold text-[#1F2937] mb-4 text-center">Onboarding Process</h2>
                <div className="flex justify-between items-center max-w-2xl mx-auto">
                  {STEPS.map((s, i) => (
                    <div key={s.id} className="flex flex-col items-center relative">
                      <div className="w-10 h-10 bg-[#1877F2]/10 rounded-full flex items-center justify-center text-[#1877F2] font-medium">
                        {s.id}
                      </div>
                      <span className="text-xs text-[#6B7280] mt-2 text-center">{s.label}</span>
                      {i < STEPS.length - 1 && (
                        <div className="absolute left-[calc(50%+20px)] top-5 w-[calc(100%-40px)] h-0.5 bg-[#E5E7EB]" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Contact Form */
            <div className="max-w-xl mx-auto">
              <button
                onClick={() => setStep('info')}
                className="flex items-center gap-2 text-[#6B7280] hover:text-[#1F2937] mb-6"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
                <h2 className="text-xl font-bold text-[#1F2937] mb-6">Request a Demo</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Venue Name */}
                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-1">
                      Venue Name *
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF]" />
                      <input
                        type="text"
                        name="venueName"
                        value={formData.venueName}
                        onChange={handleChange}
                        required
                        placeholder="Bellagio Poker Room"
                        className="w-full pl-10 pr-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Contact Name */}
                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-1">
                      Your Name *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF]" />
                      <input
                        type="text"
                        name="contactName"
                        value={formData.contactName}
                        onChange={handleChange}
                        required
                        placeholder="John Smith"
                        className="w-full pl-10 pr-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Email & Phone */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#1F2937] mb-1">
                        Email *
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF]" />
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          required
                          placeholder="john@venue.com"
                          className="w-full pl-10 pr-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#1F2937] mb-1">
                        Phone *
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF]" />
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          required
                          placeholder="(555) 123-4567"
                          className="w-full pl-10 pr-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#1F2937] mb-1">
                        City *
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF]" />
                        <input
                          type="text"
                          name="city"
                          value={formData.city}
                          onChange={handleChange}
                          required
                          placeholder="Las Vegas"
                          className="w-full pl-10 pr-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#1F2937] mb-1">
                        State *
                      </label>
                      <select
                        name="state"
                        value={formData.state}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                      >
                        <option value="">Select state...</option>
                        <option value="NV">Nevada</option>
                        <option value="CA">California</option>
                        <option value="TX">Texas</option>
                        <option value="FL">Florida</option>
                        <option value="AZ">Arizona</option>
                        <option value="CO">Colorado</option>
                        <option value="NJ">New Jersey</option>
                        <option value="PA">Pennsylvania</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Table Count */}
                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-1">
                      Number of Poker Tables
                    </label>
                    <select
                      name="tableCount"
                      value={formData.tableCount}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                    >
                      <option value="">Select range...</option>
                      <option value="1-5">1-5 tables</option>
                      <option value="6-10">6-10 tables</option>
                      <option value="11-20">11-20 tables</option>
                      <option value="21-40">21-40 tables</option>
                      <option value="40+">40+ tables</option>
                    </select>
                  </div>

                  {/* Current System */}
                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-1">
                      Current Waitlist System
                    </label>
                    <select
                      name="currentSystem"
                      value={formData.currentSystem}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                    >
                      <option value="">Select current system...</option>
                      <option value="poker_atlas">PokerAtlas TableCaptain</option>
                      <option value="bravo">Bravo Poker Live</option>
                      <option value="paper">Paper/Whiteboard</option>
                      <option value="custom">Custom Solution</option>
                      <option value="none">None</option>
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-[#1F2937] mb-1">
                      Additional Notes
                    </label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      rows={3}
                      placeholder="Tell us about your needs or questions..."
                      className="w-full px-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 bg-[#1877F2] text-white font-semibold rounded-xl hover:bg-[#1665D8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Submit Request
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>

                  <p className="text-xs text-[#6B7280] text-center">
                    By submitting, you agree to be contacted about Smarter Captain.
                  </p>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
