/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INTERNATIONAL & GLOBAL LIVE POKER DESTINATION GUIDES CORPUS
 *  (src/content/guides/internationalMarkets.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /poker-rooms/international and
 * /poker-rooms/international/[slug].
 * Covers 10 premier international poker destinations with top cardrooms,
 * local currency & typical cash game stakes, rake caps, major tournament
 * series (EPT, Triton, WSOP Europe, WSOP Paradise, WPT Prime), visitor
 * gaming tax laws, travel logistics, and FAQs.
 *
 * House style: Title Case, zero em dashes.
 */

export const INTERNATIONAL_GUIDES_AS_OF = '2026-11-24';
export const INTERNATIONAL_BASE_PATH = '/poker-rooms/international';
export const INTERNATIONAL_URL = 'https://smarter.poker/poker-rooms/international';

export function internationalGuidePath(slug) {
  return `/poker-rooms/international/${slug}`;
}

export const INTERNATIONAL_REGIONS = [
  'Europe',
  'Asia-Pacific',
  'Americas & Caribbean',
];

const INTERNATIONAL_SLUG_ALIASES = {
  'london': 'london-united-kingdom',
  'uk': 'london-united-kingdom',
  'barcelona': 'barcelona-spain',
  'spain': 'barcelona-spain',
  'rozvadov': 'rozvadov-czech-republic',
  'kings-resort': 'rozvadov-czech-republic',
  'monte-carlo': 'monte-carlo-monaco',
  'monaco': 'monte-carlo-monaco',
  'prague': 'prague-czech-republic',
  'manila': 'manila-philippines',
  'philippines': 'manila-philippines',
  'macau': 'macau-china',
  'macao': 'macau-china',
  'melbourne': 'melbourne-australia',
  'australia': 'melbourne-australia',
  'montreal': 'montreal-canada',
  'playground': 'montreal-canada',
  'nassau': 'nassau-bahamas',
  'bahamas': 'nassau-bahamas',
};

export const INTERNATIONAL_POKER_GUIDES = [
  {
    slug: 'london-united-kingdom',
    city: 'London',
    country: 'United Kingdom',
    region: 'Europe',
    currency: 'GBP (£) British Pound Sterling',
    title: 'London UK Live Poker Rooms And Cash Guide',
    h1: 'London, United Kingdom Live Poker Room Guide: Hippodrome, The Vic & Empire',
    typicalStakes: '£1/£2 & £1/£3 NLH (£200 - £500), £2/£5 NLH (£500 - £1,500), £5/£10+ NLH & PLO',
    rakeCap: '5% Pot Drop Capped At £10 - £12 (£1/£2 - £2/£5) Or Timed Seat Charge At £5/£10+',
    flagshipSeries: 'EPT London, UKIPT London, Grosvenor GUKPT Grand Final, And WPT Prime UK',
    visitorTaxRule: '0% UK Gambling Tax On Recreational Poker Winnings For UK Residents And Visiting Tourists (Subject To Home-Country Residency Rules)',
    summary:
      'London Is Europe\'s Deepest Year-Round Urban Cash Game Capital, Anchored By The Grosvenor Victoria ("The Vic") On Edgware Road And The West End\'s Leicester Square Duo (The Hippodrome Casino And Empire Casino). Offering 5% Rake Percentages And 24/7 No-Limit Hold\'em Plus 4-Card/5-Card PLO, London Combines Classic Private-Club Heritage With International High-Roller Action.',
    topPokerRooms: [
      {
        name: 'The Poker Room At Grosvenor Victoria Casino ("The Vic")',
        neighborhood: 'Paddington / Edgware Road, London W2',
        highlights: 'Historic Flagship Of British Poker, Deep £2/£5 And £5/£10 Cash Games, Heavy 4-Card & 5-Card PLO, And GUKPT Championships',
      },
      {
        name: 'PokerStars Live At The Hippodrome Casino',
        neighborhood: 'Leicester Square, West End, London WC2',
        highlights: 'Central West End Flagship Hosting UKIPT Series, High-Traffic £1/£2 And £2/£5 Cash Tables, And Tourist-Heavy Weekend Lineups',
      },
      {
        name: 'Empire Casino Poker Room & Aspers Westfield Stratford',
        neighborhood: 'Leicester Square WC2 & Stratford E20',
        highlights: '24/7 Low-To-Mid Stakes £1/£2 Cash Games, Deepstack Daily Tournaments, And Late-Night Recreational Foot Traffic',
      },
    ],
    travelAndStrategyTips: [
      'Bring A Valid Physical Passport Or Government Photo ID On Your First Visit: UK Gaming Commission Rules Require Quick Door Registration At London Casinos.',
      'Adjust To 5% Rake With Higher Caps (£10 To £12 Cap): Unlike US 10% $5 Cap Rooms, London\'s 5% Structure Rakes Small Pots Much Less (A £60 Pot Pays Only £3 Rake) While Raking 200BB Pots Higher.',
      'Watch For Deep-Stack Match-The-Stack And Straddle Games At The Vic After 8:00 PM Where £2/£5 Frequently Plays Like £5/£10.',
    ],
    faqs: [
      {
        q: 'Do Visiting Players Pay UK Income Tax On Cash Game Or Tournament Winnings In London?',
        a: 'No. Under United Kingdom Tax Law (HM Revenue & Customs), Gambling And Poker Winnings Are Not Taxed At The Casino Cage For Either UK Residents Or Visiting Foreign Players, Though US Citizens Must Still Report Global Income On Their US Return.',
      },
      {
        q: 'How Does London\'s 5% Up To £10-£12 Rake Compare To US 10% Up To $6 Rake?',
        a: 'In Small And Medium Pots Under £120, London\'s 5% Rate Takes Significantly Less Rake Than A US 10% Room. You Only Hit The £10-£12 Cap When The Total Pot Exceeds £200 To £240.',
      },
      {
        q: 'Which London Poker Room Is Best For Pot-Limit Omaha (PLO)?',
        a: 'The Grosvenor Victoria ("The Vic") On Edgware Road Is The Undisputed Home Of London PLO, Spreading Daily £1/£2, £2/£5, And £5/£10+ 4-Card And 5-Card Omaha Games.',
      },
    ],
  },
  {
    slug: 'barcelona-spain',
    city: 'Barcelona',
    country: 'Spain',
    region: 'Europe',
    currency: 'EUR (€) Euro',
    title: 'Barcelona Spain Live Poker And EPT Guide',
    h1: 'Barcelona, Spain Live Poker Room & EPT Strategy Guide: Casino Barcelona',
    typicalStakes: '€1/€3 & €2/€5 NLH (€200 - €1,000), €5/€10 - €25/€50 NLH & PLO During EPT',
    rakeCap: '4% - 5% Pot Drop Capped At €10 - €15 (Tiered By Stake Level)',
    flagshipSeries: 'European Poker Tour (EPT) Barcelona, Estrellas Poker Tour (ESPT), And CEP Spain',
    visitorTaxRule: 'EU/EEA Residents Offset Annual Gambling Losses Against Wins; Non-EU Visitors Verify Cage Treaty Documentation During Major Series',
    summary:
      'Set Directly On The Mediterranean Waterfront At Port Olimpic, Casino Barcelona Hosts The Most Popular Stop On The European Poker Tour (EPT) Every August/September Alongside Year-Round Daily Cash Games. During EPT Barcelona, Over 60 Cash Tables Run Non-Stop From €2/€5 Up To €50/€100 No-Limit Hold\'em And Pot-Limit Omaha.',
    topPokerRooms: [
      {
        name: 'Casino Barcelona (Port Olimpic Waterfront)',
        neighborhood: 'Marina / Port Olimpic, Barcelona',
        highlights: 'Home Of Record-Breaking EPT & Estrellas Main Events, Beachfront Location Below Hotel Arts, And Deep European Cash Action',
      },
    ],
    travelAndStrategyTips: [
      'Register For Cash Game Waitlists Online Or Arrive Early Afternoon During EPT August Weeks When Waitlists For €2/€5 And €5/€10 Exceed 150 Players.',
      'Mandatory Physical Passport Check At The Door: Spain Enforces Strict Entry Verification For All Foreign Nationals Entering Casino Barcelona.',
      'Target Late-Night Mediterranean Tourist And Satellite-Qualifier Tables During Festival Weeks Where Multiway VPIP Exceeds 45%.',
    ],
    faqs: [
      {
        q: 'When Does EPT Barcelona Take Place Each Year?',
        a: 'European Poker Tour (EPT) Barcelona Traditionally Runs For Two Weeks In Late August And Early September At Casino Barcelona, Drawing Over 2,000 Main Event Entries And 7,000+ Estrellas Entries.',
      },
      {
        q: 'What Is The Dress Code And ID Requirement At Casino Barcelona?',
        a: 'Smart Casual Attire Is Required (Closed Footwear; No Beach Flip-Flops Or Swimwear), And Every Foreign Visitor Must Present A Valid Physical Passport At The Reception Desk.',
      },
      {
        q: 'What Cash Game Stakes Run Year-Round At Casino Barcelona Outside EPT?',
        a: 'Outside Festival Weeks, Casino Barcelona Spreads Daily €1/€3, €2/€5, And €5/€10 No-Limit Hold\'em Plus €2/€2 And €5/€5 Pot-Limit Omaha Opening Mid-Afternoon Through 4:00 AM.',
      },
    ],
  },
  {
    slug: 'rozvadov-czech-republic',
    city: 'Rozvadov',
    country: 'Czech Republic',
    region: 'Europe',
    currency: 'EUR (€) Euro (All Tables Dealt In Euros)',
    title: 'King\'s Resort Rozvadov Poker Room Guide',
    h1: 'Rozvadov, Czech Republic (King\'s Resort) Poker Guide: WSOP Europe & Cash Games',
    typicalStakes: '€1/€3 & €2/€5 NLH, €2/€2 & €5/€5 PLO, Up To €50/€100+ High-Stakes VIP Action',
    rakeCap: '5% Pot Drop Capped At €10 - €20 (Depending On Stake & Game Type)',
    flagshipSeries: 'WSOP Europe (WSOPE), WSOP Circuit Rozvadov, German Poker Days, And Euro Poker Million',
    visitorTaxRule: '0% Czech Casino Cage Withholding On Live Poker Tournament & Cash Game Payouts Under Standard EU/Bilateral Rules',
    summary:
      'Located Just Five Minutes Across The German-Czech Border In Bohemia, King\'s Resort Rozvadov Is One Of Europe\'s Largest Dedicated 24/7 Poker Arenas. Operating Entirely In Euros (€) And Hosting World Series Of Poker Europe (WSOPE), Rozvadov Is Purpose-Built Around Non-Stop Festival Guarantees And Round-The-Clock Cash Games.',
    topPokerRooms: [
      {
        name: 'King\'s Resort Rozvadov Poker Arena',
        neighborhood: 'Rozvadov (Czech-German Border Off Autobahn A6 / D5)',
        highlights: 'Home Of WSOP Europe Bracelet Events, 24/7 €1/€3 To €50/€100 Cash Games, On-Site 5-Star Hotel, And Massive PLO Action',
      },
    ],
    travelAndStrategyTips: [
      'Fly Into Munich (MUC), Nuremberg (NUE), Or Prague (PRG) And Take A Direct 90-To-120-Minute Rental Car Or King\'s Resort Shuttle Straight To The Venue.',
      'Even Though Rozvadov Is In The Czech Republic (Which Uses Czech Koruna Locally), 100% Of Poker Buy-Ins, Cash Chips, And Payouts At King\'s Resort Are Denominated In Euros (€).',
      'Prepare For Ultra-Aggressive 4-Card And 5-Card PLO Cash Games: Rozvadov Draws Recreationals And High-Rollers From Across Germany, Austria, And Switzerland.',
    ],
    faqs: [
      {
        q: 'What Currency Is Used At King\'s Resort Rozvadov Poker Tables?',
        a: 'Every Cash Game And Tournament At King\'s Resort Rozvadov Operates Exclusively In Euros (€), Making Bankroll Logistics Simple For European And International Travelers.',
      },
      {
        q: 'Which Airport Is Closest To King\'s Resort Rozvadov?',
        a: 'Nuremberg Airport (Germany) Is Roughly 1 Hour And 20 Minutes Away, While Prague Airport (PRG) And Munich Airport (MUC) Are Both Approximately 1 Hour And 45 Minutes Away By Highway.',
      },
      {
        q: 'When Does WSOP Europe (WSOPE) Run At King\'s Resort?',
        a: 'World Series Of Poker Europe (WSOPE) Typically Runs In Autumn (September Through November) At King\'s Resort, Awarding 15 Official Gold WSOP Bracelets And Over €15 Million In Guarantees.',
      },
    ],
  },
  {
    slug: 'monte-carlo-monaco',
    city: 'Monte Carlo',
    country: 'Monaco',
    region: 'Europe',
    currency: 'EUR (€) Euro',
    title: 'Monte Carlo Monaco Live Poker And EPT Guide',
    h1: 'Monte Carlo, Monaco Poker Guide: EPT Monte Carlo, Triton & Sporting Monte-Carlo',
    typicalStakes: '€2/€5 & €5/€10 NLH, €10/€25 - €100/€200+ High-Roller NLH & PLO During Festivals',
    rakeCap: '5% Pot Drop Capped At €15 - €25 Or Timed High-Stakes Collection',
    flagshipSeries: 'EPT Monte Carlo Grand Final And Triton Super High Roller Series Monte Carlo',
    visitorTaxRule: '0% Monaco Income Or Gambling Withholding Tax For Visiting Tournament & Cash Players (Verify Home-Country Tax Residency)',
    summary:
      'Monte Carlo Is The Crown Jewel Of European High-Stakes Tournament And VIP Cash Poker. Hosted Inside The Waterfront Salle Des Etoiles At Sporting Monte-Carlo And Casino Cafe De Paris, Monaco Welcomes The Spring EPT Monte Carlo Festival And Autumn Triton Super High Roller Series With Unmatched Mediterranean Luxury.',
    topPokerRooms: [
      {
        name: 'Sporting Monte-Carlo (Salle Des Etoiles)',
        neighborhood: 'Larvotto Peninsula, Monte Carlo, Monaco',
        highlights: 'Retractable-Roof Mediterranean Ballroom Hosting EPT Monte Carlo Main Event, €100K Super High Rollers, And VIP Cash Games',
      },
      {
        name: 'Casino De Monte-Carlo & Casino Cafe De Paris',
        neighborhood: 'Place Du Casino, Monte Carlo',
        highlights: 'World-Famous Belle Epoque Gaming Floors And High-Limit Private Salons',
      },
    ],
    travelAndStrategyTips: [
      'Fly Into Nice Cote D\'Azur Airport (NCE) In France, Located Just 30 Minutes By Car, Train, Or 7-Minute Helicopter Transfer From Monte Carlo.',
      'Book Accommodation In Neighboring Beausoleil (France) Or Menton Just Steps Across The Monaco Street Border To Save 40% To 60% On Hotel Costs During EPT.',
      'Expect Tougher High-Roller Tournament Fields Paired With Ultra-Wealthy Riviera Business VIPs In The €10/€25 And €25/€50 Cash Games.',
    ],
    faqs: [
      {
        q: 'Does Monaco Withhold Taxes On EPT Or Triton Poker Tournament Winnings?',
        a: 'No. The Principality Of Monaco Does Not Levy Income Tax Or Casino Cage Withholding On Poker Tournament Payouts, Making It One Of The Premier High-Roller Venues In The World.',
      },
      {
        q: 'Are Daily Low-Stakes Cash Games Spread Year-Round In Monte Carlo?',
        a: 'Live Poker In Monaco Is Primarily Festival-Driven Around EPT Monte Carlo (April/May) And High-Roller Series; For Year-Round Daily €2/€5 Cash Games Nearby, Players Often Visit French Riviera Casinos In Nice And Cannes.',
      },
      {
        q: 'How Do Players Travel From Nice Airport To Monte Carlo?',
        a: 'Nice Airport (NCE) Connects To Monaco Via A 30-Minute Taxi/Uber, A Direct Regional Train To Monaco-Monte-Carlo Station, Or A 7-Minute Monacair Helicopter Flight.',
      },
    ],
  },
  {
    slug: 'prague-czech-republic',
    city: 'Prague',
    country: 'Czech Republic',
    region: 'Europe',
    currency: 'EUR (€) & CZK (Czech Koruna / Euros Accepted At Major Rooms)',
    title: 'Prague Czech Republic Live Poker And EPT Guide',
    h1: 'Prague, Czech Republic Live Poker Guide: Hilton King\'s Prague, Showdown & EPT',
    typicalStakes: '€1/€2 - €2/€5 NLH (Or 25/50 - 50/100 CZK), €5/€10+ NLH & PLO During EPT Prague',
    rakeCap: '5% Pot Drop Capped At €10 - €15 (100 - 300 CZK At Local Rooms)',
    flagshipSeries: 'European Poker Tour (EPT) Prague, Eureka Poker Tour, And Czech Poker Masters',
    visitorTaxRule: '0% Czech Cage Withholding For Visiting International Players Under Standard EU/Treaty Rules',
    summary:
      'Every December, Prague Transforms Into The Winter Capital Of World Poker When EPT Prague And The Eureka Poker Tour Take Over The Hilton Prague Hotel. Year-Round, King\'s Casino Prague (Inside The Hilton) And Wenceslas Square Cardrooms Offer Daily Cash Games And Affordable Central European Travel Logistics.',
    topPokerRooms: [
      {
        name: 'King\'s Casino Prague (At Hilton Prague Hotel)',
        neighborhood: 'Karlin / Florenc, Prague 8',
        highlights: 'Official Host Venue Of EPT Prague & Eureka Poker Tour, Euro-Denominated Cash Games, And Luxury Hotel Integration',
      },
      {
        name: 'Rebuy Stars Casino Savarin & Showdown Poker Club',
        neighborhood: 'Wenceslas Square / New Town, Prague 1',
        highlights: 'Historic Central Prague Architecture, Nightly Low-To-Mid Stakes Cash Games, And High-Action Local Tournament Guarantees',
      },
    ],
    travelAndStrategyTips: [
      'Combine EPT Prague In December With Prague\'s World-Famous Christmas Markets, And Book The Hilton Prague Early Before Player Room Blocks Sell Out.',
      'Confirm Whether A Specific Local Room Deals In Euros (€) Or Czech Koruna (CZK): Roughly 25 CZK Equals €1, So A 50/100 CZK Cash Game Plays Like €2/€4.',
      'Target Afternoon And Evening PLO Tables At Hilton Prague During EPT Week When Scandinavian And German Players Arrive.',
    ],
    faqs: [
      {
        q: 'When Is EPT Prague Held Each Year?',
        a: 'European Poker Tour (EPT) Prague Takes Place Every December At The Hilton Prague Hotel, Serving As The Final Flagship European Championship Stop Of The Calendar Year.',
      },
      {
        q: 'What Does A 25/50 CZK Or 50/100 CZK Blind Structure Equal In Dollars Or Euros?',
        a: 'At Roughly 25 Czech Koruna (CZK) Per Euro, A 25/50 CZK Cash Game Equals €1/€2 And A 50/100 CZK Cash Game Equals €2/€4.',
      },
      {
        q: 'Do I Need My Passport To Enter Prague Casinos?',
        a: 'Yes. Czech Gaming Law Mandates ID Registration At The Casino Entrance On Every Visit; Always Carry Your Physical Passport Or EU National ID Card.',
      },
    ],
  },
  {
    slug: 'manila-philippines',
    city: 'Manila',
    country: 'Philippines',
    region: 'Asia-Pacific',
    currency: 'PHP (₱) Philippine Peso (Approx. ₱56 - ₱58 Per $1 USD)',
    title: 'Manila Philippines Live Poker Room Guide',
    h1: 'Manila, Philippines Live Poker Guide: Newport World Resorts, Okada & Metro Card Club',
    typicalStakes: '₱50/₱100 ($1/$2), ₱100/₱200 ($2/$4), ₱200/₱400+ ($4/$8+) NLH & PLO',
    rakeCap: '5% - 10% Pot Drop Capped At ₱300 - ₱600 ($5 - $10 USD Equivalent)',
    flagshipSeries: 'Asian Poker Tour (APT) Manila, APPT Manila, WPT Prime Philippines, And Okada Millions',
    visitorTaxRule: 'PAGCOR Regulated Integrated Resorts; Check Specific Tournament Series Withholding Terms Vs Cash Game Zero-Withholding',
    summary:
      'Manila\'s Entertainment City And Newport Boulevard Form Southeast Asia\'s Most Accessible English-Speaking Live Poker Hub. Anchored By Okada Manila, Newport World Resorts, Solaire, And The Legendary Metro Card Club, Manila Spreads 24/7 Cash Games From $1/$2 Equivalent Up To High-Stakes VIP Action Alongside Major APT And APPT Championships.',
    topPokerRooms: [
      {
        name: 'Okada Manila Poker Room (PokerStars Live / Entertainment City)',
        neighborhood: 'Entertainment City, Paranaque, Metro Manila',
        highlights: 'Ultra-Luxury Integrated Resort Hosting APPT Manila, Deep ₱100/₱200 And ₱200/₱400 Cash Games, And VIP Bayfront Suites',
      },
      {
        name: 'Newport World Resorts Poker Room & Masters Poker',
        neighborhood: 'Newport City (Directly Across From Manila NAIA Terminal 3)',
        highlights: 'Walkable From Airport Terminal 3 Via Runway Manila Skybridge, Hosting APT Events And Round-The-Clock Cash Games',
      },
      {
        name: 'Metro Card Club (Metrowalk Pasig)',
        neighborhood: 'Ortigas / Pasig City, Metro Manila',
        highlights: 'The Philippines\' Largest Dedicated Local Tournament And Cash Club With Massive Guaranteed Local Fields',
      },
    ],
    travelAndStrategyTips: [
      'Stay Inside Newport City Or Entertainment City (Paranaque) So You Can Walk Directly To The Poker Room Without Sitting In Metro Manila Rush-Hour Traffic.',
      'Convert Currency At Competitive Casino Or Bank Rates: ₱100/₱200 Philippine Pesos Plays Like $1.75/$3.50 USD With Deep 100BB-300BB Stacks.',
      'Expect Loose, Action-Heavy Preflop Play From Visiting East Asian Recreational Players And Disciplined Local Filipino Grinders.',
    ],
    faqs: [
      {
        q: 'How Do Philippine Peso (PHP) Poker Stakes Translate To US Dollars?',
        a: 'At Roughly ₱56 To ₱58 Per $1 USD, A ₱50/₱100 Game Equals ~$1/$2 USD, A ₱100/₱200 Game Equals ~$2/$4 USD, And A ₱300/₱600 Game Equals ~$5/$10 USD.',
      },
      {
        q: 'Which Manila Poker Room Is Closest To The International Airport (NAIA)?',
        a: 'Newport World Resorts Sits Directly Across From NAIA Terminal 3 And Is Connected By The Air-Conditioned Runway Manila Pedestrian Skybridge (A 10-Minute Walk From Baggage Claim).',
      },
      {
        q: 'Is English Spoken At All Manila Poker Tables?',
        a: 'Yes. English Is An Official Language Of The Philippines And Is The Universal Table Rule Language Across Okada Manila, Newport World Resorts, And Metro Card Club.',
      },
    ],
  },
  {
    slug: 'macau-china',
    city: 'Macau',
    country: 'China (SAR)',
    region: 'Asia-Pacific',
    currency: 'HKD ($) Hong Kong Dollar (Pegged ~7.80 HKD Per $1 USD)',
    title: 'Macau High-Stakes Live Poker Room Guide',
    h1: 'Macau Live Poker Guide: Wynn Macau, Venetian Cotai & HKD High-Stakes Cash Games',
    typicalStakes: '$50/$100 HKD ($6/$13 USD), $100/$200 HKD ($13/$25 USD), $300/$600+ HKD ($38/$77+ USD)',
    rakeCap: '5% Pot Drop Capped At $200 - $300 HKD (~$25 - $38 USD Cap)',
    flagshipSeries: 'Macau High-Stakes Cash Game Circuit & Regional Cotai Invitational Series',
    visitorTaxRule: '0% Macau Player Cage Tax On Cash Game & Casino Winnings (Casino Operators Pay Gross Gaming Revenue Tax Directly)',
    summary:
      'Macau Is The Historic High-Stakes Cash Game Capital Of Asia. Because Casino Floor Space In Macau Commands The Highest Revenue Per Square Foot In The World, Poker Tables In Macau Start At $50/$100 HKD (~$6/$13 USD) And Scale Up To $100/$200, $300/$600, And Nosebleed VIP Games At Wynn Macau And The Venetian Macao.',
    topPokerRooms: [
      {
        name: 'Wynn Macau & Wynn Palace Cotai Poker Rooms',
        neighborhood: 'Macau Peninsula & Cotai Strip',
        highlights: 'Asia\'s Flagship High-Stakes Cash Game Room Spreading $50/$100, $100/$200, And $300/$600+ HKD No-Limit Hold\'em',
      },
      {
        name: 'The Venetian Macao Poker Room',
        neighborhood: 'Cotai Strip, Macau',
        highlights: 'Central Cotai Strip Action Spreading $50/$100 And $100/$200 HKD Cash Games With Heavy Weekend Tourist Traffic',
      },
    ],
    travelAndStrategyTips: [
      'Bring Hong Kong Dollars (HKD): Even Though Macau\'s Local Currency Is The Pataca (MOP), 100% Of Macau Poker Tables Use Hong Kong Dollars (Pegged At 7.80 HKD = $1 USD).',
      'Prepare For Larger Minimum Stakes And Higher Rake Caps: The Smallest Standard Game In Macau ($50/$100 HKD) Is Equivalent To $6/$13 USD With A $25-$32 USD Rake Cap, Meaning Pots Regularly Exceed $3,000+ USD.',
      'Take The High-Speed Ferry Or Hong Kong-Zhuhai-Macau Bridge Bus Directly From Hong Kong International Airport (HKG) Into Macau In 45 Minutes.',
    ],
    faqs: [
      {
        q: 'Why Do Macau Poker Rooms Use Hong Kong Dollars (HKD) Instead Of Macau Patacas?',
        a: 'Hong Kong Dollars Are Freely Convertible And Pegged Directly To The US Dollar At ~7.80 HKD Per $1 USD, Making HKD The Standard Gaming Chip Currency Across All Major Macau Casino Floors.',
      },
      {
        q: 'Are There Any $1/$2 Or $1/$3 USD Equivalent Cash Games In Macau?',
        a: 'No. Because Macau Casino Table Licenses Are Strictly Capped, Poker Rooms Only Spread Mid-To-High Stakes Starting At $50/$100 HKD (Roughly $6.40/$12.80 USD) And $100/$200 HKD ($13/$25 USD).',
      },
      {
        q: 'Are Cash Game Winnings Taxed At The Cage In Macau?',
        a: 'No. Macau Levies Zero Withholding Or Gaming Tax On Players At The Casino Cage.',
      },
    ],
  },
  {
    slug: 'melbourne-australia',
    city: 'Melbourne',
    country: 'Australia',
    region: 'Asia-Pacific',
    currency: 'AUD ($) Australian Dollar',
    title: 'Melbourne Australia Live Poker Room Guide',
    h1: 'Melbourne, Australia Live Poker Guide: Crown Melbourne Cash Games, Rake & Tax Law',
    typicalStakes: '$2/$5 AUD, $5/$5 AUD, $5/$10 AUD, And $10/$25+ NLH & Pot-Limit Omaha',
    rakeCap: '10% Pot Drop Capped At $15 - $25 AUD Or Time Charge On High-Stakes Tables',
    flagshipSeries: 'Melbourne Poker Championship, Aussie Millions Heritage Events, And APL / WPT Australia Stops',
    visitorTaxRule: '0% Australian Gambling Tax: The Australian Taxation Office (ATO) Treats Recreational And Most Poker Winnings As Non-Taxable Windfalls',
    summary:
      'Melbourne Is Australia\'s Premier Southern Poker Hub, Centered Around The Massive Crown Melbourne Entertainment Complex On The Yarra River Southbank Alongside Victoria\'s Pub And Club Tournament Leagues. Famous For Producing Elite International Champions And Deep Pot-Limit Omaha Games, Melbourne Also Benefits From Australia\'s Zero-Tax Gambling Rules.',
    topPokerRooms: [
      {
        name: 'Crown Melbourne Poker Room (Southbank)',
        neighborhood: 'Southbank Promenade, Melbourne VIC 3006',
        highlights: 'One Of The Largest Permanent Casino Poker Floors In The Southern Hemisphere With Famous $5/$5 And $5/$10 PLO And NLH Action',
      },
    ],
    travelAndStrategyTips: [
      'Factor High Lower-Stakes Rake Into Your Game Selection: Because Australian Low-Stakes Cash Games Often Carry 10% Rake With Higher Caps + Time Charges, Moving Up To $5/$10 AUD Or Time-Raked Tables Significantly Improves Net Hourly Winrate.',
      'Melbourne Is A World-Class Pot-Limit Omaha Town: Expect Deep 4-Card PLO Games Where Players Straddle And Re-Pot Aggressively.',
      'Register For Your Crown Rewards Card With Passport ID Upon Arrival To Access Electronic Cash Game Waitlists And Regulated Session Tracking.',
    ],
    faqs: [
      {
        q: 'Are Poker Winnings Taxed In Australia For Residents Or Visitors?',
        a: 'No. Under Australian Taxation Office (ATO) Rulings, Gambling And Poker Winnings Are Classified As Tax-Free Windfalls From A Game Of Chance Impacted By Luck, With 0% Cage Withholding.',
      },
      {
        q: 'How Does High Rake At Australian Low Stakes Change Preflop Strategy?',
        a: 'When Playing In A 10% Up To $15-$20 AUD Cap Game, Avoid Limping Or Flat-Calling Speculative Hands Out Of Position. Play A Tight, Linear 3-Bet Or Fold Strategy To Win Unraked Pots Preflop Or Build Big Pots In Position.',
      },
      {
        q: 'Where Else Do Australians Play Major Tournament Series Besides Melbourne?',
        a: 'Along With Crown Melbourne, Major WPT Australia And APT Championships Frequently Run At The Star Gold Coast (Queensland) And The Star Sydney.',
      },
    ],
  },
  {
    slug: 'montreal-canada',
    city: 'Montreal',
    country: 'Canada',
    region: 'Americas & Caribbean',
    currency: 'CAD ($) Canadian Dollar (Approx. $1.36 - $1.39 CAD Per $1 USD)',
    title: 'Montreal Canada Live Poker Room Guide',
    h1: 'Montreal, Canada Live Poker Guide: Playground Poker Club & Casino De Montreal',
    typicalStakes: '$1/$2 & $1/$3 CAD, $2/$5 CAD ($1,000 Cap), $5/$10+ NLH & PLO',
    rakeCap: '10% Pot Drop Capped At $8 - $14 CAD (Includes Free Food & Drink Service At Playground)',
    flagshipSeries: 'WPT Montreal, WSOP Circuit Playground, And Million Dollar Superstack Events',
    visitorTaxRule: '0% Canadian Cage Withholding On Cash Game & Tournament Payouts; Canada Does Not Tax Recreational Gambling Windfalls',
    summary:
      'Located Just 20 Minutes South Of Downtown Montreal Across The Honore-Mercier Bridge In Kahnawake, Playground Poker Club Is North America\'s Most Celebrated Poker-First Destination Outside Las Vegas And Los Angeles. Paired With Casino De Montreal On Parc Jean-Drapeau, Greater Montreal Offers World-Class WPT/WSOPC Festivals, Complimentary Table Dining For Active Cash Players, And Favorable USD-To-CAD Exchange Rates.',
    topPokerRooms: [
      {
        name: 'Playground Poker Club (Kahnawake / Greater Montreal)',
        neighborhood: 'Route 138, Kahnawake, QC (15 Mins From Downtown Montreal)',
        highlights: 'Purpose-Built Poker Mecca Hosting WPT Montreal & WSOP Circuit, Complimentary Food & Beverages At Cash Tables, And Huge Bad Beat Jackpots',
      },
      {
        name: 'Casino De Montreal Poker Room (OK Poker)',
        neighborhood: 'Ile Notre-Dame / Parc Jean-Drapeau, Montreal',
        highlights: 'Government-Operated Architectural Landmark Minutes From Old Montreal With Casual Weekend Recreational Traffic',
      },
    ],
    travelAndStrategyTips: [
      'US Players Enjoy An Instant ~27% To 30% Purchasing Power Discount Because $1,000 USD Converts To Roughly $1,370 CAD For Hotel, Travel, And Buy-Ins.',
      'Playground\'s Legendary Bad Beat Jackpot Regularly Climbs Past $1,000,000+ CAD: Ensure Your Hole Cards Meet The Minimum Qualifying Hand Rules And Never Discuss Hand Contents Mid-Deal.',
      'Take Advantage Of Playground\'s Complimentary Table Menu For Active Cash Game Players To Offset The CAD Rake Cap.',
    ],
    faqs: [
      {
        q: 'Does Playground Poker Club Withhold Taxes On Tournament Wins For US Or International Players?',
        a: 'No. Canadian Gaming Venues Do Not Withhold Income Tax At The Cage On Poker Tournament Or Cash Game Payouts (Though US Citizens Are Still Legally Required To Self-Report Global Winnings To The IRS).',
      },
      {
        q: 'How Far Is Playground Poker Club From Montreal-Trudeau International Airport (YUL)?',
        a: 'Playground Is Approximately 20 Minutes By Taxi Or Uber From Montreal-Trudeau Airport (YUL) Via Autoroute 20 And The Honore-Mercier Bridge.',
      },
      {
        q: 'What Major Series Run At Playground Poker Club Each Year?',
        a: 'Playground Hosts Multiple Flagship World Poker Tour (WPT Montreal) And WSOP Circuit Ring Festivals Every Spring, Late Summer, And Autumn.',
      },
    ],
  },
  {
    slug: 'nassau-bahamas',
    city: 'Nassau',
    country: 'The Bahamas',
    region: 'Americas & Caribbean',
    currency: 'USD ($) US Dollar & BSD (Bahamian Dollar Pegged 1:1 To USD)',
    title: 'Nassau Bahamas WSOP Paradise Poker Guide',
    h1: 'Nassau, Bahamas Live Poker Guide: Atlantis Paradise Island, Baha Mar & WSOP Paradise',
    typicalStakes: '$2/$5 & $5/$10 USD, $10/$25 - $100/$200+ High-Stakes NLH & PLO During Festivals',
    rakeCap: '5% - 10% Pot Drop Capped At $10 - $20 USD Or Timed High-Stakes Collection',
    flagshipSeries: 'WSOP Paradise (Atlantis), Triton Super High Roller Series Bahamas, And Caribbean Championships',
    visitorTaxRule: '0% Bahamian Casino Cage Withholding Tax On Tournament & Cash Game Winnings (Verify Domestic Residency Reporting Rules)',
    summary:
      'Nassau And Paradise Island Have Hosted Three Decades Of Iconic Caribbean Championship Poker. Every December, Atlantis Paradise Island Hosts WSOP Paradise Alongside Triton Super High Roller Events, Operating 100% In US Dollars ($ USD) Just A 50-Minute Flight From Miami And A 3-Hour Flight From New York.',
    topPokerRooms: [
      {
        name: 'Atlantis Paradise Island Convention & Imperial Ballroom Arena',
        neighborhood: 'Paradise Island, Nassau, Bahamas',
        highlights: 'Home Of WSOP Paradise Gold Bracelet Events, $25K-$100K Super Million$, And High-Stakes Caribbean Cash Games',
      },
      {
        name: 'Baha Mar Casino (Cable Beach)',
        neighborhood: 'Cable Beach, Nassau, Bahamas',
        highlights: 'Luxury Cable Beach Mega-Resort Complex Just 15 Minutes From Nassau Airport (NAS)',
      },
    ],
    travelAndStrategyTips: [
      'US Dollars ($ USD) Are Accepted 1-To-1 Everywhere In The Bahamas Alongside The Bahamian Dollar, Eliminating Foreign Exchange Conversion Fees For USD Bankrolls.',
      'Win Package Satellites Or Book Resort Packages Early For December WSOP Paradise, As Paradise Island Hotel Inventory Fills Rapidly.',
      'Clear US Customs Pre-Clearance Directly At Nassau Lynden Pindling International Airport (NAS) On Your Return Flight Home, And Declare Physical Currency Transport Over $10,000 USD On FinCEN Form 105.',
    ],
    faqs: [
      {
        q: 'Do Bahamas Casinos Issue IRS Form W-2G Or Withhold 30% Tax At The Cage?',
        a: 'No. Because The Bahamas Is An Independent Sovereign Nation With Zero Income Or Capital Gains Tax, Tournament Payouts At Atlantis Are Paid Without US Cage Withholding (Though US Citizens Must Still Report Worldwide Income On Their Annual IRS Return).',
      },
      {
        q: 'What Do I Need To Know About Bringing $10,000+ Cash To Or From The Bahamas?',
        a: 'You May Legally Travel With Any Amount Of Cash, But US And Bahamian Customs Law Strictly Requires Declaring Combined Currency Or Monetary Instruments Exceeding $10,000 USD On FinCEN Form 105 / Customs Declaration Forms. Failure To Declare Can Result In Civil Seizure. Alternatively, Use Official Casino Wire Transfers.',
      },
      {
        q: 'When Does WSOP Paradise Take Place At Atlantis?',
        a: 'WSOP Paradise Runs Every December At Atlantis Paradise Island In Nassau, Awarding 15 Official World Series Of Poker Gold Bracelets And Over $50 Million In Combined Guarantees.',
      },
    ],
  },
];

export function findInternationalGuide(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  const target = INTERNATIONAL_SLUG_ALIASES[clean] || clean;
  return (
    INTERNATIONAL_POKER_GUIDES.find(
      (g) => g.slug === target || g.city.toLowerCase() === target
    ) || null
  );
}

export function renderInternationalGuidesIndexMarkdown() {
  const lines = [
    '# International & Global Live Poker Destination Guides (10 World Hubs)',
    '',
    `Last Verified: ${INTERNATIONAL_GUIDES_AS_OF}`,
    `Canonical URL: ${INTERNATIONAL_URL}`,
    '',
    '## Global Poker Destination Matrix',
    '',
    '| Destination | Currency | Typical Stakes | Rake Cap | Flagship Series |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...INTERNATIONAL_POKER_GUIDES.map(
      (g) =>
        `| [${g.city}, ${g.country}](${INTERNATIONAL_URL}/${g.slug}) | ${g.currency} | ${g.typicalStakes} | ${g.rakeCap} | ${g.flagshipSeries} |`
    ),
    '',
  ];
  return lines.join('\n');
}

export function renderInternationalGuideDetailMarkdown(slugOrObj) {
  const g =
    typeof slugOrObj === 'string' ? findInternationalGuide(slugOrObj) : slugOrObj;
  if (!g) return '';
  return [
    `# ${g.h1}`,
    '',
    `- **City & Country:** ${g.city}, ${g.country} (${g.region})`,
    `- **Table Currency:** ${g.currency}`,
    `- **Typical Cash Stakes:** ${g.typicalStakes}`,
    `- **Rake & Cap Structure:** ${g.rakeCap}`,
    `- **Flagship Tournament Series:** ${g.flagshipSeries}`,
    `- **Visitor Gaming Tax Rule:** ${g.visitorTaxRule}`,
    '',
    '## Executive Market Summary',
    g.summary,
    '',
    '## Premier Poker Rooms',
    ...g.topPokerRooms.map(
      (r) => `- **${r.name}** (${r.neighborhood}): ${r.highlights}`
    ),
    '',
    '## Travel Logistics & Table Strategy Tips',
    ...g.travelAndStrategyTips.map((t) => `- ${t}`),
    '',
  ].join('\n');
}
