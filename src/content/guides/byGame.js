/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  NATIONAL GAME-TYPE LIVE POKER VENUE DIRECTORIES
 *  (src/content/guides/byGame.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Curated North American cardroom directories organized by game format and
 * action structure:
 * 1. pot-limit-omaha
 * 2. double-board-bomb-pots
 * 3. daily-nlh-tournaments
 * 4. bad-beat-jackpots
 * 5. time-rake-membership-clubs
 * 6. high-stakes-cash-games
 *
 * House style: Title Case, zero em dashes.
 */

export const BY_GAME_AS_OF = '2026-11-24';
export const BY_GAME_BASE_PATH = '/poker-rooms/by-game';
export const BY_GAME_URL = 'https://smarter.poker/poker-rooms/by-game';

export function byGameGuidePath(slug) {
  return `${BY_GAME_BASE_PATH}/${slug}`;
}

export const POKER_ROOMS_BY_GAME = [
  {
    slug: 'pot-limit-omaha',
    name: 'Best Live PLO & 5-Card PLO Poker Rooms In North America',
    shortTitle: 'Best Live Pot-Limit Omaha (PLO & PLO5) Rooms',
    gameFormat: '4-Card, 5-Card & 6-Card Pot-Limit Omaha (PLO4 / PLO5 / Rock PLO)',
    recommendedBankrollBuyIns: '50 To 100 Full 100BB Buy-Ins (Standard Deviation: 135 To 175 BB/100)',
    rakeImpactAnalysis:
      'Because Live PLO Pots Frequently Reach The Rake Cap On The Flop Or Turn, Percentage Pot Rake Caps ($5-$7) Cost fewer BB/100 At $5/$5+ Than In Small-Pot NLH, While Time-Collection Rooms ($8/30 Mins Or $12-$14/Hr In Texas) Maximize Deep-Stack 250BB+ Multi-Way Action.',
    ifThenBecause:
      'If You Want 24/7 Multi-Table 4-Card And 5-Card PLO With Zero Pot Rake And Match-The-Stack Depth, Travel To Houston Or Dallas Private Card Clubs (Prime Social, Champions, Texas Card House) Because Their $12-$14/Hr Seat Rental Preserves $30,000+ Table Liquidity; If You Prefer Regulated Resort Casinos With 0% State Income Tax, Choose Aria Las Vegas Or Seminole Hard Rock Hollywood/Tampa.',
    calculatorHref: '/tools/plo-bet-calculator',
    summary:
      'Live Pot-Limit Omaha Has Expanded From High-Stakes Strip Tables Into Round-The-Clock $1/$2, $2/$2, $5/$5, And $10/$25 Games Across Las Vegas, Texas, South Florida, Pennsylvania, And Montreal.',
    topVenues: [
      {
        venueName: 'Aria Resort & Casino Poker Room',
        location: 'Las Vegas, Nevada',
        stakes: '$1/$2, $2/$5, $5/$5 Rock, $10/$25 & $25/$50+ PLO',
        rakeOrTimeCharge: '10% Up To $6 Cap At $1/$2; $7-$8 Per 30-Min Time Down At $5/$5+',
        typicalTables: '6 To 12 Active PLO Tables Daily',
        regionLink: '/poker-rooms/guides/las-vegas-nevada',
      },
      {
        venueName: 'Prime Social Poker Club & Champions Club',
        location: 'Houston, Texas',
        stakes: '$1/$2/$5, $5/$5, $5/$10/$25 PLO4 & PLO5 (Match-The-Stack)',
        rakeOrTimeCharge: '$0.00 Pot Rake | $13 Per Hour Seat Access Fee',
        typicalTables: '8 To 15 Active PLO4/PLO5 Tables',
        regionLink: '/poker-rooms/guides/houston-texas',
      },
      {
        venueName: 'Texas Card House (TCH) Dallas & Austin',
        location: 'Dallas & Austin, Texas',
        stakes: '$1/$2/$5, $5/$5, $5/$10 PLO4 & 5-Card PLO',
        rakeOrTimeCharge: '$0.00 Pot Rake | $12-$14 Per Hour Seat Rental',
        typicalTables: '6 To 12 Active PLO Tables',
        regionLink: '/poker-rooms/guides/dallas-fort-worth-texas',
      },
      {
        venueName: 'Seminole Hard Rock Hotel & Casino Hollywood',
        location: 'Hollywood, Florida',
        stakes: '$1/$2, $2/$2 ($5 Rock), $5/$5 ($10 Rock) & $10/$25 PLO',
        rakeOrTimeCharge: '10% Up To $6 Cap + $2 Promo ($8/30-Min Time At $5/$5+)',
        typicalTables: '5 To 10 Active PLO Tables',
        regionLink: '/poker-rooms/guides/south-florida-miami-hollywood',
      },
      {
        venueName: 'Seminole Hard Rock Hotel & Casino Tampa',
        location: 'Tampa, Florida',
        stakes: '$1/$2, $2/$2, $5/$5 Rock & $5/$10 PLO',
        rakeOrTimeCharge: '10% Up To $6 Cap + $2 Promo ($8/30-Min Time At $5/$5+)',
        typicalTables: '5 To 9 Active PLO Tables',
        regionLink: '/poker-rooms/guides/tampa-central-florida',
      },
      {
        venueName: 'Parx Casino Poker Room',
        location: 'Bensalem, Pennsylvania',
        stakes: '$2/$2, $2/$5, $5/$5 & $10/$10/$25 PLO',
        rakeOrTimeCharge: '10% Up To $6 Cap ($8-$9 Time Charge At $5/$5+)',
        typicalTables: '4 To 8 Active PLO Tables',
        regionLink: '/poker-rooms/guides/philadelphia-pennsylvania',
      },
      {
        venueName: 'Playground Poker Club',
        location: 'Kahnawake / Montreal, Canada',
        stakes: '$1/$2, $2/$5, $5/$5 & $5/$10+ PLO4 & PLO5 (CAD)',
        rakeOrTimeCharge: '5% To 10% Capped Rake / Timed High-Stakes Collection',
        typicalTables: '5 To 9 Active PLO Tables',
        regionLink: '/poker-rooms/international/montreal-canada',
      },
      {
        venueName: 'King\'s Resort Rozvadov',
        location: 'Rozvadov, Czech Republic',
        stakes: '€2/€2, €5/€5, €10/€10 & €25/€25+ PLO4 & PLO5',
        rakeOrTimeCharge: '5% Pot Rake Capped At €10-€20',
        typicalTables: '6 To 14 Active PLO Tables During Series',
        regionLink: '/poker-rooms/international/rozvadov-czech-republic',
      },
    ],
    faqs: [
      {
        q: 'What Is A "Rock" In Live $2/$2 Or $5/$5 Pot-Limit Omaha?',
        a: 'A "Rock" Is A Mandatory Live Straddle Chip Group Kept In Rotation At Florida And Las Vegas PLO Tables: Whoever Wins The Current Pot Must Post The Rock (For Example, A Mandatory $5 Or $10 Live Blind/Straddle) On The Very Next Hand Regardless Of Seat Position.',
      },
      {
        q: 'Why Do 5-Card PLO (PLO5) Players Need A 75 To 100 Buy-In Bankroll?',
        a: 'Adding A Fifth Hole Card Increases Starting Hand Combinations From 1,326 (Hold\'em) And 270,725 (PLO4) To 2,598,960 (PLO5), Compressing All-In Preflop And Flop Equities Toward 52%-vs-48% Edges And Pushing Standard Deviation Above 160 BB/100.',
      },
    ],
  },
  {
    slug: 'double-board-bomb-pots',
    name: 'Best Double-Board PLO Bomb Pot & Action Cash Game Rooms',
    shortTitle: 'Best Double-Board PLO Bomb Pot Cash Rooms',
    gameFormat: 'Double-Board Pot-Limit Omaha Bomb Pots (Every Dealer Change Or Full-Time Bomb Pot Tables)',
    recommendedBankrollBuyIns: '60 To 100 Cash Buy-Ins (High Multi-Way All-In Split-Pot Volatility)',
    rakeImpactAnalysis:
      'In Double-Board Bomb Pots, All 8 Or 9 Players Post 2BB To 5BB Pre-Flop And Skip Pre-Flop Betting Entirely. Because Every Bomb Pot Sees A Flop With 16BB To 45BB Already In The Center, Time-Rake Rooms Preserve 100% Of The Dead Money For Players Who Master Scoop-Oriented Nut Redraws.',
    ifThenBecause:
      'If You Want To Play Double-Board PLO Bomb Pots Every 30-Minute Dealer Change Or On Dedicated Every-Hand Bomb Pot Tables, Choose Texas Membership Card Clubs (The Lodge Austin, TCH Dallas/Houston, Prime Social) Because Time-Collection Rooms Never Deduct Extra Per-Hand Rake On Split Pots.',
    calculatorHref: '/tools/straddle-calculator',
    summary:
      'Double-Board PLO Bomb Pots Have Become The Signature Action Catalyst Across Texas, California, Phoenix, And Las Vegas Cash Games, Offering Massive Expected Value To Players Who Avoid Playing One-Board Hands Without Scoop Equity.',
    topVenues: [
      {
        venueName: 'The Lodge Card Club Austin (Round Rock)',
        location: 'Austin / Round Rock, Texas',
        stakes: '$1/$2 & $2/$5 NLH With $5-$15 Double-Board PLO Bomb Pots Every Dealer Push',
        rakeOrTimeCharge: '$0.00 Pot Rake | $12-$13 Per Hour Seat Time',
        typicalTables: '35+ Active Tables Running Dealer-Change Bomb Pots',
        regionLink: '/poker-rooms/guides/austin-san-antonio-texas',
      },
      {
        venueName: 'Texas Card House (TCH) Dallas, Houston & Austin',
        location: 'Dallas, Houston & Austin, Texas',
        stakes: '$1/$2, $2/$5 & Dedicated Every-Hand Double-Board PLO Bomb Pot Tables',
        rakeOrTimeCharge: '$0.00 Pot Rake | $12-$14 Per Hour Seat Time',
        typicalTables: '25+ Tables Per Venue With Mandatory Or Optional Bomb Pots',
        regionLink: '/poker-rooms/guides/dallas-fort-worth-texas',
      },
      {
        venueName: 'Prime Social & Champions Club Houston',
        location: 'Houston, Texas',
        stakes: '$1/$3 & $2/$5 NLH/PLO With $10-$25 Double-Board PLO Bomb Pots',
        rakeOrTimeCharge: '$0.00 Pot Rake | $13 Per Hour Seat Access',
        typicalTables: '25+ Active Tables',
        regionLink: '/poker-rooms/guides/houston-texas',
      },
      {
        venueName: 'Talking Stick Resort (The Arena Poker Room)',
        location: 'Scottsdale / Phoenix, Arizona',
        stakes: '$1/$3, $2/$3 & $3/$5 NLH/PLO With Dealer-Change Bomb Pots',
        rakeOrTimeCharge: '10% Pot Rake Capped At $5-$6 + Jackpot Drop',
        typicalTables: '30+ Tables Participating In Action Orbits',
        regionLink: '/poker-rooms/guides/phoenix-scottsdale-arizona',
      },
      {
        venueName: 'Hustler Casino & The Gardens Casino',
        location: 'Gardena & Hawaiian Gardens, California',
        stakes: '$5/$5 & $5/$10 NLH/PLO With Double-Board Bomb Pot Orbits',
        rakeOrTimeCharge: 'Flat $6-$7 Per-Flop Collection Drop',
        typicalTables: '30+ Mid-To-High Stakes Tables',
        regionLink: '/poker-rooms/guides/los-angeles-california',
      },
      {
        venueName: 'Wynn & Venetian Las Vegas Poker Rooms',
        location: 'Las Vegas Strip, Nevada',
        stakes: '$2/$5 & $5/$10 NLH/PLO Table-Voted Dealer-Change Bomb Pots',
        rakeOrTimeCharge: '10% Up To $5-$6 Cap / Time Collection At $5/$10+',
        typicalTables: '15+ Mid-Stakes Tables',
        regionLink: '/poker-rooms/guides/las-vegas-nevada',
      },
      {
        venueName: 'Portland Meadows Poker Room',
        location: 'Portland, Oregon',
        stakes: '$1/$2 & $2/$5 NLH/PLO With Dealer-Push Double-Board Bomb Pots',
        rakeOrTimeCharge: '$0.00 Pot Rake | $20 Daily Door Membership Fee',
        typicalTables: '12+ Active Tables',
        regionLink: '/poker-rooms/corridors/seattle-to-portland-northwest',
      },
      {
        venueName: 'bestbet Jacksonville',
        location: 'Jacksonville, Florida',
        stakes: '$2/$5 & $5/$5 NLH/PLO Action Games',
        rakeOrTimeCharge: '10% Up To $6 Cap + $2 Promo Drop',
        typicalTables: '10+ Action Tables',
        regionLink: '/poker-rooms/corridors/atlanta-to-cherokee-and-florida',
      },
    ],
    faqs: [
      {
        q: 'What Is The Golden Rule Of Double-Board PLO Bomb Pot Strategy?',
        a: 'Never Commit Your Entire 100BB+ Stack When You Can Only Win One Of The Two Boards And Have Zero Equity On The Second Board, Because Getting Quartered Or Chopped While Paying Off A Opponent Who Holds The Nuts On Board A Plus A Redraw On Board B Is The #1 EV Leak In Bomb Pots.',
      },
      {
        q: 'Why Are Bomb Pots Almost Always Dealt In PLO Instead Of Texas Hold\'em?',
        a: 'In Hold\'em With Only 2 Hole Cards, Players Cannot Independently Coordinate Strong Combinations Across Two Separate Flops simultaneously; With 4 Or 5 PLO Hole Cards, Multiple Players Flop Sets, Wraps, And Flush Draws Across Both Boards, Driving Multi-Way Action.',
      },
    ],
  },
  {
    slug: 'daily-nlh-tournaments',
    name: 'Best Daily No-Limit Hold\'em Tournament & Nightly Guarantee Rooms',
    shortTitle: 'Best Daily NLH Tournament And Guarantee Rooms',
    gameFormat: 'Recurring Daily & Nightly Multi-Table No-Limit Hold\'em Tournaments ($60 To $400 Buy-In)',
    recommendedBankrollBuyIns: '100 To 150 Average Buy-Ins (ABI) For Recurring Daily Multi-Table Fields',
    rakeImpactAnalysis:
      'Sub-$100 Daily Tournaments Often Withhold 22% To 26% In Combined House And Staff Fees With 15-Minute Turbo Blinds, Whereas Premier Tournament Rooms Offer $150 To $300 Daily Deepstacks With 14% To 17% Total Fee Ratios And 25-To-30 Minute Blind Levels.',
    ifThenBecause:
      'If You Are Grinding Daily Live Tournaments For Profit, Target Rooms With Buy-Ins Of $150 To $400 Where Total House + Staff Withholding Is Under 18% And Blind Levels Are 25+ Minutes (Or Zero-Fee Portland Social Rooms) Because Turbo Sub-$100 Dailies With 25% Fees Compress Skill Edge.',
    calculatorHref: '/tools/mtt-grind-planner',
    summary:
      'From Las Vegas Strip Daily Deepstacks To Zero-Fee Portland Tournaments And Massive Florida And Texas Nightly Guarantees, These 8 Venues Run The Most Reliable Daily Multi-Table Tournament Schedules In North America.',
    topVenues: [
      {
        venueName: 'Venetian Resort Poker Room (DeepStack Daily & Series)',
        location: 'Las Vegas Strip, Nevada',
        stakes: '$160 To $400 Daily DeepStack NLH & Bounty Events',
        rakeOrTimeCharge: '15% To 18% Total Entry Fee Withholding (30-Min Levels)',
        typicalTables: '50 Tables Hosting 3 To 4 Daily Events Year-Round',
        regionLink: '/poker-rooms/guides/las-vegas-nevada',
      },
      {
        venueName: 'South Point & The Orleans Poker Rooms',
        location: 'Las Vegas Off-Strip, Nevada',
        stakes: '$60 To $150 3x-4x Daily NLH & Friday/Saturday Nightly Majors',
        rakeOrTimeCharge: '17% To 21% Entry Fee Withholding + High Guarantees',
        typicalTables: '65 Combined Tables With 200+ Daily Entries',
        regionLink: '/poker-rooms/guides/las-vegas-nevada',
      },
      {
        venueName: 'Wynn Las Vegas Poker Room (Daily Signature Events)',
        location: 'Las Vegas Strip, Nevada',
        stakes: '$200 Weekday Daily NLH & $300-$400 Weekend Guarantees',
        rakeOrTimeCharge: '14.5% To 16.5% Total Fee Ratio (Premier Structure)',
        typicalTables: '28+ Tables With Deep Starting Stacks',
        regionLink: '/poker-rooms/guides/las-vegas-nevada',
      },
      {
        venueName: 'Seminole Hard Rock Hollywood & Tampa',
        location: 'Hollywood & Tampa, Florida',
        stakes: '$130 To $300 Daily Morning, Afternoon & Evening Guarantees',
        rakeOrTimeCharge: '16% To 19% Total Fee Allocation (0% FL State Tax)',
        typicalTables: '90+ Combined Permanent Tables Across Both Properties',
        regionLink: '/poker-rooms/guides/south-florida-miami-hollywood',
      },
      {
        venueName: 'The Lodge Card Club Austin & Champions Club Houston',
        location: 'Austin & Houston, Texas',
        stakes: '$80 To $300 Daily Freerolls, Bounties & $10K-$50K Weekend Guarantees',
        rakeOrTimeCharge: 'Low Club Admin / Dealer Fee Access Structure (0% TX State Tax)',
        typicalTables: '90+ Combined Tables Across Both Texas Flagships',
        regionLink: '/poker-rooms/guides/austin-san-antonio-texas',
      },
      {
        venueName: 'Portland Meadows & Final Table Poker Club',
        location: 'Portland, Oregon',
        stakes: '$60 To $220 Zero-Rake Daily Deepstack & Weekend Guarantees',
        rakeOrTimeCharge: '0.0% Tournament House Rake ($15-$20 Daily Door Membership Fee Only)',
        typicalTables: '35+ Combined Tables (100% Of Buy-Ins Go To Prize Pool)',
        regionLink: '/poker-rooms/corridors/seattle-to-portland-northwest',
      },
      {
        venueName: 'Chasers Poker Room & Gate City Casino',
        location: 'Salem & Nashua, New Hampshire',
        stakes: '$100 To $250 Daily New England Deepstack Tournaments',
        rakeOrTimeCharge: '16% To 19% Entry Fee Ratio (0% NH State Income Tax)',
        typicalTables: '50+ Combined Tables Just North Of Boston',
        regionLink: '/poker-rooms/guides/new-england-boston-foxwoods',
      },
      {
        venueName: 'Borgata Hotel Casino & Parx Casino',
        location: 'Atlantic City, NJ & Bensalem, PA',
        stakes: '$125 To $350 Daily & Weekly Signature NLH Tournaments',
        rakeOrTimeCharge: '15% To 18% Entry Fee Ratio',
        typicalTables: '100+ Combined Tables Across Mid-Atlantic Corridor',
        regionLink: '/poker-rooms/guides/atlantic-city-new-jersey',
      },
    ],
    faqs: [
      {
        q: 'What Is A Good Rake Percentage For A Daily Live Poker Tournament?',
        a: 'According To Smarter.Poker\'s Audit Of 4,500+ Weekly Live Tournaments, Any Daily Event Taking 17% Or Less In Combined House And Dealer Fees With 25-Minute Or 30-Minute Blind Levels Ranks In The Top Quartile For Structural Player Value.',
      },
      {
        q: 'Why Do Portland, Oregon Daily Tournaments Pay Out 100% Of The Buy-In Pool?',
        a: 'Under Portland Municipal Social Gaming Ordinances, The Cardroom Cannot Retain Any Percentage Of Tournament Buy-Ins Or Cash Pots, Charging Only A Flat Daily Door Entry Fee ($15 To $25).',
      },
    ],
  },
  {
    slug: 'bad-beat-jackpots',
    name: 'Highest Bad Beat Jackpot & Promotional Drop Poker Rooms',
    shortTitle: 'Highest Bad Beat Jackpot (BBJ) Poker Rooms',
    gameFormat: 'Progressive Bad Beat Jackpot (BBJ) & High-Frequency High-Hand Cash Games',
    recommendedBankrollBuyIns: '25 To 40 Cash Game Buy-Ins (Standard $1/$2 To $2/$5 Cash Bankroll)',
    rakeImpactAnalysis:
      'Every $1 To $2 Promotional Drop Taken Per Flop Costs A Full-Ring Player Roughly $0.45 To $0.90 Per Hour ($900 To $1,800 Per 2,000 Hours). However, Once A Progressive Bad Beat Jackpot Crosses Its Mathematical Breakeven Pool Threshold (Typically $250,000+ For Quad Aces Beaten Or $500,000+ For Quad Tens/Jacks Beaten), The Expected Jackpot Return Exceeds The $2 Drop.',
    ifThenBecause:
      'If A Room\'s Progressive Bad Beat Jackpot Exceeds $350,000+ With A Quad-8s Or Quad-10s Qualifier (Or $1,000,000+ At Playground Montreal / MotorCity Detroit / Rivers Pittsburgh), Prioritize High-Hands-Per-Hour $1/$2 Or $1/$3 Tables Because Table-Share And Room-Share Equity Turns The $2 Promotional Drop Into A Net Positive EV Rebate.',
    calculatorHref: '/tools/promo-ev-calculator',
    summary:
      'Progressive Bad Beat Jackpots Across North America Regularly Climb Past $500,000 To $2,000,000+, Awarding Life-Changing Six-Figure Payouts To The Losing Hand, Winning Hand, And Every Active Player Dealt Into The Table.',
    topVenues: [
      {
        venueName: 'Playground Poker Club (World-Record Bad Beat Jackpot Venue)',
        location: 'Kahnawake / Montreal, Canada',
        stakes: '$1/$2, $2/$5 & $5/$5+ NLH And Separate PLO Bad Beat Jackpot Pools',
        rakeOrTimeCharge: 'Standard Capped Rake + Dedicated Progressive BBJ Drop',
        typicalTables: '40+ Active Tables (Historic $2.2M+ & $2.6M+ CAD BBJ Hits)',
        regionLink: '/poker-rooms/international/montreal-canada',
      },
      {
        venueName: 'Rivers Casino Pittsburgh & Rivers Casino Philadelphia',
        location: 'Pittsburgh & Philadelphia, Pennsylvania',
        stakes: '$1/$3 & $2/$5 NLH And PLO Qualifying Cash Games',
        rakeOrTimeCharge: '10% Up To $6 Cap + $2 Bad Beat Jackpot Drop',
        typicalTables: '55+ Combined Tables (Historic $1.2M+ USD Record US BBJ Hit)',
        regionLink: '/poker-rooms/guides/philadelphia-pennsylvania',
      },
      {
        venueName: 'MotorCity Casino & MGM Grand Detroit',
        location: 'Detroit, Michigan',
        stakes: '$1/$2, $1/$3 & $2/$5 NLH And PLO Cash Games',
        rakeOrTimeCharge: '10% Up To $6-$7 Cap + $2 Bad Beat Jackpot Drop',
        typicalTables: '35+ Combined Tables (Regular $500K To $1M+ Progressive Pools)',
        regionLink: '/poker-rooms/states/michigan',
      },
      {
        venueName: 'Parx Casino & Wind Creek Bethlehem',
        location: 'Bensalem & Bethlehem, Pennsylvania',
        stakes: '$1/$2, $1/$3 & $2/$5 NLH Qualifying Tables',
        rakeOrTimeCharge: '10% Up To $6 Cap + $2 Promotional / BBJ Drop',
        typicalTables: '70+ Combined Tables With Six-Figure Jackpot Pools',
        regionLink: '/poker-rooms/guides/philadelphia-pennsylvania',
      },
      {
        venueName: 'Seminole Hard Rock Hollywood, Tampa & Harrah\'s Pompano',
        location: 'Hollywood, Tampa & Pompano Beach, Florida',
        stakes: '$1/$2, $2/$5 NLH & PLO (Non-Stop 15-30 Min High-Hand Drops)',
        rakeOrTimeCharge: '10% Up To $6 Cap + $2 High-Hand / Promo Drop',
        typicalTables: '130+ Combined Tables Returning $500-$1,000 Every 30 Minutes',
        regionLink: '/poker-rooms/guides/south-florida-miami-hollywood',
      },
      {
        venueName: 'Commerce Casino, The Bike & Gardens Casino',
        location: 'Los Angeles Basin, California',
        stakes: '$2/$3, $5/$5 & $5/$10 NLH Progressive Jackpot & Royal Flush Pools',
        rakeOrTimeCharge: 'Flat Flop Drop + $1 Mandatory Jackpot Collection',
        typicalTables: '370+ Combined Active Tables Rapidly Building Daily Jackpot Pools',
        regionLink: '/poker-rooms/guides/los-angeles-california',
      },
      {
        venueName: 'Talking Stick Resort (The Arena Poker Room)',
        location: 'Scottsdale, Arizona',
        stakes: '$1/$3, $2/$3, $3/$5 NLH & Limit Hold\'em',
        rakeOrTimeCharge: '10% Up To $5-$6 Cap + $2 Jackpot / High-Hand Drop',
        typicalTables: '47 Tables With Frequent Six-Figure Bad Beat Jackpots',
        regionLink: '/poker-rooms/guides/phoenix-scottsdale-arizona',
      },
      {
        venueName: 'Fortune Poker & Seattle Metro Cardrooms',
        location: 'Renton / Kirkland, Washington',
        stakes: '$1/$3 & $3/$5 Hold\'em With Monte Carlo & Progressive BBJ',
        rakeOrTimeCharge: '10% Up To $5-$6 Cap + $2 Jackpot Drop',
        typicalTables: '30+ Combined Regional Tables With Tiered Monte Carlo Boards',
        regionLink: '/poker-rooms/states/washington',
      },
    ],
    faqs: [
      {
        q: 'What Are The Universal Rules To Qualify For A Casino Bad Beat Jackpot?',
        a: 'In Virtually Every North American Poker Room: (1) The Pot Must Reach The Minimum Dollar Or Rake Threshold ($10 To $20), (2) Both The Winning And Losing Players Must Use Both Of Their Hole Cards (Pocket Pair For Quads), (3) At Least 4 Or 5 Players Must Be Dealt In, And (4) Anyone Discussing The Jackpot Or Exposing Cards During The Hand Voids The Payout.',
      },
      {
        q: 'How Is A Bad Beat Jackpot Typically Split At The Table?',
        a: 'While Exact Percentages Vary By House Rules, The Industry Standard Allocation Awards 40% To 50% To The Losing Qualifying Hand, 20% To 25% To The Winning Hand, And Splits The Remaining 25% To 40% Equally Among The Other Active Players Dealt Into The Hand (Or Across The Entire Room).',
      },
    ],
  },
  {
    slug: 'time-rake-membership-clubs',
    name: 'Best Zero-Pot-Rake Time-Collection & Membership Poker Clubs',
    shortTitle: 'Best Zero-Pot-Rake Time-Collection Poker Clubs',
    gameFormat: 'Private Membership Card Clubs & Municipal Social Rooms ($0.00 Per-Hand Pot Rake)',
    recommendedBankrollBuyIns: '30 To 50 Deep-Stack Buy-Ins (Match-The-Stack & 200BB-300BB Caps Are Standard)',
    rakeImpactAnalysis:
      'In A Traditional 10% Up To $6 Cap + $2 Promo Casino Room, An Active Player Winning 3.5 Pots Per Hour Pays Roughly $24.50/Hr In Imputed Rake. At A Time-Collection Membership Club Charging $12 To $14 Per Hour (Or A $20 Daily Door Fee In Portland), Players Retain 100% Of Every Pot And Save $10 To $16 Per Hour ($20,000+ Per 1,500 Annual Hours).',
    ifThenBecause:
      'If You Play Loose-Aggressive Or Win More Than 2.5 Contested Pots Per Hour At $1/$2 Or $2/$5, Play At A Zero-Pot-Rake Time-Collection Membership Club In Texas Or Oregon Because Your Marginal Post-Flop Pots Are Never Eroded By A $7-$8 Per-Hand Drop.',
    calculatorHref: '/tools/rake-calculator',
    summary:
      'Operating Under State Private-Club Or Municipal Social-Gaming Frameworks, Texas And Oregon Card Clubs Have Pioneered Zero-Pot-Rake Live Poker Where The House Never Touches A Single Chip From Any Pot.',
    topVenues: [
      {
        venueName: 'The Lodge Card Club Austin (Texas\'s Largest Card Club)',
        location: 'Round Rock / Austin, Texas',
        stakes: '$1/$2 ($300-$500 Cap), $1/$3, $2/$5 ($1,500 Cap), $5/$10+ NLH & PLO',
        rakeOrTimeCharge: '$0.00 Pot Rake | $12-$13 Per Hour Seat Access + Membership',
        typicalTables: '65+ Permanent Tables (85+ During Major Series)',
        regionLink: '/poker-rooms/guides/austin-san-antonio-texas',
      },
      {
        venueName: 'Texas Card House (TCH) Dallas / Las Colinas',
        location: 'Dallas / Irving, Texas',
        stakes: '$1/$2, $2/$5, $5/$5 & $5/$10 NLH, PLO4, PLO5 & Bomb Pots',
        rakeOrTimeCharge: '$0.00 Pot Rake | $13-$14 Per Hour Seat Rental',
        typicalTables: '40+ Tables With Livestream Studio',
        regionLink: '/poker-rooms/guides/dallas-fort-worth-texas',
      },
      {
        venueName: 'Prime Social Poker Club Houston',
        location: 'Houston, Texas',
        stakes: '$1/$3, $2/$5, $5/$5 & $10/$25+ NLH, PLO4/PLO5 & Mixed Games',
        rakeOrTimeCharge: '$0.00 Pot Rake | $13 Per Hour Seat Access',
        typicalTables: '45+ Luxury Tables In Westheimer Corridor',
        regionLink: '/poker-rooms/guides/houston-texas',
      },
      {
        venueName: 'Champions Club Texas (Hotel & Poker Complex)',
        location: 'Houston, Texas',
        stakes: '$1/$3, $2/$5, $5/$5+ NLH & PLO + Major Guaranteed Series',
        rakeOrTimeCharge: '$0.00 Pot Rake | $12-$13 Per Hour Seat Time',
        typicalTables: '40+ Tables With On-Site Hotel Rooms',
        regionLink: '/poker-rooms/guides/houston-texas',
      },
      {
        venueName: 'Texas Card House (TCH) Houston & TCH Social Austin',
        location: 'Houston & Austin, Texas',
        stakes: '$1/$2, $1/$3, $2/$5 NLH & Deep Match-The-Stack PLO',
        rakeOrTimeCharge: '$0.00 Pot Rake | $12-$13 Per Hour Seat Time',
        typicalTables: '55+ Combined Tables Across Both Locations',
        regionLink: '/poker-rooms/guides/houston-texas',
      },
      {
        venueName: 'Poker House Dallas & Shuffle 214',
        location: 'Dallas, Texas',
        stakes: '$1/$2, $2/$5 NLH & Action Double-Board PLO Bomb Pots',
        rakeOrTimeCharge: '$0.00 Pot Rake | $12-$13 Per Hour Seat Access',
        typicalTables: '45+ Combined DFW Tables',
        regionLink: '/poker-rooms/guides/dallas-fort-worth-texas',
      },
      {
        venueName: 'San Antonio Card House & Alamo City Club Network',
        location: 'San Antonio, Texas',
        stakes: '$1/$2 ($500 Cap) & $2/$5 NLH And PLO',
        rakeOrTimeCharge: '$0.00 Pot Rake | $11-$13 Per Hour Seat Time',
        typicalTables: '30+ Tables In San Antonio Metro',
        regionLink: '/poker-rooms/guides/austin-san-antonio-texas',
      },
      {
        venueName: 'Portland Meadows Poker Room & Final Table Poker Club',
        location: 'Portland, Oregon',
        stakes: '$1/$2 & $2/$5 NLH/PLO And Daily Deepstack Tournaments',
        rakeOrTimeCharge: '$0.00 Pot Rake & $0.00 Hourly Time Fee | $15-$25 Flat Daily Door Fee',
        typicalTables: '35+ Combined Portland Tables',
        regionLink: '/poker-rooms/corridors/seattle-to-portland-northwest',
      },
    ],
    faqs: [
      {
        q: 'How Does The Hourly Seat-Time Clock Work In A Texas Poker Club?',
        a: 'When You Check In At The Front Desk, You Swipe Your Membership Card And Load Time Or Pre-Authorized Hours. Once The Dealer Swipes You Into An Active Table Seat, Your Account Is Billed By The Minute (Or 30-Minute Down) At $12 To $14 Per Hour And Pauses Automatically When You Meal-Break Or Cash Out.',
      },
      {
        q: 'Why Do Chips Remain On The Table Longer In Time-Collection Clubs?',
        a: 'In A Traditional Percentage-Rake Room Dealing 30 Hands Per Hour At $7 Total Drop Per Hand, The Casino Removes $210 Per Hour ($1,680 Over An 8-Hour Session) Directly Off The Felt. In A Time-Collection Club, Seat Fees Are Paid Separately At The Desk, Keeping 100% Of Chip Stacks In Circulation On The Table.',
      },
    ],
  },
  {
    slug: 'high-stakes-cash-games',
    name: 'Premier $5/$10, $10/$25 And High-Stakes Live Cash Game Rooms',
    shortTitle: 'Premier $5/$10+ And High-Stakes Cash Rooms',
    gameFormat: '$5/$10, $10/$20, $10/$25, $25/$50+ NLH, PLO & High-Limit Mixed Games',
    recommendedBankrollBuyIns: '40 To 75 Buy-Ins ($60,000 To $250,000+ Dedicated Liquid Risk Capital)',
    rakeImpactAnalysis:
      'At $5/$10 And Above, Virtually Every Elite Poker Room Transitions To A 30-Minute Dealer Down Time Charge ($7 To $9 Per Half Hour, Or roughly 1.4 To 1.8 Big Blinds Per Hour At $5/$10), Reducing Rake Drag To Under 3.0 BB/100 Hands.',
    ifThenBecause:
      'If You Are Moving Up To $5/$10 Or $10/$25 Live Cash, Focus On Flagship Destination Rooms With Deep 200BB-300BB+ Buy-In Caps And Time-Collection Downs (Wynn, Bellagio, Aria, Commerce, Seminole Hard Rock, Parx, Prime Social) Because Regional Rooms Only Spread $5/$10 Sporadically On Friday And Saturday Nights.',
    calculatorHref: '/tools/bankroll-calculator',
    summary:
      'While 90% Of US Poker Rooms Primarily Spread $1/$2 And $1/$3, These 8 Elite Flagship Cardrooms Run Daily, Year-Round $5/$10, $10/$25, And Nosebleed NLH, PLO, And Mixed Cash Games.',
    topVenues: [
      {
        venueName: 'Bellagio Poker Room (Legends Room / High-Limit Enclosure)',
        location: 'Las Vegas Strip, Nevada',
        stakes: '$5/$10 ($1,500 Cap), $10/$20+ NLH, $20/$40 To $400/$800+ Mixed Games',
        rakeOrTimeCharge: '$7-$8 Per 30-Minute Time Collection Down ($0 Promo Drop)',
        typicalTables: '6 To 14 Daily $5/$10+ And High-Limit Mixed Tables',
        regionLink: '/poker-rooms/guides/las-vegas-nevada',
      },
      {
        venueName: 'Aria Resort & Casino Poker Room (Table 1 / Ivey Room)',
        location: 'Las Vegas Strip, Nevada',
        stakes: '$5/$10, $10/$25, $25/$50+ NLH, High-Stakes PLO & Mixed Games',
        rakeOrTimeCharge: '$7-$8 Per 30-Minute Time Collection Down ($0 Promo Drop)',
        typicalTables: '6 To 12 Daily $5/$10+ NLH & PLO Tables',
        regionLink: '/poker-rooms/guides/las-vegas-nevada',
      },
      {
        venueName: 'Wynn / Encore Las Vegas Poker Room',
        location: 'Las Vegas Strip, Nevada',
        stakes: '$2/$5 ($1,500 Cap), $5/$10 ($3,000 Cap), $10/$20/$40 Uncapped NLH & PLO',
        rakeOrTimeCharge: '10% Up To $5 Cap At $2/$5; $7-$8 Time Collection At $5/$10+',
        typicalTables: '6 To 10 Daily Deep-Stack $5/$10+ Tables',
        regionLink: '/poker-rooms/guides/las-vegas-nevada',
      },
      {
        venueName: 'Commerce Casino & Hustler Casino (High-Limit Section)',
        location: 'Commerce & Gardena, California',
        stakes: '$5/$10 ($1,500 Cap), $10/$20, $25/$50+ NLH, PLO & $40/$80-$200/$400 Limit',
        rakeOrTimeCharge: 'Flat Per-Hand Collection / High-Limit Time Charge',
        typicalTables: '15 To 25 Combined Daily $5/$10+ Tables',
        regionLink: '/poker-rooms/guides/los-angeles-california',
      },
      {
        venueName: 'Seminole Hard Rock Hotel & Casino Hollywood',
        location: 'Hollywood, Florida',
        stakes: '$5/$10, $10/$25, $25/$50 NLH & Uncapped $5/$5-$25/$25 Rock PLO',
        rakeOrTimeCharge: '$8-$9 Per 30-Minute Time Collection Down (0% FL State Tax)',
        typicalTables: '5 To 12 Daily $5/$10+ Tables (20+ During WPT)',
        regionLink: '/poker-rooms/guides/south-florida-miami-hollywood',
      },
      {
        venueName: 'Parx Casino & Borgata Hotel Casino',
        location: 'Bensalem, PA & Atlantic City, NJ',
        stakes: '$5/$10, $10/$10, $10/$25 NLH, $5/$5-$25/$25 PLO & $20/$40+ Stud/Mixed',
        rakeOrTimeCharge: '$8-$9 Per 30-Minute Time Collection Down',
        typicalTables: '8 To 16 Combined East Coast $5/$10+ Tables',
        regionLink: '/poker-rooms/guides/philadelphia-pennsylvania',
      },
      {
        venueName: 'Prime Social Houston & The Lodge Austin',
        location: 'Houston & Austin, Texas',
        stakes: '$5/$5/$10, $5/$10/$25 & $10/$25/$50 Match-The-Stack NLH & PLO',
        rakeOrTimeCharge: '$0.00 Pot Rake | $13-$14 Per Hour Seat Rental (0% TX State Tax)',
        typicalTables: '6 To 12 Combined Texas High-Stakes Tables',
        regionLink: '/poker-rooms/guides/houston-texas',
      },
      {
        venueName: 'Bay 101 & Casino M8trix (Silicon Valley)',
        location: 'San Jose, California',
        stakes: '$5/$5/$10 Mandatory Three-Blind NLH ($2,000+ Cap) & $20/$40-$80/$160 Limit',
        rakeOrTimeCharge: 'Flat $7 Per-Hand Collection Drop',
        typicalTables: '8 To 14 Combined Daily High-Stakes Tables',
        regionLink: '/poker-rooms/corridors/bay-area-san-jose-to-sacramento',
      },
    ],
    faqs: [
      {
        q: 'How Does The "Must-Move" Game Feed System Work At $5/$10 And $2/$5?',
        a: 'To Protect The Main High-Stakes Table From Breaking When Players Quit, Rooms Like Wynn, Bellagio, Parx, And Bay 101 Seat New Arrivals Into A Secondary "Must-Move" Table First. Whenever A Seat Opens At The Main Game, The Longest-Tenured Player From The Must-Move Table Must Immediately Transfer Their Full Stack To The Main Table.',
      },
      {
        q: 'Discuss Cage Wire And Front-Money Logistics For $5/$10 And $10/$25 Travel?',
        a: 'Rather Than Carrying $25,000+ In Physical Cash Through Airports, High-Stakes Players Establish A Casino Front-Money Wire Account At The Main Cage Before Traveling, Wiring Funds Directly From Their Bank And Drawing Chips Against Their Cage Deposit Receipt.',
      },
    ],
  },
];

export function findByGameBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return POKER_ROOMS_BY_GAME.find((g) => g.slug === s) || null;
}

