/**
 * COMPARISON FACTS (AEO programme section 3.3, 2026-09-22).
 *
 * Every statement the /compare pages make about a named product lives here,
 * once, beside the page it was read from and the day it was read. A page
 * never types a competitor fact inline: it names a product and an attribute,
 * and the cell, the Sources list and the "Checked" line all come from this
 * file. A wrong claim about a named competitor is worse than no page, so a
 * fact that could not be read from a primary or reputable source is not
 * guessed. It is NOT_PUBLISHED, and the page prints "Not Published".
 *
 * How this was checked: each source below was fetched on AS_OF and the value
 * was copied from what that page said on that day (app store listings for
 * sellers, prices and in-app purchase ranges, the maker's own site for
 * features, trade press only where the maker's page could not be loaded,
 * and then the press date is recorded). Smarter.Poker's own facts come from
 * the live product pages, not from plans or code comments.
 *
 * Refresh quarterly: fetch every source again, change what changed, move
 * AS_OF. __tests__/a-comparison-cites-what-it-claims.law.test.mjs fails if a
 * fact loses its source or date.
 *
 * Copy is Title Case with no em dashes (house rule). Product names keep
 * their own casing.
 *
 * Plain JS, no JSX, no imports, so a law test can run it under node.
 */

/** The day every source below was fetched and read. */
export const AS_OF = '2026-09-22';

/** Shown on every page, derived from AS_OF so the two cannot disagree. */
export const CHECKED_LABEL = 'Checked September 2026';

/** The line above every Sources list, derived from the same day. */
export const SOURCES_NOTE = 'Each Source Below Was Read On September 22, 2026.';

/** What a cell says when no source we could read publishes the fact. */
export const NOT_PUBLISHED = 'Not Published';

/**
 * Sources. kind: 'listing' (an app store listing), 'maker' (the product's
 * own site), 'press' (reputable trade press, with its own date), 'own'
 * (a live Smarter.Poker page).
 */
