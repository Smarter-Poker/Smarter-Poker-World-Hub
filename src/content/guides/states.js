/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ALL 50 US STATES & DC POKER LEGALITY, TAX & ROOM DIRECTORY HUB
 *  (src/content/guides/states.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /poker-rooms/states and /poker-rooms/states/[state].
 * Covers all 50 US states plus Washington, D.C. (51 jurisdictions) with legal age,
 * state income tax rates, W-2G withholding rules, active live cardroom landscape,
 * rake models, and regulated online real-money poker status.
 *
 * House style: Title Case, zero em dashes.
 */

export const STATES_AS_OF = '2026-11-26';
export const STATES_BASE_PATH = '/poker-rooms/states';
export const STATES_URL = 'https://smarter.poker/poker-rooms/states';

export function stateGuidePath(slug) {
  return `/poker-rooms/states/${slug}`;
}

const STATE_SLUG_ALIASES = {
  al: 'alabama',
  ak: 'alaska',
  az: 'arizona',
  ar: 'arkansas',
  ca: 'california',
  calif: 'california',
  co: 'colorado',
  ct: 'connecticut',
  de: 'delaware',
  dc: 'district-of-columbia',
  'washington-dc': 'district-of-columbia',
  fl: 'florida',
  ga: 'georgia',
  hi: 'hawaii',
  id: 'idaho',
  il: 'illinois',
  in: 'indiana',
  ia: 'iowa',
  ks: 'kansas',
  ky: 'kentucky',
  la: 'louisiana',
  me: 'maine',
  md: 'maryland',
  ma: 'massachusetts',
  mi: 'michigan',
  mn: 'minnesota',
  ms: 'mississippi',
  mo: 'missouri',
  mt: 'montana',
  ne: 'nebraska',
  nv: 'nevada',
  nh: 'new-hampshire',
  newhampshire: 'new-hampshire',
  nj: 'new-jersey',
  newjersey: 'new-jersey',
  nm: 'new-mexico',
  newmexico: 'new-mexico',
  ny: 'new-york',
  newyork: 'new-york',
  nc: 'north-carolina',
  northcarolina: 'north-carolina',
  nd: 'north-dakota',
  northdakota: 'north-dakota',
  oh: 'ohio',
  ok: 'oklahoma',
  or: 'oregon',
  pa: 'pennsylvania',
  ri: 'rhode-island',
  rhodeisland: 'rhode-island',
  sc: 'south-carolina',
  southcarolina: 'south-carolina',
  sd: 'south-dakota',
  southdakota: 'south-dakota',
  tn: 'tennessee',
  tx: 'texas',
  ut: 'utah',
  vt: 'vermont',
  va: 'virginia',
  wa: 'washington',
  wv: 'west-virginia',
  westvirginia: 'west-virginia',
  wi: 'wisconsin',
  wy: 'wyoming',
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
  {
    slug: 'oklahoma',
    code: 'OK',
    name: 'Oklahoma',
    title: 'Oklahoma Poker Laws, Tribal Rooms, Choctaw, WinStar & Taxes (2026)',
    h1: 'Oklahoma Live Poker Rooms Guide: Choctaw, WinStar, Hard Rock Tulsa & Taxes',
    legalStatus: '100% Legal Tribal Casino Poker Rooms Statewide',
    minAge: '18+ At Most Tribal Casinos (21+ At Select Venues)',
    stateIncomeTaxRate: 'Up To 4.75% State Income Tax',
    topCities: ['Durant (Choctaw)', 'Thackerville (WinStar)', 'Tulsa', 'Oklahoma City'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Oklahoma Hosts Some Of The Highest-Volume Tribal Poker Rooms In The Country Including WinStar World Casino (55+ Tables), Choctaw Durant (WSOP Circuit & WPT Host), And Hard Rock Tulsa, Many Admitting Players Age 18+.',
    regulatoryOverview:
      'Live Poker Operates Under Class III Tribal-State Gaming Compacts Supervised By Sovereign Tribal Gaming Commissions And The Oklahoma Office Of Management And Enterprise Services.',
    taxWithholdingNotes:
      'Oklahoma Taxes Gambling Winnings Up To 4.75% Top Marginal Rate And Applies 4.75% State Withholding On Federal W-2G Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'Can You Play Live Poker At Age 18 In Oklahoma?',
        a: 'Yes. Many Major Oklahoma Tribal Casino Poker Rooms Including WinStar World Casino And Choctaw Casino & Resort Durant Admit Players Age 18 And Older.',
      },
      {
        q: 'Which Oklahoma Poker Rooms Host WSOP Circuit And WPT Series?',
        a: 'Choctaw Casino & Resort In Durant Hosts Multiple Annual WSOP Circuit And WPT Championship Stops, While Hard Rock Hotel & Casino Tulsa Hosts Major RunGood Poker Series (RGPS) Events.',
      },
    ],
  },
  {
    slug: 'washington',
    code: 'WA',
    name: 'Washington',
    title: 'Washington State Poker Laws, 0% Tax, Cardrooms & Tribal Rooms (2026)',
    h1: 'Washington Live Poker Guide: 0% State Tax, Commercial Cardrooms & Tribal Casinos',
    legalStatus: '100% Legal Commercial Cardrooms & Tribal Casino Poker Rooms',
    minAge: '18+ At Commercial Cardrooms & Select Tribal Rooms (21+ Where Alcohol Is Served)',
    stateIncomeTaxRate: '0.0% (Zero State Income Tax)',
    topCities: ['Seattle Metro (Tukwila, Shoreline)', 'Tacoma', 'Spokane', 'Ridgefield'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Jackpot Drop (Spread-Limit Caps Up To $300-$500)',
    onlineRealMoneyStatus: 'Strictly Prohibited Under RCW 9.46.240 (Free Social Play Only)',
    summary:
      'Washington Offers Over 25 Live Poker Rooms Including Fortune Poker, Muckleshoot, Tulalip, And Ilani With 0% State Income Tax, While Enforcing Strict Spread-Limit Betting Caps And Prohibiting Real-Money Online Poker.',
    regulatoryOverview:
      'Regulated By The Washington State Gambling Commission (WSGC) Under RCW 9.46. Commercial House-Banked Cardrooms And Tribal Casinos Operate Spread-Limit Cash Games (Typically $300-$500 Max Bet Per Street) And No-Limit Tournaments.',
    taxWithholdingNotes:
      'Washington Levies Zero State Personal Income Tax On Poker Winnings. Federal IRS Form W-2G Still Applies To Net Tournament Payouts Exceeding $5,000.',
    faqs: [
      {
        q: 'Why Do Washington Cash Games Use Spread-Limit Betting Caps?',
        a: 'Washington State Gambling Commission Rules Cap Maximum Single Bets In Commercial Cardrooms (Typically $300 To $500 Spread-Limit), Allowing Deep Action While Complying With State Wagering Limit Statutes.',
      },
      {
        q: 'Does Washington Tax Poker Winnings?',
        a: 'No. Washington Has A 0% State Individual Income Tax Rate, So Live Cash And Tournament Winnings Incur Zero State Income Tax.',
      },
    ],
  },
  {
    slug: 'minnesota',
    code: 'MN',
    name: 'Minnesota',
    title: 'Minnesota Poker Laws: Canterbury Park, Running Aces & Spread-Limit Guide',
    h1: 'Minnesota Live Poker Rooms Guide: Canterbury Park, Running Aces & Taxes',
    legalStatus: '100% Legal Pari-Mutuel Racetrack Cardrooms & Tribal Poker Rooms',
    minAge: '18+ Statewide',
    stateIncomeTaxRate: '5.35% To 9.85% State Income Tax',
    topCities: ['Shakopee (Twin Cities)', 'Columbus (Twin Cities)', 'Hinckley', 'Mahnomen'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop ($100 Max Bet Spread-Limit Cash)',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Minnesota Is A Midwest Poker Hub Anchored By Canterbury Park (30+ Tables, MSPT Host) And Running Aces Casino In The Twin Cities, Both Admitting Players Age 18+ Under State Spread-Limit Cash Rules.',
    regulatoryOverview:
      'Pari-Mutuel Card Clubs At Canterbury Park And Running Aces Are Regulated By The Minnesota Racing Commission With A Statutory $100 Max Bet Spread-Limit On Cash Games And Full No-Limit Tournament Structures.',
    taxWithholdingNotes:
      'Minnesota Taxes Gambling Winnings Between 5.35% And 9.85% And Withholds 7.25% State Tax On W-2G Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'What Is The Legal Age To Play Poker At Canterbury Park And Running Aces?',
        a: 'Players Age 18 And Older Can Legally Play Cash Games And Tournaments At Canterbury Park, Running Aces, And Minnesota Tribal Poker Rooms.',
      },
      {
        q: 'Why Are Minnesota Cash Games $2-$100 Spread-Limit Instead Of No-Limit?',
        a: 'Minnesota Statute 240.30 Caps Maximum Cash-Game Wagers At $100 Per Bet In Racetrack Cardrooms, While Allowing Unlimited No-Limit Action In Multi-Table Tournaments Such As The MSPT.',
      },
    ],
  },
  {
    slug: 'oregon',
    code: 'OR',
    name: 'Oregon',
    title: 'Oregon Poker Club Laws, Zero-Rake Portland Clubs & Tribal Rooms (2026)',
    h1: 'Oregon Live Poker Guide: Portland Social Clubs, Door-Fee Model & Tribal Casinos',
    legalStatus: '100% Legal Municipal Social Poker Clubs & Tribal Casino Poker Rooms',
    minAge: '21+ At Social Clubs & Most Tribal Rooms (18+ At Select Tribal Venues)',
    stateIncomeTaxRate: '4.75% To 9.9% State Income Tax',
    topCities: ['Portland', 'Eugene', 'Bend', 'Pendleton', 'Lincoln City'],
    rakeModel: 'Flat $15 - $25 Daily Door Fee (0% Pot Rake) At Portland Clubs | Standard Pot Rake At Tribal Rooms',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Oregon Features One Of America\'s Most Player-Friendly Live Poker Models: Licensed Portland Social Clubs (Final Table, Portland Meadows, The Game) Charge A Flat Daily Door Fee With Zero Pot Rake.',
    regulatoryOverview:
      'Under ORS 167.117 And City Of Portland Social Gaming Permits, Licensed Clubs Operate With Zero House Rake Using Flat Door Fees And Player-Dealt Or Tipped Volunteer Dealers, Alongside Regulated Tribal Casinos Like Spirit Mountain And Chinook Winds.',
    taxWithholdingNotes:
      'Oregon Levies State Income Tax Up To 9.9% And Withholds 8.0% State Tax On Qualifying W-2G Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'Why Do Portland Poker Clubs Charge Zero Pot Rake?',
        a: 'Oregon Social Gaming Law Prohibits Houses From Taking A Cut Of The Pot. Portland Clubs Instead Charge A Flat $15 To $25 Daily Membership/Door Fee, Making Cash Games Extremely Low-Cost To Beat.',
      },
      {
        q: 'Are Poker Tournaments Legal In Oregon Social Clubs?',
        a: 'Yes. Licensed Portland Poker Clubs And Oregon Tribal Casinos Spread Daily And Weekend Multi-Table No-Limit Hold\'em Tournaments Year-Round.',
      },
    ],
  },
  {
    slug: 'connecticut',
    code: 'CT',
    name: 'Connecticut',
    title: 'Connecticut Poker Laws: Foxwoods, Mohegan Sun & Online Poker Guide (2026)',
    h1: 'Connecticut Live Poker Guide: Foxwoods, Mohegan Sun, Rake & Taxes',
    legalStatus: '100% Legal Tribal Casino Poker Rooms & Authorized Online Poker',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: '2.0% To 6.99% State Income Tax',
    topCities: ['Mashantucket (Foxwoods)', 'Uncasville (Mohegan Sun)'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Legally Authorized Under 2021 Tribal Compacts (Pending Shared-Liquidity Launch)',
    summary:
      'Connecticut Is New England\'s Historic Poker Powerhouse, Anchored By Foxwoods Resort Casino (One Of The Largest Rooms On The East Coast) And Mohegan Sun Hosting Major WPT, WSOP Circuit, And Mega Stack Series.',
    regulatoryOverview:
      'Gaming Operates Under Tribal-State Compacts Between The State Of Connecticut, The Mashantucket Pequot Tribal Nation (Foxwoods), And The Mohegan Tribe (Mohegan Sun), Regulated By The Connecticut Department Of Consumer Protection.',
    taxWithholdingNotes:
      'Connecticut Taxes Gambling Winnings Up To 6.99% And Withholds 6.99% State Tax On Qualifying W-2G Payouts Exceeding $5,000.',
    faqs: [
      {
        q: 'Which Connecticut Poker Room Is Larger: Foxwoods Or Mohegan Sun?',
        a: 'Foxwoods Resort Casino Operates The Larger Poker Room In Connecticut (50+ Tables During Major Series) And Hosts Regular WPT And Foxwoods Poker Classic Festivals, While Mohegan Sun Runs A Busy 25+ Table Room.',
      },
      {
        q: 'Is Real-Money Online Poker Legal In Connecticut?',
        a: 'Connecticut Legalized Real-Money Online Poker In Its 2021 Gaming Compact Expansion, Though Operators Have Focused On Online Casino And Sportsbooks While Evaluating Multi-State Liquidity Agreements.',
      },
    ],
  },
  {
    slug: 'massachusetts',
    code: 'MA',
    name: 'Massachusetts',
    title: 'Massachusetts Poker Laws: Encore Boston Harbor, MGM Springfield & Taxes',
    h1: 'Massachusetts Live Poker Guide: Encore Boston Harbor, MGM Springfield & Taxes',
    legalStatus: '100% Legal Commercial Casino Poker Rooms',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: '5.0% Flat State Income Tax (+4% Surtax Above $1M)',
    topCities: ['Everett / Boston', 'Springfield'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap (No Promo Drop At Select Limits) Or Hourly Time At Higher Stakes',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Massachusetts Live Poker Is Anchored By Encore Boston Harbor (24+ Tables In Metro Boston) And MGM Springfield, Offering Deep Cash Games Under A Flat 5.0% State Income Tax Rate.',
    regulatoryOverview:
      'Commercial Casino Poker Rooms Are Licensed And Audited By The Massachusetts Gaming Commission (MGC) Under The Expanded Gaming Act Of 2011.',
    taxWithholdingNotes:
      'Massachusetts Levies A 5.0% Flat State Income Tax On Gambling Winnings And Automatically Withholds 5.0% On W-2G Tournament Payouts Exceeding $5,000.',
    faqs: [
      {
        q: 'Where Can You Play Legal Live Poker Near Boston?',
        a: 'Encore Boston Harbor In Everett (Minutes From Downtown Boston) Is The Primary Regulated Casino Poker Room In Eastern Massachusetts, Alongside New Hampshire Charity Rooms Just North Of The Border.',
      },
      {
        q: 'Does Massachusetts Withhold State Tax On Poker Tournament Wins?',
        a: 'Yes. Massachusetts Casinos Withhold 5.0% State Income Tax On Net Poker Tournament Winnings Exceeding $5,000 That Trigger An IRS Form W-2G.',
      },
    ],
  },
  {
    slug: 'indiana',
    code: 'IN',
    name: 'Indiana',
    title: 'Indiana Poker Laws: Horseshoe Hammond, Caesars Southern Indiana & Taxes',
    h1: 'Indiana Live Poker Rooms Guide: Horseshoe Hammond, Gary, Evansville & Taxes',
    legalStatus: '100% Legal Commercial Casinos & Licensed Charity Poker Rooms',
    minAge: '21+ At Commercial Casinos',
    stateIncomeTaxRate: '3.0% Flat State Income Tax (2026)',
    topCities: ['Hammond (Chicagoland)', 'Elizabeth / Louisville Metro', 'Anderson', 'Evansville'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Indiana Serves Both Chicagoland And Midwest Grinders With Flagship Rooms At Horseshoe Hammond (WSOP Circuit Stop), Caesars Southern Indiana, And Bally\'s Evansville Under A Low 3.0% Flat State Income Tax.',
    regulatoryOverview:
      'Commercial Riverboat And Land-Based Casino Poker Rooms Are Regulated By The Indiana Gaming Commission (IGC), With Charity Gaming Supervised By The Indiana Gaming Commission Charity Division.',
    taxWithholdingNotes:
      'Indiana Applies A Low 3.0% Flat State Income Tax Rate (With State Withholding On W-2G Tournament Payouts Over $5,000), Plus Local County Income Taxes For Indiana Residents.',
    faqs: [
      {
        q: 'Which Indiana Poker Room Is Best For Chicago Players?',
        a: 'Horseshoe Hammond In Northwest Indiana (25 Minutes From Downtown Chicago) Is The Region\'s Largest Poker Room And Regular Host Of The WSOP Circuit.',
      },
      {
        q: 'What Is The State Tax Rate On Poker Winnings In Indiana?',
        a: 'Indiana Charges A Low 3.0% Flat State Income Tax Rate On Net Gambling Winnings Reported On State Returns.',
      },
    ],
  },
  {
    slug: 'missouri',
    code: 'MO',
    name: 'Missouri',
    title: 'Missouri Poker Laws: Hollywood St. Louis, Ameristar, Horseshoe & Taxes',
    h1: 'Missouri Live Poker Rooms Guide: St. Louis, Kansas City & Riverboat Rules',
    legalStatus: '100% Legal Commercial Riverboat Casino Poker Rooms',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: 'Up To 4.7% State Income Tax',
    topCities: ['St. Louis (Maryland Heights)', 'Kansas City', 'St. Charles', 'Boonville'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Jackpot Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Missouri Offers Regulated Commercial Casino Poker Rooms Across St. Louis And Kansas City Led By Hollywood Casino St. Louis, Horseshoe St. Louis, And Ameristar Kansas City.',
    regulatoryOverview:
      'Licensed Excursion Gambling Boats And Land-Adjacent Casino Floors Are Regulated By The Missouri Gaming Commission (MGC) With No Loss Limits Since 2008.',
    taxWithholdingNotes:
      'Missouri Levies State Income Tax Up To 4.7% And Withholds 4.0% State Tax On Qualifying W-2G Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'Where Are The Biggest Live Poker Rooms In Missouri?',
        a: 'Hollywood Casino St. Louis (20+ Tables) And Ameristar Casino Kansas City Lead Missouri\'s Live Cash Game And Daily Tournament Schedule.',
      },
      {
        q: 'Are Private Home Poker Games Legal In Missouri?',
        a: 'Non-Raked Social Home Games Among Friends Where Nobody Takes A House Rake Or Seat Fee Are Permitted Under Missouri Social Gambling Provisions.',
      },
    ],
  },
  {
    slug: 'iowa',
    code: 'IA',
    name: 'Iowa',
    title: 'Iowa Poker Laws: Horseshoe Council Bluffs, Riverside, Grand Falls & Taxes',
    h1: 'Iowa Live Poker Rooms Guide: Council Bluffs, Des Moines, Quad Cities & Taxes',
    legalStatus: '100% Legal Commercial & Tribal Casino Poker Rooms',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: '3.8% Flat State Income Tax',
    topCities: ['Council Bluffs (Omaha Metro)', 'Riverside', 'Larchwood', 'Bettendorf', 'Tama'],
    rakeModel: '10% Pot Rake Up To $5 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Iowa Is A Premier Midwest Tournament Circuit Stop Anchored By Horseshoe Council Bluffs (WSOP Circuit & RGPS Host), Riverside Casino, And Grand Falls Casino Under A Low 3.8% Flat State Income Tax.',
    regulatoryOverview:
      'Commercial Casinos Are Regulated By The Iowa Racing And Gaming Commission (IRGC), Alongside Tribal Poker Rooms Including Meskwaki Bingo Casino Hotel.',
    taxWithholdingNotes:
      'Iowa Applies A 3.8% Flat State Income Tax Rate And Withholds 5.0% State Tax On Qualifying W-2G Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'Which Iowa Poker Room Hosts Major National Tournament Series?',
        a: 'Horseshoe Council Bluffs (Across The River From Omaha) Hosts Annual WSOP Circuit And RunGood Poker Series Events, While Riverside Casino Hosts Major MSPT Stops.',
      },
      {
        q: 'What Is Iowa\'s State Income Tax Rate On Poker Winnings?',
        a: 'Iowa Uses A Single Flat 3.8% Individual State Income Tax Rate On Taxable Gambling Income.',
      },
    ],
  },
  {
    slug: 'wisconsin',
    code: 'WI',
    name: 'Wisconsin',
    title: 'Wisconsin Poker Laws: Potawatomi Milwaukee, Oneida & Tribal Rooms (2026)',
    h1: 'Wisconsin Live Poker Guide: Potawatomi Milwaukee, Tribal Casinos & Taxes',
    legalStatus: '100% Legal Tribal Casino Poker Rooms',
    minAge: '21+ At Most Tribal Rooms (18+ At Select Tribal Venues)',
    stateIncomeTaxRate: '3.5% To 7.65% State Income Tax',
    topCities: ['Milwaukee', 'Green Bay', 'Wisconsin Dells', 'Carter'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Wisconsin Live Poker Is Anchored By Potawatomi Casino Hotel In Milwaukee (Reopened 14-Table Poker Room) Along With Ho-Chunk And Oneida Tribal Gaming Properties Statewide.',
    regulatoryOverview:
      'Live Poker Operates Under Class III Tribal-State Gaming Compacts Between Wisconsin\'s Eleven Federally Recognized Tribes And The State Of Wisconsin Department Of Administration Division Of Gaming.',
    taxWithholdingNotes:
      'Wisconsin Taxes Gambling Winnings Between 3.5% And 7.65% And Applies State Withholding On Qualifying W-2G Payouts Over $5,000.',
    faqs: [
      {
        q: 'Is The Potawatomi Poker Room In Milwaukee Open?',
        a: 'Yes. Potawatomi Casino Hotel In Milwaukee Reopened Its Dedicated Poker Room Offering Daily No-Limit Hold\'em, PLO Cash Games, And Scheduled Tournaments.',
      },
      {
        q: 'Are Commercial Non-Tribal Poker Rooms Legal In Wisconsin?',
        a: 'No. Live Regulated Poker In Wisconsin Is Exclusively Operated By Federally Recognized Tribal Casinos Under State Compacts.',
      },
    ],
  },
  {
    slug: 'north-carolina',
    code: 'NC',
    name: 'North Carolina',
    title: 'North Carolina Poker Laws: Harrah\'s Cherokee, WSOP Circuit & Taxes (2026)',
    h1: 'North Carolina Live Poker Guide: Harrah\'s Cherokee, Two Kings & Taxes',
    legalStatus: '100% Legal Tribal Casino Poker Rooms',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: '4.25% Flat State Income Tax (2026)',
    topCities: ['Cherokee (Western NC)', 'Kings Mountain (Charlotte Metro)'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'North Carolina Is Home To Harrah\'s Cherokee Casino Resort, One Of The Highest-Attendance WSOP Circuit Stops In North America, Plus Growing Poker Action Near Charlotte Under A Flat 4.25% State Tax.',
    regulatoryOverview:
      'Tribal Casinos Operate Under Eastern Band Of Cherokee Indians And Catawba Indian Nation Compacts Regulated By Tribal Gaming Commissions And The North Carolina State Lottery/Gaming Oversight Framework.',
    taxWithholdingNotes:
      'North Carolina Applies A Flat 4.25% Individual State Income Tax Rate On Net Gambling Winnings And Does Not Allow Non-Itemized Loss Offsets On State Returns.',
    faqs: [
      {
        q: 'Why Is Harrah\'s Cherokee One Of The Most Popular WSOP Circuit Stops?',
        a: 'Harrah\'s Cherokee Draws Massive Southeast Player Fields Four Times Per Year, Regularly Generating Multi-Million-Dollar WSOP Circuit Main Event Prize Pools.',
      },
      {
        q: 'Are Private Membership Poker Clubs Legal In North Carolina?',
        a: 'North Carolina Law Strictly Prohibits Unlicensed Commercial Or Raked Cardrooms Outside Authorized Tribal Gaming Properties.',
      },
    ],
  },
  {
    slug: 'west-virginia',
    code: 'WV',
    name: 'West Virginia',
    title: 'West Virginia Poker Laws: Hollywood Charles Town, Online Poker & Taxes',
    h1: 'West Virginia Live & Online Poker Guide: Charles Town, Wheeling & MSIGA',
    legalStatus: '100% Legal Commercial Casino Poker & Regulated Online Poker (MSIGA)',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: '2.22% To 4.82% State Income Tax',
    topCities: ['Charles Town (DC Metro)', 'Wheeling', 'Cross Lanes / Charleston', 'New Cumberland'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Legal & Regulated (Member Of Multi-State Internet Gaming Agreement, MSIGA)',
    summary:
      'West Virginia Combines Regulated Live Casino Poker Rooms Like Hollywood Casino At Charles Town Races With Full Legalized Real-Money Online Poker As A Member Of The Multi-State Internet Gaming Agreement (MSIGA).',
    regulatoryOverview:
      'Both Brick-And-Mortar Casino Cardrooms And Regulated Online Poker Operators Are Licensed By The West Virginia Lottery Commission Under The West Virginia Lottery Interactive Wagering Act.',
    taxWithholdingNotes:
      'West Virginia Taxes Gambling Winnings Up To 4.82% Top Marginal Rate And Withholds 6.5% State Tax On Qualifying W-2G Payouts Over $5,000.',
    faqs: [
      {
        q: 'Is Real-Money Online Poker Legal In West Virginia?',
        a: 'Yes. West Virginia Legalized Regulated Real-Money Online Poker And Joined The Multi-State Internet Gaming Agreement (MSIGA) Alongside Nevada, New Jersey, Michigan, And Pennsylvania.',
      },
      {
        q: 'Which West Virginia Poker Room Is Closest To Washington, D.C.?',
        a: 'Hollywood Casino At Charles Town Races In The Eastern Panhandle Is Roughly 65 Miles From Washington, D.C. And Operates A 16+ Table Poker Room.',
      },
    ],
  },
  {
    slug: 'delaware',
    code: 'DE',
    name: 'Delaware',
    title: 'Delaware Poker Laws: Delaware Park, Bally\'s Dover, Online Poker & Taxes',
    h1: 'Delaware Live & Online Poker Guide: Delaware Park, Bally\'s Dover & MSIGA',
    legalStatus: '100% Legal Commercial Racetrack Casinos & Regulated Online Poker (MSIGA)',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: '2.2% To 6.6% State Income Tax',
    topCities: ['Wilmington (Delaware Park)', 'Dover', 'Harrington'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Legal & Regulated (Founding MSIGA Compact State)',
    summary:
      'Delaware Was One Of The First US States To Legalize Regulated Online Poker And Features Busy Mid-Atlantic Live Poker Rooms At Delaware Park (Wilmington) And Bally\'s Dover.',
    regulatoryOverview:
      'All Live Racetrack Casino Poker Rooms And Interactive Gaming Platforms Operate Under The Oversight Of The Delaware State Lottery.',
    taxWithholdingNotes:
      'Delaware Taxes Gambling Winnings Between 2.2% And 6.6% Top Rate On Resident And Non-Resident State Income Tax Returns.',
    faqs: [
      {
        q: 'Which Live Poker Rooms Operate In Delaware?',
        a: 'Delaware Park Casino Near Wilmington (20+ Tables) And Bally\'s Dover Casino Resort Both Spread Daily Hold\'em, PLO Cash Games, And Scheduled Tournaments.',
      },
      {
        q: 'Is Online Poker Legal In Delaware?',
        a: 'Yes. Delaware Authorized Regulated Real-Money Online Poker In 2012 And Is A Founding Member Of The Multi-State Internet Gaming Agreement (MSIGA).',
      },
    ],
  },
  {
    slug: 'new-hampshire',
    code: 'NH',
    name: 'New Hampshire',
    title: 'New Hampshire Poker Laws: 0% Tax, Boston Billiard, Gate City & Charity Rooms',
    h1: 'New Hampshire Live Poker Guide: 0% State Tax & Licensed Charity Cardrooms',
    legalStatus: '100% Legal Licensed Charitable Casino Poker Rooms Statewide',
    minAge: '18+ Statewide',
    stateIncomeTaxRate: '0.0% (Zero State Income Tax)',
    topCities: ['Nashua', 'Manchester', 'Seabrook', 'Hampton Falls', 'Keene'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap (No-Limit Cash & Tournaments Under State Charitable Rules)',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'New Hampshire Is A Premier Northeast Poker Destination Offering 0% State Income Tax, 18+ Entry, And Over 10 Active Charitable Cardrooms Including Boston Billiard Club & Casino (Nashua) And The Brook (Seabrook).',
    regulatoryOverview:
      'Charitable Gaming Poker Rooms Are Licensed By The New Hampshire Lottery Commission Under RSA 287-D, Directing A Portion Of Gaming Revenue To Registered New Hampshire Nonprofits.',
    taxWithholdingNotes:
      'New Hampshire Levies Zero State Individual Income Tax On Poker Winnings. Federal IRS Form W-2G Applies To Net Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'Can You Play Live Poker At Age 18 In New Hampshire?',
        a: 'Yes. New Hampshire Licensed Charitable Poker Rooms Legally Admit Players Age 18 And Older For Both Cash Games And Multi-Table Tournaments.',
      },
      {
        q: 'Does New Hampshire Tax Poker Winnings?',
        a: 'No. New Hampshire Has A 0% State Income Tax On Earned And Gambling Income.',
      },
    ],
  },
  {
    slug: 'rhode-island',
    code: 'RI',
    name: 'Rhode Island',
    title: 'Rhode Island Poker Laws: Bally\'s Twin River Lincoln, Online Status & Taxes',
    h1: 'Rhode Island Live Poker Guide: Bally\'s Twin River, Rake & Taxes',
    legalStatus: '100% Legal Commercial Casino Poker (Bally\'s Twin River) & Regulated iGaming',
    minAge: '18+ At Rhode Island Casinos (21+ For Online iGaming)',
    stateIncomeTaxRate: '3.75% To 5.99% State Income Tax',
    topCities: ['Lincoln (Providence Metro)', 'Tiverton'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Online Casino Legalized In 2024; Online Poker Not Yet Launched',
    summary:
      'Rhode Island Offers Regulated Live Poker At Bally\'s Twin River Lincoln Casino Resort Near Providence With 18+ Floor Entry And Easy Access From Southern New England.',
    regulatoryOverview:
      'Regulated By The Rhode Island Lottery Division Of The Department Of Revenue Under State Casino And Interactive Gaming Statutes.',
    taxWithholdingNotes:
      'Rhode Island Taxes Gambling Winnings Between 3.75% And 5.99% And Applies State Withholding On Qualifying W-2G Payouts Over $5,000.',
    faqs: [
      {
        q: 'What Is The Minimum Age To Play Poker In Rhode Island?',
        a: 'Players Age 18 And Older May Legally Play Live Poker At Bally\'s Twin River Lincoln Casino Resort.',
      },
      {
        q: 'Does Rhode Island Have Regulated Real-Money Online Poker?',
        a: 'Rhode Island Launched Regulated Online Casino Table Games In 2024, But Peer-To-Peer Real-Money Online Poker Has Not Yet Launched.',
      },
    ],
  },
  {
    slug: 'virginia',
    code: 'VA',
    name: 'Virginia',
    title: 'Virginia Poker Laws: Rivers Portsmouth, Caesars Virginia, Pop\'s & Taxes',
    h1: 'Virginia Live Poker Rooms Guide: Commercial Casinos, Charity Poker & Taxes',
    legalStatus: '100% Legal Commercial Casino Poker Rooms & Regulated Charitable Poker',
    minAge: '21+ At Commercial Casinos (18+ At Select Charity Events)',
    stateIncomeTaxRate: '2.0% To 5.75% State Income Tax',
    topCities: ['Portsmouth (Hampton Roads)', 'Danville', 'Bristol', 'Richmond', 'Norfolk'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Virginia\'s Live Poker Market Has Expanded Rapidly With Commercial Casino Poker Rooms At Rivers Casino Portsmouth (24 Tables), Caesars Virginia (Danville), And Hard Rock Bristol Alongside Licensed Charitable Poker.',
    regulatoryOverview:
      'Commercial Casinos Are Licensed By The Virginia Lottery Board, While Charitable Texas Hold\'em Tournaments Are Supervised By The Virginia Department Of Agriculture And Consumer Services (VDACS).',
    taxWithholdingNotes:
      'Virginia Taxes Gambling Winnings Up To 5.75% Top Rate And Withholds 4.0% State Tax On Qualifying W-2G Payouts Over $5,000.',
    faqs: [
      {
        q: 'Which Commercial Casinos In Virginia Have Live Poker Rooms?',
        a: 'Rivers Casino Portsmouth (24-Table BetRivers Poker Room), Caesars Virginia In Danville (WSOP Poker Room), And Hard Rock Hotel & Casino Bristol All Offer Live Regulated Poker.',
      },
      {
        q: 'Is Real-Money Online Poker Legal In Virginia?',
        a: 'No. Virginia Has Legalized Mobile Sports Betting And Commercial Casinos, But Real-Money Online Poker Is Not Yet Regulated.',
      },
    ],
  },
  {
    slug: 'new-mexico',
    code: 'NM',
    name: 'New Mexico',
    title: 'New Mexico Poker Laws: Sandia, Route 66, Inn Of The Mountain Gods & Taxes',
    h1: 'New Mexico Live Poker Rooms Guide: Albuquerque, Santa Fe & Tribal Casinos',
    legalStatus: '100% Legal Tribal Casino Poker Rooms Statewide',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: '1.5% To 5.9% State Income Tax',
    topCities: ['Albuquerque', 'Santa Fe', 'Mescalero (Ruidoso)', 'Taos'],
    rakeModel: '10% Pot Rake Up To $5 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'New Mexico Offers Active Tribal Casino Poker Across Albuquerque And Santa Fe Led By Sandia Resort & Casino, Route 66 Casino, And Buffalo Thunder Resort.',
    regulatoryOverview:
      'Tribal Casino Poker Rooms Operate Under Class III Gaming Compacts Monitored By The New Mexico Gaming Control Board And Sovereign Pueblo/Tribal Gaming Commissions.',
    taxWithholdingNotes:
      'New Mexico Levies Progressive State Income Tax Up To 5.9% And Withholds 6.0% State Tax On Qualifying W-2G Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'What Is The Biggest Live Poker Room In New Mexico?',
        a: 'Sandia Resort & Casino In Albuquerque Operates New Mexico\'s Premier Live Poker Room With Daily Cash Games And Weekly Multi-Table Tournaments.',
      },
      {
        q: 'What Is The Legal Gambling Age In New Mexico Poker Rooms?',
        a: 'Players Must Be At Least 21 Years Old To Enter And Play At New Mexico Tribal Casino Poker Rooms.',
      },
    ],
  },
  {
    slug: 'south-dakota',
    code: 'SD',
    name: 'South Dakota',
    title: 'South Dakota Poker Laws: Deadwood Casinos, 0% State Tax & Limits (2026)',
    h1: 'South Dakota Live Poker Guide: Historic Deadwood Cardrooms & 0% State Tax',
    legalStatus: '100% Legal Commercial Casinos In Deadwood & Tribal Poker Rooms',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: '0.0% (Zero State Income Tax)',
    topCities: ['Deadwood', 'Sioux Falls Metro (Nearby IA/SD Border)', 'Flandreau'],
    rakeModel: '10% Pot Rake Up To $5 Cap ($1,000 Max Bet Limit Per Street In Deadwood)',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'South Dakota Combines Historic Deadwood Poker Heritage (Cadillac Jack\'s, Silverado-Franklin, Saloon #10) With A 0% State Income Tax Rate And High $1,000 Max Bet Limits.',
    regulatoryOverview:
      'Deadwood Commercial Casinos Are Regulated By The South Dakota Commission On Gaming With Up To $1,000 Max Bet Limits Per Street And Full Multi-Table Tournament Series Including MSPT Deadwood.',
    taxWithholdingNotes:
      'South Dakota Levies Zero State Personal Income Tax On Poker Winnings. Federal IRS Form W-2G Still Applies To Net Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'Does South Dakota Charge State Income Tax On Poker Winnings?',
        a: 'No. South Dakota Has A 0% State Individual Income Tax Rate, So Deadwood Cash And Tournament Winnings Carry Zero State Tax.',
      },
      {
        q: 'Does Deadwood Host Major Poker Tournament Series?',
        a: 'Yes. Silverado-Franklin Historic Hotel & Gaming Complex In Deadwood Regularly Hosts Mid-States Poker Tour (MSPT) South Dakota State Poker Championship Events.',
      },
    ],
  },
  {
    slug: 'montana',
    code: 'MT',
    name: 'Montana',
    title: 'Montana Poker Laws: Licensed Tavern Cardrooms, $800 Pot Limit & Taxes',
    h1: 'Montana Live Poker Guide: Licensed Tavern Poker Rooms & State Rules',
    legalStatus: '100% Legal State-Licensed Tavern & Casino Poker Rooms Statewide',
    minAge: '18+ Statewide',
    stateIncomeTaxRate: '4.7% To 5.9% State Income Tax',
    topCities: ['Billings', 'Bozeman', 'Missoula', 'Helena', 'Great Falls', 'Kalispell'],
    rakeModel: '10% Pot Rake Up To $5 Cap ($800 Statutory Max Pot Limit Under Montana Law)',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Montana Permits Licensed Live Poker Tables Inside Taverns And Casinos Statewide With 18+ Entry, Governed By A Statutory $800 Maximum Pot Limit On Live Cash Games.',
    regulatoryOverview:
      'Live Poker Operations Are Regulated By The Montana Department Of Justice Gambling Control Division Under Montana Code Annotated Title 23, Chapter 5.',
    taxWithholdingNotes:
      'Montana Taxes Gambling Winnings Between 4.7% And 5.9% On State Income Tax Returns.',
    faqs: [
      {
        q: 'Why Is There An $800 Pot Cap On Montana Live Poker Games?',
        a: 'Montana Code Annotated 23-5-312 Sets A Statutory $800 Maximum Prize/Pot Cap For Live Cash-Game Hands In Licensed Cardrooms, While Allowing Larger Prize Pools In Authorized Tournaments.',
      },
      {
        q: 'What Is The Minimum Age To Play Poker In Montana?',
        a: 'Players Age 18 And Older Can Legally Play Live Poker In Licensed Montana Cardrooms.',
      },
    ],
  },
  {
    slug: 'kansas',
    code: 'KS',
    name: 'Kansas',
    title: 'Kansas Poker Laws: Hollywood Kansas Speedway, Tribal Rooms & Taxes (2026)',
    h1: 'Kansas Live Poker Rooms Guide: Kansas City, Wichita & Tribal Casinos',
    legalStatus: '100% Legal State-Owned Commercial Casinos & Tribal Poker Rooms',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: '5.2% To 5.58% State Income Tax',
    topCities: ['Kansas City (KS)', 'Mulvane / Wichita', 'Mayetta (Topeka Metro)'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Kansas Offers Regulated Live Poker At Prairie Band Casino & Resort Near Topeka, Kansas Star Casino Near Wichita, And Cross-Border Access To Kansas City Metro Rooms.',
    regulatoryOverview:
      'State-Owned Commercial Casinos Are Supervised By The Kansas Racing And Gaming Commission (KRGC) And Kansas Lottery, Alongside Compacted Tribal Casinos.',
    taxWithholdingNotes:
      'Kansas Levies State Income Tax Up To 5.58% And Withholds 5.0% State Tax On Qualifying W-2G Payouts Exceeding $5,000.',
    faqs: [
      {
        q: 'Where Can You Play Live Poker In Kansas?',
        a: 'Prairie Band Casino & Resort North Of Topeka And Regional Kansas City Metro Casinos Spread Regular Live Cash Games And Scheduled Tournaments.',
      },
      {
        q: 'Does Kansas Withhold State Tax On Poker Tournament Wins?',
        a: 'Yes. Kansas Casinos Withhold 5.0% State Income Tax On Net Tournament Payouts Exceeding $5,000 Reported On Form W-2G.',
      },
    ],
  },
  {
    slug: 'arkansas',
    code: 'AR',
    name: 'Arkansas',
    title: 'Arkansas Poker Laws: Oaklawn Hot Springs, Southland, Saracen & Taxes',
    h1: 'Arkansas Live Poker Guide: Oaklawn Racing Casino, Southland & Saracen',
    legalStatus: '100% Legal Commercial Casino Poker Rooms Statewide',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: 'Up To 3.9% State Income Tax',
    topCities: ['Hot Springs (Oaklawn)', 'West Memphis (Memphis Metro)', 'Pine Bluff'],
    rakeModel: '10% Pot Rake Up To $5 - $6 Cap + $1 - $2 Promo Drop',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Arkansas Features Regulated Commercial Casino Poker Following Amendment 100, Anchored By Oaklawn Racing Casino Resort In Hot Springs And Saracen Casino Resort In Pine Bluff Under A Low 3.9% Top State Tax.',
    regulatoryOverview:
      'Commercial Casinos Are Licensed And Audited By The Arkansas Racing Commission Under Constitutional Amendment 100.',
    taxWithholdingNotes:
      'Arkansas Taxes Gambling Winnings Up To 3.9% Top Rate And Applies State Withholding On Qualifying W-2G Tournament Payouts Over $5,000.',
    faqs: [
      {
        q: 'Which Arkansas Casinos Offer Live Poker Rooms?',
        a: 'Oaklawn Racing Casino Resort In Hot Springs And Saracen Casino Resort In Pine Bluff Operate Regulated Live Poker Tables, With Southland Casino Serving The West Memphis/Memphis Corridor.',
      },
      {
        q: 'What Is The Minimum Age To Play Poker In Arkansas?',
        a: 'Players Must Be At Least 21 Years Old To Play Live Poker At Arkansas Commercial Casinos.',
      },
    ],
  },
  {
    slug: 'georgia',
    code: 'GA',
    name: 'Georgia',
    title: 'Georgia Poker Laws: Live Status, Free Bar Leagues, Nearby Rooms & Taxes',
    h1: 'Georgia Poker Laws Guide: Legality, Free Leagues, Nearest Rooms & Taxes',
    legalStatus: 'No Commercial Or Tribal Casinos; Free Bar Leagues & Social Play Only',
    minAge: '18+ For Free Bar Leagues (21+ At Out-Of-State Neighboring Casinos)',
    stateIncomeTaxRate: '5.19% Flat State Income Tax (2026)',
    topCities: ['Atlanta', 'Savannah', 'Augusta', 'Columbus'],
    rakeModel: 'Zero Commercial Rake Allowed; Free-To-Enter Bar Poker Leagues Only',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Georgia Does Not Permit Commercial Or Tribal Casinos Or Raked Poker Clubs, So Atlanta And Georgia Players Primarily Participate In Free Bar Leagues Or Travel To Harrah\'s Cherokee (NC) And Bestbet Jacksonville (FL).',
    regulatoryOverview:
      'Under OCGA 16-12-21, Commercial Gambling And Raked Poker Games Are Prohibited In Georgia. Free-To-Play Promotional Bar Poker Leagues With No Buy-In Requirement Operate Statewide.',
    taxWithholdingNotes:
      'Georgia Residents Must Report Out-Of-State Casino And Tournament Poker Winnings On Their Georgia Return At The Flat 5.19% State Income Tax Rate.',
    faqs: [
      {
        q: 'Where Is The Closest Legal Live Poker Room To Atlanta, Georgia?',
        a: 'Harrah\'s Cherokee Casino Resort In Western North Carolina (Approximately 2.5 Hours North Of Atlanta) Is The Closest Full-Scale Legal Poker Room, Followed By Bestbet Jacksonville In Florida.',
      },
      {
        q: 'Are Home Poker Games Legal In Georgia?',
        a: 'Georgia Statute Does Not Carve Out A Broad Home-Game Exemption For Money Wagering; Only Zero-Buy-In Free Promotional Poker And Play-Credit Platforms Like Smarter.Poker Are Permitted.',
      },
    ],
  },
  {
    slug: 'tennessee',
    code: 'TN',
    name: 'Tennessee',
    title: 'Tennessee Poker Laws: 0% State Tax, Free Leagues & Nearby Rooms (2026)',
    h1: 'Tennessee Poker Laws Guide: 0% State Income Tax, Legality & Closest Rooms',
    legalStatus: 'No Brick-And-Mortar Casinos; Free Bar Leagues & Social Play Only',
    minAge: '18+ For Free Leagues (21+ At Border Casinos In MS, AR, NC, VA, KY/IN)',
    stateIncomeTaxRate: '0.0% (Zero State Income Tax)',
    topCities: ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga'],
    rakeModel: 'Zero Commercial Rake Permitted In-State',
    onlineRealMoneyStatus: 'Social & Club Play Only (Mobile Sports Betting Only)',
    summary:
      'Tennessee Has Zero State Income Tax On Poker Winnings, Making It A Tax-Friendly Home Base For Players Who Travel To Nearby Poker Rooms In Tunica (MS), Harrah\'s Cherokee (NC), Hard Rock Bristol (VA), Or Caesars Southern Indiana.',
    regulatoryOverview:
      'Tennessee Authorizes Online Sports Betting Under The Sports Wagering Council But Prohibits Brick-And-Mortar Casinos And Raked Cardrooms Under TCA 39-17-502.',
    taxWithholdingNotes:
      'Tennessee Levies Zero State Personal Income Tax On Out-Of-State Casino And WSOP Tournament Winnings (Though Non-Resident Source-State Taxes May Still Apply Where You Play).',
    faqs: [
      {
        q: 'Where Do Nashville And Memphis Players Go For Legal Live Poker?',
        a: 'Memphis Players Drive 45 Minutes South To Horseshoe Tunica In Mississippi, While Nashville And East Tennessee Players Travel To Caesars Southern Indiana, Harrah\'s Cherokee (NC), Or Hard Rock Bristol (VA).',
      },
      {
        q: 'Does Tennessee Tax Poker Winnings?',
        a: 'No. Tennessee Has A 0% State Personal Income Tax Rate On Earned And Gambling Income.',
      },
    ],
  },
  {
    slug: 'kentucky',
    code: 'KY',
    name: 'Kentucky',
    title: 'Kentucky Poker Laws: Legality, Flat 3.5% Tax & Border Casino Guide',
    h1: 'Kentucky Poker Laws Guide: Legality, Charity Rules & Nearest Live Rooms',
    legalStatus: 'No Commercial Table-Game Casinos; Licensed Charity Poker & Border Rooms',
    minAge: '18+ For Charity Events (21+ At Border Casinos In IN & OH)',
    stateIncomeTaxRate: '3.5% Flat State Income Tax (2026)',
    topCities: ['Louisville', 'Lexington', 'Northern Kentucky (Cincinnati Metro)'],
    rakeModel: 'No Commercial Pot Rake In-State (Border Casinos Run Standard 10% Up To $5-$6 Cap)',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Kentucky Restricts Live Commercial Poker In-State, But Louisville And Northern Kentucky Players Sit Minutes Across The Ohio River From Caesars Southern Indiana And Hard Rock Casino Cincinnati.',
    regulatoryOverview:
      'Kentucky Permits Pari-Mutuel Horse Racing, Historical Horse Racing Terminals, And Regulated Sports Betting, While Restricting Unlicensed Cardrooms Under KRS Chapter 528.',
    taxWithholdingNotes:
      'Kentucky Residents Report Net Out-Of-State Poker Winnings Under The Flat 3.5% State Individual Income Tax Rate.',
    faqs: [
      {
        q: 'Where Are The Closest Legal Poker Rooms To Louisville And Lexington?',
        a: 'Caesars Southern Indiana (25 Minutes From Downtown Louisville) And Hard Rock Casino Cincinnati (Just Across The River From Northern Kentucky) Are The Closest Full-Scale Live Poker Rooms.',
      },
      {
        q: 'What Is Kentucky\'s State Income Tax Rate On Poker Winnings?',
        a: 'Kentucky Taxes Resident Net Gambling Winnings At Its Flat 3.5% State Individual Income Tax Rate.',
      },
    ],
  },
  {
    slug: 'alabama',
    code: 'AL',
    name: 'Alabama',
    title: 'Alabama Poker Laws: Legality, Charity Status & Nearest Gulf Coast Rooms',
    h1: 'Alabama Poker Laws Guide: State Rules, Taxes & Closest Live Poker Rooms',
    legalStatus: 'No Live Poker Rooms In-State; Social & Play-Credit Poker Only',
    minAge: '21+ At Neighboring MS And FL Casino Poker Rooms',
    stateIncomeTaxRate: '2.0% To 5.0% State Income Tax',
    topCities: ['Birmingham', 'Mobile', 'Huntsville', 'Montgomery'],
    rakeModel: 'No Commercial Live Poker In-State',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Alabama Does Not Permit Live Casino Table Games Or Commercial Poker Rooms; Players In Mobile And Birmingham Typically Travel To Beau Rivage In Biloxi (MS) Or Pensacola Greyhound Poker Room (FL).',
    regulatoryOverview:
      'Under Alabama Code Title 13A Chapter 12, Commercial Cardrooms Are Prohibited. Poarch Band Of Creek Indians Casinos Operate Class II Electronic Bingo Without Live Dealer Poker Tables.',
    taxWithholdingNotes:
      'Alabama Residents Report Net Gambling Winnings On State Income Tax Returns At Marginal Rates Up To 5.0%.',
    faqs: [
      {
        q: 'Do Wind Creek Casinos In Alabama Have Live Poker Rooms?',
        a: 'No. Wind Creek Properties In Atmore, Wetumpka, And Montgomery Operate Class II Electronic Gaming Machines Without Live Table Poker.',
      },
      {
        q: 'Where Is The Closest Legal Live Poker Room To Mobile, Alabama?',
        a: 'Beau Rivage Resort & Casino In Biloxi, Mississippi And Pensacola Greyhound Track Poker Room In Florida Are Each Roughly One Hour From Mobile.',
      },
    ],
  },
  {
    slug: 'south-carolina',
    code: 'SC',
    name: 'South Carolina',
    title: 'South Carolina Poker Laws: Legality, Cruises, Taxes & Closest Rooms',
    h1: 'South Carolina Poker Laws Guide: State Rules, Offshore Boats & Nearest Rooms',
    legalStatus: 'No Land-Based Poker Rooms; Offshore Casino Cruises & Social Play Only',
    minAge: '21+ On Offshore Cruises & Neighboring NC/FL Rooms',
    stateIncomeTaxRate: 'Up To 6.2% State Income Tax',
    topCities: ['Charleston', 'Columbia', 'Greenville', 'Myrtle Beach'],
    rakeModel: 'No Land-Based Commercial Poker Allowed In-State',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'South Carolina Prohibits Land-Based Casino Poker Rooms; Upstate Players Travel To Harrah\'s Cherokee (NC) While Coastal Players Access International-Waters Casino Cruises Or Jacksonville (FL) Rooms.',
    regulatoryOverview:
      'Under South Carolina Code Section 16-19-40, Wagering On Card Games Is Broadly Prohibited On Land, Including Strictly Enforced Restrictions Against Home-Game Wagering.',
    taxWithholdingNotes:
      'South Carolina Residents Report Out-Of-State Gambling And Tournament Winnings On State Returns Up To The 6.2% Top Marginal Bracket.',
    faqs: [
      {
        q: 'Are Live Poker Rooms Legal In South Carolina?',
        a: 'No. South Carolina Prohibits Land-Based Commercial And Raked Poker Rooms. Players Commonly Travel To Harrah\'s Cherokee In North Carolina Or Bestbet Jacksonville In Florida.',
      },
      {
        q: 'Can You Play Poker On Casino Boats Out Of Myrtle Beach?',
        a: 'Casino Cruises Departing From Little River Sail Into Federal International Waters Outside State Jurisdiction Before Opening Gaming Tables.',
      },
    ],
  },
  {
    slug: 'north-dakota',
    code: 'ND',
    name: 'North Dakota',
    title: 'North Dakota Poker Laws: Charity Cardrooms, Tribal Casinos & Taxes',
    h1: 'North Dakota Live Poker Guide: Charitable Poker Rooms, Tribal Casinos & Taxes',
    legalStatus: '100% Legal Licensed Charitable Poker Rooms & Tribal Casino Poker',
    minAge: '21+ At Commercial Charity Sites (18+ At Select Tribal Casinos)',
    stateIncomeTaxRate: '0.0% To 2.5% State Income Tax',
    topCities: ['Fargo', 'Bismarck', 'Grand Forks', 'Minot'],
    rakeModel: 'Low Cap Rake / Limit & Spread-Limit Structures Under State Charitable Rules',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'North Dakota Offers Legal Live Poker Across Charitable Cardrooms In Fargo, Bismarck, And Grand Forks Plus Tribal Casinos, Paired With One Of The Lowest State Income Tax Rates In The US (Up To 2.5%).',
    regulatoryOverview:
      'Charitable Poker Is Regulated By The North Dakota Office Of Attorney General Gaming Division Under NDCC Chapter 53-06.1, Alongside Five Tribal Casino Resorts.',
    taxWithholdingNotes:
      'North Dakota Features Ultra-Low State Income Tax Brackets Capping At 2.5%, Keeping State Tax Burden Minimal On Tournament Winnings.',
    faqs: [
      {
        q: 'Is Live Poker Legal In Fargo And Bismarck, North Dakota?',
        a: 'Yes. State-Licensed Charitable Gaming Organizations Operate Live Poker Cash Games And Tournaments In Fargo, Bismarck, Grand Forks, And Minot.',
      },
      {
        q: 'What Is North Dakota\'s Top State Income Tax Rate On Poker Winnings?',
        a: 'North Dakota\'s Top Individual State Income Tax Rate Is Just 2.5%, One Of The Lowest Among Taxing US States.',
      },
    ],
  },
  {
    slug: 'nebraska',
    code: 'NE',
    name: 'Nebraska',
    title: 'Nebraska Poker Laws: WarHorse Casinos, Omaha Border Rooms & Taxes',
    h1: 'Nebraska Live Poker Guide: New Racetrack Casinos, Council Bluffs & Taxes',
    legalStatus: '100% Legal Commercial Racetrack Casinos & Tribal Gaming',
    minAge: '21+ Statewide',
    stateIncomeTaxRate: '2.46% To 4.55% State Income Tax (2026)',
    topCities: ['Omaha', 'Lincoln', 'Grand Island'],
    rakeModel: 'Standard Commercial Casino Pot Rake (10% Up To $5 Cap)',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Nebraska Approved Commercial Racetrack Casinos Via Voter Initiative (WarHorse Omaha & Lincoln), While Omaha Players Also Have 10-Minute Bridge Access To Horseshoe Council Bluffs In Iowa.',
    regulatoryOverview:
      'Licensed Racetrack Casinos Are Supervised By The Nebraska Racing And Gaming Commission Under The Nebraska Racetrack Gaming Act.',
    taxWithholdingNotes:
      'Nebraska Taxes Gambling Winnings Up To 4.55% Top Rate (Phasing Down Under State Tax Reform) And Withholds 5.0% On Qualifying W-2G Payouts.',
    faqs: [
      {
        q: 'Where Do Omaha Poker Players Play Major Live Tournaments?',
        a: 'Omaha Players Are Minutes Across The Missouri River From Horseshoe Council Bluffs (WSOP Circuit & RGPS Host) While Nebraska\'s WarHorse Racetrack Casinos Expand Live Table Offerings.',
      },
      {
        q: 'What Is The Legal Casino Age In Nebraska?',
        a: 'Players Must Be At Least 21 Years Old To Gamble At Nebraska Commercial Racetrack Casinos.',
      },
    ],
  },
  {
    slug: 'maine',
    code: 'ME',
    name: 'Maine',
    title: 'Maine Poker Laws: Oxford Casino, Hollywood Bangor & Charity Poker (2026)',
    h1: 'Maine Live Poker Guide: Commercial Casinos, Charity Tournaments & Taxes',
    legalStatus: '100% Legal Commercial Casinos & Licensed High-Stakes Charity Poker',
    minAge: '21+ At Commercial Casinos (18+ At Select Charity Tournaments)',
    stateIncomeTaxRate: '5.8% To 7.15% State Income Tax',
    topCities: ['Portland', 'Bangor', 'Oxford'],
    rakeModel: 'Commercial Casino Table Rules & State-Capped Charitable Tournament Entry Fees',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Maine Permits Licensed Charitable Poker Tournaments And Two Commercial Casinos (Oxford Casino And Hollywood Casino Bangor), With Southern Maine Players Also Close To New Hampshire\'s 0%-Tax Cardrooms.',
    regulatoryOverview:
      'Regulated By The Maine Gambling Control Unit (MGCU) Within The Department Of Public Safety.',
    taxWithholdingNotes:
      'Maine Taxes Gambling Winnings Between 5.8% And 7.15% And Withholds 5.0% State Tax On Qualifying W-2G Payouts Over $5,000.',
    faqs: [
      {
        q: 'Are Poker Tournaments Legal In Maine?',
        a: 'Yes. Maine Authorizes Licensed Nonprofit Charity Poker Tournaments Statewide Alongside Commercial Casino Gaming At Oxford Casino And Hollywood Casino Bangor.',
      },
      {
        q: 'Where Is The Closest Full-Time Live Cash Game Room To Portland, Maine?',
        a: 'The Brook In Seabrook, New Hampshire (Roughly 55 Minutes South Of Portland) Offers Full-Time Live Cash Games And Tournaments With 0% New Hampshire State Income Tax.',
      },
    ],
  },
  {
    slug: 'vermont',
    code: 'VT',
    name: 'Vermont',
    title: 'Vermont Poker Laws: Legality, Charity Events, Taxes & Closest Rooms',
    h1: 'Vermont Poker Laws Guide: State Rules, Charitable Play & Nearest Rooms',
    legalStatus: 'No Brick-And-Mortar Casinos; Nonprofit Charity Play & Social Poker Only',
    minAge: '18+ For Nonprofit Events (21+ At Neighboring NH, NY & MA Rooms)',
    stateIncomeTaxRate: '3.35% To 8.75% State Income Tax',
    topCities: ['Burlington', 'Montpelier', 'Rutland', 'Brattleboro'],
    rakeModel: 'No Commercial Pot Rake Permitted In-State',
    onlineRealMoneyStatus: 'Social & Club Play Only (Mobile Sports Betting Only)',
    summary:
      'Vermont Does Not Operate Commercial Or Tribal Casinos; Live Poker Players Primarily Travel Across The Border To New Hampshire Charity Cardrooms, Playground Poker Club (Montreal), Or Turning Stone (NY).',
    regulatoryOverview:
      'Vermont Legalized Online Sports Betting In 2024 Under The Department Of Liquor And Lottery, While Prohibiting Commercial Casinos And Unlicensed Cardrooms Under 13 V.S.A. Chapter 51.',
    taxWithholdingNotes:
      'Vermont Residents Must Report Out-Of-State Casino And Tournament Winnings On Vermont State Returns At Rates Up To 8.75%.',
    faqs: [
      {
        q: 'Where Is The Closest Major Live Poker Room To Burlington, Vermont?',
        a: 'Playground Poker Club Near Montreal (About 90 Minutes North Across The Canadian Border) And New Hampshire\'s Licensed Charity Cardrooms Are The Closest Full-Time Rooms To Burlington.',
      },
      {
        q: 'Is Real-Money Online Poker Legal In Vermont?',
        a: 'No. Vermont Only Regulates Mobile Sports Betting; Online Poker Is Limited To Free Play-Credit Platforms Like Smarter.Poker.',
      },
    ],
  },
  {
    slug: 'idaho',
    code: 'ID',
    name: 'Idaho',
    title: 'Idaho Poker Laws: Legality, Flat 5.695% Tax & Nearby Border Rooms',
    h1: 'Idaho Poker Laws Guide: State Restrictions, Taxes & Closest Live Rooms',
    legalStatus: 'No Live Dealer Poker Rooms In-State; Social & Play-Credit Poker Only',
    minAge: '21+ At Neighboring NV (Jackpot/Wendover), WA (Spokane) & MT Rooms',
    stateIncomeTaxRate: '5.695% Flat State Income Tax',
    topCities: ['Boise', 'Coeur d\'Alene', 'Idaho Falls', 'Twin Falls'],
    rakeModel: 'No Commercial Live Poker Allowed In-State',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Idaho Prohibits Live Dealer Casino Table Games And Commercial Poker Rooms; Northern Idaho Players Frequent Spokane (WA) And Montana Cardrooms, While Southern Idaho Players Travel To Jackpot And Wendover (NV).',
    regulatoryOverview:
      'Idaho\'s Constitution Strictly Limits Tribal Casinos To Electronic Gaming Machines And Prohibits Live-Dealer Table Games And Commercial Cardrooms Under Idaho Code Title 18 Chapter 38.',
    taxWithholdingNotes:
      'Idaho Residents Report Net Out-Of-State Gambling Winnings Under Idaho\'s Flat 5.695% Individual State Income Tax Rate.',
    faqs: [
      {
        q: 'Do Idaho Tribal Casinos Have Live Poker Tables?',
        a: 'No. Idaho Tribal Compacts Authorize Electronic Gaming Machines Only And Do Not Permit Live-Dealer Table Games Or Poker Rooms.',
      },
      {
        q: 'Where Do Boise And Coeur d\'Alene Poker Players Play Live?',
        a: 'Coeur d\'Alene Players Drive 35 Minutes West To Spokane, Washington Cardrooms, While Boise Players Commonly Travel South To Nevada Or East To Montana.',
      },
    ],
  },
  {
    slug: 'wyoming',
    code: 'WY',
    name: 'Wyoming',
    title: 'Wyoming Poker Laws: 0% State Tax, Tribal Casinos & Social Games (2026)',
    h1: 'Wyoming Live Poker Guide: 0% State Income Tax, Wind River & Social Rules',
    legalStatus: 'Legal Tribal Casino Gaming & Private Non-Raked Social Poker Games',
    minAge: '21+ At Tribal Casinos (18+ At Select Venues)',
    stateIncomeTaxRate: '0.0% (Zero State Income Tax)',
    topCities: ['Cheyenne', 'Casper', 'Riverton', 'Lander', 'Jackson'],
    rakeModel: 'Zero Rake Permitted On Private Social Games; Standard Tribal Gaming Rules',
    onlineRealMoneyStatus: 'Social & Club Play Only (Online Sports Betting Only)',
    summary:
      'Wyoming Levies Zero State Income Tax On Poker Winnings And Explicitly Exempts Genuine Bona Fide Social Poker Games With Zero House Rake, While Cheyenne Players Sit 90 Minutes From Black Hawk, Colorado.',
    regulatoryOverview:
      'Under Wyoming Statutes 6-7-101, Non-Raked Bona Fide Social Relationships Gambling Is Explicitly Excluded From Illegal Gambling, Alongside Tribal Casinos On The Wind River Reservation.',
    taxWithholdingNotes:
      'Wyoming Has A 0% State Personal Income Tax Rate, Keeping All Live And Out-Of-State Tournament Winnings Free Of Wyoming State Income Tax.',
    faqs: [
      {
        q: 'Are Home Poker Games Legal In Wyoming?',
        a: 'Yes. Wyoming Statute 6-7-101 Explicitly Permits Bona Fide Social Games Where All Players Compete On Equal Terms And No Host Or House Collects A Rake Or Fee.',
      },
      {
        q: 'Where Is The Closest Major Poker Hub To Cheyenne, Wyoming?',
        a: 'Black Hawk, Colorado (Monarch Casino & Ameristar Black Hawk) Is Roughly 90 Minutes South Of Cheyenne And Offers 24/7 No-Limit Hold\'em And PLO Action.',
      },
    ],
  },
  {
    slug: 'utah',
    code: 'UT',
    name: 'Utah',
    title: 'Utah Poker Laws: Strict Ban, Wendover NV Access & State Tax Rules (2026)',
    h1: 'Utah Poker Laws Guide: Constitutional Ban, Wendover Border & Taxes',
    legalStatus: 'All Real-Money Gambling Prohibited In-State; Free Play-Credit Only',
    minAge: '21+ Across The Border In West Wendover & Mesquite, Nevada',
    stateIncomeTaxRate: '4.55% Flat State Income Tax',
    topCities: ['Salt Lake City', 'Provo', 'Ogden', 'St. George'],
    rakeModel: 'Zero Real-Money Wagering Permitted In-State',
    onlineRealMoneyStatus: 'Strictly Prohibited By Utah Code 76-10-1102 (Free Play-Credit Only)',
    summary:
      'Utah Prohibits All Forms Of Real-Money Gambling Including Home Games, Lotteries, And Online Poker; Salt Lake City Players Drive 90 Minutes West To West Wendover, Nevada, While St. George Players Are 40 Minutes From Mesquite, Nevada.',
    regulatoryOverview:
      'Utah Code Title 76 Chapter 10 Broadly Prohibits All Real-Money Gambling Including Online Wagering Even If Legalized Elsewhere. Only 100% Free Play-Credit Platforms With No Cash Value Like Smarter.Poker Operate Legally.',
    taxWithholdingNotes:
      'Utah Residents Must Report Out-Of-State Nevada Casino And Tournament Poker Winnings On Their Utah Return Under Utah\'s Flat 4.55% State Income Tax Rate.',
    faqs: [
      {
        q: 'Are Real-Money Home Poker Games Legal In Utah?',
        a: 'No. Utah Law Has No Social-Game Exception For Real-Money Wagering; Only Zero-Deposit Play-Credit Games With No Cash Value Are Permitted.',
      },
      {
        q: 'Where Is The Closest Legal Live Poker Room To Salt Lake City?',
        a: 'Peppermill Concert Hall / Rainbow & Montego Bay Casinos In West Wendover, Nevada (About 1.5 Hours West On I-80) Provide The Closest Legal Live Poker To Salt Lake City.',
      },
    ],
  },
  {
    slug: 'hawaii',
    code: 'HI',
    name: 'Hawaii',
    title: 'Hawaii Poker Laws: Legality, No Casinos, Taxes & Play-Credit Guide (2026)',
    h1: 'Hawaii Poker Laws Guide: State Restrictions, Taxes & Free Online Options',
    legalStatus: 'No Casinos Or Commercial Poker Rooms; Free Play-Credit Only',
    minAge: '18+ For Free Play-Credit Platforms (21+ When Traveling To Las Vegas)',
    stateIncomeTaxRate: '1.4% To 11.0% State Income Tax',
    topCities: ['Honolulu', 'Maui', 'Hilo', 'Kailua-Kona'],
    rakeModel: 'No Commercial Live Poker Permitted In-State',
    onlineRealMoneyStatus: 'Prohibited (Free Play-Credit Platforms Like Smarter.Poker Only)',
    summary:
      'Hawaii Prohibits All Commercial Casinos, Lotteries, And Real-Money Cardrooms Under HRS Chapter 712, With Local Players Using Free Play-Credit Training And Club Platforms Between Trips To Las Vegas.',
    regulatoryOverview:
      'Under Hawaii Revised Statutes Chapter 712 Part III, All Commercial Gambling And Raked Card Games Are Illegal, With Narrow Social-Gambling Rules Requiring Equal Terms And Zero House Profit.',
    taxWithholdingNotes:
      'Hawaii Residents Must Report Out-Of-State Las Vegas And Tournament Poker Winnings On Hawaii State Returns At Progressive Rates Up To 11.0%.',
    faqs: [
      {
        q: 'Are There Any Legal Casinos Or Poker Rooms In Hawaii?',
        a: 'No. Hawaii Is One Of Only Two US States (Along With Utah) With Zero Commercial Casinos, Tribal Casinos, Or State Lotteries.',
      },
      {
        q: 'Can Hawaii Players Use Smarter.Poker?',
        a: 'Yes. Smarter.Poker Offers 100% Free-To-Play Poker Training, 52 Calculators, And Play-Credit Clubs With Zero Real-Money Gambling.',
      },
    ],
  },
  {
    slug: 'alaska',
    code: 'AK',
    name: 'Alaska',
    title: 'Alaska Poker Laws: 0% State Tax, Social Games & Charitable Rules (2026)',
    h1: 'Alaska Poker Laws Guide: 0% State Income Tax, Home Games & Legality',
    legalStatus: 'No Commercial Casinos; Non-Raked Social Home Games Permitted',
    minAge: '18+ For Free & Social Play (21+ At Out-Of-State Casinos)',
    stateIncomeTaxRate: '0.0% (Zero State Income Tax)',
    topCities: ['Anchorage', 'Fairbanks', 'Juneau'],
    rakeModel: 'Zero House Rake Allowed Under Alaska Social Gambling Law',
    onlineRealMoneyStatus: 'Social & Club Play Only',
    summary:
      'Alaska Permits Private Non-Raked Social Home Poker Games Under AS 11.66.280 And Charges 0% State Income Tax On Poker Winnings, Making It A Tax-Free Base For Traveling Tournament Players.',
    regulatoryOverview:
      'Commercial Casinos Are Prohibited In Alaska, While Bona Fide Social Games With Zero House Rake Or Seat Fees Are Expressly Permitted Under Alaska Statutes 11.66.280.',
    taxWithholdingNotes:
      'Alaska Levies Zero State Personal Income Tax On Out-Of-State Casino And WSOP Tournament Winnings.',
    faqs: [
      {
        q: 'Are Home Poker Games Legal In Alaska?',
        a: 'Yes. Under Alaska Statute 11.66.280, Private Social Poker Games Among Players Where No Host Or House Takes A Rake Or Cut Are Legal.',
      },
      {
        q: 'Does Alaska Tax Poker Tournament Winnings?',
        a: 'No. Alaska Has A 0% State Individual Income Tax Rate.',
      },
    ],
  },
  {
    slug: 'district-of-columbia',
    code: 'DC',
    name: 'Washington, D.C.',
    title: 'Washington, D.C. Poker Laws: MGM National Harbor, Live! MD & Taxes (2026)',
    h1: 'Washington, D.C. Poker Guide: Laws, Taxes & Closest DMV Poker Rooms',
    legalStatus: 'No In-District Casino Poker Rooms; Minutes From MGM National Harbor (MD)',
    minAge: '21+ At Neighboring MD & WV Casino Poker Rooms',
    stateIncomeTaxRate: '4.0% To 10.75% DC Income Tax',
    topCities: ['Washington, D.C.', 'National Harbor (MD Border)', 'Hanover (MD)', 'Charles Town (WV)'],
    rakeModel: 'Neighboring MGM National Harbor & Live! Maryland Run 10% Up To $5-$6 Cap',
    onlineRealMoneyStatus: 'Social & Club Play Only (Sports Betting Only In-District)',
    summary:
      'While Washington, D.C. Does Not Host A Brick-And-Mortar Casino Within District Borders, Players Are Just 15 Minutes Across The Potomac From MGM National Harbor (46 Tables) And 35 Minutes From Live! Casino Maryland (50+ Tables).',
    regulatoryOverview:
      'Gaming Inside The District Is Regulated By The DC Office Of Lottery And Gaming (OLG), Covering Lottery, Sports Betting, And Charitable Raffles, Without Commercial Casino Table Games.',
    taxWithholdingNotes:
      'Washington, D.C. Residents Report Out-Of-State Maryland, Virginia, And Nevada Poker Winnings On Their DC D-40 Return At Rates Up To 10.75%.',
    faqs: [
      {
        q: 'What Is The Closest Legal Live Poker Room To Washington, D.C.?',
        a: 'MGM National Harbor In Oxon Hill, Maryland (15 Minutes South Of Capitol Hill) Operates A Flagship 46-Table Poker Room, Followed By Live! Casino & Hotel Maryland Near BWI Airport.',
      },
      {
        q: 'Can DC Residents Play Real-Money Online Poker?',
        a: 'No. Washington, D.C. Regulates Sports Betting Only; Real-Money Online Poker Is Not Regulated Inside The District.',
      },
    ],
  },
];
