/**
 * 📺 VIDEO LIBRARY - Full Poker Videos from Global Livestreams
 * Browse and watch complete hands from HCL, The Lodge, Triton, and more
 */

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// Full video catalog with YouTube embeds
const FULL_VIDEOS = [
    // ═══════════════════════════════════════════════════════════════════
    // HUSTLER CASINO LIVE - Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'hcl1', videoId: 'hrcKuXcRhCc', source: 'HCL', title: 'He Set The PERFECT TRAP And Henry Took The Bait', views: '1.2M', duration: '12:34', thumbnail: null },
    { id: 'hcl2', videoId: 'ZW14QdHMtKk', source: 'HCL', title: 'Mariano Needs a Miracle in This $125,000 Poker Hand', views: '890K', duration: '15:22', thumbnail: null },
    { id: 'hcl3', videoId: '6zCDWw2wskQ', source: 'HCL', title: "He's DESPERATE To Avoid Disaster In $92,000 Hand", views: '750K', duration: '11:45', thumbnail: null },
    { id: 'hcl4', videoId: 'ShI-eFe8PLQ', source: 'HCL', title: 'He Knows This Game Is Too Small For Nik Airball', views: '980K', duration: '14:18', thumbnail: null },
    { id: 'hcl5', videoId: 'ecNLi6z8bSk', source: 'HCL', title: 'He Had To WARN Him To NEVER Laugh Again After SICK Hand', views: '1.5M', duration: '10:52', thumbnail: null },
    { id: 'hcl6', videoId: '8eG3f0K3eas', source: 'HCL', title: 'Britney Is Out For REVENGE Against Newcomer Kid', views: '670K', duration: '13:44', thumbnail: null },

    // ═══════════════════════════════════════════════════════════════════
    // THE LODGE - Doug Polk's Austin Club
    // ═══════════════════════════════════════════════════════════════════
    { id: 'lodge1', videoId: 'UxwqF7L0Pzg', source: 'LODGE', title: 'Doug Polk Plays $25/$50/$100 at The Lodge', views: '520K', duration: '45:12', thumbnail: null },
    { id: 'lodge2', videoId: 'J1K4DkRO6Xw', source: 'LODGE', title: 'INSANE Action at The Lodge Card Club', views: '380K', duration: '38:55', thumbnail: null },
    { id: 'lodge3', videoId: 'Yw5LdQQqG7w', source: 'LODGE', title: 'Player LOSES IT After Bad Beat at The Lodge', views: '290K', duration: '8:42', thumbnail: null },

    // ═══════════════════════════════════════════════════════════════════
    // TRITON POKER - Super High Roller
    // ═══════════════════════════════════════════════════════════════════
    { id: 'triton1', videoId: 'N3uEz1MHzNw', source: 'TRITON', title: '$1 MILLION POT - Triton Super High Roller', views: '2.1M', duration: '22:18', thumbnail: null },
    { id: 'triton2', videoId: 'k0lQuLcbG8s', source: 'TRITON', title: 'Phil Ivey vs Tom Dwan - EPIC Battle', views: '3.5M', duration: '35:44', thumbnail: null },
    { id: 'triton3', videoId: 'wQ8X0P5BbGY', source: 'TRITON', title: 'Daniel Negreanu Makes INCREDIBLE Call', views: '1.8M', duration: '18:33', thumbnail: null },

    // ═══════════════════════════════════════════════════════════════════
    // LIVE AT THE BIKE - Commerce Casino Classic
    // ═══════════════════════════════════════════════════════════════════
    { id: 'latb1', videoId: 'xR2N3mD7aTs', source: 'LATB', title: 'Garrett Adelstein DESTROYS the Table', views: '890K', duration: '28:15', thumbnail: null },
    { id: 'latb2', videoId: 'F5bN2bV6mho', source: 'LATB', title: '$25/$50 NL Hold\'em - Full Session', views: '450K', duration: '1:12:30', thumbnail: null },

    // ═══════════════════════════════════════════════════════════════════
    // BRAD OWEN & ANDREW NEEME - Vlog Style
    // ═══════════════════════════════════════════════════════════════════
    { id: 'brad1', videoId: 'ZpQNAdbR7wE', source: 'BRAD_OWEN', title: 'I Won $10,000 in ONE SESSION', views: '1.1M', duration: '25:42', thumbnail: null },
    { id: 'neeme1', videoId: 'gI2nL5pM0qX', source: 'ANDREW_NEEME', title: 'Las Vegas Poker Vlog - Bellagio $5/$10', views: '680K', duration: '32:18', thumbnail: null },

    // ═══════════════════════════════════════════════════════════════════
    // RAMPAGE POKER - Tournament Grinder
    // ═══════════════════════════════════════════════════════════════════
    { id: 'rampage1', videoId: 'xK4rT7wE9sQ', source: 'RAMPAGE', title: 'I Won $100,000 in a Poker Tournament!', views: '1.4M', duration: '42:55', thumbnail: null },
    { id: 'rampage2', videoId: 'jL5qO8sP3tA', source: 'RAMPAGE', title: 'The CRAZIEST Bluff of My Life', views: '920K', duration: '18:22', thumbnail: null },

    // ═══════════════════════════════════════════════════════════════════
    // POKERGO / WSOP
    // ═══════════════════════════════════════════════════════════════════
    { id: 'wsop1', videoId: 'Q7cZ4rT8xNm', source: 'WSOP', title: 'WSOP Main Event Final Table Highlights', views: '4.2M', duration: '55:18', thumbnail: null },
    { id: 'pokergo1', videoId: 'pR9sT2wV8xK', source: 'POKERGO', title: 'Super High Roller Bowl - $300K Buy-in', views: '2.8M', duration: '1:05:22', thumbnail: null },
];