export const SOURCES = {
  // Club apps
  pokerbrosAppStore: {
    url: 'https://apps.apple.com/us/app/pokerbros-your-poker-app/id1463376042',
    title: 'PokerBros On The Apple App Store',
    kind: 'listing',
  },
  pokerbrosGooglePlay: {
    url: 'https://play.google.com/store/apps/details?id=com.kpgame.PokerBros&hl=en_US',
    title: 'PokerBros On Google Play',
    kind: 'listing',
  },
  pppokerAppStore: {
    url: 'https://apps.apple.com/us/app/pppoker-usa-holdem-omaha/id1554633611',
    title: 'PPPoker USA On The Apple App Store',
    kind: 'listing',
  },
  pppokerGooglePlay: {
    url: 'https://play.google.com/store/apps/details?id=com.gameusa.pppoker.android&hl=en_US',
    title: 'PPPoker USA On Google Play',
    kind: 'listing',
  },
  clubggSite: { url: 'https://www.clubgg.com/', title: 'ClubGG Official Site', kind: 'maker' },
  clubggAppStore: {
    url: 'https://apps.apple.com/us/app/clubgg-poker/id1529839330',
    title: 'ClubGG Poker On The Apple App Store',
    kind: 'listing',
  },
  clubggGooglePlay: {
    url: 'https://play.google.com/store/apps/details?id=com.nsus.clubgg&hl=en&gl=US',
    title: 'ClubGG Poker On Google Play',
    kind: 'listing',
  },
  xpokerAppStore: {
    url: 'https://apps.apple.com/us/app/x-poker-holdem-omaha-ofc/id1534470447',
    title: 'X-Poker On The Apple App Store',
    kind: 'listing',
  },
  supremaAppStore: {
    url: 'https://apps.apple.com/us/app/suprema-poker/id1583176410',
    title: 'Suprema Poker On The Apple App Store',
    kind: 'listing',
  },
  supremaGooglePlay: {
    url: 'https://play.google.com/store/apps/details?id=com.opt.supremapoker',
    title: 'Suprema Poker On Google Play',
    kind: 'listing',
  },

  // Play with friends
  easypokerAppStore: {
    url: 'https://apps.apple.com/us/app/poker-with-friends-easypoker/id1317006618',
    title: 'EasyPoker On The Apple App Store',
    kind: 'listing',
  },
  easypokerSite: { url: 'https://easy.poker/', title: 'EasyPoker Official Site', kind: 'maker' },
  pokerrrrAppStore: {
    url: 'https://apps.apple.com/us/app/pokerrrr-2-texas-holdem-poker/id592081067',
    title: 'Pokerrrr 2 On The Apple App Store',
    kind: 'listing',
  },
  pokernewsHomeGamesGuide: {
    url: 'https://www.pokernews.com/news/2020/03/pokerstars-home-games-36819.htm',
    title: 'PokerNews: Quick Guide To PokerStars Home Games (Updated November 2023)',
    kind: 'press',
    published: '2023-11-17',
  },
  pokernewsHomeGamesMobile: {
    url: 'https://www.pokernews.com/news/2020/06/pokerstars-home-games-now-on-mobile-mixed-games-added-37465.htm',
    title: 'PokerNews: PokerStars Home Games Now On Mobile (Updated January 2022)',
    kind: 'press',
    published: '2022-01-17',
  },

  // Room management
  tablecaptainPokerAtlas: {
    url: 'https://www.pokeratlas.com/info/table-captain',
    title: 'PokerAtlas TableCaptain',
    kind: 'maker',
  },
  bravoGenesis: {
    url: 'https://www.genesisgaming.com/new-page',
    title: 'Genesis Gaming: Bravo Poker',
    kind: 'maker',
  },
  bravoAppStore: {
    url: 'https://apps.apple.com/us/app/bravopokerlive/id470322257',
    title: 'BravoPokerLive On The Apple App Store',
    kind: 'listing',
  },
  tablesreadyPoker: {
    url: 'https://www.tablesready.com/poker-casinos/',
    title: 'TablesReady For Poker Rooms And Casinos',
    kind: 'maker',
  },
  tablesreadyPricing: { url: 'https://www.tablesready.com/pricing/', title: 'TablesReady Pricing', kind: 'maker' },
  pokeriqSite: { url: 'https://www.pokeriq.us/', title: 'PokerIQ Official Site', kind: 'maker' },
  pokerpyRoom: {
    url: 'https://www.pokerpy.com/poker-room',
    title: 'Pokerpy Poker Room Waiting List Software',
    kind: 'maker',
  },
  nextupSite: { url: 'https://nextuppoker.com/', title: 'Next Up Poker Official Site', kind: 'maker' },

  // GTO trainers
  gtowizardSite: { url: 'https://gtowizard.com/', title: 'GTO Wizard Official Site', kind: 'maker' },
  gtowizardHelp: {
    url: 'https://help.gtowizard.com/subscription/',
    title: 'GTO Wizard Help: Subscription',
    kind: 'maker',
  },
  pokernewsGtoWizardPricing: {
    url: 'https://www.pokernews.com/news/2026/03/gto-wizard-subscription-plans-new-features-pricing-50908.htm',
    title: 'PokerNews: GTO Wizard New Pricing And Plans (Updated June 2026)',
    kind: 'press',
    published: '2026-06-19',
  },
  dtoCashPricing: {
    url: 'https://www.dto.poker/pricing-dto-cash/',
    title: 'DTO Cash Pricing',
    kind: 'maker',
  },
  dtoCashAppStore: {
    url: 'https://apps.apple.com/us/app/dto-cash-gto-poker-trainer/id6471915869',
    title: 'DTO Cash On The Apple App Store',
    kind: 'listing',
  },
  odinSite: { url: 'https://odinpoker.io/', title: 'Odin Official Site', kind: 'maker' },
  pokernewsOdin: {
    url: 'https://www.pokernews.com/news/2023/03/poker-real-time-assistance-rta-debate-rages-on-43177.htm',
    title: 'PokerNews: RTA Debate Rages On As Poker Training Tool Removes 20 Second Delay (March 2023)',
    kind: 'press',
    // The article's month, from its URL; the day was not shown to us.
    published: '2023-03',
  },
  deepsolverPricing: { url: 'https://deepsolver.com/pricing', title: 'Deepsolver Pricing', kind: 'maker' },

  // Bankroll trackers
  pbtSite: {
    url: 'https://pokerbankrolltracker.net/',
    title: 'Poker Bankroll Tracker Official Site',
    kind: 'maker',
  },
  pbtAppStore: {
    url: 'https://apps.apple.com/us/app/poker-bankroll-tracker/id999514771',
    title: 'Poker Bankroll Tracker On The Apple App Store',
    kind: 'listing',
  },
  pokerIncomeAppStore: {
    url: 'https://apps.apple.com/us/app/poker-income-bankroll-tracker/id316520188',
    title: 'Poker Income Bankroll Tracker On The Apple App Store',
    kind: 'listing',
  },

  // Smarter.Poker, read from the live site
  spHome: { url: 'https://smarter.poker/', title: 'Smarter.Poker Home Page', kind: 'own' },
  spPokerArena: { url: 'https://smarter.poker/hub/club-arena', title: 'Poker Arena', kind: 'own' },
  spPokerArenaHelp: {
    url: 'https://smarter.poker/hub/club-arena/help',
    title: 'Poker Arena Help Center',
    kind: 'own',
  },
  spPokerArenaFairGaming: {
    url: 'https://smarter.poker/hub/club-arena/legal/fair-gaming',
    title: 'Poker Arena Fair Gaming Standards',
    kind: 'own',
  },
  spCommander: { url: 'https://smarter.poker/hub/commander', title: 'Club Commander', kind: 'own' },
  spTraining: { url: 'https://smarter.poker/hub/training', title: 'Smarter.Poker GTO Training', kind: 'own' },
  spSolutions: {
    url: 'https://smarter.poker/hub/training/solutions',
    title: 'Smarter.Poker GTO Solutions Browser',
    kind: 'own',
  },
  spHandHistory: {
    url: 'https://smarter.poker/hub/training/hand-history-upload',
    title: 'Smarter.Poker Hand History Review',
    kind: 'own',
  },
  spBankroll: {
    url: 'https://smarter.poker/hub/bankroll-manager',
    title: 'Smarter.Poker Bankroll Manager',
    kind: 'own',
  },
};

