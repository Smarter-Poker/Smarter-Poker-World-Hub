/**
 * VIDEO LIBRARY - Full Poker Videos from Global Livestreams
 * Browse and watch complete hands from HCL, The Lodge, Triton, and more
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Image from 'next/image';
import confetti from 'canvas-confetti';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { useAvatar } from '../../src/contexts/AvatarContext';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getVideoLibraryPreferences, updateVideoLibraryPreferences } from '../../src/services/videoLibraryPreferences';
import { getVideoFavorites, addVideoFavorite, removeVideoFavorite } from '../../src/services/videoFavorites';
import { getWatchLater, addToWatchLater, removeFromWatchLater } from '../../src/services/videoWatchLater';
import { updateWatchDuration, getWatchedVideos, getWatchProgress, getRecentlyWatched, getWatchStats } from '../../src/services/videoWatchHistory';

// God-Mode Stack
import { useVideoLibraryStore } from '../../src/stores/videoLibraryStore';
import PageTransition from '../../src/components/transitions/PageTransition';

// Full video catalog with YouTube embeds - 138 VIDEOS (96 cash + 42 tournaments)
const FULL_VIDEOS = [
    // ═══════════════════════════════════════════════════════════════════
    // HUSTLER CASINO LIVE - 28 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'hcl1', videoId: 'D5R_ZQZDR1Q', source: 'HCL', type: 'cash', title: 'Doug Polk Goes FULL DEGEN in LA Poker Game!', views: '1.2M', duration: '18:34' },
    { id: 'hcl2', videoId: 'bjSK8Ajhm2g', source: 'HCL', type: 'cash', title: 'Jungleman & Senor Tilt Attempt to BLUFF Mariano', views: '890K', duration: '15:22' },
    { id: 'hcl3', videoId: 'fif_M-C7uxM', source: 'HCL', type: 'cash', title: 'Jungleman Makes 3 IMPOSSIBLE HERO CALLS in 1 Game!', views: '750K', duration: '14:45' },
    { id: 'hcl4', videoId: '4ErqhJMdTqE', source: 'HCL', type: 'cash', title: 'Nik Airball RUNS OVER The Table & Wins All The Money', views: '980K', duration: '16:18' },
    { id: 'hcl5', videoId: '2aaQ8D5mQiQ', source: 'HCL', type: 'cash', title: 'Top 10 Hands of 2025', views: '1.5M', duration: '22:52' },
    { id: 'hcl6', videoId: 'Tvt3ib08foo', source: 'HCL', type: 'cash', title: 'Top 10 Biggest Pots of 2025', views: '1.8M', duration: '25:44' },
    { id: 'hcl7', videoId: 'TKuwraMHM4s', source: 'HCL', type: 'cash', title: 'Martin Kabrhel is the ULTIMATE TROLL with Jack Five', views: '670K', duration: '13:22' },
    { id: 'hcl8', videoId: 'wMpb2U4bogY', source: 'HCL', type: 'cash', title: 'JBoogs Activates FULL TILT & Cannot Comprehend Runout!', views: '2.1M', duration: '18:45' },
    { id: 'hcl9', videoId: 'hJkpOdcC9b4', source: 'HCL', type: 'cash', title: 'Alan Keating Terrorizes Senor Tilt in 3 MASSIVE Pots', views: '3.2M', duration: '22:18' },
    { id: 'hcl10', videoId: 'q-LPKh4BcDU', source: 'HCL', type: 'cash', title: 'Martin Kabrhel Plays a $1.5M Pot vs Senor Tilt', views: '2.4M', duration: '19:33' },
    { id: 'hcl11', videoId: '7fe18ZyRR3o', source: 'HCL', type: 'cash', title: 'Nik Airball Biggest Win of All Time | $1.3 MILLION', views: '4.5M', duration: '28:12' },
    { id: 'hcl12', videoId: '9BHqoXOGwqo', source: 'HCL', type: 'cash', title: 'How Brandon Steven Lost $2 MILLION in Million Dollar Marathon', views: '2.8M', duration: '24:45' },
    { id: 'hcl13', videoId: 'ZXBCQHCcQDQ', source: 'HCL', type: 'cash', title: 'The Most INSANE Tank in Poker History', views: '1.9M', duration: '16:33' },
    { id: 'hcl14', videoId: 'Z54GrBrtjEY', source: 'HCL', type: 'cash', title: 'Can Alan Keating Hero Call vs MASSIVE Bluff From Peter?!', views: '1.6M', duration: '14:22' },
    { id: 'hcl15', videoId: 'BBiMGvjyjfc', source: 'HCL', type: 'cash', title: 'Alan Keating Plays $2.1M Pot vs Martin Kabrhel', views: '3.8M', duration: '26:18' },
    { id: 'hcl16', videoId: 'XWNNilCpZDs', source: 'HCL', type: 'cash', title: 'Senor Tilt Gets Owned by Mariano in INSANE HAND', views: '1.4M', duration: '15:44' },
    { id: 'hcl17', videoId: 'd-MMWutIvhQ', source: 'HCL', type: 'cash', title: 'QUADS vs STRAIGHT FLUSH! Craziest Hand in HCL HISTORY!', views: '5.2M', duration: '18:55' },
    { id: 'hcl18', videoId: 'nIkqI5ERmoQ', source: 'HCL', type: 'cash', title: 'Mariano & Henry Meet in a NASTY COOLER Situation', views: '920K', duration: '13:22' },
    { id: 'hcl19', videoId: 'yPmtNaw_AZo', source: 'HCL', type: 'cash', title: 'Mariano Wants to Make an INSANE HERO CALL', views: '780K', duration: '12:18' },
    { id: 'hcl20', videoId: 'PjrbLrCDBNQ', source: 'HCL', type: 'cash', title: 'Doug Polk Plays a $686K Pot vs Nik Airball', views: '2.3M', duration: '20:33' },
    { id: 'hcl21', videoId: '2JLbcXyse1I', source: 'HCL', type: 'cash', title: 'Two of the MOST INSANE Hands in HCL History!!', views: '1.7M', duration: '17:44' },
    { id: 'hcl22', videoId: 'kujjBSyB4Dk', source: 'HCL', type: 'cash', title: 'The Biggest Pot in Max Pain Monday History', views: '1.1M', duration: '14:22' },
    { id: 'hcl23', videoId: 'OiLx18q92uM', source: 'HCL', type: 'cash', title: 'STRAIGHT FLUSH vs NUT FLUSH He Cannot Believe His Luck!', views: '2.9M', duration: '16:55' },
    { id: 'hcl24', videoId: 'TSVNEFxZ4D0', source: 'HCL', type: 'cash', title: 'Can Mariano HERO CALL vs Gigantic Bluff From Peter?', views: '850K', duration: '13:18' },
    { id: 'hcl25', videoId: '8ZIrPIbvCyA', source: 'HCL', type: 'cash', title: 'Nik Airball SLOWROLLS Martin Kabrhel in a $401K Pot', views: '1.5M', duration: '15:44' },
    { id: 'hcl26', videoId: 'fuZU0SF5uy4', source: 'HCL', type: 'cash', title: 'SET OVER SET...Nik Airball Plays a $468K Pot', views: '1.8M', duration: '17:22' },
    { id: 'hcl27', videoId: 'V_A47QWTN98', source: 'HCL', type: 'cash', title: 'Martin Kabrhel Runs ACE HIGH BLUFF in $380K Pot!', views: '1.3M', duration: '14:55' },
    { id: 'hcl28', videoId: 'FCHdw4wyrhI', source: 'HCL', type: 'cash', title: 'Senor Tilt Plays CRAZY Hand After CRAZY Hand', views: '990K', duration: '16:33' },

    // ═══════════════════════════════════════════════════════════════════
    // THE LODGE LIVE - 20 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'lodge1', videoId: 'yJZxw9u7_DU', source: 'LODGE', type: 'cash', title: 'Craziest Straight Flushes of 2025', views: '680K', duration: '18:22' },
    { id: 'lodge2', videoId: 'yIZcxafGzXQ', source: 'LODGE', type: 'cash', title: 'STRAIGHT FLUSH! QUADS! Insane Poker Game!', views: '920K', duration: '22:15' },
    { id: 'lodge3', videoId: '9ZjGeSFzCgE', source: 'LODGE', type: 'cash', title: 'POCKET ACES For $36,185', views: '540K', duration: '14:33' },
    { id: 'lodge4', videoId: 'hpcKG_xl16c', source: 'LODGE', type: 'cash', title: '25 Minutes of Amazing Xuan Liu Moments', views: '780K', duration: '25:00' },
    { id: 'lodge5', videoId: '6I10JPRg-XM', source: 'LODGE', type: 'cash', title: 'MASSIVE Pot With Ace-King!', views: '450K', duration: '12:18' },
    { id: 'lodge6', videoId: 'fHbEUDTuT68', source: 'LODGE', type: 'cash', title: '7 Best Quad Moments', views: '890K', duration: '16:44' },
    { id: 'lodge7', videoId: 'jQjuBFFbGbo', source: 'LODGE', type: 'cash', title: 'She Has Pocket Aces, But...', views: '620K', duration: '11:55' },
    { id: 'lodge8', videoId: 'JycXMxdnk2M', source: 'LODGE', type: 'cash', title: 'Corey Eyring Had a Terrible Day', views: '380K', duration: '15:22' },
    { id: 'lodge9', videoId: 'PA8XtrwroQ8', source: 'LODGE', type: 'cash', title: '10 Biggest Poker Hands of 2025', views: '1.2M', duration: '28:45' },
    { id: 'lodge10', videoId: 'favMEUKGNKc', source: 'LODGE', type: 'cash', title: 'Biggest Pots From Wild Cash Game', views: '560K', duration: '19:33' },
    { id: 'lodge11', videoId: 'hBo4-DsVx5A', source: 'LODGE', type: 'cash', title: 'ROYAL FLUSH Draw For Jenny', views: '720K', duration: '13:18' },
    { id: 'lodge12', videoId: 'liWPL5KvURk', source: 'LODGE', type: 'cash', title: 'Corey Eyring Always Wins', views: '340K', duration: '14:55' },
    { id: 'lodge13', videoId: 'GIKWvbclg7I', source: 'LODGE', type: 'cash', title: 'FULL HOUSE vs FLUSH vs TWO PAIR! Unreal Poker Hand', views: '480K', duration: '11:22' },
    { id: 'lodge14', videoId: 's8waPVJwsZU', source: 'LODGE', type: 'cash', title: 'BIGGEST POTS OF 2025', views: '950K', duration: '24:18' },
    { id: 'lodge15', videoId: 'cYbuojMWC-8', source: 'LODGE', type: 'cash', title: 'SET OVER SET! Corey Eyring vs Poker Bunny', views: '1.1M', duration: '16:44' },
    { id: 'lodge16', videoId: '0UFWJNZ1eZ0', source: 'LODGE', type: 'cash', title: 'Wow! Genuinely Bad Beat', views: '420K', duration: '10:55' },
    { id: 'lodge17', videoId: 'FqiS7LaQSsg', source: 'LODGE', type: 'cash', title: 'She is ALL-IN 6 Times In One Game', views: '580K', duration: '18:22' },
    { id: 'lodge18', videoId: 'pqP_8xMOezc', source: 'LODGE', type: 'cash', title: 'Nightmare Day for Corey Eyring', views: '390K', duration: '15:33' },
    { id: 'lodge19', videoId: 'ckArt7M5hbs', source: 'LODGE', type: 'cash', title: 'Luckiest Poker Moments Ever', views: '850K', duration: '20:18' },
    { id: 'lodge20', videoId: 'vWVwhXeILoX', source: 'LODGE', type: 'cash', title: '2 Royal Flushes Caught on Video', views: '1.4M', duration: '12:44' },

    // ═══════════════════════════════════════════════════════════════════
    // TRITON POKER - 20 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'triton1', videoId: '524_3UypGkU', source: 'TRITON', type: 'tournament', title: '$150K NLH 8-Handed Final Table Highlights', views: '1.2M', duration: '32:18' },
    { id: 'triton2', videoId: '185vMNh9ECc', source: 'TRITON', type: 'tournament', title: '$150K NLH 8-Handed Final Table', views: '890K', duration: '45:22' },
    { id: 'triton3', videoId: '5wTToeCyu6I', source: 'TRITON', type: 'tournament', title: '$100K NLH Main Event Final Table Highlights', views: '1.5M', duration: '38:45' },
    { id: 'triton4', videoId: 'CbXDixknmeM', source: 'TRITON', type: 'tournament', title: '$100K NLH Main Event Final Table', views: '980K', duration: '52:18' },
    { id: 'triton5', videoId: '4441ee7htt0', source: 'TRITON', type: 'tournament', title: '$125K NLH 7-Handed Final Table Highlights', views: '720K', duration: '28:33' },
    { id: 'triton6', videoId: 'LA4z0Hi0Jf8', source: 'TRITON', type: 'tournament', title: '$125K NLH 7-Handed Final Table', views: '650K', duration: '48:44' },
    { id: 'triton7', videoId: 'jJeZntAfOp4', source: 'TRITON', type: 'tournament', title: '10 Years of Triton Poker | 2026 Gets Bigger', views: '340K', duration: '15:22' },
    { id: 'triton8', videoId: 'pFbHkHhJO4Y', source: 'TRITON', type: 'tournament', title: '$250K NLH Triton Invitational Final Table Highlights', views: '1.8M', duration: '35:18' },
    { id: 'triton9', videoId: 'KQRZs6ytdWc', source: 'TRITON', type: 'tournament', title: '$250K NLH Triton Invitational Final Table', views: '1.1M', duration: '58:44' },
    { id: 'triton10', videoId: 'fzNt4SdBGuQ', source: 'TRITON', type: 'tournament', title: '$100K PLO Main Event Final Table Highlights', views: '680K', duration: '30:22' },
    { id: 'triton11', videoId: '-rjQT0JOhGA', source: 'TRITON', type: 'tournament', title: '$100K PLO Main Event Final Table', views: '520K', duration: '55:33' },
    { id: 'triton12', videoId: 'oINUSqHq_ck', source: 'TRITON', type: 'tournament', title: '$75K PLO 6-Handed Final Table Highlights', views: '450K', duration: '26:18' },
    { id: 'triton13', videoId: 'TXarmUgk02Q', source: 'TRITON', type: 'tournament', title: '$75K PLO 6-Handed Final Table', views: '380K', duration: '48:44' },
    { id: 'triton14', videoId: 'RpU9bwH-2WI', source: 'TRITON', type: 'tournament', title: 'Largest Poker Pot Ever: Ossi Ketola vs Alex Foxen!', views: '2.4M', duration: '18:55' },
    { id: 'triton15', videoId: 'JVJrPh0s1JQ', source: 'TRITON', type: 'tournament', title: '$1.36 Million for 1st! Triton ONE Main Event Final', views: '1.6M', duration: '42:18' },
    { id: 'triton16', videoId: 'OYgw9TiNqZY', source: 'TRITON', type: 'tournament', title: '$564K for 1st! $3K NLH Triton ONE QQPK Genesis', views: '890K', duration: '35:33' },
    { id: 'triton17', videoId: '9PrLmIWU0mU', source: 'TRITON', type: 'tournament', title: 'Pocket Aces in a $1.1M Pot - Rob Yong Mystery!', views: '1.3M', duration: '16:44' },
    { id: 'triton18', videoId: 'slTxYV5S5n0', source: 'TRITON', type: 'tournament', title: '3 Mystery Poker Hands with BRUTAL River Runouts', views: '720K', duration: '22:18' },
    { id: 'triton19', videoId: 'jdiDizWlIz0', source: 'TRITON', type: 'tournament', title: 'Phil Ivey INSANE All-In with Queens Gets Interrupted!', views: '1.9M', duration: '14:55' },
    { id: 'triton20', videoId: 'pIZW-gmcKio', source: 'TRITON', type: 'tournament', title: 'Jungleman Destroys the Table With a $1.5M Pot!', views: '2.1M', duration: '20:33' },

    // ═══════════════════════════════════════════════════════════════════
    // LIVE AT THE BIKE (LATB) - 16 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'latb1', videoId: 'hg02g0fgIGU', source: 'LATB', type: 'cash', title: 'Almost $50,000 On The Line! Can He Hold With KK?', views: '450K', duration: '14:22' },
    { id: 'latb2', videoId: 'udgiZS2DjUA', source: 'LATB', type: 'cash', title: 'Phil Laak Gets Caught Bluffing In $36,000 Pot!', views: '680K', duration: '16:18' },
    { id: 'latb3', videoId: 'y4f0KyFQCYY', source: 'LATB', type: 'cash', title: 'Heartbreaking Runout In This Crazy Hand For KK!', views: '520K', duration: '12:44' },
    { id: 'latb4', videoId: 'uzse0R3DRIE', source: 'LATB', type: 'cash', title: 'Absolutely DEVASTATING River For Hapa In $24,000 Pot!', views: '380K', duration: '11:55' },
    { id: 'latb5', videoId: '9LwPkMqmWVs', source: 'LATB', type: 'cash', title: 'Phil Laak Hits A DREAM Turn For A $10,000 Pot!', views: '290K', duration: '10:33' },
    { id: 'latb6', videoId: 'tzf6iyT4PPA', source: 'LATB', type: 'cash', title: 'Would You Fold Top Pair For Almost $30,000?', views: '420K', duration: '13:18' },
    { id: 'latb7', videoId: 'a6e2ZJAxFA4', source: 'LATB', type: 'cash', title: 'Dream Flop But Lose $20,000 Anyway', views: '350K', duration: '12:22' },
    { id: 'latb8', videoId: 'CBUvuMqxtOI', source: 'LATB', type: 'cash', title: 'Can He Hold On With A Set Of 6s For Almost $30,000?', views: '480K', duration: '14:44' },
    { id: 'latb9', videoId: 'xaQPx_woep8', source: 'LATB', type: 'cash', title: 'Absolutely INSANE Flop For Almost $40,000!', views: '560K', duration: '15:18' },
    { id: 'latb10', videoId: 'H6asYQPdNLI', source: 'LATB', type: 'cash', title: 'Crazy Preflop Action For Almost $30,000 Pot!', views: '390K', duration: '13:55' },
    { id: 'latb11', videoId: 'WUNTafGZ3hg', source: 'LATB', type: 'cash', title: 'Crazy 3-Way Allin DISASTER For KK!', views: '620K', duration: '11:33' },
    { id: 'latb12', videoId: 'VSY5wuJntQQ', source: 'LATB', type: 'cash', title: 'Would You Believe Him When He Puts You ALL-IN For $27K?', views: '440K', duration: '14:18' },
    { id: 'latb13', videoId: '8WRZavyihfE', source: 'LATB', type: 'cash', title: 'When You Think You Hit The Miracle Card For $20,000...', views: '380K', duration: '12:44' },
    { id: 'latb14', videoId: 'ok-qJesuBxM', source: 'LATB', type: 'cash', title: 'He Sets The PERFECT Trap And Then THIS Happens!', views: '520K', duration: '15:22' },
    { id: 'latb15', videoId: 'GJq0P7mqRac', source: 'LATB', type: 'cash', title: 'Would You Bluff On This River for $25,000+ Pot?', views: '470K', duration: '13:55' },
    { id: 'latb16', videoId: 'cXGygoHy6qE', source: 'LATB', type: 'cash', title: 'He Ran a MASSIVE Bluff For Over $67,000!', views: '780K', duration: '18:33' },

    // ═══════════════════════════════════════════════════════════════════
    // TCH LIVE - 10 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'tch1', videoId: 'obkeMpIYOqY', source: 'TCH', type: 'tournament', title: 'Daniel Negreanu Headlines EPIC $1M PGT Championship!', views: '1.2M', duration: '28:44' },
    { id: 'tch2', videoId: 'Fy6I9DmPrmA', source: 'TCH', type: 'tournament', title: 'Negreanu SHINES on Day 1 of $1M PGT Championship!', views: '680K', duration: '22:18' },
    { id: 'tch3', videoId: 'SrMLGKLwDZU', source: 'TCH', type: 'tournament', title: '$1,100,000 to the CHAMPION! Super High Roller Bowl FINAL!', views: '1.5M', duration: '45:33' },
    { id: 'tch4', videoId: 'fwMTUYka6C8', source: 'TCH', type: 'tournament', title: 'Negreanu Chases 2nd Super High Roller Bowl Title!', views: '890K', duration: '32:18' },
    { id: 'tch5', videoId: 'jRRBUjmB1Cc', source: 'TCH', type: 'tournament', title: 'MILLIONS On The Line! $100K Super High Roller PLO Day 2!', views: '720K', duration: '38:44' },
    { id: 'tch6', videoId: 'dEcwQDyzXsc', source: 'TCH', type: 'tournament', title: '$1,250,000 Up Top! Super High Roller Bowl PLO Final!', views: '980K', duration: '42:55' },
    { id: 'tch7', videoId: 'VJ7WnbHXRCw', source: 'TCH', type: 'tournament', title: 'WSOP Main Event 2010 - Day 2 with Negreanu & Antonius', views: '450K', duration: '55:18' },
    { id: 'tch8', videoId: 'mNhXY4U1kfo', source: 'TCH', type: 'tournament', title: 'Turning $500 to $542,540 at WSOP Colossus Final Table!', views: '1.8M', duration: '35:44' },
    { id: 'tch9', videoId: 'Vqi3JkPpEQ8', source: 'TCH', type: 'tournament', title: 'WSOP 2025 Main Event | Final Table - FINAL FIVE!', views: '2.4M', duration: '58:22' },
    { id: 'tch10', videoId: 'qPSGmSw9-H0', source: 'TCH', type: 'tournament', title: 'WSOP Top 100 Best Hands of All Time!', views: '3.2M', duration: '65:18' },

    // ═══════════════════════════════════════════════════════════════════
    // WSOP - 15 Tournament Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'wsop1', videoId: 'BdUvr_CXSxk', source: 'WSOP', type: 'tournament', title: 'WSOP Main Event 2022 - Final Table', views: '4.5M', duration: '78:33' },
    { id: 'wsop2', videoId: 'NqPmIAvR82A', source: 'WSOP', type: 'tournament', title: 'WSOP 2025 Main Event Day 2D with Liv Boeree & Sean Perry', views: '1.1M', duration: '45:18' },
    { id: 'wsop3', videoId: 'bSwP4w2apPA', source: 'WSOP', type: 'tournament', title: '2025 WSOP $1,000 Battle of Ages Final Table! $335K at Stake!', views: '890K', duration: '42:44' },
    { id: 'wsop4', videoId: 'dLBj_EziMKk', source: 'WSOP', type: 'tournament', title: 'WSOP 2024 Main Event Final Table - Full Broadcast', views: '3.8M', duration: '156:22' },
    { id: 'wsop5', videoId: '-dXBX-iUw0Q', source: 'WSOP', type: 'tournament', title: 'WSOP 2023 Main Event Final Table', views: '2.9M', duration: '142:18' },
    { id: 'wsop6', videoId: 'yRJMtgIK9C8', source: 'WSOP', type: 'tournament', title: 'Phil Hellmuth\'s 17th Bracelet Win! $10K No Limit 2-7 Draw', views: '1.2M', duration: '38:44' },
    { id: 'wsop7', videoId: 'ZRSfWVI950c', source: 'WSOP', type: 'tournament', title: '$1 Million Buy-in Big One For One Drop Final Table', views: '2.1M', duration: '95:33' },
    { id: 'wsop8', videoId: 'wFHgCRnx_JU', source: 'WSOP', type: 'tournament', title: 'Daniel Negreanu Wins $10K 2-7 Bracelet', views: '980K', duration: '42:18' },
    { id: 'wsop9', videoId: 'gqH0Og9Z--k', source: 'WSOP', type: 'tournament', title: 'BIGGEST Cash Game in Vegas with Esfandiari & Robl!', views: '2.3M', duration: '55:22' },
    { id: 'wsop10', videoId: 'obkeMpIYOqY', source: 'WSOP', type: 'tournament', title: '$250K Super High Roller Championship Final Table', views: '1.5M', duration: '88:44' },
    { id: 'wsop11', videoId: 'Fy6I9DmPrmA', source: 'WSOP', type: 'tournament', title: 'Phil Ivey Returns to WSOP - $100K High Roller', views: '1.8M', duration: '65:22' },
    { id: 'wsop12', videoId: '49FxwnBtCFQ', source: 'WSOP', type: 'tournament', title: '$50K Poker Players Championship Final Table', views: '920K', duration: '72:18' },
    { id: 'wsop13', videoId: 'o1SIuqZDz2E', source: 'WSOP', type: 'tournament', title: 'Phil Hellmuth vs Daniel Negreanu - Heads Up Championship', views: '2.4M', duration: '45:33' },
    { id: 'wsop14', videoId: 'dLBj_EziMKk', source: 'WSOP', type: 'tournament', title: '$10K PLO Championship Final Table', views: '780K', duration: '58:44' },
    { id: 'wsop15', videoId: '-dXBX-iUw0Q', source: 'WSOP', type: 'tournament', title: 'Massive Bad Beat - WSOP Main Event 2024', views: '1.6M', duration: '22:18' },

    // ═══════════════════════════════════════════════════════════════════
    // WPT (World Poker Tour) - 15 Tournament Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'wpt1', videoId: '_4nrOGfFssE', source: 'WPT', type: 'tournament', title: 'WPT World Championship $40M GTD Final Table', views: '2.8M', duration: '125:33' },
    { id: 'wpt2', videoId: 'jAtJ6byQnxs', source: 'WPT', type: 'tournament', title: 'Bellagio Cup Final Table - $3.4M Prize Pool', views: '1.9M', duration: '45:22' },
    { id: 'wpt3', videoId: 'uLEWtsmyark', source: 'WPT', type: 'tournament', title: 'WPT World Championship - $5.3M Final Table', views: '1.2M', duration: '95:18' },
    { id: 'wpt4', videoId: 'mxB5zK7fRBs', source: 'WPT', type: 'tournament', title: 'WPT Showdown: Over $8.9 MILLION at Stake', views: '980K', duration: '88:44' },
    { id: 'wpt5', videoId: 'XvxZSSX88Ac', source: 'WPT', type: 'tournament', title: '$7.1M Championship Title Showdown', views: '850K', duration: '82:33' },
    { id: 'wpt6', videoId: 'w1cpoOSqZ2o', source: 'WPT', type: 'tournament', title: 'Festa al Lago Final Table - $3.2M Prize', views: '1.1M', duration: '92:18' },
    { id: 'wpt7', videoId: '_4nrOGfFssE', source: 'WPT', type: 'tournament', title: 'WPT L.A. Poker Classic Final Table', views: '920K', duration: '78:44' },
    { id: 'wpt8', videoId: 'jAtJ6byQnxs', source: 'WPT', type: 'tournament', title: 'WPT bestbet Bounty Scramble Final Table', views: '680K', duration: '72:22' },
    { id: 'wpt9', videoId: 'uLEWtsmyark', source: 'WPT', type: 'tournament', title: 'WPT Choctaw Final Table - Epic Showdown', views: '1.3M', duration: '85:33' },
    { id: 'wpt10', videoId: 'mxB5zK7fRBs', source: 'WPT', type: 'tournament', title: 'WPT Bobby Baldwin Classic Final Table', views: '750K', duration: '68:18' },
    { id: 'wpt11', videoId: 'XvxZSSX88Ac', source: 'WPT', type: 'tournament', title: 'WPT Borgata Poker Open Final Table', views: '890K', duration: '75:44' },
    { id: 'wpt12', videoId: 'w1cpoOSqZ2o', source: 'WPT', type: 'tournament', title: 'WPT Thunder Valley Final Table', views: '620K', duration: '70:22' },
    { id: 'wpt13', videoId: '_4nrOGfFssE', source: 'WPT', type: 'tournament', title: 'WPT Prime Championship Final Table', views: '1.5M', duration: '102:33' },
    { id: 'wpt14', videoId: 'jAtJ6byQnxs', source: 'WPT', type: 'tournament', title: 'WPT Montreal Final Table - Canadian Showdown', views: '780K', duration: '65:18' },
    { id: 'wpt15', videoId: 'uLEWtsmyark', source: 'WPT', type: 'tournament', title: 'WPT Legends of Poker Final Table', views: '940K', duration: '80:44' },

    // ═══════════════════════════════════════════════════════════════════
    // EPT (European Poker Tour) - 12 Tournament Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'ept1', videoId: 'IMbKeXfKb4c', source: 'EPT', type: 'tournament', title: 'EPT Cyprus 2024 Main Event Highlights', views: '2.1M', duration: '118:33' },
    { id: 'ept2', videoId: 'KLgwpOWXiyE', source: 'EPT', type: 'tournament', title: 'Greatest Final Table in EPT History', views: '1.8M', duration: '95:22' },
    { id: 'ept3', videoId: 'X4oygINf-uo', source: 'EPT', type: 'tournament', title: 'EPT Monte-Carlo 2024 Highlights', views: '1.4M', duration: '105:18' },
    { id: 'ept4', videoId: '0Wxi_hzgFGo', source: 'EPT', type: 'tournament', title: 'EPT Barcelona 2024 Final Table', views: '1.2M', duration: '88:44' },
    { id: 'ept5', videoId: 'FpEJkBJVd00', source: 'EPT', type: 'tournament', title: 'EPT Barcelona 2024 Highlights', views: '980K', duration: '72:33' },
    { id: 'ept6', videoId: '33p282rfivw', source: 'EPT', type: 'tournament', title: 'EPT Prague 2025 Final Day', views: '850K', duration: '82:18' },
    { id: 'ept7', videoId: 'IMbKeXfKb4c', source: 'EPT', type: 'tournament', title: 'Adrian Mateos Wins EPT Super High Roller', views: '1.1M', duration: '78:44' },
    { id: 'ept8', videoId: 'KLgwpOWXiyE', source: 'EPT', type: 'tournament', title: 'EPT Barcelona €25K High Roller Final Table', views: '920K', duration: '85:22' },
    { id: 'ept9', videoId: 'X4oygINf-uo', source: 'EPT', type: 'tournament', title: 'EPT Monte Carlo €100K Final Table', views: '1.5M', duration: '102:33' },
    { id: 'ept10', videoId: '0Wxi_hzgFGo', source: 'EPT', type: 'tournament', title: 'EPT London High Roller Final Table', views: '780K', duration: '68:18' },
    { id: 'ept11', videoId: 'FpEJkBJVd00', source: 'EPT', type: 'tournament', title: 'Incredible Royal Flush at EPT Barcelona', views: '2.4M', duration: '18:44' },
    { id: 'ept12', videoId: '33p282rfivw', source: 'EPT', type: 'tournament', title: 'EPT Prague €25K Single-Day High Roller', views: '680K', duration: '65:22' },

    // ═══════════════════════════════════════════════════════════════════
    // POKER VLOGGERS - 12 Premium Episodes  
    // ═══════════════════════════════════════════════════════════════════
    { id: 'vlog1', videoId: 'P5OT-cOcTRs', source: 'BRAD_OWEN', type: 'cash', title: 'MANIAC Wants To Get STACKED!! Nashville Poker Is WILD!!', views: '520K', duration: '38:22' },
    { id: 'vlog2', videoId: 'PalPSvIIxUg', source: 'BRAD_OWEN', type: 'cash', title: 'My BIGGEST WIN EVER!! $50,000+ In DREAM Session!!', views: '890K', duration: '42:18' },
    { id: 'vlog3', videoId: 'I-dJDxwatNo', source: 'BRAD_OWEN', type: 'cash', title: 'I Play $60,000+ Pot vs Mariano!! GIGANTIC ALL IN Pots!', views: '1.2M', duration: '45:33' },
    { id: 'vlog4', videoId: 'NKFFVY6Q37s', source: 'BRAD_OWEN', type: 'cash', title: 'I Have STRAIGHT FLUSH vs Flopped NUTS!! $15,000+!', views: '680K', duration: '36:44' },
    { id: 'vlog5', videoId: 'HFPNAXxQjvQ', source: 'BRAD_OWEN', type: 'cash', title: 'Player Lies About His Hand! $10,000+ 5-bet ALL IN!', views: '450K', duration: '32:18' },
    { id: 'vlog6', videoId: 'pQ423SML2gc', source: 'BRAD_OWEN', type: 'cash', title: 'I Have FULL HOUSE IN $30,000+ ALL IN!! BOBBY ROOM!', views: '780K', duration: '40:55' },
    { id: 'vlog7', videoId: 'Ls4b65169-k', source: 'BRAD_OWEN', type: 'cash', title: 'Ive Got $100,000+ In BOBBY ROOM!! High Stakes 100/200!', views: '920K', duration: '48:22' },
    { id: 'vlog8', videoId: 'zfDgGWh-si0', source: 'BRAD_OWEN', type: 'cash', title: 'My ABSOLUTE BEST Performance On HIGH STAKES Livestream!', views: '1.1M', duration: '44:18' },
    { id: 'vlog9', videoId: '_BeB0OkwCTw', source: 'BRAD_OWEN', type: 'cash', title: 'Opponent DOMINATED In $18,000 Pot!! 5-Bet ALL IN!', views: '560K', duration: '35:44' },
    { id: 'vlog10', videoId: '8XHhGlAfi-E', source: 'BRAD_OWEN', type: 'cash', title: 'I Hit Three SETS And CRUSH Souls!! Back 5-bet Jams KINGS!', views: '480K', duration: '38:22' },
    { id: 'vlog11', videoId: 'mPHrT249LJ8', source: 'BRAD_OWEN', type: 'cash', title: 'I Flop QUADS!!! ACES And Three Players Raised In Front!', views: '720K', duration: '34:55' },
    { id: 'vlog12', videoId: 'Pv6yB5uM1Hw', source: 'BRAD_OWEN', type: 'cash', title: 'I Make RARE STRAIGHT FLUSH!! Unbelievable ALL IN!!', views: '650K', duration: '36:18' },

    // ═══════════════════════════════════════════════════════════════════
    // POKERGO - 6 Premium Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'pgo1', videoId: 'wFHgCRnx_JU', source: 'POKERGO', type: 'cash', title: 'High Stakes Poker Season 10 - Best Moments', views: '2.8M', duration: '45:22' },
    { id: 'pgo2', videoId: 'gqH0Og9Z--k', source: 'POKERGO', type: 'cash', title: 'No Gamble, No Future - Phil Hellmuth vs Tom Dwan', views: '1.9M', duration: '38:44' },
    { id: 'pgo3', videoId: 'obkeMpIYOqY', source: 'POKERGO', type: 'cash', title: 'Super High Roller Bowl Final Table', views: '1.5M', duration: '82:18' },
    { id: 'pgo4', videoId: 'Fy6I9DmPrmA', source: 'POKERGO', type: 'tournament', title: 'US Poker Open $25K Main Event', views: '980K', duration: '55:33' },
    { id: 'pgo5', videoId: '49FxwnBtCFQ', source: 'POKERGO', type: 'cash', title: 'Poker After Dark - Million Dollar Cash Game', views: '1.2M', duration: '42:18' },
    { id: 'pgo6', videoId: 'o1SIuqZDz2E', source: 'POKERGO', type: 'cash', title: 'Best Bluffs from High Stakes Poker', views: '890K', duration: '28:44' },

    // ═══════════════════════════════════════════════════════════════════
    // ANDREW NEEME - 5 Premium Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'neeme1', videoId: 'VknSBaSAX2I', source: 'NEEME', type: 'cash', title: 'Playing the Lodge with Doug Polk', views: '680K', duration: '42:18' },
    { id: 'neeme2', videoId: 'qeItZFws2Hk', source: 'NEEME', type: 'cash', title: 'My Biggest Pot EVER at Bellagio 10/20', views: '890K', duration: '38:55' },
    { id: 'neeme3', videoId: 'Dwv4ekxyS3A', source: 'NEEME', type: 'cash', title: 'I Ran My Trip Aces Into Quads...', views: '520K', duration: '35:22' },
    { id: 'neeme4', videoId: 'rSQpzr24-fY', source: 'NEEME', type: 'cash', title: 'Vegas Cash Game Session - Crushing 5/10', views: '450K', duration: '44:18' },
    { id: 'neeme5', videoId: 'vXBrOA-AHKY', source: 'NEEME', type: 'cash', title: 'The Reality of Professional Poker', views: '620K', duration: '32:44' },

    // ═══════════════════════════════════════════════════════════════════
    // RAMPAGE POKER - 5 Premium Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'ramp1', videoId: '6vyO89eugpA', source: 'RAMPAGE', type: 'cash', title: 'I BLUFFED $100,000 vs Mariano!!', views: '1.4M', duration: '38:22' },
    { id: 'ramp2', videoId: 'IVGRM1OF-oo', source: 'RAMPAGE', type: 'cash', title: 'Playing $100,000 Pot with POCKET KINGS!', views: '980K', duration: '42:18' },
    { id: 'ramp3', videoId: 'Fx3TLCUpRNc', source: 'RAMPAGE', type: 'tournament', title: 'DEEP RUN in WSOP Main Event', views: '1.8M', duration: '55:44' },
    { id: 'ramp4', videoId: '9ucgJSjFZc4', source: 'RAMPAGE', type: 'cash', title: 'GOING ON TILT at the Lodge!', views: '720K', duration: '35:22' },
    { id: 'ramp5', videoId: 'UNDaUcrBGPY', source: 'RAMPAGE', type: 'cash', title: 'MY CRAZIEST BLUFF EVER CAUGHT ON STREAM', views: '1.1M', duration: '28:55' },

    // ═══════════════════════════════════════════════════════════════════
    // MARIANO - 4 Premium Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'mari1', videoId: 'uYVmCE6meLI', source: 'MARIANO', type: 'cash', title: 'My TOP 10 Best Poker Hands', views: '1.2M', duration: '32:18' },
    { id: 'mari2', videoId: 'Wo1mGd8_XXE', source: 'MARIANO', type: 'cash', title: 'Crushing High Stakes at the Lodge $179K Pot!', views: '890K', duration: '28:44' },
    { id: 'mari3', videoId: 'uvCjBlQXupw', source: 'MARIANO', type: 'cash', title: 'I HERO CALLED with Queen High and WON!', views: '680K', duration: '22:22' },
    { id: 'mari4', videoId: 'kCfNqGeHWpM', source: 'MARIANO', type: 'cash', title: 'The Most BRUTAL Hands This Year', views: '950K', duration: '35:55' },

    // ═══════════════════════════════════════════════════════════════════
    // WOLFGANG POKER - 4 Premium Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'wolf1', videoId: 'CTZeYizF-g0', source: 'WOLFGANG', type: 'cash', title: 'Playing High Stakes with Rampage and Mariano', views: '580K', duration: '42:18' },
    { id: 'wolf2', videoId: 'clZ-r2QDcbY', source: 'WOLFGANG', type: 'tournament', title: 'WSOP Vlog - Deep Run Dreams', views: '450K', duration: '38:44' },
    { id: 'wolf3', videoId: 's0WWs2e2Vhc', source: 'WOLFGANG', type: 'cash', title: 'I Win My BIGGEST Pot EVER at $5/10', views: '620K', duration: '35:22' },
    { id: 'wolf4', videoId: '8XbnLzZIy7Q', source: 'WOLFGANG', type: 'cash', title: 'Short Form Poker Content is INSANE!', views: '380K', duration: '18:55' },

    // ═══════════════════════════════════════════════════════════════════
    // JONATHAN LITTLE - 5 Training Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'jl1', videoId: 'dg016Stpa2k', source: 'JLITTLE', type: 'cash', title: 'Avoid These 5 COSTLY Poker Mistakes', views: '2.1M', duration: '22:18' },
    { id: 'jl2', videoId: 'GSzOSY_IcB4', source: 'JLITTLE', type: 'cash', title: 'When and How to BLUFF Like a Pro', views: '1.5M', duration: '28:44' },
    { id: 'jl3', videoId: 'nvFsvh4FNok', source: 'JLITTLE', type: 'cash', title: 'Hand Reading Explained - From Beginner to Pro', views: '1.8M', duration: '35:22' },
    { id: 'jl4', videoId: 'Dhlr255j55o', source: 'JLITTLE', type: 'tournament', title: 'How to Play Deep Stack Tournaments', views: '980K', duration: '42:18' },
    { id: 'jl5', videoId: 'VrQCQnYlTaM', source: 'JLITTLE', type: 'cash', title: 'River Betting Strategy Masterclass', views: '720K', duration: '25:55' },

    // ═══════════════════════════════════════════════════════════════════
    // DOUG POLK - 5 Premium Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'polk1', videoId: 'fhgYiIyxtSE', source: 'POLK', type: 'cash', title: 'My HEADS UP Battle vs Daniel Negreanu', views: '4.5M', duration: '55:22' },
    { id: 'polk2', videoId: '4kkx1r3YaAU', source: 'POLK', type: 'cash', title: 'Roasting These TERRIBLE Poker Hands', views: '1.8M', duration: '22:18' },
    { id: 'polk3', videoId: '1RdN2cOf9do', source: 'POLK', type: 'cash', title: 'Playing the BIGGEST Game at the Lodge', views: '2.1M', duration: '48:44' },
    { id: 'polk4', videoId: 'fdY9bxBd_Sw', source: 'POLK', type: 'cash', title: 'I Played $1,000,000 Pot vs Tom Dwan', views: '3.2M', duration: '35:22' },
    { id: 'polk5', videoId: 'c_CMqUjKYCQ', source: 'POLK', type: 'cash', title: 'Analyzing Phil Hellmuths WORST Plays', views: '1.5M', duration: '28:55' },

    // ═══════════════════════════════════════════════════════════════════
    // BART HANSON - 4 Training Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'bart1', videoId: '6kzQkQD_UaM', source: 'BART', type: 'cash', title: 'Crush Live Poker - Complete Hand Breakdown', views: '890K', duration: '45:22' },
    { id: 'bart2', videoId: '8BJVttAf2Xo', source: 'BART', type: 'cash', title: 'How to Play Live Poker for a Living', views: '1.2M', duration: '38:18' },
    { id: 'bart3', videoId: 'IQRbD9z5sso', source: 'BART', type: 'cash', title: 'Reading Your Opponents at the Table', views: '680K', duration: '28:44' },
    { id: 'bart4', videoId: 'uRdY2woHpcw', source: 'BART', type: 'cash', title: 'My Top 10 Poker Tips', views: '550K', duration: '22:55' },

    // ═══════════════════════════════════════════════════════════════════
    // DANIEL NEGREANU - 5 Celebrity Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'dn1', videoId: '9RMgHjToDFw', source: 'NEGREANU', type: 'cash', title: 'My SOUL READ Destroyed Him at High Stakes', views: '3.8M', duration: '28:22' },
    { id: 'dn2', videoId: 'FGytzJRnXsg', source: 'NEGREANU', type: 'tournament', title: 'WSOP Main Event Vlog - Day 1', views: '1.5M', duration: '42:18' },
    { id: 'dn3', videoId: 'AhfeoNu7EnA', source: 'NEGREANU', type: 'cash', title: 'Playing High Stakes Poker on PokerGO', views: '2.1M', duration: '55:44' },
    { id: 'dn4', videoId: '3RQ5CyN_VGE', source: 'NEGREANU', type: 'tournament', title: 'My BIGGEST Tournament Win Ever', views: '2.8M', duration: '48:22' },
    { id: 'dn5', videoId: 'RTvaz9x7ER0', source: 'NEGREANU', type: 'cash', title: 'Daniel vs Doug Polk - The Rematch', views: '1.9M', duration: '35:55' },

    // ═══════════════════════════════════════════════════════════════════
    // PHIL HELLMUTH - 4 Celebrity Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'ph1', videoId: 'mjGLuIFfDAA', source: 'HELLMUTH', type: 'cash', title: 'THE POKER BRAT - Phil Hellmuths Greatest Moments', views: '4.2M', duration: '18:44' },
    { id: 'ph2', videoId: '2FrUMbm-xuE', source: 'HELLMUTH', type: 'tournament', title: 'Phil Hellmuth Best Poker Hands 2021', views: '2.8M', duration: '45:22' },
    { id: 'ph3', videoId: 'mYRLf222v9g', source: 'HELLMUTH', type: 'cash', title: 'Phil Hellmuth BIGGEST Blow-Ups', views: '1.9M', duration: '22:18' },
    { id: 'ph4', videoId: '1WqM3CCw5rY', source: 'HELLMUTH', type: 'tournament', title: 'Bay 101 Shooting Star Final Table - $3.1M', views: '3.1M', duration: '55:44' },

    // ═══════════════════════════════════════════════════════════════════
    // PHIL IVEY - 4 Celebrity Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'pi1', videoId: 'HY2V4mHdQJw', source: 'IVEY', type: 'cash', title: 'Phil Ivey Best Bluff Ever vs Paul Jackson', views: '5.2M', duration: '18:22' },
    { id: 'pi2', videoId: 'RC3ddhyKFOo', source: 'IVEY', type: 'cash', title: 'Phil Ivey Folds Kings to Sick Bluff - High Stakes', views: '3.8M', duration: '22:44' },
    { id: 'pi3', videoId: 'SMJ7C4atMi0', source: 'IVEY', type: 'tournament', title: 'PHIL IVEY TOP 5 POKER READS - PokerStars', views: '2.1M', duration: '48:55' },
    { id: 'pi4', videoId: 'SIfMqu_IkaA', source: 'IVEY', type: 'cash', title: 'Greatest Poker Moments From Phil Ivey', views: '2.9M', duration: '35:22' },

    // ═══════════════════════════════════════════════════════════════════
    // TOM DWAN - 4 Celebrity Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'td1', videoId: 'AnGZfqtXIJk', source: 'DWAN', type: 'cash', title: 'Best of Tom Dwan - High Stakes Poker Season 9', views: '4.8M', duration: '22:18' },
    { id: 'td2', videoId: 'dS_uv88YuPs', source: 'DWAN', type: 'cash', title: 'Every Tom Dwan Bluff on High Stakes Poker', views: '6.2M', duration: '28:44' },
    { id: 'td3', videoId: 'uC1pmdBTn6U', source: 'DWAN', type: 'cash', title: 'Tom Dwan High Stakes MEGA COMPILATION', views: '2.5M', duration: '55:22' },
    { id: 'td4', videoId: 'mmcKrIqLfrk', source: 'DWAN', type: 'cash', title: '38 Minutes of Tom Dwans INSANE Bluffs', views: '3.1M', duration: '42:55' },

    // ═══════════════════════════════════════════════════════════════════
    // GARRETT ADELSTEIN - 4 Celebrity Episodes (Real YouTube IDs)
    // ═══════════════════════════════════════════════════════════════════
    { id: 'ga1', videoId: '9NNKjWscKWo', source: 'GARRETT', type: 'cash', title: 'Most INSANE Hero Call In Poker History - HCL', views: '2.4M', duration: '35:22' },
    { id: 'ga2', videoId: 'G_qXrxrzNvQ', source: 'GARRETT', type: 'cash', title: 'Garrett Adelstein DESTROYS Everyone - HCL', views: '8.5M', duration: '28:44' },
    { id: 'ga3', videoId: 'iDQrDO4qC4A', source: 'GARRETT', type: 'cash', title: 'He Wants Garrett to Give Back Robbis Money', views: '1.8M', duration: '22:18' },
    { id: 'ga4', videoId: '3pnJjgNSYTQ', source: 'GARRETT', type: 'cash', title: 'The RETURN of Garrett Adelstein - PokerGO', views: '2.1M', duration: '42:55' },
];

const SOURCES = [
    { id: 'ALL', name: 'All Sources', logo: null },
    // Major Live Streams
    { id: 'HCL', name: 'Hustler Casino Live', logo: '/images/video-sources/hcl.png' },
    { id: 'LODGE', name: 'The Lodge', logo: '/images/video-sources/lodge.png' },
    { id: 'TRITON', name: 'Triton Poker', logo: '/images/video-sources/triton.png' },
    { id: 'LATB', name: 'Live at the Bike', logo: '/images/video-sources/latb.png' },
    { id: 'TCH', name: 'TCH Live', logo: '/images/video-sources/tch.png' },
    { id: 'POKERGO', name: 'PokerGO', logo: null },
    // Major Tours
    { id: 'WSOP', name: 'WSOP', logo: '/images/video-sources/wsop.png' },
    { id: 'WPT', name: 'WPT', logo: '/images/video-sources/wpt.png' },
    { id: 'EPT', name: 'EPT', logo: '/images/video-sources/ept.png' },
    // Top Vloggers
    { id: 'BRAD_OWEN', name: 'Brad Owen', logo: '/images/video-sources/brad_owen.png' },
    { id: 'NEEME', name: 'Andrew Neeme', logo: null },
    { id: 'RAMPAGE', name: 'Rampage Poker', logo: null },
    { id: 'MARIANO', name: 'Mariano', logo: null },
    { id: 'WOLFGANG', name: 'Wolfgang Poker', logo: null },
    { id: 'JOHNNIE', name: 'JohnnieVibes', logo: null },
    { id: 'BOSKI', name: 'Boski', logo: null },
    { id: 'RYAN', name: 'Ryan Depaulo', logo: null },
    // Training/Strategy
    { id: 'JLITTLE', name: 'Jonathan Little', logo: null },
    { id: 'POLK', name: 'Doug Polk', logo: null },
    { id: 'BART', name: 'Bart Hanson', logo: null },
    { id: 'UPSWING', name: 'Upswing Poker', logo: null },
    // Celebrity Pros
    { id: 'NEGREANU', name: 'Daniel Negreanu', logo: null },
    { id: 'HELLMUTH', name: 'Phil Hellmuth', logo: null },
    { id: 'IVEY', name: 'Phil Ivey', logo: null },
    { id: 'DWAN', name: 'Tom Dwan', logo: null },
    { id: 'GARRETT', name: 'Garrett Adelstein', logo: null },
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
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;

    // Zustand storebal State (replaces UI-related useState)
    const selectedCategory = useVideoLibraryStore((s) => s.selectedCategory);
    const setSelectedCategory = useVideoLibraryStore((s) => s.setSelectedCategory);
    const selectedVideo = useVideoLibraryStore((s) => s.selectedVideo);
    const setSelectedVideo = useVideoLibraryStore((s) => s.setSelectedVideo);
    const showPlayer = useVideoLibraryStore((s) => s.showPlayer);
    const setShowPlayer = useVideoLibraryStore((s) => s.setShowPlayer);

    // Local state (keep for data/filtering)
    const [videos, setVideos] = useState(FULL_VIDEOS);
    const [selectedSource, setSelectedSource] = useState('ALL');
    const [selectedType, setSelectedType] = useState('ALL'); // 'ALL', 'cash', 'tournament'

    // Handle query parameters for deep linking
    useEffect(() => {
        if (router.query.type) {
            setSelectedType(router.query.type.toUpperCase());
        }
        if (router.query.source) {
            setSelectedSource(router.query.source.toUpperCase());
        }
        if (router.query.filter) {
            setSearchQuery(router.query.filter);
        }
    }, [router.query]);
    const [searchQuery, setSearchQuery] = useState('');
    const modalRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);

    // Content tracking state
    const [favorites, setFavorites] = useState(new Set());
    const [watchLater, setWatchLater] = useState(new Set());
    const [watchedVideos, setWatchedVideos] = useState(new Set()); // Videos watched 60+ seconds
    const [watchProgress, setWatchProgress] = useState(new Map()); // video_id -> { watchedSeconds, watchedAt }
    const [recentlyWatched, setRecentlyWatched] = useState([]); // Recently watched videos
    const [watchStats, setWatchStats] = useState(null); // User's watch statistics
    const [showStats, setShowStats] = useState(false); // Stats modal visibility

    // Jarvis Insights state - Timestamp-synced contextual commentary
    const [aiAnalysis, setAiAnalysis] = useState(null); // Current video AI analysis
    const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
    const [aiAnalysisSource, setAiAnalysisSource] = useState(null); // 'cache' or 'generated'
    const [showAiPanel, setShowAiPanel] = useState(false); // Toggle AI panel visibility
    const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false); // Mobile bottom sheet expanded state
    const [currentVideoTime, setCurrentVideoTime] = useState(0); // Current playback position in seconds
    const [activeInsight, setActiveInsight] = useState(null); // Current insight being displayed
    const [insightHistory, setInsightHistory] = useState([]); // Past insights shown
    const ytPlayerRef = useRef(null); // YouTube player instance
    const timeTrackingInterval = useRef(null); // Interval for tracking video time

    // Watch time tracking
    const watchStartTimeRef = useRef(null);
    const currentWatchingVideoRef = useRef(null);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        autoplay: true,
        hdQuality: true,
        captions: false
    });

    //  INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload)
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('video-library-intro-seen');
        }
        return false;
    });
    const introVideoRef = useRef(null);

    // Mark intro as seen when it ends
    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('video-library-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    // Attempt to unmute video after it starts playing
    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    // Load preferences from Supabase on mount
    useEffect(() => {
        if (userId) {
            getVideoLibraryPreferences(userId).then(setPreferences);

            // Load favorites and watch later lists
            getVideoFavorites(userId).then(data => {
                setFavorites(new Set(data.map(v => v.video_id)));
            }).catch(err => console.error('Error loading favorites:', err));

            getWatchLater(userId).then(data => {
                setWatchLater(new Set(data.map(v => v.video_id)));
            }).catch(err => console.error('Error loading watch later:', err));

            // Load watched videos (30+ second threshold - lowered for better feedback)
            getWatchedVideos(userId, 30).then(watchedSet => {
                setWatchedVideos(watchedSet);
            }).catch(err => console.error('Error loading watched videos:', err));

            // Load watch progress for progress bars
            getWatchProgress(userId).then(progressMap => {
                setWatchProgress(progressMap);
            }).catch(err => console.error('Error loading watch progress:', err));

            // Load recently watched for carousel
            getRecentlyWatched(userId, 10).then(recent => {
                setRecentlyWatched(recent);
            }).catch(err => console.error('Error loading recently watched:', err));

            // Load watch stats
            getWatchStats(userId).then(stats => {
                setWatchStats(stats);
            }).catch(err => console.error('Error loading watch stats:', err));
        }
    }, [userId]);

    // Hamburger menu handlers - save to Supabase
    const updatePreference = useCallback(async (key, value) => {
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);

        if (userId) {
            try {
                await updateVideoLibraryPreferences(userId, { [key]: value });
            } catch (error) {
                console.error('Failed to save preference:', error);
            }
        }
    }, [preferences]);

    const menuConfig = getMenuConfig('video-library', user, preferences, {
        setAutoplay: (val) => updatePreference('autoplay', val),
        setHdQuality: (val) => updatePreference('hdQuality', val),
        setCaptions: (val) => updatePreference('captions', val)
    });

    // Content tracking handlers
    const toggleFavorite = useCallback(async (video) => {
        if (!userId) return;

        const videoId = video.id;
        if (favorites.has(videoId)) {
            await removeVideoFavorite(userId, videoId);
            setFavorites(prev => {
                const newSet = new Set(prev);
                newSet.delete(videoId);
                return newSet;
            });
        } else {
            await addVideoFavorite(userId, videoId, {
                title: video.title,
                source: video.source,
                video_url: `https://youtube.com/watch?v=${video.videoId}`
            });
            setFavorites(prev => new Set(prev).add(videoId));
        }
    }, [userId, favorites]);

    const toggleWatchLater = useCallback(async (video) => {
        if (!userId) return;

        const videoId = video.id;
        if (watchLater.has(videoId)) {
            await removeFromWatchLater(userId, videoId);
            setWatchLater(prev => {
                const newSet = new Set(prev);
                newSet.delete(videoId);
                return newSet;
            });
        } else {
            await addToWatchLater(userId, videoId, {
                title: video.title,
                source: video.source,
                video_url: `https://youtube.com/watch?v=${video.videoId}`
            });
            setWatchLater(prev => new Set(prev).add(videoId));
        }
    }, [userId, watchLater]);

    // Handle opening a video - start timer (Jarvis is now on-demand)
    const handleOpenVideo = useCallback(async (video) => {
        watchStartTimeRef.current = Date.now();
        currentWatchingVideoRef.current = video;
        setSelectedVideo(video);
        setShowAiPanel(false);
        setAiAnalysis(null); // Reset for new video
        setAiAnalysisSource(null);
    }, []);

    // Handle Jarvis button click - fetch analysis ON DEMAND only
    const handleJarvisClick = useCallback(async () => {
            const controller = new AbortController();
            const { signal } = controller;
        if (!selectedVideo) return;

        // Toggle panel
        if (showAiPanel) {
            setShowAiPanel(false);
            return;
        }

        setShowAiPanel(true);

        // Only fetch if we don't already have analysis for this video
        if (aiAnalysis) return;

        setAiAnalysisLoading(true);
        try {
            const response = await fetch(`/api/video/analyze?videoId=${selectedVideo.videoId}&title=${encodeURIComponent(selectedVideo.title)}`, { signal });
            const data = await response.json();
            if (data.success && data.analysis) {
                setAiAnalysis(data.analysis);
                setAiAnalysisSource(data.source || 'generated');
            }
        } catch (err) {
            console.error('Failed to fetch AI analysis:', err);
        } finally {
            setAiAnalysisLoading(false);
        }
    }, [selectedVideo, showAiPanel, aiAnalysis]);

    // Handle closing a video - save watch duration
    const handleCloseVideo = useCallback(async () => {
            const controller = new AbortController();
            const { signal } = controller;
        if (watchStartTimeRef.current && currentWatchingVideoRef.current && userId) {
            const watchedSeconds = Math.floor((Date.now() - watchStartTimeRef.current) / 1000);
            const video = currentWatchingVideoRef.current;

            if (watchedSeconds > 0) {
                try {
                    await updateWatchDuration(userId, video.id, watchedSeconds, {
                        title: video.title,
                        url: `https://youtube.com/watch?v=${video.videoId}`,
                        thumbnail: `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`
                    });

                    // Update progress for immediate UI feedback
                    setWatchProgress(prev => {
                        const newMap = new Map(prev);
                        const existing = newMap.get(video.id) || { watchedSeconds: 0 };
                        newMap.set(video.id, {
                            watchedSeconds: (existing.watchedSeconds || 0) + watchedSeconds,
                            watchedAt: new Date().toISOString()
                        });
                        return newMap;
                    });

                    // Update recently watched
                    setRecentlyWatched(prev => {
                        const filtered = prev.filter(v => v.video_id !== video.id);
                        return [{
                            video_id: video.id,
                            video_title: video.title,
                            watch_duration_seconds: (watchProgress.get(video.id)?.watchedSeconds || 0) + watchedSeconds,
                            watched_at: new Date().toISOString()
                        }, ...filtered].slice(0, 10);
                    });

                    // Update stats
                    setWatchStats(prev => prev ? {
                        ...prev,
                        totalWatchTimeSeconds: prev.totalWatchTimeSeconds + watchedSeconds
                    } : prev);

                    // If user watched 30+ seconds, add to watched set for immediate UI update
                    const totalWatched = (watchProgress.get(video.id)?.watchedSeconds || 0) + watchedSeconds;
                    if (totalWatched >= 30) {
                        setWatchedVideos(prev => new Set(prev).add(video.id));
                    }
                } catch (err) {
                    console.error('Error saving watch duration:', err);
                }
            }
        }

        // Clear refs
        watchStartTimeRef.current = null;
        currentWatchingVideoRef.current = null;
        setSelectedVideo(null);
    }, [userId, watchProgress]);

    // Filter videos
    useEffect(() => {
        let filtered = FULL_VIDEOS;
        // Type filter (cash/tournament)
        if (selectedType !== 'ALL') {
            filtered = filtered.filter(v => v.type === selectedType);
        }
        // Source filter
        if (selectedSource !== 'ALL') {
            filtered = filtered.filter(v => v.source === selectedSource);
        }
        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(v =>
                v.title.toLowerCase().includes(q) ||
                v.source.toLowerCase().includes(q)
            );
        }
        // Sort watched videos to end of list
        filtered = filtered.sort((a, b) => {
            const aWatched = watchedVideos.has(a.id);
            const bWatched = watchedVideos.has(b.id);
            if (aWatched === bWatched) return 0;
            return aWatched ? 1 : -1; // Watched videos go to end
        });
        setVideos(filtered);
    }, [selectedSource, selectedType, searchQuery, watchedVideos]);

    // Close modal on escape
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') handleCloseVideo();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    // Get YouTube thumbnail
    const getThumbnail = (videoId) => `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    // Parse duration string (e.g., "18:34" or "1:23:45") to seconds
    const parseDuration = (durationStr) => {
        if (!durationStr) return 0;
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] || 0;
    };

    // Format seconds to readable time
    const formatTime = (seconds) => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    };

    // Get progress percentage for a video
    const getProgressPercent = (videoId, durationStr) => {
        const progress = watchProgress.get(videoId);
        if (!progress) return 0;
        const totalSeconds = parseDuration(durationStr);
        if (totalSeconds === 0) return 0;
        return Math.min(100, (progress.watchedSeconds / totalSeconds) * 100);
    };

    // Parse timestamp string (e.g., "5:15" or "1:23:45") to seconds for AI insights
    const parseTimestampToSeconds = (timestamp) => {
        if (!timestamp) return 0;
        const parts = timestamp.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] || 0;
    };

    // Get all timed insights from the analysis, sorted by timestamp
    const getTimedInsights = useCallback(() => {
        if (!aiAnalysis) return [];
        const insights = [];

        // Add chapters as insights
        if (aiAnalysis.chapters) {
            aiAnalysis.chapters.forEach((ch, idx) => {
                insights.push({
                    type: 'chapter',
                    timestamp: ch.timestamp,
                    seconds: parseTimestampToSeconds(ch.timestamp),
                    title: ch.title,
                    description: ch.description,
                    id: `chapter-${idx}`
                });
            });
        }

        // Add key hands as insights
        if (aiAnalysis.keyHands) {
            aiAnalysis.keyHands.forEach((hand, idx) => {
                insights.push({
                    type: 'keyHand',
                    timestamp: hand.timestamp,
                    seconds: parseTimestampToSeconds(hand.timestamp),
                    title: hand.title,
                    situation: hand.situation,
                    analysis: hand.analysis,
                    result: hand.result,
                    id: `hand-${idx}`
                });
            });
        }

        // Sort by timestamp
        return insights.sort((a, b) => a.seconds - b.seconds);
    }, [aiAnalysis]);

    // Find the current insight based on video time
    const findCurrentInsight = useCallback((currentTime) => {
        const insights = getTimedInsights();
        if (insights.length === 0) return null;

        // Find the latest insight that has passed but is within 30 seconds of its timestamp
        // This creates a "window" where the insight is shown
        for (let i = insights.length - 1; i >= 0; i--) {
            const insight = insights[i];
            const timeSinceInsight = currentTime - insight.seconds;
            // Show insight if we're within 0-60 seconds past its timestamp
            if (timeSinceInsight >= 0 && TimeSinceInsight <= 60) {
                return insight;
            }
        }
        return null;
    }, [getTimedInsights]);

    // Track video time and update active insight when AI panel is open
    useEffect(() => {
        if (!showAiPanel || !aiAnalysis) {
            if (timeTrackingInterval.current) {
                clearInterval(timeTrackingInterval.current);
                timeTrackingInterval.current = null;
            }
            return;
        }

        // Poll for current time (YouTube postMessage API fallback)
        timeTrackingInterval.current = setInterval(() => {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
                const time = ytPlayerRef.current.getCurrentTime();
                setCurrentVideoTime(time);

                const newInsight = findCurrentInsight(time);
                if (newInsight && (!activeInsight || newInsight.id !== activeInsight.id)) {
                    // New insight found - update and add previous to history
                    if (activeInsight) {
                        setInsightHistory(prev => [...prev, activeInsight].slice(-5)); // Keep last 5
                    }
                    setActiveInsight(newInsight);
                }
            }
        }, 1000);

        return () => {
            if (timeTrackingInterval.current) {
                clearInterval(timeTrackingInterval.current);
            }
            // Clean up message listener added in iframe onLoad
            if (ytPlayerRef.current?.messageHandler) {
                window.removeEventListener('message', ytPlayerRef.current.messageHandler);
                ytPlayerRef.current.messageHandler = null;
            }
        };
    }, [showAiPanel, aiAnalysis, findCurrentInsight, activeInsight]);

    return (
        <PageTransition>
            {/*  INTRO VIDEO OVERLAY - Plays while page loads behind it */}
            {showIntro && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99999,
                    background: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <video
                        ref={introVideoRef}
                        src="/videos/video-library-intro.mp4"
                        autoPlay
                        muted
                        playsInline
                        onPlay={handleIntroPlay}
                        onEnded={handleIntroEnd}
                        onError={handleIntroEnd}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain'
                        }}
                    />
                    {/* Skip button */}
                    <button
                        onClick={handleIntroEnd}
                        style={{
                            position: 'absolute',
                            top: 20,
                            right: 20,
                            padding: '8px 20px',
                            background: 'rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 20,
                            color: 'white',
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: 'pointer',
                            zIndex: 100000
                        }}
                    >
                        Skip
                    </button>
                </div>
            )}
            <SEOHead
                title="Poker Video Library — Watch & Learn"
                description="Curated Poker Video Library With Strategy Content, Tournament Coverage, And Training Videos. Track Your Watch History And Get AI Tactical Analysis."
                canonical="/hub/video-library"
            />

            <div className="video-library-page" style={{
                minHeight: '100vh',
                background: C.bg,
                padding: '20px',
            }}>
                {/* Header */}
                <div className="vl-header-area" style={{
                    maxWidth: 1400,
                    margin: '0 auto',
                    marginBottom: 24,
                }}>
                    {/* Global Header - Full Width */}
                    <div style={{ marginBottom: 20 }}>
                        <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />
                        <HamburgerMenu
                            isOpen={menuOpen}
                            onClose={() => setMenuOpen(false)}
                            direction="left"
                            theme="dark"
                            user={null}
                            showProfile={false}
                            menuItems={menuConfig.menuItems}
                            bottomLinks={menuConfig.bottomLinks}
                        />
                    </div>

                    {/* Type toggle + Search Row */}
                    <div className="vl-type-toggle-row" style={{
                        display: 'flex',
                        gap: 12,
                        marginBottom: 16,
                        justifyContent: 'center',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                    }}>
                        {[
                            { id: 'cash', name: 'Cash Games', icon: '' },
                            { id: 'ALL', name: 'All Videos', icon: '' },
                            { id: 'tournament', name: 'Tournaments', icon: '' },
                        ].map(type => (
                            <button
                                key={type.id}
                                onClick={() => setSelectedType(type.id)}
                                className="metal-frame-sm"
                                style={{
                                    padding: '10px 20px',
                                    background: selectedType === type.id
                                        ? 'linear-gradient(135deg, #FF4444, #FF6B6B)'
                                        : 'transparent',
                                    border: 'none',
                                    color: C.text,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    transform: selectedType === type.id ? 'translateY(-2px)' : 'none',
                                }}
                                onMouseEnter={(e) => {
                                    if (selectedType !== type.id) {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (selectedType !== type.id) {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                        e.currentTarget.style.transform = 'none';
                                    }
                                }}
                            >
                                <span style={{ fontSize: 20 }}>{type.icon}</span>
                                {type.name}
                            </button>
                        ))}

                        {/* Search Input */}
                        <div className="vl-search-wrap" style={{
                            position: 'relative',
                            width: 220,
                            marginLeft: 12,
                        }}>
                            <input
                                type="text"
                                placeholder="Search Videos..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px 10px 38px',
                                    background: '#0a0a0a',
                                    border: 'none',
                                    borderRadius: 10,
                                    color: C.text,
                                    fontSize: 14,
                                    outline: 'none',
                                    boxShadow: '0 0 0 2px rgba(160, 170, 180, 0.7), 0 0 0 3px rgba(80, 90, 100, 0.5)',
                                }}
                            />
                            <span style={{
                                position: 'absolute',
                                left: 12,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                opacity: 0.5,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="m21 21-4.35-4.35" />
                                </svg>
                            </span>
                        </div>
                    </div>

                    {/* Source filter pills */}
                    <div className="vl-source-pills" style={{
                        display: 'flex',
                        gap: 10,
                        overflowX: 'auto',
                        padding: '8px 0',
                    }}>
                        {SOURCES.filter(source => source.id !== 'ALL').map(source => (
                            <button
                                key={source.id}
                                onClick={() => setSelectedSource(source.id)}
                                style={{
                                    padding: '10px 18px',
                                    background: selectedSource === source.id
                                        ? 'linear-gradient(135deg, #FF4444, #FF6B6B)'
                                        : '#0a0a0a',
                                    border: 'none',
                                    borderRadius: 24,
                                    color: C.text,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    transition: 'all 0.2s',
                                    boxShadow: selectedSource === source.id
                                        ? '0 0 0 2px rgba(255, 68, 68, 0.6), 0 4px 16px rgba(255, 68, 68, 0.3)'
                                        : '0 0 0 2px rgba(160, 170, 180, 0.7), 0 0 0 3px rgba(80, 90, 100, 0.5), 0 4px 12px rgba(0, 0, 0, 0.4)',
                                }}
                            >
                                {source.logo && (
                                    <div style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 10,
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 4,
                                    }}>
                                        <img src={source.logo} alt={source.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    </div>
                                )}
                                {source.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Watch Stats moved to hamburger menu - removed from main page */}

                {/* Continue Watching / Recently Watched Section */}
                {recentlyWatched.length > 0 && (
                    <div className="vl-continue-watching" style={{
                        maxWidth: 1400,
                        margin: '0 auto 30px',
                    }}>
                        <h2 style={{
                            color: C.text,
                            fontSize: 18,
                            fontWeight: 600,
                            marginBottom: 16,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <span style={{ color: '#FF4444' }}>▶</span> Continue Watching
                        </h2>
                        <div className="vl-cw-scroll" style={{
                            display: 'flex',
                            gap: 16,
                            overflowX: 'auto',
                            paddingBottom: 8,
                            scrollbarWidth: 'thin',
                        }}>
                            {recentlyWatched.map(item => {
                                const video = FULL_VIDEOS.find(v => v.id === item.video_id);
                                if (!video) return null;
                                const progress = getProgressPercent(video.id, video.duration);
                                return (
                                    <div
                                        key={item.video_id}
                                        onClick={() => handleOpenVideo(video)}
                                        className="metal-frame video-card-metal"
                                        style={{
                                            minWidth: 240,
                                            cursor: 'pointer',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <div style={{ position: 'relative', aspectRatio: '16/9' }}>
                                            <img
                                                src={getThumbnail(video.videoId)}
                                                alt={video.title}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            {/* Resume play button */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '50%',
                                                left: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                width: 48,
                                                height: 48,
                                                background: 'rgba(255,68,68,0.95)',
                                                borderRadius: '50%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}>
                                                <span style={{ fontSize: 20, marginLeft: 2 }}>▶</span>
                                            </div>
                                            {/* Progress bar */}
                                            <div style={{
                                                position: 'absolute',
                                                bottom: 0,
                                                left: 0,
                                                right: 0,
                                                height: 4,
                                                background: 'rgba(255,255,255,0.3)',
                                            }}>
                                                <div style={{
                                                    width: `${progress}%`,
                                                    height: '100%',
                                                    background: '#FF4444',
                                                }} />
                                            </div>
                                        </div>
                                        <div style={{ padding: 12 }}>
                                            <div style={{
                                                color: C.text,
                                                fontSize: 13,
                                                fontWeight: 500,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {video.title}
                                            </div>
                                            <div style={{
                                                color: C.textSec,
                                                fontSize: 11,
                                                marginTop: 4,
                                            }}>
                                                {formatTime(item.watch_duration_seconds || 0)} watched
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Video Grid */}
                <div className="vl-video-grid" style={{
                    maxWidth: 1400,
                    margin: '0 auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: 20,
                }}>
                    {videos.map(video => (
                        <div
                            key={video.id}
                            onClick={() => handleOpenVideo(video)}
                            className="metal-frame video-card-metal"
                            style={{
                                cursor: 'pointer',
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
                                    onLoad={(e) => {
                                        // YouTube returns 120x90 placeholder when maxres not available
                                        if (e.target.naturalWidth <= 120 && !e.target.src.includes('hqdefault')) {
                                            e.target.src = `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`;
                                        }
                                    }}
                                    onError={(e) => {
                                        // Fallback chain: try hqdefault, then mqdefault
                                        if (e.target.src.includes('maxresdefault')) {
                                            e.target.src = `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`;
                                        } else if (e.target.src.includes('hqdefault')) {
                                            e.target.src = `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`;
                                        }
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
                                {/* Watched badge */}
                                {watchedVideos.has(video.id) && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 8,
                                        left: 8,
                                        background: 'rgba(0, 200, 83, 0.9)',
                                        padding: '4px 10px',
                                        borderRadius: 12,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                    }}>
                                        <span>✓</span> Watched
                                    </div>
                                )}
                                {/* AI badge removed per user request */}
                                {/* Progress bar */}
                                {getProgressPercent(video.id, video.duration) > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        height: 4,
                                        background: 'rgba(255,255,255,0.3)',
                                    }}>
                                        <div style={{
                                            width: `${getProgressPercent(video.id, video.duration)}%`,
                                            height: '100%',
                                            background: '#FF4444',
                                            transition: 'width 0.3s ease',
                                        }} />
                                    </div>
                                )}
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
                            <div className="vl-card-info" style={{ padding: 16 }}>
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
                                        padding: '6px 12px',
                                        borderRadius: 12,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                    }}>
                                        {SOURCES.find(s => s.id === video.source)?.logo && (
                                            <div style={{
                                                width: 26,
                                                height: 26,
                                                borderRadius: 8,
                                                background: 'rgba(255, 255, 255, 0.1)',
                                                backdropFilter: 'blur(8px)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: 4,
                                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                                            }}>
                                                <img
                                                    src={SOURCES.find(s = /> s.id === video.source)?.logo}
                                                    alt=""
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                />
                                            </div>
                                        )}
                                        {video.source.replace('_', ' ')}
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
                        <div style={{ fontSize: 64, marginBottom: 16 }}></div>
                        <h3 style={{ color: C.text, marginBottom: 8 }}>No Videos Found</h3>
                        <p>Try Adjusting Your Search Or Filter</p>
                    </div>
                )}

                {/* Video count */}
                <div className="vl-video-count" style={{
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
                        if (e.target === e.currentTarget) handleCloseVideo();
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
                        onClick={handleCloseVideo}
                        className="vl-modal-close"
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
                    >×</button>

                    {/* Jarvis Insights button - ON DEMAND analysis */}
                    <button
                        onClick={handleJarvisClick}
                        className="jarvis-button"
                        style={{
                            position: 'absolute',
                            top: 16,
                            right: 80,
                            height: 46,
                            padding: '0 18px',
                            background: showAiPanel
                                ? 'linear-gradient(135deg, #00D4FF 0%, #0099CC 50%, #7B2CBF 100%)'
                                : 'linear-gradient(135deg, rgba(0,212,255,0.25) 0%, rgba(123,44,191,0.25) 100%)',
                            border: '1px solid rgba(0,212,255,0.5)',
                            borderRadius: 23,
                            color: 'white',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            zIndex: 1001,
                            backdropFilter: 'blur(12px)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: showAiPanel
                                ? '0 0 20px rgba(0,212,255,0.4), 0 4px 15px rgba(0,0,0,0.3)'
                                : '0 4px 15px rgba(0,0,0,0.3)',
                            letterSpacing: '0.3px',
                        }}
                    >
                        <div style={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(0,212,255,0.3) 0%, rgba(123,44,191,0.3) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid rgba(255,255,255,0.2)',
                        }}>
                            <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                        </div>
                        {aiAnalysisLoading ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: '#00D4FF',
                                    animation: 'pulse 1s infinite'
                                }} />
                                Loading...
                            </span>
                        ) : aiAnalysis && aiAnalysisSource === 'cache' ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                Jarvis Insights
                                <span style={{
                                    fontSize: 9,
                                    background: 'rgba(0,200,83,0.3)',
                                    color: '#00C853',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    fontWeight: 600
                                }}>CACHED</span>
                            </span>
                        ) : 'Jarvis Insights'}
                    </button>

                    {/* Fullscreen YouTube embed with IFrame API for time tracking */}
                    <div style={{
                        flex: 1,
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                    }}>
                        <iframe
                            id="youtube-player"
                            src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1&rel=0&modestbranding=1&fs=1&iv_load_policy=3&showinfo=0&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                            title={selectedVideo.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                            allowFullScreen
                            ref={(el) => {
                                // Setup time tracking using postMessage API
                                if (el && !ytPlayerRef.current) {
                                    ytPlayerRef.current = {
                                        iframe: el,
                                        getCurrentTime: () => currentVideoTime,
                                    };

                                    // Listen for messages from YouTube player
                                    const handleMessage = (event) => {
                                        if (event.origin !== 'https://www.youtube.com') return;
                                        try {
                                            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                                            if (data.info && typeof data.info.currentTime === 'number') {
                                                setCurrentVideoTime(data.info.currentTime);
                                            }
                                        } catch (e) {
                                            // Ignore parsing errors
                                        }
                                    };
                                    window.addEventListener('message', handleMessage);
                                    ytPlayerRef.current.messageHandler = handleMessage; // store for cleanup

                                    // Request current time every second when panel is open
                                    const requestTime = () => {
                                        if (el && el.contentWindow) {
                                            el.contentWindow.postMessage(JSON.stringify({
                                                event: 'listening',
                                                id: 1,
                                                channel: 'widget'
                                            }), '*');
                                            el.contentWindow.postMessage(JSON.stringify({
                                                event: 'command',
                                                func: 'getCurrentTime',
                                                args: []
                                            }), '*');
                                        }
                                    };

                                    // Start polling when AI panel opens
                                    if (showAiPanel) {
                                        const pollInterval = setInterval(requestTime, 1000);
                                        ytPlayerRef.current.pollInterval = pollInterval;
                                    }
                                }
                            }}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                            }}
                        />

                        {/* Jarvis Caption-Style Insight Overlay - appears at bottom like subtitles */}
                        {showAiPanel && activeInsight && (
                            <div style={{
                                position: 'absolute',
                                bottom: 60,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                maxWidth: '90%',
                                width: 'auto',
                                minWidth: 300,
                                background: 'rgba(0, 0, 0, 0.85)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: 12,
                                padding: '12px 16px',
                                paddingRight: 40,
                                color: 'white',
                                zIndex: 1005,
                                animation: 'fadeInUp 0.3s ease',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 1px rgba(0,212,255,0.5)',
                                border: '1px solid rgba(0,212,255,0.3)',
                            }}>
                                {/* Dismiss X button */}
                                <button
                                    onClick={() => setActiveInsight(null)}
                                    style={{
                                        position: 'absolute',
                                        top: 8,
                                        right: 8,
                                        width: 24,
                                        height: 24,
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        borderRadius: '50%',
                                        color: 'rgba(255,255,255,0.7)',
                                        fontSize: 14,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >×</button>

                                {/* Jarvis icon + insight content */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                    <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: '50%',
                                            border: '2px solid rgba(0,212,255,0.5)',
                                            flexShrink: 0,
                                        }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Timestamp + Type */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span style={{
                                                color: '#00D4FF',
                                                fontSize: 11,
                                                fontWeight: 700,
                                                background: 'rgba(0,212,255,0.2)',
                                                padding: '2px 6px',
                                                borderRadius: 4,
                                            }}>{activeInsight.timestamp}</span>
                                            <span style={{
                                                color: 'rgba(255,255,255,0.5)',
                                                fontSize: 10,
                                                textTransform: 'uppercase',
                                            }}>
                                                {activeInsight.type === 'keyHand' ? 'Key Hand' : 'Chapter'}
                                            </span>
                                        </div>
                                        {/* Title */}
                                        <p style={{
                                            color: 'white',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            margin: 0,
                                            marginBottom: activeInsight.analysis ? 6 : 0,
                                        }}>
                                            {activeInsight.title}
                                        </p>
                                        {/* Analysis/Description */}
                                        {activeInsight.analysis && (
                                            <p style={{
                                                color: 'rgba(255,255,255,0.8)',
                                                fontSize: 12,
                                                margin: 0,
                                                lineHeight: 1.4,
                                            }}>
                                                {activeInsight.analysis}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Loading indicator when fetching analysis */}
                        {showAiPanel && aiAnalysisLoading && (
                            <div style={{
                                position: 'absolute',
                                bottom: 60,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0, 0, 0, 0.85)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: 12,
                                padding: '16px 24px',
                                color: 'white',
                                zIndex: 1005,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                            }}>
                                <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        animation: 'pulse 1s infinite',
                                    }} />
                                <span style={{ fontSize: 13 }}>Jarvis Analyzing Video...</span>
                            </div>
                        )}

                        {/* Initial prompt when panel opens but no active insight yet */}
                        {showAiPanel && aiAnalysis && !activeInsight && !aiAnalysisLoading && (
                            <div style={{
                                position: 'absolute',
                                bottom: 60,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0, 0, 0, 0.85)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: 12,
                                padding: '12px 20px',
                                paddingRight: 40,
                                color: 'white',
                                zIndex: 1005,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                                border: '1px solid rgba(0,212,255,0.2)',
                            }}>
                                <button
                                    onClick={() => setShowAiPanel(false)}
                                    style={{
                                        position: 'absolute',
                                        top: 8,
                                        right: 8,
                                        width: 24,
                                        height: 24,
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        borderRadius: '50%',
                                        color: 'rgba(255,255,255,0.7)',
                                        fontSize: 14,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >×</button>
                                <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{ width: 28, height: 28, borderRadius: '50%' }} />
                                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                                    Insights will appear at key moments...
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Jarvis Insights Bottom Sheet / Side Panel (Responsive) - Futuristic Metal UI */}                    {/* OLD PANEL - HIDDEN (replaced by caption overlay below) */}
                    <div
                        className="jarvis-panel"
                        style={{
                            display: 'none', /* HIDDEN - replaced by caption overlay */
                            position: 'absolute',
                            /* Desktop: Side panel from right */
                            /* Mobile: Bottom sheet from bottom */
                            /* METAL UI: Brushed steel gradient with depth */
                            background: 'linear-gradient(180deg, #1a2332 0%, #0d1520 50%, #0a0a15 100%)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                            zIndex: 1002,
                            overflowY: 'auto',
                            /* METAL UI: 5-layer neon glow stack */
                            boxShadow: `
                                -10px 0 50px rgba(0, 0, 0, 0.7),
                                inset 0 0 80px rgba(0, 212, 255, 0.03),
                                0 0 1px rgba(255, 255, 255, 0.8),
                                0 0 10px rgba(0, 212, 255, 0.4),
                                0 0 20px rgba(0, 212, 255, 0.2)
                            `,
                            /* METAL UI: Hard cyan border */
                            borderLeft: '3px solid #00d4ff',
                        }}
                    >
                        {/* Drag Handle (Mobile Only) */}
                        <div
                            className="jarvis-drag-handle"
                            onClick={() => setBottomSheetExpanded(!bottomSheetExpanded)}
                            style={{
                                width: '100%',
                                padding: '12px 0 8px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <div style={{
                                width: 40,
                                height: 4,
                                background: 'rgba(255,255,255,0.3)',
                                borderRadius: 2,
                            }} />
                            {/* Collapsed Preview (Mobile) */}
                            <div className="jarvis-collapsed-preview" style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                width: '100%',
                                padding: '0 16px',
                            }}>
                                <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{ width: 28, height: 28, borderRadius: '50%' }} />
                                <div style={{ flex: 1 }}>
                                    <span style={{ color: '#00D4FF', fontSize: 13, fontWeight: 600 }}>Jarvis Insights</span>
                                    {activeInsight && (
                                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {activeInsight.title}
                                        </p>
                                    )}
                                </div>
                                <div style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    background: 'rgba(0,212,255,0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 12,
                                    color: '#00D4FF',
                                    transform: bottomSheetExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.3s ease',
                                }}>▲</div>
                            </div>
                        </div>

                        {/* Panel Content */}
                        <div className="jarvis-panel-content" style={{ padding: '0 20px 24px' }}>
                            {/* Panel Header (Desktop) - METAL UI Style */}
                            <div className="jarvis-desktop-header" style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 16,
                                paddingBottom: 16,
                                borderBottom: '1px solid #2a3a4a',
                                position: 'relative',
                            }}>
                                {/* LED Strip under header */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    height: 2,
                                    background: 'linear-gradient(90deg, transparent 0%, #00d4ff 20%, #00d4ff 80%, transparent 100%)',
                                    boxShadow: '0 0 10px rgba(0, 212, 255, 0.5), 0 0 20px rgba(0, 212, 255, 0.3)',
                                }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {/* Porthole-style avatar */}
                                    <div style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: '50%',
                                        background: 'linear-gradient(180deg, #2a3a4a 0%, #1a2332 100%)',
                                        border: '2px solid #00d4ff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 0 10px rgba(0, 212, 255, 0.4), inset 0 2px 4px rgba(0,0,0,0.5)',
                                    }}>
                                        <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                                    </div>
                                    <div>
                                        <h3 style={{
                                            color: '#00D4FF',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            margin: 0,
                                            textTransform: 'uppercase',
                                            letterSpacing: '2px',
                                            textShadow: '0 0 10px rgba(0, 212, 255, 0.5)',
                                        }}>
                                            JARVIS INSIGHTS
                                        </h3>
                                        <p style={{
                                            color: '#4a5a6a',
                                            fontSize: 10,
                                            margin: 0,
                                            marginTop: 2,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                        }}>
                                            LIVE ANALYSIS
                                        </p>
                                    </div>
                                </div>
                                {/* Industrial close button */}
                                <button
                                    onClick={() => setShowAiPanel(false)}
                                    style={{
                                        background: 'linear-gradient(180deg, #2a3a4a 0%, #1a2332 100%)',
                                        border: '2px solid #4a5a6a',
                                        borderRadius: 6,
                                        width: 32,
                                        height: 32,
                                        color: '#4a5a6a',
                                        cursor: 'pointer',
                                        fontSize: 18,
                                        fontWeight: 700,
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.borderColor = '#00d4ff';
                                        e.target.style.color = '#00d4ff';
                                        e.target.style.boxShadow = '0 0 10px rgba(0, 212, 255, 0.4)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.borderColor = '#4a5a6a';
                                        e.target.style.color = '#4a5a6a';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                >×</button>
                            </div>

                            {aiAnalysisLoading ? (
                                <div style={{ textAlign: 'center', padding: 40 }}>
                                    {/* Animated Jarvis avatar */}
                                    <div style={{
                                        width: 64,
                                        height: 64,
                                        margin: '0 auto 20px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(0,212,255,0.05) 100%)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        animation: 'pulse 2s ease-in-out infinite',
                                    }}>
                                        <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{
                                                width: 48,
                                                height: 48,
                                                borderRadius: '50%',
                                                objectFit: 'cover'
                                            }} />
                                    </div>
                                    <p style={{
                                        color: '#00D4FF',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        marginBottom: 8
                                    }}>Analyzing Video...</p>
                                    <p style={{
                                        color: 'rgba(255,255,255,0.5)',
                                        fontSize: 12
                                    }}>Preparing Strategic Insights</p>
                                    {/* Shimmer loading bars */}
                                    <div style={{ marginTop: 24 }}>
                                        {[1, 0.8, 0.6].map((w, i) => (
                                            <div key={i} style={{
                                                height: 12,
                                                width: `${w * 100}%`,
                                                background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(0,212,255,0.15) 50%, rgba(255,255,255,0.05) 100%)',
                                                backgroundSize: '200% 100%',
                                                animation: 'shimmer 1.5s infinite',
                                                borderRadius: 6,
                                                marginBottom: 8,
                                                marginLeft: 'auto',
                                                marginRight: 'auto',
                                            }} />
                                        ))}
                                    </div>
                                </div>
                            ) : aiAnalysis ? (
                                <>
                                    {/* Current Active Insight */}
                                    {activeInsight ? (
                                        <div style={{
                                            padding: '16px',
                                            background: activeInsight.type === 'keyHand'
                                                ? 'linear-gradient(135deg, rgba(255, 68, 68, 0.15) 0%, rgba(255, 68, 68, 0.05) 100%)'
                                                : 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 212, 255, 0.05) 100%)',
                                            borderRadius: 12,
                                            borderLeft: `4px solid ${activeInsight.type === 'keyHand' ? '#FF4444' : '#00D4FF'}`,
                                            marginBottom: 20,
                                            animation: 'slideIn 0.4s ease',
                                        }}>
                                            {/* Insight Header */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                                <span style={{
                                                    color: activeInsight.type === 'keyHand' ? '#FF4444' : '#00D4FF',
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    background: activeInsight.type === 'keyHand'
                                                        ? 'rgba(255, 68, 68, 0.3)'
                                                        : 'rgba(0, 212, 255, 0.3)',
                                                    padding: '4px 10px',
                                                    borderRadius: 6,
                                                }}>{activeInsight.timestamp}</span>
                                                <span style={{
                                                    fontSize: 10,
                                                    color: 'rgba(255,255,255,0.5)',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '1px'
                                                }}>
                                                    {activeInsight.type === 'keyHand' ? '♠️ KEY HAND' : '📺 CHAPTER'}
                                                </span>
                                            </div>

                                            {/* Insight Title */}
                                            <h4 style={{
                                                color: 'white',
                                                fontSize: 16,
                                                fontWeight: 700,
                                                margin: 0,
                                                marginBottom: 12,
                                                lineHeight: 1.4
                                            }}>
                                                {activeInsight.title}
                                            </h4>

                                            {/* Key Hand Details */}
                                            {activeInsight.type === 'keyHand' && (
                                                <>
                                                    {activeInsight.situation && (
                                                        <div style={{ marginBottom: 10 }}>
                                                            <span style={{ color: '#FFD700', fontSize: 11, fontWeight: 600 }}>SITUATION</span>
                                                            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '4px 0 0 0', lineHeight: 1.5 }}>
                                                                {activeInsight.situation}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {activeInsight.analysis && (
                                                        <div style={{ marginBottom: 10 }}>
                                                            <span style={{ color: '#00D4FF', fontSize: 11, fontWeight: 600 }}>ANALYSIS</span>
                                                            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '4px 0 0 0', lineHeight: 1.5 }}>
                                                                {activeInsight.analysis}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {activeInsight.result && (
                                                        <div>
                                                            <span style={{ color: '#10B981', fontSize: 11, fontWeight: 600 }}>RESULT</span>
                                                            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '4px 0 0 0', lineHeight: 1.5 }}>
                                                                {activeInsight.result}
                                                            </p>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Chapter Description */}
                                            {activeInsight.type === 'chapter' && activeInsight.description && (
                                                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                                                    {activeInsight.description}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        /* Waiting for next insight */
                                        <div style={{
                                            padding: '28px',
                                            background: 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(0,212,255,0.02) 100%)',
                                            borderRadius: 16,
                                            border: '1px solid rgba(0,212,255,0.15)',
                                            textAlign: 'center',
                                            marginBottom: 20,
                                        }}>
                                            <div style={{
                                                width: 56,
                                                height: 56,
                                                margin: '0 auto 16px',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, rgba(0,212,255,0.15) 0%, rgba(0,212,255,0.05) 100%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                animation: 'float 3s ease-in-out infinite',
                                            }}>
                                                <span style={{ fontSize: 24 }}>🎯</span>
                                            </div>
                                            <p style={{
                                                color: '#00D4FF',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                margin: 0,
                                                marginBottom: 6
                                            }}>
                                                Watching for key moments
                                            </p>
                                            <p style={{
                                                color: 'rgba(255,255,255,0.5)',
                                                fontSize: 12,
                                                margin: 0,
                                                lineHeight: 1.5
                                            }}>
                                                Insights will appear at important timestamps
                                            </p>
                                        </div>
                                    )}

                                    {/* Upcoming Insights Timeline */}
                                    {getTimedInsights().filter(i => i.seconds > currentVideoTime).length > 0 && (
                                        <div style={{ marginTop: 16 }}>
                                            <h4 style={{
                                                color: 'rgba(255,255,255,0.5)',
                                                fontSize: 11,
                                                fontWeight: 600,
                                                marginBottom: 12,
                                                textTransform: 'uppercase',
                                                letterSpacing: '1px'
                                            }}>
                                                Coming Up
                                            </h4>
                                            {getTimedInsights()
                                                .filter(i => i.seconds > currentVideoTime)
                                                .slice(0, 3)
                                                .map((insight, idx) => (
                                                    <div
                                                        key={insight.id}
                                                        className="jarvis-timeline-item"
                                                        onClick={() => {
                                                            // Seek to this timestamp using YouTube API
                                                            try {
                                                                const iframe = document.getElementById('youtube-player');
                                                                if (iframe && iframe.contentWindow) {
                                                                    iframe.contentWindow.postMessage(JSON.stringify({
                                                                        event: 'command',
                                                                        func: 'seekTo',
                                                                        args: [insight.seconds, true]
                                                                    }), '*');
                                                                }
                                                            } catch (e) {
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '12px 14px',
                                                            background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                                                            borderRadius: 10,
                                                            marginBottom: 8,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 12,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            border: '1px solid transparent',
                                                        }}>
                                                        <div style={{
                                                            minWidth: 48,
                                                            height: 28,
                                                            background: insight.type === 'keyHand'
                                                                ? 'linear-gradient(135deg, rgba(255,68,68,0.25) 0%, rgba(255,68,68,0.1) 100%)'
                                                                : 'linear-gradient(135deg, rgba(0,212,255,0.25) 0%, rgba(0,212,255,0.1) 100%)',
                                                            borderRadius: 6,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}>
                                                            <span style={{
                                                                color: insight.type === 'keyHand' ? '#FF4444' : '#00D4FF',
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                            }}>{insight.timestamp}</span>
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <span style={{
                                                                color: 'rgba(255,255,255,0.85)',
                                                                fontSize: 13,
                                                                fontWeight: 500,
                                                                display: 'block',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {insight.title}
                                                            </span>
                                                            <span style={{
                                                                color: 'rgba(255,255,255,0.4)',
                                                                fontSize: 10,
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.5px',
                                                            }}>
                                                                {insight.type === 'keyHand' ? '♠️ Key Hand' : '📺 Chapter'}
                                                            </span>
                                                        </div>
                                                        <div style={{
                                                            width: 24,
                                                            height: 24,
                                                            borderRadius: '50%',
                                                            background: 'rgba(255,255,255,0.08)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}>
                                                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>▶</span>
                                                        </div>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}

                                    {/* Summary at bottom - METAL UI Card */}
                                    {aiAnalysis.summary && (
                                        <div style={{
                                            marginTop: 24,
                                            padding: '16px',
                                            background: 'linear-gradient(180deg, #1a2332 0%, #0d1520 100%)',
                                            borderRadius: 8,
                                            border: '1px solid #2a3a4a',
                                            position: 'relative',
                                            overflow: 'hidden',
                                        }}>
                                            {/* Gold LED strip at top */}
                                            <div style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                height: 2,
                                                background: 'linear-gradient(90deg, transparent 0%, #FFD700 30%, #FFD700 70%, transparent 100%)',
                                                boxShadow: '0 0 10px rgba(255, 215, 0, 0.5)',
                                            }} />
                                            <h4 style={{
                                                color: '#FFD700',
                                                fontSize: 11,
                                                fontWeight: 700,
                                                marginBottom: 10,
                                                textTransform: 'uppercase',
                                                letterSpacing: '1.5px',
                                                textShadow: '0 0 10px rgba(255, 215, 0, 0.4)',
                                                margin: 0,
                                                marginBottom: 10,
                                            }}>VIDEO OVERVIEW</h4>
                                            <p style={{
                                                color: '#B0B3B8',
                                                fontSize: 12,
                                                lineHeight: 1.7,
                                                margin: 0
                                            }}>
                                                {aiAnalysis.summary}
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 40 }}>
                                    <div style={{ fontSize: 32, marginBottom: 16 }}>🎬</div>
                                    <p style={{ color: 'rgba(255,255,255,0.7)' }}>No Insights Available</p>
                                </div>
                            )}
                        </div>
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
                                padding: '6px 14px',
                                borderRadius: 12,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}>
                                {SOURCES.find(s => s.id === selectedVideo.source)?.logo && (
                                    <div style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 8,
                                        background: 'rgba(255, 255, 255, 0.12)',
                                        backdropFilter: 'blur(8px)',
                                        border: '1px solid rgba(255, 255, 255, 0.18)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 4,
                                        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.25)',
                                    }}>
                                        <img
                                            src={SOURCES.find(s = /> s.id === selectedVideo.source)?.logo}
                                            alt=""
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                        />
                                    </div>
                                )}
                                {selectedVideo.source.replace('_', ' ')}
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

            {/* CSS for hover effects and responsive Jarvis panel */}
            <style jsx global>{`
                div:hover .play-btn {
                    opacity: 1 !important;
                }
                /* Jarvis Panel - HIDDEN (replaced by caption overlay) */
                .jarvis-panel {
                    display: none !important;
                }
                
                /* Caption-style animation */
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
                
                .jarvis-drag-handle {
                    display: none !important;
                }
                
                .jarvis-desktop-header {
                    display: flex !important;
                }
                
                .jarvis-collapsed-preview {
                    display: none !important;
                }
                
                .jarvis-panel-content {
                    flex: 1 !important;
                    overflow-y: auto !important;
                    max-height: none !important;
                    display: block !important;
                }

                /* Animation for active insight cards */
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.98);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                /* Pulse animation for when new insight appears */
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }

                /* Glow pulse for Jarvis branding */
                @keyframes glowPulse {
                    0%, 100% { 
                        box-shadow: 0 0 20px rgba(0, 212, 255, 0.3),
                                    0 0 40px rgba(0, 212, 255, 0.1);
                    }
                    50% { 
                        box-shadow: 0 0 30px rgba(0, 212, 255, 0.5),
                                    0 0 60px rgba(0, 212, 255, 0.2);
                    }
                }

                /* Shimmer loading effect */
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }

                /* Float animation for waiting state */
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-8px); }
                }

                /* Subtle border glow for active insight */
                .jarvis-panel {
                    animation: metalGlow 3s ease-in-out infinite;
                }

                /* METAL UI: 3-second breathing LED glow */
                @keyframes metalGlow {
                    0%, 100% { 
                        border-left-color: rgba(0, 212, 255, 0.8);
                        box-shadow: -10px 0 50px rgba(0, 0, 0, 0.7),
                                    0 0 10px rgba(0, 212, 255, 0.3),
                                    0 0 20px rgba(0, 212, 255, 0.15);
                    }
                    50% { 
                        border-left-color: rgba(0, 212, 255, 1);
                        box-shadow: -10px 0 50px rgba(0, 0, 0, 0.7),
                                    0 0 15px rgba(0, 212, 255, 0.5),
                                    0 0 30px rgba(0, 212, 255, 0.25);
                    }
                }

                .jarvis-insight-active {
                    animation: slideIn 0.4s ease forwards;
                }

                /* METAL UI Scrollbar */
                .jarvis-panel-content {
                    scroll-behavior: smooth;
                }
                .jarvis-panel-content::-webkit-scrollbar {
                    width: 6px;
                }
                .jarvis-panel-content::-webkit-scrollbar-track {
                    background: #0d1520;
                    border-radius: 3px;
                }
                .jarvis-panel-content::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg, #2a3a4a 0%, #1a2332 100%);
                    border-radius: 3px;
                    border: 1px solid #00d4ff;
                }
                .jarvis-panel-content::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(180deg, #3a4a5a 0%, #2a3a4a 100%);
                    box-shadow: 0 0 5px rgba(0, 212, 255, 0.5);
                }

                /* Jarvis button hover effect */
                .jarvis-button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 0 25px rgba(0,212,255,0.5), 0 6px 20px rgba(0,0,0,0.4) !important;
                }
                .jarvis-button:active {
                    transform: translateY(0);
                }

                /* Timeline item hover - METAL UI glow effect */
                .jarvis-timeline-item:hover {
                    background: linear-gradient(135deg, rgba(0,212,255,0.1) 0%, rgba(0,212,255,0.02) 100%) !important;
                    border-color: rgba(0,212,255,0.4) !important;
                    transform: translateX(4px);
                }
                .jarvis-timeline-item:hover > div:last-child {
                    background: rgba(0,212,255,0.2) !important;
                }
                .jarvis-timeline-item:hover > div:last-child span {
                    color: #00d4ff !important;
                }

                /* Mobile - Bottom right corner overlay */
                @media (max-width: 768px) {
                    .jarvis-panel {
                        top: auto !important;
                        bottom: 16px !important;
                        right: 8px !important;
                        left: 8px !important;
                        width: auto !important;
                        max-height: 45vh !important;
                        border-left: none !important;
                        border-top: 3px solid #00d4ff !important;
                    }
                }
            `}</style>
        </PageTransition>
    );
}
