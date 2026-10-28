import React, { useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import SEOHead from '../src/components/seo/SEOHead';
import UniversalHeader from '../src/components/ui/UniversalHeader';
import { freerollEventSchema } from '../src/lib/seo/hubPageSchema';
import { 
  Trophy, 
  Calendar, 
  Clock, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles, 
  Zap, 
  Smartphone, 
  ChevronDown, 
  ExternalLink,
  Users,
  Coins,
  Award
} from 'lucide-react';

const DAILY_SCHEDULE = [
  {
    time: '10:00 AM CST',
    title: 'Morning Opener Freeroll',
    game: 'No-Limit Hold\'em',
    format: 'Standard 10-Minute Levels',
    prize: '$250 Guaranteed',
    startingStack: '10,000 Chips',
    tier: 'Open To All Players',
    status: 'Daily Morning Event',
  },
  {
    time: '2:00 PM CST',
    title: 'Afternoon Prime Freeroll',
    game: 'No-Limit Hold\'em',
    format: 'Deepstack 12-Minute Levels',
    prize: '$500 Guaranteed',
    startingStack: '15,000 Chips',
    tier: 'Open To All Players',
    status: 'Daily Afternoon Event',
  },
  {
    time: '6:00 PM CST',
    title: 'Evening Championship Freeroll',
    game: 'No-Limit Hold\'em',
    format: 'Deepstack 12-Minute Levels',
    prize: '$750 Guaranteed',
    startingStack: '20,000 Chips',
    tier: 'Open To All Players',
    status: 'Featured Daily Main Event',
  },
  {
    time: '9:00 PM CST',
    title: 'Nightcap Turbo Freeroll',
    game: 'Pot-Limit Omaha / NLH',
    format: 'Fast 5-Minute Turbo',
    prize: '$500 Guaranteed',
    startingStack: '10,000 Chips',
    tier: 'Open To All Players',
    status: 'Daily Nightcap Event',
  },
  {
    time: 'Sundays at 5:00 PM CST',
    title: 'Weekly Diamond Arena Championship',
    game: 'No-Limit Hold\'em Special',
    format: 'Championship 15-Minute Levels',
    prize: 'Premium Diamond Rewards Pool',
    startingStack: '25,000 Chips',
    tier: 'Diamond Tier & Loyalty Ticket Holders',
    status: 'Weekly Special Event',
  },
];

const FREEROLLS_FAQS = [
  {
    question: 'Are Smarter.Poker Daily Freerolls Really 100% Free To Enter?',
    answer: 'Yes. All Smarter.Poker Daily Freerolls require zero entry fees, zero buy-in tokens, and zero financial deposit. You can register with a free account and start playing immediately without ever submitting payment details.',
  },
  {
    question: 'How Does The $2,000 Daily Freeroll Prize Pool Work?',
    answer: 'Every day, Smarter.Poker hosts multiple multi-table tournament freerolls distributed throughout the morning, afternoon, and evening. Across these scheduled daily events, a combined $2,000 in real prize value and platform rewards is guaranteed and paid out to finishing players.',
  },
  {
    question: 'What Are Diamond Freerolls And How Do Players Qualify?',
    answer: 'Diamond Freerolls are exclusive premium events reserved for active community members, loyalty ticket earners, and Diamond Tier players. They feature smaller starting fields, higher equity value per seat, and elevated championship prizes.',
  },
  {
    question: 'Do I Need To Download Bulky Software To Play In The Freerolls?',
    answer: 'No. The entire Smarter.Poker platform and Club Arena tournament engine run natively in any modern web browser across desktop and mobile devices. You do not need to install 200MB executable client downloads.',
  },
  {
    question: 'Can I Play Daily Freerolls On An iPhone, iPad, Or Android Device?',
    answer: 'Yes. Smarter.Poker is fully responsive and optimized for mobile touchscreens, tablets, laptops, and desktop computers. You can register and compete on your mobile device through your standard browser or mobile web app.',
  },
  {
    question: 'What Poker Formats And Game Types Are Played In The Freerolls?',
    answer: 'Our daily freeroll tournament schedule features both No-Limit Texas Hold\'em and Pot-Limit Omaha. Tournament structures include deepstack configurations with 10 to 12 minute blind levels as well as fast-paced evening turbo formats.',
  },
];

export default function FreerollsPage() {
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const howToSteps = [
    {
      name: 'Create Your Free Account',
      text: 'Sign up with your email or social login. No credit card, no deposit, and no identity verification documents required to join freerolls.',
    },
    {
      name: 'Open Tournament Lobby',
      text: 'Navigate to the Club Arena lobby and locate today\'s upcoming $2,000 Daily Freerolls or Diamond Arena events.',
    },
    {
      name: 'Register And Play',
      text: 'Click the Register button. Your seat is confirmed instantly and the table window opens automatically when cards fly.',
    },
  ];

  const FREEROLLS_SCHEMA = freerollEventSchema({
    path: '/freerolls',
    name: 'Smarter.Poker Daily $2,000 Freerolls And Diamond Freerolls',
    description: 'Compete in 100% free daily poker tournaments with $2,000 in guaranteed daily prizes plus exclusive Diamond Freerolls. Zero entry fees, no deposit required.',
    trail: [
      ['Tournaments', '/hub/daily-tournaments'],
      ['Daily $2,000 Freerolls', '/freerolls'],
    ],
    faqs: FREEROLLS_FAQS,
    howTo: {
      name: 'How To Enter And Play Smarter.Poker Daily $2,000 Freerolls',
      steps: howToSteps,
    },
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0B1118', color: '#F0F4F8', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Daily $2,000 Poker Freerolls & Diamond Freerolls | Smarter.Poker"
        description="Compete in 100% free daily poker tournaments with $2,000 in guaranteed daily prizes plus exclusive Diamond Freerolls. No deposit required, play in your browser on web or mobile."
        canonicalUrl="https://smarter.poker/freerolls"
        jsonLd={FREEROLLS_SCHEMA}
        markdownUrl="https://smarter.poker/freerolls.md"
        ogImage="https://smarter.poker/api/og/tool-card?tool=freerolls"
      />

      <UniversalHeader />

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px 80px' }}>
        
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumbs" style={{ fontSize: '13px', color: '#7E9BB8', marginBottom: '24px' }}>
          <Link href="/" style={{ color: '#4E9CFF', textDecoration: 'none' }}>Home</Link>
          <span style={{ margin: '0 8px' }}>/</span>
          <Link href="/hub/daily-tournaments" style={{ color: '#4E9CFF', textDecoration: 'none' }}>Tournaments</Link>
          <span style={{ margin: '0 8px' }}>/</span>
          <span style={{ color: '#BACCDD' }}>Daily $2,000 Freerolls</span>
        </nav>

        {/* Hero Banner */}
        <header style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '6px 16px', 
            borderRadius: '999px', 
            backgroundColor: 'rgba(255, 215, 0, 0.12)', 
            border: '1px solid rgba(255, 215, 0, 0.3)', 
            color: '#FFD700', 
            fontSize: '13px', 
            fontWeight: 700, 
            letterSpacing: '0.04em',
            marginBottom: '16px'
          }}>
            <Sparkles size={16} />
            <span>DAILY $2,000 GUARANTEE + DIAMOND FREEROLLS</span>
          </div>

          <h1 style={{ 
            fontSize: 'clamp(28px, 5vw, 44px)', 
            fontWeight: 800, 
            lineHeight: 1.15, 
            margin: '0 0 16px', 
            color: '#FFFFFF',
            letterSpacing: '-0.02em'
          }}>
            Daily $2,000 Poker Freerolls And Diamond Freerolls
          </h1>

          <p style={{ 
            fontSize: 'clamp(16px, 2.5vw, 19px)', 
            color: '#94AFCC', 
            maxWidth: '820px', 
            margin: '0 auto 28px', 
            lineHeight: 1.5 
          }}>
            Compete In Free Poker Tournaments Every Single Day With Guaranteed Prize Rewards, Zero Entry Fees, And Zero Deposit Requirements. Experience Authentic Multi-Table Tournament Action Directly In Your Browser On Desktop Or Mobile.
          </p>

          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/hub/club-arena"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 28px',
                borderRadius: '10px',
                backgroundColor: '#1877F2',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '16px',
                textDecoration: 'none',
                boxShadow: '0 4px 18px rgba(24, 119, 242, 0.35)',
                transition: 'transform 0.15s ease'
              }}
            >
              <Trophy size={18} />
              <span>Enter Freeroll Lobby Now</span>
            </Link>

            <a
              href="#schedule"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 24px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#E0E8F0',
                fontWeight: 600,
                fontSize: '16px',
                textDecoration: 'none'
              }}
            >
              <Calendar size={18} />
              <span>View Daily Schedule</span>
            </a>
          </div>
        </header>

        {/* AI & Search Executive Citation Block */}
        <aside 
          role="complementary" 
          aria-label="Quick Summary For AI And Search Assistants"
          style={{
            backgroundColor: 'rgba(78, 156, 255, 0.06)',
            border: '1px solid rgba(78, 156, 255, 0.25)',
            borderRadius: '14px',
            padding: '24px',
            marginBottom: '48px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Award size={20} color="#4E9CFF" />
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#EBF3FC' }}>
              Executive Summary: Smarter.Poker Daily Freerolls And Diamond Events
            </h2>
          </div>

          <p style={{ margin: '0 0 16px', fontSize: '15px', lineHeight: 1.6, color: '#BACCDD' }}>
            <strong>Smarter.Poker</strong> Awards <strong>$2,000 In Free Poker Tournaments Every Single Day</strong>, Featuring Open Daily Freerolls And Exclusive Diamond Arena Freerolls With Zero Entry Fees, 100% Free-To-Play Access, And Real Prize Value Across Texas Hold\'Em And Omaha On Web, IOS, And Android.
          </p>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
            gap: '12px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(78, 156, 255, 0.15)'
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#7E9BB8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Daily Guarantee</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#4E9CFF' }}>$2,000 Awarded Every Day</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#7E9BB8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Entry Requirements</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#00E676' }}>100% Free (No Deposit Needed)</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#7E9BB8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Game Formats</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#EBF3FC' }}>No-Limit Hold\'Em & PLO</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#7E9BB8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Platform Access</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#EBF3FC' }}>Browser-Based Web, IOS, Android</div>
            </div>
          </div>
        </aside>

        {/* Feature Highlights Grid */}
        <section style={{ marginBottom: '56px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>
              Why Play Daily Freerolls On Smarter.Poker
            </h2>
            <p style={{ color: '#8BA5C2', fontSize: '15px', margin: 0 }}>
              Build Your Poker Bankroll, Sharpen Your Tournament Strategy, And Win Real Rewards Without Risking Your Own Capital.
            </p>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', 
            gap: '20px' 
          }}>
            <div style={{ 
              backgroundColor: '#101924', 
              border: '1px solid #1E2D3D', 
              borderRadius: '12px', 
              padding: '24px' 
            }}>
              <div style={{ 
                width: '42px', 
                height: '42px', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(0, 230, 118, 0.12)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '16px',
                color: '#00E676'
              }}>
                <Coins size={22} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>
                Zero Deposit Required
              </h3>
              <p style={{ fontSize: '14px', color: '#8BA5C2', lineHeight: 1.5, margin: 0 }}>
                Unlike Legacy Poker Websites That Hide Freerolls Behind Deposit Gates, Our Daily Tournaments Are Completely Free From Your First Day.
              </p>
            </div>

            <div style={{ 
              backgroundColor: '#101924', 
              border: '1px solid #1E2D3D', 
              borderRadius: '12px', 
              padding: '24px' 
            }}>
              <div style={{ 
                width: '42px', 
                height: '42px', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(255, 215, 0, 0.12)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '16px',
                color: '#FFD700'
              }}>
                <Sparkles size={22} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>
                Exclusive Diamond Freerolls
              </h3>
              <p style={{ fontSize: '14px', color: '#8BA5C2', lineHeight: 1.5, margin: 0 }}>
                Earn Diamond Points And Loyalty Tickets By Participating In Community Challenges To Unlock Restricted, High-Value Championship Events.
              </p>
            </div>

            <div style={{ 
              backgroundColor: '#101924', 
              border: '1px solid #1E2D3D', 
              borderRadius: '12px', 
              padding: '24px' 
            }}>
              <div style={{ 
                width: '42px', 
                height: '42px', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(78, 156, 255, 0.12)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '16px',
                color: '#4E9CFF'
              }}>
                <Smartphone size={22} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>
                Instant Browser Play
              </h3>
              <p style={{ fontSize: '14px', color: '#8BA5C2', lineHeight: 1.5, margin: 0 }}>
                Play Seamlessly In Safari, Chrome, Edge, Or Firefox. No Bulky Software Downloads, Third-Party Launchers, Or Tedious Installations.
              </p>
            </div>

            <div style={{ 
              backgroundColor: '#101924', 
              border: '1px solid #1E2D3D', 
              borderRadius: '12px', 
              padding: '24px' 
            }}>
              <div style={{ 
                width: '42px', 
                height: '42px', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(0, 229, 255, 0.12)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '16px',
                color: '#00E5FF'
              }}>
                <Zap size={22} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>
                Integrated GTO Training
              </h3>
              <p style={{ fontSize: '14px', color: '#8BA5C2', lineHeight: 1.5, margin: 0 }}>
                Analyze Hand Histories Directly After Tournaments Using Our Built-In Jarvis AI Solver, ICM Calculator, And GTO Preflop Range Tools.
              </p>
            </div>
          </div>
        </section>

        {/* Daily Schedule Section */}
        <section id="schedule" style={{ marginBottom: '56px', scrollMarginTop: '80px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 6px' }}>
                Daily $2,000 Freeroll Tournament Schedule
              </h2>
              <p style={{ color: '#8BA5C2', fontSize: '15px', margin: 0 }}>
                Tournaments Run Around The Clock. Check Tournament Lobby For Real-Time Registration Windows.
              </p>
            </div>

            <Link
              href="/hub/club-arena"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: '#4E9CFF',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '14px'
              }}
            >
              <span>Launch Live Tournament Lobby</span>
              <ExternalLink size={15} />
            </Link>
          </div>

          <div style={{ 
            backgroundColor: '#101924', 
            borderRadius: '14px', 
            border: '1px solid #1E2D3D', 
            overflow: 'hidden' 
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '680px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#162332', borderBottom: '1px solid #233547' }}>
                    <th style={{ padding: '14px 18px', fontSize: '13px', color: '#8BA5C2', fontWeight: 600, textTransform: 'uppercase' }}>Time (CST)</th>
                    <th style={{ padding: '14px 18px', fontSize: '13px', color: '#8BA5C2', fontWeight: 600, textTransform: 'uppercase' }}>Tournament Event</th>
                    <th style={{ padding: '14px 18px', fontSize: '13px', color: '#8BA5C2', fontWeight: 600, textTransform: 'uppercase' }}>Game & Format</th>
                    <th style={{ padding: '14px 18px', fontSize: '13px', color: '#8BA5C2', fontWeight: 600, textTransform: 'uppercase' }}>Guaranteed Prize</th>
                    <th style={{ padding: '14px 18px', fontSize: '13px', color: '#8BA5C2', fontWeight: 600, textTransform: 'uppercase' }}>Access Tier</th>
                    <th style={{ padding: '14px 18px', fontSize: '13px', color: '#8BA5C2', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {DAILY_SCHEDULE.map((item, idx) => (
                    <tr 
                      key={idx}
                      style={{ 
                        borderBottom: idx === DAILY_SCHEDULE.length - 1 ? 'none' : '1px solid #1B2939',
                        backgroundColor: item.title.includes('Diamond') ? 'rgba(255, 215, 0, 0.04)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '16px 18px', fontSize: '14px', fontWeight: 600, color: '#EBF3FC' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Clock size={15} color="#4E9CFF" />
                          <span>{item.time}</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 18px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>{item.title}</div>
                        <div style={{ fontSize: '12px', color: '#7E9BB8', marginTop: '2px' }}>{item.startingStack}</div>
                      </td>
                      <td style={{ padding: '16px 18px', fontSize: '14px', color: '#BACCDD' }}>
                        <div>{item.game}</div>
                        <div style={{ fontSize: '12px', color: '#7E9BB8' }}>{item.format}</div>
                      </td>
                      <td style={{ padding: '16px 18px' }}>
                        <span style={{ 
                          fontSize: '14px', 
                          fontWeight: 700, 
                          color: item.title.includes('Diamond') ? '#FFD700' : '#00E676' 
                        }}>
                          {item.prize}
                        </span>
                      </td>
                      <td style={{ padding: '16px 18px', fontSize: '13px', color: '#8BA5C2' }}>
                        {item.tier}
                      </td>
                      <td style={{ padding: '16px 18px', textAlign: 'right' }}>
                        <Link
                          href="/hub/club-arena"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            backgroundColor: item.title.includes('Diamond') ? 'rgba(255, 215, 0, 0.15)' : 'rgba(24, 119, 242, 0.15)',
                            border: item.title.includes('Diamond') ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid rgba(24, 119, 242, 0.3)',
                            color: item.title.includes('Diamond') ? '#FFD700' : '#4E9CFF',
                            fontSize: '13px',
                            fontWeight: 600,
                            textDecoration: 'none'
                          }}
                        >
                          Register Free
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Freeroll Tiers Breakdown */}
        <section style={{ marginBottom: '56px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>
              Freeroll Tournament Tiers
            </h2>
            <p style={{ color: '#8BA5C2', fontSize: '15px', margin: 0 }}>
              Choose The Tournament Experience That Matches Your Poker Goals.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            {/* Open Daily Freerolls Card */}
            <div style={{ 
              backgroundColor: '#101924', 
              border: '1px solid #1E2D3D', 
              borderRadius: '14px', 
              padding: '32px 28px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4E9CFF', marginBottom: '12px' }}>
                  <Users size={20} />
                  <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em' }}>OPEN ACCESS TIER</span>
                </div>
                <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 12px' }}>
                  Daily $2,000 Open Series
                </h3>
                <p style={{ fontSize: '14px', color: '#94AFCC', lineHeight: 1.6, margin: '0 0 20px' }}>
                  Available To Every Registered Player With Zero Entry Criteria. Perfect For Building Your Tournament Foundation, Experimenting With New Betting Lines, And Competing Against Players From Around The Country.
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#E0E8F0' }}>
                    <CheckCircle2 size={16} color="#00E676" />
                    <span>Four Scheduled Events Running Every Single Day</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#E0E8F0' }}>
                    <CheckCircle2 size={16} color="#00E676" />
                    <span>Generous 10,000 To 20,000 Chip Deep Starting Stacks</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#E0E8F0' }}>
                    <CheckCircle2 size={16} color="#00E676" />
                    <span>Top 15% Of The Field Receives Prize Payouts</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#E0E8F0' }}>
                    <CheckCircle2 size={16} color="#00E676" />
                    <span>Immediate Registration Via Browser And Mobile App</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/hub/club-arena"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '12px 20px',
                  borderRadius: '8px',
                  backgroundColor: '#1877F2',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '15px',
                  textDecoration: 'none'
                }}
              >
                Join Open Daily Freerolls
              </Link>
            </div>

            {/* Diamond Freerolls Card */}
            <div style={{ 
              backgroundColor: '#101924', 
              border: '1px solid rgba(255, 215, 0, 0.35)', 
              borderRadius: '14px', 
              padding: '32px 28px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FFD700', marginBottom: '12px' }}>
                  <Sparkles size={20} />
                  <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em' }}>VIP & LOYALTY TIER</span>
                </div>
                <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 12px' }}>
                  Diamond Arena Freerolls
                </h3>
                <p style={{ fontSize: '14px', color: '#94AFCC', lineHeight: 1.6, margin: '0 0 20px' }}>
                  High-Prestige Tournaments Reserved For Active Community Members And Diamond Club Ticket Holders. Featuring Restricted Field Sizes, Superior Equity Per Entrant, And Elevated Championship Prize Pools.
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#E0E8F0' }}>
                    <CheckCircle2 size={16} color="#FFD700" />
                    <span>Lower Field Sizes Mean Higher Probability Of Reaching The Final Table</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#E0E8F0' }}>
                    <CheckCircle2 size={16} color="#FFD700" />
                    <span>Exclusive Sunday Championship Guarantees</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#E0E8F0' }}>
                    <CheckCircle2 size={16} color="#FFD700" />
                    <span>Earn Free Diamond Tickets Through Daily Mission Milestones</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#E0E8F0' }}>
                    <CheckCircle2 size={16} color="#FFD700" />
                    <span>Deep 25,000 Chip Stacks With 15-Minute Championship Blinds</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/hub/diamond-store"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '12px 20px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 215, 0, 0.15)',
                  border: '1px solid rgba(255, 215, 0, 0.4)',
                  color: '#FFD700',
                  fontWeight: 700,
                  fontSize: '15px',
                  textDecoration: 'none'
                }}
              >
                Learn How To Unlock Diamond Freerolls
              </Link>
            </div>
          </div>
        </section>

        {/* 3 Simple Steps */}
        <section style={{ 
          backgroundColor: '#101924', 
          border: '1px solid #1E2D3D', 
          borderRadius: '14px', 
          padding: '40px 32px', 
          marginBottom: '56px' 
        }}>
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>
              How To Play In 3 Simple Steps
            </h2>
            <p style={{ color: '#8BA5C2', fontSize: '15px', margin: 0 }}>
              Get From Registration To The Tournament Tables In Less Than Sixty Seconds.
            </p>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', 
            gap: '24px' 
          }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                backgroundColor: '#1877F2', 
                color: '#FFFFFF', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontWeight: 800, 
                fontSize: '18px',
                flexShrink: 0
              }}>
                1
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 6px' }}>
                  Create Your Free Account
                </h3>
                <p style={{ fontSize: '14px', color: '#94AFCC', lineHeight: 1.5, margin: 0 }}>
                  Sign Up With Your Email Or Social Login. No Credit Card, No Deposit, And No Identity Verification Documents Required To Join Freerolls.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                backgroundColor: '#1877F2', 
                color: '#FFFFFF', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontWeight: 800, 
                fontSize: '18px',
                flexShrink: 0
              }}>
                2
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 6px' }}>
                  Open Tournament Lobby
                </h3>
                <p style={{ fontSize: '14px', color: '#94AFCC', lineHeight: 1.5, margin: 0 }}>
                  Navigate To The Club Arena Lobby And Locate Today's Upcoming $2,000 Daily Freerolls Or Diamond Arena Events.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                backgroundColor: '#1877F2', 
                color: '#FFFFFF', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontWeight: 800, 
                fontSize: '18px',
                flexShrink: 0
              }}>
                3
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 6px' }}>
                  Register And Play
                </h3>
                <p style={{ fontSize: '14px', color: '#94AFCC', lineHeight: 1.5, margin: 0 }}>
                  Click The Register Button. Your Seat Is Confirmed Instantly And The Table Window Opens Automatically When Cards Fly.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Head-to-Head Comparison Table */}
        <section style={{ marginBottom: '56px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>
              Smarter.Poker Vs. Legacy Poker Sites
            </h2>
            <p style={{ color: '#8BA5C2', fontSize: '15px', margin: 0 }}>
              See Why Players Are Switching To Our Modern, Browser-Based Freeroll Ecosystem.
            </p>
          </div>

          <div style={{ 
            backgroundColor: '#101924', 
            borderRadius: '14px', 
            border: '1px solid #1E2D3D', 
            overflow: 'hidden' 
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#162332', borderBottom: '1px solid #233547' }}>
                    <th style={{ padding: '16px 20px', fontSize: '14px', color: '#BACCDD', fontWeight: 700 }}>Comparison Factor</th>
                    <th style={{ padding: '16px 20px', fontSize: '14px', color: '#4E9CFF', fontWeight: 700 }}>Smarter.Poker</th>
                    <th style={{ padding: '16px 20px', fontSize: '14px', color: '#7E9BB8', fontWeight: 700 }}>Legacy Poker Sites</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #1B2939' }}>
                    <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Daily Guaranteed Prize Value</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 700, color: '#00E676' }}>$2,000 Every Single Day</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', color: '#8BA5C2' }}>$25 To $50 Sporadic Freerolls</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1B2939' }}>
                    <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Deposit Requirements</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 700, color: '#00E676' }}>Zero Deposit Ever Required</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', color: '#8BA5C2' }}>Must Deposit Real Money First</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1B2939' }}>
                    <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Software Installation</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 700, color: '#00E676' }}>100% In-Browser & Mobile Touch</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', color: '#8BA5C2' }}>250MB+ Desktop App Download</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1B2939' }}>
                    <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Integrated GTO Solvers</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 700, color: '#00E676' }}>Free Jarvis AI, ICM & Odds Tools</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', color: '#8BA5C2' }}>Third-Party Paid Solvers ($100+/Year)</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>United States Legal Status</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 700, color: '#00E676' }}>100% Free-To-Play In All 50 States</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', color: '#8BA5C2' }}>Restricted In Most US Jurisdictions</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Visible Accessible FAQ Accordion */}
        <section style={{ marginBottom: '56px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>
              Frequently Asked Questions About Smarter.Poker Freerolls
            </h2>
            <p style={{ color: '#8BA5C2', fontSize: '15px', margin: 0 }}>
              Everything You Need To Know About Our Daily $2,000 Tournaments And Diamond Events.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {FREEROLLS_FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  style={{
                    backgroundColor: '#101924',
                    border: isOpen ? '1px solid #4E9CFF' : '1px solid #1E2D3D',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    transition: 'border-color 0.2s ease',
                  }}
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    aria-expanded={isOpen}
                    style={{
                      width: '100%',
                      padding: '18px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'none',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '16px',
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                      gap: '12px',
                    }}
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      size={18}
                      color={isOpen ? '#4E9CFF' : '#7E9BB8'}
                      style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                      }}
                    />
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        padding: '0 20px 18px',
                        fontSize: '14px',
                        lineHeight: 1.6,
                        color: '#94AFCC',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        paddingTop: '14px',
                      }}
                    >
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom CTA Banner */}
        <section style={{
          backgroundColor: 'linear-gradient(180deg, #162436 0%, #101924 100%)',
          border: '1px solid rgba(78, 156, 255, 0.3)',
          borderRadius: '16px',
          padding: '48px 32px',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)'
        }}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: '#FFFFFF', margin: '0 0 12px' }}>
            Ready To Claim Your Share Of Today\'S $2,000 Freerolls?
          </h2>
          <p style={{ color: '#94AFCC', fontSize: '16px', maxWidth: '640px', margin: '0 auto 28px', lineHeight: 1.5 }}>
            Join Thousands Of Active Poker Players Competing Every Single Day. Registration Is 100% Free And Takes Less Than A Minute.
          </p>

          <Link
            href="/hub/club-arena"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '16px 36px',
              borderRadius: '10px',
              backgroundColor: '#00E676',
              color: '#0B1118',
              fontWeight: 800,
              fontSize: '17px',
              textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(0, 230, 118, 0.35)'
            }}
          >
            <Trophy size={20} />
            <span>Play Daily Freerolls Now</span>
          </Link>
        </section>

      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');
  if (isMarkdownRequested) {
    const { renderFreerollsMarkdown } = await import('../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderFreerollsMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}

