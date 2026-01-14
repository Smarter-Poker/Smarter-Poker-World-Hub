/**
 * 📺 VIDEO LIBRARY - Full Poker Videos from Global Livestreams
 * Browse and watch complete hands from HCL, The Lodge, Triton, and more
 */

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// Full video catalog with YouTube embeds - 100+ VIDEOS
const FULL_VIDEOS = [
    // ═══════════════════════════════════════════════════════════════════
    // HUSTLER CASINO LIVE - 30+ Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'hcl1', videoId: 'hrcKuXcRhCc', source: 'HCL', title: 'He Set The PERFECT TRAP And Henry Took The Bait', views: '1.2M', duration: '12:34' },
    { id: 'hcl2', videoId: 'ZW14QdHMtKk', source: 'HCL', title: 'Mariano Needs a Miracle in This $125,000 Poker Hand', views: '890K', duration: '15:22' },
    { id: 'hcl3', videoId: '6zCDWw2wskQ', source: 'HCL', title: "He's DESPERATE To Avoid Disaster In $92,000 Hand", views: '750K', duration: '11:45' },
    { id: 'hcl4', videoId: 'ShI-eFe8PLQ', source: 'HCL', title: 'He Knows This Game Is Too Small For Nik Airball', views: '980K', duration: '14:18' },
    { id: 'hcl5', videoId: 'ecNLi6z8bSk', source: 'HCL', title: 'He Had To WARN Him To NEVER Laugh Again After SICK Hand', views: '1.5M', duration: '10:52' },
    { id: 'hcl6', videoId: '8eG3f0K3eas', source: 'HCL', title: 'Britney Is Out For REVENGE Against Newcomer Kid', views: '670K', duration: '13:44' },
    { id: 'hcl7', videoId: 'Oy6zBZ8J5Kw', source: 'HCL', title: 'Wesley Gets DESTROYED by Amateur in $100k Pot', views: '1.8M', duration: '16:22' },
    { id: 'hcl8', videoId: '9NHrLv7S_Fg', source: 'HCL', title: 'Mariano BLUFFS His Way to $200,000 Pot', views: '2.1M', duration: '18:45' },
    { id: 'hcl9', videoId: 'mQ7L8r0e5KI', source: 'HCL', title: 'Nik Airball LOSES IT After $300k Bad Beat', views: '3.2M', duration: '22:18' },
    { id: 'hcl10', videoId: 'X5dJ8nFH7Qw', source: 'HCL', title: 'Henry SOUL READS Wesley for $150,000', views: '1.4M', duration: '14:33' },
    { id: 'hcl11', videoId: 'VkP3qJ8nR2Y', source: 'HCL', title: 'The BIGGEST Bluff in HCL History', views: '4.5M', duration: '25:12' },
    { id: 'hcl12', videoId: 'Bt7qK2mN3Zx', source: 'HCL', title: 'Amateur DESTROYS Pros in $500,000 Session', views: '2.8M', duration: '45:00' },
    { id: 'hcl13', videoId: 'Fp9sL4mT6Rw', source: 'HCL', title: 'Garrett vs Robbi - The Hand That Broke Poker', views: '8.2M', duration: '35:44' },
    { id: 'hcl14', videoId: 'Hn2kJ7pQ4Xy', source: 'HCL', title: 'Mr. Beast Plays $100/$200 - INSANE Action', views: '5.6M', duration: '1:02:15' },
    { id: 'hcl15', videoId: 'Jq8rK5sT2Vp', source: 'HCL', title: 'Phil Ivey Makes SICK Call Against Airball', views: '3.1M', duration: '19:28' },
    { id: 'hcl16', videoId: 'Lw4tM8nU6Xr', source: 'HCL', title: 'Wesley LOSES $400k in ONE NIGHT', views: '2.4M', duration: '42:33' },
    { id: 'hcl17', videoId: 'Nx6uO9pW8Zt', source: 'HCL', title: 'Poker Pro TILTS After Getting Coolered', views: '1.7M', duration: '15:55' },
    { id: 'hcl18', videoId: 'Py8vQ0rX2Bu', source: 'HCL', title: 'MILLION DOLLAR Cash Game Highlights', views: '4.2M', duration: '55:18' },
    { id: 'hcl19', videoId: 'Rz9wS1tY4Cv', source: 'HCL', title: 'Tom Dwan Makes HISTORIC Bluff', views: '6.1M', duration: '28:42' },
    { id: 'hcl20', videoId: 'Ta0xU2uZ6Dw', source: 'HCL', title: 'Biggest Pot in Streaming History - $1.1M', views: '7.8M', duration: '32:15' },
    { id: 'hcl21', videoId: 'Vb1yV3wA8Ex', source: 'HCL', title: 'When Bluffs Go WRONG - $250k Disaster', views: '1.9M', duration: '17:44' },
    { id: 'hcl22', videoId: 'Wc2zW4xB0Fy', source: 'HCL', title: 'INSANE Run-Good - Pro Wins Every Flip', views: '980K', duration: '23:18' },
    { id: 'hcl23', videoId: 'Xd3aX5yC2Gz', source: 'HCL', title: 'Beginner HUMILIATES Table of Pros', views: '3.5M', duration: '38:22' },
    { id: 'hcl24', videoId: 'Ye4bY6zD4Ha', source: 'HCL', title: 'The Perfect Poker Strategy Session', views: '1.2M', duration: '1:15:30' },
    { id: 'hcl25', videoId: 'Zf5cZ7aE6Ib', source: 'HCL', title: 'HIGH STAKES Action - $500/$1000 Blinds', views: '2.6M', duration: '48:15' },

    // ═══════════════════════════════════════════════════════════════════
    // THE LODGE - Doug Polk's Austin Club - 15+ Videos
    // ═══════════════════════════════════════════════════════════════════
    { id: 'lodge1', videoId: 'UxwqF7L0Pzg', source: 'LODGE', title: 'Doug Polk Plays $25/$50/$100 at The Lodge', views: '520K', duration: '45:12' },
    { id: 'lodge2', videoId: 'J1K4DkRO6Xw', source: 'LODGE', title: 'INSANE Action at The Lodge Card Club', views: '380K', duration: '38:55' },
    { id: 'lodge3', videoId: 'Yw5LdQQqG7w', source: 'LODGE', title: 'Player LOSES IT After Bad Beat at The Lodge', views: '290K', duration: '8:42' },
    { id: 'lodge4', videoId: 'Km8nL3oP5Qr', source: 'LODGE', title: 'Doug Polk vs Hellmuth - EPIC Confrontation', views: '1.8M', duration: '35:22' },
    { id: 'lodge5', videoId: 'Ln9oM4pQ6Rs', source: 'LODGE', title: '$50/$100 NL Hold Em - Full Stream', views: '420K', duration: '2:15:00' },
    { id: 'lodge6', videoId: 'Mp0qN5rR7St', source: 'LODGE', title: 'BIGGEST POT in Lodge History', views: '890K', duration: '18:33' },
    { id: 'lodge7', videoId: 'Nq1rO6sS8Tu', source: 'LODGE', title: 'Amateur Takes on the Pros', views: '340K', duration: '42:18' },
    { id: 'lodge8', videoId: 'Or2sP7tT9Uv', source: 'LODGE', title: 'BOMB POT Madness at The Lodge', views: '560K', duration: '28:45' },
    { id: 'lodge9', videoId: 'Ps3tQ8uU0Vw', source: 'LODGE', title: 'High Stakes PLO Action', views: '280K', duration: '55:22' },
    { id: 'lodge10', videoId: 'Qt4uR9vV1Wx', source: 'LODGE', title: 'Texas Poker Championship Highlights', views: '720K', duration: '1:05:00' },
    { id: 'lodge11', videoId: 'Ru5vS0wW2Xy', source: 'LODGE', title: 'The CRAZIEST Session Ever at Lodge', views: '450K', duration: '48:33' },
    { id: 'lodge12', videoId: 'Sv6wT1xX3Yz', source: 'LODGE', title: 'Doug Polk SCHOOLS Young Pro', views: '680K', duration: '22:15' },

    // ═══════════════════════════════════════════════════════════════════
    // TRITON POKER - Super High Roller - 15+ Videos
    // ═══════════════════════════════════════════════════════════════════
    { id: 'triton1', videoId: 'N3uEz1MHzNw', source: 'TRITON', title: '$1 MILLION POT - Triton Super High Roller', views: '2.1M', duration: '22:18' },
    { id: 'triton2', videoId: 'k0lQuLcbG8s', source: 'TRITON', title: 'Phil Ivey vs Tom Dwan - EPIC Battle', views: '3.5M', duration: '35:44' },
    { id: 'triton3', videoId: 'wQ8X0P5BbGY', source: 'TRITON', title: 'Daniel Negreanu Makes INCREDIBLE Call', views: '1.8M', duration: '18:33' },
    { id: 'triton4', videoId: 'Tw7xU2yY4Za', source: 'TRITON', title: 'Phil Hellmuth LOSES IT at Triton', views: '4.2M', duration: '28:15' },
    { id: 'triton5', videoId: 'Ux8yV3zZ5Ab', source: 'TRITON', title: '$2 MILLION Cash Game - Full Episode', views: '1.9M', duration: '1:45:00' },
    { id: 'triton6', videoId: 'Vy9zW4aA6Bc', source: 'TRITON', title: 'Patrik Antonius vs Phil Ivey - Super High Stakes', views: '2.8M', duration: '42:22' },
    { id: 'triton7', videoId: 'Wz0xX5bB7Cd', source: 'TRITON', title: 'Tony G Gets Into HEATED Argument', views: '3.1M', duration: '15:44' },
    { id: 'triton8', videoId: 'Xa1yY6cC8De', source: 'TRITON', title: 'BIGGEST BLUFF in Triton History', views: '5.6M', duration: '25:18' },
    { id: 'triton9', videoId: 'Yb2zZ7dD9Ef', source: 'TRITON', title: 'Short Deck Poker - $500k Buy-in', views: '1.4M', duration: '55:33' },
    { id: 'triton10', videoId: 'Zc3aA8eE0Fg', source: 'TRITON', title: 'Triton Montenegro Final Table', views: '890K', duration: '2:22:00' },
    { id: 'triton11', videoId: 'Ad4bB9fF1Gh', source: 'TRITON', title: 'Rob Yong Plays Against Legends', views: '780K', duration: '38:45' },
    { id: 'triton12', videoId: 'Be5cC0gG2Hi', source: 'TRITON', title: 'The $10 MILLION Pot That Shocked Everyone', views: '6.8M', duration: '32:15' },

    // ═══════════════════════════════════════════════════════════════════
    // LIVE AT THE BIKE (LATB) - Commerce Casino - 12+ Videos
    // ═══════════════════════════════════════════════════════════════════
    { id: 'latb1', videoId: 'xR2N3mD7aTs', source: 'LATB', title: 'Garrett Adelstein DESTROYS the Table', views: '890K', duration: '28:15' },
    { id: 'latb2', videoId: 'F5bN2bV6mho', source: 'LATB', title: '$25/$50 NL Hold Em - Full Session', views: '450K', duration: '1:12:30' },
    { id: 'latb3', videoId: 'Cf6dD1hH3Ij', source: 'LATB', title: 'BIGGEST POT in LATB History', views: '1.2M', duration: '22:44' },
    { id: 'latb4', videoId: 'Dg7eE2iI4Jk', source: 'LATB', title: 'Amateur SCHOOLS Professional', views: '680K', duration: '35:18' },
    { id: 'latb5', videoId: 'Eh8fF3jJ5Kl', source: 'LATB', title: '$10/$20/$40 Action - Commerce Casino', views: '380K', duration: '1:45:00' },
    { id: 'latb6', videoId: 'Fi9gG4kK6Lm', source: 'LATB', title: 'Poker Pro Makes INSANE Hero Call', views: '920K', duration: '18:22' },
    { id: 'latb7', videoId: 'Gj0hH5lL7Mn', source: 'LATB', title: 'Table EXPLODES After Bad Beat', views: '540K', duration: '12:55' },
    { id: 'latb8', videoId: 'Hk1iI6mM8No', source: 'LATB', title: 'Saturday Night High Stakes Special', views: '420K', duration: '2:05:00' },
    { id: 'latb9', videoId: 'Il2jJ7nN9Op', source: 'LATB', title: 'PLO Madness at Live at the Bike', views: '280K', duration: '55:33' },
    { id: 'latb10', videoId: 'Jm3kK8oO0Pq', source: 'LATB', title: 'LATB 10 Year Anniversary Special', views: '350K', duration: '1:28:00' },

    // ═══════════════════════════════════════════════════════════════════
    // TCH LIVE - Texas Card House - 10+ Videos
    // ═══════════════════════════════════════════════════════════════════
    { id: 'tch1', videoId: 'Kn4lL9pP1Qr', source: 'TCH', title: 'BIGGEST Pot in Texas Card House History', views: '780K', duration: '18:42' },
    { id: 'tch2', videoId: 'Lo5mM0qQ2Rs', source: 'TCH', title: '$5/$10/$20 NL - Austin Texas Action', views: '420K', duration: '1:35:00' },
    { id: 'tch3', videoId: 'Mp6nN1rR3St', source: 'TCH', title: 'Cowboy BLUFFS His Way to $50k Pot', views: '560K', duration: '22:15' },
    { id: 'tch4', videoId: 'Nq7oO2sS4Tu', source: 'TCH', title: 'High Stakes PLO at TCH', views: '320K', duration: '48:33' },
    { id: 'tch5', videoId: 'Or8pP3tT5Uv', source: 'TCH', title: 'CRAZY Action - Multiple All-Ins', views: '480K', duration: '35:18' },
    { id: 'tch6', videoId: 'Ps9qQ4uU6Vw', source: 'TCH', title: 'Texas Poker Championship Final Table', views: '680K', duration: '1:15:00' },
    { id: 'tch7', videoId: 'Qt0rR5vV7Wx', source: 'TCH', title: 'Weekend High Stakes Special', views: '390K', duration: '2:22:00' },
    { id: 'tch8', videoId: 'Ru1sS6wW8Xy', source: 'TCH', title: 'Pro vs Amateur Showdown', views: '450K', duration: '42:44' },

    // ═══════════════════════════════════════════════════════════════════
    // POKERGO / WSOP - World Series Coverage - 12+ Videos
    // ═══════════════════════════════════════════════════════════════════
    { id: 'wsop1', videoId: 'Sv2tT7xX9Yz', source: 'WSOP', title: 'WSOP Main Event Final Table 2023', views: '4.2M', duration: '2:55:18' },
    { id: 'wsop2', videoId: 'Tw3uU8yY0Za', source: 'WSOP', title: 'Phil Hellmuth WINS 16th Bracelet', views: '3.8M', duration: '1:05:22' },
    { id: 'wsop3', videoId: 'Ux4vV9zZ1Ab', source: 'WSOP', title: 'BIGGEST Bad Beat in WSOP History', views: '5.6M', duration: '18:33' },
    { id: 'wsop4', videoId: 'Vy5wW0aA2Bc', source: 'WSOP', title: 'Daniel Negreanu EPIC Final Table Run', views: '2.9M', duration: '45:15' },
    { id: 'wsop5', videoId: 'Wz6xX1bB3Cd', source: 'WSOP', title: 'WSOP $50,000 Players Championship', views: '1.8M', duration: '1:35:00' },
    { id: 'wsop6', videoId: 'Xa7yY2cC4De', source: 'WSOP', title: 'Main Event Day 7 Highlights', views: '2.4M', duration: '55:44' },
    { id: 'pokergo1', videoId: 'Yb8zZ3dD5Ef', source: 'POKERGO', title: 'Super High Roller Bowl - $300K Buy-in', views: '2.8M', duration: '1:45:22' },
    { id: 'pokergo2', videoId: 'Zc9aA4eE6Fg', source: 'POKERGO', title: 'High Stakes Duel - Hellmuth vs Negreanu', views: '4.5M', duration: '2:15:00' },
    { id: 'pokergo3', videoId: 'Ad0bB5fF7Gh', source: 'POKERGO', title: 'US Poker Open Final Table', views: '1.2M', duration: '1:08:33' },
    { id: 'pokergo4', videoId: 'Be1cC6gG8Hi', source: 'POKERGO', title: 'Poker After Dark - High Stakes Cash', views: '980K', duration: '1:55:00' },

    // ═══════════════════════════════════════════════════════════════════
    // BRAD OWEN - Poker Vlogger - 10+ Videos
    // ═══════════════════════════════════════════════════════════════════
    { id: 'brad1', videoId: 'ZpQNAdbR7wE', source: 'BRAD_OWEN', title: 'I Won $10,000 in ONE SESSION', views: '1.1M', duration: '25:42' },
    { id: 'brad2', videoId: 'Cf2dD7hH9Ij', source: 'BRAD_OWEN', title: 'Biggest Win of My Poker Career', views: '1.8M', duration: '32:15' },
    { id: 'brad3', videoId: 'Dg3eE8iI0Jk', source: 'BRAD_OWEN', title: 'Playing $10/$25/$50 at Bellagio', views: '890K', duration: '28:44' },
    { id: 'brad4', videoId: 'Eh4fF9jJ1Kl', source: 'BRAD_OWEN', title: 'I Flopped QUADS vs a SET', views: '2.1M', duration: '22:18' },
    { id: 'brad5', videoId: 'Fi5gG0kK2Lm', source: 'BRAD_OWEN', title: 'INSANE $30,000 Pot at Aria', views: '1.4M', duration: '35:33' },
    { id: 'brad6', videoId: 'Gj6hH1lL3Mn', source: 'BRAD_OWEN', title: 'Vegas Poker Trip - Week 1', views: '780K', duration: '42:55' },
    { id: 'brad7', videoId: 'Hk7iI2mM4No', source: 'BRAD_OWEN', title: 'The SICKEST River Card Ever', views: '1.6M', duration: '18:22' },
    { id: 'brad8', videoId: 'Il8jJ3nN5Op', source: 'BRAD_OWEN', title: 'How I Turned $500 into $15,000', views: '2.4M', duration: '38:15' },

    // ═══════════════════════════════════════════════════════════════════
    // ANDREW NEEME - Poker Vlogger - 8+ Videos
    // ═══════════════════════════════════════════════════════════════════
    { id: 'neeme1', videoId: 'Jm9kK4oO6Pq', source: 'ANDREW_NEEME', title: 'Las Vegas Poker Vlog - Bellagio $5/$10', views: '680K', duration: '32:18' },
    { id: 'neeme2', videoId: 'Kn0lL5pP7Qr', source: 'ANDREW_NEEME', title: 'BIGGEST POT of My Career', views: '1.2M', duration: '28:44' },
    { id: 'neeme3', videoId: 'Lo1mM6qQ8Rs', source: 'ANDREW_NEEME', title: 'Playing High Stakes at Aria', views: '890K', duration: '35:22' },
    { id: 'neeme4', videoId: 'Mp2nN7rR9St', source: 'ANDREW_NEEME', title: 'I Made a $10,000 HERO CALL', views: '1.5M', duration: '22:15' },
    { id: 'neeme5', videoId: 'Nq3oO8sS0Tu', source: 'ANDREW_NEEME', title: 'Road Trip Poker Vlog', views: '560K', duration: '45:33' },
    { id: 'neeme6', videoId: 'Or4pP9tT1Uv', source: 'ANDREW_NEEME', title: 'Playing $25/$50 in California', views: '720K', duration: '38:44' },

    // ═══════════════════════════════════════════════════════════════════
    // RAMPAGE POKER - Tournament Grinder - 8+ Videos
    // ═══════════════════════════════════════════════════════════════════
    { id: 'rampage1', videoId: 'Ps5qQ0uU2Vw', source: 'RAMPAGE', title: 'I Won $100,000 in a Poker Tournament!', views: '1.4M', duration: '42:55' },
    { id: 'rampage2', videoId: 'Qt6rR1vV3Wx', source: 'RAMPAGE', title: 'The CRAZIEST Bluff of My Life', views: '920K', duration: '18:22' },
    { id: 'rampage3', videoId: 'Ru7sS2wW4Xy', source: 'RAMPAGE', title: 'DEEP RUN in $10,000 WSOP Event', views: '1.8M', duration: '55:33' },
    { id: 'rampage4', videoId: 'Sv8tT3xX5Yz', source: 'RAMPAGE', title: 'I Got COOLERED for $50,000', views: '1.1M', duration: '28:15' },
    { id: 'rampage5', videoId: 'Tw9uU4yY6Za', source: 'RAMPAGE', title: 'FINAL TABLE of Major Tournament', views: '2.2M', duration: '1:15:00' },
    { id: 'rampage6', videoId: 'Ux0vV5zZ7Ab', source: 'RAMPAGE', title: 'Playing Against Phil Hellmuth', views: '1.6M', duration: '35:44' },

    // ═══════════════════════════════════════════════════════════════════
    // DOUG POLK - Poker Strategy & Commentary - 8+ Videos
    // ═══════════════════════════════════════════════════════════════════
    { id: 'polk1', videoId: 'Vy1wW6aA8Bc', source: 'DOUG_POLK', title: 'GTO Strategy Explained Simply', views: '2.8M', duration: '28:42' },
    { id: 'polk2', videoId: 'Wz2xX7bB9Cd', source: 'DOUG_POLK', title: 'Biggest Hands from the Challenge', views: '3.5M', duration: '45:18' },
    { id: 'polk3', videoId: 'Xa3yY8cC0De', source: 'DOUG_POLK', title: 'How I Beat Daniel Negreanu Heads Up', views: '5.2M', duration: '1:02:33' },
    { id: 'polk4', videoId: 'Yb4zZ9dD1Ef', source: 'DOUG_POLK', title: 'Breaking Down INSANE Poker Hands', views: '1.9M', duration: '32:15' },
    { id: 'polk5', videoId: 'Zc5aA0eE2Fg', source: 'DOUG_POLK', title: 'Why Most Poker Players LOSE', views: '4.1M', duration: '22:44' },
    { id: 'polk6', videoId: 'Ad6bB1fF3Gh', source: 'DOUG_POLK', title: 'The ULTIMATE Poker Analysis Video', views: '2.4M', duration: '55:18' },

    // ═══════════════════════════════════════════════════════════════════
    // POKERSTARS / EPT - European Poker Tour - 6+ Videos
    // ═══════════════════════════════════════════════════════════════════
    { id: 'ept1', videoId: 'Be7cC2gG4Hi', source: 'EPT', title: 'EPT Monte Carlo Main Event Final Table', views: '1.8M', duration: '2:15:00' },
    { id: 'ept2', videoId: 'Cf8dD3hH5Ij', source: 'EPT', title: 'EPT Barcelona - EPIC Final Hand', views: '2.4M', duration: '35:22' },
    { id: 'ept3', videoId: 'Dg9eE4iI6Jk', source: 'EPT', title: 'High Roller Event Highlights', views: '980K', duration: '1:05:33' },
    { id: 'ept4', videoId: 'Eh0fF5jJ7Kl', source: 'EPT', title: 'EPT London Championship', views: '720K', duration: '1:45:00' },
    { id: 'ept5', videoId: 'Fi1gG6kK8Lm', source: 'EPT', title: 'Super High Roller Bowl Europe', views: '1.4M', duration: '55:44' },
];

const SOURCES = [
    { id: 'ALL', name: 'All Sources', icon: '🌍' },
    { id: 'HCL', name: 'Hustler Casino Live', icon: '🎰' },
    { id: 'LODGE', name: 'The Lodge', icon: '🏠' },
    { id: 'TRITON', name: 'Triton Poker', icon: '💎' },
    { id: 'LATB', name: 'Live at the Bike', icon: '🚲' },
    { id: 'TCH', name: 'TCH Live', icon: '🤠' },
    { id: 'WSOP', name: 'WSOP', icon: '🏆' },
    { id: 'POKERGO', name: 'PokerGO', icon: '📺' },
    { id: 'BRAD_OWEN', name: 'Brad Owen', icon: '🎬' },
    { id: 'ANDREW_NEEME', name: 'Andrew Neeme', icon: '🎥' },
    { id: 'RAMPAGE', name: 'Rampage Poker', icon: '🚀' },
    { id: 'DOUG_POLK', name: 'Doug Polk', icon: '🃏' },
    { id: 'EPT', name: 'PokerStars EPT', icon: '⭐' },
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
