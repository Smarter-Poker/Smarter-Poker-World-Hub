/**
 * COMPARISON AND BEST-OF PAGES (AEO programme section 3.3, 2026-09-22).
 *
 * "The highest-yield format in the citation data. Written honestly, with
 * real competitor facts, updated quarterly." Eleven pages, rendered by
 * pages/compare/[slug].js and listed by pages/compare/index.js.
 *
 * The rule that makes these pages worth citing: a page never states a fact
 * about a named product in its own words. Tables are built from
 * src/content/compare/facts.js by product and attribute. A paragraph that
 * names a product carries the source keys it rests on, and those sources
 * are printed in the page's Sources list. A fact nobody publishes is shown
 * as Not Published, never estimated.
 *
 * What is deliberately absent: ratings, scores, review counts, download
 * counts, testimonials, quotes, logos, author bylines, and any
 * Review or AggregateRating schema. "Best" here means "the ones people
 * compare, laid side by side", and each page says what each one is best at
 * only where a source says it offers that thing.
 *
 * EXCLUDED: "Sweepstakes And Free-To-Play Poker Explained". The spec
 * requires a compliance review, which needs the owner and legal counsel.
 *
 * Copy is Title Case with no em dashes. Plain JS, no JSX, no imports beyond
 * the facts module, so a law test can run it under node.
 */

import { AS_OF, CHECKED_LABEL, NOT_PUBLISHED, PLAY_CREDIT_DISCLOSURE, PRODUCTS, SOURCES, SOURCES_NOTE } from './facts.js';

export { AS_OF, CHECKED_LABEL, NOT_PUBLISHED, PLAY_CREDIT_DISCLOSURE, PRODUCTS, SOURCES, SOURCES_NOTE };

export const COMPARE_BASE = '/compare';
export const SITE_URL = 'https://smarter.poker';
export const GLOSSARY_PATH = '/hub/training/glossary';

