/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MAJOR POKER SERIES & FESTIVAL STRATEGY GUIDES (src/content/guides/seriesGuides.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /poker-series/guides and
 * /poker-series/guides/[slug]. Covers 10 premier North American live tournament
 * series and festivals with structure analytics, late-registration EV, cash game
 * spillover, travel logistics, and bankroll sizing.
 *
 * House style: Title Case, zero em dashes.
 */

export const SERIES_GUIDES_AS_OF = '2026-11-09';
export const SERIES_GUIDES_BASE_PATH = '/poker-series/guides';
export const SERIES_GUIDES_URL = 'https://smarter.poker/poker-series/guides';

export function seriesGuidePath(slug) {
  return `/poker-series/guides/${slug}`;
}

export function getSeriesGuideBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  return SERIES_GUIDES.find((g) => g.slug === clean) || null;
}

export const SERIES_GUIDES = [
  {
    slug: 'wsop-las-vegas',
    name: 'World Series Of Poker (WSOP) Summer Series',
    shortName: 'WSOP Las Vegas',
    hostVenue: 'Horseshoe & Paris Las Vegas',
    cityState: 'Las Vegas, NV',
    typicalMonths: 'Late May Through Mid-July (7 Weeks)',
    buyInRange: '$300 To $250,000',
    mainEventBuyIn: '$10,000 No-Limit Hold\'em World Championship',
    typicalGuarantee: '$250M+ Combined Series Prize Pools (No Formal GTD Needed)',
    blindStructureRating: '9.8 / 10 (Gold Standard 40-Min To 120-Min Levels)',
    startingStackBB: '100 BB To 300 BB',
    levelMinutes: '30 To 40 Minutes (Bracelet Prelims) / 120 Minutes (Main Event)',
    registrationStrategy:
      'Register Online Via Bravo Poker Live And Complete Verification At The Paris Champagne Ballroom Cage After 9:00 PM Night Before To Avoid 90-Minute Morning Bracelet Lines. Late Register Up To Level 6 (Roughly 35 BB To 45 BB) In $1,000 To $1,500 Freezeouts To Capture ICM Priming Value.',
    cashGameAction:
      'Over 120 Active Cash Tables Inside Paris And Horseshoe Plus Overflow Peak Action At Wynn, Bellagio, And Aria From $1/$3 NLH Through $100/$200 Mixed Games And Pot-Limit Omaha.',
    travelLogistics:
      'Stay Connected Via The Indoor Walkway Between Horseshoe And Paris To Avoid 110F Outdoor Heat. Book Refundable Strip Room Blocks In January Or Utilize Mid-Strip Monorail Access.',
    bankrollRequirement:
      '100 To 150 Average Buy-Ins ($75,000+ For A Full $1,000 - $1,500 Bracelet Schedule; $15,000+ For A 10-Day $400 - $800 Daily Deepstack & Mystery Millions Trip).',
    keyEvents: [
      {
        eventName: '$10,000 WSOP Main Event World Championship',
        buyIn: '$10,000',
        format: 'Freezeout (60,000 Chips, 120-Minute Levels)',
        notes: 'The Deepest Annual Tournament Structure In World Poker With 300 BB Starting Stack.',
      },
      {
        eventName: '$1,000 Mystery Millions & Millionaire Maker ($1,500)',
        buyIn: '$1,000 - $1,500',
        format: 'Multi-Flight Re-Entry Bracelet Events',
        notes: 'Massive 10,000+ Entry Fields With Soft Weekend Recreational Turnout And $1M Top Bounties.',
      },
      {
        eventName: '$400 Gladiators Of Poker & $250 Daily Deepstacks',
        buyIn: '$250 - $400',
        format: 'Multi-Flight & Single-Day NLH',
        notes: 'High-ROI Bankroll Builders Running Every Afternoon Inside Paris And Horseshoe.',
      },
    ],
    faqs: [
      {
        q: 'How Do I Skip The Registration Lines At The WSOP In Las Vegas?',
        a: 'Create And Verify Your Bravo Account And Caesars Rewards Card At The Registration Desk Once During Off-Peak Late-Night Hours (10:00 PM To 2:00 AM), Then Use The Self-Service Kiosks To Print Seat Tickets In Under 60 Seconds For The Remainder Of The Summer.',
      },
      {
        q: 'What Is The Starting Stack And Level Length Of The $10,000 WSOP Main Event?',
        a: 'Players Start With 60,000 Chips At 100/200/200 Blinds (300 Big Blinds) And Play Five 120-Minute Levels Per Day With A 75-Minute Dinner Break.',
      },
      {
        q: 'Are WSOP Daily Deepstacks Good Value Compared To Bracelet Events?',
        a: 'Yes. The 1:00 PM $250 And 4:00 PM $400 Daily Deepstacks Draw 400 To 900 Recreational Players Daily With Manageable Single-Day Schedules And Soft Postflop Fields.',
      },
    ],
  },
  {
    slug: 'wpt-world-championship',
    name: 'WPT World Championship Festival At Wynn Las Vegas',
    shortName: 'WPT World Championship',
    hostVenue: 'Wynn & Encore Las Vegas',
    cityState: 'Las Vegas, NV',
    typicalMonths: 'Early To Late December (3 Weeks)',
    buyInRange: '$600 To $100,000',
    mainEventBuyIn: '$10,400 WPT World Championship',
    typicalGuarantee: '$40,000,000+ Combined Festival Guarantees',
    blindStructureRating: '9.9 / 10 (Industry-Leading Wynn Structure & Service)',
    startingStackBB: '150 BB To 250 BB',
    levelMinutes: '40 To 60 Minutes (Prelims) / 60 To 90 Minutes (Championship)',
    registrationStrategy:
      'Arrive 30 Minutes Before Flight Start Or Register At Level 4 (Roughly 65 BB) In Multi-Flight Prelims Like The WPT Prime Championship ($1,100) Where Alternates Move Quickly.',
    cashGameAction:
      'Wynn Spreads 35+ Round-The-Clock Cash Tables Featuring Unmatched $1/$3 ($500 Cap), $2/$5 ($1,500 Cap), And $5/$10 ($3,000 Cap) No-Limit Hold\'em Plus Deep PLO.',
    travelLogistics:
      'December Las Vegas Hotel Rates Are At Seasonal Lows Between Rodeo Week And Christmas, Making North Strip Accommodations High Value.',
    bankrollRequirement:
      '100 Buy-Ins ($110,000+ For $1,100 - $3,000 WPT Prime & High Rollers; $25,000+ For $600 - $1,100 Prelims).',
    keyEvents: [
      {
        eventName: '$10,400 WPT World Championship',
        buyIn: '$10,400',
        format: 'Multi-Flight Championship (100,000 Chips, 60-90 Min Levels)',
        notes: 'Flagship December Championship Attracting Global Qualifiers And Satellite Winners.',
      },
      {
        eventName: '$1,100 WPT Prime Championship',
        buyIn: '$1,100',
        format: 'Multi-Flight NLH ($5M+ Typical Prize Pool)',
        notes: 'One Of The Highest-Value $1,100 Tournaments In World Poker With 40-Min Day 1 And 60-Min Day 2 Levels.',
      },
      {
        eventName: '$1,600 Mystery Bounty & $600 Deepstacks',
        buyIn: '$600 - $1,600',
        format: 'Multi-Flight & Two-Day NLH / PLO',
        notes: 'Consistent Six-Figure First Prizes With Lower House Rake Percentages Than Standard Daily Events.',
      },
    ],
    faqs: [
      {
        q: 'Why Is The WPT World Championship At Wynn Considered A Favorite Among Pros?',
        a: 'Wynn Combines Generous Starting Stacks, Slow Blind Increases, Best-In-Class Tournament Dealers, And Low-Rake $1,500-Cap $2/$5 Cash Games All Under One Roof.',
      },
      {
        q: 'When Is The Best Flight To Enter The $1,100 WPT Prime Championship?',
        a: 'The Final Friday Or Saturday Flight Typically Draws The Largest Contingent Of Weekend Recreational Travelers And Club Qualifiers.',
      },
      {
        q: 'Does Wynn Charge Promotional Jackpot Drops In Cash Games During The WPT?',
        a: 'No. Wynn Operates A Pure 10% Up To $5 Cap Rake With Zero Promotional Jackpot Drop.',
      },
    ],
  },
  {
    slug: 'wsop-circuit',
    name: 'World Series Of Poker Circuit (WSOPC) Regional Tour',
    shortName: 'WSOP Circuit',
    hostVenue: '25+ Regional US Casinos (Choctaw, Cherokee, Thunder Valley, Pompano, Hammond)',
    cityState: 'Nationwide Regional Tour',
    typicalMonths: 'Year-Round (August Through May Season)',
    buyInRange: '$250 To $3,250',
    mainEventBuyIn: '$1,700 WSOP Circuit Main Event',
    typicalGuarantee: '$500,000 To $1,500,000 Main Event Guarantee',
    blindStructureRating: '8.7 / 10 (Standardized 30-Min Day 1 / 40-Min Day 2 Ring Structure)',
    startingStackBB: '100 BB To 200 BB',
    levelMinutes: '30 Minutes (Ring Prelims) / 40 To 60 Minutes (Main Event)',
    registrationStrategy:
      'Target Multi-Flight $400 Monster Stack And Gargantuan Opening Weekend Ring Events On Friday And Saturday Flights; Save Two Bullet Allocations For The $1,700 Main Event.',
    cashGameAction:
      'Regional Stops Like Harrah\'s Cherokee, Choctaw Durant, And Graton/Thunder Valley Generate Explosive $1/$3, $2/$5, And $5/$5 PLO Cash Games Throughout The 12-Day Series.',
    travelLogistics:
      'Book Host Casino Rooms 60 Days Out Because Rural And Tribal Destinations (Cherokee NC, Durant OK) Sell Out Completely On Main Event Weekends.',
    bankrollRequirement:
      '75 To 100 Buy-Ins ($40,000 For Full Ring Schedule Including $1,700 Main; $12,000 For $400 - $600 Ring Events).',
    keyEvents: [
      {
        eventName: '$1,700 WSOP Circuit Main Event',
        buyIn: '$1,700',
        format: '2-3 Starting Flights, 1 Re-Entry Per Flight (40,000 Chips)',
        notes: 'Awards Gold WSOPC Ring, Six-Figure Top Prize, And Automatic Entry Into The Tournament Of Champions.',
      },
      {
        eventName: '$400 Monster Stack & Multi-Flight Opener',
        buyIn: '$400',
        format: '4 To 6 Starting Flights (30,000 - 40,000 Chips)',
        notes: 'Draws 1,000 To 3,500 Entries With Massive Weekend Recreational Participation.',
      },
      {
        eventName: '$600 Mystery Bounty & $1,100 High-Tier Ring',
        buyIn: '$600 - $1,100',
        format: 'Two-Day Ring Events',
        notes: 'Bridges The Gap Between $400 Prelims And The $1,700 Main Event.',
      },
    ],
    faqs: [
      {
        q: 'What Do You Win Besides Prize Money When Winning A WSOP Circuit Ring?',
        a: 'Every Official WSOP Circuit Gold Ring Winner Earns An Automatic Free Seat Into The $1,000,000 Freeroll WSOP Tournament Of Champions.',
      },
      {
        q: 'Which WSOP Circuit Stops Have The Largest Prize Pools?',
        a: 'Harrah\'s Cherokee (North Carolina), Choctaw Casino Resort (Durant, Oklahoma), Thunder Valley (California), And Harrah\'s Pompano Beach (Florida) Regularly Exceed $1.5M Main Event Prize Pools.',
      },
      {
        q: 'How Many Re-Entries Are Allowed In The $1,700 WSOPC Main Event?',
        a: 'Standard WSOP Circuit Rules Allow One Re-Entry Per Starting Flight (Up To Two Total Bullets Per Flight).',
      },
    ],
  },
  {
    slug: 'mspt-mid-states-poker-tour',
    name: 'Mid-States Poker Tour (MSPT) Major Regional Series',
    shortName: 'MSPT Tour',
    hostVenue: 'Running Aces, Canterbury, FireKeepers, Venetian, Sycuan, Riverside',
    cityState: 'Midwest & National Tour',
    typicalMonths: 'Year-Round (20+ Annual Stops)',
    buyInRange: '$250 To $1,600',
    mainEventBuyIn: '$1,110 MSPT Main Event',
    typicalGuarantee: '$300,000 To $1,500,000 Main Event Guarantee',
    blindStructureRating: '9.0 / 10 (40-Minute Levels From Level 1 In Main Event)',
    startingStackBB: '150 BB (30,000 Starting Chips At 100/200)',
    levelMinutes: '40 Minutes Across All Day 1 And Day 2 Main Event Levels',
    registrationStrategy:
      'Utilize $265 And $140 Landmark Milestone Satellites Running Wednesday Through Friday Where Hitting The Milestone Chip Target Instantly Awards Your $1,110 Main Event Seat.',
    cashGameAction:
      'Flagship Stops Like FireKeepers (Battle Creek, MI) And Running Aces (Minnesota) Pack 30+ Tables Of Action-Heavy Midwest Cash Games And $2/$100 Spread-Limit.',
    travelLogistics:
      'Drive-Market Stops Across Michigan, Minnesota, Iowa, And Ohio Offer Affordable Hotel Rates And Free Self-Parking.',
    bankrollRequirement:
      '75 Buy-Ins ($35,000 For Full $1,110 Main Event Tour Grinders; $8,000 For Regional Weekend Satellite And Prelim Players).',
    keyEvents: [
      {
        eventName: '$1,110 MSPT Main Event',
        buyIn: '$1,110',
        format: '3 Starting Flights (30,000 Chips, 40-Minute Levels)',
        notes: 'Renowned For Giving Players Full 40-Minute Blind Levels From The Very First Hand On Day 1.',
      },
      {
        eventName: '$360 - $400 Regional Opener Trophy Event',
        buyIn: '$360 - $400',
        format: 'Multi-Flight NLH',
        notes: 'Kicks Off Each Stop With 500 To 1,500 Entries.',
      },
      {
        eventName: '$265 Milestone Satellite To $1,110 Main Event',
        buyIn: '$265',
        format: '1-In-5 Landmark Satellite',
        notes: 'Players Instantly Bag A $1,110 Seat The Moment Their Stack Reaches 5x Starting Chips.',
      },
    ],
    faqs: [
      {
        q: 'How Do MSPT Milestone Satellites Work?',
        a: 'In A 1-In-5 Milestone Satellite Where Players Start With 10,000 Chips, The Instant Any Player Accumulates 50,000 Chips Their Chips Are Removed From Play And They Immediately Receive Their $1,110 Main Event Seat.',
      },
      {
        q: 'Which MSPT Stop Has The Biggest Field Outside Las Vegas?',
        a: 'FireKeepers Casino In Battle Creek, Michigan Regularly Draws 2,400 To 2,800 Entries In Its $1,110 Main Event For A $2.5M+ Prize Pool.',
      },
      {
        q: 'How Long Are Blind Levels In An MSPT Main Event?',
        a: 'All Day 1 And Day 2 Levels In Standard Standalone MSPT $1,110 Main Events Are 40 Minutes Long.',
      },
    ],
  },
  {
    slug: 'rgps-rungood-poker-series',
    name: 'RunGood Poker Series (RGPS) Mid-Major Tour',
    shortName: 'RunGood Series (RGPS)',
    hostVenue: 'Thunder Valley, Jamul, Downstream, Horseshoe Council Bluffs, Tulsa, Jacksonville',
    cityState: 'Midwest, West Coast & South Tour',
    typicalMonths: 'Year-Round (16+ Annual Stops)',
    buyInRange: '$200 To $1,100',
    mainEventBuyIn: '$600 To $1,100 RGPS Main Event',
    typicalGuarantee: '$200,000 To $1,000,000 Guarantee',
    blindStructureRating: '8.5 / 10 (Accessible Mid-Stakes Structure)',
    startingStackBB: '150 BB To 200 BB',
    levelMinutes: '30 Minutes (Day 1) / 40 Minutes (Day 2)',
    registrationStrategy:
      'Play Early Week $250 - $400 Deepstack Ring Events And Ambassador Bounty Tournaments Where Recreational Turnout And Added Merchandise Prizes Boost ROI.',
    cashGameAction:
      'Accessible $1/$2, $1/$3, And $2/$5 NLH And $2/$2 PLO Cash Games With Friendly Recreational Table Atmospheres.',
    travelLogistics:
      'RGPS Negotiates Discounted Player Room Rates ($99 - $139/Night) At Host Casinos; Always Ask For The RunGood Poker Room Block Code.',
    bankrollRequirement:
      '60 To 80 Buy-Ins ($18,000 To $30,000 Covers Full Series Prelims And $600 - $800 Main Events).',
    keyEvents: [
      {
        eventName: '$600 - $1,100 RGPS Main Event',
        buyIn: '$600 - $1,100',
        format: '3 To 4 Starting Flights (30,000 - 40,000 Chips)',
        notes: 'Signature Mid-Major Main Event With Custom RGPS Ring And Dream Seat Qualification.',
      },
      {
        eventName: '$400 DeepStack Opener',
        buyIn: '$400',
        format: 'Multi-Flight Re-Entry NLH',
        notes: 'High-Volume Weekend Opener With Soft Local Fields.',
      },
      {
        eventName: '$250 - $300 Ambassador Bounty & PLO Ring',
        buyIn: '$250 - $300',
        format: 'Single-Day Bounty & Pot-Limit Omaha',
        notes: 'Features Mystery Envelopes And Sponsored Bounties.',
      },
    ],
    faqs: [
      {
        q: 'Why Is The RunGood Poker Series Ideal For Moving Up From Daily Tournaments?',
        a: 'With Prelims Priced Between $200 And $400 And Main Events Between $600 And $1,100, RGPS Offers Major-Series Trophy Structures At Half The Buy-In Cost Of A WSOPC Stop.',
      },
      {
        q: 'What Is The RGPS Dream Seat Invitational?',
        a: 'Ring Winners Across The Season Qualify For Exclusive Championship Freerolls And High-Stakes Invitational Seats.',
      },
      {
        q: 'How Many Flights Does An RGPS Main Event Usually Have?',
        a: 'Most Stops Run Three Or Four Flights Across Friday And Saturday Before Combining For Sunday Day 2.',
      },
    ],
  },
  {
    slug: 'seminole-hard-rock-poker-open',
    name: 'Seminole Hard Rock Poker Open (SHRPO), Showdown & Rock N Roll Open',
    shortName: 'Seminole Hard Rock (SHRPO)',
    hostVenue: 'Seminole Hard Rock Hotel & Casino Hollywood (The Guitar Hotel)',
    cityState: 'Hollywood (Fort Lauderdale / Miami), FL',
    typicalMonths: 'April (Showdown), August (SHRPO), November (RRPO)',
    buyInRange: '$400 To $50,000',
    mainEventBuyIn: '$3,500 To $5,300 Championship Main Event',
    typicalGuarantee: '$3,000,000 To $5,000,000 Championship Guarantee',
    blindStructureRating: '9.6 / 10 (Premier East Coast Deepstack Structure)',
    startingStackBB: '125 BB To 250 BB',
    levelMinutes: '40 Minutes (Multi-Flight Prelims) / 60 To 90 Minutes (Championship)',
    registrationStrategy:
      'Target The Opening Weekend $400 Or $600 Deep Stack ($1M - $2M Guaranteed With 6 To 8 Flights) Where 4,000+ South Florida And Latin American Players Create Massive Prize Pools.',
    cashGameAction:
      '45+ Permanent Tables Plus Ballroom Expansion Spreading The Best $2/$5, $5/$10 NLH, And $2/$2 To $25/$50 Pot-Limit Omaha Action On The East Coast.',
    travelLogistics:
      'Fly Into Fort Lauderdale-Hollywood Airport (FLL) Just 12 Minutes Away; Book Nearby Dania Beach Or Stirling Road Hotels If Guitar Hotel Rates Spike.',
    bankrollRequirement:
      '100 Buy-Ins ($50,000+ For $600 - $1,100 Prelims; $150,000+ Or Staking For $3,500 - $5,300 Championship Events).',
    keyEvents: [
      {
        eventName: '$5,300 SHRPO Championship / $3,500 WPT Showdown & RRPO',
        buyIn: '$3,500 - $5,300',
        format: '2 Starting Flights (50,000 Chips, 60-90 Min Levels)',
        notes: '$3M To $5M Guaranteed Flagship Championships.',
      },
      {
        eventName: '$400 - $600 Opening Deep Stack ($1M - $2M GTD)',
        buyIn: '$400 - $600',
        format: '6 To 8 Starting Flights (30,000 Chips, 30-40 Min Levels)',
        notes: 'Consistently Draws 3,500 To 6,000 Entries In Opening Week.',
      },
      {
        eventName: '$1,100 & $2,200 Deep Stack & PLO Championships',
        buyIn: '$1,100 - $2,200',
        format: 'Multi-Flight NLH And 4-Card/5-Card PLO',
        notes: 'Huge International And High-Action Omaha Fields.',
      },
    ],
    faqs: [
      {
        q: 'How Many Major Series Does Seminole Hard Rock Hollywood Host Each Year?',
        a: 'Four Flagship Festivals: Lucky Hearts Poker Open (January), Poker Showdown (April), Seminole Hard Rock Poker Open SHRPO (August), And Rock N Roll Poker Open RRPO (November).',
      },
      {
        q: 'Which Airport Is Closest To Seminole Hard Rock Hollywood?',
        a: 'Fort Lauderdale-Hollywood International Airport (FLL) Is Only 7 Miles (12 Minutes) From The Casino.',
      },
      {
        q: 'Why Are PLO Tournaments So Big At Seminole Hard Rock?',
        a: 'South Florida Has One Of The Largest Year-Round Pot-Limit Omaha Cash Game Ecosystems In America, Feeding Massive Entries Into Every $400 To $10,000 PLO Event.',
      },
    ],
  },
  {
    slug: 'borgata-poker-open',
    name: 'Borgata Poker Open, Winter Open & Return Series',
    shortName: 'Borgata Poker Open',
    hostVenue: 'Borgata Hotel Casino & Spa',
    cityState: 'Atlantic City, NJ',
    typicalMonths: 'January (Winter), May (Spring), September (Borgata Open)',
    buyInRange: '$400 To $10,000',
    mainEventBuyIn: '$3,500 To $5,300 Championship',
    typicalGuarantee: '$2,000,000 To $4,000,000 Championship Guarantee',
    blindStructureRating: '9.4 / 10 (Classic Northeast Deepstacks)',
    startingStackBB: '150 BB To 250 BB',
    levelMinutes: '40 To 50 Minutes (Prelims) / 60 To 75 Minutes (Championship)',
    registrationStrategy:
      'Enter Day 1A Or 1B Of The Kickoff Almighty Stack ($500 - $800 Buy-In With 100,000 Starting Chips) To Build A Massive Stack Against Northeast Recreational Fields.',
    cashGameAction:
      '52-Table Permanent Poker Room Hosting Continuous $1/$3, $2/$5 ($1,000 Cap), $5/$10 NLH, $2/$2 And $5/$5 PLO, And High-Limit Mixed Games.',
    travelLogistics:
      'Easy Drive Via Garden State Parkway From NYC (2 Hours), Philadelphia (1 Hour), And Baltimore/DC (2.5 Hours); MGM Rewards Members Receive Discounted Weekday Water Club And Borgata Tower Rooms.',
    bankrollRequirement:
      '80 To 100 Buy-Ins ($40,000 For $500 - $1,100 Prelims; $120,000+ For Championship Schedule).',
    keyEvents: [
      {
        eventName: '$3,500 - $5,300 Borgata Championship Main Event',
        buyIn: '$3,500 - $5,300',
        format: '2 Starting Flights (50,000 Chips, 60-75 Min Levels)',
        notes: 'The Undisputed Flagship Tournament Of The Northeast Corridor.',
      },
      {
        eventName: '$600 - $800 Kickoff Deepstack ($1M - $2M GTD)',
        buyIn: '$600 - $800',
        format: '5 Starting Flights',
        notes: 'Draws Thousands Of Players From New York, New Jersey, And Pennsylvania.',
      },
      {
        eventName: '$500 Almighty Stack (100,000 Starting Chips)',
        buyIn: '$500',
        format: 'Multi-Flight High-Chip-Count NLH',
        notes: 'Action-Packed Mid-Series Staple With Deep Early Play.',
      },
    ],
    faqs: [
      {
        q: 'Is Borgata Still The Largest Poker Room In Atlantic City And The Northeast?',
        a: 'Yes. Borgata Commands Over 65% Of Atlantic City Poker Revenue With 52 Permanent Tables Plus Event Center Tournament Seating.',
      },
      {
        q: 'Can I Play Regulated Online Poker In My Hotel Room At Borgata?',
        a: 'Yes. Because You Are Physically Located Inside New Jersey, You Can Simultaneously Grind Regulated NJ Online Series On Your Laptop Or Phone.',
      },
      {
        q: 'What Is The Cash Game Rake At Borgata?',
        a: 'Borgata Charges 10% Up To A $5 Maximum Rake Cap At $1/$3 And $2/$5 No-Limit Hold\'em.',
      },
    ],
  },
  {
    slug: 'wynn-millions-classic',
    name: 'Wynn Summer Classic & Wynn Millions Series',
    shortName: 'Wynn Classic & Millions',
    hostVenue: 'Wynn & Encore Las Vegas',
    cityState: 'Las Vegas, NV',
    typicalMonths: 'March (Wynn Millions), Late May - July (Summer Classic), October (Fall Classic)',
    buyInRange: '$600 To $25,000',
    mainEventBuyIn: '$3,500 To $10,000 Championship',
    typicalGuarantee: '$25,000,000+ Combined Summer Guarantees',
    blindStructureRating: '9.9 / 10 (Widely Regarded As Best Overall Structure In Vegas)',
    startingStackBB: '150 BB To 200 BB',
    levelMinutes: '40 Minutes (Prelims) / 60 To 90 Minutes (Championships)',
    registrationStrategy:
      'During June And July, Treat Wynn Summer Classic $1,100, $1,600, And $2,200 Multi-Flight Events As Co-Anchors Alongside WSOP Bracelet Events; Lower Rake And Better Structures Yield Superior Hourly EV.',
    cashGameAction:
      'Encore Poker Room Runs 28 To 38 Tables 24/7 With $500-Cap $1/$3 And $1,500-Cap $2/$5 Games That Play Deeper Than Any Other Strip Room.',
    travelLogistics:
      'Free Self-Parking At Wynn/Encore Garage And Easy Pedestrian Bridge Access From Venetian/Palazzo Across Sands Avenue.',
    bankrollRequirement:
      '100 Buy-Ins ($100,000+ For $1,100 - $3,500 Wynn Classic Grinders).',
    keyEvents: [
      {
        eventName: '$3,500 Wynn Summer Championship ($3M - $5M GTD)',
        buyIn: '$3,500',
        format: '3 Starting Flights (40,000 Chips, 60-Min Levels)',
        notes: 'Draws Elite Global Pros And Wealthy Business Recreationals Every June.',
      },
      {
        eventName: '$1,600 Mystery Bounty ($1.5M - $2.5M GTD)',
        buyIn: '$1,600',
        format: 'Multi-Flight Mystery Bounty ($100,000 Top Envelopes)',
        notes: 'Signature Mystery Bounty Format With Huge Day 2 Drum Draws.',
      },
      {
        eventName: '$1,100 & $600 Multi-Flight Seniors, Ladies & NLH Prelims',
        buyIn: '$600 - $1,100',
        format: 'Multi-Flight & Two-Day Deepstacks',
        notes: 'Pristine 40-Minute Levels And Zero Gimmick Fee Deductions.',
      },
    ],
    faqs: [
      {
        q: 'Why Do Many Tournament Pros Prefer The Wynn Summer Classic Over WSOP Prelims?',
        a: 'Wynn Offers Slower Blind Progressions, More Spacious 8-Handed Or 9-Handed Tables, Faster Registration Lines, And Lower Fee Deductions On $1,100 To $3,500 Buy-Ins.',
      },
      {
        q: 'Where Are Wynn Tournament Tables Located?',
        a: 'Major Series Events Are Hosted In The Lafite And Latour Ballrooms Just Steps From The Encore Poker Room.',
      },
      {
        q: 'Does Wynn Run Satellites To Its $3,500 And $10,000 Championships?',
        a: 'Yes, Daily $400 To $1,100 Turbo And Milestone Satellites Run Throughout Each Series.',
      },
    ],
  },
  {
    slug: 'venetian-deepstack-championship',
    name: 'Venetian DeepStack Championship & DeepStack Extravaganza',
    shortName: 'Venetian DeepStack',
    hostVenue: 'The Venetian Resort Las Vegas (Grand Canal Shoppes Level 2)',
    cityState: 'Las Vegas, NV',
    typicalMonths: 'Year-Round (Extravaganza I, II, III, IV + May - July Summer Championship)',
    buyInRange: '$300 To $5,000',
    mainEventBuyIn: '$1,600 To $2,500 UltimateStack & MSPT/WPT Venetian Championships',
    typicalGuarantee: '$15,000,000+ Summer Series Guarantees',
    blindStructureRating: '9.3 / 10 (Generous Starting Stacks & Long Levels)',
    startingStackBB: '150 BB To 200 BB',
    levelMinutes: '30 To 40 Minutes Across All UltimateStack & MonsterStack Events',
    registrationStrategy:
      'Venetian Runs Multi-Flight $600, $800, And $1,100 UltimateStack Events Almost Every Single Week Of The Year, Making It The Most Reliable Mid-Stakes Destination Outside Summer.',
    cashGameAction:
      'Brand-New 50-Table Venetian Poker Room On Level 2 Of The Grand Canal Shoppes With High-Hand Promotions, Streaming Studio, And Dedicated Restrooms And Lounge.',
    travelLogistics:
      'Located Center-Strip Directly Across From Wynn And Connected Indoor To Palazzo; Abundant Dining Inside Grand Canal Shoppes During 45-Minute Breaks.',
    bankrollRequirement:
      '75 To 100 Buy-Ins ($45,000 For $600 - $1,100 Grinders; $20,000 For $400 - $600 Extravaganza Trips).',
    keyEvents: [
      {
        eventName: '$1,600 & $1,100 MSPT / UltimateStack Championships',
        buyIn: '$1,100 - $1,600',
        format: '3 Starting Flights (40,000 Chips, 40-Min Levels)',
        notes: 'Massive Guaranteed Prize Pools Throughout Both Summer And Off-Season.',
      },
      {
        eventName: '$600 & $800 UltimateStack ($250K - $1M GTD)',
        buyIn: '$600 - $800',
        format: 'Multi-Flight Re-Entry',
        notes: '40,000 Starting Chips Gives Extensive Playability In The Mid-Tier Buy-In Bracket.',
      },
      {
        eventName: '$400 Seniors, Bounty & Omaha Hi-Lo Events',
        buyIn: '$400 - $600',
        format: 'Single-Day & Two-Day Specialty Events',
        notes: 'Strong Mixed-Game Schedule Including O8, Big O, And Limit Mixed.',
      },
    ],
    faqs: [
      {
        q: 'Where Did The Venetian Poker Room Relocate In 2024 - 2026?',
        a: 'The Venetian Poker Room Moved From The Casino Floor Up To A Custom-Built 14,000-Square-Foot, 50-Table Venue On Level 2 Of The Grand Canal Shoppes Next To The Palazzo Theatre.',
      },
      {
        q: 'Does Venetian Run Tournaments Outside The Summer WSOP Months?',
        a: 'Yes. Venetian Hosts DeepStack Extravaganza Series Nearly Every Month Of The Year, Making It The #1 Year-Round Tournament Room In Las Vegas.',
      },
      {
        q: 'Are Mixed Games Spread During The Venetian Summer Series?',
        a: 'Yes, Venetian Spreads Dedicated Omaha Hi-Lo, Big O (5-Card PLO8), H.O.R.S.E., And Triple Draw Events.',
      },
    ],
  },
  {
    slug: 'texas-card-house-lodge-championship',
    name: 'Texas Major Card Club Series (The Lodge Championship & TCH Millions)',
    shortName: 'Texas Major Series (Lodge & TCH)',
    hostVenue: 'The Lodge Card Club (Austin / San Antonio) & Texas Card House (Dallas / Houston / Austin)',
    cityState: 'Austin, Dallas & Houston, TX',
    typicalMonths: 'January, May, August & October Major Series',
    buyInRange: '$200 To $5,000',
    mainEventBuyIn: '$1,500 To $3,000 Championship Main Event',
    typicalGuarantee: '$1,000,000 To $2,000,000 Main Event Guarantee ($5M+ Series Total)',
    blindStructureRating: '9.2 / 10 (Zero Pot Rake + Deep Texas Starting Stacks)',
    startingStackBB: '200 BB To 300 BB',
    levelMinutes: '30 To 45 Minutes (Day 1) / 45 To 60 Minutes (Day 2 & Final Table)',
    registrationStrategy:
      'Enter Early Flights Because Texas Players Re-Enter Aggressively And Drive Average Stacks To 60+ BB Going Into Late Registration; Purchase Daily/Monthly Club Membership In Advance On The Club App.',
    cashGameAction:
      'Texas Card Clubs Spread The Deepest, Loosest Cash Games In North America With Zero Pot Rake ($10 - $14/Hr Seat Time), Match-The-Stack Buy-Ins, Mandatory Straddles, And Double-Board Bomb Pots.',
    travelLogistics:
      'Rental Car Recommended In Austin (Round Rock), Dallas (Las Colinas / North Dallas), And Houston (Westheimer / Spring); Ample Free Surface Parking At All Club Locations.',
    bankrollRequirement:
      '80 To 100 Buy-Ins For Tournaments Plus At Least 20 Deep Buy-Ins ($20,000+) If Jumping Into Match-The-Stack $1/$2 And $2/$5 Texas Cash Games.',
    keyEvents: [
      {
        eventName: '$1,500 - $3,000 Lodge Championship / TCH Millions Main Event',
        buyIn: '$1,500 - $3,000',
        format: '4 To 6 Starting Flights ($1M - $2M Guaranteed)',
        notes: 'Loose, Aggressive Postflop Play With Huge Multiway Pots And Livestreamed Final Tables.',
      },
      {
        eventName: '$400 - $600 Texas Deepstack Opener ($500K - $1M GTD)',
        buyIn: '$400 - $600',
        format: '6 To 8 Starting Flights',
        notes: 'Massive Local Field Turnouts Exceeding 2,000 Total Entries.',
      },
      {
        eventName: '$600 - $1,100 Pot-Limit Omaha & Bomb Pot Championships',
        buyIn: '$600 - $1,100',
        format: '4-Card/5-Card PLO & Double-Board Bomb Pot Formats',
        notes: 'Signature Texas Action Formats Unavailable At Traditional Casinos.',
      },
    ],
    faqs: [
      {
        q: 'How Do Texas Card Rooms Operate Legally Without Charging Pot Rake?',
        a: 'Texas Social Poker Clubs Operate Under A Private Membership Model Where The House Takes $0 From Any Cash Pot Or Prize Pool And Instead Charges A Membership Fee Plus Hourly Seat Time Or Administrative Access Fees.',
      },
      {
        q: 'Why Do $1/$2 Cash Games In Texas Play Like $2/$5 Or $5/$10 Elsewhere?',
        a: 'Because Most Texas Clubs Allow $500 To $1,000 Initial Buy-Ins Or Match-The-Biggest-Stack At $1/$2 And $1/$3 Along With Frequent $5 Or $10 Button Straddles.',
      },
      {
        q: 'Do I Need To Be A Texas Resident To Play In A Lodge Or TCH Tournament Series?',
        a: 'No. Any Visitor Age 21+ With A Valid Government ID Can Purchase A Daily Or Weekly Club Membership At The Front Desk In Less Than Five Minutes.',
      },
    ],
  },
];
