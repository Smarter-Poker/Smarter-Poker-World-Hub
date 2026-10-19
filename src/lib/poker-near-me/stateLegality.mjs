/**
 * STATE POKER LEGALITY & REGULATORY KERNEL (Phase 5 of 6)
 *
 * Provides authoritative, jurisdiction-specific legal frameworks for poker
 * across US states. Maps statutory definitions, social club exceptions,
 * commercial/tribal casino statutes, and online poker regulatory status.
 *
 * All questions and answers adhere strictly to Title Case and no em dashes.
 */

export const STATE_POKER_LEGALITY = Object.freeze({
  NV: {
    status: 'Fully Legal And Regulated',
    summary: 'Nevada Permits Both Commercial Land-Based Poker Rooms In Licensed Resort Casinos And Regulated State-Licensed Real-Money Online Poker Under The Nevada Gaming Control Board.',
    statutes: 'Nevada Revised Statutes Chapter 463 (NRS 463)',
    commercialRooms: true,
    socialHomeGames: 'Legal If No Rake, Fee Or Direct Economic Benefit Is Taken By The Host',
    onlinePokerRegulated: true,
    keyTakeaway: 'Nevada Is The Premier Global Hub For Live Poker, Hosting Thousands Of Daily Tables And Major Tournaments Like The World Series Of Poker Under Strict State Regulation.',
  },
  TX: {
    status: 'Legal Under Private Social Club Model',
    summary: 'In Texas, Live Poker Operates In Private Social Clubs That Comply With Texas Penal Code Section 47.04 (Gambling In Private Place With No Economic Benefit Taken From The Wagering).',
    statutes: 'Texas Penal Code Chapter 47 (Section 47.04)',
    commercialRooms: false,
    socialHomeGames: 'Legal Provided The Game Is Held In A Private Place With Equal Odds And Zero Rake',
    onlinePokerRegulated: false,
    keyTakeaway: 'Texas Card Clubs Do Not Take A Rake From Pots. Instead, They Charge Players Daily, Monthly Or Annual Memberships Plus Hourly Table Seat Access Fees.',
  },
  CA: {
    status: 'Legal In Licensed Cardrooms And Tribal Casinos',
    summary: 'California Legalizes Poker In Licensed Commercial Cardrooms (California Gambling Control Commission) And Tribal Casinos Under Federal IGRA Compacts.',
    statutes: 'California Business And Professions Code (Gambling Control Act, Section 19800+)',
    commercialRooms: true,
    socialHomeGames: 'Legal In Private Residences Without Table Fees, House Rake Or Collection Drops',
    onlinePokerRegulated: false,
    keyTakeaway: 'California Cardrooms Collect A Fixed Per-Hand Table Fee Or Drop Rather Than A Percentage Pot Rake, As The House May Never Act As A Bank Or Profit Directly From The Pot.',
  },
  FL: {
    status: 'Legal In Licensed Pari-Mutuel Cardrooms And Tribal Casinos',
    summary: 'Florida Permits Live Poker At Licensed Pari-Mutuel Facilities (Racetracks And Jai-Alai Frontons) Regulated By The Florida Gaming Control Commission, As Well As Tribal Casinos.',
    statutes: 'Florida Statutes Section 849.086',
    commercialRooms: true,
    socialHomeGames: 'Legal Penny-Ante Poker Games With Pot Limits Up To $10 Per Hand Are Permitted In Private Residences',
    onlinePokerRegulated: false,
    keyTakeaway: 'Florida Cardrooms Spread Comprehensive Cash Games And Daily Tournaments In Designated Commercial Pari-Mutuel Cardrooms And Seminole Tribal Casinos.',
  },
  NJ: {
    status: 'Fully Legal And Regulated',
    summary: 'New Jersey Regulates Both Brick-And-Mortar Casino Poker Rooms In Atlantic City And Multi-Operator Regulated Online Poker Under The Division Of Gaming Enforcement (DGE).',
    statutes: 'New Jersey Casino Control Act (N.J.S.A. 5:12-1 et seq.)',
    commercialRooms: true,
    socialHomeGames: 'Legal Social Games Without Rake Or Commercial Consideration Are Allowed',
    onlinePokerRegulated: true,
    keyTakeaway: 'New Jersey Participates In The Multi-State Internet Gaming Agreement (MSIGA), Enabling Shared Online Poker Player Pools With Nevada, Michigan, And Delaware.',
  },
  PA: {
    status: 'Fully Legal And Regulated',
    summary: 'Pennsylvania Authorizes Live Poker In Licensed Category 1, 2, 3, And 4 Casinos As Well As Regulated Ring-Fenced Online Poker Under The Pennsylvania Gaming Control Board (PGCB).',
    statutes: 'Pennsylvania Race Horse Development And Gaming Act (Title 4 Pa.C.S.)',
    commercialRooms: true,
    socialHomeGames: 'Legal Social Games Where No Player Or Host Profits From Operating The Game',
    onlinePokerRegulated: true,
    keyTakeaway: 'Pennsylvania Boasts Several Of The Largest Poker Rooms In The Mid-Atlantic Region, Hosting Major Daily Tournaments And High-Limit Cash Games.',
  },
  MI: {
    status: 'Fully Legal And Regulated',
    summary: 'Michigan Authorizes Commercial And Tribal Casino Poker Rooms And Regulated Online Poker Under The Michigan Gaming Control Board (MGCB), With Shared Liquidity In MSIGA.',
    statutes: 'Michigan Lawful Internet Gaming Act (Public Act 152 Of 2019)',
    commercialRooms: true,
    socialHomeGames: 'Legal In Private Residences Provided No House Fee Or Rake Is Assessed',
    onlinePokerRegulated: true,
    keyTakeaway: 'Michigan Offers Extensive Live Poker At Commercial Venues In Detroit And Tribal Cardrooms Across The State, Plus Regulated Interstate Online Poker.',
  },
  WA: {
    status: 'Legal In Licensed House-Banked Cardrooms And Tribal Casinos',
    summary: 'Washington State Authorizes Poker In Licensed Commercial House-Banked Cardrooms Regulated By The Washington State Gambling Commission (WSGC) And Tribal Casinos.',
    statutes: 'Revised Code Of Washington (RCW 9.46)',
    commercialRooms: true,
    socialHomeGames: 'Legal Social Card Games Are Permitted Provided No Commercial Fee Is Charged',
    onlinePokerRegulated: false,
    keyTakeaway: 'Washington Features Dozens Of Active Commercial Cardrooms Spreading Spread-Limit Hold\'em, Omaha, And Tournament Series Throughout The Puget Sound Region.',
  },
  OH: {
    status: 'Legal In Licensed Commercial Casinos',
    summary: 'Ohio Authorizes Commercial Casino Poker Rooms In Cincinnati, Columbus, Cleveland, And Toledo Under The Jurisdiction Of The Ohio Casino Control Commission.',
    statutes: 'Ohio Revised Code Chapter 3772',
    commercialRooms: true,
    socialHomeGames: 'Legal In Private Dwellings When All Wagered Funds Return To Participants Without Operator Profit',
    onlinePokerRegulated: false,
    keyTakeaway: 'Ohio Has Major 30+ Table Casino Poker Rooms With Daily Guaranteed Tournaments, High-Stakes Cash Games, And Comps.',
  },
  AZ: {
    status: 'Legal In Tribal Casinos',
    summary: 'Arizona Regulates Poker Exclusively Inside Licensed Tribal Casinos Operating Under State-Tribal Compacts Overseen By The Arizona Department Of Gaming.',
    statutes: 'Arizona Revised Statutes Title 5, Chapter 6',
    commercialRooms: true,
    socialHomeGames: 'Social Gambling Is Excluded From Prohibited Gambling If No One Benefits Aside From Winnings',
    onlinePokerRegulated: false,
    keyTakeaway: 'Major Tribal Venues In Phoenix And Scottsdale Host Extensive 24/7 Poker Rooms With Daily Tournaments And Deepstack Action.',
  },
  MD: {
    status: 'Legal In Commercial Resort Casinos',
    summary: 'Maryland Legalizes Poker In Licensed Commercial Resort Casinos Regulated By The Maryland Lottery And Gaming Control Agency.',
    statutes: 'Maryland Criminal Law Code Section 12-101 et seq.',
    commercialRooms: true,
    socialHomeGames: 'Home Games Are Permitted Under Bounded Social Limits Without Operator Fees',
    onlinePokerRegulated: false,
    keyTakeaway: 'Maryland Hosts Elite Mid-Atlantic Poker Venues Including Massive Rooms With High Roller Series And Daily Tournaments In The Baltimore-Washington Corridor.',
  },
  CO: {
    status: 'Legal In Mountain Casino Towns',
    summary: 'Colorado Authorizes Commercial Casino Poker In Three Historic Mountain Towns (Black Hawk, Central City, And Cripple Creek) Under The Colorado Division Of Gaming.',
    statutes: 'Colorado Revised Statutes Title 44, Article 30',
    commercialRooms: true,
    socialHomeGames: 'Social Gambling With Equal Terms And No House Cut Is Legal In Private Residences',
    onlinePokerRegulated: false,
    keyTakeaway: 'Amendment 77 Removed Betting Limits In Colorado, Allowing Full No-Limit Hold\'em And Pot-Limit Omaha Deepstack Cash Games In Black Hawk.',
  },
  OK: {
    status: 'Legal In Tribal Casinos',
    summary: 'Oklahoma Features Dozens Of Tribal Casino Poker Rooms Operating Under Model Tribal Gaming Compacts Regulated By Sovereign Nations And The State.',
    statutes: 'Oklahoma Statutes Title 3A',
    commercialRooms: true,
    socialHomeGames: 'Strict Anti-Gambling Statutes Prohibit Unregulated Games, But Private Social Games Without Profit Are Widely Practiced',
    onlinePokerRegulated: false,
    keyTakeaway: 'Oklahoma Is Home To Some Of The Largest Poker Rooms In The World, Spreading Hundreds Of Tables Near The Texas Border And In Major Metro Areas.',
  },
  IL: {
    status: 'Legal In Commercial Riverboat/Land Casinos And Charity Poker',
    summary: 'Illinois Authorizes Commercial Casino Poker Rooms Under The Illinois Gaming Board (IGB) And Regulated Charitable Poker Events Under The Charitable Games Act.',
    statutes: 'Illinois Gambling Act (230 ILCS 10/) And Charitable Games Act',
    commercialRooms: true,
    socialHomeGames: 'Social Gambling Where No House Fee Is Deducted Is Not Typically Targeted Under State Enforcement',
    onlinePokerRegulated: false,
    keyTakeaway: 'Illinois Offers Both Commercial Casino Poker In The Chicago Area And Popular Traveling Charity Poker Festivals Across The State.',
  },
  IN: {
    status: 'Legal In Licensed Casinos And Racinos',
    summary: 'Indiana Authorizes Poker At Licensed Commercial Casinos, Racinos, And Riverboats Regulated By The Indiana Gaming Commission.',
    statutes: 'Indiana Code Title 4, Article 33',
    commercialRooms: true,
    socialHomeGames: 'Social Gambling Permitted When Performed Outside Commercial Operation',
    onlinePokerRegulated: false,
    keyTakeaway: 'Indiana Cardrooms Spread Extensive No-Limit Hold\'em And Mixed Games Near Indianapolis, Cincinnati, And Chicago.',
  },
  NY: {
    status: 'Legal In Commercial And Tribal Casinos',
    summary: 'New York Authorizes Live Poker In Upstate Commercial Casinos Regulated By The New York State Gaming Commission And Sovereign Tribal Casinos.',
    statutes: 'New York Penal Law Article 225 And Racing, Pari-Mutuel Wagering And Breeding Law',
    commercialRooms: true,
    socialHomeGames: 'Social Home Games Are Protected Provided The Host Does Not Charge A Fee Or Profit From The Game',
    onlinePokerRegulated: false,
    keyTakeaway: 'New York Players Access Full-Scale Live Poker Rooms In Upstate Commercial Casinos And Western New York Tribal Resorts.',
  },
  NC: {
    status: 'Legal In Tribal Casinos',
    summary: 'North Carolina Permits Casino Poker Exclusively Within Sovereign Tribal Casinos Operating Under State Compacts In The Western Mountains.',
    statutes: 'North Carolina General Statutes Chapter 14, Article 37',
    commercialRooms: true,
    socialHomeGames: 'Gambling For Value Is Strictly Constrained Under General Statutes, But Private Recreational Play With No Rake Occurs',
    onlinePokerRegulated: false,
    keyTakeaway: 'Harrah\'s Cherokee Hosts A World Class WSOP Circuit Stop And Major Multi-Table Tournaments In Western North Carolina.',
  },
  MO: {
    status: 'Legal In Licensed Excursion And Land Casinos',
    summary: 'Missouri Authorizes Live Poker In Licensed Commercial Casinos Regulated By The Missouri Gaming Commission.',
    statutes: 'Missouri Revised Statutes Chapter 313',
    commercialRooms: true,
    socialHomeGames: 'Social Gambling With No Professional Bookmaking Or House Deduction Is Permitted',
    onlinePokerRegulated: false,
    keyTakeaway: 'Missouri Cardrooms In St. Louis And Kansas City Feature Daily Cash Games, Deepstack Tournaments, And Regional Series.',
  },
  LA: {
    status: 'Legal In Commercial Casinos, Racinos And Riverboats',
    summary: 'Louisiana Regulates Casino Poker In Commercial Riverboat Casinos, Racinos, And Land-Based Casinos Under The Louisiana Gaming Control Board.',
    statutes: 'Louisiana Revised Statutes Title 27',
    commercialRooms: true,
    socialHomeGames: 'Strict Anti-Gambling Definitions Apply, But Private Social Games Without Operator Fees Are Common',
    onlinePokerRegulated: false,
    keyTakeaway: 'Louisiana Provides Extensive Poker Across New Orleans, Baton Rouge, Shreveport, And Lake Charles.',
  },
  OR: {
    status: 'Legal In Social Gaming Clubs And Tribal Casinos',
    summary: 'Oregon Permits Poker In Tribal Casinos And Municipal-Authorized Social Gaming Clubs Where The House Collects Daily Door Fees Or Seat Rentals With Zero Pot Rake.',
    statutes: 'Oregon Revised Statutes Chapter 167 (Section 167.117 et seq.)',
    commercialRooms: true,
    socialHomeGames: 'Permitted In Private Homes Provided No House Profit Or Economic Benefit Occurs',
    onlinePokerRegulated: false,
    keyTakeaway: 'Portland And Surrounding Oregon Cities Feature A Unique Social Poker Club Ecosystem Offering Rake-Free Cash Games And Tournament Action.',
  },
});

/**
 * Returns legal framework data for a state code, or a safe fallback.
 */
export function getStatePokerLegality(stateCode) {
  const code = String(stateCode || '').trim().toUpperCase();
  if (STATE_POKER_LEGALITY[code]) {
    return STATE_POKER_LEGALITY[code];
  }
  return {
    status: 'Subject To State Penal Codes And Social Gaming Statutes',
    summary: `Poker In This Jurisdiction Is Governed By State Gaming Statutes, Tribal Compacts, And Private Social Gaming Provisions.`,
    statutes: 'State Penal And Gaming Codes',
    commercialRooms: false,
    socialHomeGames: 'Recreational Social Home Games Are Generally Legal In Most US States Provided No Host Rake Or Table Fee Is Collected',
    onlinePokerRegulated: false,
    keyTakeaway: 'Always Verify State Regulations And Venue Licensing Status Before Playing Live Or Online Poker.',
  };
}
