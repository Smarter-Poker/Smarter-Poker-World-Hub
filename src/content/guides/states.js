/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOP 15 US STATE POKER LEGALITY, TAX & ROOM DIRECTORY HUB
 *  (src/content/guides/states.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /poker-rooms/states and /poker-rooms/states/[state].
 * Covers the top 15 US poker states with legal age, state income tax rates,
 * W-2G withholding rules, active live cardroom counts, rake models, and
 * regulated online real-money poker status.
 *
 * House style: Title Case, zero em dashes.
 */

export const STATES_AS_OF = '2026-11-10';
export const STATES_BASE_PATH = '/poker-rooms/states';
export const STATES_URL = 'https://smarter.poker/poker-rooms/states';

export function stateGuidePath(slug) {
  return `/poker-rooms/states/${slug}`;
}

const STATE_SLUG_ALIASES = {
  nv: 'nevada',
  tx: 'texas',
  fl: 'florida',
  ca: 'california',
  calif: 'california',
  pa: 'pennsylvania',
  nj: 'new-jersey',
  newjersey: 'new-jersey',
  mi: 'michigan',
  md: 'maryland',
  az: 'arizona',
  co: 'colorado',
  il: 'illinois',
  la: 'louisiana',
  ms: 'mississippi',
  ny: 'new-york',
  newyork: 'new-york',
  oh: 'ohio',
};

export function getStateGuideBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  const target = STATE_SLUG_ALIASES[clean] || clean;
  return (
    US_POKER_STATES.find(
      (s) => s.slug === target || s.code.toLowerCase() === target
    ) || null
  );
}

