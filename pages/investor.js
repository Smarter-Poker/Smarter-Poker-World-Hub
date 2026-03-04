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

const MockHubCarousel = () => (
    <div style={{ height: '100%', padding: 20, display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at center, #0a1628 0%, #050d16 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 30 }}>
            <div style={{ width: 30, height: 30, background: '#1a2332', borderRadius: '50%' }} />
            <div style={{ color: '#fff', fontWeight: 700, letterSpacing: 1 }}>Smarter.Poker</div>
            <div style={{ width: 30, height: 30, background: '#1a2332', borderRadius: '50%' }} />
        </div>
        {/* Active Carousel Card */}
        <div style={{ flex: 1, background: 'linear-gradient(135deg, #E02840, #0A1628)', borderRadius: 20, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: 20 }}>🦁</div>
            <h2 style={{ color: '#fff', textAlign: 'center', margin: '0 0 10px 0', fontSize: '1.8rem', textShadow: '0 2px 10px rgba(255,255,255,0.3)' }}>Club Arena</h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontSize: '0.9rem', lineHeight: 1.5 }}>Play against other players in clubs around the world</p>
        </div>
        {/* Carousel Indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 30 }}>
            <div style={{ width: 30, height: 6, background: '#00B4D8', borderRadius: 3 }} />
            <div style={{ width: 8, height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 3 }} />
            <div style={{ width: 8, height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 3 }} />
            <div style={{ width: 8, height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 3 }} />
        </div>
    </div>
);

const MockClubCommander = () => (
    <div style={{ padding: 20, color: '#fff' }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#E02840' }}>CLUB COMMANDER</h3>
        <div style={{ display: 'flex', gap: 15, marginBottom: 20 }}>
            <div style={{ flex: 1, background: '#1a2332', padding: 15, borderRadius: 10 }}>
                <div style={{ fontSize: '0.8rem', color: '#888' }}>Tables</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>14</div>
            </div>
            <div style={{ flex: 1, background: '#1a2332', padding: 15, borderRadius: 10 }}>
                <div style={{ fontSize: '0.8rem', color: '#888' }}>Waitlist</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00C87A' }}>32</div>
            </div>
        </div>
        <div style={{ background: '#1a2332', padding: 15, borderRadius: 10 }}>
            <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 15 }}>Active Tables</div>
            {[1, 2, 3].map(i => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 3 ? '1px solid #333' : 'none' }}>
                    <div>Table {i} - 1/2 NLH</div>
                    <div style={{ color: '#00B4D8' }}>9/9</div>
                </div>
            ))}
        </div>
    </div>
);

const MockLiveArena = () => (
    <div style={{ padding: 20 }}>
        <div style={{ background: 'linear-gradient(135deg, #0A1628, #1a2332)', padding: 20, borderRadius: 15, marginBottom: 20, border: '1px solid rgba(0,212,255,0.3)' }}>
            <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold', marginBottom: 5 }}>Midway Union</div>
            <div style={{ color: '#00B4D8', fontSize: '0.9rem' }}>58 Tables Running</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} style={{ background: '#1a2332', padding: 12, borderRadius: 10 }}>
                    <div style={{ color: '#00C87A', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: 4 }}>• LIVE</div>
                    <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 'bold' }}>1.00/2.00 NLH</div>
                    <div style={{ color: '#888', fontSize: '0.8rem', marginTop: 4 }}>6/6 Players</div>
                </div>
            ))}
        </div>
    </div>
);

const MockGTO = () => (
    <div style={{ padding: 20, height: '100%', background: '#050D16' }}>
        <h3 style={{ color: '#8040C0', margin: '0 0 20px 0' }}>GTO MASTERY</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
            {['MTT Scenarios', 'Cash Grind', 'Psychology', 'Spin & Go'].map((title, i) => (
                <div key={i} style={{ height: 100, background: 'linear-gradient(135deg, #1a2332, #0A1628)', borderRadius: 12, padding: 15, borderLeft: `4px solid ${['#00B4D8', '#00C87A', '#8040C0', '#E02840'][i]}` }}>
                    <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: 10 }}>{title}</div>
                    <div style={{ width: '100%', height: 4, background: '#333', borderRadius: 2 }}>
                        <div style={{ width: `${60 + (i * 10)}%`, height: '100%', background: ['#00B4D8', '#00C87A', '#8040C0', '#E02840'][i], borderRadius: 2 }} />
                    </div>
                </div>
            ))}
        </div>
    </div>
);

const MockDiamondStore = () => (
    <div style={{ padding: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: '3rem' }}>💎</div>
            <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 'bold' }}>Diamond Store</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {[
                { name: 'Micro', dias: 100, price: '$1.00' },
                { name: 'Standard', dias: 2500, price: '$25.00', popular: true },
                { name: 'Whale', dias: 52500, price: '$500.00' }
            ].map((p, i) => (
                <div key={i} style={{ background: p.popular ? 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(128,64,192,0.2))' : '#1a2332', padding: 20, borderRadius: 12, border: p.popular ? '2px solid #00B4D8' : '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.2rem' }}>{p.dias} 💎</div>
                        <div style={{ color: '#888', fontSize: '0.8rem' }}>{p.name}</div>
                    </div>
                    <div style={{ color: '#fff', fontWeight: 'bold' }}>{p.price}</div>
                </div>
            ))}
        </div>
    </div>
);

const MockPioSolver = () => (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 20, background: '#1a2332', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 'bold' }}>PioSolver Execution Engine Node 14</div>
            <div style={{ color: '#00C87A', fontSize: '0.8rem' }}>● SOLVING</div>
        </div>
        <div style={{ flex: 1, padding: 20, display: 'flex', gap: 20 }}>
            {/* Range Matrix Mock */}
            <div style={{ flex: 1, background: '#0A1628', borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, height: '100%' }}>
                    {Array(64).fill(0).map((_, i) => (
                        <div key={i} style={{ background: i % 7 === 0 ? '#E02840' : i % 5 === 0 ? '#00C87A' : i % 3 === 0 ? '#00B4D8' : '#1a2332', opacity: 0.8 }} />
                    ))}
                </div>
            </div>
            {/* Logs Mock */}
            <div style={{ flex: 1, fontFamily: 'monospace', color: '#00C87A', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div>{'>'} Calculating EV for Node 4892...</div>
                <div>{'>'} Exploitative deviation: 2.4%</div>
                <div>{'>'} Writing to Postgres block 84...</div>
                <div style={{ color: '#8040C0' }}>{'>'} Strategy converged at 0.05% dEV</div>
                <div>{'>'} ----------------------------</div>
                <div>{'>'} 100M+ Hands Indexed</div>
            </div>
        </div>
    </div>
);

// =========================================================================
// 36-SLIDE DATA CONFIGURATION
// =========================================================================

const SLIDES = [
    {
        type: 'title',
        title: "SMARTER.POKER",
        subtitle: "The World's First Poker Super-Platform",
        stats: [
            { value: '916', label: 'Pages Built' },
            { value: '60+', label: 'Live Tables' },
            { value: '$1.2M', label: 'Seed Raise' }
        ]
    },
    {
        type: 'table',
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
    {
        type: 'split',
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
    {
        type: 'grid',
        title: "Platform Architecture",
        subtitle: "The Hub-and-Spoke Virality Model",
        items: [
            { icon: '🏢', title: 'Club Commander', desc: 'Acquires venues, forcing their players natively into our ecosystem.' },
            { icon: '🧠', title: 'Training & Trivia', desc: 'Drives massive Daily Active Usage (DAU) and habit loop.' },
            { icon: '💰', title: 'Club Arena', desc: 'Primary monetization engine generating recurring rake revenue.' },
            { icon: '🤝', title: 'Social & Messenger', desc: 'Creates high switching costs and total network lock-in.' },
            { icon: '💎', title: 'Diamond Economy', desc: 'Universal currency eliminating friction across all apps.' },
            { icon: '📍', title: 'Poker Near Me', desc: 'Top-of-funnel acquisition mapping the entire world.' }
        ]
    },
    {
        type: 'split',
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
    {
        type: 'split',
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
    {
        type: 'table',
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
    {
        type: 'split',
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
    {
        type: 'split',
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
    {
        type: 'split',
        title: "Diamond Arena",
        subtitle: "Gamble Virtual Currency. Win Real World Prizes.",
        visualType: 'hologram',
        visual: <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: '5rem' }}>🏆</div><h2 style={{ color: '#00B4D8' }}>Real-World Prize Pools</h2></div>,
        content: (
            <div>
                <p>Buy in with Diamonds (virtual currency). Win real-world prizes: Tournament buy-ins, Gift cards, Merchandise.</p>
                <h3 style={{ color: '#E07820', marginTop: 30 }}>Why this works:</h3>
                <p>Diamond buy-ins create constant monetization. No casino license needed (diamonds are virtual currency). Integrates directly with training progression and social bragging rights.</p>
            </div>
        )
    },
    {
        type: 'split',
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
    {
        type: 'split',
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
    {
        type: 'grid',
        title: "Jarvis AI & Trivia Engine",
        subtitle: "Daily engagement systems that bring users back every 24 hours.",
        items: [
            { icon: '🤖', title: 'Jarvis Personal Assistant', desc: 'Analyzes every hand you play, finds leaks automatically, and suggests specific training games to fix weaknesses.' },
            { icon: '🧪', title: 'Virtual Sandbox', desc: 'Explore "what if" scenarios based on your bankroll and skill level.' },
            { icon: '🚀', title: '9+ Sci-Fi Game Modes', desc: 'MTT Scenarios, Cash Game, ICM, Survival Mode, Endless Mode.' },
            { icon: '⏱️', title: 'Quick Stakes', desc: '10 questions in 60 seconds. Entry: 10 diamonds. Answer fast, win big.' },
            { icon: '📅', title: 'Daily Content', desc: '100s of fresh questions DAILY. Content changes EVERY DAY at midnight PST.' },
            { icon: '⚔️', title: 'Head-to-Head', desc: '1v1 real-time battles against another player.' }
        ]
    },
    {
        type: 'grid',
        title: "Social Media & Messenger",
        subtitle: "1:1 Clones of Facebook and WhatsApp. Don't leave the app to talk about the app.",
        items: [
            { icon: '📱', title: 'News Feed', desc: 'Posts, photos, Go Live streaming, Stories, and Reels.' },
            { icon: '👤', title: 'User Profiles', desc: 'Fully integrated with your poker stats, graphs, and badges.' },
            { icon: '💬', title: 'WhatsApp Clone', desc: '1-on-1 messaging, group chats, voice calls, video calls.' },
            { icon: '📤', title: 'Media Sharing', desc: 'Share images, files, and deep-linked hand histories natively.' },
            { icon: '🔔', title: 'Notifications', desc: 'Instant push alerts for game action and messages.' },
            { icon: '👥', title: 'Groups', desc: 'Dedicated spaces for study groups and club members.' }
        ]
    },
    {
        type: 'grid',
        title: "Essential Tools",
        subtitle: "Professional Utilities Locked Behind Our Ecosystem",
        items: [
            { icon: '📊', title: 'Bankroll Manager', desc: 'Session tracking, P&L charts, AI leak detection. Diamond-gated premium insights.' },
            { icon: '🧮', title: 'Odds Calculator', desc: 'Supports NLH, PLO4, PLO5, and PLO6. NOBODY ELSE HAS PLO5/6 SUPPORT.' },
            { icon: '💵', title: 'Toke Tracker', desc: 'Worlds ONLY dealer tracking platform. Tips, hourly rates, tax reports. 100k+ dealers. ZERO competition.' }
        ]
    },
    {
        type: 'split',
        title: "News Aggregator & Video Library",
        subtitle: "The Epicenter of Poker Content",
        visualType: 'tablet',
        visual: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 20 }}>
                <div style={{ fontSize: '1.2rem', color: '#fff', fontWeight: 'bold' }}>Trending News</div>
                {[1, 2, 3].map(i => <div key={i} style={{ background: '#1a2332', height: 80, borderRadius: 8, display: 'flex', gap: 10, padding: 10 }}><div style={{ width: 60, height: 60, background: '#0a1628', borderRadius: 4 }}></div><div style={{ flex: 1 }}><div style={{ width: '80%', height: 10, background: '#333', marginBottom: 5 }}></div><div style={{ width: '60%', height: 10, background: '#333' }}></div></div></div>)}
            </div>
        ),
        content: (
            <div>
                <p><strong>News:</strong> Featured article cards with thumbnails, "JUST IN" breaking headlines from WSOP, WPT, MSPT, RGPS.</p>
                <p><strong>Video Library:</strong> Strategy tool previews, latest videos, tournament footage, streamer partnerships.</p>
                <p>Integrated with our "Go Live" social media feature to dominate content consumption.</p>
            </div>
        )
    },
    {
        type: 'table',
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
    {
        type: 'split',
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
    {
        type: 'split',
        title: "Memory Games & Diamond Arcade",
        subtitle: "Expanding the funnel to casual demographic.",
        visualType: 'hologram',
        visual: <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem' }}>🎰🃏</div>,
        content: (
            <div>
                <p><strong>Memory Games:</strong> Card matching with poker themes, progressive difficulty, daily challenges.</p>
                <p><strong>Diamond Arcade:</strong> Spend diamonds to play arcade-style/slot mechanics to win multipliers.</p>
                <p>Purpose: Creates constant diamond circulation and a fun, casual entry point for new users.</p>
            </div>
        )
    },
    {
        type: 'split',
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
    {
        type: 'table',
        title: "Market Opportunity",
        subtitle: "TAM / SAM / SOM ($Billions)",
        columns: ['Metric', 'Value', 'Description'],
        rows: [
            ['TAM', '$260B', 'Global online gambling market'],
            ['SAM', '$20B', 'Online poker + tools + training'],
            ['SOM', '$200M', 'Year 5 target (clubs + training + home games)']
        ]
    },
    {
        type: 'table',
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
    {
        type: 'grid',
        title: "Traction — IT IS LIVE",
        subtitle: "This is NOT an idea. It is built.",
        items: [
            { icon: '🖥️', title: '916 Pages Built', desc: 'Fully deployed Next.js architecture.' },
            { icon: '✅', title: '676+ Passing Tests', desc: 'Enterprise-grade code quality and stability.' },
            { icon: '🃏', title: '60+ Live Tables', desc: 'Running 24/7 with 100s of hands dealt daily.' },
            { icon: '📍', title: '483+ Venues', desc: 'Indexed across the US with 12+ tour integrations.' },
            { icon: '🧠', title: '100+ GTO Games', desc: 'Powered by real PioSolver data.' },
            { icon: '💳', title: 'Payments Live', desc: 'Stripe integration processing diamond purchases today.' }
        ]
    },
    {
        type: 'table',
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
    {
        type: 'grid',
        title: "Network Effects & Moats",
        subtitle: "Designed to be Uncatchable",
        items: [
            { icon: '💾', title: 'Data Moat', desc: 'PioSolver farm — $1M+ investment, 2+ years for anyone to replicate.' },
            { icon: '🔗', title: 'Lock-in Moat', desc: 'Training progress + Bankroll history + Social graph = massive switching cost.' },
            { icon: '🌐', title: 'Network Moat', desc: 'Club Commander creates cross-club network effects natively.' },
            { icon: '🚀', title: 'Feature Moat', desc: '100+ integrated features — cannot be replicated overnight.' },
            { icon: '🏛️', title: 'Supply Moat', desc: '483+ venues exclusive to our platform.' },
            { icon: '🧲', title: 'Demand Moat', desc: 'Growing player base creates network gravity (more players = more tables).' }
        ]
    },
    {
        type: 'split',
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
    {
        type: 'grid',
        title: "Mobile-First Architecture",
        subtitle: "Engineered for speed, stability, and scale.",
        items: [
            { icon: '📱', title: 'PWA + Native', desc: 'iOS & Android apps + Progressive Web App.' },
            { icon: '⚡', title: 'Real-Time WebSockets', desc: 'Push notifications for games, chats, tournaments.' },
            { icon: '🔋', title: 'Offline Mode', desc: 'For training and bankroll tools. Battery efficient.' },
            { icon: '👆', title: 'One-Tap Join', desc: 'Instant access to Club Arena tables.' },
            { icon: '🔒', title: 'Biometrics', desc: 'Fingerprint/FaceID authentication + secure session handling.' },
            { icon: '⏱️', title: 'Quick Actions', desc: 'Home screen widgets for daily activities.' }
        ]
    },
    {
        type: 'grid',
        title: "Security & Compliance",
        subtitle: "Enterprise-grade infrastructure.",
        items: [
            { icon: '🔐', title: 'Data Protection', desc: 'PostgreSQL encryption at rest, TLS/HTTPS everywhere in transit.' },
            { icon: '💳', title: 'Payments', desc: 'Stripe PCI compliance for all transactions.' },
            { icon: '🛡️', title: 'Access Control', desc: 'Role-based access (admin, user, moderator, dealer).' },
            { icon: '📝', title: 'Audit Logging', desc: 'Immutable tracking of all transactions.' },
            { icon: '⚖️', title: 'Regulatory Advantage', desc: 'Diamonds as virtual currency = NO gambling licenses needed.' },
            { icon: '🌍', title: 'GDPR Privacy', desc: 'Full compliance + regular penetration testing.' }
        ]
    },
    {
        type: 'table',
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
    {
        type: 'table',
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
    {
        type: 'table',
        title: "Year 1-3 Roadmap",
        subtitle: "The Path to $12M+ ARR",
        columns: ['Year', 'Targets'],
        rows: [
            ['Year 1', '50k DAU • Club Commander 100+ venues • Club Arena $500k MRR'],
            ['Year 2', '200k DAU • Home game TAM penetration • #1 mobile poker app'],
            ['Year 3', '1M+ DAU • $12M+ ARR • International expansion • Strategic partnerships']
        ]
    },
    {
        type: 'grid',
        title: "Unit Economics",
        subtitle: "Highly favorable ratios.",
        items: [
            { icon: '📉', title: 'CAC: Near Zero', desc: 'Organic + Referrals via viral loops and B2B Club Commander acquisition.' },
            { icon: '📈', title: 'LTV/CAC: >5:1', desc: '3-5 year average player engagement lifespan.' },
            { icon: '🏢', title: 'B2B ARPU', desc: '$200/month average per venue client.' },
            { icon: '💎', title: 'Consumer ARPU', desc: '$15/month average user spend on Diamonds.' },
            { icon: '💰', title: 'Gross Margins: 80%+', desc: 'Across all digital revenue streams.' },
            { icon: '⚡', title: 'Payback <6 Months', desc: 'For VIP and Diamond acquisition costs.' }
        ]
    },
    {
        type: 'split',
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
    {
        type: 'grid',
        title: "Why Now?",
        subtitle: "The Perfect Storm",
        items: [
            { icon: '📈', title: 'Market Timing', desc: 'Poker growing 25% YoY after post-pandemic boom. $2B home game TAM is completely unaddressed.' },
            { icon: '🧠', title: 'AI Accessibility', desc: 'GTO solvers are finally accessible and affordable enough to productize at scale.' },
            { icon: '📱', title: 'Mobile Consolidation', desc: 'Players demand a single app. Platform economics dictate winners consolidate 80%+.' },
            { icon: '☁️', title: 'Cloud Infrastructure', desc: 'Costs now enable 60+ concurrent real-time tables flawlessly.' },
            { icon: '💳', title: 'Stripe + Digital Currency', desc: 'Virtual diamonds solve the historic licensing nightmares of the 2000s boom.' },
            { icon: '🇺🇸', title: 'Deregulation', desc: 'State-level poker legalization expanding rapidly across the US.' }
        ]
    },
    {
        type: 'table',
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
    {
        type: 'title',
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
        <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative' }}>
            <Head>
                <title>Smarter.Poker Investor Pitch</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            </Head>

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
                    style={{ width: '100%', height: '100%' }}
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
            <div onClick={() => setCurrentSlide(s => Math.max(0, s - 1))} style={{ position: 'absolute', top: '10%', bottom: '10%', left: 0, width: '20%', cursor: 'w-resize', zIndex: 90 }} />
            <div onClick={() => setCurrentSlide(s => Math.min(SLIDES.length - 1, s + 1))} style={{ position: 'absolute', top: '10%', bottom: '10%', right: 0, width: '20%', cursor: 'e-resize', zIndex: 90 }} />
        </div>
    );
}
