/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES KB — Club Arena Admin Panel (All Modals)
   Source-verified against pages/hub/club-arena/admin.js (1878 lines)
   All 12 admin modals + agent dashboard + rakeback + BBJ + shop documented.
   ═══════════════════════════════════════════════════════════════════════════ */

export const CLUB_ADMIN_ENTRIES = [

    {
        id: 'ca-admin-1', category: 'Club Arena — Admin',
        keywords: ['club admin panel', 'admin panel', 'club administration', 'club settings admin'],
        patterns: ['what is the club admin panel', 'how do i access club admin', 'what can i do in club admin', 'admin panel options'],
        answer: '**Club Admin Panel** is the control center for running your club.\n\n**Access:** Club Arena > Club Lobby > Admin button (owners and admins only)\n\n**All 12 Admin Options:**\n| Option | What it does |\n|---|---|\n| **Manage Members** | Add/remove players, change roles |\n| **Chip Management** | Send chips to specific members |\n| **Mint Chips** | Add chips to the club treasury |\n| **Agent Management** | Manage credit, commission, suspensions |\n| **Settlement** | Open/close settlement periods |\n| **Club Reports** | View stats: members, rake, hands played |\n| **Announcements** | Create/manage club announcements |\n| **Shop Management** | Add/edit/delete marketplace items |\n| **Rakeback** | Manage rakeback periods for players |\n| **Promo Wallet** | Mint promo chips + distribute to agents |\n| **BBJ Config** | Enable/disable Bad Beat Jackpot |\n| **Club Settings** | Edit name and description |\n| **Danger Zone** | Delete club (owner only) |\n\n**Dashboard Links (for admins/agents):**\n- Agent Dashboard — manage your players/cashouts\n- Union Dashboard — manage union settings (if club is in a union)',
        followUps: ['How do I manage members?', 'How do I distribute chips?', 'How do I configure BBJ?'],
    },

    {
        id: 'ca-admin-2', category: 'Club Arena — Admin',
        keywords: ['manage members', 'club members', 'member roles', 'remove member', 'change role', 'player roles'],
        patterns: ['how do i manage club members', 'how do i change a player role', 'how do i remove a member', 'what roles are there'],
        answer: '**Managing Club Members:**\n\nAdmin > Manage Members shows every member with their current role and chip balance.\n\n**Available Roles:**\n- **Owner** — Full control (cannot be changed or removed)\n- **Admin** — Full management access (can be assigned by owner only)\n- **Super Agent** — Senior agent with sub-agents beneath them\n- **Agent** — Manages a player group, handles cashouts\n- **Sub Agent** — Reports to an agent\n- **Player** — Standard club member\n\n**How to change a role:**\n1. Find the member in the Manage Members list\n2. Use the role dropdown next to their name\n3. Change takes effect immediately\n\n**Assigning agents to players:**\n- Players can be assigned to a specific agent via the dropdown\n- Shows the player\'s current agent and chip balance\n\n**Removing members:**\n- Tap Remove next to any non-owner member\n- Only owners can remove admins',
        followUps: ['What does an agent do?', 'How do I distribute chips to a member?'],
    },

    {
        id: 'ca-admin-3', category: 'Club Arena — Admin',
        keywords: ['distribute chips', 'send chips', 'chip distribution', 'give chips player'],
        patterns: ['how do i send chips to a player', 'how do i distribute chips', 'how do i give chips to a member', 'chip management'],
        answer: '**Chip Management (Admin > Chip Management)** lets you send chips directly to any member.\n\n**Steps:**\n1. Open Admin > Chip Management\n2. Select the member from the dropdown (shows current balance)\n3. Enter the amount to send\n4. Press **Send Chips**\n\n**Note:** The chips must exist in the club treasury first. If treasury is empty, mint chips first (Admin > Mint Chips).\n\n**Chip flow:**\n- Chips are minted → go to treasury\n- Admin distributes them → player receives chips in their balance\n- Player uses chips at tables → rake flows back to treasury',
        followUps: ['How do I mint chips?', 'What is the chip treasury?'],
    },

    {
        id: 'ca-admin-4', category: 'Club Arena — Admin',
        keywords: ['mint chips club', 'add chips treasury', 'club treasury', 'create chips'],
        patterns: ['how do i mint chips for my club', 'how do i add chips to the treasury', 'how do i create new chips'],
        answer: '**Mint Chips (Admin > Mint Chips)** creates new chips and adds them to the club\'s treasury.\n\n1. Open Admin > Mint Chips\n2. Enter the amount to mint\n3. Press Mint\n\nThe chips appear in the club treasury and can then be distributed to players.',
        followUps: ['How do union-level minting differ?', 'How do I send chips to players?'],
    },

    {
        id: 'ca-admin-5', category: 'Club Arena — Admin',
        keywords: ['agent management admin', 'agent credit', 'agent commission admin', 'suspend agent', 'unsuspend agent'],
        patterns: ['how do i manage agents in admin', 'how do i set agent credit limit', 'how do i suspend an agent', 'how do i change agent commission'],
        answer: '**Agent Management (Admin > Agent Management):**\n\n**What you can do:**\n- **Set credit limit** — How much credit an agent can extend to players\n- **Adjust commission rate** — Percentage of rakeback the agent receives\n- **Suspend agent** — Immediately blocks the agent from taking action\n- **Unsuspend** — Restores access\n\n**Roles you can manage:** Agent, Super Agent, Sub Agent\n\n**Credit explained:** Agents can give players credit (chip advances). The credit limit caps the total outstanding credit an agent can have with their players.',
        followUps: ['What is agent credit?', 'How do commissions work?', 'What is the agent dashboard?'],
    },

    {
        id: 'ca-admin-6', category: 'Club Arena — Admin',
        keywords: ['rakeback admin', 'rakeback period', 'manage rakeback', 'club rakeback'],
        patterns: ['how do i set up rakeback', 'how do i manage rakeback periods', 'what is rakeback admin', 'how does club rakeback work'],
        answer: '**Rakeback (Admin > Rakeback)** lets you configure rakeback periods so players receive a portion of their rake back.\n\n**How it works:**\n1. Open Admin > Rakeback\n2. View current rakeback status and any active periods\n3. Create a new rakeback period (set dates and percentage)\n4. Players accumulate rake. At period end, their rakeback % is paid out\n\n**Why use rakeback?** Incentivizes player loyalty. Regular players earn back a % of what they pay in rake, encouraging them to play more in your club.',
        followUps: ['How does rake work?', 'What is a settlement period?'],
    },

    {
        id: 'ca-admin-7', category: 'Club Arena — Admin',
        keywords: ['bbj config', 'club bbj', 'bad beat jackpot config', 'enable bbj', 'bbj club settings'],
        patterns: ['how do i enable the bad beat jackpot', 'how do i configure bbj for my club', 'what is bbj config', 'how do i disable bbj'],
        answer: '**BBJ Config (Admin > BBJ Config)** controls the Bad Beat Jackpot for your club.\n\n**To enable BBJ:**\n1. Open Admin > BBJ Config\n2. Toggle BBJ on\n3. Current pool amount, hands contributed, last hit, and last payout are displayed\n\n**BBJ feeds from** a small % of every hand\'s rake going to the BBJ wallet (configured at the union level).\n\n**BBJ triggers when** an extremely strong hand loses to an even stronger hand (e.g., Quad Aces beaten by Royal Flush). The pot is then paid out per the union\'s configured distribution percentages (Main/Backup/Promo wallets).',
        followUps: ['How does the union BBJ work?', 'What are the BBJ distribution percentages?'],
    },

    {
        id: 'ca-admin-8', category: 'Club Arena — Admin',
        keywords: ['club announcements', 'announcement admin', 'create announcement', 'club message'],
        patterns: ['how do i create a club announcement', 'where do i post announcements', 'how do club announcements work'],
        answer: '**Announcements (Admin > Announcements)** lets you post messages to all club members.\n\n**Creating an announcement:**\n1. Open Admin > Announcements\n2. Enter a **title** and **content**\n3. Post — it appears in the club\'s announcement feed immediately\n\nAnnouncements are visible to all club members in the lobby. Existing announcements can be deleted.',
        followUps: ['How do I send a union-wide announcement?', 'Where do players see announcements?'],
    },

    {
        id: 'ca-admin-9', category: 'Club Arena — Admin',
        keywords: ['shop management', 'club shop', 'marketplace items', 'add item shop', 'club items'],
        patterns: ['how do i manage the club shop', 'how do i add items to the marketplace', 'what is shop management admin'],
        answer: '**Shop Management (Admin > Shop Management)** controls your club\'s item marketplace.\n\n**Adding an item:**\n1. Open Admin > Shop Management\n2. Fill in: Item Name, Price (chips), Description, Category\n3. Save — it appears in the club marketplace immediately\n\n**Categories:** General, plus any custom categories you create.\n\nPlayers can browse and purchase items using their chip balance from the club marketplace.',
        followUps: ['Where do players see shop items?', 'What is the club marketplace?'],
    },

    {
        id: 'ca-admin-10', category: 'Club Arena — Admin',
        keywords: ['promo wallet admin', 'promo chips', 'promotional chips', 'promo wallet'],
        patterns: ['what is the promo wallet', 'how do i give promo chips', 'how do i use the promo wallet', 'promo chip distribution'],
        answer: '**Promo Wallet (Admin > Promo Wallet)** lets you mint and distribute promotional chips separately from regular chips.\n\n**Use case:** Run promotions without touching the main chip treasury. Promo chips are tracked separately and can be distributed directly to agents for player promotions.\n\n**Steps:**\n1. Mint promo chips into the promo wallet\n2. Select an agent to distribute to\n3. Confirm the amount\n\nPromo chips show separately in agent balances, making promotion accounting clear.',
        followUps: ['What is the difference between real chips and promo chips?', 'How do I distribute regular chips?'],
    },

    {
        id: 'ca-admin-11', category: 'Club Arena — Admin',
        keywords: ['club settlement admin', 'settlement admin', 'open period admin', 'close period admin'],
        patterns: ['how do i settle my club from the admin panel', 'how do i open or close a settlement period from admin'],
        answer: '**Settlement (Admin > Settlement)** manages your club\'s financial settlement periods.\n\n**Actions:**\n- **Status** — Check current period status, rake totals, and open periods\n- **Open** — Start a new period (begins rake tracking)\n- **Close** — Lock the current period\'s rake totals\n- **Pay All** — Pay out commissions for the most recent closed period\n\n**Settlement at the club level vs. union level:**\n- Club admins can manage their own club\'s periods\n- Union administrators can manage all clubs\' periods from the Union Dashboard > Settlement tab',
        followUps: ['What is a settlement period?', 'How does the union settlement work?'],
    },
];

