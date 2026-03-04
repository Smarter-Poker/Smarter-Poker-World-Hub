import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';

// Icons & Layout Library
import {
    SlideContainer,
    TitleSlide,
    SplitSlide,
    TableSlide,
    GridSlide,
    MetalPhoneFrame,
    TabletFrame,
    HolographicHUD,
    DesktopMonitor
} from '../src/components/pitch/SlideLayouts';

// =========================================================================
// MOCK UI COMPONENTS (Rendered inside the 3D Device Frames)
// =========================================================================


const MockHubCarousel = () => <img src="/images/pitch/hub_carousel.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Hub" />;
const MockClubCommander = () => <img src="/images/pitch/club_commander.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Club Commander" />;
const MockLiveArena = () => <img src="/images/pitch/live_arena.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Live Arena" />;
const MockGTO = () => <img src="/images/pitch/gto_training.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="GTO Training" />;
const MockDiamondStore = () => <img src="/images/pitch/diamond_store.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Diamond Store" />;
const MockPioSolver = () => <img src="/images/pitch/pio_solver.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="PioSolver" />;
const MockSocialFeed = () => <img src="/images/pitch/social_feed.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Social Feed" />;
const MockArcade = () => <img src="/images/pitch/arcade_hologram.png" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="Arcade" />;

// =========================================================================
// 36-SLIDE DATA CONFIGURATION
// =========================================================================