export function renderByGameIndexMarkdown() {
  const lines = [
    '# National Game-Type Live Poker Room Directories (/poker-rooms/by-game)',
    '',
    `> Source: [Live Poker Rooms By Game Format on Smarter.Poker](${BY_GAME_URL})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    `Curated North American Live Poker Venue Directories Ranked By Specific Game Format: Pot-Limit Omaha (PLO4/PLO5), Double-Board PLO Bomb Pots, Daily No-Limit Hold'em Tournaments, Progressive Bad Beat Jackpots, Zero-Pot-Rake Time-Collection Membership Clubs, And $5/$10+ High-Stakes Cash Games.`,
    '',
    '## 6 National Game-Type Verticals',
    '| Game Vertical | Format Covered | Recommended Bankroll | Canonical URL |',
    '| :--- | :--- | :--- | :--- |',
    ...POKER_ROOMS_BY_GAME.map(
      (g) =>
        `| **${g.shortTitle}** | ${g.gameFormat} | ${g.recommendedBankrollBuyIns} | https://smarter.poker${byGameGuidePath(g.slug)} |`
    ),
    '',
    '## Quick If / Then / Because Decision Rules By Game Format',
    ...POKER_ROOMS_BY_GAME.map((g) => `- **${g.shortTitle}**: ${g.ifThenBecause}`),
    '',
    `- **Canonical URL**: [${BY_GAME_URL}](${BY_GAME_URL})`,
    `- **Raw Markdown URL**: [${BY_GAME_URL}.md](${BY_GAME_URL}.md)`,
    '',
  ];
  return lines.join('\n');
}

