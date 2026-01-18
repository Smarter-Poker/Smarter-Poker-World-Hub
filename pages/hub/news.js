/**
 * SMARTER.POKER NEWS HUB - TRUE CARDPLAYER.COM CLONE
 * Dense 3-column layout matching CardPlayer's exact structure
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Search, ChevronRight, Play } from 'lucide-react';
import { supabase } from '../../src/lib/supabase';

// Demo news data - will be replaced by DB when populated
const DEMO_NEWS = [
    {
        id: 1, title: "Thomas Boivin Stays Hot With Florida High Roller Win",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=600&q=80",
        source_name: "PokerNews", source_url: "#", published_at: new Date().toISOString()
    },
    {
        id: 2, title: "Poker Cheats Banned From Texas Card Room",
        image_url: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=400&q=80",
        source_name: "CardPlayer", source_url: "#", published_at: new Date().toISOString()
    },
    {
        id: 3, title: "Bettors In Baseball Scandal Says Texts Were About Cockfighting",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80",
        source_name: "PokerNews", source_url: "#", published_at: new Date().toISOString()
    },
    {
        id: 4, title: "Titus Attaches Gambling Tax Fix To Spending Bill",
        image_url: "https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=400&q=80",
        source_name: "CardPlayer", source_url: "#", published_at: new Date().toISOString()
    },
    {
        id: 5, title: "Bookie For Ohtani's Interpreter Nominated For Black Book",
        image_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80",
        source_name: "PokerNews", source_url: "#", published_at: new Date().toISOString()
    },
];

const DEMO_HEADLINES = [
    "Trump Hints At Arrest Of Polymarket Insider",
    "Maine Online Casino Market Taking Shape",
    "Blake Vogdes Wins Borgata Winter Poker Open",
    "New York Gov. Wants More Done To Stop Underage Betting",
    "Kayhan Mokri Wins $1 Million Pot Against 'cardsforfun'",
    "Phil Ivey Takes Down High Roller in Macau",
    "WSOP Circuit Event Ends In Winner-Take-All Deal",
    "Alex Foxen Captures 12th PokerGO Tour Title"
];

const POKER_BONUSES = [
    { site: "ACR Poker", bonus: "100% up to $2,000", icon: "🎰" },
    { site: "CoinPoker", bonus: "150% up to $2000", icon: "🪙" },
    { site: "Everygame", bonus: "300% up to $1500", icon: "🎲" },
    { site: "Bovada Poker", bonus: "100% up to $500", icon: "🃏" },
    { site: "BetOnline", bonus: "100% up to $1,000", icon: "💰" },
    { site: "Ignition Casino", bonus: "100% up to $3000", icon: "🔥" },
    { site: "Sportsbetting", bonus: "100% up to $1000", icon: "⚽" }
];

const CASINO_BONUSES = [
    { site: "Ignition Casino", bonus: "100% up to $3,000", icon: "🔥" },
    { site: "ACR Poker", bonus: "100% up to $2,000", icon: "🎰" },
    { site: "BetOnline", bonus: "100% up to $1,000", icon: "💰" },
    { site: "Coin Poker", bonus: "150% up to $2,000", icon: "🪙" }
];

const POY_LEADERBOARD = [
    { rank: 1, name: "Alex Foxen", points: 2850, winnings: "$4,250,000" },
    { rank: 2, name: "Thomas Boivin", points: 2720, winnings: "$3,890,000" },
    { rank: 3, name: "Chad Eveslage", points: 2580, winnings: "$3,450,000" },
    { rank: 4, name: "Stephen Chidwick", points: 2410, winnings: "$3,120,000" },
    { rank: 5, name: "Daniel Negreanu", points: 2290, winnings: "$2,980,000" }
];

export default function NewsHub() {
    const [news, setNews] = useState(DEMO_NEWS);
    const [headlines, setHeadlines] = useState(DEMO_HEADLINES);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadNews();
    }, []);

    const loadNews = async () => {
        try {
            const { data, error } = await supabase
                .from('poker_news')
                .select('*')
                .order('published_at', { ascending: false })
                .limit(20);

            if (!error && data && data.length > 0) {
                setNews(data.slice(0, 5));
                setHeadlines(data.slice(5).map(a => a.title));
            }
        } catch (e) {
            console.log('Using demo data');
        }
        setLoading(false);
    };

    const heroStory = news[0];
    const gridStories = news.slice(1, 5);

    return (
        <>
            <Head>
                <title>Poker News | Smarter.Poker</title>
            </Head>

            <div className="min-h-screen" style={{ backgroundColor: '#1a1a2e' }}>
                {/* Top Banner - CardPlayer Style */}
                <div style={{ backgroundColor: '#8B0000', color: 'white', padding: '8px 0', textAlign: 'center', fontSize: '13px' }}>
                    Sign Up For Smarter.Poker's Newsletter And Free Bi-Monthly Online Magazine
                </div>

                {/* Header - Dark with Logo */}
                <header style={{ backgroundColor: '#0d0d1a', padding: '15px 0', borderBottom: '1px solid #333' }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 15px' }}>
                        <Link href="/hub">
                            <div style={{
                                background: 'linear-gradient(135deg, #8B0000, #cc0000)',
                                padding: '15px 25px',
                                borderRadius: '8px',
                                display: 'inline-block',
                                cursor: 'pointer'
                            }}>
                                <span style={{ color: '#FFD700', fontSize: '28px', fontWeight: 'bold', fontStyle: 'italic' }}>
                                    Smarter.Poker
                                </span>
                                <span style={{ color: 'white', fontSize: '10px', display: 'block', marginTop: '2px' }}>
                                    THE POKER INTELLIGENCE AUTHORITY
                                </span>
                            </div>
                        </Link>
                    </div>
                </header>

                {/* Main 3-Column Layout */}
                <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 15px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 280px', gap: '20px' }}>

                        {/* LEFT SIDEBAR - Bonuses */}
                        <aside>
                            {/* Poker Bonuses */}
                            <div style={{ marginBottom: '20px' }}>
                                <h3 style={{ color: '#FFD700', fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', borderBottom: '2px solid #8B0000', paddingBottom: '5px' }}>
                                    Best Online Poker Bonuses
                                </h3>
                                {POKER_BONUSES.map((bonus, i) => (
                                    <div key={i} style={{
                                        padding: '8px 0',
                                        borderBottom: '1px solid #333',
                                        cursor: 'pointer'
                                    }}>
                                        <div style={{ color: '#4dabf7', fontSize: '12px', fontWeight: 'bold' }}>
                                            {bonus.icon} {bonus.site}
                                        </div>
                                        <div style={{ color: '#aaa', fontSize: '11px' }}>
                                            {bonus.bonus}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Casino Bonuses */}
                            <div style={{ marginBottom: '20px' }}>
                                <h3 style={{ color: '#FFD700', fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', borderBottom: '2px solid #8B0000', paddingBottom: '5px' }}>
                                    Best Casino Bonuses
                                </h3>
                                {CASINO_BONUSES.map((bonus, i) => (
                                    <div key={i} style={{
                                        padding: '8px 0',
                                        borderBottom: '1px solid #333',
                                        cursor: 'pointer'
                                    }}>
                                        <div style={{ color: '#4dabf7', fontSize: '12px', fontWeight: 'bold' }}>
                                            {bonus.icon} {bonus.site}
                                        </div>
                                        <div style={{ color: '#aaa', fontSize: '11px' }}>
                                            {bonus.bonus}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Poker Training */}
                            <div style={{ marginBottom: '20px' }}>
                                <h3 style={{ color: '#FFD700', fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', borderBottom: '2px solid #8B0000', paddingBottom: '5px' }}>
                                    Poker Training
                                </h3>
                                <Link href="/hub/training">
                                    <div style={{ color: '#4dabf7', fontSize: '12px', padding: '5px 0', cursor: 'pointer' }}>
                                        Smarter.Poker School ›
                                    </div>
                                </Link>
                            </div>

                            {/* Newsletter */}
                            <div>
                                <h3 style={{ color: '#FFD700', fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', borderBottom: '2px solid #8B0000', paddingBottom: '5px' }}>
                                    Newsletter and Magazine
                                </h3>
                                <button style={{
                                    backgroundColor: '#8B0000',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '5px',
                                    cursor: 'pointer',
                                    width: '100%',
                                    fontWeight: 'bold'
                                }}>
                                    Sign Up
                                </button>
                            </div>
                        </aside>

                        {/* CENTER CONTENT */}
                        <div>
                            {/* Sub Header Bar */}
                            <div style={{
                                backgroundColor: '#333',
                                padding: '10px 15px',
                                marginBottom: '15px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderRadius: '4px'
                            }}>
                                <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '13px' }}>
                                    Smarter.Poker: The Online Poker Guide and Intelligence Authority
                                </span>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <input
                                        type="text"
                                        placeholder="Search"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{
                                            padding: '5px 10px',
                                            borderRadius: '3px',
                                            border: '1px solid #555',
                                            backgroundColor: '#222',
                                            color: 'white',
                                            fontSize: '12px',
                                            width: '150px'
                                        }}
                                    />
                                    <button style={{
                                        backgroundColor: '#8B0000',
                                        color: 'white',
                                        border: 'none',
                                        padding: '5px 15px',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}>
                                        GO
                                    </button>
                                </div>
                            </div>

                            {/* Hero Story */}
                            {heroStory && (
                                <div style={{ marginBottom: '15px', position: 'relative' }}>
                                    <img
                                        src={heroStory.image_url}
                                        alt={heroStory.title}
                                        style={{ width: '100%', height: '280px', objectFit: 'cover', borderRadius: '4px' }}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                                        padding: '40px 15px 15px',
                                        borderRadius: '0 0 4px 4px'
                                    }}>
                                        <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                                            {heroStory.title}
                                        </h2>
                                    </div>
                                </div>
                            )}

                            {/* 4-Card Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
                                {gridStories.map((story) => (
                                    <div key={story.id} style={{ cursor: 'pointer' }}>
                                        <img
                                            src={story.image_url}
                                            alt={story.title}
                                            style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', marginBottom: '5px' }}
                                        />
                                        <div style={{ color: 'white', fontSize: '11px', fontWeight: 'bold', lineHeight: '1.3' }}>
                                            {story.title}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Magazine Banner */}
                            <div style={{
                                background: 'linear-gradient(135deg, #8B0000, #cc0000)',
                                padding: '25px',
                                textAlign: 'center',
                                marginBottom: '20px',
                                borderRadius: '4px'
                            }}>
                                <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>
                                    READ THE
                                </div>
                                <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>
                                    NEW ISSUE OF
                                </div>
                                <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                                    <span style={{ color: '#FFD700' }}>SMARTER.POKER</span>
                                    <span style={{ color: 'white' }}> HERE</span>
                                </div>
                            </div>

                            {/* Headlines List */}
                            <div style={{ marginBottom: '20px' }}>
                                {headlines.map((headline, i) => (
                                    <div key={i} style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #333',
                                        cursor: 'pointer'
                                    }}>
                                        <span style={{
                                            width: '14px',
                                            height: '14px',
                                            border: '2px solid #666',
                                            marginRight: '10px',
                                            flexShrink: 0,
                                            marginTop: '2px'
                                        }} />
                                        <span style={{ color: '#4dabf7', fontSize: '13px', fontWeight: '500' }}>
                                            {headline}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* More News Button */}
                            <button style={{
                                backgroundColor: '#8B0000',
                                color: 'white',
                                border: 'none',
                                padding: '12px 30px',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                display: 'block',
                                margin: '0 auto'
                            }}>
                                More News
                            </button>
                        </div>

                        {/* RIGHT SIDEBAR - Ads & Widgets */}
                        <aside>
                            {/* Ad 1 - PGT */}
                            <div style={{
                                backgroundColor: '#1e3a5f',
                                padding: '15px',
                                marginBottom: '15px',
                                borderRadius: '4px',
                                textAlign: 'center'
                            }}>
                                <div style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '18px' }}>PGT</div>
                                <div style={{ color: 'white', fontSize: '12px' }}>CLICK HERE FOR</div>
                                <div style={{ color: '#4dabf7', fontSize: '14px', fontWeight: 'bold' }}>NEWS & SCHEDULE</div>
                            </div>

                            {/* Ad 2 - Mystery Bounty */}
                            <div style={{
                                backgroundImage: 'linear-gradient(135deg, #1a1a2e, #2d2d44)',
                                padding: '20px',
                                marginBottom: '15px',
                                borderRadius: '4px',
                                textAlign: 'center',
                                border: '1px solid #444'
                            }}>
                                <div style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '16px' }}>MYSTERY BOUNTY</div>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '10px' }}>
                                    <div>
                                        <div style={{ color: '#4dabf7', fontWeight: 'bold' }}>NLH</div>
                                        <div style={{ color: '#FFD700', fontSize: '12px' }}>$8 MILLION</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#9b59b6', fontWeight: 'bold' }}>PLO</div>
                                        <div style={{ color: '#FFD700', fontSize: '12px' }}>$2 MILLION</div>
                                    </div>
                                </div>
                                <div style={{ color: '#aaa', fontSize: '11px', marginTop: '10px' }}>
                                    JANUARY 18th TO FEBRUARY 3rd
                                </div>
                                <button style={{
                                    backgroundColor: '#27ae60',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 20px',
                                    borderRadius: '4px',
                                    marginTop: '10px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}>
                                    JOIN ACR
                                </button>
                            </div>

                            {/* Ad 3 - Winter Festival */}
                            <div style={{
                                backgroundImage: 'linear-gradient(135deg, #1e3a5f, #2980b9)',
                                padding: '20px',
                                marginBottom: '15px',
                                borderRadius: '4px',
                                textAlign: 'center'
                            }}>
                                <div style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '24px' }}>$10M GTD</div>
                                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>WINTER FESTIVAL</div>
                                <div style={{ color: '#aaa', fontSize: '11px', marginTop: '5px' }}>
                                    DECEMBER 26TH - JANUARY 26TH
                                </div>
                            </div>

                            {/* Video Widget */}
                            <div style={{
                                backgroundColor: '#000',
                                padding: '0',
                                marginBottom: '15px',
                                borderRadius: '4px',
                                position: 'relative',
                                height: '150px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundImage: 'url(https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=400&q=80)',
                                backgroundSize: 'cover'
                            }}>
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'column'
                                }}>
                                    <div style={{
                                        width: '50px',
                                        height: '50px',
                                        backgroundColor: '#e74c3c',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginBottom: '10px'
                                    }}>
                                        <Play fill="white" size={24} style={{ marginLeft: '4px' }} />
                                    </div>
                                    <div style={{ color: 'white', fontWeight: 'bold' }}>LIVE vs ONLINE</div>
                                </div>
                            </div>

                            {/* POY Leaderboard */}
                            <div style={{
                                backgroundColor: '#1a1a2e',
                                border: '1px solid #333',
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    backgroundColor: '#333',
                                    borderBottom: '1px solid #444'
                                }}>
                                    <div style={{
                                        flex: 1,
                                        padding: '10px',
                                        textAlign: 'center',
                                        color: 'white',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        backgroundColor: '#8B0000'
                                    }}>
                                        Player of the Year
                                    </div>
                                    <div style={{
                                        flex: 1,
                                        padding: '10px',
                                        textAlign: 'center',
                                        color: '#aaa',
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}>
                                        Leaderboards
                                    </div>
                                </div>
                                <table style={{ width: '100%', fontSize: '11px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#222' }}>
                                            <th style={{ padding: '8px', color: '#aaa', textAlign: 'left' }}>Player</th>
                                            <th style={{ padding: '8px', color: '#aaa', textAlign: 'right' }}>Points</th>
                                            <th style={{ padding: '8px', color: '#aaa', textAlign: 'right' }}>Winnings</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {POY_LEADERBOARD.map((player) => (
                                            <tr key={player.rank} style={{ borderBottom: '1px solid #333' }}>
                                                <td style={{ padding: '8px', color: '#4dabf7' }}>{player.name}</td>
                                                <td style={{ padding: '8px', color: 'white', textAlign: 'right' }}>{player.points}</td>
                                                <td style={{ padding: '8px', color: '#27ae60', textAlign: 'right' }}>{player.winnings}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </aside>
                    </div>
                </main>
            </div>
        </>
    );
}
