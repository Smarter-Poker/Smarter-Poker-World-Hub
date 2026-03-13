/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA, BANKROLL MANAGER, TOKE TRACKER, POKER NEAR ME, MEMORY GAMES
   Massively expanded from original ~26 entries to 70+ comprehensive entries.
   ═══════════════════════════════════════════════════════════════════════════ */

export const CLUB_ARENA_ENTRIES = [
    {
        id: 'ca-1', category: 'Club Arena',
        keywords: ['club arena', 'online poker', 'poker club', 'join club', 'play online', 'club games', 'what is club arena'],
        patterns: ['what is club arena', 'how do i join a club', 'how to play online poker', 'how does club arena work', 'what can i do in club arena'],
        answer: '**Club Arena** is the online poker room ecosystem inside Smarter.Poker.\n\n**Full Feature Set:**\n- **Lobby** — Browse all available clubs and open games\n- **My Clubs** — Quick access to clubs you\'re a member of\n- **Cash Games** — Join ring games at your stakes of choice\n- **Tournaments** — Club-hosted and platform-wide events\n- **Hand Histories** — Review and replay every hand\n- **Player Stats** — Detailed performance analytics\n- **Leaderboard** — Club and platform rankings\n- **Cashier** — Deposit/withdraw chip balance\n- **Messages** — In-club chat and announcements\n- **Players** — See who is online\n- **Marketplace** — Club items and merchandise\n- **Agent Dashboard** — For referring players (earn commissions)\n- **Union Dashboard** — Cross-club coordination\n\n**Getting Started:**\n1. Hub > Club Arena Orb\n2. Browse clubs in the Lobby\n3. Request membership (or accept an invite)\n4. Deposit chips to your balance\n5. Join a game!',
        followUps: ['How do I create my own club?', 'What is the union system?', 'How do I deposit chips?']
    },
    {
        id: 'ca-2', category: 'Club Arena',
        keywords: ['create club', 'start club', 'new club', 'club admin', 'my clubs', 'own a club', 'poker club owner'],
        patterns: ['how do i create a club', 'how to start my own club', 'how do i manage my club', 'can i own a poker club'],
        answer: '**Creating Your Own Club:**\n\n1. Club Arena > My Clubs > Create Club\n2. Configure:\n   - **Club Name** — Unique identifier\n   - **Club Description** — What your club is about\n   - **Logo & Banner** — Custom branding\n   - **Privacy** — Public (anyone can find it) or Private (invite-only)\n   - **Membership Requirements** — Approval process\n   - **Game Types** — What stakes/variants you host\n   - **Club Rules** — Your house rules\n3. Set up the **Cashier** — Define chip buy-in options\n4. **Invite members** — Share your club link or approval code\n\n**Club Admin Tools:**\n- Member management (approve, promote, suspend, ban)\n- Game scheduling and announcements\n- Club-wide tournaments\n- Analytics: active players, volume, retention\n- Rake settings and profit tracking\n- Agent network (approve agents to recruit for you)',
        followUps: ['How do I invite players to my club?', 'What is the union dashboard?', 'How do club agents work?']
    },
    {
        id: 'ca-3', category: 'Club Arena',
        keywords: ['hand histories', 'hand history', 'review hands', 'past hands', 'club hands', 'replay hand', 'view hands'],
        patterns: ['where are my hand histories', 'how do i review hands', 'how to see past hands in club arena', 'how do i replay a hand'],
        answer: '**Hand Histories** in Club Arena give you a complete record of every hand.\n\n**Accessing:**\nClub Arena > Hand Histories (or from the game table after a hand)\n\n**Features:**\n- Browse all hands you have played, filterable by:\n  - Date range\n  - Game type and stakes\n  - Result (won/lost, showdown/no showdown)\n  - Specific opponent\n- **Replay** — Step through each street action by action with full player info\n- **Analysis** — Send any hand directly to Jarvis AI for analysis\n- **Share** — Post interesting hands to your social feed\n- **Export** — Download as standard hand history format for use in third-party tools\n\nHand histories are stored permanently and sync across devices.',
        followUps: ['Can I filter for only my losing hands?', 'How do I share a hand?', 'How do I get Jarvis to analyze a hand?']
    },
    {
        id: 'ca-4', category: 'Club Arena',
        keywords: ['club cashier', 'deposit', 'withdraw', 'club balance', 'chips', 'buy chips', 'add chips', 'chip balance'],
        patterns: ['how do i deposit to a club', 'how does the cashier work', 'how to get chips in club arena', 'how do i add chips to my balance'],
        answer: '**Club Cashier** manages your chip balance for playing.\n\n**Depositing Chips:**\n1. Club Arena > Cashier > Deposit\n2. Select the amount from available options\n3. Confirm the transaction\n4. Chips are instantly credited to your balance\n\n**Withdrawing Chips:**\n1. Cashier > Withdraw\n2. Enter amount (must be above minimum withdrawal)\n3. Confirm — processed within 24-48 hours depending on the club\'s payment schedule\n\n**Key Rules:**\n- Each club has its own chip economy (balances are per-club)\n- Minimum deposit and withdrawal amounts are set by the club admin\n- Transaction history viewable under Cashier > History\n- Balance shown in real-time on the main cashier screen\n\n**Security:** All transactions are logged and protected by Supabase RLS (Row Level Security).',
        followUps: ['Are chips transferable between clubs?', 'How do I see my transaction history?', 'What if my deposit is not showing?']
    },
    {
        id: 'ca-5', category: 'Club Arena',
        keywords: ['agent dashboard', 'agent', 'club agent', 'referral', 'agent program', 'recruiting players', 'earn commission'],
        patterns: ['what is the agent dashboard', 'how do i become an agent', 'what is the agent program', 'how do i earn commissions in club arena'],
        answer: '**Agent Dashboard** enables player referral and commission earning.\n\n**How Agents Work:**\n- Agents recruit new players to a club\n- Each agent has a unique referral code/link\n- When a referred player joins and plays, the agent earns a commission\n- Commission = % of the rake generated by referred players\n\n**Agent Dashboard Shows:**\n- Total players recruited and their activity\n- Pending and paid commissions\n- Commission rate (set by club admin)\n- Agent network (sub-agents you recruited)\n- Earnings reports by week/month\n\n**Becoming an Agent:**\n- Club admin must approve you as an agent\n- Contact the club owner and request agent status',
        followUps: ['What commission rate do agents earn?', 'Can I have sub-agents under me?']
    },
    {
        id: 'ca-6', category: 'Club Arena',
        keywords: ['union', 'union dashboard', 'club union', 'multi club', 'cross club', 'shared player pool', 'club network'],
        patterns: ['what is the union dashboard', 'what is a club union', 'how do i join a union', 'how does the union system work'],
        answer: '**Club Unions** allow multiple clubs to pool players and share resources.\n\n**Benefits:**\n- **Shared Player Pool** — Players from any union club can play in union games\n- **Cross-Club Tournaments** — Run events open to all union members\n- **Combined Leaderboards** — Competition across the whole network\n- **Shared Cashier** — Chips usable across all union clubs (if enabled)\n- **Union Announcements** — Message all union members at once\n\n**Union Dashboard:**\n- Manage union membership (add/remove clubs)\n- Set union rules and shared settings\n- View combined analytics across all clubs\n- Schedule union-wide events\n\n**Creating a Union:**\nContact Smarter.Poker support with your club details to set up a union.',
        followUps: ['Can my club be in multiple unions?', 'How do I see union analytics?']
    },
    {
        id: 'ca-7', category: 'Club Arena',
        keywords: ['player stats', 'club stats', 'statistics', 'performance', 'win rate', 'hands played', 'vpip', 'pfr'],
        patterns: ['where are my player stats', 'how do i see my club arena stats', 'what statistics are tracked in club arena'],
        answer: '**Player Stats** track your performance across all Club Arena games.\n\n**Stats Tracked:**\n- **Hands Played** — Total hands by game type\n- **Win Rate** — BB/100 over your hand sample\n- **VPIP** — Voluntarily Put In Pre-flop % (how loose you play)\n- **PFR** — Pre-flop Raise % (how aggressive you are)\n- **3-Bet %** — How often you 3-bet\n- **WTSD** — Went to Showdown % (how often you see rivers)\n- **W$SD** — Won money at showdown %\n- **Best/Worst Sessions** — Highest wins and losses\n- **Profit by Game Type** — NLH vs PLO vs tournaments\n\nAccess from Club Arena > Player Stats or your profile.',
        followUps: ['What is a good VPIP?', 'How do I send my stats to Jarvis?', 'Can other players see my stats?']
    },
    {
        id: 'ca-8', category: 'Club Arena',
        keywords: ['club rules', 'house rules', 'game rules', 'table rules', 'time bank', 'action clock', 'shot clock'],
        patterns: ['what are the game rules', 'how does the action clock work', 'what is a time bank', 'how long do i have to act'],
        answer: '**Club Arena Game Rules:**\n\n**Action Clock:**\n- Each player has a configurable time limit to act (default: 30 seconds)\n- A visual countdown appears when your turn comes\n- **Time Bank** — Extra time reserve (default: 60 seconds per session)\n  - Activated automatically when clock expires\n  - Use it for tough decisions\n  - Replenishes partially each hand\n\n**Standard Rules:**\n- All games use standard poker rules for each variant\n- Betting: No-Limit, Pot-Limit, or Fixed-Limit depending on game\n- Split pots: Automatic for ties\n- All-in protection: You cannot be forced out of a hand when all-in\n\n**House Rules:**\nEach club can set additional house rules. Review in Club Details before joining.',
        followUps: ['What happens if my time bank runs out?', 'Are there straddle options?', 'Is there a hand replay after the hand ends?']
    },
];