export const US_POKER_STATES = [
  {
    slug: 'nevada',
    code: 'NV',
    name: 'Nevada',
    title: 'Nevada Poker Laws, Taxes, Rake & Live Casino Rooms Guide (2026)',
    h1: 'Nevada Live & Online Poker Guide: Legality, 0% State Tax & Strip Rooms',
    legalStatus: '100% Legal Commercial Casino & Regulated Online Poker',
    minAge: '21+',
    stateIncomeTaxRate: '0.0% (Zero State Income Tax)',
    approxLiveRooms: '28+ Active Poker Rooms (Las Vegas, Reno, Lake Tahoe, Laughlin)',
    topCities: ['Las Vegas', 'Henderson', 'Reno', 'Stateline (Lake Tahoe)'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap (Zero Promo Drop At Premier Strip Rooms)',
    onlineRealMoneyStatus: 'Legal & Regulated (WSOP.com Multi-State Shared Liquidity Pool)',
    summary:
      'Nevada Is The Global Capital Of Regulated Poker, Offering 28+ Active Brick-And-Mortar Casino Poker Rooms, Multi-State Regulated Online Poker, Low 10% Up To $5-$6 Cap Rake On The Las Vegas Strip, And A 0% State Income Tax Rate.',
    regulatoryOverview:
      'Regulated By The Nevada Gaming Control Board (NGCB) And Nevada Gaming Commission. Commercial Casino Cardrooms Operate 24/7 Across Clark County And Washoe County, And Nevada Participates In The Multi-State Internet Gaming Agreement (MSIGA) Alongside New Jersey, Michigan, And Pennsylvania.',
    taxWithholdingNotes:
      'Nevada Levies Zero State Income Tax On Gambling Or Tournament Winnings. Federal IRS Form W-2G Applies Automatically To Net Poker Tournament Payouts Exceeding $5,000 (24% Federal Backup Withholding If No SSN Is Provided; Cash Game Chip Redemptions Do Not Trigger W-2G Forms).',
    faqs: [
      {
        q: 'Does Nevada Charge State Income Tax On WSOP Or Poker Tournament Winnings?',
        a: 'No. Nevada Has A 0% State Income Tax Rate, So Casinos Never Withhold State Taxes From Tournament Payouts. However, Non-Resident Winners Must Still Report Income To Their Home State If Their Home State Taxes Out-Of-State Income.',
      },
      {
        q: 'Is Real-Money Online Poker Legal In Nevada?',
        a: 'Yes. Players Physically Located Within Nevada State Borders Age 21+ Can Legally Play Regulated Real-Money Online Poker On WSOP Online, Sharing Player Pools With New Jersey, Michigan, And Pennsylvania.',
      },
    ],
  },
  {
    slug: 'texas',
    code: 'TX',
    name: 'Texas',
    title: 'Texas Poker Club Laws, Time Rake, 0% State Tax & Room Directory',
    h1: 'Texas Social Poker Clubs Guide: Membership Model, Time Rake & 0% Tax',
    legalStatus: 'Private Membership Social Card Clubs (Texas Penal Code Chapter 47)',
    minAge: '18+ Or 21+ (By Club Policy)',
    stateIncomeTaxRate: '0.0% (Zero State Income Tax)',
    approxLiveRooms: '65+ Private Social Poker Clubs & Kickapoo Tribal Casino',
    topCities: ['Houston', 'Dallas-Fort Worth', 'Austin', 'San Antonio'],
    rakeModel: '0% Pot Rake | Membership + Hourly Seat Access Fee ($10 - $14/Hr)',
    onlineRealMoneyStatus: 'Social & Club Arena / Sweepstakes Only (No State-Licensed Real-Money Operators)',
    summary:
      'Texas Hosts The Most Explosive Deep-Stack Cash Game Ecosystem In North America Through Private Social Poker Clubs In Houston, Dallas-Fort Worth, Austin, And San Antonio Operating With Zero Pot Rake And 0% State Income Tax.',
    regulatoryOverview:
      'Under Texas Penal Code Section 47.04 Safe-Harbor Provisions, Private Texas Card Clubs Operate As Membership Venues Where The House Takes Zero Percentage Rake From Any Pot, Charging Only Daily/Monthly Membership Dues And Hourly Seat Time.',
    taxWithholdingNotes:
      'Texas Has Zero State Income Tax. Because Zero Money Is Removed From Any Pot By The House, Players Retain 100% Of Contested Pots On The Felt While Paying Fixed Hourly Seat Time.',
    faqs: [
      {
        q: 'Why Do Texas Poker Rooms Charge Hourly Seat Time Instead Of Pot Rake?',
        a: 'Texas Law Prohibits Any Economic Benefit Other Than Personal Winnings From Being Taken Out Of A Gambling Pot. Charging A Flat Membership And Hourly Seat Access Fee With $0 Pot Drop Keeps 100% Of The Wagered Chips Among The Players.',
      },
      {
        q: 'Why Do Texas $1/$2 And $1/$3 Cash Games Play Like $2/$5 Or $5/$10 Elsewhere?',
        a: 'Most Texas Clubs Allow Match-The-Stack Or $500 To $1,000+ Buy-Ins At $1/$2 And $1/$3 Combined With Frequent Button Or Mississippi Straddles And Bomb Pots, Creating 200BB To 400BB Average Stacks.',
      },
    ],
  },
  {
    slug: 'florida',
    code: 'FL',
    name: 'Florida',
    title: 'Florida Poker Rooms, Pari-Mutuel & Tribal Laws, 0% State Tax Guide',
    h1: 'Florida Live Poker Guide: Seminole Hard Rock, Pari-Mutuel Rooms & 0% Tax',
    legalStatus: '100% Legal Tribal Casinos & Licensed Pari-Mutuel Cardrooms',
    minAge: '18+ At Pari-Mutuel Cardrooms | 21+ At Full Tribal Casinos',
    stateIncomeTaxRate: '0.0% (Zero State Income Tax)',
    approxLiveRooms: '29+ Licensed Pari-Mutuel & Seminole Tribal Poker Rooms',
    topCities: ['Hollywood / Miami', 'Tampa', 'Jacksonville', 'Orlando / Daytona', 'West Palm Beach'],
    rakeModel: '10% Up To $5 - $7 Cap + $2 High-Hand / Bad Beat Jackpot Drop',
    onlineRealMoneyStatus: 'Social & Club Play (No Regulated Real-Money Online Operator License)',
    summary:
      'Florida Is A Year-Round Live Poker Powerhouse Combining Flagship Seminole Hard Rock Casinos In Hollywood And Tampa With Nearly 30 Pari-Mutuel Cardrooms (Allowing 18+ Entry), High-Hand Promotions, And 0% State Income Tax.',
    regulatoryOverview:
      'Regulated By The Florida Gaming Control Commission (FGCC) For Pari-Mutuel Cardrooms And The Seminole Tribe Of Florida Compact. In 2017 Florida Eliminated Previous Buy-In Caps On Pari-Mutuel Cash Games, Unlocking Uncapped No-Limit Hold\'em And Pot-Limit Omaha Statewide.',
    taxWithholdingNotes:
      'Florida Levies 0% State Individual Income Tax, Making South Florida And Tampa Premier Tax-Free Bases For Professional Tournament And Cash Grinders.',
    faqs: [
      {
        q: 'Can You Play Live Poker At Age 18 In Florida?',
        a: 'Yes. Licensed Pari-Mutuel Cardrooms Across Florida (Such As Bestbet Jacksonville, Magic City, Ebro, And TGT Poker) Legally Admit Players Age 18 And Older, While Seminole Hard Rock Properties Require Age 21+.',
      },
      {
        q: 'How Do High-Hand Promotions Impact Florida Cash Game Strategy?',
        a: 'Most Florida Rooms Drop $2 Per Qualifying Pot To Fund Non-Stop $500 To $1,000 High-Hand Promotions Every 15 To 30 Minutes, Attracting Loose Multiway Recreational Traffic All Afternoon And Evening.',
      },
    ],
  },
  {
    slug: 'california',
    code: 'CA',
    name: 'California',
    title: 'California Card Rooms & Tribal Poker Guide: Drop Math, Laws & Taxes',
    h1: 'California Live Poker Guide: Commercial Cardrooms, Tribal Casinos & Flat Drop',
    legalStatus: '100% Legal Municipal Commercial Cardrooms & Sovereign Tribal Casinos',
    minAge: '21+ (18+ At Select Tribal Casinos Without Alcohol On Floor)',
    stateIncomeTaxRate: '1.0% To 13.3% Progressive State Income Tax',
    approxLiveRooms: '85+ Active Municipal Cardrooms & Tribal Casino Poker Rooms',
    topCities: ['Los Angeles (Commerce / Bell Gardens / Gardena)', 'San Jose', 'San Diego', 'Sacramento'],
    rakeModel: 'Flat $6 - $7 Per-Flop Collection Drop (Zero Percentage Calculation)',
    onlineRealMoneyStatus: 'Social & Club Play Only (No State Real-Money iPoker Legislation)',
    summary:
      'California Boasts More Brick-And-Mortar Poker Tables Than Any Other Jurisdiction On Earth, Led By Mega-Clubs In Los Angeles (Commerce, The Bike, Hustler, Gardens) And San Jose (Bay 101, Matrix) Operating Under A Unique Flat Per-Hand Collection Drop.',
    regulatoryOverview:
      'Commercial Cardrooms Are Licensed By The California Gambling Control Commission (CGCC) And Bureau Of Gambling Control. Because State Law Prohibits Percentage Rake, California Rooms Collect A Fixed Dollar Drop Once A Flop Is Dealt.',
    taxWithholdingNotes:
      'California Taxes Gambling And Tournament Income At Progressive State Rates Up To 13.3% And May Withhold 7% State Backup Tax On Major Tournament W-2G Payouts.',
    faqs: [
      {
        q: 'Why Do California $1/$2 And $2/$3 Cash Games Have Such Small Max Buy-Ins?',
        a: 'Because California Cardrooms Charge A Flat $6 To $7 Drop As Soon As The Flop Is Dealt Regardless Of Pot Size, $1/$2 And $2/$3 Games With $100 To $200 Buy-Ins Lose Up To 3.5BB Per Flop. Moving Up To $5/$5 ($500-$600 Cap) Immediately Cuts The Flat Drop Impact In Half.',
      },
      {
        q: 'What Are The Largest Poker Rooms In California?',
        a: 'Commerce Casino (150+ Tables), The Bicycle Casino (120+ Tables), The Gardens Casino (100+ Tables), Hustler Casino, Bay 101, Matrix Casino, And Graton Resort Lead The State.',
      },
    ],
  },
  {
    slug: 'pennsylvania',
    code: 'PA',
    name: 'Pennsylvania',
    title: 'Pennsylvania Live & Online Poker Guide: Parx, Rivers, Laws & Tax Rate',
    h1: 'Pennsylvania Poker Guide: Commercial Casinos, Legal Online Poker & 3.07% Tax',
    legalStatus: '100% Legal Commercial Casinos & Regulated Online Real-Money Poker',
    minAge: '21+',
    stateIncomeTaxRate: '3.07% Flat State Income Tax',
    approxLiveRooms: '11 Active Casino Poker Rooms',
    topCities: ['Bensalem / Philadelphia', 'Pittsburgh', 'Bethlehem', 'Chester', 'Mount Airy'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Bad Beat / High-Hand Drop',
    onlineRealMoneyStatus: '100% Legal & Regulated (WSOP PA, PokerStars PA, BetMGM PA, Borgata PA)',
    summary:
      'Pennsylvania Combines Elite East Coast Live Poker Rooms (Led By Parx Casino, Rivers Philadelphia, Rivers Pittsburgh, And Wind Creek Bethlehem) With Regulated Real-Money Online Poker And A Low 3.07% Flat State Income Tax.',
    regulatoryOverview:
      'Regulated By The Pennsylvania Gaming Control Board (PGCB). Pennsylvania Offers Full Regulated Online Poker And Joined The Multi-State Shared Liquidity Compact (MSIGA) To Pool Online Players Across State Lines.',
    taxWithholdingNotes:
      'Pennsylvania Levies A Flat 3.07% State Income Tax On Net Gambling And Tournament Income And Automatically Withholds 3.07% On Qualifying W-2G Tournament Payouts.',
    faqs: [
      {
        q: 'Which Pennsylvania Poker Room Has The Biggest Cash Games And Tournaments?',
        a: 'Parx Casino In Bensalem (Just North Of Philadelphia) Operates A Dedicated 48-Table Poker Room Famous For Its Big Stax Tournament Series And Deep $2/$5, $10/$10, And Pot-Limit Omaha Cash Games.',
      },
      {
        q: 'Can I Play Legal Real-Money Online Poker In Pennsylvania?',
        a: 'Yes. Any Player Age 21+ Physically Inside Pennsylvania Can Legally Play On PGCB-Licensed Real-Money Sites Including WSOP.com, PokerStars, BetMGM Poker, And Borgata Poker.',
      },
    ],
  },
  {
    slug: 'new-jersey',
    code: 'NJ',
    name: 'New Jersey',
    title: 'New Jersey Live & Online Poker Guide: Borgata, Atlantic City & Laws',
    h1: 'New Jersey Poker Guide: Atlantic City Casinos, Online Poker & Tax Rules',
    legalStatus: '100% Legal Atlantic City Casinos & Regulated Multi-State Online Poker',
    minAge: '21+',
    stateIncomeTaxRate: '1.4% To 10.75% Progressive State Income Tax',
    approxLiveRooms: '3 Major Atlantic City Casino Poker Rooms (Borgata, Harrah\'s, Tropicana)',
    topCities: ['Atlantic City'],
    rakeModel: '10% Pot Rake Up To $5 Cap + $2 Promo Drop',
    onlineRealMoneyStatus: '100% Legal & Regulated (WSOP, PokerStars, BetMGM, Borgata Shared Liquidity)',
    summary:
      'Anchored By The 52-Table Borgata Poker Room In Atlantic City And Full Multi-State Regulated Online Poker Under The Division Of Gaming Enforcement, New Jersey Serves As The Hub Of Northeast Regulated Poker.',
    regulatoryOverview:
      'Supervised By The New Jersey Division Of Gaming Enforcement (DGE). New Jersey Was A Pioneer Of US Regulated Online Poker In 2013 And Shares Multi-State Liquidity With Nevada, Michigan, And Pennsylvania.',
    taxWithholdingNotes:
      'New Jersey Taxes Gambling Winnings Under Its Progressive State Income Tax (Withholding 3% On W-2G Payouts Exceeding $10,000, While Allowing Itemized Gambling Loss Offsets Against Winnings On NJ Returns).',
    faqs: [
      {
        q: 'Which Atlantic City Casinos Currently Have Live Poker Rooms?',
        a: 'Borgata Hotel Casino & Spa Leads Atlantic City With 52+ Tables And Year-Round Tournament Series, Joined By Harrah\'s Resort Atlantic City And Tropicana Atlantic City.',
      },
      {
        q: 'Does New Jersey Allow Deducting Gambling Losses On State Taxes?',
        a: 'Yes. New Jersey Permits Taxpayers To Net Gambling Losses Against Gambling Winnings Directly On The NJ-1040 Return So Only Net Annual Gambling Income Is Taxed.',
      },
    ],
  },
  {
    slug: 'michigan',
    code: 'MI',
    name: 'Michigan',
    title: 'Michigan Live & Online Poker Guide: Detroit Casinos, Charity Rooms & Tax',
    h1: 'Michigan Poker Guide: Detroit Casinos, Charity Cardrooms & Legal Online Poker',
    legalStatus: '100% Legal Detroit Commercial Casinos, Tribal Rooms & Regulated Online Poker',
    minAge: '21+ At Commercial Casinos & Online (18+ At Select Tribal Properties)',
    stateIncomeTaxRate: '4.25% Flat State Income Tax',
    approxLiveRooms: '12+ Commercial, Tribal & Licensed Charity Poker Rooms',
    topCities: ['Detroit', 'Mount Pleasant', 'New Buffalo', 'Grand Rapids / Lansing'],
    rakeModel: '10% Pot Rake Up To $6 - $7 Cap + $1 - $2 Jackpot Drop',
    onlineRealMoneyStatus: '100% Legal & Regulated (MSIGA Multi-State WSOP, PokerStars & BetMGM)',
    summary:
      'Michigan Offers A Complete Three-Tier Poker Ecosystem: Major Commercial Poker Rooms In Downtown Detroit (MGM Grand And MotorCity), Statewide Tribal And Charity Cardrooms, And Full Multi-State Regulated Online Poker.',
    regulatoryOverview:
      'Regulated By The Michigan Gaming Control Board (MGCB). Michigan Joined The Multi-State Internet Gaming Agreement (MSIGA) In 2022, Merging Its Online Player Pools With New Jersey, Nevada, And Pennsylvania.',
    taxWithholdingNotes:
      'Michigan Applies A 4.25% Flat State Income Tax (Plus Local City Tax For Detroit Residents). Importantly, Michigan\'s Adjusted Gross Income Rules Historically Restrict Itemized Gambling Loss Deductions On State Returns, So Consult A CPA On Session Netting.',
    faqs: [
      {
        q: 'Which Detroit Casinos Have Live Poker Rooms?',
        a: 'MGM Grand Detroit And MotorCity Casino Operate Bustling 24/7 Live Poker Rooms Spread Across $1/$3 NLH, $2/$5 NLH, And Deep-Stack $2/$5 And $5/$5 Pot-Limit Omaha.',
      },
      {
        q: 'Can Michigan Online Poker Players Compete Against Players In Other States?',
        a: 'Yes. Through The MSIGA Compact, Michigan Players On WSOP Online, PokerStars, And BetMGM Compete In Combined Cash And Tournament Pools With Players In New Jersey, Nevada, And Pennsylvania.',
      },
    ],
  },
  {
    slug: 'maryland',
    code: 'MD',
    name: 'Maryland',
    title: 'Maryland Live Poker Guide: MGM National Harbor, Maryland Live! & Laws',
    h1: 'Maryland Live Poker Rooms Guide: MGM National Harbor, Live! Casino & Taxes',
    legalStatus: '100% Legal Commercial Casino Poker Rooms',
    minAge: '21+',
    stateIncomeTaxRate: '2.0% To 5.75% State Income Tax (+ County Local Tax)',
    approxLiveRooms: '3 Premier Commercial Casino Poker Rooms',
    topCities: ['Oxon Hill (National Harbor / DC Metro)', 'Hanover (BWI / Baltimore)', 'Baltimore Inner Harbor'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play (No Regulated Real-Money Online Poker Yet)',
    summary:
      'Serving The Affluent Washington D.C. And Baltimore Corridor, Maryland Hosts Two Of The Ten Largest Poker Rooms On The East Coast: Maryland Live! Casino (52 Tables) And MGM National Harbor (46 Tables), Plus Horseshoe Baltimore.',
    regulatoryOverview:
      'Regulated By The Maryland Lottery And Gaming Control Agency (MLGCA). Maryland Casinos Operate 24/7 With Uncapped High-Stakes Cash Games And Major WPT And WSOP Circuit Stops.',
    taxWithholdingNotes:
      'Maryland Requires State Tax Withholding On W-2G Tournament Payouts Exceeding $5,000 (Approximately 8.75% For Maryland Residents Including Local County Tax, Or 7.0% For Non-Residents).',
    faqs: [
      {
        q: 'Which Poker Room Is Closer To Washington D.C.: MGM National Harbor Or Maryland Live?',
        a: 'MGM National Harbor Sits Directly Across The Potomac River From Alexandria, Virginia And Downtown Washington D.C. (15 Minutes From Capitol Hill), While Live! Casino & Hotel Maryland Sits Near BWI Airport Between D.C. And Baltimore.',
      },
      {
        q: 'Why Is Pot-Limit Omaha So Popular In Maryland Poker Rooms?',
        a: 'Both MGM National Harbor And Maryland Live! Spread Around-The-Clock $2/$2, $5/$5, And $10/$25 Pot-Limit Omaha Cash Games Drawn From The D.C./Baltimore Business Community.',
      },
    ],
  },
  {
    slug: 'arizona',
    code: 'AZ',
    name: 'Arizona',
    title: 'Arizona Live Poker Guide: Talking Stick, Phoenix Tribal Rooms & Laws',
    h1: 'Arizona Live Poker Guide: Scottsdale & Phoenix Tribal Poker Rooms & Taxes',
    legalStatus: '100% Legal Tribal Casino Poker Rooms (2021 Amended Gaming Compact)',
    minAge: '21+',
    stateIncomeTaxRate: '2.5% Flat State Income Tax',
    approxLiveRooms: '8 Active Tribal Casino Poker Rooms',
    topCities: ['Scottsdale / Phoenix', 'Chandler', 'Glendale', 'Tucson'],
    rakeModel: '10% Pot Rake Up To $5 Cap + $2 Jackpot/High-Hand Drop',
    onlineRealMoneyStatus: 'Social & Club Play (Regulated Mobile Sportsbooks Only; No Online Poker)',
    summary:
      'Anchored By The 47-Table Arena Poker Room At Talking Stick Resort In Scottsdale Alongside Lone Butte, Desert Diamond West Valley, And Del Sol In Tucson, Arizona Offers Year-Round No-Limit And PLO Action With A Low 2.5% Flat State Tax.',
    regulatoryOverview:
      'Governed By The Arizona Department Of Gaming And Tribal-State Gaming Compacts. Following Modernized Compact Amendments, Arizona Tribal Rooms Spread Full No-Limit Hold\'em, Pot-Limit Omaha, And Major Championship Series Like The Arizona State Poker Championship.',
    taxWithholdingNotes:
      'Arizona Levies A Flat 2.5% State Income Tax Rate (Reduced From Previous Progressive Brackets), Making Phoenix And Scottsdale Highly Attractive For Winter And Year-Round Grinders.',
    faqs: [
      {
        q: 'What Is The Biggest Poker Tournament In Arizona?',
        a: 'The Annual Arizona State Poker Championship Hosted Every August At Talking Stick Resort In Scottsdale Regularly Draws 1,500+ Entrants And Builds A $1.5 Million+ Prize Pool.',
      },
      {
        q: 'Are Spread-Limit Rules Gone In Arizona Poker Rooms?',
        a: 'Modernized Arizona Tribal Gaming Compacts Authorized True No-Limit Hold\'em And Pot-Limit Omaha Alongside Deep-Stack Cash Buy-Ins Across Phoenix And Tucson.',
      },
    ],
  },
  {
    slug: 'colorado',
    code: 'CO',
    name: 'Colorado',
    title: 'Colorado Live Poker Guide: Black Hawk Uncapped Stakes, Laws & Tax Rate',
    h1: 'Colorado Live Poker Guide: Black Hawk Casinos, Uncapped Stakes & 4.4% Tax',
    legalStatus: '100% Legal Commercial Casino Poker In Black Hawk, Central City & Cripple Creek',
    minAge: '21+',
    stateIncomeTaxRate: '4.40% Flat State Income Tax',
    approxLiveRooms: '5 Major Mountain Casino Poker Rooms',
    topCities: ['Black Hawk (Denver Metro)', 'Cripple Creek'],
    rakeModel: '10% Pot Rake Up To $6 Cap + $2 Bad Beat Jackpot Drop',
    onlineRealMoneyStatus: 'Social & Club Play (Online Sports Betting Legal; No Regulated Online Poker)',
    summary:
      'After Colorado Voters Approved Amendment 77 Eliminating The Historic $100 Single-Bet Limit, Black Hawk (35 Minutes West Of Denver) Transformed Into A Major Mountain West Poker Hub Led By Monarch Casino And Ameristar Black Hawk.',
    regulatoryOverview:
      'Regulated By The Colorado Division Of Gaming. Amendment 77 Allowed Black Hawk City Council To Remove The Old $100 Bet Cap, Enabling True Uncapped No-Limit Hold\'em, $2/$5 And $5/$10 Cash Games, And WSOP Circuit And MSPT Stops.',
    taxWithholdingNotes:
      'Colorado Applies A Flat 4.40% State Income Tax Rate And Withholds 4.0% State Tax On Qualifying W-2G Tournament Payouts Exceeding $5,000.',
    faqs: [
      {
        q: 'Does Colorado Still Have A $100 Maximum Bet Limit In Poker?',
        a: 'No. In May 2021, Colorado Implemented Amendment 77, Permanently Abolishing The Old $100 Maximum Bet Rule In Black Hawk And Unlocking True No-Limit Hold\'em And Pot-Limit Omaha.',
      },
      {
        q: 'Which Black Hawk Casinos Have The Best Poker Rooms?',
        a: 'Monarch Casino Resort Spa Black Hawk (14 Tables) And Bally\'s / Ameristar Black Hawk Lead The Market With Non-Stop $1/$3, $2/$5, PLO, And Major Mid-States Poker Tour (MSPT) And WSOP Circuit Festivals.',
      },
    ],
  },
  {
    slug: 'illinois',
    code: 'IL',
    name: 'Illinois',
    title: 'Illinois Live Poker Guide: Rivers Des Plaines, Grand Victoria & Laws',
    h1: 'Illinois Live Poker Guide: Chicagoland Casinos, Charity Events & Tax Rules',
    legalStatus: '100% Legal Commercial Casino Poker Rooms & Charitable Games Act Events',
    minAge: '21+',
    stateIncomeTaxRate: '4.95% Flat State Income Tax',
    approxLiveRooms: '7+ Commercial Casino Poker Rooms + Rockford Charitable Rooms',
    topCities: ['Des Plaines / Rosemont (Chicago O\'Hare)', 'Elgin', 'Aurora', 'Rockford', 'East St. Louis'],
    rakeModel: '10% Pot Rake Up To $6 Cap + $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play (Online Poker Legislation Pending In General Assembly)',
    summary:
      'Serving The 9.5-Million-Resident Chicagoland Market, Illinois Features High-Demand Live Poker Rooms Led By Rivers Casino Des Plaines (22 Tables Near O\'Hare), Grand Victoria Casino In Elgin, And Hard Rock Rockford.',
    regulatoryOverview:
      'Regulated By The Illinois Gaming Board (IGB). Because Table Supply In Chicagoland Is Tight Relative To Population, Cash Games At $1/$3, $2/$5, And $5/$5 PLO Run Deep With Long Waitlists On Weekends.',
    taxWithholdingNotes:
      'Illinois Levies A Flat 4.95% State Income Tax. Note That Illinois Does Not Allow Deducting Gambling Losses Against Winnings On The Illinois State Return (Schedule M), Making Accurate Session Accounting Essential.',
    faqs: [
      {
        q: 'Where Can You Play Live Casino Poker Near Downtown Chicago?',
        a: 'Rivers Casino Des Plaines (Immediately Adjacent To O\'Hare Airport, 20 Minutes From Downtown Chicago) And Grand Victoria Casino In Elgin Host The Largest Poker Rooms In Northern Illinois, Alongside Horseshoe Hammond Just Across The Indiana Border.',
      },
      {
        q: 'How Do I Avoid Waiting Two Hours For A Seat At Rivers Des Plaines?',
        a: 'Check In Ahead Of Time Using The PokerAtlas Or Bravo Mobile Waitlist App Before Driving To The Casino, Especially On Friday And Saturday Evenings.',
      },
    ],
  },
  {
    slug: 'louisiana',
    code: 'LA',
    name: 'Louisiana',
    title: 'Louisiana Live Poker Guide: Caesars New Orleans, Lake Charles & Laws',
    h1: 'Louisiana Live Poker Guide: New Orleans, Shreveport, Lake Charles & Taxes',
    legalStatus: '100% Legal Land-Based, Riverboat & Tribal Casino Poker Rooms',
    minAge: '21+',
    stateIncomeTaxRate: '1.85% To 4.25% State Income Tax',
    approxLiveRooms: '8 Active Casino Poker Rooms',
    topCities: ['New Orleans', 'Lake Charles', 'Shreveport / Bossier City', 'Baton Rouge'],
    rakeModel: '10% Pot Rake Up To $6 Cap + $1 - $2 Jackpot Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Louisiana Bridges Gulf Coast And Texas Traffic With Major Poker Destinations Including The 20-Table Room At Caesars New Orleans, Golden Nugget And L\'Auberge In Lake Charles, And Horseshoe Bossier City.',
    regulatoryOverview:
      'Regulated By The Louisiana Gaming Control Board (LGCB). Caesars New Orleans Hosts Annual WSOP Circuit Stops Steps From The French Quarter, While Lake Charles Draws Heavy Weekend High-Stakes Action From East Texas.',
    taxWithholdingNotes:
      'Louisiana Applies State Income Tax Rates Up To 4.25% And Requires State Backup Withholding On Qualifying W-2G Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'Which Lake Charles Casinos Have Live Poker Rooms?',
        a: 'Both Golden Nugget Lake Charles And L\'Auberge Casino Resort Lake Charles Operate Active Poker Rooms Spreading $1/$3 NLH, $2/$5 NLH, And Deep-Stack Pot-Limit Omaha.',
      },
      {
        q: 'Where Is The Main Poker Room In New Orleans?',
        a: 'Caesars New Orleans (Formerly Harrah\'s New Orleans) Operates A 20-Table Poker Room At The Foot Of Canal Street Next To The French Quarter.',
      },
    ],
  },
  {
    slug: 'mississippi',
    code: 'MS',
    name: 'Mississippi',
    title: 'Mississippi Live Poker Guide: Beau Rivage Biloxi, Tunica & Straddle Rules',
    h1: 'Mississippi Live Poker Guide: Biloxi, Tunica, Mississippi Straddles & Taxes',
    legalStatus: '100% Legal Gulf Coast & Mississippi River Commercial Casino Poker Rooms',
    minAge: '21+',
    stateIncomeTaxRate: '4.70% Flat State Income Tax (Over $10,000)',
    approxLiveRooms: '7 Active Casino Poker Rooms',
    topCities: ['Biloxi (Gulf Coast)', 'Tunica (Memphis Metro)', 'Vicksburg'],
    rakeModel: '10% Pot Rake Up To $6 Cap + $1 - $2 Jackpot Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Birthplace Of The Famous "Mississippi Straddle" (Allowing Live Straddles From Any Seat, Especially The Button), Mississippi Features Iconic Southern Poker Venues Led By Beau Rivage In Biloxi And Horseshoe Tunica.',
    regulatoryOverview:
      'Regulated By The Mississippi Gaming Commission (MGC). Mississippi Cardrooms Are Famous For Loose Action Rules, Allowing Button Straddles And Multi-Street Pot-Limit Omaha Games.',
    taxWithholdingNotes:
      'Mississippi Levies A Non-Refundable 3.0% State Gambling Withholding Tax On W-2G Casino Tournament Payouts At The Cage.',
    faqs: [
      {
        q: 'What Is A Mississippi Straddle In Live Poker?',
        a: 'Originated In Tunica And Biloxi Cardrooms, A Mississippi Straddle Allows A Player (Most Commonly On The Dealer Button) To Post A Live 2x Blind Before Cards Are Dealt, Giving That Seat Ultimate Positional And Pre-Flop Closing Action.',
      },
      {
        q: 'What Are The Biggest Poker Series In Mississippi?',
        a: 'The Beau Rivage Million Dollar Heater Every January In Biloxi And The WSOP Circuit Stops At Horseshoe Tunica Draw Thousands Of Players Across The Southeast.',
      },
    ],
  },
  {
    slug: 'new-york',
    code: 'NY',
    name: 'New York',
    title: 'New York Live Poker Guide: Turning Stone, Rivers Schenectady & Upstate Rooms',
    h1: 'New York Live Poker Rooms Guide: Turning Stone, Upstate Casinos & Taxes',
    legalStatus: '100% Legal Upstate Commercial & Tribal Casino Poker Rooms',
    minAge: '18+ At Turning Stone Tribal Room | 21+ At Commercial Casinos',
    stateIncomeTaxRate: '4.0% To 10.9% Progressive State Income Tax (+ NYC Local Tax)',
    approxLiveRooms: '6 Active Commercial & Tribal Casino Poker Rooms',
    topCities: ['Verona (Syracuse / Turning Stone)', 'Schenectady (Albany)', 'Monticello (Catskills)', 'Waterloo / Nichols'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Bad Beat Drop',
    onlineRealMoneyStatus: 'Social & Club Play (Online Poker Bills Introduced Regularly In Albany)',
    summary:
      'New York Features Thriving Upstate And Tribal Poker Rooms Led By The 32-Table Turning Stone Resort Casino In Verona (Which Admits Players 18+), Rivers Casino Schenectady, And Resorts World Catskills.',
    regulatoryOverview:
      'Commercial Casinos Are Supervised By The New York State Gaming Commission (NYSGC), While Turning Stone Operates Under The Oneida Indian Nation Compact (Allowing 18+ Entry Because Alcohol Is Not Served On The Gaming Floor).',
    taxWithholdingNotes:
      'New York State Income Tax Ranges From 4.0% To 10.9% (Plus Up To 3.876% For New York City Residents), With Automatic State Withholding On W-2G Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'Why Can You Play Poker At Age 18 At Turning Stone Resort In New York?',
        a: 'Turning Stone Resort Casino In Verona Is Operated By The Oneida Indian Nation And Permits Players Age 18 And Older In Its 32-Table Poker Room, Hosting Major WSOP Circuit And Empire State Hold\'em Series.',
      },
      {
        q: 'Which Legal Poker Rooms Are Closest To New York City?',
        a: 'Resorts World Catskills In Monticello (Roughly 90 Minutes Northwest Of Manhattan) Within New York State, Alongside Parx (PA), Wind Creek Bethlehem (PA), And Borgata (NJ) Across Neighboring State Lines.',
      },
    ],
  },
  {
    slug: 'ohio',
    code: 'OH',
    name: 'Ohio',
    title: 'Ohio Live Poker Guide: Jack Cleveland, Hard Rock Cincinnati, Shark Tank & Laws',
    h1: 'Ohio Live Poker Rooms Guide: Commercial Casinos, Social Card Clubs & Taxes',
    legalStatus: '100% Legal Commercial Casinos & Licensed Social Poker Clubs',
    minAge: '21+ At Casinos | 18+ Or 21+ At Social Clubs',
    stateIncomeTaxRate: '2.75% To 3.50% State Income Tax',
    approxLiveRooms: '10+ Commercial Casinos & Social Poker Clubs',
    topCities: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo'],
    rakeModel: '10% Up To $6 Cap At Casinos | Hourly Seat/Membership Model At Social Clubs',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Ohio Combines Four Major Urban Commercial Casino Poker Rooms (Hollywood Columbus, Jack Cleveland, Hard Rock Cincinnati, And Hollywood Toledo) With Prominent Membership Card Clubs Like The Shark Tank And River Room.',
    regulatoryOverview:
      'Commercial Casinos Are Regulated By The Ohio Casino Control Commission (OCCC), While Private Membership Social Clubs Operate Under Zero-Pot-Rake Club Rules In Columbus, Akron, And Dayton.',
    taxWithholdingNotes:
      'Ohio Levies A Low Top State Income Tax Rate Of 3.50% And Withholds 4.0% State Tax On W-2G Casino Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'How Does Ohio Have Both Commercial Casino Poker Rooms And Texas-Style Social Clubs?',
        a: 'Ohio\'s Four Constitutional Commercial Casinos In Cleveland, Columbus, Cincinnati, And Toledo Spread Standard Pot-Raked Games, While Private Membership Clubs Like The Shark Tank In Columbus Operate With Zero Pot Rake Under Social Club Membership Rules.',
      },
      {
        q: 'Which Ohio Poker Room Spreads The Biggest Tournament Series?',
        a: 'Hollywood Casino Columbus (34 Tables), Hard Rock Casino Cincinnati (31 Tables), And Jack Cleveland Casino Regularly Host Major Regional Deepstack And WSOP/WPT Satellite Series.',
      },
    ],
  },
];
