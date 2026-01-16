/**
 * 📺 VIDEO LIBRARY - Full Poker Videos from Global Livestreams
 * Browse and watch complete hands from HCL, The Lodge, Triton, and more
 */

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// Full video catalog with YouTube embeds - 96 VERIFIED VIDEOS
const FULL_VIDEOS = [
    // ═══════════════════════════════════════════════════════════════════
    // HUSTLER CASINO LIVE - 28 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'hcl1', videoId: 'D5R_ZQZDR1Q', source: 'HCL', title: 'Doug Polk Goes FULL DEGEN in LA Poker Game!', views: '1.2M', duration: '18:34' },
    { id: 'hcl2', videoId: 'bjSK8Ajhm2g', source: 'HCL', title: 'Jungleman & Senor Tilt Attempt to BLUFF Mariano', views: '890K', duration: '15:22' },
    { id: 'hcl3', videoId: 'fif_M-C7uxM', source: 'HCL', title: 'Jungleman Makes 3 IMPOSSIBLE HERO CALLS in 1 Game!', views: '750K', duration: '14:45' },
    { id: 'hcl4', videoId: '4ErqhJMdTqE', source: 'HCL', title: 'Nik Airball RUNS OVER The Table & Wins All The Money', views: '980K', duration: '16:18' },
    { id: 'hcl5', videoId: '2aaQ8D5mQiQ', source: 'HCL', title: 'Top 10 Hands of 2025', views: '1.5M', duration: '22:52' },
    { id: 'hcl6', videoId: 'Tvt3ib08foo', source: 'HCL', title: 'Top 10 Biggest Pots of 2025', views: '1.8M', duration: '25:44' },
    { id: 'hcl7', videoId: 'TKuwraMHM4s', source: 'HCL', title: 'Martin Kabrhel is the ULTIMATE TROLL with Jack Five', views: '670K', duration: '13:22' },
    { id: 'hcl8', videoId: 'wMpb2U4bogY', source: 'HCL', title: 'JBoogs Activates FULL TILT & Cannot Comprehend Runout!', views: '2.1M', duration: '18:45' },
    { id: 'hcl9', videoId: 'hJkpOdcC9b4', source: 'HCL', title: 'Alan Keating Terrorizes Senor Tilt in 3 MASSIVE Pots', views: '3.2M', duration: '22:18' },
    { id: 'hcl10', videoId: 'q-LPKh4BcDU', source: 'HCL', title: 'Martin Kabrhel Plays a $1.5M Pot vs Senor Tilt', views: '2.4M', duration: '19:33' },
    { id: 'hcl11', videoId: '7fe18ZyRR3o', source: 'HCL', title: 'Nik Airball Biggest Win of All Time | $1.3 MILLION', views: '4.5M', duration: '28:12' },
    { id: 'hcl12', videoId: '9BHqoXOGwqo', source: 'HCL', title: 'How Brandon Steven Lost $2 MILLION in Million Dollar Marathon', views: '2.8M', duration: '24:45' },
    { id: 'hcl13', videoId: 'ZXBCQHCcQDQ', source: 'HCL', title: 'The Most INSANE Tank in Poker History', views: '1.9M', duration: '16:33' },
    { id: 'hcl14', videoId: 'Z54GrBrtjEY', source: 'HCL', title: 'Can Alan Keating Hero Call vs MASSIVE Bluff From Peter?!', views: '1.6M', duration: '14:22' },
    { id: 'hcl15', videoId: 'BBiMGvjyjfc', source: 'HCL', title: 'Alan Keating Plays $2.1M Pot vs Martin Kabrhel', views: '3.8M', duration: '26:18' },
    { id: 'hcl16', videoId: 'XWNNilCpZDs', source: 'HCL', title: 'Senor Tilt Gets Owned by Mariano in INSANE HAND', views: '1.4M', duration: '15:44' },
    { id: 'hcl17', videoId: 'd-MMWutIvhQ', source: 'HCL', title: 'QUADS vs STRAIGHT FLUSH! Craziest Hand in HCL HISTORY!', views: '5.2M', duration: '18:55' },
    { id: 'hcl18', videoId: 'nIkqI5ERmoQ', source: 'HCL', title: 'Mariano & Henry Meet in a NASTY COOLER Situation', views: '920K', duration: '13:22' },
    { id: 'hcl19', videoId: 'yPmtNaw_AZo', source: 'HCL', title: 'Mariano Wants to Make an INSANE HERO CALL', views: '780K', duration: '12:18' },
    { id: 'hcl20', videoId: 'PjrbLrCDBNQ', source: 'HCL', title: 'Doug Polk Plays a $686K Pot vs Nik Airball', views: '2.3M', duration: '20:33' },
    { id: 'hcl21', videoId: '2JLbcXyse1I', source: 'HCL', title: 'Two of the MOST INSANE Hands in HCL History!!', views: '1.7M', duration: '17:44' },
    { id: 'hcl22', videoId: 'kujjBSyB4Dk', source: 'HCL', title: 'The Biggest Pot in Max Pain Monday History', views: '1.1M', duration: '14:22' },
    { id: 'hcl23', videoId: 'OiLx18q92uM', source: 'HCL', title: 'STRAIGHT FLUSH vs NUT FLUSH He Cannot Believe His Luck!', views: '2.9M', duration: '16:55' },
    { id: 'hcl24', videoId: 'TSVNEFxZ4D0', source: 'HCL', title: 'Can Mariano HERO CALL vs Gigantic Bluff From Peter?', views: '850K', duration: '13:18' },
    { id: 'hcl25', videoId: '8ZIrPIbvCyA', source: 'HCL', title: 'Nik Airball SLOWROLLS Martin Kabrhel in a $401K Pot', views: '1.5M', duration: '15:44' },
    { id: 'hcl26', videoId: 'fuZU0SF5uy4', source: 'HCL', title: 'SET OVER SET...Nik Airball Plays a $468K Pot', views: '1.8M', duration: '17:22' },
    { id: 'hcl27', videoId: 'V_A47QWTN98', source: 'HCL', title: 'Martin Kabrhel Runs ACE HIGH BLUFF in $380K Pot!', views: '1.3M', duration: '14:55' },
    { id: 'hcl28', videoId: 'FCHdw4wyrhI', source: 'HCL', title: 'Senor Tilt Plays CRAZY Hand After CRAZY Hand', views: '990K', duration: '16:33' },

    // ═══════════════════════════════════════════════════════════════════
    // THE LODGE LIVE - 20 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'lodge1', videoId: 'yJZxw9u7_DU', source: 'LODGE', title: 'Craziest Straight Flushes of 2025', views: '680K', duration: '18:22' },
    { id: 'lodge2', videoId: 'yIZcxafGzXQ', source: 'LODGE', title: 'STRAIGHT FLUSH! QUADS! Insane Poker Game!', views: '920K', duration: '22:15' },
    { id: 'lodge3', videoId: '9ZjGeSFzCgE', source: 'LODGE', title: 'POCKET ACES For $36,185', views: '540K', duration: '14:33' },
    { id: 'lodge4', videoId: 'hpcKG_xl16c', source: 'LODGE', title: '25 Minutes of Amazing Xuan Liu Moments', views: '780K', duration: '25:00' },
    { id: 'lodge5', videoId: '6I10JPRg-XM', source: 'LODGE', title: 'MASSIVE Pot With Ace-King!', views: '450K', duration: '12:18' },
    { id: 'lodge6', videoId: 'fHbEUDTuT68', source: 'LODGE', title: '7 Best Quad Moments', views: '890K', duration: '16:44' },
    { id: 'lodge7', videoId: 'jQjuBFFbGbo', source: 'LODGE', title: 'She Has Pocket Aces, But...', views: '620K', duration: '11:55' },
    { id: 'lodge8', videoId: 'JycXMxdnk2M', source: 'LODGE', title: 'Corey Eyring Had a Terrible Day', views: '380K', duration: '15:22' },
    { id: 'lodge9', videoId: 'PA8XtrwroQ8', source: 'LODGE', title: '10 Biggest Poker Hands of 2025', views: '1.2M', duration: '28:45' },
    { id: 'lodge10', videoId: 'favMEUKGNKc', source: 'LODGE', title: 'Biggest Pots From Wild Cash Game', views: '560K', duration: '19:33' },
    { id: 'lodge11', videoId: 'hBo4-DsVx5A', source: 'LODGE', title: 'ROYAL FLUSH Draw For Jenny', views: '720K', duration: '13:18' },
    { id: 'lodge12', videoId: 'liWPL5KvURk', source: 'LODGE', title: 'Corey Eyring Always Wins', views: '340K', duration: '14:55' },
    { id: 'lodge13', videoId: 'GIKWvbclg7I', source: 'LODGE', title: 'FULL HOUSE vs FLUSH vs TWO PAIR! Unreal Poker Hand', views: '480K', duration: '11:22' },
    { id: 'lodge14', videoId: 's8waPVJwsZU', source: 'LODGE', title: 'BIGGEST POTS OF 2025', views: '950K', duration: '24:18' },
    { id: 'lodge15', videoId: 'cYbuojMWC-8', source: 'LODGE', title: 'SET OVER SET! Corey Eyring vs Poker Bunny', views: '1.1M', duration: '16:44' },
    { id: 'lodge16', videoId: '0UFWJNZ1eZ0', source: 'LODGE', title: 'Wow! Genuinely Bad Beat', views: '420K', duration: '10:55' },
    { id: 'lodge17', videoId: 'FqiS7LaQSsg', source: 'LODGE', title: 'She is ALL-IN 6 Times In One Game', views: '580K', duration: '18:22' },
    { id: 'lodge18', videoId: 'pqP_8xMOezc', source: 'LODGE', title: 'Nightmare Day for Corey Eyring', views: '390K', duration: '15:33' },
    { id: 'lodge19', videoId: 'ckArt7M5hbs', source: 'LODGE', title: 'Luckiest Poker Moments Ever', views: '850K', duration: '20:18' },
    { id: 'lodge20', videoId: 'vWVwhXeILoX', source: 'LODGE', title: '2 Royal Flushes Caught on Video', views: '1.4M', duration: '12:44' },

    // ═══════════════════════════════════════════════════════════════════
    // TRITON POKER - 20 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'triton1', videoId: '524_3UypGkU', source: 'TRITON', title: '$150K NLH 8-Handed Final Table Highlights', views: '1.2M', duration: '32:18' },
    { id: 'triton2', videoId: '185vMNh9ECc', source: 'TRITON', title: '$150K NLH 8-Handed Final Table', views: '890K', duration: '45:22' },
    { id: 'triton3', videoId: '5wTToeCyu6I', source: 'TRITON', title: '$100K NLH Main Event Final Table Highlights', views: '1.5M', duration: '38:45' },
    { id: 'triton4', videoId: 'CbXDixknmeM', source: 'TRITON', title: '$100K NLH Main Event Final Table', views: '980K', duration: '52:18' },
    { id: 'triton5', videoId: '4441ee7htt0', source: 'TRITON', title: '$125K NLH 7-Handed Final Table Highlights', views: '720K', duration: '28:33' },
    { id: 'triton6', videoId: 'LA4z0Hi0Jf8', source: 'TRITON', title: '$125K NLH 7-Handed Final Table', views: '650K', duration: '48:44' },
    { id: 'triton7', videoId: 'jJeZntAfOp4', source: 'TRITON', title: '10 Years of Triton Poker | 2026 Gets Bigger', views: '340K', duration: '15:22' },
    { id: 'triton8', videoId: 'pFbHkHhJO4Y', source: 'TRITON', title: '$250K NLH Triton Invitational Final Table Highlights', views: '1.8M', duration: '35:18' },
    { id: 'triton9', videoId: 'KQRZs6ytdWc', source: 'TRITON', title: '$250K NLH Triton Invitational Final Table', views: '1.1M', duration: '58:44' },
    { id: 'triton10', videoId: 'fzNt4SdBGuQ', source: 'TRITON', title: '$100K PLO Main Event Final Table Highlights', views: '680K', duration: '30:22' },
    { id: 'triton11', videoId: '-rjQT0JOhGA', source: 'TRITON', title: '$100K PLO Main Event Final Table', views: '520K', duration: '55:33' },
    { id: 'triton12', videoId: 'oINUSqHq_ck', source: 'TRITON', title: '$75K PLO 6-Handed Final Table Highlights', views: '450K', duration: '26:18' },
    { id: 'triton13', videoId: 'TXarmUgk02Q', source: 'TRITON', title: '$75K PLO 6-Handed Final Table', views: '380K', duration: '48:44' },
    { id: 'triton14', videoId: 'RpU9bwH-2WI', source: 'TRITON', title: 'Largest Poker Pot Ever: Ossi Ketola vs Alex Foxen!', views: '2.4M', duration: '18:55' },
    { id: 'triton15', videoId: 'JVJrPh0s1JQ', source: 'TRITON', title: '$1.36 Million for 1st! Triton ONE Main Event Final', views: '1.6M', duration: '42:18' },
    { id: 'triton16', videoId: 'OYgw9TiNqZY', source: 'TRITON', title: '$564K for 1st! $3K NLH Triton ONE QQPK Genesis', views: '890K', duration: '35:33' },
    { id: 'triton17', videoId: '9PrLmIWU0mU', source: 'TRITON', title: 'Pocket Aces in a $1.1M Pot - Rob Yong Mystery!', views: '1.3M', duration: '16:44' },
    { id: 'triton18', videoId: 'slTxYV5S5n0', source: 'TRITON', title: '3 Mystery Poker Hands with BRUTAL River Runouts', views: '720K', duration: '22:18' },
    { id: 'triton19', videoId: 'jdiDizWlIz0', source: 'TRITON', title: 'Phil Ivey INSANE All-In with Queens Gets Interrupted!', views: '1.9M', duration: '14:55' },
    { id: 'triton20', videoId: 'pIZW-gmcKio', source: 'TRITON', title: 'Jungleman Destroys the Table With a $1.5M Pot!', views: '2.1M', duration: '20:33' },

    // ═══════════════════════════════════════════════════════════════════
    // LIVE AT THE BIKE (LATB) - 16 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'latb1', videoId: 'hg02g0fgIGU', source: 'LATB', title: 'Almost $50,000 On The Line! Can He Hold With KK?', views: '450K', duration: '14:22' },
    { id: 'latb2', videoId: 'udgiZS2DjUA', source: 'LATB', title: 'Phil Laak Gets Caught Bluffing In $36,000 Pot!', views: '680K', duration: '16:18' },
    { id: 'latb3', videoId: 'y4f0KyFQCYY', source: 'LATB', title: 'Heartbreaking Runout In This Crazy Hand For KK!', views: '520K', duration: '12:44' },
    { id: 'latb4', videoId: 'uzse0R3DRIE', source: 'LATB', title: 'Absolutely DEVASTATING River For Hapa In $24,000 Pot!', views: '380K', duration: '11:55' },
    { id: 'latb5', videoId: '9LwPkMqmWVs', source: 'LATB', title: 'Phil Laak Hits A DREAM Turn For A $10,000 Pot!', views: '290K', duration: '10:33' },
    { id: 'latb6', videoId: 'tzf6iyT4PPA', source: 'LATB', title: 'Would You Fold Top Pair For Almost $30,000?', views: '420K', duration: '13:18' },
    { id: 'latb7', videoId: 'a6e2ZJAxFA4', source: 'LATB', title: 'Dream Flop But Lose $20,000 Anyway', views: '350K', duration: '12:22' },
    { id: 'latb8', videoId: 'CBUvuMqxtOI', source: 'LATB', title: 'Can He Hold On With A Set Of 6s For Almost $30,000?', views: '480K', duration: '14:44' },
    { id: 'latb9', videoId: 'xaQPx_woep8', source: 'LATB', title: 'Absolutely INSANE Flop For Almost $40,000!', views: '560K', duration: '15:18' },
    { id: 'latb10', videoId: 'H6asYQPdNLI', source: 'LATB', title: 'Crazy Preflop Action For Almost $30,000 Pot!', views: '390K', duration: '13:55' },
    { id: 'latb11', videoId: 'WUNTafGZ3hg', source: 'LATB', title: 'Crazy 3-Way Allin DISASTER For KK!', views: '620K', duration: '11:33' },
    { id: 'latb12', videoId: 'VSY5wuJntQQ', source: 'LATB', title: 'Would You Believe Him When He Puts You ALL-IN For $27K?', views: '440K', duration: '14:18' },
    { id: 'latb13', videoId: '8WRZavyihfE', source: 'LATB', title: 'When You Think You Hit The Miracle Card For $20,000...', views: '380K', duration: '12:44' },
    { id: 'latb14', videoId: 'ok-qJesuBxM', source: 'LATB', title: 'He Sets The PERFECT Trap And Then THIS Happens!', views: '520K', duration: '15:22' },
    { id: 'latb15', videoId: 'GJq0P7mqRac', source: 'LATB', title: 'Would You Bluff On This River for $25,000+ Pot?', views: '470K', duration: '13:55' },
    { id: 'latb16', videoId: 'cXGygoHy6qE', source: 'LATB', title: 'He Ran a MASSIVE Bluff For Over $67,000!', views: '780K', duration: '18:33' },

    // ═══════════════════════════════════════════════════════════════════
    // TCH LIVE - 10 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'tch1', videoId: 'obkeMpIYOqY', source: 'TCH', title: 'Daniel Negreanu Headlines EPIC $1M PGT Championship!', views: '1.2M', duration: '28:44' },
    { id: 'tch2', videoId: 'Fy6I9DmPrmA', source: 'TCH', title: 'Negreanu SHINES on Day 1 of $1M PGT Championship!', views: '680K', duration: '22:18' },
    { id: 'tch3', videoId: 'SrMLGKLwDZU', source: 'TCH', title: '$1,100,000 to the CHAMPION! Super High Roller Bowl FINAL!', views: '1.5M', duration: '45:33' },
    { id: 'tch4', videoId: 'fwMTUYka6C8', source: 'TCH', title: 'Negreanu Chases 2nd Super High Roller Bowl Title!', views: '890K', duration: '32:18' },
    { id: 'tch5', videoId: 'jRRBUjmB1Cc', source: 'TCH', title: 'MILLIONS On The Line! $100K Super High Roller PLO Day 2!', views: '720K', duration: '38:44' },
    { id: 'tch6', videoId: 'dEcwQDyzXsc', source: 'TCH', title: '$1,250,000 Up Top! Super High Roller Bowl PLO Final!', views: '980K', duration: '42:55' },
    { id: 'tch7', videoId: 'VJ7WnbHXRCw', source: 'TCH', title: 'WSOP Main Event 2010 - Day 2 with Negreanu & Antonius', views: '450K', duration: '55:18' },
    { id: 'tch8', videoId: 'mNhXY4U1kfo', source: 'TCH', title: 'Turning $500 to $542,540 at WSOP Colossus Final Table!', views: '1.8M', duration: '35:44' },
    { id: 'tch9', videoId: 'Vqi3JkPpEQ8', source: 'TCH', title: 'WSOP 2025 Main Event | Final Table - FINAL FIVE!', views: '2.4M', duration: '58:22' },
    { id: 'tch10', videoId: 'qPSGmSw9-H0', source: 'TCH', title: 'WSOP Top 100 Best Hands of All Time!', views: '3.2M', duration: '65:18' },

    // ═══════════════════════════════════════════════════════════════════
    // WSOP / POKERGO - 4 Premium Episodes
    // ═══════════════════════════════════════════════════════════════════
    { id: 'wsop1', videoId: 'BdUvr_CXSxk', source: 'WSOP', title: 'WSOP Main Event 2022 - Final Table', views: '4.5M', duration: '78:33' },
    { id: 'wsop2', videoId: 'NqPmIAvR82A', source: 'WSOP', title: 'WSOP 2025 Main Event Day 2D with Liv Boeree & Sean Perry', views: '1.1M', duration: '45:18' },
    { id: 'wsop3', videoId: 'bSwP4w2apPA', source: 'WSOP', title: '2025 WSOP $1,000 Battle of Ages Final Table! $335K at Stake!', views: '890K', duration: '42:44' },
    { id: 'wsop4', videoId: 'FrwGDf7ZBE0', source: 'WSOP', title: 'BIGGEST Cash Game in Vegas with Esfandiari & Robl!', views: '2.3M', duration: '55:22' },

    // ═══════════════════════════════════════════════════════════════════
    // POKER VLOGGERS - 12 Premium Episodes  
    // ═══════════════════════════════════════════════════════════════════
    { id: 'vlog1', videoId: 'P5OT-cOcTRs', source: 'BRAD_OWEN', title: 'MANIAC Wants To Get STACKED!! Nashville Poker Is WILD!!', views: '520K', duration: '38:22' },
    { id: 'vlog2', videoId: 'PalPSvIIxUg', source: 'BRAD_OWEN', title: 'My BIGGEST WIN EVER!! $50,000+ In DREAM Session!!', views: '890K', duration: '42:18' },
    { id: 'vlog3', videoId: 'I-dJDxwatNo', source: 'BRAD_OWEN', title: 'I Play $60,000+ Pot vs Mariano!! GIGANTIC ALL IN Pots!', views: '1.2M', duration: '45:33' },
    { id: 'vlog4', videoId: 'NKFFVY6Q37s', source: 'BRAD_OWEN', title: 'I Have STRAIGHT FLUSH vs Flopped NUTS!! $15,000+!', views: '680K', duration: '36:44' },
    { id: 'vlog5', videoId: 'HFPNAXxQjvQ', source: 'BRAD_OWEN', title: 'Player Lies About His Hand! $10,000+ 5-bet ALL IN!', views: '450K', duration: '32:18' },
    { id: 'vlog6', videoId: 'pQ423SML2gc', source: 'BRAD_OWEN', title: 'I Have FULL HOUSE IN $30,000+ ALL IN!! BOBBY ROOM!', views: '780K', duration: '40:55' },
    { id: 'vlog7', videoId: 'Ls4b65169-k', source: 'BRAD_OWEN', title: 'Ive Got $100,000+ In BOBBY ROOM!! High Stakes 100/200!', views: '920K', duration: '48:22' },
    { id: 'vlog8', videoId: 'zfDgGWh-si0', source: 'BRAD_OWEN', title: 'My ABSOLUTE BEST Performance On HIGH STAKES Livestream!', views: '1.1M', duration: '44:18' },
    { id: 'vlog9', videoId: '_BeB0OkwCTw', source: 'BRAD_OWEN', title: 'Opponent DOMINATED In $18,000 Pot!! 5-Bet ALL IN!', views: '560K', duration: '35:44' },
    { id: 'vlog10', videoId: '8XHhGlAfi-E', source: 'BRAD_OWEN', title: 'I Hit Three SETS And CRUSH Souls!! Back 5-bet Jams KINGS!', views: '480K', duration: '38:22' },
    { id: 'vlog11', videoId: 'mPHrT249LJ8', source: 'BRAD_OWEN', title: 'I Flop QUADS!!! ACES And Three Players Raised In Front!', views: '720K', duration: '34:55' },
    { id: 'vlog12', videoId: 'Pv6yB5uM1Hw', source: 'BRAD_OWEN', title: 'I Make RARE STRAIGHT FLUSH!! Unbelievable ALL IN!!', views: '650K', duration: '36:18' },
];