// ─────────────────────────────────────────────────────────────
export const BANKROLL_ENTRIES = [
    {
        id: 'br-1', category: 'Bankroll Manager',
        keywords: ['bankroll manager', 'bankroll', 'finances', 'money tracking', 'financial', 'roi', 'what is bankroll'],
        patterns: ['what is the bankroll manager', 'how do i track my bankroll', 'how does bankroll manager work', 'how to manage my poker money'],
        answer: '**Bankroll Manager** (ORB-08) is your complete poker financial intelligence system.\n\n**Feature Overview:**\n- **Session Tracking** — Log every session with buy-in, cash-out, duration, venue, game type\n- **Real-time P&L** — Running profit/loss updates after every entry\n- **ROI Analysis** — Win rate, hourly rate, ROI by game/stakes/venue\n- **Leak Detection** — Identify your most expensive patterns automatically\n- **Goal Setting** — Set bankroll targets and track progress\n- **Graphs** — Visual profit timeline and trend analysis\n- **Location Intelligence** — GPS-tagged venue performance\n- **Player Notes** — Notes against opponents at each venue\n- **Alert System** — Notifications when bankroll drops below your safety buffer\n- **Session Journal** — Add notes to each session for qualitative tracking\n- **Professional Suite** — Multi-game tracking, staking contracts, tax export\n\nAll data syncs in real-time via Supabase.',
        followUps: ['How do I log a session?', 'How is ROI calculated?', 'What is the leak detection feature?']
    },
    {
        id: 'br-2', category: 'Bankroll Manager',
        keywords: ['log session', 'add session', 'record session', 'buy in', 'cash out', 'session entry', 'new session'],
        patterns: ['how do i log a session', 'how to add a poker session', 'how do i record my results', 'how do i add a buy in'],
        answer: '**Logging a Session:**\n\n1. Open Bankroll Manager\n2. Tap **Add Session** (+ button)\n3. Fill in the session details:\n   - **Date and Start/End time**\n   - **Venue** — Select saved venue or enter new\n   - **Game Type** — Cash NLH, Tournament, PLO, Mixed, etc.\n   - **Stakes** — 1/2, 2/5, 5/10, etc.\n   - **Buy-in** — Initial + any rebuys\n   - **Cash-out** — Ending stack value\n   - **Profit/Loss** — Calculated automatically\n   - **Session Notes** — Optional qualitative notes\n4. Tap **Save**\n\n**Your running bankroll and stats update instantly.**\n\n**Tips:**\n- Log within 24 hours before memory fades\n- Add notes about significant hands or reads\n- Tournament entries: log buy-in as expense, any payout as income',
        followUps: ['Can I edit a session after saving?', 'How do I log a re-buy?', 'How do I track tournament entries?']
    },
    {
        id: 'br-3', category: 'Bankroll Manager',
        keywords: ['bankroll analytics', 'statistics', 'win rate', 'hourly rate', 'profit chart', 'graphs', 'charts'],
        patterns: ['how do i see my statistics', 'what analytics are available', 'how to check my win rate', 'where is my profit chart', 'how do i see my graphs'],
        answer: '**Analytics & Charts** give you deep performance visibility:\n\n- **Total Profit/Loss** — Lifetime and custom date ranges\n- **Win Rate** — $/hour and BB/100 (if stakes known)\n- **Hourly Rate** — Average earnings per hour across all sessions\n- **ROI** — Return on investment % for tournaments\n- **Session Count** — Total sessions logged\n- **Average Session** — Typical duration, result, and volatility\n- **Best Session / Worst Session** — Extremes at a glance\n- **By Game Type** — Your NLH vs PLO vs tournament performance\n- **By Venue** — Which card rooms are most profitable\n- **By Day of Week** — Do you play better Fridays or Tuesdays?\n- **Profit Graph** — Visual timeline of bankroll over time\n- **Rolling Average** — Smoothed trend line to cut through variance\n\n**Pro tip:** Filter to the last 100 sessions for the most meaningful win rate sample.',
        followUps: ['How many sessions do I need for a meaningful sample?', 'What is a good hourly rate?', 'How do I find my leaks?']
    },
    {
        id: 'br-4', category: 'Bankroll Manager',
        keywords: ['leak detection', 'leaks', 'find leaks', 'losing spots', 'expensive habits', 'costly patterns'],
        patterns: ['how do i find my leaks', 'what is leak detection', 'how do i see where i lose money', 'how do i identify my bad habits'],
        answer: '**Leak Detection** automatically identifies your most costly patterns.\n\n**How it works:**\nThe system analyzes your session data and flags patterns that consistently produce negative results:\n\n**Common Leaks It Finds:**\n- Specific venues where you consistently lose\n- Game types with negative ROI (maybe you play PLO but only win at NLH)\n- Times of day where you underperform (late night sessions)\n- Extended sessions that go negative after X hours\n- Specific stake levels that are losing for you\n- Game types with high variance vs. your bankroll\n\n**Leak Report:**\nBankroll Manager > Analytics > Leak Detection — shows ranked list of your biggest losing patterns with suggested adjustments.',
        followUps: ['How do I fix a leak?', 'How accurate is leak detection?', 'Should I play less of my losing formats?']
    },
    {
        id: 'br-5', category: 'Bankroll Manager',
        keywords: ['bankroll goals', 'set goals', 'goal tracking', 'target bankroll', 'financial goals', 'milestones'],
        patterns: ['how do i set bankroll goals', 'how do i set a target', 'how to track progress toward a goal', 'how do i use goal setting'],
        answer: '**Goal Setting** keeps your bankroll progress focused.\n\n**Creating a Goal:**\n1. Bankroll Manager > Goals > Add Goal\n2. Choose goal type:\n   - **Target Bankroll** — e.g., grow to $5,000\n   - **Monthly Profit Target** — e.g., $500/month\n   - **Move Up Stakes** — When you reach X, move to higher game\n   - **Session Consistency** — Play X sessions per week\n3. Set the target amount and deadline\n4. Save\n\n**Progress Tracking:**\n- Progress bar on the main bankroll screen\n- Estimated completion date based on your current trajectory\n- Notifications when you hit milestones\n- Celebration animation when you achieve the goal!\n\nGoals keep you disciplined and motivated through variance.',
        followUps: ['What is proper bankroll management?', 'When should I move up stakes?', 'How many buy-ins should I have?']
    },
    {
        id: 'br-6', category: 'Bankroll Manager',
        keywords: ['bankroll management', 'buy in rules', 'how many buy ins', 'move up stakes', 'downswing', 'bankroll rules'],
        patterns: ['what is proper bankroll management', 'how many buy ins do i need', 'when should i move up in stakes', 'how do i handle downswings'],
        answer: '**Bankroll Management Rules (General Guidelines):**\n\n**Cash Games:**\n- Minimum: 20 buy-ins for your stake\n- Recommended: 30-50 buy-ins\n- Example: To play 1/2 NLH (max $200 buy-in) → $4,000-$10,000 bankroll\n\n**Tournaments:**\n- Minimum: 50 buy-ins\n- Recommended: 100+ buy-ins (high variance format)\n- Example: To play $100 MTTs regularly → $5,000-$10,000 bankroll\n\n**Moving Up:**\n- Move UP when you have 30+ buy-ins for the next level\n- Consider moving UP only after a statistically significant winning sample\n\n**Moving Down (Stop-Loss):**\n- Move DOWN if you lose 10+ buy-ins at a stake level\n- Always protect your ability to play your best game\n\n**Downswings:**\n- Even winning players experience 20+ buy-in downswings\n- Stay disciplined, review your play (not just results)',
        followUps: ['What buy-in is recommended for 2/5 NLH?', 'How do I handle tilt?', 'Should I have a separate tournament bankroll?']
    },
    {
        id: 'br-7', category: 'Bankroll Manager',
        keywords: ['player notes', 'opponent notes', 'hand notes', 'note taking', 'reads', 'villain notes'],
        patterns: ['how do i take player notes', 'where do i write notes on opponents', 'how to track opponents in bankroll manager'],
        answer: '**Player Notes** let you track opponent tendencies at each venue.\n\n**Adding a Note:**\n1. Bankroll Manager > Player Notes > Add Note\n2. Select venue (or add a new one)\n3. Search for or add player name/descriptor\n4. Write your note — tendencies, tells, history\n5. Save\n\n**Notes show up automatically** when you log a session at that venue.\n\n**Good notes to take:**\n- Position tendencies: "Plays very loose BTN but tight UTG"\n- Bet sizing tells: "Always pots it with made hands, small with draws"\n- Bluff frequency: "Never folds river, stop bluffing"\n- Stack management: "Playing scared with short stack"\n\nGood player notes give you a real edge during live sessions.',
        followUps: ['Can I import notes from Hold\'em Manager?', 'Are notes shared with other users?']
    },
    {
        id: 'br-8', category: 'Bankroll Manager',
        keywords: ['session alert', 'alert system', 'bankroll alert', 'low bankroll', 'stop loss alert', 'notification alert'],
        patterns: ['how do alerts work in bankroll manager', 'how do i set a stop loss alert', 'how do i get notified if my bankroll drops'],
        answer: '**Alert System** protects your bankroll automatically.\n\n**Alert Types:**\n- **Low Bankroll Alert** — Notified when bankroll falls below your set minimum\n- **Session Loss Limit** — Fixed stop-loss per session (e.g., alert at 3 buy-ins lost)\n- **Winning Session Reminder** — Remind yourself to consider leaving up\n- **Monthly Goal Progress** — Midpoint check on monthly targets\n- **Downswing Alert** — Triggered after X consecutive losing sessions\n\n**Setting Alerts:**\n1. Bankroll Manager > Settings > Alerts\n2. Enable each alert type\n3. Set your thresholds\n4. Choose delivery: in-app, push notification, or email\n\nThe alert system is designed to support smart, disciplined play and help you avoid tilt-driven decisions.',
        followUps: ['Can I set a daily loss limit?', 'How do I turn off specific alerts?']
    },
    {
        id: 'br-9', category: 'Bankroll Manager',
        keywords: ['export data', 'download data', 'csv export', 'tax export', 'backup data', 'download sessions'],
        patterns: ['how do i export my bankroll data', 'how to download my sessions', 'can i export for taxes', 'how do i back up my data'],
        answer: '**Exporting Bankroll Data:**\n\n**Export Options:**\n1. Bankroll Manager > Settings > Export\n2. Choose:\n   - **CSV** — All sessions in spreadsheet format\n   - **PDF Report** — Formatted report with charts (VIP feature)\n   - **Tax Summary** — Gambling wins/losses formatted for tax reporting\n3. Select date range\n4. Download to your device\n\n**CSV Includes:**\nDate, Venue, Game Type, Stakes, Buy-in, Cash-out, Profit/Loss, Duration, Notes\n\n**Tax Use:**\nThe tax export format groups wins and losses by year and game type. Always consult a tax professional for gambling income reporting in your jurisdiction.',
        followUps: ['Is poker income taxable?', 'How do I import into Excel?']
    },
];