const SLIDES = [
    { bgImage: '/images/pitch/bg_cards.png', type: 'title',
        title: "SMARTER.POKER",
        subtitle: "The World's First Poker Super-Platform",
        stats: [
            { value: '916', label: 'Pages Built' },
            { value: '60+', label: 'Live Tables' },
            { value: '$1.2M', label: 'Seed Raise' }
        ]
    },
    { bgImage: '/images/pitch/bg_data.png', type: 'table',
        title: "The Problem",
        subtitle: "Poker players need 7+ separate apps just to exist in the ecosystem.",
        columns: ['What Players Need', 'Current Solution', 'The Problem'],
        rows: [
            ['Find live games', 'PokerAtlas / Bravo', 'Outdated, limited features, closed ecosystem'],
            ['Train GTO strategy', 'GTO Wizard ($100/mo)', 'Expensive, standalone, no gameplay integration'],
            ['Track bankroll', 'Spreadsheets', 'Manual entry, lacks AI-driven insights'],
            ['Social Networking', 'Facebook Groups', 'Not poker-specific, clunky'],
            ['Messaging', 'WhatsApp / Telegram', 'Generic, difficult to share poker data'],
            ['Club management', 'Custom Software', 'Fragmented, expensive, no analytics'],
            ['News & content', 'Twitter / YouTube', 'Scattered across platforms']
        ]
    },
    { bgImage: '/images/pitch/bg_network.png', type: 'split',
        title: "The Solution",
        subtitle: "One Unified Super-Platform.",
        visualType: 'hologram',
        visual: <MockHubCarousel />,
        content: (
            <div>
                <p>We replaced the entire fragmented stack with a 1:1 clone of the best tools on earth—integrated into one ecosystem.</p>
                <ul style={{ lineHeight: 2 }}>
                    <li><strong style={{ color: '#00B4D8' }}>Facebook</strong> → Social Media Feed & Profiles</li>
                    <li><strong style={{ color: '#00C87A' }}>WhatsApp</strong> → 1-on-1 & Group Messenger</li>
                    <li><strong style={{ color: '#8040C0' }}>GTO Wizard</strong> → 100+ PioSolver Training Games</li>
                    <li><strong style={{ color: '#E02840' }}>Table Captain</strong> → Club Commander Back-End</li>
                    <li><strong style={{ color: '#E07820' }}>PokerAtlas</strong> → 483+ Indexed Venues & GPS Maps</li>
                </ul>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_table.png', type: 'grid',
        title: "Platform Architecture",
        subtitle: "The Hub-and-Spoke Virality Model",
        items: [
            { title: 'Club Commander', desc: 'Acquires venues, forcing their players natively into our ecosystem.' },
            { title: 'Training & Trivia', desc: 'Drives massive Daily Active Usage (DAU) and habit loop.' },
            { title: 'Club Arena', desc: 'Primary monetization engine generating recurring rake revenue.' },
            { title: 'Social & Messenger', desc: 'Creates high switching costs and total network lock-in.' },
            { title: 'Diamond Economy', desc: 'Universal currency eliminating friction across all apps.' },
            { title: 'Poker Near Me', desc: 'Top-of-funnel acquisition mapping the entire world.' }
        ]
    },
    { bgImage: '/images/pitch/bg_diamond.png', type: 'split',
        title: "The Poker Hub",
        subtitle: "The Command Center. 14+ integrated features.",
        visualType: 'phone',
        visual: <MockHubCarousel />,
        content: (
            <div>
                <p>The hub is the user's command center — a 3D card carousel showing 14+ integrated features in one interface.</p>
                <p>Everything is natively built in Next.js and Postgres. Seamless traversal.</p>
                <ul style={{ lineHeight: 1.8 }}>
                    <li>Poker Near Me</li>
                    <li>Marketplace</li>
                    <li>Club Arena</li>
                    <li>Toke Tracker</li>
                    <li>Video Library</li>
                    <li>Training Games</li>
                </ul>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_cards.png', type: 'split',
        title: "Poker Near Me",
        subtitle: "483+ Venues. 12+ Tours. $2B Home Game TAM.",
        visualType: 'tablet',
        visual: (
            <div style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 20 }}>
                    {['Las Vegas', 'Los Angeles', 'Miami', 'Atlantic City', 'Austin'].map(c => <div key={c} style={{ background: '#1a2332', padding: '5px 15px', borderRadius: 20, whiteSpace: 'nowrap' }}>{c}</div>)}
                </div>
                <div style={{ height: 200, background: '#1a2332', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00B4D8' }}>[Interactive GPS Map Widget]</div>
            </div>
        ),
        content: (
            <div>
                <h3 style={{ color: '#00B4D8' }}>The Data</h3>
                <p>483+ poker venues indexed. 12+ major tour integrations (WSOP, WPT). 100+ daily tournament series.</p>
                <h3 style={{ color: '#00C87A', marginTop: 30 }}>The Home Game Revolution</h3>
                <p>40M Americans play home games. ZERO platforms exist to connect them. We are introducing players to game runners across the country, capturing a $2B completely untapped market.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_data.png', type: 'table',
        title: "Poker Near Me vs PokerAtlas",
        subtitle: "Dominating the Current Standard",
        columns: ['Feature', 'Smarter.Poker', 'PokerAtlas'],
        rows: [
            ['Venue Search & Tourneys', 'YES', 'YES'],
            ['GPS Map & Live Tables', 'YES', 'YES'],
            ['Player Reviews', 'YES', 'NO'],
            ['Home Game Discovery', 'YES', 'NO'],
            ['Training Integration', 'YES', 'NO'],
            ['Social Integration', 'YES', 'NO'],
            ['Club Management', 'YES', 'NO'],
            ['Diamond Economy', 'YES', 'NO']
        ]
    },
    { bgImage: '/images/pitch/bg_network.png', type: 'split',
        title: "Club Commander",
        subtitle: "The B2B SaaS Engine Powering Poker Rooms.",
        visualType: 'monitor',
        visual: <MockClubCommander />,
        content: (
            <div>
                <h3 style={{ color: '#E02840' }}>$49-$299/mo SaaS</h3>
                <p>Features: Digital waitlists, real-time tournament management, automated staff scheduling (text/email), and player loyalty tracking.</p>
                <p><strong>The Trojan Horse:</strong> Every player who uses Club Commander at a local venue automatically becomes a Smarter.Poker app user.</p>
                <p>Business Impact: Transaction fees on payouts, white-label options, API integrations, and cross-club leaderboards.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_table.png', type: 'split',
        title: "Club Arena — Live Online Poker",
        subtitle: "Running 24/7. 58 Cash Tables Live Now.",
        visualType: 'monitor',
        visual: <MockLiveArena />,
        content: (
            <div>
                <h3 style={{ color: '#00C87A' }}>The Live Data</h3>
                <p>58 cash tables running LIVE. 905+ hands dealt daily.</p>
                <p>Action: Micro-stakes (0.05/0.10) to Nosebleeds (1.00/2.00).</p>
                <p>Formats: NLH, PLO4, PLO5, PLO6, Bomb Pots, OMAHA, HORSE.</p>
                <p>Revenue: 2.5% - 5% rake on every hand dealt. Pure, recurring cash flow.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_diamond.png', type: 'split',
        title: "Diamond Arena",
        subtitle: "Gamble Virtual Currency. Win Real World Prizes.",
        visualType: 'hologram',
        visual: <MockArcade />,
        content: (
            <div>
                <p>Buy in with Diamonds (virtual currency). Win real-world prizes: Tournament buy-ins, Gift cards, Merchandise.</p>
                <h3 style={{ color: '#E07820', marginTop: 30 }}>Why this works:</h3>
                <p>Diamond buy-ins create constant monetization. No casino license needed (diamonds are virtual currency). Integrates directly with training progression and social bragging rights.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_cards.png', type: 'split',
        title: "AI Training — 100+ GTO Games",
        subtitle: "$50-100/mo equivalent subscription value.",
        visualType: 'phone',
        visual: <MockGTO />,
        content: (
            <div>
                <p>Powered by PioSolver — real solver output, not approximations.</p>
                <p>100+ training games across 6 categories: Daily Challenge, MTT Mastery, Cash Grind, Spins/SNGs, Psychology, Advanced GTO.</p>
                <p>Level 0-10 progression system requiring an 85% score threshold to advance. Included FREE with our VIP & Diamond economy.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_data.png', type: 'split',
        title: "PioSolver Data Farm",
        subtitle: "Our Unfair Advantage & The Defensive Moat.",
        visualType: 'monitor',
        visual: <MockPioSolver />,
        content: (
            <div>
                <h3 style={{ color: '#E07820' }}>Insurmountable Lead</h3>
                <p>Millions of pre-solved poker hands using the PioSolver engine.</p>
                <p>$1M+ investment in compute time. It would take a competitor 2+ years of constant server rendering to replicate our database.</p>
                <p>Training → diamonds → engagement → more training → deeper moat.</p>
                <p style={{ fontStyle: 'italic', marginTop: 20 }}>No competitor matches this depth of pre-solved data. No competitor can replicate this in years. That's the moat.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_network.png', type: 'grid',
        title: "Jarvis AI & Trivia Engine",
        subtitle: "Daily engagement systems that bring users back every 24 hours.",
        items: [
            { title: 'Jarvis Personal Assistant', desc: 'Analyzes every hand you play, finds leaks automatically, and suggests specific training games to fix weaknesses.' },
            { title: 'Virtual Sandbox', desc: 'Explore "what if" scenarios based on your bankroll and skill level.' },
            { title: '9+ Sci-Fi Game Modes', desc: 'MTT Scenarios, Cash Game, ICM, Survival Mode, Endless Mode.' },
            { title: 'Quick Stakes', desc: '10 questions in 60 seconds. Entry: 10 diamonds. Answer fast, win big.' },
            { title: 'Daily Content', desc: '100s of fresh questions DAILY. Content changes EVERY DAY at midnight PST.' },
            { title: 'Head-to-Head', desc: '1v1 real-time battles against another player.' }
        ]
    },
    { bgImage: '/images/pitch/bg_table.png', type: 'grid',
        title: "Social Media & Messenger",
        subtitle: "1:1 Clones of Facebook and WhatsApp. Don't leave the app to talk about the app.",
        items: [
            { title: 'News Feed', desc: 'Posts, photos, Go Live streaming, Stories, and Reels.' },
            { title: 'User Profiles', desc: 'Fully integrated with your poker stats, graphs, and badges.' },
            { title: 'WhatsApp Clone', desc: '1-on-1 messaging, group chats, voice calls, video calls.' },
            { title: 'Media Sharing', desc: 'Share images, files, and deep-linked hand histories natively.' },
            { title: 'Notifications', desc: 'Instant push alerts for game action and messages.' },
            { title: 'Groups', desc: 'Dedicated spaces for study groups and club members.' }
        ]
    },
    { bgImage: '/images/pitch/bg_diamond.png', type: 'grid',
        title: "Essential Tools",
        subtitle: "Professional Utilities Locked Behind Our Ecosystem",
        items: [
            { title: 'Bankroll Manager', desc: 'Session tracking, P&L charts, AI leak detection. Diamond-gated premium insights.' },
            { title: 'Odds Calculator', desc: 'Supports NLH, PLO4, PLO5, and PLO6. NOBODY ELSE HAS PLO5/6 SUPPORT.' },
            { title: 'Toke Tracker', desc: 'Worlds ONLY dealer tracking platform. Tips, hourly rates, tax reports. 100k+ dealers. ZERO competition.' }
        ]
    },
    { bgImage: '/images/pitch/bg_cards.png', type: 'split',
        title: "News Aggregator & Video Library",
        subtitle: "The Epicenter of Poker Content",
        visualType: 'tablet',
        visual: <MockSocialFeed />,
        content: (
            <div>
                <p><strong>News:</strong> Featured article cards with thumbnails, "JUST IN" breaking headlines from WSOP, WPT, MSPT, RGPS.</p>
                <p><strong>Video Library:</strong> Strategy tool previews, latest videos, tournament footage, streamer partnerships.</p>
                <p>Integrated with our "Go Live" social media feature to dominate content consumption.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_data.png', type: 'table',
        title: "The Diamond Economy",
        subtitle: "1 Diamond = $0.01. The Universal Currency.",
        columns: ['Feature', 'Diamond Cost'],
        rows: [
            ['Poker Near Me Access', '25 per 24 hours'],
            ['Training Games', '10 per game'],
            ['Diamond Arena Buy-in', '50-500 per tournament'],
            ['Trivia Quick Stakes', '5 for 5q / 10 for 10q'],
            ['Cosmetics', '100-500 per item']
        ]
    },
    { bgImage: '/images/pitch/bg_network.png', type: 'split',
        title: "The Diamond Store",
        subtitle: "Stripe integration live. 8 packages. Frictionless purchasing.",
        visualType: 'tablet',
        visual: <MockDiamondStore />,
        content: (
            <div>
                <p>The Addiction Loop: Play → Run Out of Diamonds → Buy More Diamonds → Play More.</p>
                <h3 style={{ color: '#8040C0', marginTop: 30 }}>VIP Membership ($19.99/mo)</h3>
                <p>Unlimited diamonds, Show Stack, Rabbit Hunting, Offline Mode, Extended Time Banks, Custom Themes, Premium Badges.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_table.png', type: 'split',
        title: "Memory Games & Diamond Arcade",
        subtitle: "Expanding the funnel to casual demographic.",
        visualType: 'hologram',
        visual: <MockArcade />,
        content: (
            <div>
                <p><strong>Memory Games:</strong> Card matching with poker themes, progressive difficulty, daily challenges.</p>
                <p><strong>Diamond Arcade:</strong> Spend diamonds to play arcade-style/slot mechanics to win multipliers.</p>
                <p>Purpose: Creates constant diamond circulation and a fun, casual entry point for new users.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_diamond.png', type: 'split',
        title: "Phase 2: Micro Tasks",
        subtitle: "Infinite Margin Revenue Generation.",
        visualType: 'monitor',
        visual: <div style={{ padding: 40 }}><h2 style={{ color: '#00C87A' }}>Infinite Margin Engine</h2><p>Play → Run out of diamonds → Complete micro tasks → Earn diamonds → Play more.</p></div>,
        content: (
            <div>
                <p>Users earn FREE diamonds by completing micro tasks (aggregated from MTurk, Sproutgigs, etc).</p>
                <p>We keep 70-80% cash margin. Players are paid in Diamonds (which cost us nothing to mint).</p>
                <p>Projected Year 3 revenue: $2M+ ARR at 70-80% margins.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_cards.png', type: 'table',
        title: "Market Opportunity",
        subtitle: "TAM / SAM / SOM ($Billions)",
        columns: ['Metric', 'Value', 'Description'],
        rows: [
            ['TAM', '$260B', 'Global online gambling market'],
            ['SAM', '$20B', 'Online poker + tools + training'],
            ['SOM', '$200M', 'Year 5 target (clubs + training + home games)']
        ]
    },
    { bgImage: '/images/pitch/bg_data.png', type: 'table',
        title: "Revenue Model",
        subtitle: "7 Diversified Streams. 80%+ Gross Margins.",
        columns: ['Revenue Stream', 'Year 3 Projection'],
        rows: [
            ['Club Arena Rake', '$3.6M'],
            ['Diamond Sales', '$2.4M'],
            ['Micro Tasks', '$2.0M'],
            ['VIP Subscriptions', '$1.8M'],
            ['Club Commander SaaS', '$1.2M'],
            ['Advertising', '$0.8M'],
            ['Merch & Cosmetics', '$0.2M'],
            ['TOTAL YEAR 3 ARR', '$12M+']
        ]
    },
    { bgImage: '/images/pitch/bg_network.png', type: 'grid',
        title: "Traction — IT IS LIVE",
        subtitle: "This is NOT an idea. It is built.",
        items: [
            { title: '916 Pages Built', desc: 'Fully deployed Next.js architecture.' },
            { title: '676+ Passing Tests', desc: 'Enterprise-grade code quality and stability.' },
            { title: '60+ Live Tables', desc: 'Running 24/7 with 100s of hands dealt daily.' },
            { title: '483+ Venues', desc: 'Indexed across the US with 12+ tour integrations.' },
            { title: '100+ GTO Games', desc: 'Powered by real PioSolver data.' },
            { title: 'Payments Live', desc: 'Stripe integration processing diamond purchases today.' }
        ]
    },
    { bgImage: '/images/pitch/bg_table.png', type: 'table',
        title: "Competitive Landscape",
        subtitle: "Every competitor does ONE thing. We do EVERYTHING.",
        columns: ['Feature', 'Smarter.Poker', 'PokerAtlas', 'GTO Wizard', 'ClubGG'],
        rows: [
            ['Game Discovery / Live Tables', 'YES', 'YES', 'NO', 'NO'],
            ['Live Poker / Rake', 'YES', 'NO', 'NO', 'YES'],
            ['GTO AI Training', 'YES', 'NO', 'YES', 'NO'],
            ['Social & Messenger', 'YES', 'NO', 'NO', 'NO'],
            ['Club Management SaaS', 'YES', 'YES', 'NO', 'NO'],
            ['Diamond Economy & Tools', 'YES', 'NO', 'NO', 'NO']
        ]
    },
    { bgImage: '/images/pitch/bg_diamond.png', type: 'grid',
        title: "Network Effects & Moats",
        subtitle: "Designed to be Uncatchable",
        items: [
            { title: 'Data Moat', desc: 'PioSolver farm — $1M+ investment, 2+ years for anyone to replicate.' },
            { title: 'Lock-in Moat', desc: 'Training progress + Bankroll history + Social graph = massive switching cost.' },
            { title: 'Network Moat', desc: 'Club Commander creates cross-club network effects natively.' },
            { title: 'Feature Moat', desc: '100+ integrated features — cannot be replicated overnight.' },
            { title: 'Supply Moat', desc: '483+ venues exclusive to our platform.' },
            { title: 'Demand Moat', desc: 'Growing player base creates network gravity (more players = more tables).' }
        ]
    },
    { bgImage: '/images/pitch/bg_cards.png', type: 'split',
        title: "Engagement & Retention Loops",
        subtitle: "Multi-loop system designed for DAILY activity.",
        visualType: 'phone',
        visual: <div style={{ padding: 20 }}><h3 style={{ color: '#fff' }}>Daily Activity</h3><div style={{ width: '100%', height: 150, background: 'linear-gradient(45deg, #00B4D8, #8040C0)', borderRadius: 12 }} /></div>,
        content: (
            <ul style={{ lineHeight: 1.8 }}>
                <li><strong>Daily:</strong> Trivia resets, Training challenges, Daily Challenge games.</li>
                <li><strong>Weekly:</strong> Club Arena tourneys, Home game sessions via Near Me.</li>
                <li><strong>Monthly:</strong> Leaderboards reset, Diamond promotions.</li>
                <li><strong>Ongoing:</strong> Social feed updates, News, Messenger conversations.</li>
                <li><strong style={{ color: '#00C87A' }}>Monetization:</strong> Diamond spend at EVERY single engagement point.</li>
            </ul>
        )
    },
    { bgImage: '/images/pitch/bg_data.png', type: 'grid',
        title: "Mobile-First Architecture",
        subtitle: "Engineered for speed, stability, and scale.",
        items: [
            { title: 'PWA + Native', desc: 'iOS & Android apps + Progressive Web App.' },
            { title: 'Real-Time WebSockets', desc: 'Push notifications for games, chats, tournaments.' },
            { title: 'Offline Mode', desc: 'For training and bankroll tools. Battery efficient.' },
            { title: 'One-Tap Join', desc: 'Instant access to Club Arena tables.' },
            { title: 'Biometrics', desc: 'Fingerprint/FaceID authentication + secure session handling.' },
            { title: 'Quick Actions', desc: 'Home screen widgets for daily activities.' }
        ]
    },
    { bgImage: '/images/pitch/bg_network.png', type: 'grid',
        title: "Security & Compliance",
        subtitle: "Enterprise-grade infrastructure.",
        items: [
            { title: 'Data Protection', desc: 'PostgreSQL encryption at rest, TLS/HTTPS everywhere in transit.' },
            { title: 'Payments', desc: 'Stripe PCI compliance for all transactions.' },
            { title: 'Access Control', desc: 'Role-based access (admin, user, moderator, dealer).' },
            { title: 'Audit Logging', desc: 'Immutable tracking of all transactions.' },
            { title: 'Regulatory Advantage', desc: 'Diamonds as virtual currency = NO gambling licenses needed.' },
            { title: 'GDPR Privacy', desc: 'Full compliance + regular penetration testing.' }
        ]
    },
    { bgImage: '/images/pitch/bg_table.png', type: 'table',
        title: "Platform Valuation",
        subtitle: "Buying in BELOW Replacement Cost",
        columns: ['Component', 'Estimated Dev Cost'],
        rows: [
            ['916 Pages ($1-2K/page)', '$916K - $1.8M'],
            ['676+ Test Suite ($5K ea)', '$3.4M+'],
            ['Infrastructure (PioSolver, servers)', '$500K+'],
            ['60+ Live Tables WebSocket system', '$500K+'],
            ['Total Equivalent Build Cost', '$4 - $8M+']
        ]
    },
    { bgImage: '/images/pitch/bg_diamond.png', type: 'table',
        title: "Use of Funds ($1.2M Seed)",
        subtitle: "Capital efficiency driven by completed product.",
        columns: ['Category', 'Amount', 'Allocation', 'Details'],
        rows: [
            ['Engineering', '$480K', '40%', 'Mobile apps, API scale, infrastructure'],
            ['Marketing', '$300K', '25%', 'Influencer partnerships, content, ads'],
            ['Sales', '$240K', '20%', 'B2B Club Commander outreach, venues'],
            ['Operations', '$180K', '15%', 'Legal, compliance, HR, admin']
        ]
    },
    { bgImage: '/images/pitch/bg_cards.png', type: 'table',
        title: "Year 1-3 Roadmap",
        subtitle: "The Path to $12M+ ARR",
        columns: ['Year', 'Targets'],
        rows: [
            ['Year 1', '50k DAU • Club Commander 100+ venues • Club Arena $500k MRR'],
            ['Year 2', '200k DAU • Home game TAM penetration • #1 mobile poker app'],
            ['Year 3', '1M+ DAU • $12M+ ARR • International expansion • Strategic partnerships']
        ]
    },
    { bgImage: '/images/pitch/bg_data.png', type: 'grid',
        title: "Unit Economics",
        subtitle: "Highly favorable ratios.",
        items: [
            { title: 'CAC: Near Zero', desc: 'Organic + Referrals via viral loops and B2B Club Commander acquisition.' },
            { title: 'LTV/CAC: >5:1', desc: '3-5 year average player engagement lifespan.' },
            { title: 'B2B ARPU', desc: '$200/month average per venue client.' },
            { title: 'Consumer ARPU', desc: '$15/month average user spend on Diamonds.' },
            { title: 'Gross Margins: 80%+', desc: 'Across all digital revenue streams.' },
            { title: 'Payback <6 Months', desc: 'For VIP and Diamond acquisition costs.' }
        ]
    },
    { bgImage: '/images/pitch/bg_network.png', type: 'split',
        title: "Founding Team",
        subtitle: "Built by Poker. For Poker.",
        visualType: 'none',
        content: (
            <div>
                <h3 style={{ color: '#00B4D8' }}>Daniel Bekavac — CEO / Founder</h3>
                <p>Poker industry background. Startup experience. Product vision. Architect and primary builder of the massive 916-page Smarter.Poker platform.</p>
                <h3 style={{ color: '#00C87A', marginTop: 30 }}>Engineering</h3>
                <p>Full-stack powerhouse capable of deploying 916 pages and maintaining 676+ tests in Next.js / React / Postgres.</p>
                <h3 style={{ color: '#8040C0', marginTop: 30 }}>Advisors</h3>
                <p>Backed by touring poker pros and VCs providing strategic guidance and capital connections.</p>
            </div>
        )
    },
    { bgImage: '/images/pitch/bg_table.png', type: 'grid',
        title: "Why Now?",
        subtitle: "The Perfect Storm",
        items: [
            { title: 'Market Timing', desc: 'Poker growing 25% YoY after post-pandemic boom. $2B home game TAM is completely unaddressed.' },
            { title: 'AI Accessibility', desc: 'GTO solvers are finally accessible and affordable enough to productize at scale.' },
            { title: 'Mobile Consolidation', desc: 'Players demand a single app. Platform economics dictate winners consolidate 80%+.' },
            { title: 'Cloud Infrastructure', desc: 'Costs now enable 60+ concurrent real-time tables flawlessly.' },
            { title: 'Stripe + Digital Currency', desc: 'Virtual diamonds solve the historic licensing nightmares of the 2000s boom.' },
            { title: 'Deregulation', desc: 'State-level poker legalization expanding rapidly across the US.' }
        ]
    },
    { bgImage: '/images/pitch/bg_diamond.png', type: 'table',
        title: "Risk Mitigation",
        subtitle: "Anticipating the hurdles.",
        columns: ['Risk', 'Mitigation'],
        rows: [
            ['Regulatory', 'Diamond virtual economy bypasses real-money gambling licenses.'],
            ['Competition', 'Network effects + PioSolver data moat protect market share.'],
            ['Player Churn', 'Multi-loop engagement (Trivia/AI/Social) drives lifetime value.'],
            ['Venue Onboarding', 'Club Commander creates revenue-share partnership model.'],
            ['Tech Debt', '676+ automated tests and modular architecture ensure stability.']
        ]
    },
    { bgImage: '/images/pitch/bg_cards.png', type: 'title',
        title: "THE ASK",
        subtitle: "$1.2M Seed Round • $6M Pre-Money SAFE",
        stats: [
            { value: '$20B+', label: 'Total Addressable Market' },
            { value: 'LIVE', label: '916 Pages, 60+ Tables' },
            { value: '10x', label: 'ROI Potential' }
        ]
    }
];

// =========================================================================
// MAIN PAGE COMPONENT
// =========================================================================

export default function InvestorPitchDeck() {
    const [currentSlide, setCurrentSlide] = useState(0);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight' || e.key === 'Space') {
                setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1));
            } else if (e.key === 'ArrowLeft') {
                setCurrentSlide(s => Math.max(0, s - 1));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const slide = SLIDES[currentSlide];

    return (
        <div className="pitch-deck-container" style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative' }}>
            <Head>
                <title>Smarter.Poker Investor Pitch</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            </Head>

            
            {/* GLOBAL CAPITALIZATION STYLE */}
            <style jsx global>{`
                .pitch-deck-container * {
                    text-transform: capitalize !important;
                }
            `}</style>
            
            {/* TOP CONTROLS */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 20, display: 'flex', justifyContent: 'space-between', zIndex: 100, background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}>
                <div style={{ color: '#00B4D8', fontWeight: 'bold', letterSpacing: 2 }}>SMARTER.POKER</div>
                <div style={{ color: '#fff', opacity: 0.5 }}>Slide {currentSlide + 1} of {SLIDES.length}</div>
                <div style={{ display: 'flex', gap: 15 }}>
                    <button onClick={() => window.print()} style={{ background: 'transparent', border: '1px solid #00B4D8', color: '#00B4D8', padding: '5px 15px', borderRadius: 20, cursor: 'pointer' }}>Download PDF</button>
                    <button onClick={() => window.history.back()} style={{ background: '#E02840', border: 'none', color: '#fff', padding: '5px 15px', borderRadius: 20, cursor: 'pointer' }}>Exit</button>
                </div>
            </div>

            {/* SLIDE CONTENT AREA */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentSlide}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                    style={{ width: '100%', height: '100%', textTransform: 'capitalize' }}
                >
                    {slide.type === 'title' && <TitleSlide {...slide} />}
                    {slide.type === 'split' && <SplitSlide {...slide} />}
                    {slide.type === 'table' && <TableSlide {...slide} />}
                    {slide.type === 'grid' && <GridSlide {...slide} />}
                </motion.div>
            </AnimatePresence>

            {/* BOTTOM PROGRESS BAR */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#1a2332', zIndex: 100 }}>
                <div style={{ width: `${((currentSlide + 1) / SLIDES.length) * 100}%`, height: '100%', background: '#00B4D8', transition: 'width 0.3s' }} />
            </div>

            {/* NAVIGATION OVERLAYS (Click left/right side to advance) */}
            <div onClick={() => setCurrentSlide(s => Math.max(0, s - 1))} style={{ position: 'absolute', top: '10%', bottom: '10%', left: 0, width: '15%', cursor: 'w-resize', zIndex: 90 }} />
            <div onClick={() => setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1))} style={{ position: 'absolute', top: '10%', bottom: '10%', right: 0, width: '15%', cursor: 'e-resize', zIndex: 90 }} />

            {/* VISIBLE ARROW BUTTONS */}
            <button
                onClick={() => setCurrentSlide(s => Math.max(0, s - 1))}
                style={{
                    position: 'absolute', top: '50%', left: 20, transform: 'translateY(-50%)',
                    width: 50, height: 50, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff', fontSize: '28px', cursor: 'pointer', zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: currentSlide === 0 ? 0 : 1, pointerEvents: currentSlide === 0 ? 'none' : 'auto',
                    transition: 'opacity 0.2s', backdropFilter: 'blur(4px)'
                }}
            >
                ‹
            </button>
            <button
                onClick={() => setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1))}
                style={{
                    position: 'absolute', top: '50%', right: 20, transform: 'translateY(-50%)',
                    width: 50, height: 50, borderRadius: '50%',
                    background: 'rgba(0,180,216,0.1)', border: '1px solid rgba(0,180,216,0.5)',
                    color: '#00B4D8', fontSize: '28px', cursor: 'pointer', zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: currentSlide === SLIDES.length - 1 ? 0 : 1, pointerEvents: currentSlide === SLIDES.length - 1 ? 'none' : 'auto',
                    transition: 'opacity 0.2s', backdropFilter: 'blur(4px)'
                }}
            >
                ›
            </button>
        </div>
    );
}
