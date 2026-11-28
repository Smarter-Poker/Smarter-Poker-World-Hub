/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BORDER-STATE, AIRPORT & DRIVE-TIME POKER TRAVEL CORRIDORS
 *  (src/content/guides/corridors.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative geographic routing and comparison corpus for the 10 highest-intent
 * border-state, airport-to-cardroom, and regional drive-time live poker corridors
 * in North America.
 *
 * House style: Title Case, zero em dashes.
 */

import { listedVenueLabel } from '../../lib/venueCount.mjs';

export const CORRIDORS_AS_OF = '2026-11-24';
export const CORRIDORS_BASE_PATH = '/poker-rooms/corridors';
export const CORRIDORS_URL = 'https://smarter.poker/poker-rooms/corridors';

export function corridorGuidePath(slug) {
  return `${CORRIDORS_BASE_PATH}/${slug}`;
}

export const POKER_TRAVEL_CORRIDORS = [
  {
    slug: 'atlanta-to-cherokee-and-florida',
    name: 'Atlanta GA Legal Poker Border Options: Harrah\'s Cherokee NC Vs. Jacksonville/Tampa FL Cardrooms',
    shortTitle: 'Atlanta GA To Cherokee NC And Florida Cardrooms',
    originCity: 'Atlanta, GA',
    originAirportCode: 'ATL',
    originCoords: { lat: 33.749, lng: -84.388 },
    bestForPersona: 'Georgia Cash And Circuit Players Comparing A 3-Hour Mountain Drive To Harrah\'s Cherokee Against A 5-Hour Drive Or 1-Hour Flight To Florida Pari-Mutuel Rooms.',
    ifThenBecause: 'If You Are Driving From Metro Atlanta For A Weekend WSOP Circuit Or $2/$5 Cash Trip, Choose Harrah\'s Cherokee NC (165 Miles North via I-85 And US-441) Because It Cuts Round-Trip Driving By 3.5 Hours Compared To Jacksonville; However, If You Plan A 4+ Day Cash Grind Or Are Age 18-20, Fly Or Drive To Jacksonville BestBet Or Tampa Hard Rock Because Florida Imposes 0% State Income Tax And Spreads 18+ Action At bestbet Jacksonville.',
    summary:
      'Georgia Has Zero Regulated Commercial Or Tribal Poker Rooms, Forcing Metro Atlanta\'s 6.3 Million Residents To Travel North To Harrah\'s Cherokee In North Carolina Or South To bestbet Jacksonville And Seminole Hard Rock Tampa In Florida.',
    driveOptions: [
      {
        venueName: 'Harrah\'s Cherokee Casino Resort (WSOP Circuit Host)',
        jurisdiction: 'Cherokee, North Carolina (Tribal Compact)',
        distanceMiles: 165,
        driveMinutes: 185,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 Promotional / Bad Beat Drop',
        taxWithholding: '4.25% NC State Tax + 24% Federal W-2G On Net Tournament Wins > $5,000',
        typicalGames: '$1/$2 & $2/$5 NLH, $2/$5 PLO, Four Annual WSOP Circuit Stops',
      },
      {
        venueName: 'Harrah\'s Cherokee Valley River',
        jurisdiction: 'Murphy, North Carolina (Tribal Compact)',
        distanceMiles: 118,
        driveMinutes: 135,
        rakeModel: '10% Pot Rake Up To $6 Cap + $1-$2 Promo Drop (Electronic / Regional Tables)',
        taxWithholding: '4.25% NC State Income Tax On Qualifying W-2G Payouts',
        typicalGames: '$1/$2 & $1/$3 NLH Weekend Border Cash Games',
      },
      {
        venueName: 'bestbet Jacksonville & bestbet Orange Park',
        jurisdiction: 'Jacksonville, Florida (Pari-Mutuel Cardroom, 18+ Entry)',
        distanceMiles: 346,
        driveMinutes: 310,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 High-Hand / Jackpot Drop',
        taxWithholding: '0.0% Florida State Income Tax (24% Federal W-2G Only Above $5,000)',
        typicalGames: '$1/$2, $2/$5, $5/$10 NLH, $2/$5 & $5/$5 PLO, WPT Tour Stops',
      },
      {
        venueName: 'Seminole Hard Rock Hotel & Casino Tampa',
        jurisdiction: 'Tampa, Florida (21+ Tribal Casino Resort)',
        distanceMiles: 456,
        driveMinutes: 405,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 High-Hand Promotional Drop',
        taxWithholding: '0.0% Florida State Income Tax On Cash And Tournament Winnings',
        typicalGames: '24/7 $1/$2 To $10/$25 NLH, Deep $2/$2 & $5/$5 PLO, WPT Tampa Series',
      },
    ],
    faqs: [
      {
        q: 'What Is The Closest Legal Live Poker Room To Atlanta, Georgia?',
        a: 'Harrah\'s Cherokee Casino Resort In Cherokee, North Carolina Is The Closest Full-Scale 20+ Table WSOP Poker Room To Atlanta At 165 Miles (Approximately 3 Hours And 5 Minutes Via I-85 North And US-441 North).',
      },
      {
        q: 'Can An 18-Year-Old From Atlanta Play Legal Live Poker Nearby?',
        a: 'Harrah\'s Cherokee In North Carolina Requires Players To Be 21+, Whereas bestbet Jacksonville And bestbet Orange Park In North Florida Legally Admit Players Age 18 And Older Under Florida Pari-Mutuel Cardroom Statutes.',
      },
    ],
  },
  {
    slug: 'nyc-to-parx-borgata-wind-creek',
    name: 'New York City Metro Legal Live Poker Corridor: Parx PA, Wind Creek PA & Borgata Atlantic City NJ',
    shortTitle: 'NYC Metro To Parx PA, Wind Creek And Borgata NJ',
    originCity: 'New York City, NY',
    originAirportCode: 'JFK',
    originCoords: { lat: 40.7128, lng: -74.006 },
    bestForPersona: 'Manhattan, Brooklyn, Queens, And North Jersey Players Choosing Between Bensalem PA, Bethlehem PA, And Atlantic City NJ For Daily Cash Or Weekend Deepstacks.',
    ifThenBecause: 'If You Want The Highest Tuesday-Through-Friday Mid-Stakes Cash Game Density ($2/$5 To $10/$10 NLH And PLO) Within 90 Minutes Of Midtown Manhattan, Drive To Parx Casino In Bensalem PA Because It Concentrates Its Mid-Stakes Games On A Single Non-Smoking Floor; If You Prefer Full Resort Comps, Hotel Suites, And Regulated NJ Online Poker Simultaneously, Drive 125 Miles South To Borgata In Atlantic City.',
    summary:
      'While Downstate New York Casino Licenses Expand Toward Full Poker Floors, New York City\'s Primary Live Poker Corridor Runs Southwest Across New Jersey Into Bensalem And Bethlehem, Pennsylvania And South To Borgata In Atlantic City.',
    driveOptions: [
      {
        venueName: 'Parx Casino Poker Room',
        jurisdiction: 'Bensalem, Pennsylvania (PA Gaming Control Board)',
        distanceMiles: 78,
        driveMinutes: 90,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 Bad Beat / High-Hand Drop ($8-$9 Timed Collection At $5/$10+)',
        taxWithholding: '3.07% Flat Pennsylvania State Tax + 24% Federal W-2G On Net Tournament Wins > $5,000',
        typicalGames: 'Premier $1/$3, $2/$5, $5/$10, $10/$10 NLH, $2/$2 To $10/$25 PLO, Big Stax Series',
      },
      {
        venueName: 'Wind Creek Bethlehem Poker Room',
        jurisdiction: 'Bethlehem, Pennsylvania (PA Gaming Control Board)',
        distanceMiles: 86,
        driveMinutes: 95,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 Bad Beat Jackpot Drop',
        taxWithholding: '3.07% Pennsylvania State Tax On Qualifying W-2G Tournament Payouts',
        typicalGames: 'Fast I-78 Corridor Access, $1/$2 & $2/$5 NLH, $2/$2 PLO',
      },
      {
        venueName: 'Borgata Hotel Casino & Spa Poker Room',
        jurisdiction: 'Atlantic City, New Jersey (NJ Division Of Gaming Enforcement)',
        distanceMiles: 127,
        driveMinutes: 135,
        rakeModel: '10% Pot Rake Up To $5-$6 Cap + $2 Promotional Drop ($7-$8 Time Charge At $5/$10+)',
        taxWithholding: '3.0% To 8.0% NJ Withholding On Resident/Non-Resident W-2G Wins > $5,000',
        typicalGames: 'East Coast Flagship Resort Room, $1/$3 To $10/$25 NLH, PLO, Stud, MGM Rewards',
      },
      {
        venueName: 'Rivers Casino Philadelphia',
        jurisdiction: 'Philadelphia, Pennsylvania (PA Gaming Control Board)',
        distanceMiles: 95,
        driveMinutes: 105,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 High-Hand / Bad Beat Drop',
        taxWithholding: '3.07% Pennsylvania Flat State Tax On Qualifying W-2G Events',
        typicalGames: 'High-Action $1/$2 & $2/$5 NLH, Deep $2/$2 PLO, Free Self-Parking',
      },
    ],
    faqs: [
      {
        q: 'Is Parx Or Borgata Closer To Manhattan For Live Cash Poker?',
        a: 'Parx Casino In Bensalem, Pennsylvania Is Approximately 78 Miles (85 To 95 Minutes Via The NJ Turnpike To Exit 6 And US-1) From Midtown Manhattan, Making It 40 To 45 Minutes Closer Than Borgata In Atlantic City (127 Miles).',
      },
      {
        q: 'Can I Play Regulated Online Poker While Visiting Borgata Or Parx From NYC?',
        a: 'Yes. Once Your Device Physically Crosses The Hudson Or Delaware River Into New Jersey Or Pennsylvania, You Can Legally Log Into State-Regulated Real-Money Online Poker Apps (WSOP Online, PokerStars, BetMGM) Regardless Of Your New York Residency.',
      },
    ],
  },
  {
    slug: 'dallas-to-winstar-choctaw-tch',
    name: 'DFW Metro Border Corridor: WinStar & Choctaw Oklahoma Casino Resort Vs. Texas Card House Social Clubs',
    shortTitle: 'Dallas-Fort Worth To Oklahoma Casinos And Texas Clubs',
    originCity: 'Dallas-Fort Worth, TX',
    originAirportCode: 'DFW',
    originCoords: { lat: 32.8998, lng: -97.0403 },
    bestForPersona: 'North Texas Players Weighing Zero-Pot-Rake Local Texas Time-Collection Clubs Against Full Resort Amenities And WSOP Circuit Series Just Across The Red River In Oklahoma.',
    ifThenBecause: 'If You Play Deep-Stack $1/$2 Or $2/$5 Cash Games And Win More Than 3 Pots Per Hour, Play Locally At Texas Card House Dallas Or Poker House Dallas Because Paying $12-$13/Hr Seat Time With $0 Pot Rake Saves $12-$20/Hr Compared To A 10% Pot Rake; If You Want Official WSOP Circuit Rings, Hotel Resort Pools, And Regulated Table Games, Drive 75 Minutes North On I-35 Or US-75 To WinStar Or Choctaw Durant.',
    summary:
      'The Dallas-Fort Worth Metroplex Sits At The Intersection Of Two Completely Different Live Poker Economic Models: Local Private Membership Time-Rake Card Clubs In Dallas And Massive Tribal Casino Resorts 70 To 85 Miles North Across The Oklahoma Border.',
    driveOptions: [
      {
        venueName: 'Texas Card House (TCH) Dallas / Las Colinas & Poker House Dallas',
        jurisdiction: 'Dallas / Irving, Texas (Private Membership Social Card Club)',
        distanceMiles: 12,
        driveMinutes: 18,
        rakeModel: '$0.00 Pot Rake | $12 To $14 Per Hour Seat Rental + Daily/Monthly Membership',
        taxWithholding: '0.0% Texas State Income Tax (Federal W-2G On Net Tournament Wins > $5,000)',
        typicalGames: 'Deep $1/$2 ($500 Cap), $2/$5 ($1,500 Cap), $5/$5 Double-Board PLO Bomb Pots',
      },
      {
        venueName: 'WinStar World Casino & Resort Poker Room',
        jurisdiction: 'Thackerville, Oklahoma (Chickasaw Nation Tribal Compact)',
        distanceMiles: 74,
        driveMinutes: 75,
        rakeModel: '10% Pot Rake Up To $6 Cap + $1-$2 Promotional Jackpot Drop',
        taxWithholding: '4.75% Top Oklahoma Non-Resident State Tax Reference On Major W-2G Payouts',
        typicalGames: 'Just Across Red River On I-35 Exit 1, 24/7 $1/$2 & $2/$5 NLH, Omaha, Resort Comps',
      },
      {
        venueName: 'Choctaw Casino & Resort Durant Poker Room (WSOP Circuit Host)',
        jurisdiction: 'Durant, Oklahoma (Choctaw Nation Tribal Compact)',
        distanceMiles: 86,
        driveMinutes: 85,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 Jackpot Drop',
        taxWithholding: 'Oklahoma Non-Resident Gaming Tax Reference + 24% Federal W-2G Above $5,000',
        typicalGames: '$1/$2, $2/$5, $5/$10 NLH, $2/$5 PLO',
      },
    ],
    faqs: [
      {
        q: 'How Much Do You Save In Rake At A Dallas Social Poker Club Vs. An Oklahoma Casino?',
        a: 'In A Splashy $1/$2 Or $2/$5 Cash Game Where You Win 3.5 Contested Pots Per Hour, A 10% Up To $6 Cap Plus $2 Promo Drop Costs Roughly $24 To $28 Per Hour In Imputed Rake, Whereas A Dallas Time-Collection Club Charges A Flat $12 To $14 Per Hour With Zero Chips Removed From Any Pot.',
      },
      {
        q: 'Which Oklahoma Casino Hosts The Official WSOP Circuit Near Dallas?',
        a: 'Choctaw Casino & Resort In Durant, Oklahoma (86 Miles Northeast Of Dallas Via US-75 North) Hosts Multiple Official WSOP Circuit Series Each Year In Its Grand Theater And Sky Tower Poker Room.',
      },
    ],
  },
  {
    slug: 'chicago-to-indiana-and-rivers',
    name: 'Chicagoland Live Poker Corridor: Horseshoe Hammond IN, Rivers Des Plaines IL & Grand Victoria Elgin',
    shortTitle: 'Chicagoland To Rivers Des Plaines And Northwest Indiana',
    originCity: 'Chicago, IL',
    originAirportCode: 'ORD',
    originCoords: { lat: 41.8781, lng: -87.6298 },
    bestForPersona: 'Chicagoland And Midwest Players Comparing O\'Hare Airport Proximity At Rivers Des Plaines Against Cross-Border Indiana Tax And WSOP Action At Horseshoe Hammond.',
    ifThenBecause: 'If You Are Flying Into O\'Hare (ORD) Or Want The Deepest Daily $1/$3 To $5/$10 Cash Waitlist In Illinois, Drive 10 Minutes To Rivers Casino Des Plaines Because Its 22-Table Room Runs Non-Stop Action; If You Are Grinding A Major WSOP Circuit Stop Or Live On Chicago\'s South Side, Take The Chicago Skyway (I-90 East) 22 Minutes To Horseshoe Hammond In Indiana Where Indiana\'s Flat State Tax Is Lower (3.05% Vs. 4.95% In Illinois).',
    summary:
      'The Chicagoland Metro Poker Corridor Spans Two States Within A 35-Minute Drive: Suburban Illinois Commercial Casinos Led By Rivers Des Plaines And Grand Victoria Elgin, And Northwest Indiana Lakefront Properties Led By Horseshoe Hammond.',
    driveOptions: [
      {
        venueName: 'Rivers Casino Des Plaines Poker Room',
        jurisdiction: 'Des Plaines, Illinois (Illinois Gaming Board - 3 Miles From ORD)',
        distanceMiles: 17,
        driveMinutes: 25,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 Bad Beat / High-Hand Drop',
        taxWithholding: '4.95% Flat Illinois State Tax + 24% Federal W-2G On Net Tournament Wins > $5,000',
        typicalGames: 'Peak Chicagoland Cash Volume, $1/$3, $2/$5, $5/$10 NLH, $2/$2 & $5/$5 PLO',
      },
      {
        venueName: 'Horseshoe Hammond Casino Poker Room (Caesars Rewards)',
        jurisdiction: 'Hammond, Indiana (Indiana Gaming Commission - Just Across State Line)',
        distanceMiles: 21,
        driveMinutes: 26,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 Promotional Jackpot Drop',
        taxWithholding: '3.05% Flat Indiana State Tax + 24% Federal W-2G Above $5,000',
        typicalGames: '$1/$2 & $2/$5 NLH, Deep PLO, Historic WSOP Circuit Midwest Stop',
      },
      {
        venueName: 'Grand Victoria Casino Elgin Poker Room',
        jurisdiction: 'Elgin, Illinois (Illinois Gaming Board)',
        distanceMiles: 38,
        driveMinutes: 45,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 Jackpot Drop',
        taxWithholding: '4.95% Flat Illinois State Income Tax On Qualifying W-2G Events',
        typicalGames: 'MSPT & WSOP Circuit Host, Daily Tournaments, $1/$2 & $2/$5 Cash',
      },
    ],
    faqs: [
      {
        q: 'Which Poker Room Is Closest To Chicago O\'Hare Airport (ORD)?',
        a: 'Rivers Casino Des Plaines Is Located Just 3.2 Miles (Under 10 Minutes By Taxi Or Rideshare) From Chicago O\'Hare International Airport Terminals, Making It One Of The Closest Airport-Adjacent Poker Rooms In The United States.',
      },
      {
        q: 'Does Illinois Or Indiana Have A Lower State Tax Rate On Poker Winnings?',
        a: 'Indiana Levies A Lower Flat State Individual Income Tax Rate Of 3.05% Compared To Illinois\'s 4.95% Flat State Income Tax Rate.',
      },
    ],
  },
  {
    slug: 'boston-to-encore-and-new-hampshire',
    name: 'New England Live Poker Corridor: Encore Boston Harbor MA Vs. Nashua/Salem NH Charitable Cardrooms',
    shortTitle: 'Boston MA To Encore And New Hampshire Cardrooms',
    originCity: 'Boston, MA',
    originAirportCode: 'BOS',
    originCoords: { lat: 42.3601, lng: -71.0589 },
    bestForPersona: 'Greater Boston And New England Players Comparing Luxury 5-Star Resort Cash Games In Everett MA Against Tax-Free New Hampshire Charitable Poker Rooms 40 Minutes North.',
    ifThenBecause: 'If You Want Luxury 5-Star Resort Tables, Deep $2/$5 To $10/$25 Cash Games, And Immediate Access From Downtown Boston Or Logan Airport, Play At Encore Boston Harbor (15 Minutes From BOS); If You Want Recurring Daily NLH Tournaments, $1/$2 To $2/$5 Cash With Lower Parking/Dining Costs, And 0% State Income Tax Jurisdiction In New Hampshire, Drive 35-45 Minutes North On I-93 Or US-3 To Chasers Poker Room In Salem NH Or Gate City Casino In Nashua NH.',
    summary:
      'Greater Boston Players Enjoy A Unique Dual-State Corridor: Wynn\'s Ultra-Luxury Encore Boston Harbor Resort Just 4 Miles North Of Downtown Boston, And A Booming Network Of Regulated New Hampshire Charitable Cardrooms Just Across The Border Along I-93 And Route 3.',
    driveOptions: [
      {
        venueName: 'Encore Boston Harbor Poker Room (Wynn Rewards)',
        jurisdiction: 'Everett, Massachusetts (Massachusetts Gaming Commission)',
        distanceMiles: 5,
        driveMinutes: 15,
        rakeModel: '10% Pot Rake Up To $8-$10 Cap + $2 Promotional Drop (Massachusetts High-Cap Structure)',
        taxWithholding: '5.0% Massachusetts State Income Tax (+4% Surtax Over $1M) On W-2G Wins > $5,000',
        typicalGames: '24 Luxury Tables: $1/$3, $2/$5, $5/$10+ NLH, $2/$2 & $5/$5 PLO',
      },
      {
        venueName: 'Chasers Poker Room & Casino',
        jurisdiction: 'Salem, New Hampshire (NH Lottery Commission Charitable Gaming)',
        distanceMiles: 34,
        driveMinutes: 38,
        rakeModel: '10% Pot Rake Up To $6-$7 Cap + $1-$2 Bad Beat / High-Hand Drop',
        taxWithholding: '0.0% New Hampshire State Tax On Earned/Gambling Winnings (24% Federal W-2G Only)',
        typicalGames: 'Daily Deepstack Tournaments, $1/$2 & $2/$5 NLH, $1/$2 & $2/$5 PLO',
      },
      {
        venueName: 'Gate City Casino (Formerly Boston Billiard Club & Casino)',
        jurisdiction: 'Nashua, New Hampshire (NH Lottery Commission Charitable Gaming)',
        distanceMiles: 43,
        driveMinutes: 46,
        rakeModel: '10% Pot Rake Up To $6-$7 Cap + Promotional Drop',
        taxWithholding: '0.0% New Hampshire State Income Tax On Gambling Winnings',
        typicalGames: '$1/$2 & $2/$5 NLH, Omaha, Weekend Series Events',
      },
      {
        venueName: 'Foxwoods Resort Casino & Mohegan Sun',
        jurisdiction: 'Mashantucket / Uncasville, Connecticut (Tribal Compacts)',
        distanceMiles: 102,
        driveMinutes: 105,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 Bad Beat / High-Hand Drop',
        taxWithholding: '6.99% Top Connecticut State Tax Reference On Major W-2G Tournament Prizes',
        typicalGames: 'Daily Tournaments, $1/$2 To $5/$10 NLH, Stud & PLO',
      },
    ],
    faqs: [
      {
        q: 'Why Do Many Boston Players Drive 40 Minutes North To New Hampshire Poker Rooms?',
        a: 'New Hampshire Charitable Cardrooms (Such As Chasers In Salem And Gate City In Nashua) Offer Lower Pot Rake Caps ($6-$7 Vs. $8-$10 At Encore), Full Daily Multi-Table Tournament Schedules, And 0% New Hampshire State Tax Withholding At The Cage.',
      },
      {
        q: 'How Far Is Encore Boston Harbor From Boston Logan Airport (BOS)?',
        a: 'Encore Boston Harbor In Everett Is Only 4.8 Miles From Boston Logan International Airport (12 To 18 Minutes Via Route 1A And Route 16 Or By Encore Harbor Shuttle Boat).',
      },
    ],
  },
  {
    slug: 'seattle-to-portland-northwest',
    name: 'Pacific Northwest Corridor: Seattle Washington 15-Cardroom Network Vs. Portland Meadows Social Fee Model',
    shortTitle: 'Seattle WA To Portland OR Pacific Northwest Corridor',
    originCity: 'Seattle, WA',
    originAirportCode: 'SEA',
    originCoords: { lat: 47.6062, lng: -122.3321 },
    bestForPersona: 'Pacific Northwest Players Comparing Washington\'s State-Mandated $300-$400 Single-Bet Cap Cardrooms Against Oregon\'s Zero-Pot-Rake Social Door-Fee Poker Clubs And Pendleton Tribal Stops.',
    ifThenBecause: 'If You Are In The Seattle-Tacoma Metro Area And Want Immediate Cash Action With Massive Bad Beat Jackpots, Play At Fortune Poker In Renton Or Caribbean Cardroom In Kirkland ( noting Washington\'s Statutory $300-$400 Single-Wager Limit); If You Want Uncapped True No-Limit Tournament Series And Zero-Pot-Rake Cash Games, Take I-5 South 170 Miles To Portland Meadows / Final Table Poker Club In Portland Oregon.',
    summary:
      `The I-5 Pacific Northwest Poker Corridor Connects Two Unusual Regulatory Regimes: Washington State (0% State Income Tax, ${listedVenueLabel('WA')} In The Smarter.Poker Directory, Statutory Single-Wager Limits) And Portland, Oregon (Zero-Rake Social Door-Fee Clubs With True Uncapped No-Limit Play).`,
    driveOptions: [
      {
        venueName: 'Fortune Poker (Renton) & Caribbean Cardroom (Kirkland)',
        jurisdiction: 'Seattle Metro, Washington (WA Gambling Commission)',
        distanceMiles: 14,
        driveMinutes: 20,
        rakeModel: '10% Pot Rake Up To $5-$6 Cap + $2 Monte Carlo / Bad Beat Jackpot Drop',
        taxWithholding: '0.0% Washington State Income Tax (24% Federal W-2G Only)',
        typicalGames: '$1/$3 & $3/$5 Spread-Limit Hold\'em ($300-$400 Max Single Bet By WA Law), Omaha, High-Hand Promos',
      },
      {
        venueName: 'Muckleshoot Casino Resort & Tulalip Resort Area Rooms',
        jurisdiction: 'Auburn / Puget Sound, Washington (Tribal & Regional Cardrooms)',
        distanceMiles: 32,
        driveMinutes: 38,
        rakeModel: '10% Pot Rake Up To $5-$6 Cap + Jackpot Drop',
        taxWithholding: '0.0% Washington State Income Tax',
        typicalGames: 'High-Volume $1/$3 Spread-Limit Cash, Regional Pacific Northwest Series',
      },
      {
        venueName: 'Portland Meadows Poker Room & Final Table Poker Club',
        jurisdiction: 'Portland, Oregon (Municipal Social Gaming - Zero House Rake)',
        distanceMiles: 173,
        driveMinutes: 175,
        rakeModel: '$0.00 Pot Rake & $0.00 Tournament House Fee | $15-$25 Daily Door Membership Fee Only',
        taxWithholding: '8.0% To 9.9% Oregon State Tax On Qualifying W-2G Wins > $5,000',
        typicalGames: 'True Uncapped $1/$2 & $2/$5 NLH/PLO, Zero-Rake Daily Deepstack Tournaments',
      },
    ],
    faqs: [
      {
        q: 'Why Do Washington State Poker Rooms Spread "$300 Max Bet" Instead Of Uncapped No-Limit?',
        a: 'Under Washington State Gambling Commission Administrative Rules, Commercial Cardrooms Are Subject To A Statutory Maximum Single Wager Limit ($300 To $400 Per Bet/Raise, Up To Four Raises Per Street). In Most 100BB $1/$3 Pots, It Plays Identically To No-Limit.',
      },
      {
        q: 'How Do Portland, Oregon Poker Clubs Operate With Zero Rake?',
        a: 'Under Oregon Social Gaming Ordinances, Portland Card Clubs Charge Players A Flat Daily Door Entry Fee ($15 To $25) While Taking $0.00 From Cash Game Pots And $0.00 From Tournament Buy-Ins, And Voluntary Dealer Tips Are Prohibited By Law (Dealers Are Paid Salaried Wages).',
      },
    ],
  },
  {
    slug: 'las-vegas-strip-to-downtown-off-strip',
    name: 'Las Vegas Airport & Strip Transit Corridor: Aria/Bellagio/Wynn Center Strip Vs. South Point & Red Rock',
    shortTitle: 'Las Vegas Strip To South Point, Orleans And Red Rock',
    originCity: 'Las Vegas, NV',
    originAirportCode: 'LAS',
    originCoords: { lat: 36.084, lng: -115.1537 },
    bestForPersona: 'Visiting And Local Las Vegas Players Optimizing Between Zero-Promo-Drop Center-Strip High-Cap Rooms (Wynn, Aria, Bellagio) And High-Promo Off-Strip Locals Rooms With Free Parking (South Point, Orleans, Red Rock).',
    ifThenBecause: 'If You Play $2/$5 Or $5/$10+ And Want Maximum Stack Depth (300BB Cap) With Zero Promotional Drop Taken From Any Pot, Ride 12 Minutes From LAS Airport To Wynn, Aria, Or Bellagio; If You Play $1/$2 Or $1/$3, Want Free Self-Parking, Affordable $60-$150 Daily Deepstack Tournaments, And 24/7 Omaha Hi-Lo Or Bad Beat Jackpots, Drive 12-18 Minutes Off-Strip To South Point, The Orleans, Or Red Rock Resort.',
    summary:
      'Harry Reid International Airport (LAS) Sits Less Than 15 Minutes From Dozens Of Casino Poker Rooms Divided Into Two Distinct Corridors: The Center-North Las Vegas Strip Luxury Corridor And The Off-Strip Locals & Free-Parking Corridor.',
    driveOptions: [
      {
        venueName: 'Wynn / Encore Las Vegas Poker Room',
        jurisdiction: 'North Las Vegas Strip, Nevada (0% State Income Tax)',
        distanceMiles: 4.8,
        driveMinutes: 14,
        rakeModel: '10% Pot Rake Up To $5-$6 Cap | $0.00 Promotional Drop',
        taxWithholding: '0.0% Nevada State Tax (24% Federal W-2G On Net Tournament Wins > $5,000)',
        typicalGames: '$1/$3 ($500 Cap), $2/$5 ($1,500 Cap), $5/$10+ NLH & PLO, Wynn Millions & Summer Classic',
      },
      {
        venueName: 'Aria Resort & Bellagio Poker Rooms (Connected Via Tram)',
        jurisdiction: 'Center Las Vegas Strip, Nevada (0% State Income Tax)',
        distanceMiles: 3.6,
        driveMinutes: 12,
        rakeModel: '10% Pot Rake Up To $5-$6 Cap | $0.00 Promotional Drop ($7-$8 Time At High Stakes)',
        taxWithholding: '0.0% Nevada State Income Tax',
        typicalGames: 'Non-Stop $1/$3, $2/$5, $5/$10 NLH, Las Vegas Capital For $1/$2 To $25/$50 PLO',
      },
      {
        venueName: 'Venetian Resort Poker Room (DeepStack Championship Host)',
        jurisdiction: 'Center-North Las Vegas Strip, Nevada (0% State Income Tax)',
        distanceMiles: 4.3,
        driveMinutes: 13,
        rakeModel: '10% Pot Rake Up To $5-$6 Cap + $2 High-Hand / Promo Drop',
        taxWithholding: '0.0% Nevada State Income Tax',
        typicalGames: 'Year-Round DeepStack Extravaganza, $1/$3 To $5/$10 Cash & High-Hand Promos',
      },
      {
        venueName: 'South Point, The Orleans & Red Rock Resort (Off-Strip Locals Corridor)',
        jurisdiction: 'Las Vegas Valley Off-Strip, Nevada (0% State Income Tax)',
        distanceMiles: 7.5,
        driveMinutes: 14,
        rakeModel: '10% Pot Rake Up To $5 Cap + $1-$2 Bad Beat / High-Hand Drop',
        taxWithholding: '0.0% Nevada State Income Tax',
        typicalGames: 'Free Parking, 4x Daily NLH Tournaments, $1/$2 & $1/$3 NLH, $4/$8 & $8/$16 Omaha Hi-Lo',
      },
    ],
    faqs: [
      {
        q: 'Which Las Vegas Poker Rooms Are Connected By Free Monorail Or Tram?',
        a: 'Bellagio, Aria, And Park MGM Are Directly Linked By The Free Aria Express Tram On The West Side Of The Strip, Allowing Players To Check Waitlists On Bravo And Walk Or Tram Between The Bellagio And Aria Poker Rooms In Under 7 Minutes.',
      },
      {
        q: 'Why Do High-Volume $2/$5 Grinders Prefer Wynn, Bellagio, And Aria Over Off-Strip Rooms?',
        a: 'Wynn, Bellagio, And Aria Take $0.00 In Promotional Jackpot Drop, Saving A Full-Time Cash Grinder Approximately $4 To $6 Per Hour ($8,000+ Per 1,500 Hours) Compared To Rooms Taking A $2 Promo Drop On Every Pot.',
      },
    ],
  },
  {
    slug: 'lax-to-commerce-bicycle-hustler-gardens',
    name: 'Los Angeles Basin Cardroom Corridor: LAX To Hustler, Hollywood Park, Commerce, Bicycle & Gardens',
    shortTitle: 'LAX To Los Angeles Basin Mega-Cardrooms Corridor',
    originCity: 'Los Angeles (LAX), CA',
    originAirportCode: 'LAX',
    originCoords: { lat: 33.9416, lng: -118.4085 },
    bestForPersona: 'Travelers And SoCal Grinders Navigating Between Westside Airport Cardrooms (Hollywood Park, Hustler) And The I-5 / I-710 Southeast Mega-Rooms (Commerce, The Bike, Gardens).',
    ifThenBecause: 'If You Just Landed At LAX And Want To Sit Down Within 15 Minutes Without Battling I-5 Traffic, Head 4 Miles East To Hollywood Park Casino Or 11 Miles Southeast To Hustler Casino In Gardena; If You Play $5/$5, $5/$10, Or Major WPT/LAPC Tournaments And Want The Largest Rooms In The Region, Drive 22-26 Miles East Along I-105 To I-710/I-5 To Commerce Casino, The Bicycle Casino, Or The Gardens Casino.',
    summary:
      'Los Angeles Hosts The Highest Concentration Of Live Poker Tables On Earth, All Operating Under California\'s Flat Per-Flop Collection Drop Structure.',
    driveOptions: [
      {
        venueName: 'Hollywood Park Casino & Larry Flynt\'s Lucky Lady / Hustler Casino',
        jurisdiction: 'Inglewood & Gardena, California (CA Bureau Of Gambling Control)',
        distanceMiles: 9,
        driveMinutes: 18,
        rakeModel: 'Flat $6-$7 Per-Flop Collection Drop + $1 Jackpot Drop ($0 Pre-Flop If No Flop)',
        taxWithholding: 'Up To 13.3% California Resident State Income Tax Reference (24% Federal W-2G > $5,000)',
        typicalGames: '10-18 Mins From LAX, $2/$3, $5/$5, $5/$10 NLH, Hustler Casino Live Stream Venue',
      },
      {
        venueName: 'Commerce Casino (World\'s Largest Cardroom)',
        jurisdiction: 'Commerce, California (CA Bureau Of Gambling Control)',
        distanceMiles: 23,
        driveMinutes: 35,
        rakeModel: 'Flat $6-$7 Per-Flop Collection Drop + $1 Jackpot Drop',
        taxWithholding: 'California State Tax Reference + 24% Federal W-2G On Qualifying Tournament Payouts',
        typicalGames: '24/7 $5/$5, $5/$10, $10/$20 NLH, Limit Hold\'em, Stud, Omaha, LAPC Host',
      },
      {
        venueName: 'Parkwest Bicycle Casino (The Bike) & The Gardens Casino',
        jurisdiction: 'Bell Gardens & Hawaiian Gardens, California (CA Bureau Of Gambling Control)',
        distanceMiles: 25,
        driveMinutes: 36,
        rakeModel: 'Flat $6-$7 Per-Flop Collection Drop + $1 Jackpot Drop',
        taxWithholding: 'California State Tax Reference + Federal W-2G Above $5,000',
        typicalGames: 'Legends Of Poker, Daily Deepstacks, Action $5/$5 & $5/$10 NLH And PLO',
      },
    ],
    faqs: [
      {
        q: 'Which Los Angeles Poker Room Is Closest To LAX Airport?',
        a: 'Hollywood Park Casino In Inglewood (Adjacent To SoFi Stadium) Is Just 4.2 Miles (10 To 14 Minutes) From LAX Terminals, Followed Closely By Lucky Lady Casino And Hustler Casino In Gardena (10.5 Miles, 16 To 22 Minutes).',
      },
      {
        q: 'Why Is $5/$5 The Flagship Grinder Stake In Los Angeles Instead Of $1/$2?',
        a: 'Because California Cardrooms Deduct A Flat $6 To $7 Collection Drop The Moment A Flop Is Dealt Regardless Of Pot Size, $1/$2 And $2/$3 Games With Short $100-$200 Buy-In Caps Suffer Heavy BB/100 Rake Drag, Whereas Deep-Stack $5/$5 ($500-$600 Cap) Cuts The Flop Drop To Just 1.2 Big Blinds.',
      },
    ],
  },
  {
    slug: 'miami-fort-lauderdale-south-florida',
    name: 'South Florida Tri-County Corridor: Seminole Hard Rock Hollywood, Magic City, Hialeah & Isle Pompano',
    shortTitle: 'Miami And Fort Lauderdale South Florida Tri-County Corridor',
    originCity: 'Miami / Fort Lauderdale, FL',
    originAirportCode: 'FLL',
    originCoords: { lat: 26.0742, lng: -80.1506 },
    bestForPersona: 'South Florida Cash And WPT Tournament Players Navigating The 40-Mile I-95 Corridor Between Miami-Dade Pari-Mutuel Rooms, The Guitar Hotel In Hollywood, And Pompano Beach.',
    ifThenBecause: 'If You Are Flying Into Fort Lauderdale (FLL) For Major WPT Series Or 24/7 High-Stakes $2/$5 To $10/$25 NLH And PLO, Take I-595 West 12 Minutes To Seminole Hard Rock Hollywood; If You Want Aggressive $500-$1,000 Every-30-Minute High-Hand Promotions Or Are Age 18-20, Play At Dania Pointe, Magic City Miami, Hialeah Park, Or Harrah\'s Pompano Along The I-95 Corridor.',
    summary:
      'Anchored By Fort Lauderdale-Hollywood International Airport (FLL) And Miami International Airport (MIA), The South Florida Tri-County Corridor Offers Casino And Pari-Mutuel Poker Rooms With 0% Florida State Income Tax And Non-Stop High-Hand And PLO Action.',
    driveOptions: [
      {
        venueName: 'Seminole Hard Rock Hotel & Casino Hollywood (The Guitar Hotel)',
        jurisdiction: 'Hollywood, Florida (Seminole Tribe Of Florida - 21+)',
        distanceMiles: 7.2,
        driveMinutes: 13,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 High-Hand / Promotional Drop',
        taxWithholding: '0.0% Florida State Income Tax (24% Federal W-2G On Net Tournament Wins > $5,000)',
        typicalGames: '4 Major Annual WPT Festivals, $1/$2 To $25/$50 NLH & PLO',
      },
      {
        venueName: 'Casino @ Dania Beach & Big Easy Casino',
        jurisdiction: 'Dania Beach / Hallandale, Florida (Pari-Mutuel Cardroom, 18+ Entry)',
        distanceMiles: 5.5,
        driveMinutes: 12,
        rakeModel: '10% Pot Rake Up To $5-$6 Cap + $2 Promotional Drop',
        taxWithholding: '0.0% Florida State Income Tax',
        typicalGames: '18+ Entry, Frequent High-Hand Promotions, $1/$2 & $2/$5 NLH And PLO',
      },
      {
        venueName: 'Magic City Casino & Hialeah Park Casino (Miami-Dade)',
        jurisdiction: 'Miami / Hialeah, Florida (Pari-Mutuel Cardroom, 18+ Entry)',
        distanceMiles: 24,
        driveMinutes: 32,
        rakeModel: '10% Pot Rake Up To $5-$6 Cap + $2 High-Hand / Jackpot Drop',
        taxWithholding: '0.0% Florida State Income Tax',
        typicalGames: '10 Mins From MIA Airport, Splashy $1/$2 & $2/$5 NLH, Deep PLO, Daily Guarantees',
      },
      {
        venueName: 'Harrah\'s Pompano Beach (Caesars Rewards)',
        jurisdiction: 'Pompano Beach, Florida (Pari-Mutuel Cardroom, 18+ Entry)',
        distanceMiles: 16,
        driveMinutes: 22,
        rakeModel: '10% Pot Rake Up To $6 Cap + $2 Promotional Drop',
        taxWithholding: '0.0% Florida State Income Tax',
        typicalGames: 'WSOP Circuit Host, Caesars Rewards Tier Credits, $1/$2 To $5/$10 NLH & PLO',
      },
    ],
    faqs: [
      {
        q: 'Which Airport Is Closer To Seminole Hard Rock Hollywood: FLL Or MIA?',
        a: 'Fort Lauderdale-Hollywood International Airport (FLL) Is Only 7.2 Miles (12 To 15 Minutes Via I-595 West And US-441) From Seminole Hard Rock Hollywood, Whereas Miami International Airport (MIA) Is 23 Miles South (30 To 45 Minutes).',
      },
      {
        q: 'Why Is South Florida Famous For Pot-Limit Omaha (PLO) And High-Hand Promotions?',
        a: 'Because Six Major Cardrooms Compete Along A 35-Mile Stretch Of I-95 Between Miami And Pompano Beach, Venues Return Millions In $2 Promotional Drops Through $500 To $1,000 High-Hand Payouts Every 15 To 30 Minutes alongside Uncapped $2/$2 And $5/$5 Rock PLO Games.',
      },
    ],
  },
  {
    slug: 'bay-area-san-jose-to-sacramento',
    name: 'Northern California Corridor: Bay 101 & Matrix San Jose To Graton, Lucky Chances & Thunder Valley',
    shortTitle: 'Bay Area San Jose To San Francisco And Sacramento Corridor',
    originCity: 'San Jose / Bay Area, CA',
    originAirportCode: 'SJC',
    originCoords: { lat: 37.3639, lng: -121.9289 },
    bestForPersona: 'Silicon Valley And Northern California Players Routing Between San Jose\'s Deep-Stack Commercial Cardrooms (Bay 101, Matrix) And Sacramento\'s Flagship WPT/WSOP Tribal Venue (Thunder Valley).',
    ifThenBecause: 'If You Are In Silicon Valley And Play High-Action $2/$3/$5 Or $5/$5/$10 Mandatory-Blind Cash Games Or The WPT Shooting Star, Land At SJC Airport And Walk 3 Minutes To Bay 101 Or Casino M8trix; If You Are Hunting WSOP Circuit Rings, WPT Main Events, Or Uncapped PLO In Northern California, Drive 115 Miles Northeast On I-80 To Thunder Valley Casino Resort Near Sacramento.',
    summary:
      'The Northern California Live Poker Corridor Links Silicon Valley\'s Twin 49-Table Cardrooms Adjacent To San Jose Airport (SJC) With San Francisco Peninsula\'s Lucky Chances, Wine Country\'s Graton Resort, And Sacramento\'s Thunder Valley Casino Resort.',
    driveOptions: [
      {
        venueName: 'Bay 101 Casino & Casino M8trix (Silicon Valley Twin Hubs)',
        jurisdiction: 'San Jose, California (CA Bureau Of Gambling Control - 0.5 Miles From SJC)',
        distanceMiles: 1.2,
        driveMinutes: 5,
        rakeModel: 'Flat $6-$7 Per-Flop Collection Drop + $1 Jackpot Drop',
        taxWithholding: 'California State Tax Reference + 24% Federal W-2G On Net Tournament Wins > $5,000',
        typicalGames: 'Three-Blind $2/$3/$5 ($1,000 Cap) & $5/$5/$10 NLH, $20/$40-$80/$160 Limit, WPT Bay 101 Shooting Star',
      },
      {
        venueName: 'Lucky Chances Casino (San Francisco Peninsula) & Oaks Card Club (East Bay)',
        jurisdiction: 'Colma & Emeryville, California (CA Bureau Of Gambling Control)',
        distanceMiles: 42,
        driveMinutes: 46,
        rakeModel: 'Flat $6-$7 Per-Flop Collection Drop + $1 Jackpot Drop',
        taxWithholding: 'California State Tax Reference',
        typicalGames: '10 Mins From SFO Airport (Lucky Chances), 24/7 $1/$2/$3 & $2/$3/$5 NLH, Limit Hold\'em',
      },
      {
        venueName: 'Graton Resort & Casino Poker Room',
        jurisdiction: 'Rohnert Park, California (Federated Indians Of Graton Rancheria)',
        distanceMiles: 88,
        driveMinutes: 95,
        rakeModel: 'Flat Per-Flop Drop / Percentage Cap + Bad Beat Jackpot Drop',
        taxWithholding: 'California / Federal W-2G Rules On Qualifying Tournament Payouts',
        typicalGames: 'Sonoma Wine Country Hub, $1/$3 & $2/$5 NLH, Daily Tournaments',
      },
      {
        venueName: 'Thunder Valley Casino Resort Poker Room (WPT & WSOP Host)',
        jurisdiction: 'Lincoln / Sacramento, California (United Auburn Indian Community)',
        distanceMiles: 128,
        driveMinutes: 130,
        rakeModel: '10% Pot Rake / $6-$7 Cap + $1-$2 Jackpot Drop',
        taxWithholding: 'California / Federal W-2G Rules On Net Tournament Wins > $5,000',
        typicalGames: 'WPT Rolling Thunder, WSOP Circuit, $1/$3, $2/$5, $5/$10 NLH & Deep PLO',
      },
    ],
    faqs: [
      {
        q: 'Why Do San Jose Cardrooms Use Three Mandatory Blinds ($2/$3/$5) And A Button Blind?',
        a: 'Bay 101 And Casino M8trix Spread Three-Blind Structures (Often With A Blind On The Button) To Build Larger Starting Pots Before The Flop, Encouraging Action And Offsetting California\'s Flat Per-Flop Collection Drop.',
      },
      {
        q: 'How Close Are Bay 101 And Casino M8trix To San Jose International Airport (SJC)?',
        a: 'Both Bay 101 And Casino M8trix Sit Directly Across Highway 101 From SJC Airport Terminals (Roughly 1 Mile Or A 4-Minute Rideshare), And The Two 49-Table Cardrooms Are Only 0.4 Miles Apart From Each Other.',
      },
    ],
  },
];

export function findCorridorBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return POKER_TRAVEL_CORRIDORS.find((c) => c.slug === s) || null;
}

