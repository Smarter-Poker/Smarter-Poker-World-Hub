/**
 * 🎰 FACEBOOK-STYLE GROUP/CLUB VIEW
 * src/app/social/views/FacebookClubView.jsx
 * 
 * Club page with Discussion, Events, Members, and Poker Leaderboards
 * Connected to SocialService
 */

import React, { useState, useEffect } from 'react';
import { CreatePostBox, FBPostCard, FBAvatar, FB_COLORS } from '../components/FacebookStyleCard';
import { PokerTierBadge, WinRateDisplay } from '../components/PokerReputationBadges';
import { useSocialOrb } from '../../providers/SocialOrbProvider';
import { useSupabase } from '../../providers/SupabaseProvider';

// ═══════════════════════════════════════════════════════════════════════════
// 🏆 CLUB LEADERBOARD COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const ClubLeaderboardRow = ({ rank, user, stats }) => (
    <div className={`leaderboard-row rank-${rank}`}>
        <div className="rank-cell">
            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
        </div>

        <div className="user-cell">
            <FBAvatar src={user.avatar} size={40} />
            <div className="user-info">
                <span className="user-name">{user.name}</span>
                <PokerTierBadge tier={user.tier} size="xs" showLabel={false} />
            </div>
        </div>

        <div className="stat-cell primary">
            ${stats.profit?.toLocaleString()}
        </div>

        <div className="stat-cell">
            <span className={`winrate ${stats.bb100 >= 0 ? 'pos' : 'neg'}`}>
                {stats.bb100} bb/100
            </span>
        </div>

        <div className="stat-cell secondary">
            {stats.hands?.toLocaleString()} hands
        </div>

        <style>{`
            .leaderboard-row {
                display: grid;
                grid-template-columns: 48px 2fr 1fr 1fr 1fr;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid ${FB_COLORS.divider};
            }

            .leaderboard-row:hover {
                background: ${FB_COLORS.bgHover};
            }

            .rank-cell {
                font-weight: 700;
                font-size: 16px;
                color: ${FB_COLORS.textSecondary};
            }

            .rank-1 .rank-cell { font-size: 24px; }

            .user-cell {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .user-name {
                display: block;
                font-weight: 600;
                color: ${FB_COLORS.textPrimary};
                font-size: 15px;
            }

            .stat-cell {
                font-size: 15px;
                color: ${FB_COLORS.textPrimary};
                text-align: right;
            }

            .stat-cell.primary {
                font-weight: 700;
                color: #22C55E;
            }

            .stat-cell.secondary {
                color: ${FB_COLORS.textSecondary};
                font-size: 13px;
            }

            .winrate.pos { color: #22C55E; }
            .winrate.neg { color: #EF4444; }
        `}</style>
    </div>
);

