/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES KB — Union Dashboard + Union Games (Club Arena)
   Source-verified against:
     pages/hub/club-arena/union-dashboard.js  (2034 lines)
     pages/hub/club-arena/union-games.js       (1134 lines)
   Every tab and feature documented from the actual source code.
   ═══════════════════════════════════════════════════════════════════════════ */

export const UNION_DASHBOARD_ENTRIES = [

    // ── What is a Union ──
    {
        id: 'ud-1', category: 'Club Arena — Union',
        keywords: ['union', 'what is a union', 'club union', 'union system', 'poker union'],
        patterns: ['what is a union', 'what is the union system', 'how do unions work', 'what does a union do'],
        answer: '**Unions** let you manage multiple clubs under one umbrella with shared infrastructure.\n\n**Union Benefits:**\n- **Shared chips** — Mint chips once, distribute across all member clubs\n- **Cross-club tournaments** — Run XMTTs with all union clubs contributing players\n- **Centralized agents** — Manage agents and their commissions union-wide\n- **Settlement system** — Open and close settlement periods for all clubs\n- **Union wallet** — Central treasury for fund distribution\n- **Union BBJ** — Bad Beat Jackpot pooled across all clubs\n\n**Who can create a union?**\nAny club owner can create a union from Club Arena > Union Dashboard. You become the Union Lead.\n\n**Union Roles:**\n- **Union Lead** — Full control (only 1 per union). Can add/remove clubs, admins, and change all settings.\n- **Union Admin** — Manages day-to-day operations but cannot change union structure.',
        followUps: ['How do I create a union?', 'How do I add clubs to my union?', 'What is XMTT?'],
    },

    // ── How to Create a Union ──
    {
        id: 'ud-2', category: 'Club Arena — Union',
        keywords: ['create union', 'create a union', 'new union', 'start union'],
        patterns: ['how do i create a union', 'how to make a union', 'how to start a union'],
        answer: '**Creating a Union:**\n\n1. Go to **Club Arena > Union Dashboard**\n2. If you have no union yet, you will see the **Create a Union** form\n3. Enter:\n   - **Union Name** (required)\n   - **Description** (optional)\n   - **Union Rake Hold Rate** — percentage of the period rake the union retains (default 10%)\n4. Tap **Create Union**\n5. You are now the **Union Lead** — your union code will be shown\n\n**After creation:**\n- Add clubs via **Manage Clubs** tab\n- Clubs can also apply to join via their Club Code\n- Invite admins from the **Admins** tab',
        followUps: ['How do I add clubs to a union?', 'What is the union rake hold?', 'How do I invite union admins?'],
    },

    // ── Overview Tab ──
    {
        id: 'ud-3', category: 'Club Arena — Union',
        keywords: ['union overview', 'union stats', 'union dashboard overview', 'union dashboard tab'],
        patterns: ['what is on the union overview tab', 'what does the union dashboard show', 'union overview features'],
        answer: '**Union Dashboard — Overview Tab** shows your union\'s vital stats at a glance:\n\n**Key Metrics:**\n- **Clubs** — Number of member clubs\n- **Members** — Total players across all clubs\n- **Active Agents** / Suspended Agents\n- **Agent Players** — Players under agents\n- **Total Treasury** — Combined chip balance of all clubs\n- **Total Rake** — All-time rake collected union-wide\n- **Weekly Rake** — Rake from the current settlement period\n- **Union Hold** — Your cut (e.g., 10% of weekly rake)\n- **Total Agent Credit In Use** — Outstanding credit exposure\n\n**Alerts on Overview:**\n- Pending club join applications (with Review button)\n- Clubs requesting to leave the union\n- Live/scheduled tournament count\n- Bad Beat Jackpot pool balance\n\n**Quick Actions:** View Games, Wallets, Commissions, Mint Chips, Settlement, Add Club',
        followUps: ['What is the BBJ wallet?', 'How does settlement work?', 'How do I mint chips?'],
    },

    // ── Clubs Tab ──
    {
        id: 'ud-4', category: 'Club Arena — Union',
        keywords: ['union clubs tab', 'union member clubs', 'clubs in union', 'union club list'],
        patterns: ['what is the union clubs tab', 'how do i see clubs in my union', 'how do i manage club list'],
        answer: '**Union Dashboard — Clubs Tab** lists all clubs in the union.\n\n**For each club you see:**\n- Club name and code\n- Member count\n- Chip treasury balance\n- Total rake collected\n- Commission rate (editable by Union Lead)\n\n**Actions:**\n- **Admin Panel** → Open that club\'s admin management page\n- **Lobby** → Go to the club\'s player-facing lobby\n- **Edit Commission Rate** (Union Lead only) — Set what percentage of rake the club retains vs. union\n\n**Searching:** If you have 5+ clubs, a search bar appears to filter by club name.',
        followUps: ['How do commissions work?', 'How do I remove a club from the union?', 'What is the commission rate?'],
    },

    // ── Agents Tab ──
    {
        id: 'ud-5', category: 'Club Arena — Union',
        keywords: ['union agents tab', 'union agents', 'agent management union', 'view all agents'],
        patterns: ['what is the union agents tab', 'how do i see all agents in my union', 'manage agents union wide'],
        answer: '**Union Dashboard — Agents Tab** shows every agent across all union clubs.\n\n**Each agent row shows:**\n- Agent name and chip balance\n- Credit limit vs. credit used\n- Commission rate (%)\n- Status (active / suspended)\n\n**What you can do:**\n- **Search agents** by name\n- **View credit exposure** — how much total credit is outstanding\n- **Edit commission rates** per agent (inline)\n- **Suspend/unsuspend** agents across the union\n- See which club each agent belongs to\n\n**Why it matters:** Without this view, you would need to open each club separately to see agents. The union agents tab aggregates everything in one place.',
        followUps: ['How do I suspend an agent?', 'What is agent credit?', 'How do commissions work union-wide?'],
    },

    // ── Settlement Tab ──
    {
        id: 'ud-6', category: 'Club Arena — Union',
        keywords: ['union settlement', 'settlement tab', 'settle period', 'settlement union', 'close period', 'open period'],
        patterns: ['how does union settlement work', 'how do i settle a club', 'how do i open a settlement period', 'how do i close a settlement period', 'what is settlement in union'],
        answer: '**Union Dashboard — Settlement Tab** manages settlement periods for each club.\n\n**Settlement Actions:**\n- **Open** — Starts a new settlement period for a club (begins tracking rake)\n- **Close** — Closes the current period and locks the rake totals\n- **Pay All** — Distributes commission payments for the most recently closed period\n- **Status** — Shows current and recent periods with their rake totals\n\n**How to settle:**\n1. Select a club from the dropdown\n2. Choose an action (Open, Close, Status, Pay All)\n3. Press Execute\n\n**Tip:** Always check **Status** first to see if a period is already open before opening a new one. The Pay All action automatically finds the most recent closed period.',
        followUps: ['What is a settlement period?', 'How do commissions get paid?', 'What is union hold rate?'],
    },

    // ── Wallets Tab ──
    {
        id: 'ud-7', category: 'Club Arena — Union',
        keywords: ['union wallet', 'wallets tab', 'union funds', 'transfer funds', 'union wallet balance'],
        patterns: ['what is the union wallets tab', 'how do i see union wallet', 'how do i transfer chips between clubs', 'union wallet transactions'],
        answer: '**Union Dashboard — Wallets Tab** shows union-level chip balances and lets you transfer funds.\n\n**Wallet Types:**\n- **Main Wallet** — Primary union chip reserve\n- **BBJ Wallet** — Bad Beat Jackpot pool balance\n- **Promo Wallet** — Promotional chip reserve\n\n**Actions:**\n- **Send to Club** — Transfer chips from the union wallet to a member club\n- Enter the amount and optional notes, then confirm\n- **Transaction History** — View all past wallet movements (filter by All/In/Out)\n\n**Real-time updates:** Wallet balances refresh automatically via Supabase Realtime whenever a transaction occurs.',
        followUps: ['What is the BBJ wallet?', 'How do I send chips from the union to a club?', 'What is the promo wallet?'],
    },

    // ── Commissions Tab ──
    {
        id: 'ud-8', category: 'Club Arena — Union',
        keywords: ['union commissions tab', 'commission history', 'commission tracking', 'union commission'],
        patterns: ['what is the union commissions tab', 'how do i see commission history', 'union commission reports'],
        answer: '**Union Dashboard — Commissions Tab** shows commission payment history across all union clubs.\n\n**What you see:**\n- Commission payments made per settlement period\n- Which club, which period, and the total commission amount\n- Per-club commission rate applied\n\n**Commission Formula:**\n- Club retains X% of their rake (the club\'s commission rate — e.g., 90%)\n- Union holds the remaining % (the union hold rate — e.g., 10%)\n- Example: $10,000 rake, 90% club rate, 10% union hold → Club gets $9,000, Union gets $1,000\n\nCommission history loads lazily when you first click this tab.',
        followUps: ['How do I change a club\'s commission rate?', 'What is the union hold rate?', 'How does settlement pay out commissions?'],
    },

    // ── Mint Chips Tab ──
    {
        id: 'ud-9', category: 'Club Arena — Union',
        keywords: ['union mint chips', 'mint chips tab', 'mint', 'create chips union', 'add chips', 'chip minting'],
        patterns: ['how do i mint chips in the union', 'how do i create chips for my clubs', 'how does chip minting work'],
        answer: '**Union Dashboard — Mint Chips Tab** creates new chips and adds them to a club\'s treasury.\n\n**How to mint:**\n1. Go to **Mint Chips** tab on the Union Dashboard\n2. Select the **target club** from the dropdown\n3. Enter the **amount** of chips to create\n4. Press **Mint**\n\n**Important:**\n- Only **Union Leads** and **Union Admins** can mint chips\n- Minted chips go directly to the club\'s chip treasury\n- Chips can then be distributed to players via the club\'s Chip Management panel\n- No rake or fees — minting creates chips from the union\'s chip reserve\n\n**Difference from Club-Level Mint:**\nUnion minting adds to a club\'s treasury. Club-level minting (in Admin > Mint Chips) also adds to treasury but only for that specific club and is accessible to the club\'s own admins.',
        followUps: ['How do I distribute chips to players?', 'What is the chip treasury?', 'What is the promo wallet?'],
    },

    // ── BBJ Tab ──
    {
        id: 'ud-10', category: 'Club Arena — Union',
        keywords: ['bbj', 'bad beat jackpot', 'bbj tab', 'union bbj', 'bbj pool', 'bbj wallet', 'bad beat'],
        patterns: ['what is bbj', 'what is the bad beat jackpot', 'how does the union bbj work', 'how do i see the bbj pool', 'bbj distribution'],
        answer: '**Union BBJ (Bad Beat Jackpot)** is a shared jackpot pool funded by rake across all union clubs.\n\n**BBJ Distribution Settings (configurable):**\n- **Main Pot %** — Percentage paid to the losing hand ("bad beat") — default 40%\n- **Backup Pot %** — Paid to the winning hand — default 30%\n- **Promo Pot %** — Held for future promotions — default 30%\n\n**How it works:**\n1. A small portion of every hand\'s rake feeds the BBJ wallet\n2. When a qualifying bad beat hand occurs, the jackpot triggers\n3. Chips are distributed automatically per the configured percentages\n\n**Viewing the BBJ:**\n- Current pool balance shows on the **Overview** tab if the BBJ wallet has a balance\n- Full BBJ config and history is in the **BBJ tab** on the Union Dashboard\n- Each club can also configure its own BBJ via **Admin > BBJ Config**\n\n**Triggering:** Qualifying hand = a very strong hand (e.g., quad Aces or better) losing to a stronger hand.',
        followUps: ['How do I configure the BBJ percentages?', 'How do I enable BBJ for a club?', 'What is the BBJ wallet balance?'],
    },

    // ── Admins Tab ──
    {
        id: 'ud-11', category: 'Club Arena — Union',
        keywords: ['union admins tab', 'add union admin', 'union admin management', 'union admin roles'],
        patterns: ['how do i add a union admin', 'how do i manage union admins', 'what is the union admins tab', 'how do i remove a union admin'],
        answer: '**Union Dashboard — Admins Tab** (Union Lead only) manages who can administer the union.\n\n**Admin Roles:**\n- **Union Lead** — Creator/owner. Full control including deleting the union and adding/removing admins and clubs. Only 1 per union.\n- **Union Admin** — Can manage day-to-day operations but cannot change union structure.\n\n**Adding an admin:**\n1. Open the **Admins** tab\n2. Type a username in the search box\n3. Select the user from results\n4. Confirm — they get union admin access immediately\n\n**Removing an admin:**\n- Use the Remove button next to the admin\'s name (requires two-tap confirmation)\n\n**Being a union admin also grants:**\n- Access to each member club\'s Admin Panel (even without being a club owner)',
        followUps: ['What is the difference between Union Lead and Union Admin?', 'How do I manage clubs in the union?'],
    },

    // ── Manage Clubs Tab ──
    {
        id: 'ud-12', category: 'Club Arena — Union',
        keywords: ['manage clubs tab', 'add club union', 'remove club union', 'union applications', 'club join requests', 'leave union'],
        patterns: ['how do i add a club to the union', 'how do i remove a club from the union', 'how do i approve club applications', 'how do clubs join the union', 'leave request union'],
        answer: '**Union Dashboard — Manage Clubs Tab** (Union Lead only) controls which clubs belong to the union.\n\n**Adding a club manually:**\n1. Enter the **Club ID** in the add field\n2. Set the **commission rate** for that club (required before adding)\n3. Press Add Club\n\n**Club Join Applications:**\n- Clubs can apply to join by submitting their Club ID\n- Pending applications appear at the top of this tab\n- Review each application and set the commission rate, then Approve or Reject\n\n**Club Leave Requests:**\n- Clubs can request to leave the union\n- These appear as alerts on both the Overview and Manage Clubs tabs\n- Approve or Deny each request\n\n**Union Announcements:**\n- Send a text announcement to all clubs (or a specific club)\n- Messages are delivered to the club\'s announcement feed',
        followUps: ['How does a club apply to join a union?', 'How do I send an announcement to union clubs?'],
    },

    // ── Union Settings Tab ──
    {
        id: 'ud-13', category: 'Club Arena — Union',
        keywords: ['union settings', 'union settings tab', 'change union name', 'union hold rate', 'edit union'],
        patterns: ['how do i change union settings', 'how do i rename my union', 'how do i change the union rake hold', 'union settings tab'],
        answer: '**Union Dashboard — Settings Tab** (Union Lead only) edits the union\'s core configuration.\n\n**Editable fields:**\n- **Union Name** — Display name of the union\n- **Description** — What the union is about\n- **Union Rake Hold Rate (%)** — Percentage of each settlement period\'s rake that goes to the union (default 10%)\n- **BBJ Percentages** — How BBJ jackpots are split (Main/Backup/Promo)\n\n**Saving:** Changes take effect immediately and broadcast to all union members via Supabase Realtime.',
        followUps: ['What is the union rake hold rate?', 'How does BBJ work?'],
    },
];