const SOURCES = [
    { id: 'ALL', name: 'All Sources', icon: '🌍' },
    { id: 'HCL', name: 'Hustler Casino Live', icon: '🎰' },
    { id: 'LODGE', name: 'The Lodge', icon: '🏠' },
    { id: 'TRITON', name: 'Triton Poker', icon: '💎' },
    { id: 'LATB', name: 'Live at the Bike', icon: '🚲' },
    { id: 'BRAD_OWEN', name: 'Brad Owen', icon: '🎬' },
    { id: 'ANDREW_NEEME', name: 'Andrew Neeme', icon: '🎥' },
    { id: 'RAMPAGE', name: 'Rampage Poker', icon: '🚀' },
    { id: 'WSOP', name: 'WSOP', icon: '🏆' },
    { id: 'POKERGO', name: 'PokerGO', icon: '📺' },
];

const C = {
    bg: '#0a0a0a',
    card: '#1a1a1a',
    cardHover: '#252525',
    text: '#FFFFFF',
    textSec: 'rgba(255,255,255,0.6)',
    border: '#333',
    accent: '#FF4444',
    blue: '#0A84FF',
};

export default function VideoLibraryPage() {
    const [videos, setVideos] = useState(FULL_VIDEOS);
    const [selectedSource, setSelectedSource] = useState('ALL');
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const modalRef = useRef(null);

    // Filter videos
    useEffect(() => {
        let filtered = FULL_VIDEOS;
        if (selectedSource !== 'ALL') {
            filtered = filtered.filter(v => v.source === selectedSource);
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(v =>
                v.title.toLowerCase().includes(q) ||
                v.source.toLowerCase().includes(q)
            );
        }
        setVideos(filtered);
    }, [selectedSource, searchQuery]);

    // Close modal on escape
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') setSelectedVideo(null);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    // Get YouTube thumbnail
    const getThumbnail = (videoId) => `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    return (
        <>
            <Head>
                <title>Video Library | Smarter Poker</title>
                <meta name="description" content="Watch full poker videos from HCL, The Lodge, Triton, and more" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: C.bg,
                padding: '20px',
            }}>
                {/* Header */}
                <div style={{
                    maxWidth: 1400,
                    margin: '0 auto',
                    marginBottom: 24,
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 20,
                    }}>
                        <Link href="/hub" style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            textDecoration: 'none',
                        }}>
                            <span style={{ fontSize: 24 }}>←</span>
                            <h1 style={{
                                color: C.text,
                                fontSize: 28,
                                fontWeight: 700,
                                margin: 0,
                            }}>
                                📺 Video Library
                            </h1>
                        </Link>

                        {/* Search */}
                        <div style={{
                            position: 'relative',
                            width: 300,
                        }}>
                            <input
                                type="text"
                                placeholder="Search videos..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px 12px 44px',
                                    background: C.card,
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 12,
                                    color: C.text,
                                    fontSize: 15,
                                    outline: 'none',
                                }}
                            />
                            <span style={{
                                position: 'absolute',
                                left: 14,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: 18,
                            }}>🔍</span>
                        </div>
                    </div>

                    {/* Source filter pills */}
                    <div style={{
                        display: 'flex',
                        gap: 10,
                        overflowX: 'auto',
                        paddingBottom: 8,
                    }}>
                        {SOURCES.map(source => (
                            <button
                                key={source.id}
                                onClick={() => setSelectedSource(source.id)}
                                style={{
                                    padding: '10px 18px',
                                    background: selectedSource === source.id
                                        ? 'linear-gradient(135deg, #FF4444, #FF6B6B)'
                                        : C.card,
                                    border: `1px solid ${selectedSource === source.id ? 'transparent' : C.border}`,
                                    borderRadius: 20,
                                    color: C.text,
                                    fontSize: 14,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    transition: 'all 0.2s',
                                }}
                            >
                                <span>{source.icon}</span>
                                {source.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Video Grid */}
                <div style={{
                    maxWidth: 1400,
                    margin: '0 auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: 20,
                }}>
                    {videos.map(video => (
                        <div
                            key={video.id}
                            onClick={() => setSelectedVideo(video)}
                            style={{
                                background: C.card,
                                borderRadius: 16,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                border: `1px solid ${C.border}`,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-4px)';
                                e.currentTarget.style.boxShadow = '0 12px 40px rgba(255,68,68,0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            {/* Thumbnail */}
                            <div style={{
                                position: 'relative',
                                aspectRatio: '16/9',
                                background: '#222',
                            }}>
                                <img
                                    src={getThumbnail(video.videoId)}
                                    alt={video.title}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                    }}
                                    onError={(e) => {
                                        e.target.src = `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`;
                                    }}
                                />
                                {/* Duration badge */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: 8,
                                    right: 8,
                                    background: 'rgba(0,0,0,0.8)',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: 'white',
                                }}>
                                    {video.duration}
                                </div>
                                {/* Play button overlay */}
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: 64,
                                    height: 64,
                                    background: 'rgba(255,68,68,0.9)',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: 0,
                                    transition: 'opacity 0.2s',
                                }}
                                    className="play-btn"
                                >
                                    <span style={{ fontSize: 28, marginLeft: 4 }}>▶</span>
                                </div>
                            </div>

                            {/* Info */}
                            <div style={{ padding: 16 }}>
                                <h3 style={{
                                    color: C.text,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    margin: 0,
                                    marginBottom: 8,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    lineHeight: 1.4,
                                }}>
                                    {video.title}
                                </h3>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <span style={{
                                        color: C.accent,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        background: 'rgba(255,68,68,0.15)',
                                        padding: '4px 10px',
                                        borderRadius: 12,
                                    }}>
                                        {SOURCES.find(s => s.id === video.source)?.icon} {video.source.replace('_', ' ')}
                                    </span>
                                    <span style={{
                                        color: C.textSec,
                                        fontSize: 13,
                                    }}>
                                        {video.views} views
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* No results */}
                {videos.length === 0 && (
                    <div style={{
                        textAlign: 'center',
                        padding: '80px 20px',
                        color: C.textSec,
                    }}>
                        <div style={{ fontSize: 64, marginBottom: 16 }}>🎬</div>
                        <h3 style={{ color: C.text, marginBottom: 8 }}>No videos found</h3>
                        <p>Try adjusting your search or filter</p>
                    </div>
                )}

                {/* Video count */}
                <div style={{
                    maxWidth: 1400,
                    margin: '30px auto 0',
                    textAlign: 'center',
                    color: C.textSec,
                    fontSize: 14,
                }}>
                    Showing {videos.length} of {FULL_VIDEOS.length} videos
                </div>
            </div>

            {/* Video Modal */}
            {selectedVideo && (
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setSelectedVideo(null);
                    }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: '#000',
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {/* Close button - always visible */}
                    <button
                        onClick={() => setSelectedVideo(null)}
                        style={{
                            position: 'absolute',
                            top: 16,
                            right: 16,
                            width: 48,
                            height: 48,
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            borderRadius: '50%',
                            color: 'white',
                            fontSize: 24,
                            cursor: 'pointer',
                            zIndex: 1001,
                            backdropFilter: 'blur(10px)',
                        }}
                    >✕</button>

                    {/* Fullscreen YouTube embed */}
                    <div style={{
                        flex: 1,
                        width: '100%',
                        height: '100%',
                    }}>
                        <iframe
                            src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                            title={selectedVideo.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                            allowFullScreen
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                            }}
                        />
                    </div>

                    {/* Video info bar at bottom */}
                    <div style={{
                        padding: '16px 24px',
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.95))',
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                    }}>
                        <h2 style={{
                            color: 'white',
                            fontSize: 18,
                            fontWeight: 700,
                            margin: 0,
                            marginBottom: 8,
                        }}>
                            {selectedVideo.title}
                        </h2>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                        }}>
                            <span style={{
                                color: C.accent,
                                fontSize: 13,
                                fontWeight: 600,
                                background: 'rgba(255,68,68,0.2)',
                                padding: '4px 12px',
                                borderRadius: 12,
                            }}>
                                {SOURCES.find(s => s.id === selectedVideo.source)?.icon} {selectedVideo.source.replace('_', ' ')}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                                {selectedVideo.views} views
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                                {selectedVideo.duration}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* CSS for hover effects */}
            <style jsx global>{`
                div:hover .play-btn {
                    opacity: 1 !important;
                }
            `}</style>
        </>
    );
}