// ─────────────────────────────────────────────────────────────
export const TOKE_TRACKER_ENTRIES = [
    {
        id: 'tt-1', category: 'Toke Tracker',
        keywords: ['toke tracker', 'toke', 'tips', 'dealer tips', 'dealer earnings', 'toke rate', 'ehr', 'what is toke tracker'],
        patterns: ['what is toke tracker', 'how do i track my tips', 'how does toke tracker work', 'what is ehr', 'what is toke tracker for'],
        answer: '**Toke Tracker** is a professional earnings management system for poker dealers.\n\n**Core Features:**\n- **Add Down** — Log each dealer down (30-min stint at a table)\n- **EHR (Effective Hourly Rate)** — Your true hourly earnings calculated per shift\n- **Shift Dashboard** — See all downs in a current shift with running totals\n- **Analytics** — Trend by game type, venue, day, time, and player type\n- **Dealer Vault** — Permanent archive of all historical earnings\n- **Venues** — Multi-venue support for dealers who work multiple rooms\n- **Expenses** — Log work-related expenses (commute, uniforms)\n- **Down Multiplier** — Apply bonus multipliers for high-action or tipping games\n- **Net Calculation** — Tokes minus expenses = true take-home\n\n**All data saves in real-time** and syncs across every device you use.',
        followUps: ['How do I add a down?', 'How is EHR calculated?', 'What is the Dealer Vault?']
    },
    {
        id: 'tt-2', category: 'Toke Tracker',
        keywords: ['add down', 'log down', 'new down', 'down entry', 'dealer down', 'cash stakes', 'cash variant', 'record down'],
        patterns: ['how do i add a down', 'how to log a dealer down', 'how to record a down', 'how to add a toke'],
        answer: '**Adding a Down (Step by Step):**\n\n1. Open Toke Tracker\n2. Tap **Add Down** (+)\n3. Fill in the for:\n   - **Game Type** — Cash game or Tournament\n   - **Cash Stakes** — 1/2, 2/5, 5/10, 10/25, etc. (for cash games)\n   - **Variant** — NLH, PLO, PLO8, Stud, Mixed, etc.\n   - **Toke Amount** — Dollar amount received during this down\n   - **Duration** — How long was the down? (typically 30 min)\n   - **Down Number** — Which down in your shift (auto-tracked)\n   - **Multiplier** — Apply a multiplier for bonus game types (e.g., 1.5x for bomb pot game)\n4. Review auto-calculated toke-per-hour\n5. Tap **Save**\n\n**Your EHR, shift total, and analytics update instantly.**\n\n**Tips:**\n- Log downs in real-time or at each break\n- Use the multiplier for high-action or high-tipping formats\n- Tournament downs: enter chip dealer/push amount if applicable',
        followUps: ['What is the down multiplier?', 'Can I add multiple downs at once?', 'How do I edit a down I already saved?']
    },
    {
        id: 'tt-3', category: 'Toke Tracker',
        keywords: ['ehr', 'effective hourly rate', 'hourly rate', 'calculate ehr', 'how is ehr calculated', 'true hourly'],
        patterns: ['what is ehr', 'how is ehr calculated', 'what is effective hourly rate', 'how do i see my ehr', 'what does ehr mean'],
        answer: '**EHR (Effective Hourly Rate)** is the most important metric for dealers — your true hourly earnings.\n\n**EHR Formula:**\n```\nEHR = Total Tokes ÷ Total Hours Dealt\n```\n\n**Example:**\n- Shift: 8 hours\n- Total tokes collected: $240\n- EHR = $240 ÷ 8 = **$30/hour**\n\n**Why EHR matters over flat toke amounts:**\n- A $50 toke for a 1-hour down = $50/hr EHR\n- A $50 toke for a 4-hour down = $12.50/hr EHR\n- Duration matters — EHR normalizes for varying down lengths\n\n**EHR Displays:**\n- Per down (at save time)\n- Per shift (running total)\n- Per day/week/month/year (trending analytics)\n- Filtered by game type or venue (highest EHR games)',
        followUps: ['What is a good EHR for a Vegas dealer?', 'How do I increase my EHR?', 'Does the multiplier affect EHR?']
    },
    {
        id: 'tt-4', category: 'Toke Tracker',
        keywords: ['down multiplier', 'multiplier', 'bonus multiplier', 'high tipping', 'apply multiplier', 'toke multiplier'],
        patterns: ['what is the down multiplier', 'how does the multiplier work', 'when should i use the multiplier', 'what does the multiplier do'],
        answer: '**Down Multiplier** adjusts the effective value of a toke for high-action or high-tipping situations.\n\n**How it works:**\nWhen you apply a multiplier, the toke is weighted higher in your analytics and EHR calculations.\n\n**When to use it:**\n- **Bomb Pot games** — Often tip more\n- **High-stakes tables** — $5/10+ players tend to tip better\n- **Special events** — Holiday games, tournaments with tipping culture\n- **Promotional tables** — Where the room adds incentive to toke the dealer\n\n**Example:**\n- Toke: $20, Multiplier: 1.5x → Effective value: $30 in analytics\n\n**Important:** The multiplier only affects analytics weighting — it does NOT change the actual dollar amount you earned. It helps you identify which game types are most valuable per minute at the table.',
        followUps: ['What multiplier should I use for bomb pots?', 'Does multiplier change my EHR?']
    },
    {
        id: 'tt-5', category: 'Toke Tracker',
        keywords: ['dealer vault', 'earnings history', 'past earnings', 'vault', 'historical data', 'archive', 'past shifts'],
        patterns: ['what is the dealer vault', 'where do i see past earnings', 'how do i view my history', 'how to access the vault'],
        answer: '**Dealer Vault** is your permanent earnings archive — a career record of every down you\'ve ever logged.\n\n**Vault Features:**\n- **Browse by:** Day / Week / Month / Year\n- **Totals per period:** Total tokes, hours worked, EHR\n- **Filter by:** Venue, game type, stake level\n- **Compare periods:** Month-over-month and year-over-year\n- **Trends:** Is your EHR improving over time?\n- **Completed Events:** Full detail history of every past shift\n- **Export:** Download your vault as CSV for taxes or personal records\n\n**Tax Use:**\nThe vault makes tax time easy — dealer income from tips is generally taxable. Export your vault for your tax records.\n\nYour vault is permanent — it never expires or deletes.',
        followUps: ['Can I export the vault?', 'How do I compare this month to last month?']
    },
    {
        id: 'tt-6', category: 'Toke Tracker',
        keywords: ['shift view', 'current shift', 'active shift', 'shift dashboard', 'running total', 'today earnings'],
        patterns: ['how do i see my current shift', 'where is the shift dashboard', 'how do i see my running total', 'where are today\'s downs'],
        answer: '**Shift Dashboard** is your live view of the current shift.\n\n**Live Displays:**\n- All downs logged today in chronological order\n- **Running Total** — Tokes earned so far this shift\n- **Current EHR** — Your hourly rate for this shift in progress\n- **Down Count** — How many downs you\'ve completed\n- **Hours Worked** — Time since your first down\n- **Projected End** — Estimated total if shift continues at current rate\n\n**During Your Shift:**\n- Add each down as you complete it\n- Edit the last down if you made an error\n- Quick-add mode for fast entry between downs\n\n**End of Shift:**\n- Tap **End Shift** to close it\n- Final EHR and totals saved to your vault\n- Shift summary card saved for your records',
        followUps: ['How do I end a shift?', 'Can I add a down to a past shift?']
    },
    {
        id: 'tt-7', category: 'Toke Tracker',
        keywords: ['expenses', 'work expenses', 'deductions', 'commute', 'uniform', 'tool expenses', 'dealer expenses'],
        patterns: ['how do i log expenses', 'can i track my expenses', 'how does expense tracking work', 'how do i add work expenses'],
        answer: '**Expense Tracking** lets you log work-related expenses to calculate true net earnings.\n\n**Trackable Expenses:**\n- Commute (gas, parking, Uber/Lyft)\n- Union dues\n- Uniform and shoe purchases\n- Work equipment\n- Table wipes, card covers\n- Meals (meal breaks at work)\n\n**Adding an Expense:**\n1. Toke Tracker > Expenses > Add\n2. Select category\n3. Enter amount and date\n4. Optional: upload a receipt photo\n5. Save\n\n**Net Earnings = Total Tokes - Total Expenses**\n\nNet earnings displayed in your analytics and vault for true take-home calculation. Critical for accurate tax reporting.',
        followUps: ['Are dealer expenses tax deductible?', 'How do I categorize my expenses?']
    },
    {
        id: 'tt-8', category: 'Toke Tracker',
        keywords: ['analytics', 'toke analytics', 'performance trends', 'best game', 'best shift', 'top venue', 'game analysis'],
        patterns: ['how do i see my analytics', 'what is my best game for tips', 'which venue pays the most', 'how do i see my trends'],
        answer: '**Toke Analytics** reveal exactly where and when you earn the most.\n\n**Breakdowns Available:**\n- **By Game Type** — NLH vs PLO vs Tournament: which has highest EHR?\n- **By Stakes** — Do higher stakes tip better?\n- **By Venue** — Which room pays best?\n- **By Day of Week** — Is Saturday your best day?\n- **By Time of Shift** — Morning shift vs evening: which earns more?\n- **By Month** — Seasonal trends in your earnings\n- **Best Individual Down** — Your highest single toke ever\n- **Best Shift** — Your highest earning shift\n- **Consistency Score** — How stable is your income?\n\nUse analytics to schedule yourself strategically — more shifts at your best venue, during your best hours.',
        followUps: ['How do I decide which shifts to pick up?', 'What game type generally pays best?']
    },
    {
        id: 'tt-9', category: 'Toke Tracker',
        keywords: ['multi venue', 'multiple venues', 'venue management', 'add venue', 'venue list', 'working multiple rooms'],
        patterns: ['how do i track multiple venues', 'how do i add a new venue', 'how do i work at multiple casinos', 'can i use toke tracker at different casinos'],
        answer: '**Multi-Venue Support** allows you to track earnings at every room you deal.\n\n**Adding Venues:**\n1. Toke Tracker > Venues > Add Venue\n2. Enter venue name, location, and your typical role\n3. Save as a named venue for quick selection when adding downs\n\n**Per-Venue Analytics:**\n- Separate EHR, totals, and averages per venue\n- Side-by-side comparison of your venues\n- Best days and games per venue\n- Tip culture assessment (calculated from your data)\n\n**Why it matters:**\nIf you work at Casino A and Casino B, you\'ll quickly see which pays better — and can schedule strategically.',
        followUps: ['How do I compare two venues?', 'Can I set a default venue?']
    },
];

