import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readRepoFile(relPath) {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

test('Phase 1.1: useTableConnection clears prior heartbeat interval, guards in-flight ticks, skips hidden tabs, and recovers on wake/online', () => {
    const src = readRepoFile('src/hooks/useTableConnection.js');
    assert.match(src, /heartbeatInFlightRef\s*=\s*useRef\(false\)/, 'must track heartbeatInFlightRef');
    assert.match(src, /const sendHeartbeatOnce\s*=\s*\(\)\s*=>/, 'must define single-flight sendHeartbeatOnce helper');
    assert.match(src, /if\s*\(heartbeatRef\.current\)\s*\{\s*clearInterval\(heartbeatRef\.current\);\s*heartbeatRef\.current\s*=\s*null;\s*\}/, 'must clear prior heartbeat interval before starting a new one on SUBSCRIBED');
    assert.match(src, /document\.visibilityState\s*===\s*'hidden'/, 'must skip periodic heartbeat ticks while tab is hidden');
    assert.match(src, /document\.addEventListener\('visibilitychange',\s*handleWakeOrOnline\)/, 'must register visibilitychange wake recovery');
    assert.match(src, /window\.addEventListener\('online',\s*handleWakeOrOnline\)/, 'must register online wake recovery');
});

test('Phase 1.2: RealtimeSync clears prior _heartbeatChecker and channel._heartbeatInterval on resubscribe and error states', () => {
    const src = readRepoFile('src/lib/poker-engine/RealtimeSync.js');
    assert.match(src, /if\s*\(this\._heartbeatChecker\)\s*\{\s*clearInterval\(this\._heartbeatChecker\);\s*\}/, 'initialize() must clear existing _heartbeatChecker before creating a new interval');
    assert.match(src, /if\s*\(channel\._heartbeatInterval\)\s*\{\s*clearInterval\(channel\._heartbeatInterval\);\s*channel\._heartbeatInterval\s*=\s*null;\s*\}/, 'createTableClient() must clear existing channel._heartbeatInterval before creating a new interval');
    assert.match(src, /status\s*===\s*'CHANNEL_ERROR'\s*\|\|\s*status\s*===\s*'TIMED_OUT'\s*\|\|\s*status\s*===\s*'CLOSED'/, 'createTableClient() must clear channel._heartbeatInterval on error/closed states');
});

test('Phase 1.3: LivePokerTable consolidates club_members balance subscriptions into a single per-table instance channel', () => {
    const src = readRepoFile('src/components/poker/LivePokerTable.jsx');
    assert.match(src, /live-table-balance:\$\{tableId\s*\|\|\s*'t'\}:\$\{tableState\.clubId\}:\$\{userId\}:\$\{instanceSuffix\}/, 'must use per-table instance suffix for club_members Realtime channel');
    assert.doesNotMatch(src, /supabase\.channel\(`chip_balance_\$\{userId\}`\)/, 'must not open a duplicate chip_balance_${userId} channel on club_members');
    assert.match(src, /eventBus\.emit\('WALLET_REFRESHED'/, 'consolidated channel must still emit WALLET_REFRESHED');
});

test('Phase 1.4: TableChatHUD isolates channel per instance and reads isOpenRef without tearing down channel on drawer toggle', () => {
    const src = readRepoFile('src/components/club-arena/TableChatHUD.js');
    assert.match(src, /const isOpenRef\s*=\s*useRef\(isOpen\)/, 'must maintain isOpenRef for unread badge tracking');
    assert.match(src, /table_chat:\$\{tableId\}:\$\{instanceId\}/, 'must include per-instance suffix on table_chat channel');
    assert.match(src, /\},\s*\[tableId\]\);/, 'subscription effect must depend only on [tableId], not isOpen');
});

test('Phase 2.1: PokerLobby & useMiniStatePoller protect shared lobby channel ownership, gate hidden-tab polls, and safely stringify table names', () => {
    const lobbySrc = readRepoFile('src/components/poker/PokerLobby.jsx');
    const miniSrc = readRepoFile('src/hooks/useMiniStatePoller.js');
    assert.match(lobbySrc, /supabase\.getChannels\(\)\.find\(c\s*=>\s*c\.topic\s*===\s*'realtime:lobby'\s*\|\|\s*c\.topic\s*===\s*'lobby'\)/, 'PokerLobby must inspect existing channels before creating/removing lobby channel');
    assert.match(lobbySrc, /if\s*\(channel\s*&&\s*supabase\s*&&\s*ownsChannel\)\s*supabase\.removeChannel\(channel\)/, 'PokerLobby must only remove lobby channel when ownsChannel is true');
    assert.match(lobbySrc, /String\(t\.tableName\s*\|\|\s*t\.name\s*\|\|\s*t\.tableId\s*\|\|\s*''\)\.toLowerCase\(\)/, 'PokerLobby search must safely coerce table identifier before toLowerCase()');
    assert.match(miniSrc, /supabase\.getChannels\(\)\.find\(\(ch\)\s*=>\s*ch\.topic\s*===\s*'realtime:lobby'\s*\|\|\s*ch\.topic\s*===\s*'lobby'\)/, 'useMiniStatePoller must inspect existing channels before creating/removing lobby channel');
    assert.match(miniSrc, /if\s*\(ownsChannel\)\s*supabase\.removeChannel\(channel\)/, 'useMiniStatePoller must only remove lobby channel when ownsChannel is true');
});

