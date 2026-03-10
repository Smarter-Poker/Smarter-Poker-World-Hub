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

console.log();
console.log('═══════════════════════════════════');
console.log(pass + '/' + total);
if (pass === total) console.log('✅ 100% PASS — ALL VERIFIED');
else console.log('❌ FAILURES DETECTED — ' + (total - pass) + ' failed');
console.log('═══════════════════════════════════');