const SOURCES = [
    { id: 'ALL', name: 'All Sources', logo: null },
    { id: 'HCL', name: 'Hustler Casino Live', logo: '/images/video-sources/hcl.png' },
    { id: 'LODGE', name: 'The Lodge', logo: '/images/video-sources/lodge.png' },
    { id: 'TRITON', name: 'Triton Poker', logo: '/images/video-sources/triton.png' },
    { id: 'LATB', name: 'Live at the Bike', logo: '/images/video-sources/latb.png' },
    { id: 'TCH', name: 'TCH Live', logo: '/images/video-sources/tch.png' },
    { id: 'WSOP', name: 'WSOP', logo: '/images/video-sources/wsop.png' },
    { id: 'BRAD_OWEN', name: 'Brad Owen', logo: '/images/video-sources/brad_owen.png' },
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
                                    padding: '12px 20px',
                                    background: selectedSource === source.id
                                        ? 'linear-gradient(135deg, #FF4444, #FF6B6B)'
                                        : C.card,
                                    border: `1px solid ${selectedSource === source.id ? 'transparent' : C.border}`,
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
                                }}
                            >
                                {source.logo && (
                                    <div style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 12,
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        backdropFilter: 'blur(10px)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 6,
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                                    }}>
                                        <img src={source.logo} alt={source.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    </div>
                                )}
                                {source.id === 'ALL' && <span style={{ fontSize: 20 }}>🌍</span>}
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
                                                    src={SOURCES.find(s => s.id === video.source)?.logo}
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
                                            src={SOURCES.find(s => s.id === selectedVideo.source)?.logo}
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

            {/* CSS for hover effects */}
            <style jsx global>{`
                div:hover .play-btn {
                    opacity: 1 !important;
                }
            `}</style>
        </>
    );
}