export function renderByGameDetailMarkdown(game) {
  const g = typeof game === 'string' ? findByGameBySlug(game) : game;
  if (!g) return '';
  const url = `https://smarter.poker${byGameGuidePath(g.slug)}`;
  const lines = [
    `# ${g.name}`,
    '',
    `> Source: [${g.shortTitle} on Smarter.Poker](${url})`,
    '',
    '## Executive Summary',
    g.summary,
    '',
    `- **Game Format**: ${g.gameFormat}`,
    `- **Recommended Bankroll**: ${g.recommendedBankrollBuyIns}`,
    `- **Rake & Economic Impact**: ${g.rakeImpactAnalysis}`,
    `- **Interactive Calculator**: https://smarter.poker${g.calculatorHref}`,
    '',
    '## Decision Rule (If / Then / Because)',
    g.ifThenBecause,
    '',
    '## Top North American Venues For This Format',
    '| Venue Name | Location | Stakes & Games | Rake / Time Charge | Typical Tables |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...g.topVenues.map(
      (v) =>
        `| **${v.venueName}** | ${v.location} | ${v.stakes} | ${v.rakeOrTimeCharge} | ${v.typicalTables} |`
    ),
    '',
    '## Frequently Asked Questions',
    ...g.faqs.flatMap((f) => [`### ${f.q}`, f.a, '']),
    `- **Canonical URL**: [${url}](${url})`,
    `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
    '',
  ];
  return lines.join('\n');
}