test('Phase 2.2: useWalletData, useTrainingRealtime, ActiveIdentityContext, and LiveGamesFeed isolate channels and skip hidden-tab polling with wake catch-up', () => {
    const walletSrc = readRepoFile('src/hooks/useWalletData.js');
    const trainingSrc = readRepoFile('src/hooks/useTrainingRealtime.js');
    const identitySrc = readRepoFile('src/contexts/ActiveIdentityContext.jsx');
    const lgfSrc = readRepoFile('src/components/poker-near-me/LiveGamesFeed.jsx');

    assert.match(walletSrc, /wallet-member:\$\{clubId\}:\$\{userId\}:\$\{instanceSuffix\}/, 'useWalletData must suffix wallet-member channel');
    assert.match(walletSrc, /wallet-agent:\$\{clubId\}:\$\{userId\}:\$\{instanceSuffix\}/, 'useWalletData must suffix wallet-agent channel');
    assert.match(walletSrc, /wallet-treasury:\$\{clubId\}:\$\{instanceSuffix\}/, 'useWalletData must suffix wallet-treasury channel');
    assert.match(walletSrc, /document\.visibilityState\s*===\s*'hidden'/, 'useWalletData must skip 30s BBJ poll when hidden');

    assert.match(trainingSrc, /document\.hidden/, 'useTrainingRealtime must skip hidden-tab polls');
    assert.match(identitySrc, /document\.visibilityState\s*===\s*'hidden'/, 'ActiveIdentityContext must skip 5-minute club refresh when hidden');
    assert.match(lgfSrc, /document\.visibilityState\s*===\s*'hidden'/, 'LiveGamesFeed must skip periodic live refresh when hidden');
});

test('Phase 3: Call signalling, MessengerDock, and useUnreadCount isolate per-instance channels and prevent own-listener teardown', () => {
    const callSignalSrc = readRepoFile('src/lib/calls/callSignal.js');
    const messengerSvcSrc = readRepoFile('src/hooks/useMessengerService.js');
    const dockSrc = readRepoFile('src/components/messenger/dock/MessengerDock.jsx');
    const unreadSrc = readRepoFile('src/hooks/useUnreadCount.jsx');

    assert.match(callSignalSrc, /if\s*\(toUserId\s*===\s*active\.userId\)\s*return\s*sendToOwnDevices\(event,\s*body\)/, 'callSignal must never borrow or remove own call-signal listener channel');
    assert.match(messengerSvcSrc, /call_signals:\$\{conversationId\}:\$\{signalChannelSuffix\}/, 'useMessengerService must use per-call suffix on call_signals channel');
    assert.match(dockSrc, /messenger-dock:\$\{actorId\}:\$\{Math\.random\(\)\.toString\(36\)\.slice\(2,\s*8\)\}/, 'MessengerDock must use per-instance channel suffix');
    assert.match(unreadSrc, /unread-notifications:\$\{userId\}:\$\{notifSuffix\}/, 'useUnreadCount must use per-instance channel suffix');
});

test('Phase 4: All 6 keyboard shortcut listeners guard typeof key === "string" and optional target.tagName', () => {
    const adminSrc = readRepoFile('src/hooks/useAdminShortcuts.js');
    const proSrc = readRepoFile('src/hooks/useProControls.tsx');
    const liveTableSrc = readRepoFile('src/components/poker/LivePokerTable.jsx');
    const gpcSrc = readRepoFile('src/components/training/GamePhaseController.tsx');
    const hudSrc = readRepoFile('src/components/poker-brain/HUD.jsx');
    const memSrc = readRepoFile('pages/hub/memory-games.js');

    assert.match(adminSrc, /typeof e\.key\s*===\s*'string'/, 'useAdminShortcuts must guard typeof e.key');
    assert.match(proSrc, /typeof event\.key\s*!==\s*'string'/, 'useProControls must guard typeof event.key');
    assert.match(proSrc, /target\?\.tagName\?\.toUpperCase\(\)/, 'useProControls must optional-chain target?.tagName');
    assert.match(liveTableSrc, /typeof e\.key\s*!==\s*'string'/, 'LivePokerTable must guard typeof e.key');
    assert.match(liveTableSrc, /e\.target\?\.tagName\?\.toUpperCase\(\)/, 'LivePokerTable must optional-chain e.target?.tagName');
    assert.match(gpcSrc, /typeof e\.key\s*===\s*'string'\s*&&\s*e\.key\.toLowerCase\(\)\s*===\s*'r'/, 'GamePhaseController must guard typeof e.key');
    assert.match(hudSrc, /typeof e\.key\s*!==\s*'string'/, 'PokerBrain HUD must guard typeof e.key');
    assert.match(hudSrc, /e\.target\?\.tagName\?\.toUpperCase\(\)/, 'PokerBrain HUD must optional-chain e.target?.tagName');
    assert.match(memSrc, /typeof e\.key\s*!==\s*'string'/, 'memory-games must guard typeof e.key');
});