/* ═══════════════════════════════════════════════════════════════════════
   Agent Dashboard — pages/hub/club-arena/agent-dashboard.js
   ═══════════════════════════════════════════════════════════════════════ */
export const AGENT_DASHBOARD_ENTRIES = [

    {
        id: 'ca-agent-1', category: 'Club Arena — Agent',
        keywords: ['agent dashboard', 'what is the agent dashboard', 'agent panel', 'agent management page'],
        patterns: ['what is the agent dashboard', 'how do i access the agent dashboard', 'what does the agent dashboard show', 'agent cashout management'],
        answer: '**Agent Dashboard** is where agents manage their players, cashouts, and commissions.\n\n**Access:** Club Admin > Agent Dashboard (available to owner, admin, agent, super_agent, sub_agent)\n\n**What agents can do:**\n- View all players under their management\n- See each player\'s chip balance and session activity\n- **Approve cashout requests** — players request chips out, agents confirm\n- **Add chips** to a specific player\'s account\n- **Remove chips** from a player (settle up outside the platform)\n- Track outstanding **credit** extended to players\n- View player **hand history** summaries\n\n**Commission tracking:**\n- Agents earn a commission % on the rake generated by their players\n- Commission history is visible from this dashboard\n\n**Real-time:** Player balances and cashout requests update live via Supabase.',
        followUps: ['How do agent cashouts work?', 'What is agent credit?', 'How are agent commissions calculated?'],
    },

    {
        id: 'ca-agent-2', category: 'Club Arena — Agent',
        keywords: ['cashout request', 'cashout', 'player cashout', 'approve cashout', 'chip cashout'],
        patterns: ['how do cashouts work', 'how do i approve a cashout', 'how does a player cash out', 'what is a cashout request'],
        answer: '**Cashouts** are the process by which players convert club chips back to real value.\n\n**Player flow:**\n1. Player goes to their lobby or balance screen and requests a cashout\n2. A cashout request is created and sent to their assigned agent\n3. The agent reviews the request in their **Agent Dashboard**\n4. Agent approves — chips are deducted from the player\'s balance\n5. Payment is made off-platform (e.g., Venmo, crypto, cash at a game)\n\n**Agent flow in the dashboard:**\n- See pending cashout requests in real-time\n- Approve or deny each request\n- Add notes for record-keeping\n\n**Tip:** The platform tracks all approved cashouts for record-keeping, but actual payment is handled between agent and player.',
        followUps: ['What is agent credit?', 'How do I add chips to a player?'],
    },
];