export function renderCorridorsIndexMarkdown() {
  const lines = [
    '# Border-State, Airport & Drive-Time Live Poker Travel Corridors Directory',
    '',
    `> Source: [Live Poker Travel & Airport Corridors on Smarter.Poker](${CORRIDORS_URL})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    `Comparative Geo-Routing Directory Covering The ${POKER_TRAVEL_CORRIDORS.length} Highest-Traffic North American Live Poker Travel Corridors, Contrasting Cross-Border Drive Times, Airport Proximity, House Rake Caps Vs. Time-Collection Models, And State Income Tax Withholding Rules.`,
    '',
    '## 10 Major North American Live Poker Travel Corridors',
    '| Corridor Name | Origin Hub | Airport | Primary Destinations | Canonical URL |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...POKER_TRAVEL_CORRIDORS.map(
      (c) =>
        `| **${c.shortTitle}** | ${c.originCity} | \`${c.originAirportCode}\` | ${c.driveOptions.map((d) => d.venueName).join('; ')} | https://smarter.poker${corridorGuidePath(c.slug)} |`
    ),
    '',
    '## Quick If / Then / Because Decision Rules By Corridor',
    ...POKER_TRAVEL_CORRIDORS.map((c) => `- **${c.originCity} (${c.originAirportCode})**: ${c.ifThenBecause}`),
    '',
    `- **Canonical URL**: [${CORRIDORS_URL}](${CORRIDORS_URL})`,
    `- **Raw Markdown URL**: [${CORRIDORS_URL}.md](${CORRIDORS_URL}.md)`,
    '',
  ];
  return lines.join('\n');
}