/** The same slug function the glossary uses for its term anchors. */
export function glossaryTermSlug(term) {
  return String(term)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function glossaryHref(term) {
  return `${GLOSSARY_PATH}#term-${glossaryTermSlug(term)}`;
}

// ─── Table column sets ─────────────────────────────────────────────────────

const CLUB_COLUMNS = [
  { key: 'maker', label: 'Maker' },
  { key: 'price', label: 'Price' },
  { key: 'purchases', label: 'In-App Purchases' },
  { key: 'games', label: 'Games' },
  { key: 'clubs', label: 'Clubs And Unions' },
  { key: 'feeModel', label: 'Club Or Table Fees' },
  { key: 'platforms', label: 'Platforms' },
  { key: 'money', label: 'What It Says About Money' },
];

const CLUB_VERSUS_COLUMNS = [
  ...CLUB_COLUMNS.slice(0, 5),
  { key: 'tableOptions', label: 'Table Options' },
  { key: 'operatorTools', label: 'Operator Tools' },
  ...CLUB_COLUMNS.slice(5),
];

const FRIENDS_COLUMNS = [
  { key: 'maker', label: 'Maker' },
  { key: 'price', label: 'Price' },
  { key: 'purchases', label: 'Paid Extras' },
  { key: 'games', label: 'Games' },
  { key: 'friends', label: 'Playing With Friends' },
  { key: 'seats', label: 'Players Per Table' },
  { key: 'platforms', label: 'Platforms' },
  { key: 'money', label: 'Real Money' },
];

const ROOM_COLUMNS = [
  { key: 'maker', label: 'Maker' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'alerts', label: 'Seat Alerts' },
  { key: 'tournaments', label: 'Tournaments' },
  { key: 'playerApp', label: 'Player App Or Display' },
  { key: 'reporting', label: 'Reporting' },
];

const ROOM_VERSUS_COLUMNS = [...ROOM_COLUMNS, { key: 'extras', label: 'Also Offers' }, { key: 'network', label: 'Player Audience' }];

const TRAINER_COLUMNS = [
  { key: 'pricing', label: 'Paid Plans' },
  { key: 'freeTier', label: 'Free Access' },
  { key: 'training', label: 'Training' },
  { key: 'solver', label: 'Solver' },
  { key: 'handReview', label: 'Hand History Review' },
  { key: 'platforms', label: 'Platforms' },
];

const BANKROLL_COLUMNS = [
  { key: 'maker', label: 'Maker' },
  { key: 'pricing', label: 'Price' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'export', label: 'Export' },
  { key: 'extras', label: 'Also Offers' },
  { key: 'platforms', label: 'Platforms' },
];

// ─── The pages ─────────────────────────────────────────────────────────────
//
// A paragraph or bullet is { text, sources }. `sources` lists the SOURCES
// keys the sentence rests on; a sentence that names no product and states
// no product fact may carry an empty list.

const p = (text, sources = []) => ({ text, sources });

export const COMPARE_PAGES = [
  // 1 ─────────────────────────────────────────────────────────────────────
  {
    slug: 'best-poker-club-apps',
    kind: 'best-of',
    title: 'Best Poker Club Apps In 2026',
    h1: 'Best Poker Club Apps In 2026',
    description:
      'PokerBros, PPPoker, ClubGG, X-Poker, Suprema Poker And Poker Arena Side By Side: Makers, Prices, In-App Purchases, Games, Unions And Platforms.',
    summary: p(
      'The Private Poker Club Apps Compared Here Are PokerBros, PPPoker, ClubGG, X-Poker And Suprema Poker, Plus Poker Arena From Smarter.Poker. All Five Outside Apps Are Free To Download And Sell Diamonds In-App From $0.99 To $99.99, And None Of The Listings We Read Publishes A Club Fee Schedule. Poker Arena Is Free To Play In A Browser Or The Mobile App, And Its Chips Are Play Credits With No Cash Value.',
      ['pokerbrosAppStore', 'pppokerAppStore', 'clubggAppStore', 'clubggSite', 'xpokerAppStore', 'supremaAppStore', 'spPokerArena', 'spHome']
    ),
    intro: p(
      'A Club App Lets One Person Open A Private Poker Club, Set The Games And Invite Players. The Table Below Takes Each Fact From The App Store Listing, Google Play Listing Or Maker Site Linked Under Sources. Where A Source Does Not Say Something, The Cell Says Not Published.'
    ),
    table: {
      caption: 'Poker Club Apps Compared, ' + CHECKED_LABEL,
      products: ['pokerArena', 'pokerbros', 'pppoker', 'clubgg', 'xpoker', 'suprema'],
      columns: CLUB_COLUMNS,
    },
    sections: [
      {
        heading: 'Which Club App Fits What You Need',
        bullets: [
          p('Most Omaha Variants: X-Poker Lists 4, 5 And 6 Card Pot Limit Omaha, Hi/Lo, Double Board And Bomb Pot.', ['xpokerAppStore']),
          p('A Desktop Client: ClubGG Offers Windows And macOS Downloads Alongside Its Phone Apps.', ['clubggSite']),
          p('Open Face Chinese: PPPoker, X-Poker And Suprema Poker All List OFC.', ['pppokerAppStore', 'xpokerAppStore', 'supremaAppStore']),
          p('Short Deck: PokerBros And Poker Arena Both List Short Deck.', ['pokerbrosAppStore', 'spPokerArena']),
          p('Unions Between Clubs: ClubGG, Suprema Poker And Poker Arena Each Describe Union Features.', ['clubggSite', 'supremaAppStore', 'spPokerArena']),
          p('Nothing To Buy: Poker Arena Is Free To Play, And Its Chips Are Play Credits Only.', ['spHome']),
        ],
      },
      {
        heading: 'What The Listings Say About Money',
        paragraphs: [
          p(
            'Four Of The Five Outside Apps Describe Themselves On Their Listings Or Sites As Play Money, Entertainment Only Or Simulated Gambling, Or Say Their Chips Or Tickets Have No Monetary Value. PokerBros Says Real Money Use Violates Its Terms. We Found No Such Statement On The X-Poker Listing, So That Cell Says Not Published.',
            ['pokerbrosAppStore', 'pppokerGooglePlay', 'clubggSite', 'supremaGooglePlay', 'xpokerAppStore']
          ),
          p(
            'These Listings Do Not Describe How Individual Clubs Run Their Chips, And This Page Makes No Claim About It. Smarter.Poker Is Plain About Its Own Product: There Is No Real-Money Gambling, Club Chips Have No Cash Value, And Diamonds Are A Promotional Rewards Currency.',
            ['spHome']
          ),
        ],
      },
      {
        heading: 'Where Poker Arena Falls Short',
        bullets: [
          p('The Poker Arena Page Does Not List Open Face Chinese, Which PPPoker, X-Poker And Suprema Poker Offer.', ['spPokerArena', 'pppokerAppStore', 'xpokerAppStore', 'supremaAppStore']),
          p('The Poker Arena Page Names No Windows Or macOS Client; ClubGG Offers Both.', ['spPokerArena', 'clubggSite']),
          p('ClubGG, PPPoker And X-Poker State How Many Tables You Can Play At Once; The Poker Arena Page Does Not.', ['clubggAppStore', 'pppokerAppStore', 'xpokerAppStore', 'spPokerArena']),
        ],
      },
      {
        heading: 'How This Was Checked',
        paragraphs: [
          p(
            'Every Fact Was Read On September 22, 2026 From The Page Linked Under Sources. We Did Not Use Star Ratings, Review Counts, Download Counts Or Anyone Else\'s Ranking, And We Will Check Every Source Again Each Quarter.'
          ),
        ],
      },
    ],
    faq: [
      {
        q: 'Are Poker Club Apps Free?',
        a: p(
          'All Five Outside Apps Here Are Free To Download With In-App Purchases, Mostly Diamonds Priced From $0.99 To $99.99. Poker Arena Is Free To Play.',
          ['pokerbrosAppStore', 'pppokerAppStore', 'clubggAppStore', 'xpokerAppStore', 'supremaAppStore', 'spHome']
        ),
      },
      {
        q: 'Which Club Apps Support Unions?',
        a: p('ClubGG Offers Union Tools And A Union Back Office, Suprema Poker Describes Connecting To Larger Player Networks, And Poker Arena Links Clubs Into Unions For Shared Player Pools.', ['clubggSite', 'supremaAppStore', 'spPokerArena']),
      },
    ],
    related: ['poker-arena-vs-pokerbros', 'poker-arena-vs-pppoker', 'poker-arena-vs-clubgg', 'how-to-start-a-private-online-poker-club', 'best-free-poker-apps-with-friends'],
    productLinks: ['pokerArena'],
    glossary: [],
  },

  // 2 ─────────────────────────────────────────────────────────────────────
  {
    slug: 'poker-arena-vs-pokerbros',
    kind: 'versus',
    title: 'Poker Arena Vs PokerBros',
    h1: 'Poker Arena Vs PokerBros',
    description:
      'Poker Arena And PokerBros Compared On Price, In-App Purchases, Games, Clubs, Platforms And Money, With The Places Where PokerBros Does More.',
    summary: p(
      'PokerBros Is A Free Club App From Thinklean Limited That Sells Diamonds From $0.99 To $99.99, With Store Listings On The Apple App Store And Google Play. Poker Arena Is Smarter.Poker\'s Free To Play Club Product, Played In A Browser Or The Mobile App With Play Credits Only. Both Offer Private Clubs With Hold\'em, Omaha And Short Deck.',
      ['pokerbrosAppStore', 'pokerbrosGooglePlay', 'spPokerArena', 'spHome']
    ),
    intro: p(
      'This Page Puts The Two Side By Side Using The PokerBros Store Listings And The Live Poker Arena Page. A Cell That Neither Source Fills Says Not Published.',
      ['pokerbrosAppStore', 'spPokerArena']
    ),
    table: {
      caption: 'Poker Arena And PokerBros, ' + CHECKED_LABEL,
      products: ['pokerArena', 'pokerbros'],
      columns: CLUB_VERSUS_COLUMNS,
    },
    sections: [
      {
        heading: 'Where PokerBros Does More',
        bullets: [
          p('PokerBros Has Listings On Both The Apple App Store And Google Play.', ['pokerbrosAppStore', 'pokerbrosGooglePlay']),
          p('PokerBros Names Sit And Go Tournaments As Well As Multi Table Tournaments; The Poker Arena Page Names Multi Table Tournaments Only.', ['pokerbrosAppStore', 'spPokerArena']),
        ],
      },
      {
        heading: 'Where Poker Arena Does More',
        bullets: [
          p('Poker Arena Lists Pineapple, And Table Options Including Straddles, Bomb Pots, Run It Twice And Insurance.', ['spPokerArena']),
          p('Poker Arena Describes Unions, An Agent System, A Cashier, A Chip Ledger And Settlement Tools; The PokerBros Listing Does Not Describe Operator Tools.', ['spPokerArena', 'pokerbrosAppStore']),
          p('Poker Arena Publishes How It Shuffles: Cryptographically Secure Random Values And An Unbiased Fisher-Yates Shuffle.', ['spPokerArenaFairGaming']),
        ],
      },
      {
        heading: 'Money',
        paragraphs: [
          p('The PokerBros App Store Listing Says Its Chips Have No Monetary Value And Are Non Redeemable, And That Using The App For Real Money Violates Its Terms.', ['pokerbrosAppStore']),
          p('On Smarter.Poker There Is No Real-Money Gambling. Club Chips Are Play Credits With No Cash Value, And Diamonds Are A Promotional Rewards Currency.', ['spHome']),
        ],
      },
    ],
    faq: [],
    related: ['best-poker-club-apps', 'poker-arena-vs-pppoker', 'poker-arena-vs-clubgg', 'how-to-start-a-private-online-poker-club'],
    productLinks: ['pokerArena'],
    glossary: [],
  },

  // 3 ─────────────────────────────────────────────────────────────────────
  {
    slug: 'poker-arena-vs-pppoker',
    kind: 'versus',
    title: 'Poker Arena Vs PPPoker',
    h1: 'Poker Arena Vs PPPoker',
    description:
      'Poker Arena And PPPoker Compared On Price, In-App Purchases, Games, Clubs, Platforms And Money, With The Places Where PPPoker Does More.',
    summary: p(
      'PPPoker Is A Free Club App, Sold In The United States By Green Shield Digital Limited, With Diamonds From $0.99 To $99.99 And NLH, PLO And OFC Games. Poker Arena Is Smarter.Poker\'s Free To Play Club Product With Hold\'em, Omaha, Short Deck And Pineapple, Played In A Browser Or The Mobile App With Play Credits Only.',
      ['pppokerAppStore', 'spPokerArena', 'spHome']
    ),
    intro: p(
      'This Page Uses The PPPoker USA Store Listings And The Live Poker Arena Page. A Cell That Neither Source Fills Says Not Published.',
      ['pppokerAppStore', 'pppokerGooglePlay', 'spPokerArena']
    ),
    table: {
      caption: 'Poker Arena And PPPoker, ' + CHECKED_LABEL,
      products: ['pokerArena', 'pppoker'],
      columns: CLUB_VERSUS_COLUMNS,
    },
    sections: [
      {
        heading: 'Where PPPoker Does More',
        bullets: [
          p('PPPoker Lists Open Face Chinese; The Poker Arena Page Does Not.', ['pppokerAppStore', 'spPokerArena']),
          p('PPPoker Says You Can Play Up To Three Tables At Once; The Poker Arena Page States No Number.', ['pppokerAppStore', 'spPokerArena']),
          p('PPPoker Runs On iPhone, iPad, Macs With Apple Silicon And Android Through The Stores.', ['pppokerAppStore', 'pppokerGooglePlay']),
        ],
      },
      {
        heading: 'Where Poker Arena Does More',
        bullets: [
          p('Poker Arena Lists Short Deck And Pineapple, And Table Options Including Straddles, Bomb Pots, Run It Twice And Insurance.', ['spPokerArena']),
          p('Poker Arena Describes Unions, An Agent System, A Cashier, A Chip Ledger And Settlement Tools; The PPPoker Listing Does Not Describe Operator Tools.', ['spPokerArena', 'pppokerAppStore']),
          p('Poker Arena Needs No Purchase To Play.', ['spHome']),
        ],
      },
      {
        heading: 'Money',
        paragraphs: [
          p('The PPPoker Google Play Listing Says The Game Does Not Offer Real-Money Gambling Or A Chance To Win Real Money.', ['pppokerGooglePlay']),
          p('On Smarter.Poker There Is No Real-Money Gambling. Club Chips Are Play Credits With No Cash Value, And Diamonds Are A Promotional Rewards Currency.', ['spHome']),
        ],
      },
    ],
    faq: [],
    related: ['best-poker-club-apps', 'poker-arena-vs-pokerbros', 'poker-arena-vs-clubgg', 'how-to-start-a-private-online-poker-club'],
    productLinks: ['pokerArena'],
    glossary: [],
  },

  // 4 ─────────────────────────────────────────────────────────────────────
  {
    slug: 'poker-arena-vs-clubgg',
    kind: 'versus',
    title: 'Poker Arena Vs ClubGG',
    h1: 'Poker Arena Vs ClubGG',
    description:
      'Poker Arena And ClubGG Compared On Price, Memberships, Games, Clubs And Unions, Platforms And Money, With The Places Where ClubGG Does More.',
    summary: p(
      'ClubGG Is A Free Club App From NSUS With Diamonds, WSOP+ Memberships At $9.99 And $49.99, Union Tools, And Apps For Phones, Windows And macOS. Poker Arena Is Smarter.Poker\'s Free To Play Club Product With Hold\'em, Omaha, Short Deck And Pineapple, Played In A Browser Or The Mobile App With Play Credits Only.',
      ['clubggAppStore', 'clubggSite', 'spPokerArena', 'spHome']
    ),
    intro: p(
      'This Page Uses The ClubGG Site And Store Listings And The Live Poker Arena Page. A Cell That Neither Source Fills Says Not Published.',
      ['clubggSite', 'clubggAppStore', 'spPokerArena']
    ),
    table: {
      caption: 'Poker Arena And ClubGG, ' + CHECKED_LABEL,
      products: ['pokerArena', 'clubgg'],
      columns: CLUB_VERSUS_COLUMNS,
    },
    sections: [
      {
        heading: 'Where ClubGG Does More',
        bullets: [
          p('ClubGG Offers Windows And macOS Downloads As Well As Apple App Store And Google Play Apps.', ['clubggSite']),
          p('ClubGG Lists 5 Card Omaha And Says You Can Play 4 Tables At Once.', ['clubggAppStore']),
          p('ClubGG Has A Union Back Office, And Sells WSOP+ Basic And WSOP+ Premium Memberships.', ['clubggSite', 'clubggAppStore']),
        ],
      },
      {
        heading: 'Where Poker Arena Does More',
        bullets: [
          p('Poker Arena Lists Short Deck And Pineapple, And Table Options Including Straddles, Bomb Pots, Run It Twice And Insurance.', ['spPokerArena']),
          p('Poker Arena Describes An Agent System, A Cashier, A Chip Ledger And Settlement Tools For Club Operators.', ['spPokerArena']),
          p('Poker Arena Needs No Purchase Or Membership To Play.', ['spHome']),
        ],
      },
      {
        heading: 'Money',
        paragraphs: [
          p('The ClubGG Site Says Tournament Tickets Have No Monetary Value, And Google Play Rates The App For Simulated Gambling.', ['clubggSite', 'clubggGooglePlay']),
          p('On Smarter.Poker There Is No Real-Money Gambling. Club Chips Are Play Credits With No Cash Value, And Diamonds Are A Promotional Rewards Currency.', ['spHome']),
        ],
      },
    ],
    faq: [],
    related: ['best-poker-club-apps', 'poker-arena-vs-pokerbros', 'poker-arena-vs-pppoker', 'how-to-start-a-private-online-poker-club'],
    productLinks: ['pokerArena'],
    glossary: [],
  },

  // 5 ─────────────────────────────────────────────────────────────────────
  {
    slug: 'best-free-poker-apps-with-friends',
    kind: 'best-of',
    title: 'Best Free Poker Apps To Play With Friends',
    h1: 'Best Free Poker Apps To Play With Friends',
    description:
      'EasyPoker, Pokerrrr 2, PokerStars Home Games And Poker Arena Compared For A Private Game With Friends: Price, Extras, Games, Table Size And Money.',
    summary: p(
      'For A Private Game With Friends, EasyPoker Is Free With No Chips To Buy And Seats Up To 12 At A Table; Pokerrrr 2 Is Free With Gold For Sale And Adds OFC, Blackjack And Rummy; PokerStars Home Games Needs A PokerStars Account And Can Run Play Money Or Real Money Games; And Poker Arena Is Free To Play With Private Clubs And Play Credits Only.',
      ['easypokerSite', 'pokerrrrAppStore', 'pokernewsHomeGamesGuide', 'spPokerArena', 'spHome']
    ),
    intro: p(
      'Each Fact Below Comes From The App Store Listing Or Maker Site Linked Under Sources. The PokerStars Home Games Page Redirected Away When We Tried To Read It From The United States, So Those Facts Come From PokerNews And Carry Its Dates.',
      ['pokernewsHomeGamesGuide', 'pokernewsHomeGamesMobile']
    ),
    table: {
      caption: 'Free Poker Apps For Friends, ' + CHECKED_LABEL,
      products: ['pokerArena', 'easypoker', 'pokerrrr2', 'pokerstarsHomeGames'],
      columns: FRIENDS_COLUMNS,
    },
    sections: [
      {
        heading: 'Which One Fits Your Game',
        bullets: [
          p('A Quick Game With No Accounts To Explain: EasyPoker Uses A Private Table And A 4 Digit PIN, With Free Voice Chat.', ['easypokerSite']),
          p('More Than Poker: Pokerrrr 2 Adds Blackjack 21 And Rummy To Hold\'em, Omaha And OFC.', ['pokerrrrAppStore']),
          p('Mixed Games: PokerNews Lists Stud, Razz, Draw Games, H.O.R.S.E. And Badugi In PokerStars Home Games.', ['pokernewsHomeGamesMobile']),
          p('A Standing Club With Tournaments And Hand Replays: Poker Arena Runs Private Clubs With Multi Table Tournaments And Recorded Hands.', ['spPokerArena']),
        ],
      },
      {
        heading: 'Where Poker Arena Falls Short',
        bullets: [
          p('EasyPoker Has Free Voice Chat At The Table; The Poker Arena Page Does Not Mention Voice Chat.', ['easypokerSite', 'spPokerArena']),
          p('PokerStars Home Games Offers Stud, Draw And Mixed Games; The Poker Arena Page Lists Hold\'em, Omaha, Short Deck And Pineapple.', ['pokernewsHomeGamesMobile', 'spPokerArena']),
        ],
      },
      {
        heading: 'Money',
        paragraphs: [
          p('EasyPoker Says It Has No Real Money Play, No Cash Prizes And No Chips To Buy, And Pokerrrr 2 Says It Does Not Offer Real-Money Gambling. PokerNews Reports That PokerStars Home Games Can Be Played For Play Money Or Real Money.', ['easypokerSite', 'pokerrrrAppStore', 'pokernewsHomeGamesGuide']),
          p('On Smarter.Poker There Is No Real-Money Gambling. Club Chips Are Play Credits With No Cash Value, And Diamonds Are A Promotional Rewards Currency.', ['spHome']),
        ],
      },
    ],
    faq: [
      {
        q: 'Can I Play Poker With Friends Online For Free?',
        a: p('Yes. EasyPoker Is Free To Play, Pokerrrr 2 Is Free To Download With Optional Purchases, And Poker Arena Is Free To Play.', ['easypokerSite', 'pokerrrrAppStore', 'spHome']),
      },
    ],
    related: ['best-poker-club-apps', 'how-to-start-a-private-online-poker-club', 'poker-arena-vs-clubgg'],
    productLinks: ['pokerArena'],
    glossary: [],
  },

  // 6 ─────────────────────────────────────────────────────────────────────
  {
    slug: 'how-to-start-a-private-online-poker-club',
    kind: 'guide',
    title: 'How To Start A Private Online Poker Club',
    h1: 'How To Start A Private Online Poker Club',
    description:
      'The Steps To Start A Private Online Poker Club, How Unions And Agents Work In Club Apps, And The Legal Questions To Answer Before You Invite Anyone.',
    summary: p(
      'To Start A Private Online Poker Club, Decide Who It Is For, Check The Law Where You And Your Players Live, Pick A Club App, Create The Club And Set Its Games And Rules, Invite Players, Then Set Up Operator Tools And A Tournament Schedule. Poker Arena Is Free To Play, And Its Chips Are Play Credits With No Cash Value.',
      ['spPokerArena', 'spHome']
    ),
    intro: p(
      'This Guide Is General Information For Anyone Starting A Club, On Any App. It Is Not Legal Advice, And The Rules That Apply To You Depend On Where You And Your Players Are.'
    ),
    steps: [
      p('Decide Who The Club Is For: A Regular Game With Friends, A League, Or A Wider Community. That Decides How Private It Should Be.'),
      p('Check The Law Where You And Every Player Live Before You Invite Anyone. See The Legal Caveats Below.'),
      p('Pick A Club App. The Best Poker Club Apps Page Compares Six Of Them Side By Side.'),
      p('Create The Club And Set Your Own Stakes And Rules. On Poker Arena That Covers Hold\'em, Omaha, Short Deck And Pineapple Tables.', ['spPokerArena']),
      p('Invite Players. On Poker Arena, Players Find Clubs From The Menu, And Private Clubs Require Approval Or An Invite.', ['spPokerArenaHelp']),
      p('Set Up The Operator Tools. Poker Arena Includes A Cashier, Chip Ledger, Agent System, Rake Settings, Reports And Settlement Tools.', ['spPokerArena']),
      p('Schedule Tournaments With A Blind Structure, And Decide On Rebuys And Bounties.', ['spPokerArena']),
      p('Write Down House Rules And Keep Records. Poker Arena Records Every Hand So It Can Be Replayed And Reviewed.', ['spPokerArena']),
    ],
    sections: [
      {
        heading: 'Unions Explained',
        paragraphs: [
          p('A Union Links Several Clubs So Their Players Can Sit At The Same Tables, Which Keeps Games Running When One Club Is Small.'),
          p('Poker Arena Describes Unions As Linking Clubs For Shared Player Pools. Suprema Poker\'s Listing Describes Connecting A Club To Larger Player Networks, And ClubGG Offers Union Tools And A Union Back Office.', ['spPokerArena', 'supremaAppStore', 'clubggSite']),
        ],
      },
      {
        heading: 'Agents Explained',
        paragraphs: [
          p('In Club Apps, An Agent Is Usually A Member The Club Owner Allows To Bring In And Look After A Group Of Players, With Their Own View Of Those Players\' Activity.'),
          p('On Poker Arena, The Agent System Sits With The Cashier And Chip Ledger In The Club Management Tools, And Every Chip It Tracks Is A Play Credit With No Cash Value.', ['spPokerArena', 'spHome']),
        ],
      },
      {
        heading: 'Legal Caveats',
        paragraphs: [
          p('Whether A Private Online Poker Club Is Lawful Depends On Where The Organizer And Each Player Are, And On Whether Anything Of Value Is Bought, Staked Or Won. The Answer Differs Between Countries, And Between States And Provinces Within Them.'),
          p('Before You Start, Get Advice From A Lawyer Licensed Where You And Your Players Are. This Page Is General Information, Not Legal Advice, And Nothing On It Says Any Arrangement Is Lawful For You.'),
          p('An App\'s Own Terms Also Apply. PokerBros, For Example, Says Using Its App For Real Money Violates Its Terms.', ['pokerbrosAppStore']),
        ],
      },
    ],
    faq: [
      {
        q: 'Is It Legal To Run A Private Online Poker Club?',
        a: p('It Depends On Where You And Your Players Are And On Whether Anything Of Value Changes Hands. Laws Differ By Country And By State, So Get Advice From A Lawyer Licensed Where You Operate. This Page Is Not Legal Advice.'),
      },
      {
        q: 'Do Poker Arena Chips Have Cash Value?',
        a: p('No. Club Chips Are Play Credits With No Cash Value, And There Is No Real-Money Gambling On Smarter.Poker.', ['spHome']),
      },
    ],
    related: ['best-poker-club-apps', 'poker-arena-vs-pokerbros', 'poker-arena-vs-clubgg', 'best-free-poker-apps-with-friends'],
    productLinks: ['pokerArena'],
    glossary: [],
  },

  // 7 ─────────────────────────────────────────────────────────────────────
  {
    slug: 'best-poker-room-management-software',
    kind: 'best-of',
    title: 'Best Poker Room Management Software',
    h1: 'Best Poker Room Management Software In 2026',
    description:
      'TableCaptain, Bravo Poker, TablesReady, PokerIQ, Pokerpy, Next Up Poker And Club Commander Compared On Price, Waitlists, Alerts, Tournaments And Reports.',
    summary: p(
      'This Page Compares Seven Poker Room Management Systems: TableCaptain From PokerAtlas, Bravo Poker From Genesis Gaming, TablesReady, PokerIQ, Pokerpy, Next Up Poker And Smarter.Poker\'s Club Commander. TablesReady Starts At $0 A Month, Pokerpy Is Free And Club Commander Is Free For Live Venues; TableCaptain Is Quoted On Request, PokerIQ Lists Pricing As Coming Soon, And Bravo And Next Up Publish No Price.',
      ['tablecaptainPokerAtlas', 'bravoGenesis', 'tablesreadyPricing', 'pokeriqSite', 'pokerpyRoom', 'nextupSite', 'spHome']
    ),
    intro: p(
      'Room Management Software Runs The Waitlist, Seats Players, Calls Them When A Seat Opens And Runs Tournaments. Each Fact Below Comes From The Maker Page Linked Under Sources; A Cell The Maker Does Not Fill Says Not Published.'
    ),
    table: {
      caption: 'Poker Room Management Software Compared, ' + CHECKED_LABEL,
      products: ['clubCommander', 'tablecaptain', 'bravo', 'tablesready', 'pokeriq', 'pokerpy', 'nextup'],
      columns: ROOM_COLUMNS,
    },
    sections: [
      {
        heading: 'Which System Fits Your Room',
        bullets: [
          p('Reaching Players Already Looking For A Game: TableCaptain Broadcasts Waitlists And Tournaments To PokerAtlas.', ['tablecaptainPokerAtlas']),
          p('Casino Reporting: Bravo Poker Lists Point Tracking, Table Drop Analysis, Room Statistics And Player Session History.', ['bravoGenesis']),
          p('A Simple Texting Waitlist: TablesReady Has A Free Plan With 150 Messages A Month.', ['tablesreadyPricing']),
          p('Membership Rooms And Social Clubs: Next Up Poker Adds Membership Management And Player Time Tracking For Billing.', ['nextupSite']),
          p('No Cost At All: Pokerpy Is Free With No Licensing Fees, And Club Commander Is Free For Live Venues.', ['pokerpyRoom', 'spHome']),
        ],
      },
      {
        heading: 'Where Club Commander Falls Short',
        bullets: [
          p('PokerAtlas Says It Reaches 6 Million Users A Year, And TableCaptain Rooms Are Listed There. We Publish No Audience Figure For Club Commander.', ['tablecaptainPokerAtlas']),
          p('Bravo Poker Lists Table Drop Analysis, Point Tracking And Online Tournament Seat Purchase; The Club Commander Pages We Checked Do Not.', ['bravoGenesis', 'spCommander', 'spHome']),
          p('Next Up Poker Includes A Website Builder And Player Time Tracking For Billing; The Club Commander Pages We Checked Do Not.', ['nextupSite', 'spCommander']),
        ],
      },
      {
        heading: 'How This Was Checked',
        paragraphs: [
          p('Every Fact Was Read On September 22, 2026 From The Page Linked Under Sources. We Did Not Use Ratings, Client Counts We Could Not Verify, Or Anyone Else\'s Ranking.'),
        ],
      },
    ],
    faq: [
      {
        q: 'Is There Free Poker Room Management Software?',
        a: p('Yes. Pokerpy Is Free With No Licensing Fees, TablesReady Has A $0 Plan, And Club Commander Is Free For Live Venues.', ['pokerpyRoom', 'tablesreadyPricing', 'spHome']),
      },
    ],
    related: ['club-commander-vs-tablecaptain', 'club-commander-vs-bravo-poker-live', 'best-poker-bankroll-trackers'],
    productLinks: ['clubCommander'],
    glossary: [],
  },

  // 8 ─────────────────────────────────────────────────────────────────────
  {
    slug: 'club-commander-vs-tablecaptain',
    kind: 'versus',
    title: 'Club Commander Vs TableCaptain',
    h1: 'Club Commander Vs TableCaptain',
    description:
      'Club Commander And TableCaptain Compared On Pricing, Waitlists, Seat Alerts, Tournaments, Player Apps And Audience, With Where TableCaptain Does More.',
    summary: p(
      'TableCaptain Is PokerAtlas\'s Poker Room Management System, Priced By Quote, That Broadcasts A Room\'s Waitlists And Tournaments To PokerAtlas. Club Commander Is Smarter.Poker\'s Room Management System, Free For Live Venues, With Digital Waitlists, SMS And Push Seat Alerts, Tournament Clocks And A Player Hub On The Web.',
      ['tablecaptainPokerAtlas', 'spHome', 'spCommander']
    ),
    intro: p(
      'This Page Uses The PokerAtlas TableCaptain Page And The Live Club Commander Pages. A Cell That Neither Source Fills Says Not Published.',
      ['tablecaptainPokerAtlas', 'spCommander']
    ),
    table: {
      caption: 'Club Commander And TableCaptain, ' + CHECKED_LABEL,
      products: ['clubCommander', 'tablecaptain'],
      columns: ROOM_VERSUS_COLUMNS,
    },
    sections: [
      {
        heading: 'Where TableCaptain Does More',
        bullets: [
          p('TableCaptain Games Appear On PokerAtlas, Which Says It Reaches 6 Million Users A Year. We Publish No Audience Figure For Club Commander.', ['tablecaptainPokerAtlas']),
          p('PokerAtlas Says TableCaptain Fits Rooms From 2 Tables To 200 Tables. The Club Commander Pages We Checked State No Room Size.', ['tablecaptainPokerAtlas', 'spCommander']),
        ],
      },
      {
        heading: 'Where Club Commander Does More',
        bullets: [
          p('Club Commander Publishes Its Price: Free For Live Venues. TableCaptain Is Quoted On Request.', ['spHome', 'tablecaptainPokerAtlas']),
          p('Club Commander Lists SMS And Push Seat Alerts, Season Leagues And Player Comps, And Spending Limits, Cooling Off And Self Exclusion.', ['spHome', 'spCommander']),
        ],
      },
    ],
    faq: [],
    related: ['best-poker-room-management-software', 'club-commander-vs-bravo-poker-live'],
    productLinks: ['clubCommander'],
    glossary: [],
  },

  // 9 ─────────────────────────────────────────────────────────────────────
  {
    slug: 'club-commander-vs-bravo-poker-live',
    kind: 'versus',
    title: 'Club Commander Vs Bravo Poker Live',
    h1: 'Club Commander Vs Bravo Poker Live',
    description:
      'Club Commander And Bravo Poker Live Compared On Pricing, Waitlists, Alerts, Tournaments, Player Apps And Reporting, With Where Bravo Does More.',
    summary: p(
      'Bravo Poker Is A Poker Room Management System From Genesis Gaming Solutions Covering Operations, Marketing And Payments, With The Free BravoPokerLive Player App; It Publishes No Price. Club Commander Is Smarter.Poker\'s Room Management System, Free For Live Venues, With Digital Waitlists, SMS And Push Seat Alerts, Tournament Clocks And A Player Hub On The Web.',
      ['bravoGenesis', 'bravoAppStore', 'spHome', 'spCommander']
    ),
    intro: p(
      'This Page Uses The Genesis Gaming Bravo Poker Page, The BravoPokerLive App Store Listing And The Live Club Commander Pages. A Cell That Neither Source Fills Says Not Published.',
      ['bravoGenesis', 'bravoAppStore', 'spCommander']
    ),
    table: {
      caption: 'Club Commander And Bravo Poker Live, ' + CHECKED_LABEL,
      products: ['clubCommander', 'bravo'],
      columns: ROOM_VERSUS_COLUMNS,
    },
    sections: [
      {
        heading: 'Where Bravo Poker Does More',
        bullets: [
          p('Bravo Poker Lists Point Tracking, Table Drop Analysis, Room Statistics And Player Session History.', ['bravoGenesis']),
          p('Bravo Poker Tracks Tournament Buy-Ins, Rebuys And Add-Ons, And Lets Players Buy Tournament Seats Online.', ['bravoGenesis']),
          p('BravoPokerLive Is A Native App On The Apple App Store.', ['bravoAppStore']),
        ],
      },
      {
        heading: 'Where Club Commander Does More',
        bullets: [
          p('Club Commander Publishes Its Price: Free For Live Venues. Genesis Gaming Publishes No Price On The Page We Read.', ['spHome', 'bravoGenesis']),
          p('Club Commander Lists Season Leagues, Desk Check In From A Phone, And Spending Limits, Cooling Off And Self Exclusion For Players.', ['spCommander']),
        ],
      },
    ],
    faq: [],
    related: ['best-poker-room-management-software', 'club-commander-vs-tablecaptain'],
    productLinks: ['clubCommander'],
    glossary: [],
  },

  // 10 ────────────────────────────────────────────────────────────────────
  {
    slug: 'best-gto-poker-trainers',
    kind: 'best-of',
    title: 'Best GTO Poker Trainers In 2026',
    h1: 'Best GTO Poker Trainers In 2026',
    description:
      'GTO Wizard, DTO, Odin, Deepsolver And Smarter.Poker GTO Training Compared On Price, Free Access, Training, Solvers, Hand Review And Platforms.',
    summary: p(
      'GTO Wizard Runs From $49 A Month With A Limited Free Version, DTO Cash From $9.99 A Month With One Free Spot, And Deepsolver From $49 A Month With A 2 Day Trial; Odin Showed Us No Prices. Smarter.Poker GTO Training Is Free, With 107 Training Games, A Library Of Solver Baselines And Free Hand History Review, But The Pages We Checked Offer No Custom Spot Solver Like The Ones GTO Wizard And Deepsolver Sell.',
      ['pokernewsGtoWizardPricing', 'gtowizardHelp', 'dtoCashPricing', 'deepsolverPricing', 'odinSite', 'spTraining', 'spSolutions', 'spHandHistory', 'spHome']
    ),
    intro: p(
      'A GTO Trainer Drills You Against Game Theory Optimal Play And Scores Each Decision. Each Fact Below Comes From The Maker Page, App Store Listing Or PokerNews Article Linked Under Sources.'
    ),
    table: {
      caption: 'GTO Poker Trainers Compared, ' + CHECKED_LABEL,
      products: ['smarterTraining', 'gtowizard', 'dto', 'odin', 'deepsolver'],
      columns: TRAINER_COLUMNS,
    },
    sections: [
      {
        heading: 'Which Trainer Fits How You Study',
        bullets: [
          p('Solve Your Own Spots: GTO Wizard And Deepsolver Both Sell A Solver You Point At A Spot You Define.', ['gtowizardSite', 'deepsolverPricing']),
          p('Play Against Bots: DTO Cash Has You Play GTO Bots With Instant Feedback At 100 Big Blinds.', ['dtoCashPricing']),
          p('Study On A Phone: DTO Cash Has An Apple App Store App; Deepsolver Says Mobile Is Not Supported.', ['dtoCashAppStore', 'deepsolverPricing']),
          p('Spend Nothing: Smarter.Poker GTO Training Is Free, Including Its Solutions Library And Hand History Review.', ['spHome', 'spSolutions', 'spHandHistory']),
        ],
      },
      {
        heading: 'Where Smarter.Poker Falls Short',
        bullets: [
          p('The Smarter.Poker Training Pages We Checked Offer A Library Of Solver Baselines, Not A Solver That Solves A Spot You Build. GTO Wizard And Deepsolver Sell One.', ['spSolutions', 'gtowizardSite', 'deepsolverPricing']),
          p('Hand History Review Reads TXT Files From PokerStars, GGPoker, 888 And ACR, And Shows A Grade Only When The Server Can Match The Exact Spot.', ['spHandHistory']),
        ],
      },
      {
        heading: 'A Note On Odin And Real Time Assistance',
        paragraphs: [
          p('PokerNews Reported In March 2023 That Odin Removed A 20 Second Delay And Advertised Instant Solutions, And That Its Founder Said It Could Be Used To Cheat But That Cheaters Would Be Caught. Check The Rules Of Any Site You Play On Before Using Any Tool During A Session.', ['pokernewsOdin']),
        ],
      },
      {
        heading: 'Why DTO Shows Two Prices',
        paragraphs: [
          p('The DTO Cash Pricing Page And The DTO Cash App Store Listing Show Different Pro Prices: $39.99 A Month On The Web And $29.99 A Month In The App Store. Both Are Shown As Published.', ['dtoCashPricing', 'dtoCashAppStore']),
        ],
      },
    ],
    faq: [
      {
        q: 'Is There A Free GTO Poker Trainer?',
        a: p('Smarter.Poker GTO Training Is Free. GTO Wizard Has A Free Version Limited To One Postflop Spot A Day, And DTO Cash Offers One Free Spot On The Web.', ['spHome', 'gtowizardHelp', 'dtoCashPricing']),
      },
    ],
    related: ['best-poker-bankroll-trackers', 'best-poker-club-apps'],
    productLinks: ['smarterTraining'],
    glossary: ['GTO', 'Nash Equilibrium', 'EV (Expected Value)', 'Nodelocking', 'Range', 'ICM'],
  },

  // 11 ────────────────────────────────────────────────────────────────────
  {
    slug: 'best-poker-bankroll-trackers',
    kind: 'best-of',
    title: 'Best Poker Bankroll Trackers In 2026',
    h1: 'Best Poker Bankroll Trackers In 2026',
    description:
      'Poker Bankroll Tracker, Poker Income And The Smarter.Poker Bankroll Manager Compared On Price, Session Logging, Analysis, Export And Platforms.',
    summary: p(
      'Poker Bankroll Tracker Is Free With A Pro Upgrade At $29.99 A Year, Runs On Apple, Android And Desktop, And Adds A Hand Replayer. Poker Income Costs $9.99 On The App Store And Tracks Cash Games And Tournaments With Monthly Reports. The Smarter.Poker Bankroll Manager Is Free On The Web, With Trips, Series, Tax Reports And CSV Export.',
      ['pbtAppStore', 'pbtSite', 'pokerIncomeAppStore', 'spBankroll']
    ),
    intro: p(
      'A Bankroll Tracker Is A Log Of What You Played, For How Long And What You Won Or Lost, So You Can See Your Win Rate And Variance. Each Fact Below Comes From The App Store Listing Or Maker Site Linked Under Sources.'
    ),
    table: {
      caption: 'Poker Bankroll Trackers Compared, ' + CHECKED_LABEL,
      products: ['bankrollManager', 'pokerBankrollTracker', 'pokerIncome'],
      columns: BANKROLL_COLUMNS,
    },
    sections: [
      {
        heading: 'Which Tracker Fits You',
        bullets: [
          p('Hand Replays And Opponent Stats: Poker Bankroll Tracker Records Hands, Including Bomb Pots And Run It Twice, And Tracks VPIP And PFR.', ['pbtAppStore']),
          p('Pay Once: Poker Income Is A $9.99 Paid App With No In-App Purchases Listed.', ['pokerIncomeAppStore']),
          p('Trips, Staking And Taxes: The Bankroll Manager Groups Sessions Into Trips And Series, And Adds A Staking Tracker, Toke Tracker And Tax Reports.', ['spBankroll']),
        ],
      },
      {
        heading: 'Where The Bankroll Manager Falls Short',
        bullets: [
          p('Poker Bankroll Tracker Has Apple, Google Play And Desktop Apps, Cloud Sync And A Public API; The Bankroll Manager Page Lists None Of Those.', ['pbtSite', 'spBankroll']),
          p('Poker Bankroll Tracker Includes A Hand Replayer And Odds And ICM Calculators; The Bankroll Manager Page Does Not List Them.', ['pbtSite', 'spBankroll']),
        ],
      },
      {
        heading: 'What The Bankroll Manager Is For',
        paragraphs: [
          p('The Bankroll Manager Is A Record Of Sessions You Log Yourself. There Is No Real-Money Gambling On Smarter.Poker.', ['spBankroll', 'spHome']),
        ],
      },
    ],
    faq: [
      {
        q: 'Is There A Free Poker Bankroll Tracker?',
        a: p('Yes. The Smarter.Poker Bankroll Manager Is Free, And Poker Bankroll Tracker Is Free To Download With An Optional Pro Upgrade.', ['spBankroll', 'pbtAppStore']),
      },
    ],
    related: ['best-gto-poker-trainers', 'best-poker-room-management-software'],
    productLinks: ['bankrollManager'],
    glossary: ['Variance', 'VPIP', 'ICM'],
  },
];

/**
 * Every page says how it was checked. Pages 1 and 7 write their own
 * version; the rest carry this one.
 */
const HOW_CHECKED = {
  heading: 'How This Was Checked',
  paragraphs: [
    p(
      'Every Fact On This Page Was Read On September 22, 2026 From The Pages Listed Under Sources. Where A Source Does Not Say Something, The Table Says Not Published Rather Than A Guess. We Did Not Use Star Ratings, Review Counts Or Rankings From Other Sites, And We Check Every Source Again Each Quarter.'
    ),
  ],
};
for (const page of COMPARE_PAGES) {
  if (!page.sections.some((section) => section.heading === HOW_CHECKED.heading)) page.sections.push(HOW_CHECKED);
}

// ─── Helpers the pages and the law share ──────────────────────────────────

export function getComparePage(slug) {
  return COMPARE_PAGES.find((page) => page.slug === slug) || null;
}

export function comparePath(slug) {
  return `${COMPARE_BASE}/${slug}`;
}

/** The cell for one product and attribute; missing means Not Published. */
export function cellFor(productId, key) {
  const product = PRODUCTS[productId];
  const value = product && product.facts ? product.facts[key] : undefined;
  if (value) return value;
  return { value: NOT_PUBLISHED, unknown: true, why: 'Not Stated By Any Source We Read.', asOf: AS_OF };
}

export function sourceKeysOf(value) {
  if (!value || !value.source) return [];
  return Array.isArray(value.source) ? value.source : [value.source];
}

/** Every copy block on a page that carries sources. */
export function pageBlocks(page) {
  const blocks = [page.summary, page.intro];
  (page.steps || []).forEach((b) => blocks.push(b));
  (page.sections || []).forEach((section) => {
    (section.paragraphs || []).forEach((b) => blocks.push(b));
    (section.bullets || []).forEach((b) => blocks.push(b));
  });
  (page.faq || []).forEach((item) => blocks.push(item.a));
  return blocks.filter(Boolean);
}

/**
 * The Sources list for a page: every source a table cell, a paragraph or
 * the play-credit disclosure rests on, in first-use order, own pages last.
 */
export function pageSources(page) {
  const keys = [];
  const add = (key) => {
    if (key && !keys.includes(key)) keys.push(key);
  };
  const table = page.table || { products: [], columns: [] };
  table.products.forEach((productId) => {
    table.columns.forEach((column) => sourceKeysOf(cellFor(productId, column.key)).forEach(add));
  });
  pageBlocks(page).forEach((block) => (block.sources || []).forEach(add));
  sourceKeysOf(PLAY_CREDIT_DISCLOSURE).forEach(add);
  const own = keys.filter((key) => SOURCES[key] && SOURCES[key].kind === 'own');
  const others = keys.filter((key) => !own.includes(key));
  return [...others, ...own].map((key) => ({ key, ...SOURCES[key] }));
}

/** Absolute URL of a product for an ItemList; only our own have one. */
export function productUrl(productId) {
  const product = PRODUCTS[productId];
  return product && product.own && product.href ? `${SITE_URL}${product.href}` : undefined;
}

// ─── Structured data ───────────────────────────────────────────────────────
//
// Article (publisher is the site Organization node, no author: author pages
// are not live), a BreadcrumbList, and an ItemList on the best-of pages.
// Never Review or AggregateRating: nothing here is a rating.

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const COMPARE_INDEX_TITLE = 'Poker App And Software Comparisons';

function breadcrumb(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function compareJsonLd(page) {
  const url = `${SITE_URL}${comparePath(page.slug)}`;
  const nodes = [
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: page.h1,
      description: page.description,
      url,
      mainEntityOfPage: url,
      datePublished: AS_OF,
      dateModified: AS_OF,
      inLanguage: 'en-US',
      publisher: { '@id': ORGANIZATION_ID },
      isPartOf: { '@id': WEBSITE_ID },
    },
    breadcrumb([
      { name: 'Home', path: '/' },
      { name: 'Comparisons', path: COMPARE_BASE },
      { name: page.h1, path: comparePath(page.slug) },
    ]),
  ];
  if (page.kind === 'best-of' && page.table) {
    nodes.push({
      '@type': 'ItemList',
      '@id': `${url}#list`,
      name: page.h1,
      numberOfItems: page.table.products.length,
      itemListElement: page.table.products.map((productId, index) => {
        const item = { '@type': 'ListItem', position: index + 1, name: PRODUCTS[productId].name };
        const href = productUrl(productId);
        if (href) item.url = href;
        return item;
      }),
    });
  }
  return nodes;
}

export function compareIndexJsonLd() {
  const url = `${SITE_URL}${COMPARE_BASE}`;
  return [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#page`,
      name: COMPARE_INDEX_TITLE,
      url,
      dateModified: AS_OF,
      publisher: { '@id': ORGANIZATION_ID },
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: COMPARE_PAGES.length,
        itemListElement: COMPARE_PAGES.map((page, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: page.h1,
          url: `${SITE_URL}${comparePath(page.slug)}`,
        })),
      },
    },
    breadcrumb([
      { name: 'Home', path: '/' },
      { name: 'Comparisons', path: COMPARE_BASE },
    ]),
  ];
}

/** Every route this module creates, for the sitemap and the law. */
export function compareRoutes() {
  return [COMPARE_BASE, ...COMPARE_PAGES.map((page) => comparePath(page.slug))];
}
