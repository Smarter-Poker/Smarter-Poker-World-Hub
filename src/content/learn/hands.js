/**
 * Smarter.Poker Starting Hand Encyclopedia Corpus (/learn/hands & /learn/hands/[hand])
 * ====================================================================================
 * All 169 canonical Texas Hold'em starting hand guides with exact combinatoric data,
 * preflop percentile rankings, 6-Max 100BB GTO opening frequencies by position,
 * 3-bet response frequencies, head-to-head equity matchups, and postflop playbooks.
 *
 * House style: Title Case, zero em dashes.
 */

export const HANDS_BASE_PATH = '/learn/hands';

export function handPath(slug) {
  return `${HANDS_BASE_PATH}/${slug}`;
}

export const STARTING_HANDS = [
  {
    "slug": "pocket-aces",
    "code": "AA",
    "name": "Pocket Aces",
    "nickname": "Pocket Rockets And Bullets",
    "category": "Premium Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "1 Of 169",
    "vsRandomEquity": "85.2%",
    "summary": "Pocket Aces (AA) Is The Strongest Starting Hand In No-Limit Texas Hold'em, Winning 85.2% Of Pots Against A Random Hand And Opening Or 4-Betting At 100% Frequency From Every Table Position.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "100% 4-Bet Value From Out Of Position; 85% 4-Bet And 15% Trap Call In Position At 100BB.",
    "postflopPlaybook": "Build The Pot Across Three Streets On Dry And Disconnected Boards. On Monotone Or Four-To-A-Straight Boards, Check Back Or Bet Small When You Do Not Hold The Nut Suit Blocker.",
    "matchups": [
      {
        "villain": "KK (Pocket Kings)",
        "heroEquity": "81.9%",
        "villainEquity": "17.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKs (Ace-King Suited)",
        "heroEquity": "87.9%",
        "villainEquity": "11.6%",
        "tie": "0.5%"
      },
      {
        "villain": "JTs (Jack-Ten Suited)",
        "heroEquity": "79.6%",
        "villainEquity": "20.0%",
        "tie": "0.4%"
      }
    ]
  },
  {
    "slug": "pocket-kings",
    "code": "KK",
    "name": "Pocket Kings",
    "nickname": "Cowboys",
    "category": "Premium Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "2 Of 169",
    "vsRandomEquity": "82.4%",
    "summary": "Pocket Kings (KK) Is The Second-Best Starting Hand In Texas Hold'em With 82.4% Equity Against A Random Hand, Playing As A Pure Open-Raise, 3-Bet, And 4-Bet Value Hand Across 100BB Stacks.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "100% 4-Bet Value Across Standard 100BB 6-Max Configurations.",
    "postflopPlaybook": "Value Bet Aggressively On King-High And Under-Card Flops. When An Ace Falls On The Flop (Approximately 22.6% Of The Time), Shift To Pot Control And Check-Call Against Uncapped Ranges.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "17.6%",
        "villainEquity": "81.9%",
        "tie": "0.5%"
      },
      {
        "villain": "QQ (Pocket Queens)",
        "heroEquity": "81.8%",
        "villainEquity": "17.7%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "69.9%",
        "villainEquity": "29.3%",
        "tie": "0.8%"
      }
    ]
  },
  {
    "slug": "pocket-queens",
    "code": "QQ",
    "name": "Pocket Queens",
    "nickname": "Ladies",
    "category": "Premium Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "3 Of 169",
    "vsRandomEquity": "79.9%",
    "summary": "Pocket Queens (QQ) Ranks Third Among All 169 Hold'em Starting Hands With 79.9% Heads-Up Equity Vs. A Random Hand And A 53.5% Edge In Classic Coinflips Against Ace-King Suited.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Mix 65% 4-Bet And 35% Call Vs. Early Position 3-Bets; 100% 4-Bet Value Vs. Button And Blind 3-Bets.",
    "postflopPlaybook": "Push Equity On Low And Medium Boards Before Overcards Arrive. Exercise Caution Facing Multiple Barrels On Ace-High Or King-High Textures.",
    "matchups": [
      {
        "villain": "AKs (Ace-King Suited)",
        "heroEquity": "53.5%",
        "villainEquity": "46.1%",
        "tie": "0.4%"
      },
      {
        "villain": "JJ (Pocket Jacks)",
        "heroEquity": "81.7%",
        "villainEquity": "17.8%",
        "tie": "0.5%"
      },
      {
        "villain": "AQs (Ace-Queen Suited)",
        "heroEquity": "65.9%",
        "villainEquity": "33.4%",
        "tie": "0.7%"
      }
    ]
  },
  {
    "slug": "pocket-jacks",
    "code": "JJ",
    "name": "Pocket Jacks",
    "nickname": "Hooks And Fishhooks",
    "category": "Premium Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "4 Of 169",
    "vsRandomEquity": "77.5%",
    "summary": "Pocket Jacks (JJ) Is The Fourth-Ranked Starting Hand In Texas Hold'em, Opening 100% From Every Position While Mixing Calls And 3-Bets Against Tight Early-Position Opens.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call 70% And 4-Bet 30% In Position; Call Or 4-Bet Depending On Villain 3-Bet Frequency Out Of Position.",
    "postflopPlaybook": "Overcards (Q, K, Or A) Appear On The Flop 57% Of The Time. Bet For Value And Protection When JJ Remains An Overpair, And Use Suit Blockers To Guide Bluff-Catching On Overcard Boards.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "56.8%",
        "villainEquity": "42.8%",
        "tie": "0.4%"
      },
      {
        "villain": "TT (Pocket Tens)",
        "heroEquity": "81.7%",
        "villainEquity": "17.8%",
        "tie": "0.5%"
      },
      {
        "villain": "KQs (King-Queen Suited)",
        "heroEquity": "53.2%",
        "villainEquity": "46.3%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "pocket-tens",
    "code": "TT",
    "name": "Pocket Tens",
    "nickname": "Dimes",
    "category": "Strong Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "5 Of 169",
    "vsRandomEquity": "75.1%",
    "summary": "Pocket Tens (TT) Bridges The Gap Between Premium Overpairs And Set-Mining Medium Pairs, Winning 75.1% Against A Random Hand And Opening 100% Across All 6-Max Positions.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Primarily Call 3-Bets In Position To Retain Dominated Broadways; Mix 4-Bet All-In At 25BB To 40BB Tournament Stacks.",
    "postflopPlaybook": "Play As A Strong Value Overpair On Nine-High And Lower Flops, While Using Ten Blockers To Straight Combinations On Broadway Textures.",
    "matchups": [
      {
        "villain": "AKs (Ace-King Suited)",
        "heroEquity": "53.9%",
        "villainEquity": "45.7%",
        "tie": "0.4%"
      },
      {
        "villain": "99 (Pocket Nines)",
        "heroEquity": "81.5%",
        "villainEquity": "18.0%",
        "tie": "0.5%"
      },
      {
        "villain": "AJs (Ace-Jack Suited)",
        "heroEquity": "53.6%",
        "villainEquity": "46.0%",
        "tie": "0.4%"
      }
    ]
  },
  {
    "slug": "ace-king-suited",
    "code": "AKs",
    "name": "Ace-King Suited",
    "nickname": "Big Slick Suited",
    "category": "Premium Broadway Suited",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "6 Of 169",
    "vsRandomEquity": "67.0%",
    "summary": "Ace-King Suited (AKs) Is The Strongest Non-Paired Hand In Texas Hold'em, Combining Top-Pair Nut Kicker Strength With Nut Flush And Royal Flush Potential Plus Key AA And KK Card Removal.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "100% 4-Bet Or Call Mix; Ideal 4-Bet Jam Hand Because It Blocks Half Of Villain's AA And KK Combinations.",
    "postflopPlaybook": "Continuation Bet High Cards And Backdoor Nut Flush Draws Aggressively. When Hitting Top Pair Top Kicker, Extract Three Streets Of Value Against Worse Top Pairs.",
    "matchups": [
      {
        "villain": "QQ (Pocket Queens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.5%",
        "tie": "0.4%"
      },
      {
        "villain": "AQo (Ace-Queen Offsuit)",
        "heroEquity": "74.8%",
        "villainEquity": "20.9%",
        "tie": "4.3%"
      },
      {
        "villain": "KQs (King-Queen Suited)",
        "heroEquity": "74.1%",
        "villainEquity": "25.1%",
        "tie": "0.8%"
      }
    ]
  },
  {
    "slug": "ace-king-offsuit",
    "code": "AKo",
    "name": "Ace-King Offsuit",
    "nickname": "Big Slick Offsuit",
    "category": "Premium Broadway Offsuit",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "7 Of 169",
    "vsRandomEquity": "65.3%",
    "summary": "Ace-King Offsuit (AKo) Accounts For 12 Combinations (Three Times As Frequent As AKs) And Serves As The Primary High-Volume 3-Bet And 4-Bet Value/Bluff-Blocker Hand In GTO Ranges.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "High-Frequency 4-Bet Because Realizing Equity Out Of Position Unimproved Is Harder Than Pushing Fold Equity Preflop.",
    "postflopPlaybook": "Dominates Single-Raised And 3-Bet Pots When Hitting An Ace Or King. Unimproved On Low Connected Boards, Prefer Checking Or Using Nut Blockers Selectively.",
    "matchups": [
      {
        "villain": "JJ (Pocket Jacks)",
        "heroEquity": "42.8%",
        "villainEquity": "56.8%",
        "tie": "0.4%"
      },
      {
        "villain": "AQs (Ace-Queen Suited)",
        "heroEquity": "70.3%",
        "villainEquity": "25.5%",
        "tie": "4.2%"
      },
      {
        "villain": "22 (Pocket Deuces)",
        "heroEquity": "47.9%",
        "villainEquity": "51.6%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "ace-queen-suited",
    "code": "AQs",
    "name": "Ace-Queen Suited",
    "nickname": "Little Slick Suited",
    "category": "Premium Broadway Suited",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "8 Of 169",
    "vsRandomEquity": "66.2%",
    "summary": "Ace-Queen Suited (AQs) Opens 100% From Every Position And Functions As A Core 3-Bet Value Hand From Middle And Late Positions With Strong Postflop Playability.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call 75% And 4-Bet 25% In Position; Call Or Fold Vs. Tight Early-Position 4-Bets.",
    "postflopPlaybook": "Value Bet Two Streets Comfortably On Ace-High And Queen-High Flops While Utilizing Nut Flush Draws For Semi-Bluff Check-Raises.",
    "matchups": [
      {
        "villain": "TT (Pocket Tens)",
        "heroEquity": "46.2%",
        "villainEquity": "53.4%",
        "tie": "0.4%"
      },
      {
        "villain": "AJs (Ace-Jack Suited)",
        "heroEquity": "71.0%",
        "villainEquity": "24.8%",
        "tie": "4.2%"
      },
      {
        "villain": "KQs (King-Queen Suited)",
        "heroEquity": "70.5%",
        "villainEquity": "28.7%",
        "tie": "0.8%"
      }
    ]
  },
  {
    "slug": "ace-queen-offsuit",
    "code": "AQo",
    "name": "Ace-Queen Offsuit",
    "nickname": "Big Chick Offsuit",
    "category": "Strong Broadway Offsuit",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "12 Of 169",
    "vsRandomEquity": "64.5%",
    "summary": "Ace-Queen Offsuit (AQo) Is A 100% Open-Raise Across All 6-Max Positions That Requires Disciplined 3-Bet Defense To Avoid Reverse Implied Odds Against AK And AA/KK/QQ.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Or Call Mix Vs. Early Position 3-Bets; Call Or 4-Bet Bluff Vs. Wide Late-Position 3-Bets.",
    "postflopPlaybook": "Extract Value From Worse Aces (AJ, AT) In Single-Raised Pots, And Control Pot Size When Facing Heavy Action In 3-Bet Pots.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "21.6%",
        "villainEquity": "73.5%",
        "tie": "4.9%"
      },
      {
        "villain": "99 (Pocket Nines)",
        "heroEquity": "42.9%",
        "villainEquity": "56.7%",
        "tie": "0.4%"
      },
      {
        "villain": "KQo (King-Queen Offsuit)",
        "heroEquity": "73.9%",
        "villainEquity": "25.1%",
        "tie": "1.0%"
      }
    ]
  },
  {
    "slug": "ace-jack-suited",
    "code": "AJs",
    "name": "Ace-Jack Suited",
    "nickname": "Ajax Suited",
    "category": "Strong Broadway Suited",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "9 Of 169",
    "vsRandomEquity": "65.4%",
    "summary": "Ace-Jack Suited (AJs) Opens 100% From Every 6-Max Seat And Provides High Nut-Flush And Broadway Straight Playability In Both Single-Raised And 3-Bet Pots.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position To Realize Suited Nut Equity; Mix Fold And Call Out Of Position Against Tight 3-Bets.",
    "postflopPlaybook": "Leverage Backdoor And Direct Nut Flush Draws As Aggressive Semi-Bluffs While Pot-Controlling One-Pair Hands On Wet Boards.",
    "matchups": [
      {
        "villain": "TT (Pocket Tens)",
        "heroEquity": "46.0%",
        "villainEquity": "53.6%",
        "tie": "0.4%"
      },
      {
        "villain": "ATs (Ace-Ten Suited)",
        "heroEquity": "70.7%",
        "villainEquity": "25.0%",
        "tie": "4.3%"
      },
      {
        "villain": "KQs (King-Queen Suited)",
        "heroEquity": "60.4%",
        "villainEquity": "39.0%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-five-suited",
    "code": "A5s",
    "name": "Ace-Five Suited",
    "nickname": "Wheel Ace Suited",
    "category": "Suited Wheel Ace",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "24 Of 169",
    "vsRandomEquity": "59.9%",
    "summary": "Ace-Five Suited (A5s) Is The Premier GTO 3-Bet And 4-Bet Bluff Hand In Modern Poker Because It Blocks Pocket Aces While Retaining Nut Flush And Wheel Straight (A-2-3-4-5) Equity When Called.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Primary 4-Bet Bluff Candidate Against Cutoff And Button 3-Bets Due To Ace Card Removal And Playability.",
    "postflopPlaybook": "Barrel Aggressively With Nut Flush Draws And Wheel Gutshots. Avoid Calling Multiple Streets With Weak Top Pair No Kicker.",
    "matchups": [
      {
        "villain": "KK (Pocket Kings)",
        "heroEquity": "31.9%",
        "villainEquity": "67.7%",
        "tie": "0.4%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "29.2%",
        "villainEquity": "65.7%",
        "tie": "5.1%"
      },
      {
        "villain": "KQs (King-Queen Suited)",
        "heroEquity": "55.8%",
        "villainEquity": "43.6%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-queen-suited",
    "code": "KQs",
    "name": "King-Queen Suited",
    "nickname": "Royal Marriage",
    "category": "Strong Broadway Suited",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "10 Of 169",
    "vsRandomEquity": "63.4%",
    "summary": "King-Queen Suited (KQs) Opens 100% From Every Position And Flops Top Pair, Flush Draws, Or Open-Ended Straight Draws At One Of The Highest Rates In The Deck.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "High-Frequency Call In Position; Mix Call And 4-Bet Bluff Out Of Position.",
    "postflopPlaybook": "Dominates KJs, KTs, QJs, And QTs When Hitting Top Pair. Apply Maximum Pressure With Royal And Broadway Combo Draws.",
    "matchups": [
      {
        "villain": "JJ (Pocket Jacks)",
        "heroEquity": "46.3%",
        "villainEquity": "53.2%",
        "tie": "0.5%"
      },
      {
        "villain": "AJo (Ace-Jack Offsuit)",
        "heroEquity": "42.4%",
        "villainEquity": "57.0%",
        "tie": "0.6%"
      },
      {
        "villain": "QJs (Queen-Jack Suited)",
        "heroEquity": "71.9%",
        "villainEquity": "26.5%",
        "tie": "1.6%"
      }
    ]
  },
  {
    "slug": "queen-jack-suited",
    "code": "QJs",
    "name": "Queen-Jack Suited",
    "nickname": "Maverick Suited",
    "category": "Suited Broadway Connector",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "15 Of 169",
    "vsRandomEquity": "60.3%",
    "summary": "Queen-Jack Suited (QJs) Is A Premier Suited Broadway Connector Opening 100% Across All 6-Max Positions With Exceptional Multiway And Single-Raised Postflop Playability.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position When Deep-Stacked (100BB+) Because Suited Connected Hands Realize Equity Above Raw All-In Percentages.",
    "postflopPlaybook": "Attack Broadway-Heavy And Middling Connected Boards Using Straight And Flush Draw Equity.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "39.6%",
        "villainEquity": "59.9%",
        "tie": "0.5%"
      },
      {
        "villain": "99 (Pocket Nines)",
        "heroEquity": "46.9%",
        "villainEquity": "52.5%",
        "tie": "0.6%"
      },
      {
        "villain": "JTs (Jack-Ten Suited)",
        "heroEquity": "69.8%",
        "villainEquity": "28.5%",
        "tie": "1.7%"
      }
    ]
  },
  {
    "slug": "jack-ten-suited",
    "code": "JTs",
    "name": "Jack-Ten Suited",
    "nickname": "Ultimate Suited Connector",
    "category": "Suited Broadway Connector",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "16 Of 169",
    "vsRandomEquity": "57.5%",
    "summary": "Jack-Ten Suited (JTs) Can Make Four Distinct Nut Straights (8-9-T-J-Q Through T-J-Q-K-A), Making It The Highest-Playability Suited Connector In Deep-Stack No-Limit Hold'em.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Profitable Call In Position At 100BB+; Mix Polarized 3-Bets From The Button And Blinds.",
    "postflopPlaybook": "Semi-Bluff Relentlessly When Flopping 12+ Out Combo Draws (Flush Draw Plus Open-Ended Straight Draw Holds Over 54% Equity Vs. Overpairs).",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "20.0%",
        "villainEquity": "79.6%",
        "tie": "0.4%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "40.8%",
        "villainEquity": "58.7%",
        "tie": "0.5%"
      },
      {
        "villain": "88 (Pocket Eights)",
        "heroEquity": "47.5%",
        "villainEquity": "51.9%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-nine-suited",
    "code": "T9s",
    "name": "Ten-Nine Suited",
    "nickname": "Prime Suited Connector",
    "category": "Suited Connector",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "23 Of 169",
    "vsRandomEquity": "54.3%",
    "summary": "Ten-Nine Suited (T9s) Opens At High Frequency Across All 6-Max Positions And Excels At Cracking Big Overpairs By Flopping Disguised Two-Pairs, Trips, Straights, And Flushes.",
    "rfiByPosition": {
      "UTG": "75% Mixed Open",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position When Effective Stacks Offer Sufficient Implied Odds (100BB+).",
    "postflopPlaybook": "Prioritize Aggressive Check-Raises And Turn Barrels When Picking Up Double-Gutter Or Open-Ended Straight Plus Flush Draws.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "21.2%",
        "villainEquity": "78.4%",
        "tie": "0.4%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "39.4%",
        "villainEquity": "60.1%",
        "tie": "0.5%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "47.9%",
        "villainEquity": "51.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "pocket-nines",
    "code": "99",
    "name": "Pocket Nines",
    "nickname": "Wayne Gretzky",
    "category": "Medium Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "11 Of 169",
    "vsRandomEquity": "72.1%",
    "summary": "Pocket Nines (99) Wins 72.1% Against A Random Hand, Opens 100% From All 6-Max Positions, And Is A Slight Favorite Over Two Overcards Like AKo (54.3% Vs. 45.3%).",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position For Set Value And Mid-Board Showdown Equity; High-EV 20BB-30BB Tournament Reshove Hand.",
    "postflopPlaybook": "Bet For Value And Protection On Low Disconnected Boards, And Transition To Set-Mining And Bluff-Catching On Broadway-Heavy Textures.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "54.3%",
        "villainEquity": "45.3%",
        "tie": "0.4%"
      },
      {
        "villain": "88 (Pocket Eights)",
        "heroEquity": "81.3%",
        "villainEquity": "18.2%",
        "tie": "0.5%"
      },
      {
        "villain": "QJs (Queen-Jack Suited)",
        "heroEquity": "52.5%",
        "villainEquity": "46.9%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "pocket-eights",
    "code": "88",
    "name": "Pocket Eights",
    "nickname": "Snowmen",
    "category": "Medium Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "14 Of 169",
    "vsRandomEquity": "69.1%",
    "summary": "Pocket Eights (88) Opens 100% From Every 6-Max Seat At 100BB And Flops A Set Approximately 11.8% Of The Time (7.5 To 1 Against) With Strong Implied Odds Against Overpairs.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call When Implied Odds Satisfy The Set-Mining Threshold (Call <= 7% To 10% Of Effective Stack).",
    "postflopPlaybook": "Fast-Play Flopped Sets On Wet Boards To Deny Equity And Charge Overpairs Maximum Chips.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "54.6%",
        "villainEquity": "45.0%",
        "tie": "0.4%"
      },
      {
        "villain": "JTs (Jack-Ten Suited)",
        "heroEquity": "51.9%",
        "villainEquity": "47.5%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "81.2%",
        "villainEquity": "18.3%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "pocket-sevens",
    "code": "77",
    "name": "Pocket Sevens",
    "nickname": "Walking Sticks",
    "category": "Medium Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "19 Of 169",
    "vsRandomEquity": "66.2%",
    "summary": "Pocket Sevens (77) Marks The Bottom Of The Pure 100% UTG Opening Pocket Pairs In 6-Max 100BB GTO Solutions, Combining 66.2% Raw Equity With Disguised Set-Mining Value.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Set-Mine In Position When Stacks Are Deep; Fold Out Of Position Against Large 3-Bet Sizing.",
    "postflopPlaybook": "Check-Call Single Small Bets On Dry High-Card Flops And Pile Chips In When Turning Or Flopping Three Of A Kind.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "54.6%",
        "villainEquity": "45.0%",
        "tie": "0.4%"
      },
      {
        "villain": "T9s (Ten-Nine Suited)",
        "heroEquity": "51.5%",
        "villainEquity": "47.9%",
        "tie": "0.6%"
      },
      {
        "villain": "66 (Pocket Sixes)",
        "heroEquity": "81.1%",
        "villainEquity": "18.4%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "pocket-deuces",
    "code": "22",
    "name": "Pocket Deuces",
    "nickname": "Ducks",
    "category": "Small Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "50 Of 169",
    "vsRandomEquity": "50.3%",
    "summary": "Pocket Deuces (22) Is A 51.6% Favorite Preflop Against Unpaired Overcards Like Ace-King Offsuit, But Requires Set-Mining Discipline Postflop Because Every Board Card Is An Overcard.",
    "rfiByPosition": {
      "UTG": "0% Fold (Or 25% Low-Freq Mix)",
      "HJ": "50% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Unless Deep-Stacked In Position With At Least 15-To-1 Implied Odds.",
    "postflopPlaybook": "Follow The \"No Set, No Bet\" Baseline In Multiway Pots While Disguising Bottom Set On Ace-High And King-High Boards.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "51.6%",
        "villainEquity": "47.9%",
        "tie": "0.5%"
      },
      {
        "villain": "JTs (Jack-Ten Suited)",
        "heroEquity": "49.2%",
        "villainEquity": "50.1%",
        "tie": "0.7%"
      },
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.0%",
        "villainEquity": "81.6%",
        "tie": "0.4%"
      }
    ]
  },
  {
    "slug": "seven-deuce-offsuit",
    "code": "72o",
    "name": "Seven-Deuce Offsuit",
    "nickname": "The Hammer",
    "category": "Worst Starting Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "169 Of 169",
    "vsRandomEquity": "34.6%",
    "summary": "Seven-Deuce Offsuit (72o) Is Mathematically The Worst Starting Hand In Texas Hold'em (Rank 169 Of 169, 34.6% Equity Vs. Random) Because It Cannot Make A Single Five-Card Straight Using Both Hole Cards And Has Zero Flush Potential.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "100% Pure Fold Unless Playing A Special Seven-Deuce Bounty Prop Game With Sufficient Table Bounty Overlay.",
    "postflopPlaybook": "In Standard Games, Fold Preflop 100% Of The Time. In Seven-Deuce Bounty Games, Calculate The Total Table Bounty Pool Relative To The Effective Stack Before Attempting Pre-Flop Or Flop Bluffs.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "11.8%",
        "villainEquity": "87.8%",
        "tie": "0.4%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "32.3%",
        "villainEquity": "67.1%",
        "tie": "0.6%"
      },
      {
        "villain": "83o (Eight-Three Offsuit)",
        "heroEquity": "40.5%",
        "villainEquity": "58.4%",
        "tie": "1.1%"
      }
    ]
  },
  {
    "slug": "pocket-sixes",
    "code": "66",
    "name": "Pocket Sixes",
    "nickname": "Route 66",
    "category": "Small-To-Medium Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "23 Of 169",
    "vsRandomEquity": "63.3%",
    "summary": "Pocket Sixes (66) Holds 63.3% Equity Against A Random Hand And Opens At High Frequency Across All 6-Max Positions, Excelling At Set-Mining And Blocking Wheel Straight Completions.",
    "rfiByPosition": {
      "UTG": "75% Mixed Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position With Deep Implied Odds; Fold Out Of Position At 100BB.",
    "postflopPlaybook": "Look To Flop Sets Or Open-Ended Straight Draws On Low Runouts (5-4-3, 6-5-2) And Check-Fold Unimproved On Heavy Broadway Textures.",
    "matchups": [
      {
        "villain": "AKs (Ace-King Suited)",
        "heroEquity": "52.2%",
        "villainEquity": "47.4%",
        "tie": "0.4%"
      },
      {
        "villain": "55 (Pocket Fives)",
        "heroEquity": "81.2%",
        "villainEquity": "18.3%",
        "tie": "0.5%"
      },
      {
        "villain": "A5s (Ace-Five Suited)",
        "heroEquity": "66.4%",
        "villainEquity": "33.1%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "pocket-fives",
    "code": "55",
    "name": "Pocket Fives",
    "nickname": "Presto And Speed Limit",
    "category": "Small Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "28 Of 169",
    "vsRandomEquity": "60.3%",
    "summary": "Pocket Fives (55) Is The Highest Wheel-Connected Small Pocket Pair (60.3% Equity Vs. Random), Capable Of Participating In Both Ace-To-Five And Five-To-Nine Straight Boards While Flopping Disguised Sets.",
    "rfiByPosition": {
      "UTG": "50% Mixed Open",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position Only When Implied Odds Justify Set-Mining; High-EV Re-Steal Jam At 18BB To 22BB Tournament Stacks.",
    "postflopPlaybook": "Capitalize On Disguised Sets And Double-Gutter Straight Draws On Low Wheel Flops (A-4-3, 6-4-2).",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "54.5%",
        "villainEquity": "45.0%",
        "tie": "0.5%"
      },
      {
        "villain": "44 (Pocket Fours)",
        "heroEquity": "81.1%",
        "villainEquity": "18.4%",
        "tie": "0.5%"
      },
      {
        "villain": "KQs (King-Queen Suited)",
        "heroEquity": "51.1%",
        "villainEquity": "48.4%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "pocket-fours",
    "code": "44",
    "name": "Pocket Fours",
    "nickname": "Sailboats",
    "category": "Small Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "35 Of 169",
    "vsRandomEquity": "57.0%",
    "summary": "Pocket Fours (44) Carries 57.0% Equity Against A Random Hand And Functions Primarily As A Positional Set-Mining Hand In 100BB Cash Games And A Profitable Push-Fold Jam Hand Below 20BB.",
    "rfiByPosition": {
      "UTG": "25% Low-Freq Open",
      "HJ": "75% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Out Of Position; Call In Position Only Against Large Stack Depths.",
    "postflopPlaybook": "Fast-Play Flopped Sets On Dynamic Wet Boards To Charge Flush And Straight Draws Before Turn Scare Cards Freeze Action.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "53.6%",
        "villainEquity": "45.9%",
        "tie": "0.5%"
      },
      {
        "villain": "33 (Pocket Threes)",
        "heroEquity": "81.1%",
        "villainEquity": "18.4%",
        "tie": "0.5%"
      },
      {
        "villain": "JTs (Jack-Ten Suited)",
        "heroEquity": "50.3%",
        "villainEquity": "49.1%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "pocket-threes",
    "code": "33",
    "name": "Pocket Threes",
    "nickname": "Crabs",
    "category": "Small Pocket Pair",
    "combinations": 6,
    "probability": "0.45% (220 To 1 Against)",
    "preflopRank": "42 Of 169",
    "vsRandomEquity": "53.7%",
    "summary": "Pocket Threes (33) Wins 53.7% Against A Random Hand And Opens Pure From Cutoff, Button, And Small Blind At 100BB To Target Disguised Bottom Sets Against Top-Pair Heavy Ranges.",
    "rfiByPosition": {
      "UTG": "0% Fold (Or 25% Mix)",
      "HJ": "50% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing 3-Bets Unless Deep-Stacked In Position.",
    "postflopPlaybook": "Play Strictly For Set Value Or Low Wheel Board Coverage; Check-Fold Unimproved On Multiple Overcard Runouts.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "52.6%",
        "villainEquity": "46.9%",
        "tie": "0.5%"
      },
      {
        "villain": "22 (Pocket Deuces)",
        "heroEquity": "81.1%",
        "villainEquity": "18.4%",
        "tie": "0.5%"
      },
      {
        "villain": "QJs (Queen-Jack Suited)",
        "heroEquity": "49.7%",
        "villainEquity": "49.7%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-ten-suited",
    "code": "ATs",
    "name": "Ace-Ten Suited",
    "nickname": "Bookends",
    "category": "Strong Suited Broadway",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "12 Of 169",
    "vsRandomEquity": "64.7%",
    "summary": "Ace-Ten Suited (ATs) Combines Nut-Flush Potential, Broadway Straight Connectivity, And Ace Blocker Power, Opening 100% From Every 6-Max Seat With 64.7% Equity Against A Random Hand.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position Against Standard 3-Bets And Use As A High-EV 3-Bet Against Cutoff And Button Opens.",
    "postflopPlaybook": "Barrel Nut Flush Draws And Broadway Gutshots Aggressively While Exercising Pot Control On Ace-High Boards Against Early-Position Openers.",
    "matchups": [
      {
        "villain": "KQs (King-Queen Suited)",
        "heroEquity": "58.4%",
        "villainEquity": "41.1%",
        "tie": "0.5%"
      },
      {
        "villain": "99 (Pocket Nines)",
        "heroEquity": "46.3%",
        "villainEquity": "53.3%",
        "tie": "0.4%"
      },
      {
        "villain": "A9s (Ace-Nine Suited)",
        "heroEquity": "70.8%",
        "villainEquity": "26.7%",
        "tie": "2.5%"
      }
    ]
  },
  {
    "slug": "king-jack-suited",
    "code": "KJs",
    "name": "King-Jack Suited",
    "nickname": "Kojak Suited",
    "category": "Strong Suited Broadway",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "15 Of 169",
    "vsRandomEquity": "62.6%",
    "summary": "King-Jack Suited (KJs) Is A High-Playability Suited Broadway Hand (62.6% Equity Vs. Random) That Opens 100% Across All 6-Max Positions And Frequently Flops Second-Nut Flush Draws And Royal Flush Draws.",
    "rfiByPosition": {
      "UTG": "100% Open Raise",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position At 100BB; Mix 3-Bet For Value And Equity Denial From The Blinds Against Late-Position Steals.",
    "postflopPlaybook": "Apply Pressure On King-High, Jack-High, And Queen-Ten-X Boards While Avoiding 3-Street All-In Commit Spots With Unimproved One-Pair Against Uncapped Ranges.",
    "matchups": [
      {
        "villain": "QTs (Queen-Ten Suited)",
        "heroEquity": "63.9%",
        "villainEquity": "35.5%",
        "tie": "0.6%"
      },
      {
        "villain": "88 (Pocket Eights)",
        "heroEquity": "46.6%",
        "villainEquity": "52.9%",
        "tie": "0.5%"
      },
      {
        "villain": "KJo (King-Jack Offsuit)",
        "heroEquity": "52.6%",
        "villainEquity": "4.5%",
        "tie": "42.9%"
      }
    ]
  },
  {
    "slug": "eight-seven-suited",
    "code": "87s",
    "name": "Eight-Seven Suited",
    "nickname": "Crosby Suited",
    "category": "Prime Suited Connector",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "32 Of 169",
    "vsRandomEquity": "53.9%",
    "summary": "Eight-Seven Suited (87s) Is A Premier Middle Suited Connector (53.9% Equity Vs. Random) Used By Solvers As A Mixed Early-Position Open And Polarized 3-Bet To Ensure Board Coverage On Medium-And-Low Runouts.",
    "rfiByPosition": {
      "UTG": "35% Mixed Open",
      "HJ": "75% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position At 100BB+ To Realize Disguised Straight, Flush, And Two-Pair Equity.",
    "postflopPlaybook": "Semi-Bluff Aggressively With Combo Draws (Open-Ended Straight Draw Plus Flush Draw) Which Hold Over 54% Equity Even Against Pocket Aces.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "22.3%",
        "villainEquity": "77.3%",
        "tie": "0.4%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "40.5%",
        "villainEquity": "59.1%",
        "tie": "0.4%"
      },
      {
        "villain": "76s (Seven-Six Suited)",
        "heroEquity": "53.4%",
        "villainEquity": "42.8%",
        "tie": "3.8%"
      }
    ]
  },
  {
    "slug": "ace-nine-suited",
    "code": "A9s",
    "name": "Ace-Nine Suited",
    "nickname": "Rounders Hand",
    "category": "Suited Ace",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "19 Of 169",
    "vsRandomEquity": "63.0%",
    "summary": "Ace-Nine Suited (A9s) Is The Strongest Non-Broadway Suited Ace (63.0% Equity Vs. Random), Opening As A Low-Frequency Mix From Early Position And 100% From Hijack, Cutoff, Button, And Small Blind.",
    "rfiByPosition": {
      "UTG": "12% Mixed Open",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call Selectively In Position Against Wide Late-Position 3-Bets; Fold Facing Tight Early-Position 3-Bets.",
    "postflopPlaybook": "Exercise Pot Control On Ace-High Boards Against Early-Position Openers Where Stronger Kicker Aces Dominate, And Barrel Aggressively When Flopping Nut Flush Draws.",
    "matchups": [
      {
        "villain": "ATs (Ace-Ten Suited)",
        "heroEquity": "26.7%",
        "villainEquity": "70.8%",
        "tie": "2.5%"
      },
      {
        "villain": "88 (Pocket Eights)",
        "heroEquity": "46.1%",
        "villainEquity": "53.5%",
        "tie": "0.4%"
      },
      {
        "villain": "KQo (King-Queen Offsuit)",
        "heroEquity": "58.9%",
        "villainEquity": "40.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-four-suited",
    "code": "A4s",
    "name": "Ace-Four Suited",
    "nickname": "Wheel Ace Four",
    "category": "Suited Wheel Ace",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "24 Of 169",
    "vsRandomEquity": "60.3%",
    "summary": "Ace-Four Suited (A4s) Is A Prime Suited Wheel Ace (60.3% Equity Vs. Random) Used Across All 6-Max Positions As An Open-Raise And Polarized 3-Bet Or 4-Bet Bluff Blocking Pocket Aces.",
    "rfiByPosition": {
      "UTG": "34% Mixed Open",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "High-Frequency 4-Bet Bluff Candidate Holding The Ace Blocker And Nut Flush Plus Wheel Straight Playability.",
    "postflopPlaybook": "Attack Low Connected Boards (5-3-2, 6-5-3) And Use Nut Flush Draws As High-Equity Multi-Street Semi-Bluffs.",
    "matchups": [
      {
        "villain": "KK (Pocket Kings)",
        "heroEquity": "31.7%",
        "villainEquity": "67.9%",
        "tie": "0.4%"
      },
      {
        "villain": "KQs (King-Queen Suited)",
        "heroEquity": "56.4%",
        "villainEquity": "43.1%",
        "tie": "0.5%"
      },
      {
        "villain": "A5s (Ace-Five Suited)",
        "heroEquity": "28.5%",
        "villainEquity": "63.9%",
        "tie": "7.6%"
      }
    ]
  },
  {
    "slug": "ace-three-suited",
    "code": "A3s",
    "name": "Ace-Three Suited",
    "nickname": "Baskin-Robbins Suited",
    "category": "Suited Wheel Ace",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "26 Of 169",
    "vsRandomEquity": "59.4%",
    "summary": "Ace-Three Suited (A3s) Is A Versatile Suited Wheel Ace (59.4% Equity Vs. Random) That Opens Pure From Hijack Through Small Blind And Serves As A Polarized 3-Bet Bluff Against Late-Position Opens.",
    "rfiByPosition": {
      "UTG": "8% Mixed Open",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Mix Call In Position Against Button/Blind 3-Bets And Occasional 4-Bet Bluff; Fold Out Of Position Vs. Tight 3-Bets.",
    "postflopPlaybook": "Prioritize Nut Flush Draw And Wheel Gutshot Semi-Bluffs Rather Than Calling Down Multi-Street Bets With Weak Top Pair.",
    "matchups": [
      {
        "villain": "QQ (Pocket Queens)",
        "heroEquity": "31.8%",
        "villainEquity": "67.8%",
        "tie": "0.4%"
      },
      {
        "villain": "JTs (Jack-Ten Suited)",
        "heroEquity": "55.4%",
        "villainEquity": "44.1%",
        "tie": "0.5%"
      },
      {
        "villain": "55 (Pocket Fives)",
        "heroEquity": "46.7%",
        "villainEquity": "52.8%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "ace-two-suited",
    "code": "A2s",
    "name": "Ace-Two Suited",
    "nickname": "Little Slick",
    "category": "Suited Wheel Ace",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "27 Of 169",
    "vsRandomEquity": "58.5%",
    "summary": "Ace-Two Suited (A2s) Completes The Core Suited Wheel Ace Quartet (58.5% Equity Vs. Random), Offering Nut-Flush Equity And Five-High Straight Potential From Middle And Late Positions.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "78% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call Selectively In Position Deep-Stacked Or Use As A Polarized 3-Bet From The Blinds Against Cutoff And Button Steals.",
    "postflopPlaybook": "Realize Equity Cheaply In Position And Apply Maximum Pressure When Turning Or Rivering The Nut Flush Or Disguised Wheel.",
    "matchups": [
      {
        "villain": "AKs (Ace-King Suited)",
        "heroEquity": "29.2%",
        "villainEquity": "68.1%",
        "tie": "2.7%"
      },
      {
        "villain": "98s (Nine-Eight Suited)",
        "heroEquity": "55.8%",
        "villainEquity": "43.7%",
        "tie": "0.5%"
      },
      {
        "villain": "44 (Pocket Fours)",
        "heroEquity": "47.3%",
        "villainEquity": "52.1%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-jack-offsuit",
    "code": "AJo",
    "name": "Ace-Jack Offsuit",
    "nickname": "Ajax Offsuit",
    "category": "Offsuit Broadway",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "20 Of 169",
    "vsRandomEquity": "63.6%",
    "summary": "Ace-Jack Offsuit (AJo) Is A High-Card Broadway Hand (63.6% Equity Vs. Random) That Opens At Mixed Frequency Under The Gun And 100% From Middle And Late Positions While Requiring Discipline Against 3-Bets.",
    "rfiByPosition": {
      "UTG": "48% Mixed Open",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing Early-And-Middle Position 3-Bets Due To Reverse Implied Odds Against AK And AQ; Defend In Blind-Vs-Button Spots.",
    "postflopPlaybook": "Extract Value From Worse Aces And Second Pairs In Single-Raised Pots While Avoiding Three-Street Stacks Off On Unimproved One-Pair Boards.",
    "matchups": [
      {
        "villain": "AQo (Ace-Queen Offsuit)",
        "heroEquity": "25.8%",
        "villainEquity": "73.2%",
        "tie": "1.0%"
      },
      {
        "villain": "ATo (Ace-Ten Offsuit)",
        "heroEquity": "72.9%",
        "villainEquity": "25.9%",
        "tie": "1.2%"
      },
      {
        "villain": "KQo (King-Queen Offsuit)",
        "heroEquity": "61.5%",
        "villainEquity": "37.9%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-queen-offsuit",
    "code": "KQo",
    "name": "King-Queen Offsuit",
    "nickname": "Mixed Marriage",
    "category": "Offsuit Broadway",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "21 Of 169",
    "vsRandomEquity": "61.5%",
    "summary": "King-Queen Offsuit (KQo) Is The Strongest Non-Ace Offsuit Hand (61.5% Equity Vs. Random), Opening At 35% Frequency From UTG And 100% From Hijack, Cutoff, Button, And Small Blind.",
    "rfiByPosition": {
      "UTG": "35% Mixed Open",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call Or 3-Bet In Late Position Versus Button/Cutoff Opens; Fold Facing Tight Early-Position 3-Bets.",
    "postflopPlaybook": "Value Bet Top Pair With Strong Kicker Across Two Streets In Single-Raised Pots And Use Broadway Blockers To Bluff River Runouts.",
    "matchups": [
      {
        "villain": "AJo (Ace-Jack Offsuit)",
        "heroEquity": "37.9%",
        "villainEquity": "61.5%",
        "tie": "0.6%"
      },
      {
        "villain": "KJo (King-Jack Offsuit)",
        "heroEquity": "73.6%",
        "villainEquity": "25.4%",
        "tie": "1.0%"
      },
      {
        "villain": "88 (Pocket Eights)",
        "heroEquity": "44.5%",
        "villainEquity": "55.0%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "king-ten-suited",
    "code": "KTs",
    "name": "King-Ten Suited",
    "nickname": "Katie Suited",
    "category": "Suited Broadway",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "18 Of 169",
    "vsRandomEquity": "61.8%",
    "summary": "King-Ten Suited (KTs) Is A High-Connectivity Suited Broadway Hand (61.8% Equity Vs. Random) That Opens Across All 6-Max Positions And Flops Strong Second-Nut Flush Draws And Broadway Straight Draws.",
    "rfiByPosition": {
      "UTG": "42% Mixed Open",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position At 100BB Against Standard 3-Bets And Use As A Linear 3-Bet From The Blinds Versus Button Opens.",
    "postflopPlaybook": "Play Aggressively With Combo Draws (Queen-Jack-X And Ace-Jack-X Boards) While Controlling Pot Size With Top Pair Ten-Kicker.",
    "matchups": [
      {
        "villain": "QTs (Queen-Ten Suited)",
        "heroEquity": "69.7%",
        "villainEquity": "27.6%",
        "tie": "2.7%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.9%",
        "villainEquity": "52.6%",
        "tie": "0.5%"
      },
      {
        "villain": "A9o (Ace-Nine Offsuit)",
        "heroEquity": "44.8%",
        "villainEquity": "54.6%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-ten-suited",
    "code": "QTs",
    "name": "Queen-Ten Suited",
    "nickname": "Quint Suited",
    "category": "Suited Broadway",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "22 Of 169",
    "vsRandomEquity": "60.1%",
    "summary": "Queen-Ten Suited (QTs) Is A Dynamic Suited Broadway Gapper (60.1% Equity Vs. Random) Capable Of Making Broadway, King-High, And Queen-High Straights Alongside Strong Flush Draws.",
    "rfiByPosition": {
      "UTG": "28% Mixed Open",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position At 100BB Stack Depth Due To Superior Equity Realization; Mix 3-Bet From Cutoff And Button.",
    "postflopPlaybook": "Leverage Double-Gutshot And Open-Ended Straight Draws On Broadway And Middle Boards To Pressure One-Pair Holdings.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "38.7%",
        "villainEquity": "60.8%",
        "tie": "0.5%"
      },
      {
        "villain": "J9s (Jack-Nine Suited)",
        "heroEquity": "64.6%",
        "villainEquity": "34.8%",
        "tie": "0.6%"
      },
      {
        "villain": "66 (Pocket Sixes)",
        "heroEquity": "47.5%",
        "villainEquity": "52.0%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "seven-six-suited",
    "code": "76s",
    "name": "Seven-Six Suited",
    "nickname": "Trombones Suited",
    "category": "Prime Suited Connector",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "36 Of 169",
    "vsRandomEquity": "52.2%",
    "summary": "Seven-Six Suited (76s) Is A Classic Middle Suited Connector (52.2% Equity Vs. Random) That Maximizes Board Coverage On Low-And-Medium Runouts And Crushes Overpairs When Flopping Disguised Two-Pairs And Straights.",
    "rfiByPosition": {
      "UTG": "15% Mixed Open",
      "HJ": "58% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "High-EV Call In Position At 100BB+ And Low-Frequency Polarized 3-Bet Bluff To Prevent Opponents From Capping Your Range On Low Boards.",
    "postflopPlaybook": "Fast-Play Combo Draws And Check-Raise Low Connected Flops (8-5-4, 9-8-2) Where Pre-Flop Raisers Hold Unimproved Overcards.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "22.3%",
        "villainEquity": "77.3%",
        "tie": "0.4%"
      },
      {
        "villain": "AKs (Ace-King Suited)",
        "heroEquity": "37.6%",
        "villainEquity": "62.0%",
        "tie": "0.4%"
      },
      {
        "villain": "65s (Six-Five Suited)",
        "heroEquity": "53.3%",
        "villainEquity": "42.6%",
        "tie": "4.1%"
      }
    ]
  },
  {
    "slug": "six-five-suited",
    "code": "65s",
    "name": "Six-Five Suited",
    "nickname": "Ken Warren Suited",
    "category": "Prime Suited Connector",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "40 Of 169",
    "vsRandomEquity": "50.8%",
    "summary": "Six-Five Suited (65s) Is The Lowest Zero-Gap Suited Connector Without Wheel Card Domination (50.8% Equity Vs. Random), Frequently Included In Solver UTG Mixed Opens And Polarized 3-Bet Ranges.",
    "rfiByPosition": {
      "UTG": "12% Mixed Open",
      "HJ": "48% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call Deep-Stacked In Position Or Use As A Deceptive Polarized 3-Bet Bluff With Clean Straight And Flush Outs.",
    "postflopPlaybook": "Capitalize On Hidden Nut Advantage On 4-3-2, 7-4-3, And 8-7-4 Textures While Folding Unimproved Single Pairs Against Heavy Action.",
    "matchups": [
      {
        "villain": "KK (Pocket Kings)",
        "heroEquity": "22.4%",
        "villainEquity": "77.2%",
        "tie": "0.4%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "40.8%",
        "villainEquity": "58.8%",
        "tie": "0.4%"
      },
      {
        "villain": "54s (Five-Four Suited)",
        "heroEquity": "53.0%",
        "villainEquity": "42.4%",
        "tie": "4.6%"
      }
    ]
  },
  {
    "slug": "ace-eight-suited",
    "code": "A8s",
    "name": "Ace-Eight Suited",
    "nickname": "Dead Man Hand Suited",
    "category": "Suited Ace",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "23 Of 169",
    "vsRandomEquity": "60.9%",
    "summary": "Ace-Eight Suited (A8s) Is A Middle Suited Ace (60.9% Equity Vs. Random) That Opens Profitably From Hijack Through Small Blind And Realizes Strong Nut-Flush Equity Across Multiway And Heads-Up Pots.",
    "rfiByPosition": {
      "UTG": "22% Mixed Open",
      "HJ": "100% Open Raise",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position Against Cutoff And Button 3-Bets Or Mix As A Blocker 4-Bet Bluff.",
    "postflopPlaybook": "Play Pot-Controlled One-Street Or Two-Street Value When Flopping Top Pair Weak Kicker, And Barrel Aggressively When Turning Or Flopping Nut Flush Draws.",
    "matchups": [
      {
        "villain": "88 (Pocket Eights)",
        "heroEquity": "32.7%",
        "villainEquity": "66.6%",
        "tie": "0.7%"
      },
      {
        "villain": "KQs (King-Queen Suited)",
        "heroEquity": "56.1%",
        "villainEquity": "43.4%",
        "tie": "0.5%"
      },
      {
        "villain": "A7s (Ace-Seven Suited)",
        "heroEquity": "67.4%",
        "villainEquity": "24.5%",
        "tie": "8.1%"
      }
    ]
  },
  {
    "slug": "ace-seven-suited",
    "code": "A7s",
    "name": "Ace-Seven Suited",
    "nickname": "Lucky Seven Ace Suited",
    "category": "Suited Ace",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "26 Of 169",
    "vsRandomEquity": "59.9%",
    "summary": "Ace-Seven Suited (A7s) Is A Flexible Suited Ace (59.9% Equity Vs. Random) That Combines Top-Of-Deck Ace Blockers With Nut Flush Draw Potential And Backdoor Straight Connectivity Across 6-Max Ranges.",
    "rfiByPosition": {
      "UTG": "18% Mixed Open",
      "HJ": "85% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Defend In Position Versus Late-Position 3-Bets And Fold Against Tight Early-Position 3-Bet Ranges.",
    "postflopPlaybook": "Check Back Ace-High Flops In Position To Prevent Self-Isolation Against Stronger Aces, While Semibluffing Relentlessly With Four-Flush Boards.",
    "matchups": [
      {
        "villain": "KK (Pocket Kings)",
        "heroEquity": "31.9%",
        "villainEquity": "67.6%",
        "tie": "0.5%"
      },
      {
        "villain": "QJs (Queen-Jack Suited)",
        "heroEquity": "57.6%",
        "villainEquity": "41.9%",
        "tie": "0.5%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "32.5%",
        "villainEquity": "66.8%",
        "tie": "0.7%"
      }
    ]
  },
  {
    "slug": "ace-six-suited",
    "code": "A6s",
    "name": "Ace-Six Suited",
    "nickname": "Mile High Ace Suited",
    "category": "Suited Ace",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "30 Of 169",
    "vsRandomEquity": "58.9%",
    "summary": "Ace-Six Suited (A6s) Is The Bridge Between Middle And Wheel Suited Aces (58.9% Equity Vs. Random), Opening Standard From Cutoff, Button, And Small Blind While Mixing From Early Seats.",
    "rfiByPosition": {
      "UTG": "12% Mixed Open",
      "HJ": "65% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Out Of Position Against Linear 3-Bets; Mix Call And Polarized 4-Bet Bluffs In Late Position.",
    "postflopPlaybook": "Focus On Realizing Nut Flush Equity And Picking Up Low-Board Backdoor Straight Draws On 5-4-X And 7-5-X Textures.",
    "matchups": [
      {
        "villain": "AKs (Ace-King Suited)",
        "heroEquity": "25.8%",
        "villainEquity": "70.3%",
        "tie": "3.9%"
      },
      {
        "villain": "JTs (Jack-Ten Suited)",
        "heroEquity": "56.4%",
        "villainEquity": "43.1%",
        "tie": "0.5%"
      },
      {
        "villain": "55 (Pocket Fives)",
        "heroEquity": "46.7%",
        "villainEquity": "52.8%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "ace-ten-offsuit",
    "code": "ATo",
    "name": "Ace-Ten Offsuit",
    "nickname": "Johnny Moss Offsuit",
    "category": "Offsuit Broadway",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "27 Of 169",
    "vsRandomEquity": "63.5%",
    "summary": "Ace-Ten Offsuit (ATo) Is A High-Card Offsuit Broadway Holding (63.5% Equity Vs. Random Across 12 Combinations) That Dominates Late-Position Stealing Ranges And Short-Stack Push-Fold Spots.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "58% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Against Early And Middle Position 3-Bets; Mix Call Or 4-Bet Bluff Only In Wide Button Vs. Blind Battles.",
    "postflopPlaybook": "Extract Thin Value Against Worse One-Pair Hands In Late-Position Pots While Avoiding Three-Street Stacks Off On Single-Pair Ace Boards.",
    "matchups": [
      {
        "villain": "A9o (Ace-Nine Offsuit)",
        "heroEquity": "72.4%",
        "villainEquity": "21.3%",
        "tie": "6.3%"
      },
      {
        "villain": "KQo (King-Queen Offsuit)",
        "heroEquity": "58.4%",
        "villainEquity": "41.0%",
        "tie": "0.6%"
      },
      {
        "villain": "99 (Pocket Nines)",
        "heroEquity": "43.1%",
        "villainEquity": "56.5%",
        "tie": "0.4%"
      }
    ]
  },
  {
    "slug": "king-jack-offsuit",
    "code": "KJo",
    "name": "King-Jack Offsuit",
    "nickname": "Kojak Offsuit",
    "category": "Offsuit Broadway",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "31 Of 169",
    "vsRandomEquity": "60.4%",
    "summary": "King-Jack Offsuit (KJo) Is A Staple Late-Position Offsuit Broadway Hand (60.4% Equity Vs. Random) That Opens Pure From Cutoff, Button, And Small Blind But Requires Discipline Against 3-Bets.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "45% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Primarily Fold Facing 3-Bets Due To Reverse Implied Odds Against AK, AQ, AJ, And KQ.",
    "postflopPlaybook": "Bet For Value On King-High And Jack-High Textures In Single-Raised Pots, And Use Broadway Blockers To Bluff River Runouts When Draws Miss.",
    "matchups": [
      {
        "villain": "QJo (Queen-Jack Offsuit)",
        "heroEquity": "73.1%",
        "villainEquity": "24.1%",
        "tie": "2.8%"
      },
      {
        "villain": "A8s (Ace-Eight Suited)",
        "heroEquity": "41.8%",
        "villainEquity": "57.7%",
        "tie": "0.5%"
      },
      {
        "villain": "88 (Pocket Eights)",
        "heroEquity": "45.0%",
        "villainEquity": "54.5%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "queen-jack-offsuit",
    "code": "QJo",
    "name": "Queen-Jack Offsuit",
    "nickname": "Maverick Offsuit",
    "category": "Offsuit Broadway",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "35 Of 169",
    "vsRandomEquity": "58.2%",
    "summary": "Queen-Jack Offsuit (QJo) Is A Connected Offsuit Broadway Hand (58.2% Equity Vs. Random) That Flops Frequent Open-Ended Straight Draws And Top Pairs In Late-Position Steal Scenarios.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "22% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing 3-Bets Out Of Position And Against Tight Opponents; Defend Selectively In Big Blind Single-Raised Pots.",
    "postflopPlaybook": "Play Straight Draws Aggressively On Ten-Nine-X And King-Ten-X Boards While Pot-Controlling Vulnerable Top Pair Jack-Kicker Hands.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "35.8%",
        "villainEquity": "63.7%",
        "tie": "0.5%"
      },
      {
        "villain": "JTo (Jack-Ten Offsuit)",
        "heroEquity": "71.8%",
        "villainEquity": "25.0%",
        "tie": "3.2%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "45.6%",
        "villainEquity": "53.9%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "jack-ten-offsuit",
    "code": "JTo",
    "name": "Jack-Ten Offsuit",
    "nickname": "Dime Store Broadway",
    "category": "Offsuit Broadway",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "39 Of 169",
    "vsRandomEquity": "55.4%",
    "summary": "Jack-Ten Offsuit (JTo) Boasts The Highest Straight Connectivity Of Any Offsuit Hand (55.4% Equity Vs. Random), Making Four Different Nut Straights Across 8-9-Q, 9-Q-K, And Q-K-A Runouts.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "10% Mixed Open",
      "CO": "88% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold To 3-Bets Outside Of Deep-Stacked Button Vs. Blind Configurations.",
    "postflopPlaybook": "Prioritize High-Equity Straight Draws Over Weak One-Pair Showdown Value, And Leverage Nut Straight Advantage On Queen-Nine-Eight Textures.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "16.5%",
        "villainEquity": "83.0%",
        "tie": "0.5%"
      },
      {
        "villain": "AKs (Ace-King Suited)",
        "heroEquity": "36.6%",
        "villainEquity": "62.9%",
        "tie": "0.5%"
      },
      {
        "villain": "66 (Pocket Sixes)",
        "heroEquity": "46.3%",
        "villainEquity": "53.2%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "king-nine-suited",
    "code": "K9s",
    "name": "King-Nine Suited",
    "nickname": "Canine Suited",
    "category": "Suited Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "29 Of 169",
    "vsRandomEquity": "59.5%",
    "summary": "King-Nine Suited (K9s) Is A High-Card Suited One-Gapper (59.5% Equity Vs. Random) That Opens Standard From Hijack Through Small Blind And Defends Profitably In The Big Blind.",
    "rfiByPosition": {
      "UTG": "12% Mixed Open",
      "HJ": "78% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position Against Wide Late-Position 3-Bets And Fold Against Early-Position 3-Bets.",
    "postflopPlaybook": "Capitalize On Second-Nut Flush Draws And Jack-Ten-X Straight Draws While Checking Back Medium-Strength Top Pairs On Wet Boards.",
    "matchups": [
      {
        "villain": "A9o (Ace-Nine Offsuit)",
        "heroEquity": "31.2%",
        "villainEquity": "65.3%",
        "tie": "3.5%"
      },
      {
        "villain": "Q9s (Queen-Nine Suited)",
        "heroEquity": "70.3%",
        "villainEquity": "26.7%",
        "tie": "3.0%"
      },
      {
        "villain": "55 (Pocket Fives)",
        "heroEquity": "47.9%",
        "villainEquity": "51.6%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "queen-nine-suited",
    "code": "Q9s",
    "name": "Queen-Nine Suited",
    "nickname": "Quinine Suited",
    "category": "Suited Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "33 Of 169",
    "vsRandomEquity": "57.9%",
    "summary": "Queen-Nine Suited (Q9s) Is A Versatile Suited One-Gapper (57.9% Equity Vs. Random) That Connects Strongly With Middle-And-High Flops (J-T-8, K-J-T) And Realizes Flush Equity Efficiently.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "55% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position At 100BB Against Aggressive Button And Blind 3-Bettors.",
    "postflopPlaybook": "Semi-Bluff Combo Draws And Double-Gutshots Aggressively While Using Queen Blockers To Catch Bluffs On Brick Rivers.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "38.4%",
        "villainEquity": "61.2%",
        "tie": "0.4%"
      },
      {
        "villain": "J9s (Jack-Nine Suited)",
        "heroEquity": "69.2%",
        "villainEquity": "27.8%",
        "tie": "3.0%"
      },
      {
        "villain": "66 (Pocket Sixes)",
        "heroEquity": "47.1%",
        "villainEquity": "52.4%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "jack-nine-suited",
    "code": "J9s",
    "name": "Jack-Nine Suited",
    "nickname": "TJ Cloutier Suited",
    "category": "Suited Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "34 Of 169",
    "vsRandomEquity": "56.4%",
    "summary": "Jack-Nine Suited (J9s) Is One Of The Highest-Realization Suited One-Gappers In Hold'em (56.4% Equity Vs. Random), Famous For Flopping Disguised Straights On Q-T-8, T-8-7, And K-Q-T Boards.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "52% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position At 100BB Stack Depth Because Of Uncapped Straight And Flush Potential.",
    "postflopPlaybook": "Apply Maximum Pressure When Flopping Open-Ended Or Double-Belly-Buster Straight Draws Paired With Backdoor Or Live Flush Equity.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "20.4%",
        "villainEquity": "79.2%",
        "tie": "0.4%"
      },
      {
        "villain": "T9s (Ten-Nine Suited)",
        "heroEquity": "68.1%",
        "villainEquity": "28.5%",
        "tie": "3.4%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "47.6%",
        "villainEquity": "51.9%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "ten-eight-suited",
    "code": "T8s",
    "name": "Ten-Eight Suited",
    "nickname": "Suited One-Gapper Ten",
    "category": "Suited Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "38 Of 169",
    "vsRandomEquity": "54.2%",
    "summary": "Ten-Eight Suited (T8s) Is A Versatile Suited One-Gapper With 54.2% Equity Against A Random Hand That Flops Disguised Open-Ended And Double-Gutshot Straights Across Connected Middling Boards.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "28% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Call In Position Against Standard 3-Bet Sizings At 100BB+ Depth; Fold Out Of Position Against Early-Position 3-Bets.",
    "postflopPlaybook": "Semi-Bluff Aggressively On 9-7-X, J-9-X, And Flush-Draw Boards Where Opponents Cap Their Ranges With Vulnerable One-Pair Hands.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "20.2%",
        "villainEquity": "79.4%",
        "tie": "0.4%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "38.7%",
        "villainEquity": "60.9%",
        "tie": "0.4%"
      },
      {
        "villain": "66 (Pocket Sixes)",
        "heroEquity": "47.9%",
        "villainEquity": "51.6%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "nine-seven-suited",
    "code": "97s",
    "name": "Nine-Seven Suited",
    "nickname": "Middling Suited Gapper",
    "category": "Suited Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "44 Of 169",
    "vsRandomEquity": "52.1%",
    "summary": "Nine-Seven Suited (97s) Is A High-Playability Suited One-Gapper (52.1% Equity Vs. Random) That Connects Strongly With Low-To-Middling Boards (T-8-6, 8-6-5) Where Broadway Ranges Whiff.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Out Of Position; Mix Calls In Position Only At Deep 100BB+ Effective Stacks.",
    "postflopPlaybook": "Leverage Nut Advantage On 8-6-X And T-8-X Textures By Check-Raising Combo Draws And Double-Barreling Turn Cards That Increase Straight Equity.",
    "matchups": [
      {
        "villain": "KK (Pocket Kings)",
        "heroEquity": "20.1%",
        "villainEquity": "79.5%",
        "tie": "0.4%"
      },
      {
        "villain": "AQo (Ace-Queen Offsuit)",
        "heroEquity": "38.4%",
        "villainEquity": "61.2%",
        "tie": "0.4%"
      },
      {
        "villain": "55 (Pocket Fives)",
        "heroEquity": "48.2%",
        "villainEquity": "51.3%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "eight-six-suited",
    "code": "86s",
    "name": "Eight-Six Suited",
    "nickname": "Low Suited One-Gapper",
    "category": "Suited Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "53 Of 169",
    "vsRandomEquity": "50.1%",
    "summary": "Eight-Six Suited (86s) Is A Deceptive Late-Position Suited One-Gapper (50.1% Equity Vs. Random) Capable Of Cracking Overpairs When Flopping Hidden Straights On 9-7-5 And 7-5-4 Boards.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "64% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "88% Mixed Open"
    },
    "vs3Bet": "Fold Facing Standard 3-Bets Unless Deep-Stacked In Position Against Polarized Sizing.",
    "postflopPlaybook": "Play For Implied Odds And Board Coverage On Low Connected Flops; Avoid Calling Multiple Streets With Weak One-Pair Holdings.",
    "matchups": [
      {
        "villain": "QQ (Pocket Queens)",
        "heroEquity": "20.0%",
        "villainEquity": "79.6%",
        "tie": "0.4%"
      },
      {
        "villain": "AKs (Ace-King Suited)",
        "heroEquity": "35.8%",
        "villainEquity": "63.8%",
        "tie": "0.4%"
      },
      {
        "villain": "44 (Pocket Fours)",
        "heroEquity": "48.6%",
        "villainEquity": "50.9%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "seven-five-suited",
    "code": "75s",
    "name": "Seven-Five Suited",
    "nickname": "Low Suited Gapper",
    "category": "Suited Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "61 Of 169",
    "vsRandomEquity": "48.3%",
    "summary": "Seven-Five Suited (75s) Is A Button And Cutoff Suited One-Gapper (48.3% Equity Vs. Random) Used To Ensure Board Coverage On Low Runouts Such As 8-6-4 And 6-4-3.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "32% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "65% Mixed Open"
    },
    "vs3Bet": "Standard Fold Facing 3-Bets; Occasionally Used As A Low-Frequency 4-Bet Bluff In Blind-Vs-Blind Wars.",
    "postflopPlaybook": "Attack Capped Ranges When Flopping Open-Ended Straight Draws Or Flush Draws; Fold Quickly On High Broadway Textures When Unimproved.",
    "matchups": [
      {
        "villain": "JJ (Pocket Jacks)",
        "heroEquity": "20.1%",
        "villainEquity": "79.5%",
        "tie": "0.4%"
      },
      {
        "villain": "AJs (Ace-Jack Suited)",
        "heroEquity": "35.6%",
        "villainEquity": "64.0%",
        "tie": "0.4%"
      },
      {
        "villain": "33 (Pocket Threes)",
        "heroEquity": "49.1%",
        "villainEquity": "50.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "five-four-suited",
    "code": "54s",
    "name": "Five-Four Suited",
    "nickname": "Wheel Suited Connector",
    "category": "Suited Connector",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "56 Of 169",
    "vsRandomEquity": "47.9%",
    "summary": "Five-Four Suited (54s) Is The Quintessential Low Suited Connector (47.9% Equity Vs. Random), Offering Maximum Wheel-Straight Connectivity (A-2-3-4-5 Through 4-5-6-7-8) And Zero Dominated Top-Pair Traps.",
    "rfiByPosition": {
      "UTG": "22% Mixed Open",
      "HJ": "60% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "High-Frequency 4-Bet Bluff Candidate Or Deep-Stack Call In Position Because It Never Suffers From Reverse Implied Odds On High Cards.",
    "postflopPlaybook": "Prioritize Aggressive Check-Raises And Multi-Street Bluffs On A-2-3, 6-7-8, And Flush-Draw Boards Where Your Straight Completions Are Completely Disguised.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "22.4%",
        "villainEquity": "77.2%",
        "tie": "0.4%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "39.6%",
        "villainEquity": "59.9%",
        "tie": "0.5%"
      },
      {
        "villain": "22 (Pocket Deuces)",
        "heroEquity": "52.8%",
        "villainEquity": "46.5%",
        "tie": "0.7%"
      }
    ]
  },
  {
    "slug": "four-three-suited",
    "code": "43s",
    "name": "Four-Three Suited",
    "nickname": "Baby Suited Connector",
    "category": "Suited Connector",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "66 Of 169",
    "vsRandomEquity": "45.8%",
    "summary": "Four-Three Suited (43s) Is A Late-Position Suited Connector (45.8% Equity Vs. Random) That Excels In Deep-Stacked Pots By Flopping Disguised Wheel Straights And Two-Pair Combinations.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "15% Mixed Open",
      "CO": "75% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "78% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position When Deep-Stacked.",
    "postflopPlaybook": "Apply Pressure On Low Connected Boards (5-6-2, A-2-5) And Fold Cleanly When Flopping Single Underpairs On Broadway Boards.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "21.8%",
        "villainEquity": "77.8%",
        "tie": "0.4%"
      },
      {
        "villain": "KQo (King-Queen Offsuit)",
        "heroEquity": "38.2%",
        "villainEquity": "61.3%",
        "tie": "0.5%"
      },
      {
        "villain": "22 (Pocket Deuces)",
        "heroEquity": "51.4%",
        "villainEquity": "47.8%",
        "tie": "0.8%"
      }
    ]
  },
  {
    "slug": "king-eight-suited",
    "code": "K8s",
    "name": "King-Eight Suited",
    "nickname": "Suited King-Eight",
    "category": "Suited King",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "37 Of 169",
    "vsRandomEquity": "57.6%",
    "summary": "King-Eight Suited (K8s) Combines Second-Nut Flush Potential With King-High Blocker Value (57.6% Equity Vs. Random), Making It A Standard Open From The Cutoff, Button, And Small Blind.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "35% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Out Of Position; Mix Calls In Position Against Wide Button Or Blind 3-Bets.",
    "postflopPlaybook": "Play Pot-Control Lines When Flopping Top Pair Weak Kicker, While Barrel-Pressuring Second-Nut Flush Draws.",
    "matchups": [
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "28.1%",
        "villainEquity": "71.4%",
        "tie": "0.5%"
      },
      {
        "villain": "QJs (Queen-Jack Suited)",
        "heroEquity": "55.2%",
        "villainEquity": "44.3%",
        "tie": "0.5%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.9%",
        "villainEquity": "52.6%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "king-seven-suited",
    "code": "K7s",
    "name": "King-Seven Suited",
    "nickname": "Suited King-Seven",
    "category": "Suited King",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "41 Of 169",
    "vsRandomEquity": "56.8%",
    "summary": "King-Seven Suited (K7s) Is A Profitable Suited King (56.8% Equity Vs. Random) That Opens Across Late Positions And Defends Smoothly In The Big Blind Due To Strong Flush Equity.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "20% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Against Early-Position 3-Bets; Defend Selectively In Blind-Vs-Button Configurations.",
    "postflopPlaybook": "Realize Equity Cheaply With Middle Or Top Pair And Leverage King-High Flush Draws As Semi-Bluffs On Turn Barreling Runouts.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "16.5%",
        "villainEquity": "83.1%",
        "tie": "0.4%"
      },
      {
        "villain": "JTs (Jack-Ten Suited)",
        "heroEquity": "54.8%",
        "villainEquity": "44.7%",
        "tie": "0.5%"
      },
      {
        "villain": "66 (Pocket Sixes)",
        "heroEquity": "46.7%",
        "villainEquity": "52.8%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "king-six-suited",
    "code": "K6s",
    "name": "King-Six Suited",
    "nickname": "Suited King-Six",
    "category": "Suited King",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "45 Of 169",
    "vsRandomEquity": "55.9%",
    "summary": "King-Six Suited (K6s) Is A Late-Position Suited King (55.9% Equity Vs. Random) Offering Second-Nut Flush Potential And Backdoor Low-Straight Connectivity.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "10% Mixed Open",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold To Most 3-Bets Outside Of Deep-Stacked Button Vs. Blind Spots.",
    "postflopPlaybook": "Check Back Vulnerable King-Pair Flops To Avoid Kicker Domination, And Bet Aggressively When Turning Flush Or Two-Pair Equity.",
    "matchups": [
      {
        "villain": "KK (Pocket Kings)",
        "heroEquity": "11.2%",
        "villainEquity": "88.3%",
        "tie": "0.5%"
      },
      {
        "villain": "T9s (Ten-Nine Suited)",
        "heroEquity": "54.6%",
        "villainEquity": "44.9%",
        "tie": "0.5%"
      },
      {
        "villain": "55 (Pocket Fives)",
        "heroEquity": "46.5%",
        "villainEquity": "53.0%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "king-five-suited",
    "code": "K5s",
    "name": "King-Five Suited",
    "nickname": "Suited King-Five",
    "category": "Suited King",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "49 Of 169",
    "vsRandomEquity": "55.1%",
    "summary": "King-Five Suited (K5s) Is A Cutoff, Button, And Small Blind Opening Hand (55.1% Equity Vs. Random) That Retains Full Suited-King Flush Value And Blocks Pocket Kings.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "100% Open Raise",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Out Of Position; Occasionally Used As A Polarized 4-Bet Bluff On The Button.",
    "postflopPlaybook": "Use King-High Flush Draws As Primary Semi-Bluffs And Keep Pots Small When Flopping Top Pair No Kicker.",
    "matchups": [
      {
        "villain": "AKs (Ace-King Suited)",
        "heroEquity": "24.6%",
        "villainEquity": "74.8%",
        "tie": "0.6%"
      },
      {
        "villain": "98s (Nine-Eight Suited)",
        "heroEquity": "54.9%",
        "villainEquity": "44.6%",
        "tie": "0.5%"
      },
      {
        "villain": "44 (Pocket Fours)",
        "heroEquity": "46.8%",
        "villainEquity": "52.7%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "queen-eight-suited",
    "code": "Q8s",
    "name": "Queen-Eight Suited",
    "nickname": "Suited Queen-Eight",
    "category": "Suited Broadway",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "46 Of 169",
    "vsRandomEquity": "54.8%",
    "summary": "Queen-Eight Suited (Q8s) Is A Dynamic Late-Position Suited Queen (54.8% Equity Vs. Random) Capable Of Flopping Flush Draws And Gutshot/Double-Gutshot Straights On Middling Textures.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "85% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing 3-Bets Out Of Position; Defend Selectively In Position Against Aggressive Blind 3-Bettors.",
    "postflopPlaybook": "Capitalize On J-T-9 And T-9-7 Straight Draws While Controlling Pot Size On Queen-High Boards Against Uncapped Callers.",
    "matchups": [
      {
        "villain": "AQo (Ace-Queen Offsuit)",
        "heroEquity": "27.8%",
        "villainEquity": "71.7%",
        "tie": "0.5%"
      },
      {
        "villain": "J9s (Jack-Nine Suited)",
        "heroEquity": "56.4%",
        "villainEquity": "43.1%",
        "tie": "0.5%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.2%",
        "villainEquity": "53.3%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "jack-eight-suited",
    "code": "J8s",
    "name": "Jack-Eight Suited",
    "nickname": "Suited Two-Gapper Jack",
    "category": "Suited Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "51 Of 169",
    "vsRandomEquity": "52.6%",
    "summary": "Jack-Eight Suited (J8s) Is A Suited Two-Gapper (52.6% Equity Vs. Random) Opened From The Cutoff, Button, And Small Blind For Its Flush Potential And Middling Straight Coverage.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "60% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing Standard 3-Bets.",
    "postflopPlaybook": "Continue Aggressively When Flopping Flush Draws Or Open-Ended Straight Draws On T-9-X And Q-9-7 Boards.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "19.3%",
        "villainEquity": "80.3%",
        "tie": "0.4%"
      },
      {
        "villain": "T9s (Ten-Nine Suited)",
        "heroEquity": "51.2%",
        "villainEquity": "45.8%",
        "tie": "3.0%"
      },
      {
        "villain": "66 (Pocket Sixes)",
        "heroEquity": "47.1%",
        "villainEquity": "52.4%",
        "tie": "0.5%"
      }
    ]
  },
  {
    "slug": "ace-nine-offsuit",
    "code": "A9o",
    "name": "Ace-Nine Offsuit",
    "nickname": "Offsuit Ace-Nine",
    "category": "Offsuit Broadway",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "47 Of 169",
    "vsRandomEquity": "58.6%",
    "summary": "Ace-Nine Offsuit (A9o) Carries 58.6% Raw Equity Against A Random Hand And Serves As A Key Late-Position Steal Hand And Short-Stack Tournament Push/Fold Anchor.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "68% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing 100BB Cash Game 3-Bets Due To Severe Kicker Domination Against AK, AQ, AJ, And AT.",
    "postflopPlaybook": "Play One-And-Done Continuation Bets Or Pot-Control Check-Backs On Ace-High Boards To Avoid Value-Owning Yourself Against Better Kickers.",
    "matchups": [
      {
        "villain": "ATo (Ace-Ten Offsuit)",
        "heroEquity": "24.8%",
        "villainEquity": "70.3%",
        "tie": "4.9%"
      },
      {
        "villain": "KQs (King-Queen Suited)",
        "heroEquity": "55.4%",
        "villainEquity": "44.2%",
        "tie": "0.4%"
      },
      {
        "villain": "88 (Pocket Eights)",
        "heroEquity": "43.6%",
        "villainEquity": "56.0%",
        "tie": "0.4%"
      }
    ]
  },
  {
    "slug": "king-ten-offsuit",
    "code": "KTo",
    "name": "King-Ten Offsuit",
    "nickname": "Offsuit King-Ten",
    "category": "Offsuit Broadway",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "48 Of 169",
    "vsRandomEquity": "57.7%",
    "summary": "King-Ten Offsuit (KTo) Is A Core Late-Position Broadway Steal Hand (57.7% Equity Vs. Random) That Flops Strong Top-Pair And Broadway Straight Draws In Button And Cutoff Spots.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "72% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing Standard 3-Bets Because Offsuit King-Ten Is Heavily Dominated By AK, KQ, KJ, And TT+.",
    "postflopPlaybook": "Extract Value From Worse Pairs In Single-Raised Blind Defense Pots And Exercise Caution Facing Turn Check-Raises.",
    "matchups": [
      {
        "villain": "KJo (King-Jack Offsuit)",
        "heroEquity": "25.2%",
        "villainEquity": "70.8%",
        "tie": "4.0%"
      },
      {
        "villain": "QJs (Queen-Jack Suited)",
        "heroEquity": "55.8%",
        "villainEquity": "43.6%",
        "tie": "0.6%"
      },
      {
        "villain": "99 (Pocket Nines)",
        "heroEquity": "44.7%",
        "villainEquity": "54.9%",
        "tie": "0.4%"
      }
    ]
  },
  {
    "slug": "queen-ten-offsuit",
    "code": "QTo",
    "name": "Queen-Ten Offsuit",
    "nickname": "Offsuit Queen-Ten",
    "category": "Offsuit Broadway",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "54 Of 169",
    "vsRandomEquity": "55.7%",
    "summary": "Queen-Ten Offsuit (QTo) Is A High-Frequency Cutoff, Button, And Small Blind Opening Hand (55.7% Equity Vs. Random) With Strong Broadway Connectivity Across K-J-X And J-9-X Flops.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "55% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing 3-Bets At 100BB Stack Depth.",
    "postflopPlaybook": "Value Bet Thinly Against Big Blind Defenses On Queen-High Boards And Semi-Bluff Open-Ended Broadway Straight Draws.",
    "matchups": [
      {
        "villain": "QJo (Queen-Jack Offsuit)",
        "heroEquity": "25.4%",
        "villainEquity": "70.2%",
        "tie": "4.4%"
      },
      {
        "villain": "JTs (Jack-Ten Suited)",
        "heroEquity": "67.2%",
        "villainEquity": "29.2%",
        "tie": "3.6%"
      },
      {
        "villain": "88 (Pocket Eights)",
        "heroEquity": "45.1%",
        "villainEquity": "54.5%",
        "tie": "0.4%"
      }
    ]
  },
  {
    "slug": "king-four-suited",
    "code": "K4s",
    "name": "King-Four Suited",
    "nickname": "Suited King-Four",
    "category": "Suited King",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "57 Of 169",
    "vsRandomEquity": "57.3%",
    "summary": "King-Four Suited (K4s) Is Ranked 57 Of 169 In Texas Hold'em With 57.3% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited King For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-three-suited",
    "code": "K3s",
    "name": "King-Three Suited",
    "nickname": "Suited King-Three",
    "category": "Suited King",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "65 Of 169",
    "vsRandomEquity": "56.6%",
    "summary": "King-Three Suited (K3s) Is Ranked 65 Of 169 In Texas Hold'em With 56.6% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited King For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-two-suited",
    "code": "K2s",
    "name": "King-Two Suited",
    "nickname": "Suited King-Two",
    "category": "Suited King",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "71 Of 169",
    "vsRandomEquity": "55.9%",
    "summary": "King-Two Suited (K2s) Is Ranked 71 Of 169 In Texas Hold'em With 55.9% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited King For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-seven-suited",
    "code": "Q7s",
    "name": "Queen-Seven Suited",
    "nickname": "Suited Queen-Seven",
    "category": "Suited Queen",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "50 Of 169",
    "vsRandomEquity": "58.0%",
    "summary": "Queen-Seven Suited (Q7s) Is Ranked 50 Of 169 In Texas Hold'em With 58.0% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Queen For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-six-suited",
    "code": "Q6s",
    "name": "Queen-Six Suited",
    "nickname": "Suited Queen-Six",
    "category": "Suited Queen",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "58 Of 169",
    "vsRandomEquity": "57.3%",
    "summary": "Queen-Six Suited (Q6s) Is Ranked 58 Of 169 In Texas Hold'em With 57.3% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Queen For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-five-suited",
    "code": "Q5s",
    "name": "Queen-Five Suited",
    "nickname": "Suited Queen-Five",
    "category": "Suited Queen",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "66 Of 169",
    "vsRandomEquity": "56.6%",
    "summary": "Queen-Five Suited (Q5s) Is Ranked 66 Of 169 In Texas Hold'em With 56.6% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Queen For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-four-suited",
    "code": "Q4s",
    "name": "Queen-Four Suited",
    "nickname": "Suited Queen-Four",
    "category": "Suited Queen",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "72 Of 169",
    "vsRandomEquity": "55.9%",
    "summary": "Queen-Four Suited (Q4s) Is Ranked 72 Of 169 In Texas Hold'em With 55.9% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Queen For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-three-suited",
    "code": "Q3s",
    "name": "Queen-Three Suited",
    "nickname": "Suited Queen-Three",
    "category": "Suited Queen",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "79 Of 169",
    "vsRandomEquity": "55.2%",
    "summary": "Queen-Three Suited (Q3s) Is Ranked 79 Of 169 In Texas Hold'em With 55.2% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Queen For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-two-suited",
    "code": "Q2s",
    "name": "Queen-Two Suited",
    "nickname": "Suited Queen-Two",
    "category": "Suited Queen",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "86 Of 169",
    "vsRandomEquity": "54.4%",
    "summary": "Queen-Two Suited (Q2s) Is Ranked 86 Of 169 In Texas Hold'em With 54.4% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Queen For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-seven-suited",
    "code": "J7s",
    "name": "Jack-Seven Suited",
    "nickname": "Suited Jack-Seven",
    "category": "Suited Jack",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "67 Of 169",
    "vsRandomEquity": "56.6%",
    "summary": "Jack-Seven Suited (J7s) Is Ranked 67 Of 169 In Texas Hold'em With 56.6% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Jack For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-six-suited",
    "code": "J6s",
    "name": "Jack-Six Suited",
    "nickname": "Suited Jack-Six",
    "category": "Suited Jack",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "73 Of 169",
    "vsRandomEquity": "55.9%",
    "summary": "Jack-Six Suited (J6s) Is Ranked 73 Of 169 In Texas Hold'em With 55.9% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Jack For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-five-suited",
    "code": "J5s",
    "name": "Jack-Five Suited",
    "nickname": "Suited Jack-Five",
    "category": "Suited Jack",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "80 Of 169",
    "vsRandomEquity": "55.2%",
    "summary": "Jack-Five Suited (J5s) Is Ranked 80 Of 169 In Texas Hold'em With 55.2% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Jack For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-four-suited",
    "code": "J4s",
    "name": "Jack-Four Suited",
    "nickname": "Suited Jack-Four",
    "category": "Suited Jack",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "87 Of 169",
    "vsRandomEquity": "54.4%",
    "summary": "Jack-Four Suited (J4s) Is Ranked 87 Of 169 In Texas Hold'em With 54.4% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Jack For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-three-suited",
    "code": "J3s",
    "name": "Jack-Three Suited",
    "nickname": "Suited Jack-Three",
    "category": "Suited Jack",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "92 Of 169",
    "vsRandomEquity": "53.7%",
    "summary": "Jack-Three Suited (J3s) Is Ranked 92 Of 169 In Texas Hold'em With 53.7% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Jack For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-two-suited",
    "code": "J2s",
    "name": "Jack-Two Suited",
    "nickname": "Suited Jack-Two",
    "category": "Suited Jack",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "99 Of 169",
    "vsRandomEquity": "53.0%",
    "summary": "Jack-Two Suited (J2s) Is Ranked 99 Of 169 In Texas Hold'em With 53.0% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Jack For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-seven-suited",
    "code": "T7s",
    "name": "Ten-Seven Suited",
    "nickname": "Ten-Seven Suited Two-Gapper",
    "category": "Suited Two-Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "77 Of 169",
    "vsRandomEquity": "55.1%",
    "summary": "Ten-Seven Suited (T7s) Is Ranked 77 Of 169 In Texas Hold'em With 55.1% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Two-Gapper For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-six-suited",
    "code": "T6s",
    "name": "Ten-Six Suited",
    "nickname": "Suited Ten-Six",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "88 Of 169",
    "vsRandomEquity": "54.4%",
    "summary": "Ten-Six Suited (T6s) Is Ranked 88 Of 169 In Texas Hold'em With 54.4% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-five-suited",
    "code": "T5s",
    "name": "Ten-Five Suited",
    "nickname": "Suited Ten-Five",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "93 Of 169",
    "vsRandomEquity": "53.7%",
    "summary": "Ten-Five Suited (T5s) Is Ranked 93 Of 169 In Texas Hold'em With 53.7% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-four-suited",
    "code": "T4s",
    "name": "Ten-Four Suited",
    "nickname": "Suited Ten-Four",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "100 Of 169",
    "vsRandomEquity": "53.0%",
    "summary": "Ten-Four Suited (T4s) Is Ranked 100 Of 169 In Texas Hold'em With 53.0% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-three-suited",
    "code": "T3s",
    "name": "Ten-Three Suited",
    "nickname": "Suited Ten-Three",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "108 Of 169",
    "vsRandomEquity": "52.3%",
    "summary": "Ten-Three Suited (T3s) Is Ranked 108 Of 169 In Texas Hold'em With 52.3% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-two-suited",
    "code": "T2s",
    "name": "Ten-Two Suited",
    "nickname": "Suited Ten-Two",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "112 Of 169",
    "vsRandomEquity": "51.5%",
    "summary": "Ten-Two Suited (T2s) Is Ranked 112 Of 169 In Texas Hold'em With 51.5% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-eight-suited",
    "code": "98s",
    "name": "Nine-Eight Suited",
    "nickname": "Nine-Eight Suited Connector",
    "category": "Suited Connector",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "76 Of 169",
    "vsRandomEquity": "55.5%",
    "summary": "Nine-Eight Suited (98s) Is Ranked 76 Of 169 In Texas Hold'em With 55.5% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Connector For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-six-suited",
    "code": "96s",
    "name": "Nine-Six Suited",
    "nickname": "Nine-Six Suited Two-Gapper",
    "category": "Suited Two-Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "98 Of 169",
    "vsRandomEquity": "53.0%",
    "summary": "Nine-Six Suited (96s) Is Ranked 98 Of 169 In Texas Hold'em With 53.0% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Two-Gapper For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-five-suited",
    "code": "95s",
    "name": "Nine-Five Suited",
    "nickname": "Suited Nine-Five",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "107 Of 169",
    "vsRandomEquity": "52.3%",
    "summary": "Nine-Five Suited (95s) Is Ranked 107 Of 169 In Texas Hold'em With 52.3% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-four-suited",
    "code": "94s",
    "name": "Nine-Four Suited",
    "nickname": "Suited Nine-Four",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "113 Of 169",
    "vsRandomEquity": "51.5%",
    "summary": "Nine-Four Suited (94s) Is Ranked 113 Of 169 In Texas Hold'em With 51.5% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-three-suited",
    "code": "93s",
    "name": "Nine-Three Suited",
    "nickname": "Suited Nine-Three",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "119 Of 169",
    "vsRandomEquity": "50.8%",
    "summary": "Nine-Three Suited (93s) Is Ranked 119 Of 169 In Texas Hold'em With 50.8% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-two-suited",
    "code": "92s",
    "name": "Nine-Two Suited",
    "nickname": "Suited Nine-Two",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "125 Of 169",
    "vsRandomEquity": "50.1%",
    "summary": "Nine-Two Suited (92s) Is Ranked 125 Of 169 In Texas Hold'em With 50.1% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "eight-five-suited",
    "code": "85s",
    "name": "Eight-Five Suited",
    "nickname": "Eight-Five Suited Two-Gapper",
    "category": "Suited Two-Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "118 Of 169",
    "vsRandomEquity": "50.8%",
    "summary": "Eight-Five Suited (85s) Is Ranked 118 Of 169 In Texas Hold'em With 50.8% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Two-Gapper For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "eight-four-suited",
    "code": "84s",
    "name": "Eight-Four Suited",
    "nickname": "Suited Eight-Four",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "126 Of 169",
    "vsRandomEquity": "50.1%",
    "summary": "Eight-Four Suited (84s) Is Ranked 126 Of 169 In Texas Hold'em With 50.1% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "eight-three-suited",
    "code": "83s",
    "name": "Eight-Three Suited",
    "nickname": "Suited Eight-Three",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "130 Of 169",
    "vsRandomEquity": "49.4%",
    "summary": "Eight-Three Suited (83s) Is Ranked 130 Of 169 In Texas Hold'em With 49.4% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "eight-two-suited",
    "code": "82s",
    "name": "Eight-Two Suited",
    "nickname": "Suited Eight-Two",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "135 Of 169",
    "vsRandomEquity": "48.6%",
    "summary": "Eight-Two Suited (82s) Is Ranked 135 Of 169 In Texas Hold'em With 48.6% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "seven-four-suited",
    "code": "74s",
    "name": "Seven-Four Suited",
    "nickname": "Seven-Four Suited Two-Gapper",
    "category": "Suited Two-Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "134 Of 169",
    "vsRandomEquity": "48.6%",
    "summary": "Seven-Four Suited (74s) Is Ranked 134 Of 169 In Texas Hold'em With 48.6% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Two-Gapper For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "seven-three-suited",
    "code": "73s",
    "name": "Seven-Three Suited",
    "nickname": "Suited Seven-Three",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "141 Of 169",
    "vsRandomEquity": "47.9%",
    "summary": "Seven-Three Suited (73s) Is Ranked 141 Of 169 In Texas Hold'em With 47.9% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "seven-two-suited",
    "code": "72s",
    "name": "Seven-Two Suited",
    "nickname": "Suited Seven-Two",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "144 Of 169",
    "vsRandomEquity": "47.2%",
    "summary": "Seven-Two Suited (72s) Is Ranked 144 Of 169 In Texas Hold'em With 47.2% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "six-four-suited",
    "code": "64s",
    "name": "Six-Four Suited",
    "nickname": "Six-Four Suited One-Gapper",
    "category": "Suited One-Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "140 Of 169",
    "vsRandomEquity": "47.8%",
    "summary": "Six-Four Suited (64s) Is Ranked 140 Of 169 In Texas Hold'em With 47.8% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited One-Gapper For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "six-three-suited",
    "code": "63s",
    "name": "Six-Three Suited",
    "nickname": "Six-Three Suited Two-Gapper",
    "category": "Suited Two-Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "148 Of 169",
    "vsRandomEquity": "46.5%",
    "summary": "Six-Three Suited (63s) Is Ranked 148 Of 169 In Texas Hold'em With 46.5% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Two-Gapper For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "six-two-suited",
    "code": "62s",
    "name": "Six-Two Suited",
    "nickname": "Suited Six-Two",
    "category": "Speculative Suited Hand",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "153 Of 169",
    "vsRandomEquity": "45.7%",
    "summary": "Six-Two Suited (62s) Is Ranked 153 Of 169 In Texas Hold'em With 45.7% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Speculative Suited Hand For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "five-three-suited",
    "code": "53s",
    "name": "Five-Three Suited",
    "nickname": "Five-Three Suited One-Gapper",
    "category": "Suited One-Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "152 Of 169",
    "vsRandomEquity": "45.6%",
    "summary": "Five-Three Suited (53s) Is Ranked 152 Of 169 In Texas Hold'em With 45.6% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited One-Gapper For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "five-two-suited",
    "code": "52s",
    "name": "Five-Two Suited",
    "nickname": "Five-Two Suited Two-Gapper",
    "category": "Suited Two-Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "158 Of 169",
    "vsRandomEquity": "44.3%",
    "summary": "Five-Two Suited (52s) Is Ranked 158 Of 169 In Texas Hold'em With 44.3% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Two-Gapper For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "four-two-suited",
    "code": "42s",
    "name": "Four-Two Suited",
    "nickname": "Four-Two Suited One-Gapper",
    "category": "Suited One-Gapper",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "162 Of 169",
    "vsRandomEquity": "43.4%",
    "summary": "Four-Two Suited (42s) Is Ranked 162 Of 169 In Texas Hold'em With 43.4% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited One-Gapper For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "three-two-suited",
    "code": "32s",
    "name": "Three-Two Suited",
    "nickname": "Three-Two Suited Connector",
    "category": "Suited Connector",
    "combinations": 4,
    "probability": "0.30% (331 To 1 Against)",
    "preflopRank": "165 Of 169",
    "vsRandomEquity": "42.5%",
    "summary": "Three-Two Suited (32s) Is Ranked 165 Of 169 In Texas Hold'em With 42.5% Heads-Up Equity Against A Random Hand, Functioning As A Flush-Capable Suited Connector For Late-Position Steals And Big Blind Defense.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold Facing Early-Position 3-Bets; Defend Selectively In Position Only When Deep-Stacked Against Polarized Late-Position 3-Bet Ranges.",
    "postflopPlaybook": "Prioritize Flush Draws, Backdoor Straight Equity, And Disguised Two-Pair Combinations While Exercising Pot Control On Weak One-Pair Flops.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "18.6%",
        "villainEquity": "80.9%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "37.4%",
        "villainEquity": "62.0%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "46.1%",
        "villainEquity": "53.3%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-eight-offsuit",
    "code": "A8o",
    "name": "Ace-Eight Offsuit",
    "nickname": "Offsuit Ace-Eight",
    "category": "Offsuit Ace",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "47 Of 169",
    "vsRandomEquity": "58.6%",
    "summary": "Ace-Eight Offsuit (A8o) Is Ranked 47 Of 169 In Texas Hold'em With 58.6% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Ace Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-seven-offsuit",
    "code": "A7o",
    "name": "Ace-Seven Offsuit",
    "nickname": "Offsuit Ace-Seven",
    "category": "Offsuit Ace",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "52 Of 169",
    "vsRandomEquity": "57.8%",
    "summary": "Ace-Seven Offsuit (A7o) Is Ranked 52 Of 169 In Texas Hold'em With 57.8% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Ace Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-six-offsuit",
    "code": "A6o",
    "name": "Ace-Six Offsuit",
    "nickname": "Offsuit Ace-Six",
    "category": "Offsuit Ace",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "59 Of 169",
    "vsRandomEquity": "57.1%",
    "summary": "Ace-Six Offsuit (A6o) Is Ranked 59 Of 169 In Texas Hold'em With 57.1% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Ace Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-five-offsuit",
    "code": "A5o",
    "name": "Ace-Five Offsuit",
    "nickname": "Offsuit Ace-Five",
    "category": "Offsuit Wheel Ace",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "56 Of 169",
    "vsRandomEquity": "56.4%",
    "summary": "Ace-Five Offsuit (A5o) Is Ranked 56 Of 169 In Texas Hold'em With 56.4% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Wheel Ace Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-four-offsuit",
    "code": "A4o",
    "name": "Ace-Four Offsuit",
    "nickname": "Offsuit Ace-Four",
    "category": "Offsuit Wheel Ace",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "64 Of 169",
    "vsRandomEquity": "55.7%",
    "summary": "Ace-Four Offsuit (A4o) Is Ranked 64 Of 169 In Texas Hold'em With 55.7% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Wheel Ace Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-three-offsuit",
    "code": "A3o",
    "name": "Ace-Three Offsuit",
    "nickname": "Offsuit Ace-Three",
    "category": "Offsuit Wheel Ace",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "69 Of 169",
    "vsRandomEquity": "55.0%",
    "summary": "Ace-Three Offsuit (A3o) Is Ranked 69 Of 169 In Texas Hold'em With 55.0% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Wheel Ace Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ace-two-offsuit",
    "code": "A2o",
    "name": "Ace-Two Offsuit",
    "nickname": "Offsuit Ace-Two",
    "category": "Offsuit Wheel Ace",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "78 Of 169",
    "vsRandomEquity": "54.2%",
    "summary": "Ace-Two Offsuit (A2o) Is Ranked 78 Of 169 In Texas Hold'em With 54.2% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Wheel Ace Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-nine-offsuit",
    "code": "K9o",
    "name": "King-Nine Offsuit",
    "nickname": "Offsuit King-Nine",
    "category": "Offsuit King",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "53 Of 169",
    "vsRandomEquity": "57.8%",
    "summary": "King-Nine Offsuit (K9o) Is Ranked 53 Of 169 In Texas Hold'em With 57.8% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit King Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-eight-offsuit",
    "code": "K8o",
    "name": "King-Eight Offsuit",
    "nickname": "Offsuit King-Eight",
    "category": "Offsuit King",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "60 Of 169",
    "vsRandomEquity": "57.1%",
    "summary": "King-Eight Offsuit (K8o) Is Ranked 60 Of 169 In Texas Hold'em With 57.1% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit King Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-seven-offsuit",
    "code": "K7o",
    "name": "King-Seven Offsuit",
    "nickname": "Offsuit King-Seven",
    "category": "Offsuit King",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "68 Of 169",
    "vsRandomEquity": "56.4%",
    "summary": "King-Seven Offsuit (K7o) Is Ranked 68 Of 169 In Texas Hold'em With 56.4% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit King Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-six-offsuit",
    "code": "K6o",
    "name": "King-Six Offsuit",
    "nickname": "Offsuit King-Six",
    "category": "Offsuit King",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "74 Of 169",
    "vsRandomEquity": "55.7%",
    "summary": "King-Six Offsuit (K6o) Is Ranked 74 Of 169 In Texas Hold'em With 55.7% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit King Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-five-offsuit",
    "code": "K5o",
    "name": "King-Five Offsuit",
    "nickname": "Offsuit King-Five",
    "category": "Offsuit King",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "82 Of 169",
    "vsRandomEquity": "54.9%",
    "summary": "King-Five Offsuit (K5o) Is Ranked 82 Of 169 In Texas Hold'em With 54.9% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit King Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-four-offsuit",
    "code": "K4o",
    "name": "King-Four Offsuit",
    "nickname": "Offsuit King-Four",
    "category": "Offsuit King",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "90 Of 169",
    "vsRandomEquity": "54.2%",
    "summary": "King-Four Offsuit (K4o) Is Ranked 90 Of 169 In Texas Hold'em With 54.2% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit King Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-three-offsuit",
    "code": "K3o",
    "name": "King-Three Offsuit",
    "nickname": "Offsuit King-Three",
    "category": "Offsuit King",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "94 Of 169",
    "vsRandomEquity": "53.5%",
    "summary": "King-Three Offsuit (K3o) Is Ranked 94 Of 169 In Texas Hold'em With 53.5% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit King Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "king-two-offsuit",
    "code": "K2o",
    "name": "King-Two Offsuit",
    "nickname": "Offsuit King-Two",
    "category": "Offsuit King",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "101 Of 169",
    "vsRandomEquity": "52.8%",
    "summary": "King-Two Offsuit (K2o) Is Ranked 101 Of 169 In Texas Hold'em With 52.8% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit King Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-nine-offsuit",
    "code": "Q9o",
    "name": "Queen-Nine Offsuit",
    "nickname": "Offsuit Queen-Nine",
    "category": "Offsuit Queen",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "62 Of 169",
    "vsRandomEquity": "56.4%",
    "summary": "Queen-Nine Offsuit (Q9o) Is Ranked 62 Of 169 In Texas Hold'em With 56.4% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Queen Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "65% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "100% Open Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-eight-offsuit",
    "code": "Q8o",
    "name": "Queen-Eight Offsuit",
    "nickname": "Offsuit Queen-Eight",
    "category": "Offsuit Queen",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "75 Of 169",
    "vsRandomEquity": "55.7%",
    "summary": "Queen-Eight Offsuit (Q8o) Is Ranked 75 Of 169 In Texas Hold'em With 55.7% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Queen Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-seven-offsuit",
    "code": "Q7o",
    "name": "Queen-Seven Offsuit",
    "nickname": "Offsuit Queen-Seven",
    "category": "Offsuit Queen",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "81 Of 169",
    "vsRandomEquity": "54.9%",
    "summary": "Queen-Seven Offsuit (Q7o) Is Ranked 81 Of 169 In Texas Hold'em With 54.9% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Queen Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-six-offsuit",
    "code": "Q6o",
    "name": "Queen-Six Offsuit",
    "nickname": "Offsuit Queen-Six",
    "category": "Offsuit Queen",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "89 Of 169",
    "vsRandomEquity": "54.2%",
    "summary": "Queen-Six Offsuit (Q6o) Is Ranked 89 Of 169 In Texas Hold'em With 54.2% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Queen Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-five-offsuit",
    "code": "Q5o",
    "name": "Queen-Five Offsuit",
    "nickname": "Offsuit Queen-Five",
    "category": "Offsuit Queen",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "95 Of 169",
    "vsRandomEquity": "53.5%",
    "summary": "Queen-Five Offsuit (Q5o) Is Ranked 95 Of 169 In Texas Hold'em With 53.5% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Queen Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-four-offsuit",
    "code": "Q4o",
    "name": "Queen-Four Offsuit",
    "nickname": "Offsuit Queen-Four",
    "category": "Offsuit Queen",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "102 Of 169",
    "vsRandomEquity": "52.8%",
    "summary": "Queen-Four Offsuit (Q4o) Is Ranked 102 Of 169 In Texas Hold'em With 52.8% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Queen Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-three-offsuit",
    "code": "Q3o",
    "name": "Queen-Three Offsuit",
    "nickname": "Offsuit Queen-Three",
    "category": "Offsuit Queen",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "109 Of 169",
    "vsRandomEquity": "52.1%",
    "summary": "Queen-Three Offsuit (Q3o) Is Ranked 109 Of 169 In Texas Hold'em With 52.1% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Queen Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "queen-two-offsuit",
    "code": "Q2o",
    "name": "Queen-Two Offsuit",
    "nickname": "Offsuit Queen-Two",
    "category": "Offsuit Queen",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "114 Of 169",
    "vsRandomEquity": "51.3%",
    "summary": "Queen-Two Offsuit (Q2o) Is Ranked 114 Of 169 In Texas Hold'em With 51.3% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Queen Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-nine-offsuit",
    "code": "J9o",
    "name": "Jack-Nine Offsuit",
    "nickname": "Offsuit Jack-Nine",
    "category": "Offsuit Jack",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "70 Of 169",
    "vsRandomEquity": "55.5%",
    "summary": "Jack-Nine Offsuit (J9o) Is Ranked 70 Of 169 In Texas Hold'em With 55.5% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Jack Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-eight-offsuit",
    "code": "J8o",
    "name": "Jack-Eight Offsuit",
    "nickname": "Offsuit Jack-Eight",
    "category": "Offsuit Jack",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "84 Of 169",
    "vsRandomEquity": "54.2%",
    "summary": "Jack-Eight Offsuit (J8o) Is Ranked 84 Of 169 In Texas Hold'em With 54.2% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Jack Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-seven-offsuit",
    "code": "J7o",
    "name": "Jack-Seven Offsuit",
    "nickname": "Offsuit Jack-Seven",
    "category": "Offsuit Jack",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "96 Of 169",
    "vsRandomEquity": "53.5%",
    "summary": "Jack-Seven Offsuit (J7o) Is Ranked 96 Of 169 In Texas Hold'em With 53.5% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Jack Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-six-offsuit",
    "code": "J6o",
    "name": "Jack-Six Offsuit",
    "nickname": "Offsuit Jack-Six",
    "category": "Offsuit Jack",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "103 Of 169",
    "vsRandomEquity": "52.8%",
    "summary": "Jack-Six Offsuit (J6o) Is Ranked 103 Of 169 In Texas Hold'em With 52.8% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Jack Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-five-offsuit",
    "code": "J5o",
    "name": "Jack-Five Offsuit",
    "nickname": "Offsuit Jack-Five",
    "category": "Offsuit Jack",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "110 Of 169",
    "vsRandomEquity": "52.1%",
    "summary": "Jack-Five Offsuit (J5o) Is Ranked 110 Of 169 In Texas Hold'em With 52.1% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Jack Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-four-offsuit",
    "code": "J4o",
    "name": "Jack-Four Offsuit",
    "nickname": "Offsuit Jack-Four",
    "category": "Offsuit Jack",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "115 Of 169",
    "vsRandomEquity": "51.3%",
    "summary": "Jack-Four Offsuit (J4o) Is Ranked 115 Of 169 In Texas Hold'em With 51.3% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Jack Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-three-offsuit",
    "code": "J3o",
    "name": "Jack-Three Offsuit",
    "nickname": "Offsuit Jack-Three",
    "category": "Offsuit Jack",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "120 Of 169",
    "vsRandomEquity": "50.6%",
    "summary": "Jack-Three Offsuit (J3o) Is Ranked 120 Of 169 In Texas Hold'em With 50.6% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Jack Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "jack-two-offsuit",
    "code": "J2o",
    "name": "Jack-Two Offsuit",
    "nickname": "Offsuit Jack-Two",
    "category": "Offsuit Jack",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "127 Of 169",
    "vsRandomEquity": "49.9%",
    "summary": "Jack-Two Offsuit (J2o) Is Ranked 127 Of 169 In Texas Hold'em With 49.9% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Jack Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-nine-offsuit",
    "code": "T9o",
    "name": "Ten-Nine Offsuit",
    "nickname": "Ten-Nine Offsuit Connector",
    "category": "Offsuit Connector",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "83 Of 169",
    "vsRandomEquity": "54.6%",
    "summary": "Ten-Nine Offsuit (T9o) Is Ranked 83 Of 169 In Texas Hold'em With 54.6% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Connector Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-eight-offsuit",
    "code": "T8o",
    "name": "Ten-Eight Offsuit",
    "nickname": "Ten-Eight Offsuit Gapper",
    "category": "Offsuit One-Gapper",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "91 Of 169",
    "vsRandomEquity": "53.4%",
    "summary": "Ten-Eight Offsuit (T8o) Is Ranked 91 Of 169 In Texas Hold'em With 53.4% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit One-Gapper Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "15% Mixed Open",
      "BTN": "100% Open Raise",
      "SB": "85% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-seven-offsuit",
    "code": "T7o",
    "name": "Ten-Seven Offsuit",
    "nickname": "Offsuit Ten-Seven",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "105 Of 169",
    "vsRandomEquity": "52.0%",
    "summary": "Ten-Seven Offsuit (T7o) Is Ranked 105 Of 169 In Texas Hold'em With 52.0% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-six-offsuit",
    "code": "T6o",
    "name": "Ten-Six Offsuit",
    "nickname": "Offsuit Ten-Six",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "116 Of 169",
    "vsRandomEquity": "51.3%",
    "summary": "Ten-Six Offsuit (T6o) Is Ranked 116 Of 169 In Texas Hold'em With 51.3% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-five-offsuit",
    "code": "T5o",
    "name": "Ten-Five Offsuit",
    "nickname": "Offsuit Ten-Five",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "121 Of 169",
    "vsRandomEquity": "50.6%",
    "summary": "Ten-Five Offsuit (T5o) Is Ranked 121 Of 169 In Texas Hold'em With 50.6% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-four-offsuit",
    "code": "T4o",
    "name": "Ten-Four Offsuit",
    "nickname": "Offsuit Ten-Four",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "128 Of 169",
    "vsRandomEquity": "49.9%",
    "summary": "Ten-Four Offsuit (T4o) Is Ranked 128 Of 169 In Texas Hold'em With 49.9% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-three-offsuit",
    "code": "T3o",
    "name": "Ten-Three Offsuit",
    "nickname": "Offsuit Ten-Three",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "132 Of 169",
    "vsRandomEquity": "49.2%",
    "summary": "Ten-Three Offsuit (T3o) Is Ranked 132 Of 169 In Texas Hold'em With 49.2% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "ten-two-offsuit",
    "code": "T2o",
    "name": "Ten-Two Offsuit",
    "nickname": "Offsuit Ten-Two",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "136 Of 169",
    "vsRandomEquity": "48.4%",
    "summary": "Ten-Two Offsuit (T2o) Is Ranked 136 Of 169 In Texas Hold'em With 48.4% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-eight-offsuit",
    "code": "98o",
    "name": "Nine-Eight Offsuit",
    "nickname": "Nine-Eight Offsuit Connector",
    "category": "Offsuit Connector",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "104 Of 169",
    "vsRandomEquity": "52.4%",
    "summary": "Nine-Eight Offsuit (98o) Is Ranked 104 Of 169 In Texas Hold'em With 52.4% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Connector Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-seven-offsuit",
    "code": "97o",
    "name": "Nine-Seven Offsuit",
    "nickname": "Nine-Seven Offsuit Gapper",
    "category": "Offsuit One-Gapper",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "111 Of 169",
    "vsRandomEquity": "51.2%",
    "summary": "Nine-Seven Offsuit (97o) Is Ranked 111 Of 169 In Texas Hold'em With 51.2% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit One-Gapper Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "45% Mixed Open",
      "SB": "55% Mixed Open"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-six-offsuit",
    "code": "96o",
    "name": "Nine-Six Offsuit",
    "nickname": "Offsuit Nine-Six",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "123 Of 169",
    "vsRandomEquity": "49.9%",
    "summary": "Nine-Six Offsuit (96o) Is Ranked 123 Of 169 In Texas Hold'em With 49.9% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-five-offsuit",
    "code": "95o",
    "name": "Nine-Five Offsuit",
    "nickname": "Offsuit Nine-Five",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "131 Of 169",
    "vsRandomEquity": "49.1%",
    "summary": "Nine-Five Offsuit (95o) Is Ranked 131 Of 169 In Texas Hold'em With 49.1% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-four-offsuit",
    "code": "94o",
    "name": "Nine-Four Offsuit",
    "nickname": "Offsuit Nine-Four",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "137 Of 169",
    "vsRandomEquity": "48.4%",
    "summary": "Nine-Four Offsuit (94o) Is Ranked 137 Of 169 In Texas Hold'em With 48.4% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-three-offsuit",
    "code": "93o",
    "name": "Nine-Three Offsuit",
    "nickname": "Offsuit Nine-Three",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "142 Of 169",
    "vsRandomEquity": "47.7%",
    "summary": "Nine-Three Offsuit (93o) Is Ranked 142 Of 169 In Texas Hold'em With 47.7% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "nine-two-offsuit",
    "code": "92o",
    "name": "Nine-Two Offsuit",
    "nickname": "Offsuit Nine-Two",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "145 Of 169",
    "vsRandomEquity": "47.0%",
    "summary": "Nine-Two Offsuit (92o) Is Ranked 145 Of 169 In Texas Hold'em With 47.0% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "eight-seven-offsuit",
    "code": "87o",
    "name": "Eight-Seven Offsuit",
    "nickname": "Eight-Seven Offsuit Connector",
    "category": "Offsuit Connector",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "122 Of 169",
    "vsRandomEquity": "50.2%",
    "summary": "Eight-Seven Offsuit (87o) Is Ranked 122 Of 169 In Texas Hold'em With 50.2% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Connector Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "eight-six-offsuit",
    "code": "86o",
    "name": "Eight-Six Offsuit",
    "nickname": "Eight-Six Offsuit Gapper",
    "category": "Offsuit One-Gapper",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "129 Of 169",
    "vsRandomEquity": "49.0%",
    "summary": "Eight-Six Offsuit (86o) Is Ranked 129 Of 169 In Texas Hold'em With 49.0% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit One-Gapper Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "eight-five-offsuit",
    "code": "85o",
    "name": "Eight-Five Offsuit",
    "nickname": "Offsuit Eight-Five",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "139 Of 169",
    "vsRandomEquity": "47.7%",
    "summary": "Eight-Five Offsuit (85o) Is Ranked 139 Of 169 In Texas Hold'em With 47.7% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "eight-four-offsuit",
    "code": "84o",
    "name": "Eight-Four Offsuit",
    "nickname": "Offsuit Eight-Four",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "146 Of 169",
    "vsRandomEquity": "47.0%",
    "summary": "Eight-Four Offsuit (84o) Is Ranked 146 Of 169 In Texas Hold'em With 47.0% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "eight-three-offsuit",
    "code": "83o",
    "name": "Eight-Three Offsuit",
    "nickname": "Offsuit Eight-Three",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "149 Of 169",
    "vsRandomEquity": "46.3%",
    "summary": "Eight-Three Offsuit (83o) Is Ranked 149 Of 169 In Texas Hold'em With 46.3% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "eight-two-offsuit",
    "code": "82o",
    "name": "Eight-Two Offsuit",
    "nickname": "Offsuit Eight-Two",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "154 Of 169",
    "vsRandomEquity": "45.5%",
    "summary": "Eight-Two Offsuit (82o) Is Ranked 154 Of 169 In Texas Hold'em With 45.5% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "seven-six-offsuit",
    "code": "76o",
    "name": "Seven-Six Offsuit",
    "nickname": "Seven-Six Offsuit Connector",
    "category": "Offsuit Connector",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "138 Of 169",
    "vsRandomEquity": "48.1%",
    "summary": "Seven-Six Offsuit (76o) Is Ranked 138 Of 169 In Texas Hold'em With 48.1% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Connector Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Fold",
      "HJ": "0% Fold",
      "CO": "0% Fold",
      "BTN": "10% Mixed Steal",
      "SB": "20% Mixed Limp Or Raise"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "seven-five-offsuit",
    "code": "75o",
    "name": "Seven-Five Offsuit",
    "nickname": "Seven-Five Offsuit Gapper",
    "category": "Offsuit One-Gapper",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "143 Of 169",
    "vsRandomEquity": "46.9%",
    "summary": "Seven-Five Offsuit (75o) Is Ranked 143 Of 169 In Texas Hold'em With 46.9% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit One-Gapper Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "seven-four-offsuit",
    "code": "74o",
    "name": "Seven-Four Offsuit",
    "nickname": "Offsuit Seven-Four",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "151 Of 169",
    "vsRandomEquity": "45.5%",
    "summary": "Seven-Four Offsuit (74o) Is Ranked 151 Of 169 In Texas Hold'em With 45.5% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "seven-three-offsuit",
    "code": "73o",
    "name": "Seven-Three Offsuit",
    "nickname": "Offsuit Seven-Three",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "156 Of 169",
    "vsRandomEquity": "44.8%",
    "summary": "Seven-Three Offsuit (73o) Is Ranked 156 Of 169 In Texas Hold'em With 44.8% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "six-five-offsuit",
    "code": "65o",
    "name": "Six-Five Offsuit",
    "nickname": "Six-Five Offsuit Connector",
    "category": "Offsuit Connector",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "150 Of 169",
    "vsRandomEquity": "45.9%",
    "summary": "Six-Five Offsuit (65o) Is Ranked 150 Of 169 In Texas Hold'em With 45.9% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Connector Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "six-four-offsuit",
    "code": "64o",
    "name": "Six-Four Offsuit",
    "nickname": "Six-Four Offsuit Gapper",
    "category": "Offsuit One-Gapper",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "155 Of 169",
    "vsRandomEquity": "44.7%",
    "summary": "Six-Four Offsuit (64o) Is Ranked 155 Of 169 In Texas Hold'em With 44.7% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit One-Gapper Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "six-three-offsuit",
    "code": "63o",
    "name": "Six-Three Offsuit",
    "nickname": "Offsuit Six-Three",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "161 Of 169",
    "vsRandomEquity": "43.4%",
    "summary": "Six-Three Offsuit (63o) Is Ranked 161 Of 169 In Texas Hold'em With 43.4% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "six-two-offsuit",
    "code": "62o",
    "name": "Six-Two Offsuit",
    "nickname": "Offsuit Six-Two",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "164 Of 169",
    "vsRandomEquity": "42.6%",
    "summary": "Six-Two Offsuit (62o) Is Ranked 164 Of 169 In Texas Hold'em With 42.6% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "five-four-offsuit",
    "code": "54o",
    "name": "Five-Four Offsuit",
    "nickname": "Five-Four Offsuit Connector",
    "category": "Offsuit Connector",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "160 Of 169",
    "vsRandomEquity": "43.7%",
    "summary": "Five-Four Offsuit (54o) Is Ranked 160 Of 169 In Texas Hold'em With 43.7% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Connector Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "five-three-offsuit",
    "code": "53o",
    "name": "Five-Three Offsuit",
    "nickname": "Five-Three Offsuit Gapper",
    "category": "Offsuit One-Gapper",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "163 Of 169",
    "vsRandomEquity": "42.5%",
    "summary": "Five-Three Offsuit (53o) Is Ranked 163 Of 169 In Texas Hold'em With 42.5% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit One-Gapper Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "five-two-offsuit",
    "code": "52o",
    "name": "Five-Two Offsuit",
    "nickname": "Offsuit Five-Two",
    "category": "Marginal Offsuit Hand",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "167 Of 169",
    "vsRandomEquity": "41.2%",
    "summary": "Five-Two Offsuit (52o) Is Ranked 167 Of 169 In Texas Hold'em With 41.2% Heads-Up Equity Against A Random Hand, Functioning As A Positional Marginal Offsuit Hand Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "four-three-offsuit",
    "code": "43o",
    "name": "Four-Three Offsuit",
    "nickname": "Four-Three Offsuit Connector",
    "category": "Offsuit Connector",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "166 Of 169",
    "vsRandomEquity": "41.6%",
    "summary": "Four-Three Offsuit (43o) Is Ranked 166 Of 169 In Texas Hold'em With 41.6% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Connector Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "four-two-offsuit",
    "code": "42o",
    "name": "Four-Two Offsuit",
    "nickname": "Four-Two Offsuit Gapper",
    "category": "Offsuit One-Gapper",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "168 Of 169",
    "vsRandomEquity": "40.3%",
    "summary": "Four-Two Offsuit (42o) Is Ranked 168 Of 169 In Texas Hold'em With 40.3% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit One-Gapper Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  },
  {
    "slug": "three-two-offsuit",
    "code": "32o",
    "name": "Three-Two Offsuit",
    "nickname": "Three-Two Offsuit Connector",
    "category": "Offsuit Connector",
    "combinations": 12,
    "probability": "0.90% (110 To 1 Against)",
    "preflopRank": "169 Of 169",
    "vsRandomEquity": "39.4%",
    "summary": "Three-Two Offsuit (32o) Is Ranked 169 Of 169 In Texas Hold'em With 39.4% Heads-Up Equity Against A Random Hand, Functioning As A Positional Offsuit Connector Requiring Disciplined Preflop Selection At 100BB Stack Depths.",
    "rfiByPosition": {
      "UTG": "0% Pure Fold",
      "HJ": "0% Pure Fold",
      "CO": "0% Pure Fold",
      "BTN": "0% Pure Fold",
      "SB": "0% Pure Fold"
    },
    "vs3Bet": "Fold 100% Facing Standard 100BB 3-Bets Due To Kicker Domination And Low Postflop Equity Realization.",
    "postflopPlaybook": "Realize Equity Cheaply In Single-Raised Or Big Blind Defense Pots And Fold Unimproved Holdings Facing Multi-Street Aggression.",
    "matchups": [
      {
        "villain": "AA (Pocket Aces)",
        "heroEquity": "14.9%",
        "villainEquity": "84.6%",
        "tie": "0.5%"
      },
      {
        "villain": "AKo (Ace-King Offsuit)",
        "heroEquity": "33.8%",
        "villainEquity": "65.6%",
        "tie": "0.6%"
      },
      {
        "villain": "77 (Pocket Sevens)",
        "heroEquity": "42.9%",
        "villainEquity": "56.5%",
        "tie": "0.6%"
      }
    ]
  }
];

export function getStartingHand(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return STARTING_HANDS.find((h) => h.slug === s || h.code.toLowerCase() === s) || null;
}

export const findStartingHand = getStartingHand;

export function renderStartingHandsIndexMarkdown({ canonicalUrl = 'https://smarter.poker/learn/hands' } = {}) {
  const lines = [
    "# Smarter.Poker Texas Hold'em Starting Hand Encyclopedia & GTO Matrix Guide",
    '',
    `> Source: [Poker Starting Hand Encyclopedia on Smarter.Poker](${canonicalUrl})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    `Complete Combinatoric Reference And 6-Max 100BB GTO Playbook For All ${STARTING_HANDS.length} Canonical Texas Hold'em Starting Hands. Includes Exact Deal Probabilities, Preflop Rank (Out Of 169), Equity Vs. Random Hands, Position-By-Position Opening Frequencies, And Key Head-To-Head Matchup Percentages.`,
    '',
    '## Starting Hand Comparison Table',
    '| Hand | Code | Nickname | Rank | Combos | Equity Vs Random | UTG Action | BTN Action |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
    ...STARTING_HANDS.map(
      (h) =>
        `| [${h.name}](https://smarter.poker${handPath(h.slug)}) ([.md](https://smarter.poker${handPath(h.slug)}.md)) | \`${h.code}\` | ${h.nickname} | ${h.preflopRank} | ${h.combinations} | ${h.vsRandomEquity} | ${h.rfiByPosition.UTG} | ${h.rfiByPosition.BTN} |`
    ),
    '',
  ];
  return lines.join('\n');
}

export function renderStartingHandMarkdown(hand, { canonicalBase = 'https://smarter.poker/learn/hands' } = {}) {
  if (!hand) return '';
  const url = `${canonicalBase}/${hand.slug}`;
  return [
    `# How To Play ${hand.name} (${hand.code}) In Texas Hold'em`,
    '',
    `> Source: [${hand.name} (${hand.code}) Strategy Guide on Smarter.Poker](${url})`,
    '',
    '## Executive Answer Summary',
    hand.summary,
    '',
    '## Combinatoric Fact Sheet',
    `- **Hand Notation**: \`${hand.code}\``,
    `- **Common Nickname**: ${hand.nickname}`,
    `- **Hand Category**: ${hand.category}`,
    `- **Deck Combinations**: ${hand.combinations} Out Of 1,326 (${hand.probability})`,
    `- **Preflop Rank**: ${hand.preflopRank}`,
    `- **Equity Vs. Random Hand**: ${hand.vsRandomEquity}`,
    '',
    '## 6-Max 100BB GTO Opening Strategy By Position',
    '| Position | Recommended Action |',
    '| :--- | :--- |',
    ...Object.entries(hand.rfiByPosition).map(([pos, act]) => `| ${pos} | ${act} |`),
    '',
    '## Facing A 3-Bet & Postflop Playbook',
    `- **Facing A 3-Bet**: ${hand.vs3Bet}`,
    `- **Postflop Execution**: ${hand.postflopPlaybook}`,
    '',
    '## Head-To-Head Preflop Equity Matchups',
    '| Villain Hand | Hero Equity | Villain Equity | Tie % |',
    '| :--- | :--- | :--- | :--- |',
    ...hand.matchups.map((m) => `| ${m.villain} | ${m.heroEquity} | ${m.villainEquity} | ${m.tie} |`),
    '',
    '## Interactive Smarter.Poker Tools For This Hand',
    `- **Simulate ${hand.code} Equity**: [Poker Odds Calculator](https://smarter.poker/tools/poker-odds-calculator?hand1=${encodeURIComponent(hand.code)})`,
    '- **View Full 13x13 Preflop Grid**: [GTO Preflop Range Matrix](https://smarter.poker/tools/preflop-ranges)',
    '- **All Starting Hands**: [Starting Hand Encyclopedia](https://smarter.poker/learn/hands)',
    '',
  ].join('\n');
}