const ClubLeaderboard = ({ data = [] }) => (
    <div className="club-leaderboard">
        <div className="lb-header">
            <h3>Weekly Grinders</h3>
            <div className="lb-filters">
                <button className="active">This Week</button>
                <button>All Time</button>
            </div>
        </div>

        <div className="lb-columns">
            <span>Rank</span>
            <span>Player</span>
            <span className="align-right">Profit</span>
            <span className="align-right">BB/100</span>
            <span className="align-right">Volume</span>
        </div>

        <div className="lb-list">
            {data.map((entry, i) => (
                <ClubLeaderboardRow
                    key={i}
                    rank={i + 1}
                    user={entry.user}
                    stats={entry.stats}
                />
            ))}
        </div>

        <style>{`
            .club-leaderboard {
                background: ${FB_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                margin-bottom: 24px;
            }

            .lb-header {
                padding: 16px;
                border-bottom: 1px solid ${FB_COLORS.divider};
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .lb-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 700;
                color: ${FB_COLORS.textPrimary};
            }

            .lb-filters button {
                border: none;
                background: none;
                padding: 8px 12px;
                font-weight: 600;
                color: ${FB_COLORS.textSecondary};
                cursor: pointer;
                border-radius: 6px;
            }

            .lb-filters button.active {
                background: ${FB_COLORS.bgMain};
                color: ${FB_COLORS.blue};
            }

            .lb-columns {
                display: grid;
                grid-template-columns: 48px 2fr 1fr 1fr 1fr;
                padding: 8px 16px;
                background: ${FB_COLORS.bgMain};
                font-size: 12px;
                font-weight: 600;
                color: ${FB_COLORS.textSecondary};
                text-transform: uppercase;
            }
            
            .align-right { text-align: right; }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📅 EVENT CARD
// ═══════════════════════════════════════════════════════════════════════════

const ClubEventCard = ({ event }) => (
    <div className="event-card">
        <div className="event-date">
            <span className="month">{event.month}</span>
            <span className="day">{event.day}</span>
        </div>

        <div className="event-details">
            <h4 className="event-title">{event.title}</h4>
            <span className="event-time">{event.time}</span>
            <span className="event-location">{event.location}</span>
            <div className="event-attendees">
                {event.attendeesCount} going · {event.interestedCount} interested
            </div>
        </div>

        <div className="event-actions">
            <button className="btn-interest">★ Interested</button>
            <button className="btn-share">↗️</button>
        </div>

        <style>{`
            .event-card {
                display: flex;
                gap: 16px;
                padding: 16px;
                background: ${FB_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                margin-bottom: 12px;
            }

            .event-date {
                display: flex;
                flex-direction: column;
                align-items: center;
                background: ${FB_COLORS.bgWhite};
                padding: 8px;
                border-radius: 8px;
                box-shadow: 0 0 0 1px ${FB_COLORS.divider};
                width: 60px;
                height: 60px;
            }

            .month {
                color: #E41E3F;
                font-weight: 700;
                font-size: 13px;
                text-transform: uppercase;
            }

            .day {
                font-size: 24px;
                font-weight: 700;
                color: ${FB_COLORS.textPrimary};
            }

            .event-details {
                flex: 1;
            }

            .event-title {
                margin: 0 0 4px;
                font-size: 17px;
                color: ${FB_COLORS.textPrimary};
            }

            .event-time, .event-location {
                display: block;
                font-size: 14px;
                color: ${FB_COLORS.textSecondary};
                margin-bottom: 2px;
            }

            .event-attendees {
                font-size: 13px;
                color: ${FB_COLORS.textSecondary};
                margin-top: 4px;
            }

            .event-actions {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .btn-interest {
                padding: 8px 16px;
                background: ${FB_COLORS.bgMain};
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
            }

            .btn-interest:hover { background: ${FB_COLORS.bgHover}; }
            
            .btn-share {
                padding: 8px;
                background: ${FB_COLORS.bgMain};
                border: none;
                border-radius: 6px;
                cursor: pointer;
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 🃏 CLUB HEADER
// ═══════════════════════════════════════════════════════════════════════════

const ClubHeader = ({ club, isMember = false }) => (
    <div className="club-header">
        <div className="club-cover">
            <img src={club.coverPhoto || 'https://picsum.photos/1200/400'} alt="" />
        </div>

        <div className="club-info-container">
            <h1 className="club-name">{club.name}</h1>
            <div className="club-meta">
                <span>🔒 Private Group</span>
                <span>·</span>
                <span>{club.membersCount?.toLocaleString()} members</span>
                <span>·</span>
                <span className="club-level">{club.level || 'Diamond Club'} 💎</span>
            </div>

            <div className="member-avatars">
                {club.topMembers?.slice(0, 8).map((m, i) => (
                    <FBAvatar key={i} src={m.avatar} size={32} />
                ))}
            </div>

            <div className="club-actions">
                <button className={`btn-join ${isMember ? 'joined' : ''}`}>
                    {isMember ? '✓ Joined' : '+ Join Group'}
                </button>
                <button className="btn-invite">+ Invite</button>
                <button className="btn-dots">⋯</button>
            </div>
        </div>

        <nav className="club-nav">
            <a href="#discussion" className="active">Discussion</a>
            <a href="#leaderboard">Leaderboard</a>
            <a href="#featured">Featured</a>
            <a href="#events">Events</a>
            <a href="#media">Media</a>
            <a href="#files">Files</a>
        </nav>

        <style>{`
            .club-header {
                background: ${FB_COLORS.bgWhite};
                margin-bottom: 16px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }

            .club-cover {
                height: 350px;
                overflow: hidden;
                border-radius: 0 0 8px 8px;
            }

            .club-cover img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .club-info-container {
                padding: 24px 32px;
                max-width: 1100px;
                margin: 0 auto;
            }

            .club-name {
                font-size: 32px;
                font-weight: 800;
                color: ${FB_COLORS.textPrimary};
                margin: 0 0 8px;
            }

            .club-meta {
                display: flex;
                gap: 8px;
                font-size: 15px;
                color: ${FB_COLORS.textSecondary};
                margin-bottom: 16px;
                align-items: center;
            }

            .club-level {
                color: #FFD700;
                font-weight: 600;
                background: rgba(255, 215, 0, 0.1);
                padding: 2px 8px;
                border-radius: 12px;
            }

            .member-avatars {
                display: flex;
                margin-bottom: 24px;
            }
            .member-avatars > div {
                margin-left: -8px;
                border: 2px solid ${FB_COLORS.bgWhite};
            }
            .member-avatars > div:first-child { margin-left: 0; }

            .club-actions {
                display: flex;
                gap: 8px;
            }

            .btn-join {
                padding: 0 32px;
                height: 36px;
                background: ${FB_COLORS.blue};
                color: white;
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
            }

            .btn-join.joined {
                background: ${FB_COLORS.bgMain};
                color: ${FB_COLORS.textPrimary};
            }

            .btn-invite {
                padding: 0 16px;
                height: 36px;
                background: ${FB_COLORS.blueLight};
                color: ${FB_COLORS.blue};
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
            }

            .btn-dots {
                width: 36px;
                height: 36px;
                background: ${FB_COLORS.bgMain};
                border: none;
                border-radius: 6px;
                cursor: pointer;
            }

            .club-nav {
                display: flex;
                gap: 4px;
                padding: 0 32px;
                border-top: 1px solid ${FB_COLORS.divider};
                max-width: 1100px;
                margin: 0 auto;
            }

            .club-nav a {
                padding: 16px;
                color: ${FB_COLORS.textSecondary};
                text-decoration: none;
                font-weight: 600;
                font-size: 15px;
                position: relative;
            }

            .club-nav a:hover {
                background: ${FB_COLORS.bgHover};
                border-radius: 6px 6px 0 0;
            }

            .club-nav a.active {
                color: ${FB_COLORS.blue};
            }

            .club-nav a.active::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: ${FB_COLORS.blue};
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 🎰 MAIN CLUB VIEW
// ═══════════════════════════════════════════════════════════════════════════

export const FacebookClubView = ({ onNavigate }) => {
    // Hooks
    const { socialService } = useSocialOrb();
    const { user: authUser, profile: authProfile } = useSupabase(); // Get real user

    // Construct currentUser object for UI
    const currentUser = authUser ? {
        id: authUser.id,
        name: authProfile?.username || authUser.email,
        avatar: authProfile?.avatar_url || 'https://picsum.photos/100/100',
        online: true
    } : null;

    const [loading, setLoading] = useState(true);

    // Mock Data (Would come from getClub(s))
    const club = {
        name: "Las Vegas $5/$10 Grinders",
        membersCount: 12450,
        level: "Diamond Club",
        coverPhoto: "https://picsum.photos/1200/400?poker",
        topMembers: [
            { avatar: 'https://picsum.photos/100/100?1' },
            { avatar: 'https://picsum.photos/100/100?2' },
            { avatar: 'https://picsum.photos/100/100?3' }
        ]
    };

    const leaderboard = [
        { user: { name: 'Mike Shark', avatar: '', tier: 'shark' }, stats: { profit: 12500, bb100: 12.5, hands: 15000 } },
        { user: { name: 'Sarah GTO', avatar: '', tier: 'gto_master' }, stats: { profit: 8900, bb100: 9.2, hands: 22000 } },
        { user: { name: 'Tom Durrr', avatar: '', tier: 'whale' }, stats: { profit: -4500, bb100: -5.4, hands: 8000 } }
    ];

    const events = [
        { month: 'JAN', day: '15', title: '$10k GTD Monthly Deepstack', time: 'SAT AT 2 PM', location: 'Aria Poker Room', attendeesCount: 145, interestedCount: 302 },
        { month: 'JAN', day: '22', title: 'PLO Strategy Workshop', time: 'SAT AT 6 PM', location: 'Online Zoom', attendeesCount: 45, interestedCount: 120 }
    ];

    const posts = [
        {
            id: 1,
            user: { name: 'Club Admin', isVerified: true },
            text: "Welcome to the new weekly leaderboard! Top 3 grinders get a free month of GTO Training access. 🚀",
            createdAt: '2h ago',
            likeCount: 45,
            commentCount: 12
        }
    ];

    useEffect(() => {
        // Mock loading simulation
        setTimeout(() => setLoading(false), 500);
    }, []);

    return (
        <div className="club-page">
            <ClubHeader club={club} isMember={true} />

            <div className="club-content">
                {/* Left Rail (Main Content) */}
                <div className="club-main">
                    <CreatePostBox user={currentUser} placeholder="Write something..." />

                    <ClubLeaderboard data={leaderboard} />

                    {posts.map(post => (
                        <FBPostCard key={post.id} post={post} user={post.user} />
                    ))}
                </div>

                {/* Right Rail (Sidebar) */}
                <div className="club-sidebar">
                    <div className="sidebar-card">
                        <h3>About</h3>
                        <p>Official community for Las Vegas $5/$10 NLH players. Share hands, discuss strategy, and organize home games.</p>
                        <div className="security-check">
                            <span>🔒</span> Private · Only members can see who's in the group and what they post.
                        </div>
                    </div>

                    <div className="sidebar-card">
                        <h3>Upcoming Events</h3>
                        {events.map((e, i) => (
                            <ClubEventCard key={i} event={e} />
                        ))}
                        <button className="btn-see-all">See All</button>
                    </div>
                </div>
            </div>

            <style>{`
                .club-content {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 0 16px;
                    display: grid;
                    grid-template-columns: 2fr 1fr;
                    gap: 16px;
                }

                .club-sidebar {
                    position: sticky;
                    top: 72px;
                    height: fit-content;
                }

                .sidebar-card {
                    background: ${FB_COLORS.bgWhite};
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }

                .sidebar-card h3 {
                    margin: 0 0 12px;
                    font-size: 17px;
                    font-weight: 600;
                    color: ${FB_COLORS.textPrimary};
                }

                .sidebar-card p {
                    font-size: 15px;
                    color: ${FB_COLORS.textPrimary};
                    line-height: 1.4;
                    margin-bottom: 12px;
                }

                .security-check {
                    display: flex;
                    gap: 8px;
                    font-size: 13px;
                    color: ${FB_COLORS.textSecondary};
                }

                .btn-see-all {
                    width: 100%;
                    padding: 8px;
                    background: ${FB_COLORS.bgMain};
                    border: none;
                    border-radius: 6px;
                    font-weight: 600;
                    cursor: pointer;
                    color: ${FB_COLORS.textPrimary};
                }

                @media (max-width: 900px) {
                    .club-content { grid-template-columns: 1fr; }
                    .club-sidebar { order: -1; }
                }
            `}</style>
        </div>
    );
};

export default FacebookClubView;
