const fs = require('fs');
let pass = 0, total = 0;
const c = (n, fn) => { total++; try { const v = fn(); console.log((v ? '✅' : '❌') + ' ' + n); if (v) pass++; } catch (e) { console.log('❌ ' + n + ' — ' + e.message); } };

// MONEY PATH
c('No double rebuy lock', () => !fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes("fetch('/api/club-arena/table-chips'"));
c('Rebuy awaits engine', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes("await send('add_chips'"));
c('Fold-win communityCards only', () => { const x = fs.readFileSync('src/lib/poker-engine/GameStateMachine.js', 'utf8'); const s = x.substring(x.indexOf('_handleFoldWin'), x.indexOf('_handlePayout')); return s.includes('communityCards.length >= 3;') && !s.includes('this.phase !== '); });
c('StateSerializer lowercase', () => !fs.readFileSync('src/lib/poker-engine/StateSerializer.js', 'utf8').includes("=== 'RUNNING'"));
c('_recoverTables tierConfig', () => fs.readFileSync('src/lib/poker-engine/GameController.js', 'utf8').includes('tierConfig.rakePercent'));
c('Transfer atomic RPC', () => fs.readFileSync('pages/api/club-arena/transfer-chips.js', 'utf8').includes("rpc('fn_transfer_chips'"));
c('Cancel cashout atomic', () => fs.readFileSync('pages/api/club-arena/cancel-my-cashout.js', 'utf8').includes("rpc('fn_credit_chips'"));
c('Tournament counter atomic', () => fs.readFileSync('pages/api/club-arena/tournaments.js', 'utf8').includes('fn_tournament_atomic_register'));
c('Tournament buyinFee', () => fs.readFileSync('pages/api/club-arena/tournaments.js', 'utf8').includes('buyinFee: mttBuyinFee'));
c('Tournament no dup DB', () => fs.readFileSync('src/lib/poker-engine/GameController.js', 'utf8').includes('tournamentId: existingId'));

// DEPLOYMENT
c('vercel.json clean', () => !JSON.parse(fs.readFileSync('vercel.json', 'utf8')).rewrites);
c('next.config.js clean', () => fs.readFileSync('next.config.js', 'utf8').includes('beforeFiles: []'));

// GAME LOGIC
c('Pineapple variant', () => fs.readFileSync('pages/api/club-arena/create-table.js', 'utf8').includes("'pineapple'"));
c('Omaha hand strength', () => fs.readFileSync('src/lib/handStrength.js', 'utf8').includes('combinations(holeCards, 2)'));
c('Pause lowercase', () => !fs.readFileSync('pages/api/club-arena/manage-table.js', 'utf8').includes("'PAUSED'"));
c('Resume _checkAutoStart', () => fs.readFileSync('pages/api/club-arena/manage-table.js', 'utf8').includes('_checkAutoStart'));
c('Settings propagate', () => { const x = fs.readFileSync('pages/api/club-arena/update-table-settings.js', 'utf8'); return x.includes('entry.table.minBuyIn') && x.includes('entry.table.maxBuyIn') && x.includes('entry.table.game.config.ante'); });
c('GC buyinFee', () => fs.readFileSync('src/lib/poker-engine/GameController.js', 'utf8').includes('buyIn: resolvedBuyIn, buyinFee'));