// ─────────────────────────────────────────────────────────────
export const POKER_NEAR_ME_ENTRIES = [
    {
        id: 'pnm-1', category: 'Poker Near Me',
        keywords: ['poker near me', 'find poker', 'live poker', 'nearby', 'local poker', 'venues', 'card rooms', 'casino', 'home games'],
        patterns: ['how do i find poker near me', 'where can i play live poker', 'how to find local games', 'what is poker near me', 'how do i find a card room'],
        answer: '**Poker Near Me** (ORB-04) is your live game intelligence engine.\n\n**6-Tab Interface:**\n- **Venues** — Browse card rooms, casinos, and poker-friendly venues\n- **Events** — Upcoming tournaments and special events\n- **Live** — Real-time game availability (what\'s running RIGHT NOW)\n- **Map** — Interactive map with all venues in your area\n- **Saved** — Your bookmarked favorite venues\n- **More** — Additional tools and poker resources\n\n**How to Find Games:**\n1. Allow location access (or enter your city manually)\n2. Browse venues on the map or list view\n3. Tap any venue for details: hours, games, buy-ins, contact info\n4. See what games are running live right now\n5. Get directions straight from the app\n\n**Filter Options:** Distance, game type, buy-in range, hours open',
        followUps: ['How do I save a venue?', 'Can I see live game availability?', 'How do I add my home game?']
    },
    {
        id: 'pnm-2', category: 'Poker Near Me',
        keywords: ['my venues', 'saved venues', 'favorite venues', 'venue details', 'bookmark venue', 'saved poker rooms'],
        patterns: ['how do i save a venue', 'where are my saved venues', 'how to bookmark a venue', 'how do i see venue details'],
        answer: '**Saved Venues** bookmark your favorite poker rooms for instant access.\n\n1. Browse any venue in Poker Near Me\n2. Tap the **Bookmark** icon (heart or bookmark symbol)\n3. Access all saved venues from the **Saved** tab\n\n**Saved Venue Features:**\n- Quick one-tap navigation to each room\n- Automatic notifications when new events are added\n- Live game alerts when games start at your saved venues\n- Notes field: add your own info per venue (parking tips, best games)\n- Compare saved venues by EHR if you\'re a dealer (Toke Tracker integration)',
        followUps: ['Do I get notifications for saved venues?', 'How do I remove a saved venue?']
    },
    {
        id: 'pnm-3', category: 'Poker Near Me',
        keywords: ['daily tournaments', 'tournament schedule', 'local tournaments', 'upcoming tournaments', 'event calendar', 'local events'],
        patterns: ['where do i see daily tournaments', 'how to find local tournaments', 'what tournaments are near me', 'how do i see upcoming events'],
        answer: '**Events Tab** shows all upcoming tournament and special events near you.\n\n**Filtering:**\n- By date range\n- Buy-in range ($0 to unlimited)\n- Game type (NLH, PLO, Mixed, Draw)\n- Distance from you\n- Online vs live\n\n**Event Details Include:**\n- Structure info (starting chips, blind levels, blind schedule)\n- Registration open/closing times\n- Field cap and current registration count (where available)\n- Prize pool info (guaranteed or based on entries)\n- Venue details and directions\n\n**Set Reminders:** Tap any event > Save to get a notification reminder before registration closes.',
        followUps: ['Can I register online?', 'How do I set an event reminder?']
    },
    {
        id: 'pnm-4', category: 'Poker Near Me',
        keywords: ['add venue', 'submit venue', 'list venue', 'add my game', 'add my room', 'venue submission'],
        patterns: ['how do i add my venue', 'how to list my poker room', 'how do i submit a game', 'can i add my home game to poker near me'],
        answer: '**Adding a Venue:**\n\nAny player or room manager can submit a venue:\n\n1. Poker Near Me > Map or Venues > **Add a Venue** (+ button)\n2. Enter:\n   - Venue name\n   - Address\n   - Contact info (phone, website)\n   - Game types offered\n   - Typical hours\n   - Buy-in ranges\n   - Any additional notes\n3. Submit for review\n4. Administrator approves within 24-48 hours\n5. Venue goes live on the map!\n\nFor home games: submit as a private venue — only visible to approved players.',
        followUps: ['Can I make my venue private?', 'How do I update my venue information?']
    },
    {
        id: 'pnm-5', category: 'Poker Near Me',
        keywords: ['live games', 'games running now', 'real time games', 'what is running', 'live tab', 'games now'],
        patterns: ['how do i see what games are running now', 'can i see live games', 'how do i check if a room is open', 'what is pnm live tab'],
        answer: '**Live Tab** shows real-time game availability.\n\n**What you see:**\n- Venues with games actively running\n- Games currently available (1/2 NLH, 2/5 PLO, etc.)\n- Approximate wait time at each venue\n- Number of players on the waitlist per game\n- Estimated seat availability\n\n**How rooms update it:**\nRoom staff update their live game status directly via Commander integration or the venue management portal.\n\nAlways call the venue to confirm before making a long drive — coverage depends on rooms actively maintaining their status.',
        followUps: ['How do I get notified when a game starts?', 'Can I join the waitlist remotely?']
    },
];