/**
 * A fact: a value, the source key (or keys, when two pages together state
 * it) it was read from, and the day.
 */
function fact(value, source) {
  return { value, source, asOf: AS_OF };
}

/**
 * A fact no source we could read publishes. `why` says what was tried, so
 * the gap is explained rather than hidden. It never carries a number.
 */
function notPublished(why) {
  return { value: NOT_PUBLISHED, unknown: true, why, asOf: AS_OF };
}

/**
 * The play-credit disclosure. Read from the Smarter.Poker home page, where
 * it is stated in these words. Every club and app page prints it.
 */
export const PLAY_CREDIT_DISCLOSURE = fact(
  'There Is No Real-Money Gambling On Smarter.Poker: Club Chips Are Play Credits With No Cash Value, And Diamonds Are A Promotional Rewards Currency.',
  'spHome'
);

/**
 * Products. `own` marks a Smarter.Poker product, which carries `href` to its
 * live page. `facts` is keyed by attribute; a page picks the attributes its
 * table shows, and a missing attribute renders as Not Published.
 */
export const PRODUCTS = {
  // ─── Club apps ────────────────────────────────────────────────────────────
  pokerArena: {
    name: 'Poker Arena',
    own: true,
    href: '/hub/club-arena',
    facts: {
      maker: fact('Smarter.Poker', 'spPokerArena'),
      price: fact('Free To Play', 'spHome'),
      purchases: notPublished('The Poker Arena Page Lists No Purchases, And The Site States Diamonds Are A Promotional Rewards Currency.'),
      games: fact("Hold'em, Omaha, Short Deck And Pineapple, With Multi Table Tournaments (Custom Blinds, Rebuys, Bounties)", 'spPokerArena'),
      tableOptions: fact('Straddles, Bomb Pots, Run It Twice And Insurance', 'spPokerArena'),
      clubs: fact('Private Clubs With Your Own Stakes And Rules, Unions For Shared Player Pools, And An Agent System', 'spPokerArena'),
      operatorTools: fact('Cashier, Chip Ledger, Agent System, Rake Settings, Reports And Settlement Tools', 'spPokerArena'),
      feeModel: fact('Rake Settings Are A Club Operator Tool; Chips Are Play Credits', ['spPokerArena', 'spHome']),
      platforms: fact('Browser Or The Mobile App', 'spPokerArena'),
      money: fact('No Real-Money Gambling; Club Chips Have No Cash Value', 'spHome'),
      fairness: fact('Cryptographically Secure Random Values And An Unbiased Fisher-Yates Shuffle', 'spPokerArenaFairGaming'),
      handHistory: fact('Every Hand Is Recorded To Replay, Share And Study', 'spPokerArena'),
      friends: fact('Private Clubs With Your Own Stakes And Rules; A Private Club Needs Approval Or An Invite To Join', ['spPokerArena', 'spPokerArenaHelp']),
    },
  },
  pokerbros: {
    name: 'PokerBros',
    facts: {
      maker: fact('Thinklean Limited (App Store Seller)', 'pokerbrosAppStore'),
      price: fact('Free With In-App Purchases', 'pokerbrosAppStore'),
      purchases: fact('Diamonds, From $0.99 For 60 To $99.99 For 6,468', 'pokerbrosAppStore'),
      games: fact("Texas Hold'em, Pot Limit Omaha, Short Deck And More, With MTTs And SNGs", 'pokerbrosAppStore'),
      tableOptions: notPublished('The Listing Does Not Name Table Options Such As Straddles Or Run It Twice.'),
      clubs: fact('Create A Private Poker Club', 'pokerbrosAppStore'),
      operatorTools: notPublished('The Listing Does Not Describe Club Operator Tools.'),
      feeModel: notPublished('Neither Listing Publishes How Club Or Table Fees Work.'),
      platforms: fact('Apple App Store And Google Play', ['pokerbrosAppStore', 'pokerbrosGooglePlay']),
      ageRating: fact('18+ On The Apple App Store', 'pokerbrosAppStore'),
      money: fact('Listing Says Chips Have No Monetary Value And Real Money Use Violates Its Terms', 'pokerbrosAppStore'),
    },
  },
  pppoker: {
    name: 'PPPoker',
    facts: {
      maker: fact('Green Shield Digital Limited (App Store Seller, USA App)', 'pppokerAppStore'),
      price: fact('Free With In-App Purchases', 'pppokerAppStore'),
      purchases: fact('Diamonds, From $0.99 For 60 To $99.99 For 6,280, Plus Item Combos At $4.99', 'pppokerAppStore'),
      games: fact('NLH, PLO And OFC, With Tournaments And Up To Three Tables At Once', 'pppokerAppStore'),
      tableOptions: notPublished('The Listing Does Not Name Table Options Such As Straddles Or Run It Twice.'),
      clubs: fact('Create And Play In A Private Club', 'pppokerAppStore'),
      operatorTools: notPublished('The Listing Does Not Describe Club Operator Tools.'),
      feeModel: notPublished('Neither Listing Publishes How Club Or Table Fees Work.'),
      platforms: fact('Apple App Store (iPhone, iPad And Mac With Apple Silicon) And Google Play', ['pppokerAppStore', 'pppokerGooglePlay']),
      ageRating: fact('18+ On The Apple App Store', 'pppokerAppStore'),
      money: fact('Google Play Listing Says It Does Not Offer Real-Money Gambling Or A Chance To Win Real Money', 'pppokerGooglePlay'),
    },
  },
  clubgg: {
    name: 'ClubGG',
    facts: {
      maker: fact('NSUS Ltd (App Store Seller); The Site Names NSUS Group Inc. As Operator', 'clubggAppStore'),
      price: fact('Free With In-App Purchases', 'clubggAppStore'),
      purchases: fact('Diamonds From $0.99 To $99.99, WSOP+ Basic $9.99, WSOP+ Premium $49.99, Club Level 1A $19.99', 'clubggAppStore'),
      games: fact("Hold'em, Omaha, 5 Card Omaha And Tournaments, Up To 4 Tables At Once", 'clubggAppStore'),
      tableOptions: notPublished('The Listing Does Not Name Table Options Such As Straddles Or Run It Twice.'),
      clubs: fact('Create Or Join A Club, With Union Tools And A Union Back Office', 'clubggSite'),
      operatorTools: fact('Union Tools And Union Back Office', 'clubggSite'),
      feeModel: notPublished('The Site Calls ClubGG A Subscription Poker Platform But Publishes No Club Fee Schedule.'),
      platforms: fact('Apple App Store, Google Play, Windows And macOS', 'clubggSite'),
      ageRating: fact('18+ On The Apple App Store', 'clubggAppStore'),
      money: fact('Site Says Tournament Tickets Have No Monetary Value; Google Play Rates It For Simulated Gambling', 'clubggSite'),
    },
  },
  xpoker: {
    name: 'X-Poker',
    facts: {
      maker: fact('Future Entertainment Ltd (App Store Seller)', 'xpokerAppStore'),
      price: fact('Free With In-App Purchases', 'xpokerAppStore'),
      purchases: fact('Diamonds, From $0.99 For 120 To $99.99 For 13,000, Plus Golds From $0.99', 'xpokerAppStore'),
      games: fact("Texas Hold'em, Pot Limit Omaha (4, 5 And 6 Card, Hi/Lo, Double Board, Bomb Pot) And OFC, Up To 3 Tables", 'xpokerAppStore'),
      tableOptions: fact('Bomb Pot And Double Board Omaha', 'xpokerAppStore'),
      clubs: fact('Create A Private Club And Invite Friends', 'xpokerAppStore'),
      operatorTools: notPublished('The Listing Does Not Describe Club Operator Tools.'),
      feeModel: notPublished('The Listing Publishes No Club Or Table Fee Schedule.'),
      platforms: fact('Apple App Store', 'xpokerAppStore'),
      ageRating: fact('18+ On The Apple App Store', 'xpokerAppStore'),
      money: notPublished('We Found No Statement About Real Money On The Listing We Read.'),
    },
  },
  suprema: {
    name: 'Suprema Poker',
    facts: {
      maker: fact('Suprema Promocao De Eventos Ltda (App Store Seller)', 'supremaAppStore'),
      price: fact('Free With In-App Purchases', 'supremaAppStore'),
      purchases: fact('Diamonds, From $0.99 For 60 To $99.99 For 6,280+188', 'supremaAppStore'),
      games: fact("Texas Hold'em, Omaha, Open Face Chinese And More", 'supremaAppStore'),
      tableOptions: notPublished('The Listing Does Not Name Table Options Such As Straddles Or Run It Twice.'),
      clubs: fact('Create A Private Club And Connect To Larger Player Networks (Unions)', 'supremaAppStore'),
      operatorTools: fact('Create And Manage Tables For Free', 'supremaAppStore'),
      feeModel: notPublished('The Listing Publishes No Club Or Table Fee Schedule.'),
      platforms: fact('Apple App Store And Google Play', ['supremaAppStore', 'supremaGooglePlay']),
      ageRating: fact('18+ On The Apple App Store', 'supremaAppStore'),
      money: fact('Google Play Listing Says It Is For Entertainment Purposes Only, With Simulated Gambling', 'supremaGooglePlay'),
    },
  },

  // ─── Play with friends ───────────────────────────────────────────────────
  easypoker: {
    name: 'EasyPoker',
    facts: {
      maker: fact('Appex ApS (App Store Seller)', 'easypokerAppStore'),
      price: fact('Free To Play', 'easypokerSite'),
      purchases: fact('EasyPoker Plus: $3.99 A Week, $5.99 A Month Or $29.99 A Year', 'easypokerAppStore'),
      games: fact("Texas Hold'em, Omaha, Short Deck And Reverse Hold'em", 'easypokerSite'),
      seats: fact('Up To 12 Players At One Table', 'easypokerSite'),
      friends: fact('Private Table With A 4 Digit PIN, Free Voice Chat', 'easypokerSite'),
      platforms: fact('Apple App Store And Google Play', 'easypokerSite'),
      money: fact('No Real Money Play, No Cash Prizes And No Chips To Buy', 'easypokerSite'),
    },
  },
  pokerrrr2: {
    name: 'Pokerrrr 2',
    facts: {
      maker: fact('Mondraw Limited (App Store Seller)', 'pokerrrrAppStore'),
      price: fact('Free With In-App Purchases', 'pokerrrrAppStore'),
      purchases: fact('Gold From $2.99 To $99.99, Sapphire VIP $9.99', 'pokerrrrAppStore'),
      games: fact("Texas Hold'em, Omaha And PLO, OFC, Blackjack 21 And Rummy", 'pokerrrrAppStore'),
      seats: notPublished('The Listing Does Not State A Table Size.'),
      friends: fact('Create A Private Table For Your Crew', 'pokerrrrAppStore'),
      platforms: fact('Apple App Store (iPhone, iPad And Mac With Apple Silicon)', 'pokerrrrAppStore'),
      money: fact('Listing Says It Does Not Offer Real-Money Gambling', 'pokerrrrAppStore'),
    },
  },
  pokerstarsHomeGames: {
    name: 'PokerStars Home Games',
    facts: {
      maker: fact('PokerStars', 'pokernewsHomeGamesGuide'),
      price: notPublished('The PokerStars Home Games Page Redirected Away When We Tried To Read It From The United States, So No Price Is Taken From It.'),
      purchases: notPublished('Not Read From A Primary Source.'),
      games: fact("Hold'em, Omaha, Omaha Hi/Lo, 5 Card Omaha, Stud, Razz, Draw Games, H.O.R.S.E., 8-Game And Badugi", 'pokernewsHomeGamesMobile'),
      seats: notPublished('PokerNews Does Not State A Club Or Table Size.'),
      friends: fact('Private Clubs Joined With An Invite Code, With Scheduled Tournaments And Cash Tables', 'pokernewsHomeGamesMobile'),
      platforms: fact('PokerStars Desktop Software And The PokerStars Mobile App', 'pokernewsHomeGamesMobile'),
      money: fact('PokerNews Reports Games Can Be For Play Money Or Real Money', 'pokernewsHomeGamesGuide'),
      account: fact('A PokerStars Account Is Required', 'pokernewsHomeGamesGuide'),
    },
  },

  // ─── Room management software ────────────────────────────────────────────
  clubCommander: {
    name: 'Club Commander',
    own: true,
    href: '/hub/commander',
    facts: {
      maker: fact('Smarter.Poker', 'spCommander'),
      pricing: fact('Free For Live Venues', 'spHome'),
      waitlist: fact('Digital Waitlists; Players Join From Anywhere And Get Called When A Seat Is Ready', 'spCommander'),
      alerts: fact('SMS And Push Seat Alerts', 'spHome'),
      tournaments: fact('Tournament Registration And Tournament Clocks', 'spCommander'),
      playerApp: fact('Player Hub On The Web: Waitlists, Tournaments, Desk Check In, Leagues And Comps', 'spCommander'),
      reporting: fact('Table Tracking, Promotions And Analytics', 'spHome'),
      extras: fact('Season Leagues, And Spending Limits, Cooling Off Periods And Self Exclusion For Players', 'spCommander'),
      network: notPublished('We Publish No Audience Figure For The Player Hub.'),
    },
  },
  tablecaptain: {
    name: 'TableCaptain',
    facts: {
      maker: fact('PokerAtlas (Overlay Gaming Corp.)', 'tablecaptainPokerAtlas'),
      pricing: fact('Quote On Request', 'tablecaptainPokerAtlas'),
      waitlist: fact('Real Time Waitlists Broadcast To PokerAtlas', 'tablecaptainPokerAtlas'),
      alerts: notPublished('The Page We Read Does Not Describe Seat Alerts.'),
      tournaments: fact('Tournament Broadcasting To PokerAtlas', 'tablecaptainPokerAtlas'),
      playerApp: fact('Player App Integration Through PokerAtlas', 'tablecaptainPokerAtlas'),
      reporting: notPublished('The Page We Read Does Not List Reports.'),
      extras: fact('Sized For Rooms From 2 Tables To 200 Tables', 'tablecaptainPokerAtlas'),
      network: fact('PokerAtlas Describes Itself As Reaching 6 Million Users A Year', 'tablecaptainPokerAtlas'),
    },
  },
  bravo: {
    name: 'Bravo Poker Live',
    facts: {
      maker: fact('Genesis Gaming Solutions, Inc. (Spring, Texas)', 'bravoGenesis'),
      pricing: notPublished('Genesis Gaming Publishes No Price On The Page We Read.'),
      waitlist: fact('Waiting List Displays For Live And Interest Games; Players Can Add Themselves Remotely', 'bravoGenesis'),
      alerts: fact('Staff Are Notified When Seats Open', 'bravoGenesis'),
      tournaments: fact('Tournament Registration With Buy-In, Rebuy And Add-On Tracking, And Online Seat Purchase', 'bravoGenesis'),
      playerApp: fact('BravoPokerLive App, Free On The Apple App Store, Listing Only Rooms Using Bravo', 'bravoAppStore'),
      reporting: fact('Point Tracking, Table Drop Analysis, Room Statistics And Player Session History', 'bravoGenesis'),
      extras: fact('Covers Operations, Marketing And Payments', 'bravoGenesis'),
      network: notPublished('Genesis Gaming Publishes No Room Count On The Page We Read.'),
    },
  },
  tablesready: {
    name: 'TablesReady',
    facts: {
      maker: fact('TablesReady (A General Waitlist Service With A Poker Room Offering)', 'tablesreadyPoker'),
      pricing: fact('Free $0 A Month (150 Messages), Starter $39 And Business $79 A Month Billed Annually, Enterprise Custom', 'tablesreadyPricing'),
      waitlist: fact('Add Players To A Waitlist And Mark Them Seated', 'tablesreadyPoker'),
      alerts: fact('Text Alerts When A Seat Opens, Plus A Next In Line Alert', 'tablesreadyPoker'),
      tournaments: notPublished('The Poker Page Mentions Follow Up Texts About Tournaments, Not Tournament Management.'),
      playerApp: fact('Real Time Public Waitlist Display', 'tablesreadyPoker'),
      reporting: notPublished('The Poker Page Does Not List Reports.'),
      extras: fact('14 Day Free Trial, No Credit Card Required', 'tablesreadyPoker'),
      network: notPublished('Not Applicable Or Not Published.'),
    },
  },
  pokeriq: {
    name: 'PokerIQ',
    facts: {
      maker: fact('The Team Behind PlayerIQ And EmployeeIQ', 'pokeriqSite'),
      pricing: fact('Listed As Coming Soon; The Product Is Taking A Pre Launch Waitlist', 'pokeriqSite'),
      waitlist: fact('Real Time Game Tracking With Waitlist Counts', 'pokeriqSite'),
      alerts: fact('Push Notifications', 'pokeriqSite'),
      tournaments: fact('Tournament Management With Blind Structures, Automated Payouts And Leaderboards', 'pokeriqSite'),
      playerApp: fact('Branded Progressive Web App For Players', 'pokeriqSite'),
      reporting: fact('Revenue, Player Activity And Game Performance Reports With Exports', 'pokeriqSite'),
      extras: fact('Email Campaigns, Promotions And Player Segmentation', 'pokeriqSite'),
      network: notPublished('Not Published.'),
    },
  },
  pokerpy: {
    name: 'Pokerpy',
    facts: {
      maker: fact('Pokerpy', 'pokerpyRoom'),
      pricing: fact('Free, With No Licensing Fees', 'pokerpyRoom'),
      waitlist: fact('Player Queue With A Main List And A Move List', 'pokerpyRoom'),
      alerts: notPublished('The Page We Read Does Not Describe Seat Alerts.'),
      tournaments: fact('Tournament Scheduling', 'pokerpyRoom'),
      playerApp: notPublished('The Page We Read Does Not Describe A Player App.'),
      reporting: notPublished('The Page We Read Does Not List Reports.'),
      extras: fact('Web Based, With Desktop And Horizontal Layouts', 'pokerpyRoom'),
      network: notPublished('Not Published.'),
    },
  },
  nextup: {
    name: 'Next Up Poker',
    facts: {
      maker: fact('Next Up Poker', 'nextupSite'),
      pricing: notPublished('The Site We Read Publishes No Price.'),
      waitlist: fact('Cash Game Scheduling, Waitlist And Seat Tracking', 'nextupSite'),
      alerts: fact('SMS Notifications For Seats And Game Updates', 'nextupSite'),
      tournaments: fact('Tournament Management And A Live Clock For A Tablet Or TV', 'nextupSite'),
      playerApp: notPublished('The Site We Read Does Not Describe A Player App.'),
      reporting: notPublished('The Site We Read Does Not List Reports.'),
      extras: fact('Membership Management, Player Time Tracking For Billing And A Website Builder, For Local Rooms And Social Clubs', 'nextupSite'),
      network: notPublished('Not Published.'),
    },
  },

  // ─── GTO trainers ────────────────────────────────────────────────────────
  smarterTraining: {
    name: 'Smarter.Poker GTO Training',
    own: true,
    href: '/hub/training',
    facts: {
      pricing: fact('Free To Play', 'spHome'),
      freeTier: fact('The Solutions Library Is Free To Read And Hand History Review Is Free To Use', ['spSolutions', 'spHandHistory']),
      training: fact('107 Games Across Tournaments, Cash Games, Spins And SNGs, Mental Game And Advanced, Coached By Jarvis', 'spTraining'),
      solver: fact('A Browsable Library Of Solver Baselines For Opening, Three Betting And Defending By Position And Stack Depth', 'spSolutions'),
      handReview: fact('Upload TXT Hand Histories From PokerStars, GGPoker, 888 And ACR To Replay And Grade', 'spHandHistory'),
      platforms: fact('Web', 'spTraining'),
    },
  },
  gtowizard: {
    name: 'GTO Wizard',
    facts: {
      pricing: fact('Starter $49, Premium $99, Elite $169 A Month; $39, $79 And $139 A Month Billed Annually', 'pokernewsGtoWizardPricing'),
      freeTier: fact('A Free Version: One Postflop Spot A Day, 10 Practice Hands A Day, 5 Analyzed Hands A Month', 'gtowizardHelp'),
      training: fact('Practice Any Spot Preflop To River With Instant GTO And EV Feedback', 'gtowizardSite'),
      solver: fact('GTO Wizard AI Solver For Custom Spots', 'gtowizardSite'),
      handReview: fact('Upload Hand Histories To Find Leaks And Track Progress', 'gtowizardSite'),
      platforms: fact('Web App', 'gtowizardSite'),
    },
  },
  dto: {
    name: 'DTO',
    facts: {
      pricing: fact('DTO Cash On The Web: Beginner $9.99 A Month Or $89.99 A Year; Pro $39.99 A Month Or $359.99 A Year', 'dtoCashPricing'),
      pricingApp: fact('DTO Cash In The App Store: Beginner $9.99 A Month; Pro $29.99 A Month Or $299.99 A Year', 'dtoCashAppStore'),
      freeTier: fact('One Free Spot On The Web', 'dtoCashPricing'),
      training: fact('Play Against GTO Bots With Instant Feedback, At 100 Big Blinds', 'dtoCashPricing'),
      solver: notPublished('The Pricing Page Describes A Trainer, Not A Custom Spot Solver.'),
      handReview: notPublished('The Pages We Read Do Not Describe Hand History Upload.'),
      platforms: fact('Web, And An Apple App Store App (iPhone, iPad And Mac With Apple Silicon)', 'dtoCashAppStore'),
    },
  },
  odin: {
    name: 'Odin',
    facts: {
      pricing: notPublished('The Odin Site Needs JavaScript And Showed Us No Prices.'),
      freeTier: notPublished('The Odin Site Needs JavaScript And Showed Us No Plans.'),
      training: fact('Simulations To Analyze Spots And Compare Betting Strategies', 'pokernewsOdin'),
      solver: fact('Advertised Instant Solutions With No Delay, As Reported In March 2023', 'pokernewsOdin'),
      handReview: notPublished('Not Published On A Page We Could Read.'),
      platforms: notPublished('Not Published On A Page We Could Read.'),
      tagline: fact('Site Tagline: Never Use A Solver Again', 'odinSite'),
      note: fact('PokerNews Reported In March 2023 That Odin Removed A 20 Second Delay, And Its Founder Said It Could Be Used To Cheat But That Cheaters Would Be Caught', 'pokernewsOdin'),
    },
  },
  deepsolver: {
    name: 'Deepsolver',
    facts: {
      pricing: fact('Essential $49 A Month Or $29.40 A Month Billed Yearly; Pro $69 A Month Or $41.40 A Month Billed Yearly', 'deepsolverPricing'),
      freeTier: fact('A 2 Day Free Trial; A Subscription Is Needed To Run Calculations', 'deepsolverPricing'),
      training: fact('GTO Trainer Included In Every Plan', 'deepsolverPricing'),
      solver: fact("Cloud Solver For Heads Up No-Limit Hold'em Postflop; PLO And Short Deck In Development", 'deepsolverPricing'),
      handReview: notPublished('The Pricing Page Does Not Describe Hand History Upload.'),
      platforms: fact('Web Browser Only; Mobile Not Supported', 'deepsolverPricing'),
    },
  },

  // ─── Bankroll trackers ───────────────────────────────────────────────────
  bankrollManager: {
    name: 'Smarter.Poker Bankroll Manager',
    own: true,
    href: '/hub/bankroll-manager',
    facts: {
      maker: fact('Smarter.Poker', 'spBankroll'),
      pricing: fact('Free To Play', 'spBankroll'),
      sessions: fact('Cash Game And Tournament Sessions With Stakes, Venue, Duration And Result, Grouped Into Trips And Series', 'spBankroll'),
      analysis: fact('Win Rate, Hourly, Variance And Bankroll Over Time, Plus Projections And Tax Reports', 'spBankroll'),
      export: fact('CSV Export', 'spBankroll'),
      extras: fact('Receipt Scanning, Staking Tracker, Toke Tracker, Player Notes And A Tournament Calendar', 'spBankroll'),
      platforms: fact('Web', 'spBankroll'),
    },
  },
  pokerBankrollTracker: {
    name: 'Poker Bankroll Tracker',
    facts: {
      maker: fact('Pixelnomads Ltd', 'pbtAppStore'),
      pricing: fact('Free With In-App Purchases: Pro $29.99 A Year Or $199.99 Lifetime', 'pbtAppStore'),
      sessions: fact('Live Or Online Sessions, With A Hand Replayer', 'pbtSite'),
      analysis: fact('Chip Graphs, Statistics And Variance, With Player Stats Such As VPIP And PFR', 'pbtAppStore'),
      export: fact('CSV Import; The App Store Listing Places CSV Export In Pro', 'pbtAppStore'),
      extras: fact('Cloud Sync, Odds And ICM Calculators, 40 Currencies And A Public API', 'pbtSite'),
      platforms: fact('Apple App Store, Google Play And Desktop', 'pbtSite'),
    },
  },
  pokerIncome: {
    name: 'Poker Income',
    facts: {
      maker: fact('Poker Chang Ltd', 'pokerIncomeAppStore'),
      pricing: fact('$9.99 To Download', 'pokerIncomeAppStore'),
      sessions: fact('Cash Games And Tournaments With Format, Stake, Location, Time, Profit And Notes', 'pokerIncomeAppStore'),
      analysis: fact('Charts And Monthly Reports By Year, With Bankroll And Withdrawal Management', 'pokerIncomeAppStore'),
      export: fact('Tab Separated Export For A Spreadsheet', 'pokerIncomeAppStore'),
      extras: fact('Cloud Backup And Restore At Pokerincome.com', 'pokerIncomeAppStore'),
      platforms: fact('Apple App Store (iPhone, iPad And Mac With Apple Silicon)', 'pokerIncomeAppStore'),
    },
  },
};