/* ═══════════════════════════════════════════════════════════════════════
   UNION GAMES — Tournaments + Cash Games
   ═══════════════════════════════════════════════════════════════════════ */
export const UNION_GAMES_ENTRIES = [

    {
        id: 'ug-1', category: 'Club Arena — Union',
        keywords: ['union games', 'union tournaments', 'cross club tournament', 'xmtt', 'union cash games'],
        patterns: ['what is union games', 'how do union tournaments work', 'what is an xmtt', 'how do i create a union tournament', 'cross club tournament'],
        answer: '**Union Games** is where you manage all tournaments and cash tables across your entire union from one screen.\n\n**Two main sections:**\n- **Tournaments** — Filter by Upcoming / Running / Past\n- **Cash Games** — Filter by Active / Closed / All\n\n**Creating a Union Tournament (XMTT):**\n1. Go to **Union Dashboard > Games tab** (or Union Games page)\n2. Tap **+ Create Tournament**\n3. Fill in: Name, Type, Host Club, variant (NLH/PLO4/PLO5/Short Deck)\n4. Set buy-in, starting chips, max players, late reg levels\n5. Enable rebuys / add-on if desired\n6. Set guaranteed prize pool and scheduled start time\n7. For **XMTT**: select which member clubs participate (players from all selected clubs pool together)\n8. Tap **Create Tournament**\n\n**Tournament Types:**\n- **XMTT** — Cross-club MTT: players from multiple clubs compete together\n- **MTT** — Standard multi-table tournament (single club)\n- **SNG** — Sit & Go\n\n**Real-time:** Tournament and table status updates live via Supabase subscriptions.',
        followUps: ['How do I start a union tournament?', 'How do I create a union cash table?', 'What is XMTT?'],
    },

    {
        id: 'ug-2', category: 'Club Arena — Union',
        keywords: ['union cash table', 'create cash table union', 'union table creation'],
        patterns: ['how do i create a cash table in the union', 'how do union cash games work', 'create union table'],
        answer: '**Creating a Union Cash Table:**\n\n1. In Union Games, tap **+ Create Table** (Cash Games tab)\n2. Select the **host club**\n3. Enter table name, game variant (NLH, PLO4, PLO5, Short Deck)\n4. Set **small blind / big blind** (buy-ins auto-calculate: 40x BB min, 200x BB max)\n5. Set **ante**, **max players** (2-9), **action time** (seconds)\n6. Set **rake %** and **rake cap**\n7. Tap Create\n\n**Managing tables:**\n- Active tables show player count and status\n- Empty tables (0 players) can be **closed** from the Games view\n- Tap **Go to Club Lobby** to see the table in context\n\n**UNION badge:** Tables created by the union are tagged with a purple UNION badge.',
        followUps: ['How does rake work in club games?', 'How do I close a table?'],
    },

    {
        id: 'ug-3', category: 'Club Arena — Union',
        keywords: ['tournament status', 'start tournament', 'open registration', 'cancel tournament union'],
        patterns: ['how do i start a union tournament', 'how do i open registration for a tournament', 'how do i cancel a union tournament'],
        answer: '**Union Tournament Lifecycle:**\n\n1. **Scheduled** → Tap **Open Registration** to start accepting entries\n2. **Registering** → Once 2+ players registered, tap **Start Now** (two-tap confirm)\n3. **Running** → Tournament is live. View in real-time.\n4. **Complete** → Results locked, moved to Past\n\n**Cancel:** Any scheduled or registering tournament can be cancelled (two-tap confirm). All registered players are automatically refunded.\n\n**Late Registration:** Stays open for the number of blind levels you configured (e.g., 6 levels late reg).\n\n**Rebuys/Add-ons:** Available to players during the configured rebuy period (first N levels).',
        followUps: ['How do rebuys work?', 'How do I view tournament results?'],
    },
];