// ─────────────────────────────────────────────────────────────
export const MEMORY_GAMES_ENTRIES = [
    {
        id: 'mg-1', category: 'Memory Games',
        keywords: ['memory games', 'memory', 'brain training', 'memory training', 'card memory', 'pattern recognition'],
        patterns: ['what are memory games', 'how do memory games work', 'how to play memory games', 'where are the memory games'],
        answer: '**Memory Games** train your poker recall and pattern recognition — skills that directly improve your live game.\n\n**Why Memory Matters in Poker:**\n- Remembering board textures from earlier streets\n- Recalling bet sizes and patterns across a session\n- Tracking player tendencies over multiple orbits\n- Processing multiple information streams simultaneously\n\n**Available Games:**\n- **Card Sequence Memory** — Remember the order of dealt cards\n- **Table Recall** — Remember who acted how on each street\n- **Board Replay** — Recreate the exact board texture from memory\n- **Pattern Flash** — Quickly identify hand strength patterns\n\n**Features:**\n- 5 difficulty levels (Beginner to Elite)\n- Timed challenges and accuracy tracking\n- Daily challenges with diamond rewards\n- Streak system and leaderboard\n\nStart with Beginner and progress — even 10 minutes of daily memory training noticeably sharpens table focus.',
        followUps: ['How do I earn diamonds from memory games?', 'What level is recommended for beginners?']
    },
];