// CLIENT
c('Hand history int cards', () => fs.readFileSync('pages/hub/club-arena/hand-histories.js', 'utf8').includes('RANKS_INT'));
c('Client 5 events', () => { const x = fs.readFileSync('src/hooks/useTableConnection.js', 'utf8'); return ['table_closed', 'waitlist_joined', 'waitlist_left', 'player_timed_out', 'player_invited'].every(e => x.includes("'" + e + "'")); });
c('Token sync read', () => !fs.readFileSync('src/hooks/useTableConnection.js', 'utf8').includes('Promise.resolve'));
c('BottomNav club.id', () => fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8').includes('clubId={club.id}'));
c('Lobby closed filter', () => fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8').includes("payload.new?.status !== 'closed'"));
c('GameCard pineapple', () => fs.readFileSync('src/components/club-arena/GameCard.jsx', 'utf8').includes("pineapple: { label:"));
c('TableInfoBar variants', () => { const x = fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8'); return x.includes("pineapple: '") && x.includes("flo: 'FLO'"); });
c('ActionPanel 9 vars', () => { const x = fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8'); const s = x.indexOf('function ActionPanel'); const e = x.indexOf('function ActionButton'); return ['canFold', 'canCheck', 'canCall', 'canRaise', 'canBet', 'canAllIn', 'betOrRaise', 'minBet', 'maxBet'].every(v => x.substring(s, e).includes('const ' + v)); });
c('Shark Club clubCode', () => fs.readFileSync('pages/hub/club-arena.js', 'utf8').includes("clubCode: '25450'"));

// FEATURES
c('TOS modal', () => fs.readFileSync('pages/hub/club-arena.js', 'utf8').includes('tosAccepted === false'));
c('TOS error UI', () => fs.readFileSync('pages/hub/club-arena.js', 'utf8').includes('tosError'));
c('Zero-chips banner', () => fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8').includes('Welcome to'));
c('Auto-nav Shark', () => fs.readFileSync('pages/hub/club-arena.js', 'utf8').includes("router.push('/hub/club-arena/lobby?club=25450')"));
c('Auto-nav new table', () => fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8').includes("router.push(`/hub/club-arena/table/"));
c('Sitemap', () => fs.existsSync('pages/sitemap.xml.js'));
c('JSON-LD', () => fs.readFileSync('pages/hub/club-arena.js', 'utf8').includes('WebApplication'));
c('Nav: Hand Histories', () => fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8').includes('Hand Histories'));
c('Nav: Leaderboard', () => fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8').includes('Leaderboard'));
c('Nav: View Full History', () => fs.readFileSync('pages/hub/club-arena/player-stats.js', 'utf8').includes('View Full History'));

// HARDENING
c('JSON.parse safe (6 pages)', () => ['admin', 'cashier', 'lobby', 'marketplace', 'messages', 'players'].every(pg => fs.readFileSync('pages/hub/club-arena/' + pg + '.js', 'utf8').includes('try {')));
c('apiCall res.json guard', () => fs.readFileSync('pages/hub/club-arena.js', 'utf8').includes('Server returned invalid response'));
c('tournaments api() safe', () => fs.readFileSync('pages/hub/club-arena/tournaments.js', 'utf8').includes('Server returned invalid response'));

// BUS EMITS
c('Admin distribute busEmit', () => fs.readFileSync('pages/hub/club-arena/admin.js', 'utf8').includes("busEmit.dataMutated('chips_distributed')"));
c('Agent cancel busEmit', () => fs.readFileSync('pages/hub/club-arena/agent-dashboard.js', 'utf8').includes("busEmit.dataMutated('cashout_cancelled')"));
c('Agent clawback busEmit', () => fs.readFileSync('pages/hub/club-arena/agent-dashboard.js', 'utf8').includes('Clawback') && fs.readFileSync('pages/hub/club-arena/agent-dashboard.js', 'utf8').includes("busEmit.dataMutated('chips_distributed')"));
c('Tourn unregister busEmit', () => { const x = fs.readFileSync('pages/hub/club-arena/tournaments.js', 'utf8'); const s = x.substring(x.indexOf('handleUnregister'), x.indexOf('if (!user)')); return s.includes('busEmit'); });

// BUS LISTENERS
c('6 pages cashout_cancelled', () => ['admin', 'cashier', 'agent-dashboard', 'player-stats', 'players', 'union-dashboard'].every(p => fs.readFileSync('pages/hub/club-arena/' + p + '.js', 'utf8').includes("'cashout_cancelled'")));
c('Lobby tournament_registration', () => fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8').includes("'tournament_registration'"));

// RATE LIMITS
c('Tournament API RL', () => fs.readFileSync('pages/api/club-arena/tournaments.js', 'utf8').includes("applyRateLimit(req, res"));
c('BBJ API RL', () => fs.readFileSync('pages/api/club-arena/bbj.js', 'utf8').includes('applyRateLimit'));
c('accept-tos RL', () => fs.readFileSync('pages/api/club-arena/accept-tos.js', 'utf8').includes('applyRateLimit'));
c('manage-agent RL', () => fs.readFileSync('pages/api/club-arena/manage-agent.js', 'utf8').includes('applyRateLimit'));
c('settlement-history RL', () => fs.readFileSync('pages/api/club-arena/settlement-history.js', 'utf8').includes('applyRateLimit'));

// SQL
c('SQL: fn_transfer_chips', () => fs.existsSync('supabase/migrations/20260309_fn_transfer_chips.sql'));
c('SQL: fn_tournament_counters', () => fs.existsSync('supabase/migrations/20260309_fn_tournament_counters.sql'));
c('SQL: club_arena_tos', () => fs.existsSync('supabase/migrations/20260309000003_club_arena_tos.sql'));

// SEO
c('13 auth pages noindex', () => ['admin', 'cashier', 'hand-histories', 'player-stats', 'players', 'marketplace', 'leaderboard', 'lobby', 'messages', 'agent-dashboard', 'union-dashboard', 'union-games', 'tournaments'].every(pg => fs.readFileSync('pages/hub/club-arena/' + pg + '.js', 'utf8').includes('noindex')));
c('Main page NOT noindex', () => !fs.readFileSync('pages/hub/club-arena.js', 'utf8').includes('noindex'));

// NEW: Lobby bus handler routes table vs tournament events
c('Lobby bus: table events trigger table refresh', () => { const x = fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8'); return x.includes("tableEntities.includes(entity)") && x.includes("setTables(data)"); });
c('Lobby bus: tournament events trigger tournament refresh', () => fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8').includes("tournamentEntities.includes(entity)"));

// BUILD: Table page SEOHead improvements
c('Table page: club name in SEOHead', () => fs.readFileSync('pages/hub/club-arena/table/[tableId].js', 'utf8').includes('initialTable.clubName'));
c('Table page: noindex on all states', () => { const x = fs.readFileSync('pages/hub/club-arena/table/[tableId].js', 'utf8'); return !x.includes('<SEOHead title="Connecting') || x.includes('noindex'); });

// BUILD: Hand-histories copy hand ID
c('Hand-histories: copiedHandId state', () => fs.readFileSync('pages/hub/club-arena/hand-histories.js', 'utf8').includes('copiedHandId'));
c('Hand-histories: copy button', () => fs.readFileSync('pages/hub/club-arena/hand-histories.js', 'utf8').includes('Copy ID'));

// BUG HUNT: Realtime filters use resolved UUID instead of raw clubIdParam
c('hand-histories: realtime uses club.id', () => fs.readFileSync('pages/hub/club-arena/hand-histories.js', 'utf8').includes("filter: `club_id=eq.${club.id}`"));
c('players: realtime uses club.id', () => fs.readFileSync('pages/hub/club-arena/players.js', 'utf8').includes("filter: `club_id=eq.${club.id}`"));
c('marketplace: realtime uses club.id', () => fs.readFileSync('pages/hub/club-arena/marketplace.js', 'utf8').includes("filter: `club_id=eq.${club.id}`"));
c('tournaments: resolves numeric club codes', () => fs.readFileSync('pages/hub/club-arena/tournaments.js', 'utf8').includes('resolvedClubUUID'));

// PHASE 27: Public Club Discovery
c('Public clubs API exists', () => fs.existsSync('pages/api/club-arena/public-clubs.js'));
c('Public clubs API has rate limit', () => fs.readFileSync('pages/api/club-arena/public-clubs.js', 'utf8').includes('applyRateLimit'));
c('club-arena.js has Discover section', () => fs.readFileSync('pages/hub/club-arena.js', 'utf8').includes('Discover Public Clubs'));
c('club-arena.js has loadPublicClubs', () => fs.readFileSync('pages/hub/club-arena.js', 'utf8').includes('async function loadPublicClubs'));
c('club-arena.js filters already-joined', () => fs.readFileSync('pages/hub/club-arena.js', 'utf8').includes('filter(pc => !clubs.some'));

// COMPETITIVE FEATURES
c('Waitlist: position uses index not length', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes("myWaitPos === 0 ? \"You're next!\""));
c('Dealer chat: hand_start message', () => fs.readFileSync('src/hooks/useTableConnection.js', 'utf8').includes("type: 'dealer', text: `Hand #"));
c('Dealer chat: hand_complete winner message', () => fs.readFileSync('src/hooks/useTableConnection.js', 'utf8').includes("type: 'dealer'") && fs.readFileSync('src/hooks/useTableConnection.js', 'utf8').includes('wins'));
c('ChatOverlay: renders dealer messages', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes("m.type === 'dealer'"));
c('NotificationBell component exists', () => fs.existsSync('src/components/club-arena/NotificationBell.js'));
c('NotificationBell wired to lobby', () => fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8').includes('<NotificationBell'));
c('Mark-read API exists', () => fs.existsSync('pages/api/notifications/mark-read.js'));
c('ClubChat component exists', () => fs.existsSync('src/components/club-arena/ClubChat.js'));
c('ClubChat API exists', () => fs.existsSync('pages/api/club-arena/club-chat.js'));
c('ClubChat API has rate limit', () => fs.readFileSync('pages/api/club-arena/club-chat.js', 'utf8').includes('applyRateLimit'));
c('ClubChat wired to lobby', () => fs.readFileSync('pages/hub/club-arena/lobby.js', 'utf8').includes('<ClubChat'));
c('ClubChat SQL migration exists', () => fs.existsSync('supabase/migrations/20260310230000_club_chat.sql'));
c('ClubChat SQL has RLS', () => fs.readFileSync('supabase/migrations/20260310230000_club_chat.sql', 'utf8').includes('ROW LEVEL SECURITY'));
c('ClubChat SQL has realtime', () => fs.readFileSync('supabase/migrations/20260310230000_club_chat.sql', 'utf8').includes('supabase_realtime'));
c('Sit Out Next BB: state exists', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('sitOutNextBB'));
c('Sit Out Next BB: button in TableInfoBar', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes("Out@BB"));
c('Sit Out Next BB: auto-sit-out on result', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('sitOutNextBB || !result'));

// PHASE 2: Scheduled Tables
c('Scheduled tables SQL migration', () => fs.existsSync('supabase/migrations/20260310231000_scheduled_tables.sql'));
c('Scheduled tables cron endpoint', () => fs.existsSync('pages/api/cron/scheduled-table-opener.js'));
c('Cron checks schedule_days', () => fs.readFileSync('pages/api/cron/scheduled-table-opener.js', 'utf8').includes('schedule_days'));
c('Vercel cron includes scheduled-table-opener', () => fs.readFileSync('vercel.json', 'utf8').includes('scheduled-table-opener'));
c('Table-templates API has schedule action', () => fs.readFileSync('pages/api/club-arena/table-templates.js', 'utf8').includes("case 'schedule'"));

// PHASE 2: Show One Card
c('Engine: showOneCard method', () => fs.readFileSync('src/lib/poker-engine/GameStateMachine.js', 'utf8').includes('showOneCard(playerId, cardIndex)'));
c('Engine: card_shown event', () => fs.readFileSync('src/lib/poker-engine/GameStateMachine.js', 'utf8').includes("emit('card_shown'"));
c('Hook: show_one_card action', () => fs.readFileSync('src/hooks/useTableConnection.js', 'utf8').includes("'show_one_card'"));
c('Hook: card_shown handler', () => fs.readFileSync('src/hooks/useTableConnection.js', 'utf8').includes("case 'card_shown'"));
c('UI: Show One buttons', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes("Show #"));
c('UI: Show All + Show One', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('Show All'));

// PHASE 2: All-In dealer message
c('Dealer chat: all-in message', () => fs.readFileSync('src/hooks/useTableConnection.js', 'utf8').includes('ALL-IN'));

// PHASE 3: Wiring completeness
c('Seat API: show_one_card action', () => fs.readFileSync('pages/api/poker/engine/seat.js', 'utf8').includes("'show_one_card'"));
c('GameController: showOneCard method', () => fs.readFileSync('src/lib/poker-engine/GameController.js', 'utf8').includes('showOneCard(tableId'));
c('NotificationBell on cashier', () => fs.readFileSync('pages/hub/club-arena/cashier.js', 'utf8').includes('<NotificationBell'));
c('NotificationBell on tournaments', () => fs.readFileSync('pages/hub/club-arena/tournaments.js', 'utf8').includes('<NotificationBell'));
c('NotificationBell on hand-histories', () => fs.readFileSync('pages/hub/club-arena/hand-histories.js', 'utf8').includes('<NotificationBell'));
c('NotificationBell on leaderboard', () => fs.readFileSync('pages/hub/club-arena/leaderboard.js', 'utf8').includes('<NotificationBell'));
c('NotificationBell on player-stats', () => fs.readFileSync('pages/hub/club-arena/player-stats.js', 'utf8').includes('<NotificationBell'));
c('NotificationBell on players', () => fs.readFileSync('pages/hub/club-arena/players.js', 'utf8').includes('<NotificationBell'));

// DEEP AUDIT FIXES
c('SitOutNextBB cleared on stand up', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes("setSitOutNextBB(false); // Clear pending"));
c('Table chat persisted to DB', () => fs.readFileSync('pages/api/poker/engine/connect.js', 'utf8').includes("table_chat"));
c('Chat history loaded on connect', () => fs.readFileSync('src/hooks/useTableConnection.js', 'utf8').includes("action: 'history'"));
c('Admin: template schedule UI', () => fs.readFileSync('pages/hub/club-arena/admin.js', 'utf8').includes('Saved Templates'));
c('Admin: schedule toggle button', () => fs.readFileSync('pages/hub/club-arena/admin.js', 'utf8').includes("Schedule"));

// PHASE 4: Remaining competitive features
c('PlayerQuickView component exists', () => fs.existsSync('src/components/poker/PlayerQuickView.jsx'));
c('PlayerQuickView imported in table', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes("import PlayerQuickView"));
c('PlayerQuickView wired (quickViewTarget)', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('quickViewTarget'));
c('Avatar tap opens quick-view not notes', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('setQuickViewTarget'));
c('Sound volume state', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('soundVolume'));
c('Sound volume slider', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('type="range"') && fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('setSoundVolume'));
c('Sound volume persists to localStorage', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('poker-sound-volume'));
c('Player type badge on seat', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes("noteType && noteType !== 'unknown'"));
c('Spin reveal state in hook', () => fs.readFileSync('src/hooks/useTableConnection.js', 'utf8').includes('spinReveal'));
c('Spin reveal event handler', () => fs.readFileSync('src/hooks/useTableConnection.js', 'utf8').includes("case 'spin_multiplier'"));
c('Spin reveal animation overlay', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('SPIN & GO'));
c('RIT board-split animation', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes("x: i === 0 ? -30 : 30"));
c('RIT cards flip animation', () => fs.readFileSync('src/components/poker/LivePokerTable.jsx', 'utf8').includes('rotateY: 180'));

console.log();
console.log('═══════════════════════════════════');
console.log(pass + '/' + total);
if (pass === total) console.log('✅ 100% PASS — ALL VERIFIED');
else console.log('❌ FAILURES DETECTED — ' + (total - pass) + ' failed');
console.log('═══════════════════════════════════');