test('Phase 5: Secondary Hub surfaces isolate channels, protect shared typing/social-feed broadcast channels, and gate ClubArenaPanel hidden-tab refreshes', () => {
    const socialSrc = readRepoFile('pages/hub/social-media/index.js');
    const messengerPageSrc = readRepoFile('pages/hub/messenger.js');
    const dockChatSrc = readRepoFile('src/components/messenger/dock/MessengerChat.jsx');
    const caPanelSrc = readRepoFile('src/components/horses/ClubArenaPanel.jsx');
    const bbjSrc = readRepoFile('src/components/club-arena/BBJDisplay.js');
    const diamondModalSrc = readRepoFile('src/components/store/DiamondWalletModal.jsx');
    const noticeBoardSrc = readRepoFile('src/components/messenger/NoticeBoard.jsx');

    assert.match(socialSrc, /_typingSendChannel\.state\s*===\s*'closed'/, 'getTypingChannel must recreate _typingSendChannel if closed');
    assert.match(socialSrc, /if\s*\(_typingSendChannel\s*===\s*typingChannel\)\s*\{\s*_typingSendChannel\s*=\s*null;\s*\}/, 'social-media cleanup must clear _typingSendChannel when removing shared channel');
    assert.match(socialSrc, /notifications:\$\{user\.id\}:\$\{Math\.random\(\)\.toString\(36\)\.slice\(2,\s*8\)\}/, 'social-media notifications channel must use per-instance suffix');
    assert.match(socialSrc, /social-media-realtime-\$\{user\.id\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2,\s*8\)\}/, 'social-media-realtime channel must use per-instance suffix');

    assert.match(messengerPageSrc, /conversation:\$\{activeConversation\.id\}:\$\{Math\.random\(\)\.toString\(36\)\.slice\(2,\s*8\)\}/, 'messenger.js conversation channel must use per-instance suffix');
    assert.match(messengerPageSrc, /if\s*\(ownsTypingChannel\)\s*supabase\.removeChannel\(typingChannel\)/, 'messenger.js must only remove typingChannel when ownsTypingChannel is true');

    assert.match(dockChatSrc, /dock-conversation:\$\{actorId\}:\$\{id\}:\$\{Math\.random\(\)\.toString\(36\)\.slice\(2,\s*8\)\}/, 'MessengerChat dock-conversation channel must use per-instance suffix');
    assert.match(dockChatSrc, /if\s*\(ownsTyping\)\s*services\.supabase\.removeChannel\(live\)/, 'MessengerChat must only remove typing channel when ownsTyping is true');

    assert.match(caPanelSrc, /document\.visibilityState\s*===\s*'hidden'/, 'ClubArenaPanel must skip table-change refreshes while tab is hidden');
    assert.match(bbjSrc, /bbj_winners_live:\$\{clubId\}:\$\{instanceSuffix\}/, 'BBJDisplay must isolate bbj_winners_live channel per club and instance');
    assert.match(diamondModalSrc, /diamond-wallet-\$\{user\.id\}-\$\{instanceSuffix\}/, 'DiamondWalletModal must isolate diamond-wallet channel per instance');
    assert.match(noticeBoardSrc, /club-notice-board:\$\{club\.id\}:\$\{userId\}:\$\{instanceSuffix\}/, 'NoticeBoard must isolate club-notice-board channel per instance');
});

test('Phase 6: PokerTablePage removes dead no-op tables WAL listener and MyTournaments fixes swrData stale closure with isolated channels', () => {
    const pokerTablePageSrc = readRepoFile('pages/hub/poker/table/[tableId].js');
    const myTournamentsSrc = readRepoFile('pages/hub/my-tournaments.js');

    assert.doesNotMatch(pokerTablePageSrc, /poker-table:\$\{tableId\}/, 'PokerTablePage must not open a redundant no-op poker-table WAL subscription');
    assert.match(myTournamentsSrc, /const swrDataRef\s*=\s*useRef\(swrData\)/, 'MyTournaments must maintain swrDataRef so tournament status updates do not read stale swrData');
    assert.match(myTournamentsSrc, /my-tournaments:\$\{authUser\.id\}:\$\{instanceSuffix\}/, 'MyTournaments must isolate my-tournaments registration channel per instance');
    assert.match(myTournamentsSrc, /my-tournaments-status:\$\{authUser\.id\}:\$\{instanceSuffix\}/, 'MyTournaments must isolate my-tournaments-status channel per instance');
});
