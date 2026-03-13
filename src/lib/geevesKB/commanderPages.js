/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES KB — Commander Sub-Pages (Full Coverage)
   Source-verified against pages/hub/commander/ directory scan.
   Covers: Check-In, Hand History, Leagues, Notifications, Profile, 
   Responsible Gaming, Rewards, Services, Squads, Tournament pages, 
   Venue pages, Waitlist, Home Games, Rate Table, Player Card, FAQ
   ═══════════════════════════════════════════════════════════════════════════ */

export const COMMANDER_PAGES_ENTRIES = [

    // ── Check-In ──
    {
        id: 'cmd-pg-1', category: 'Club Commander',
        keywords: ['check in', 'player check in', 'check-in kiosk', 'player arrival', 'seat assignment'],
        patterns: ['how does check in work', 'how do i check players in', 'what is the check in system', 'player check in commander'],
        answer: '**Player Check-In** is the Commander system for registering player arrivals at a live venue.\n\n**Access:** Commander > Venue > Check-In (or the Check-In Kiosk QR code)\n\n**How it works for staff:**\n1. Open the Check-In page for a venue\n2. Search for a player by name or player ID\n3. Tap Check In — the player moves from waitlist to seated status\n4. Their information (stack, table, seat) is logged instantly\n\n**How it works for players:**\n- If your venue has a kiosk, players scan the QR code and self-check-in\n- Players see their position in the waitlist and estimated wait time\n\n**Real-time:** Seating status updates instantly across all Commander screens.',
        followUps: ['How does the waitlist work?', 'How do I set up the kiosk?', 'What is the player card?'],
    },

    // ── Hand History Commander ──
    {
        id: 'cmd-pg-2', category: 'Club Commander',
        keywords: ['hand history commander', 'commander hand history', 'hand record', 'log hands commander'],
        patterns: ['where is hand history in commander', 'how do i view hand history in commander', 'commander hand history page'],
        answer: '**Commander Hand History** records all hands played at your venue.\n\n**Access:** Commander > Hand History\n\n**Features:**\n- Browse hands by date, table, or dealer\n- See final board, action summary, pot size, and winner\n- Linked to player accounts when logged in\n- Used for dispute resolution and record-keeping\n\n**Individual hand view:** Click any hand to see the full action breakdown. Useful for resolving floor calls or reviewing high-hand qualifications.',
        followUps: ['How do floor calls work?', 'What is the high hand promotion?'],
    },

    // ── Leagues ──
    {
        id: 'cmd-pg-3', category: 'Club Commander',
        keywords: ['leagues', 'poker league', 'league points', 'league standings', 'commander league'],
        patterns: ['what are leagues in commander', 'how do leagues work', 'how do I create a league', 'what are league points'],
        answer: '**Leagues** let you run ongoing poker competitions with cumulative points across multiple sessions.\n\n**Access:** Commander > Leagues\n\n**How leagues work:**\n1. Create a league with a start/end date and scoring system\n2. Players earn points each session based on finish position, hands played, or buy-ins\n3. Standings update after each session\n4. At season end, top players win prizes/recognition\n\n**Scoring options:** Points per finish position, points per tournament cashed, custom formula\n\n**Multi-venue:** A league can span multiple venues if they\'re all under the same Commander account.',
        followUps: ['How do I create a league?', 'How are league points calculated?', 'Can leagues span multiple venues?'],
    },

    // ── Notifications ──
    {
        id: 'cmd-pg-4', category: 'Club Commander',
        keywords: ['commander notifications', 'venue notifications', 'tournament alerts', 'notify players'],
        patterns: ['how do notifications work in commander', 'how do i notify players', 'what notifications does commander send'],
        answer: '**Commander Notifications** sends automated alerts to players and staff.\n\n**Notification types:**\n- **Tournament starting** — Alert registered players 30 min and 5 min before start\n- **Waitlist status** — Notify players when their seat becomes available\n- **Floor calls** — Send table/seat alerts to staff\n- **Blind level changes** — Announce new blind levels during tournaments\n- **High hand results** — Notify winner and table\n\n**Access:** Commander > Notifications > Settings\n\nNotifications are sent via the Smarter.Poker app (push notifications) and optionally via SMS.',
        followUps: ['How do I set up push notifications?', 'How do waitlist notifications work?'],
    },

    // ── Commander Profile ──
    {
        id: 'cmd-pg-5', category: 'Club Commander',
        keywords: ['commander profile', 'player profile commander', 'edit profile commander', 'commander profile settings'],
        patterns: ['how do i edit my commander profile', 'what is the commander profile page', 'commander profile features'],
        answer: '**Commander Profile** is your player identity within the Club Commander ecosystem.\n\n**Access:** Commander > Profile\n\n**Sub-pages:**\n- **Profile** — Display name, bio, avatar, hometown\n- **Edit** — Update username, bio, photo\n- **Achievements** — Your earned badges from Commander tournaments and sessions\n- **Settings** — Notification preferences, privacy settings, connected accounts\n\n**Why it matters:** Your Commander profile is linked to your player stats, league history, and tournament results at every venue using Commander.',
        followUps: ['Where are my tournament results?', 'How do I earn achievements?'],
    },

    // ── Responsible Gaming ──
    {
        id: 'cmd-pg-6', category: 'Club Commander',
        keywords: ['responsible gaming', 'responsible gambling', 'gaming limits', 'self exclusion commander', 'spending limits'],
        patterns: ['what is responsible gaming', 'how do I set gaming limits', 'how do I self-exclude', 'responsible gambling commander'],
        answer: '**Responsible Gaming** provides tools to help players maintain healthy gaming habits.\n\n**Access:** Commander > Responsible Gaming\n\n**Available tools:**\n- **Session time limits** — Set a maximum session length (app will remind you when time is up)\n- **Buy-in limits** — Cap how much you can spend in a session or week\n- **Self-exclusion** — Temporarily or permanently block yourself from a venue\'s player database\n- **Cooling-off periods** — Take a break for a set number of days\n- **Reality checks** — Enable timed pop-up reminders during long sessions\n\n**Important:** These tools are here to support you. Smarter.Poker is committed to promoting responsible, enjoyable gaming for everyone.',
        followUps: ['How do I set a session time limit?', 'How do I take a break from gaming?'],
    },

    // ── Rewards ──
    {
        id: 'cmd-pg-7', category: 'Club Commander',
        keywords: ['commander rewards', 'venue rewards', 'poker rewards', 'loyalty program', 'player rewards commander'],
        patterns: ['what are commander rewards', 'how do I earn rewards at a venue', 'how does the rewards program work'],
        answer: '**Commander Rewards** is the venue-level loyalty program.\n\n**Access:** Commander > Rewards\n\n**How it works:**\n- Earn reward points for every session at participating venues\n- Points accumulate based on hours played, buy-ins, or hands dealt\n- Redeem points for merchandise, tournament entries, free meals, or cashback\n- Each venue configures its own reward rates and redemption options\n\n**Track your rewards:** The Rewards page shows your current point balance, reward history, and available redemptions.',
        followUps: ['How do I redeem rewards?', 'Do points expire?'],
    },

    // ── Services ──
    {
        id: 'cmd-pg-8', category: 'Club Commander',
        keywords: ['commander services', 'venue services', 'order services', 'food drink order poker'],
        patterns: ['what are commander services', 'how do I order food at a venue', 'what services can I request through commander'],
        answer: '**Commander Services** lets players request venue services directly through the app.\n\n**Access:** Commander > Services\n\n**Available services (configured per venue):**\n- **Food & beverage orders** — Order from your seat without flagging down staff\n- **Chip runner request** — Request chips be brought to your table\n- **Floor call** — Alert a floor person for a ruling\n- **Table service requests** — Custom services the venue has configured\n\nStaff see incoming requests on their device and fulfill them from the Commander dashboard.',
        followUps: ['How do floor calls work?', 'How do I request a chip runner?'],
    },

    // ── Squads ──
    {
        id: 'cmd-pg-9', category: 'Club Commander',
        keywords: ['squads', 'poker squad', 'team poker', 'group poker', 'squad commander'],
        patterns: ['what are squads in commander', 'how do squads work', 'how do I create a squad', 'what is a poker squad'],
        answer: '**Squads** let players form groups and compete together across venues.\n\n**Access:** Commander > Squads\n\n**How squads work:**\n- Create a squad with a name and invite friends via a join code\n- Squad members\' individual results aggregate to a team score\n- Compete in venue-level squad leaderboards\n- Some venues run squad-specific promotions and prizes\n\n**Creating a squad:**\n1. Commander > Squads > Create Squad\n2. Give your squad a name\n3. Share the join code with friends\n4. They join via Commander > Squads > Join > [enter code]',
        followUps: ['How do league and squad rankings interact?', 'What squad promotions are available?'],
    },

    // ── Tournament Clock / Status ──
    {
        id: 'cmd-pg-10', category: 'Club Commander',
        keywords: ['tournament clock', 'clock page', 'blind clock', 'blind timer', 'my tournament status'],
        patterns: ['how does the tournament clock work', 'where is the blind clock', 'how do I see my tournament status', 'clock display commander'],
        answer: '**Tournament Clock (Commander)** displays the current blind level, time remaining, and tournament stats.\n\n**Access:** Commander > Tournament > [ID] > Clock\n\n**Clock shows:**\n- Current blind level (small blind / big blind / ante)\n- Countdown timer to next level\n- Players remaining / total entries\n- Total prize pool\n- Average chip stack\n- Current level number and next level preview\n\n**Display options:**\n- Full-screen mode for venue TV display\n- Staff compact view for tablet\n- Player view shows your personal tournament status\n\n**My Status page:** Shows your current stack, position, and status in a running tournament.',
        followUps: ['How do I set up blind levels?', 'How do I display the clock on a TV?'],
    },

    // ── Venue Pages ──
    {
        id: 'cmd-pg-11', category: 'Club Commander',
        keywords: ['venue page', 'my venues', 'venue profile', 'venue settings commander', 'venue management'],
        patterns: ['how do I manage my venue in commander', 'what is the venue page', 'how do I set up my venue'],
        answer: '**Venue Pages** in Commander are the configuration hub for each physical poker room.\n\n**Access:** Commander > Venues > [Venue Name]\n\n**What you configure:**\n- Venue name, address, contact info, and description\n- Operating hours and game types offered\n- Kiosk QR code setup\n- Tables: how many, their names, seat counts\n- Reward program rates\n- Promotional schedules (high hands, bad beat jackpots)\n- Staff members linked to this venue\n\n**My Venues:** The index page at Commander > Venues shows all venues linked to your account.',
        followUps: ['How do I add a table?', 'How do I set up the kiosk?', 'How do I configure promotions?'],
    },

    // ── Home Games ──
    {
        id: 'cmd-pg-12', category: 'Club Commander',
        keywords: ['home games', 'home game', 'home poker', 'home game management', 'private game commander'],
        patterns: ['what are home games in commander', 'how do I run a home game', 'home game commander features'],
        answer: '**Home Games** in Commander lets you organize private, invitation-only poker games.\n\n**Access:** Commander > Home Games\n\n**Features:**\n- Create a home game with custom buy-ins, blind levels, and rules\n- Invite players via link or code\n- Track chip counts and results during the game\n- Generate a results summary at the end\n- View past home game history\n\n**Great for:** Regular home game groups who want structured tracking without running a full venue.',
        followUps: ['How does home game buy-in tracking work?', 'Can I use the tournament clock for home games?'],
    },

    // ── Rate Table ──
    {
        id: 'cmd-pg-13', category: 'Club Commander',
        keywords: ['rate table', 'rate my venue', 'venue rating', 'rate a game'],
        patterns: ['what is the rate table page', 'how do I rate a venue in commander', 'what does rate table do'],
        answer: '**Rate Table** lets players rate the quality of a specific table or venue session after playing.\n\n**Access:** Commander > Rate Table (from within a session)\n\n**What players rate:**\n- Dealer quality\n- Table atmosphere\n- Game integrity / no slowrolling\n- Staff service\n- Overall experience (1-5 stars)\n\nRatings aggregate into venue scorecards visible to the Commander venue manager. High ratings build the venue\'s reputation on Poker Near Me.',
        followUps: ['How is venue reputation calculated?', 'Where do ratings show up?'],
    },

    // ── Waitlist ──
    {
        id: 'cmd-pg-14', category: 'Club Commander',
        keywords: ['commander waitlist', 'waitlist management', 'player waitlist', 'join waitlist', 'waitlist position'],
        patterns: ['how does the waitlist work in commander', 'how do I join a waitlist', 'how do I manage the waitlist', 'how do I see my waitlist position'],
        answer: '**Waitlist System** manages seat availability and queues across all active tables.\n\n**For players:**\n1. Go to Commander > Venue > Waitlist\n2. Join the waitlist for your preferred game type and stakes\n3. See your position and estimated wait time\n4. Get notified when a seat opens\n\n**For staff:**\n- See the full waitlist in real-time\n- Move players up/down the list\n- Seat a player from the waitlist with one tap\n- Mark players as "called" / "no-show"\n\n**Smart features:**\n- Tracks which game types a player is waitlisted for\n- Auto-removes players after missed calls (configurable timeout)',
        followUps: ['How do I get notified when my seat opens?', 'How do I edit waitlist player order?'],
    },

    // ── Player Card ──
    {
        id: 'cmd-pg-15', category: 'Club Commander',
        keywords: ['player card', 'digital player card', 'commander player id', 'player identification'],
        patterns: ['what is the player card', 'how does the digital player card work', 'what is my commander player id'],
        answer: '**Player Card** is your digital poker identity within Club Commander.\n\n**Access:** Commander > Player Card\n\n**What it shows:**\n- QR code for quick check-in at any Commander venue\n- Your player ID number\n- Total hands played, venues visited, tournament results\n- Reward points balance across all linked venues\n- Achievement badges\n\n**Staff view:** When staff scan your QR code, they see your name, player history at that venue, any VIP status, and responsible gaming flags (if you\'ve set any).\n\n**Sharing:** Show the QR code at check-in instead of giving your name. Faster and error-free.',
        followUps: ['How do I check in using my player card?', 'How do I link my player card to a venue?'],
    },

    // ── Commander FAQ ──
    {
        id: 'cmd-pg-16', category: 'Club Commander',
        keywords: ['commander faq', 'commander help', 'commander questions', 'faq commander'],
        patterns: ['where is the commander faq', 'how do I get help with commander', 'commander help page'],
        answer: '**Commander FAQ (Commander > FAQ)** is the built-in help center for Club Commander users.\n\n**Topics covered:**\n- Getting started as a venue manager\n- Setting up tournaments and cash games\n- Waitlist and check-in workflows\n- Reporting and analytics\n- Common troubleshooting steps\n\nFor anything not covered in the FAQ, I (Geeves) am available in every Commander page via the hamburger menu!',
        followUps: ['How do I contact Smarter.Poker support?', 'What are the main Commander features?'],
    },

    // ── Tournament Registration ──
    {
        id: 'cmd-pg-17', category: 'Club Commander',
        keywords: ['tournament registration', 'register tournament commander', 'tournament sign up', 'player registration tournament'],
        patterns: ['how do I register players for a commander tournament', 'how does tournament registration work', 'how does player sign up work for a tournament'],
        answer: '**Tournament Registration (Commander)** manages player sign-ups for your events.\n\n**Staff workflow:**\n1. Open Commander > Tournament > [ID] > Register\n2. Search for a player by name or ID\n3. Select buy-in amount (late reg, rebuy)\n4. Confirm registration — player is added to the field\n\n**Player self-registration:**\n- If enabled, players can register through the Commander app or Smarter.Poker platform\n- Waitlist-to-seat transitions happen automatically when registration opens\n\n**Tracking:**\n- Real-time entry count vs. max capacity\n- List of registered players\n- Re-entry tracking (how many times each player has re-entered)',
        followUps: ['How do I set up re-entries?', 'How does late registration work?', 'How do I run the tournament once everyone is registered?'],
    },
];