/* ═══════════════════════════════════════════════════════════════════════
   Club Arena — Other Pages
   ═══════════════════════════════════════════════════════════════════════ */
export const CLUB_ARENA_PAGES_ENTRIES = [

    {
        id: 'ca-lobby-1', category: 'Club Arena',
        keywords: ['club lobby', 'club arena lobby', 'poker lobby', 'table lobby', 'join table'],
        patterns: ['what is the club lobby', 'how do i join a table', 'what do i see in the lobby', 'how do i find a game to play'],
        answer: '**Club Lobby** is the player-facing hub for a Club Arena club.\n\n**What you see:**\n- All open cash game tables + their stakes, player counts, and status\n- Scheduled and running tournaments\n- Club announcements\n- Your chip balance\n\n**Joining a game:**\n1. Open the Club Lobby\n2. Tap a table to see stakes and players\n3. Tap **Join** — you\'re seated (or waitlisted if full)\n\n**Navigation (bottom nav):** Lobby | Tournaments | Hand History | Marketplace | Admin (if applicable)',
        followUps: ['How do I see my hand history?', 'How do I find my chip balance?', 'How do I join the waitlist?'],
    },

    {
        id: 'ca-hh-1', category: 'Club Arena',
        keywords: ['hand history club arena', 'hand histories', 'club hand history', 'review hands', 'hand replay club'],
        patterns: ['how do i see my hand history in club arena', 'where is my hand history', 'how do i review hands I played'],
        answer: '**Hand Histories (Club Arena)** shows every hand you\'ve played in Club Arena.\n\n**Access:** Club Lobby > Hand History tab\n\n**Features:**\n- Filter by club, date, game type\n- See final board, all player actions, pot size, and outcome\n- Review your own decision points hand by hand\n- Export hand histories for deeper analysis in Training\n\nHand histories are stored in Supabase and are accessible to both players and admins.',
        followUps: ['How do I upload hand histories to training?', 'Can I filter hand history by profit?'],
    },

    {
        id: 'ca-marketplace-1', category: 'Club Arena',
        keywords: ['club marketplace', 'club shop', 'buy items club', 'marketplace club arena'],
        patterns: ['what is the club marketplace', 'where do I buy items', 'how does the club shop work'],
        answer: '**Club Marketplace** is the in-club shop where players spend chips on items.\n\n**Access:** Club Arena Lobby > Marketplace\n\n**How it works:**\n1. Browse items listed by the club admin\n2. Each item has a chip price and description\n3. Tap the item to purchase — chips deducted instantly\n\nItems are configured by admins via Admin > Shop Management. Common uses: tournament add-ons, club swag, bonus features.',
        followUps: ['How does an admin add shop items?', 'Where do my chip purchases go?'],
    },

    {
        id: 'ca-players-1', category: 'Club Arena',
        keywords: ['club players list', 'member list club', 'player list', 'see all members club'],
        patterns: ['how do i see all players in my club', 'how do i view the member list', 'where is the player list'],
        answer: '**Club Players Page** shows the full member directory for a club.\n\n**Access:** Club Arena > Club > Players tab\n\n**What you see:**\n- Player display name and avatar\n- Their role (owner/admin/agent/player)\n- Their chip balance\n- Last active date\n\n**Search:** Filter by name to find specific players quickly.',
        followUps: ['How do I change a player\'s role?', 'How do I assign a player to an agent?'],
    },

    {
        id: 'ca-leaderboard-1', category: 'Club Arena',
        keywords: ['club leaderboard', 'club arena leaderboard', 'top players club', 'club rankings'],
        patterns: ['where is the club leaderboard', 'how do I see top players in my club', 'club arena leaderboard'],
        answer: '**Club Leaderboard** ranks players within a club by their performance.\n\n**Access:** Club Arena > Club > Leaderboard tab\n\n**Ranked by:** Hands won, chips won, or custom scoring (configured by admin)\n\n**Filters:** All-time / This week / This month\n\nUse leaderboards to identify your best players and run competitions.',
        followUps: ['How do I run a club tournament?', 'How do I see player stats?'],
    },

    {
        id: 'ca-player-stats-1', category: 'Club Arena',
        keywords: ['player stats club arena', 'club stats', 'my stats club', 'performance stats club'],
        patterns: ['how do i see my stats in club arena', 'where are player stats', 'what stats does club arena track'],
        answer: '**Player Stats (Club Arena)** tracks your performance at club games.\n\n**Access:** Club Arena > Player Stats\n\n**Tracked metrics:**\n- Hands played, hands won, win rate\n- Total chips won / lost\n- Rake paid\n- VPIP (voluntarily put chips in pot)\n- PFR (pre-flop raise frequency)\n- Average pot size won\n\n**Admin perspective:** Admins can view any player\'s stats from the Admin Panel.',
        followUps: ['What is VPIP?', 'How do I find my leaks?'],
    },

    {
        id: 'ca-messages-1', category: 'Club Arena',
        keywords: ['club messages', 'club chat', 'club inbox', 'message club members'],
        patterns: ['how do I message in club arena', 'where is the club inbox', 'can I message other club members'],
        answer: '**Club Messages** is the internal messaging system for Club Arena.\n\n**Access:** Club Arena > Messages tab\n\nSend and receive messages with other club members within the platform. Messages are separate from the platform-wide Messenger and are specific to each club.',
        followUps: ['Where is the main platform messenger?', 'How do I contact my agent?'],
    },

    {
        id: 'ca-cashier-1', category: 'Club Arena',
        keywords: ['club cashier', 'cashier club arena', 'chip balance', 'buy chips', 'club cashier page'],
        patterns: ['what is the club cashier', 'how do I check my chip balance', 'how do I buy chips for a club'],
        answer: '**Club Cashier** is where players manage their chip balance in a specific club.\n\n**Access:** Club Arena > Club > Cashier\n\n**Features:**\n- View your current chip balance in this club\n- Request chips from your agent (sends a request for the agent to distribute)\n- Submit cashout requests\n- View transaction history (chips received, chips played, rake paid)\n\nNote: Each club has its own separate chip balance — chips don\'t transfer between clubs unless a union admin moves them.',
        followUps: ['How do cashout requests work?', 'How do I request chips from my agent?'],
    },
];