export function renderCorridorDetailMarkdown(corridor) {
  const c = typeof corridor === 'string' ? findCorridorBySlug(corridor) : corridor;
  if (!c) return '';
  const url = `https://smarter.poker${corridorGuidePath(c.slug)}`;
  const lines = [
    `# ${c.name}`,
    '',
    `> Source: [${c.shortTitle} on Smarter.Poker](${url})`,
    '',
    '## Executive Summary',
    c.summary,
    '',
    `- **Origin Metro & Airport**: ${c.originCity} (\`${c.originAirportCode}\`)`,
    `- **Origin GPS Coordinates**: ${c.originCoords.lat}, ${c.originCoords.lng}`,
    `- **Target Player Persona**: ${c.bestForPersona}`,
    '',
    '## Decision Rule (If / Then / Because)',
    c.ifThenBecause,
    '',
    '## Drive-Time & Airport Destination Comparison Matrix',
    '| Venue & Destination | Jurisdiction | Distance | Drive Time | Rake / Time Model | Tax Withholding | Typical Games |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
    ...c.driveOptions.map(
      (d) =>
        `| **${d.venueName}** | ${d.jurisdiction} | ${d.distanceMiles} Miles | ${d.driveMinutes} Mins | ${d.rakeModel} | ${d.taxWithholding} | ${d.typicalGames} |`
    ),
    '',
    '## Frequently Asked Questions',
    ...c.faqs.flatMap((f) => [`### ${f.q}`, f.a, '']),
    `- **Canonical URL**: [${url}](${url})`,
    `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
    '',
  ];
  return lines.join('\n');
}
