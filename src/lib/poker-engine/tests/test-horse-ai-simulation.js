const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const { getController } = require('../GameController');
const HorsePokerBrain = require('../HorsePokerBrain');

async function runSimulation() {
    console.log('--- HORSE AI GTO SIMULATION START ---');
    console.log(`Connecting to Supabase at: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);

    // 1. Initialize Engine
    const controller = await getController();
    await controller.initialize();

    // 2. Get Real Horses
    console.log('Loading horse IDs from DB...');
    const horseIdsSet = await HorsePokerBrain.loadHorseIds();
    const horseIds = Array.from(horseIdsSet).filter(id => id.length > 10);

    if (horseIds.length < 2) {
        throw new Error('Could not find enough horse IDs in DB. Found: ' + horseIds.length);
    }

    const h1 = horseIds[0];
    const h2 = horseIds[1];
    console.log(`Selected Horses: ${h1}, ${h2}`);

    // 3. Create Table
    const { success, tableId } = await controller.createTable({
        name: 'Horse AI Sim Table',
        clubId: '00000000-0000-0000-0000-000000000000', // Dummy UUID to pass not-null constraint
        variant: 'holdem',
        bettingStructure: 'no_limit',
        smallBlind: 1,
        bigBlind: 2,
        maxSeats: 6,
        minBuyIn: 100,
        maxBuyIn: 200,
    });

    if (!success) throw new Error('Failed to create table');
    console.log(`Table Created: ${tableId}`);

    // 4. Listeners
    const entry = controller.lobby.tables.get(tableId);
    const tableManager = entry.table;

    let handCount = 0;

    tableManager.on('hand_start', (d) => {
        handCount++;
        console.log(`\n\n♠️ ♥️ ♣️ ♦️ HAND ${handCount} STARTED ♠️ ♥️ ♣️ ♦️`);
    });

    tableManager.on('street_start', (d) => {
        console.log(`\n--- ${d.street.toUpperCase()} ---`);
        if (d.cards && d.cards.length > 0) {
            console.log(`Board: ${HorsePokerBrain.cardsToStrings(d.cards).join(' ')}`);
        }
    });

    tableManager.on('action_required', (d) => {
        console.log(`🎯 Action Required: Player ${d.playerId}`);

        // If it's a human, we auto-act immediately
        if (d.playerId === 'human1' || d.playerId === 'human2') {
            setTimeout(() => {
                const actions = controller.getPlayerActions(tableId, d.playerId);
                if (!actions || !actions.actions) return;

                // Human simple strat: always check or call
                const hasCheck = actions.actions.find(a => a.type === 'check');
                if (hasCheck) {
                    console.log(`[Human Sim] ${d.playerId} CHECKS`);
                    controller.processAction(tableId, d.playerId, { type: 'check' });
                } else {
                    const hasCall = actions.actions.find(a => a.type === 'call');
                    if (hasCall) {
                        console.log(`[Human Sim] ${d.playerId} CALLS ${hasCall.amount}`);
                        controller.processAction(tableId, d.playerId, { type: 'call' });
                    } else {
                        console.log(`[Human Sim] ${d.playerId} FOLDS`);
                        controller.processAction(tableId, d.playerId, { type: 'fold' });
                    }
                }
            }, 500);
        } else {
            console.log(`[Horse AI] AI taking over for ${d.playerId}... waiting for processing delay`);
            // The GameController handles horse actions automatically via `_triggerHorseAction`
            // which was wired when the table started.
            // Oh actually, GameController hooks into RealtimeSync. Wait, GameController listens to 'action_required'
            // Let's verify: GameController.js has `table.on('action_required', (data) => this._triggerHorseAction(...)`
        }
    });

    tableManager.on('action_processed', (d) => {
        const isHorse = horseIdsSet.has(d.playerId);
        const name = isHorse ? '🐎 HORSE' : '🧑‍. HUMAN';
        let str = `✅ [${name}] Player ${d.playerId} action: ${d.action.type.toUpperCase()}`;
        if (d.action.amount) str += ` $${d.action.amount}`;
        console.log(str);

        // Let's dump the hand of the horse if they acted to verify GTO decisions
        if (isHorse) {
            const state = tableManager.game.getState(d.playerId);
            const myPlayer = state.players.find(p => p.id === d.playerId);
            if (myPlayer.holeCards) {
                console.log(`    Cards: ${HorsePokerBrain.cardsToStrings(myPlayer.holeCards).join(' ')}`);
            }
        }
    });

    tableManager.on('hand_complete', (d) => {
        console.log(`\n🏆 HAND COMPLETE 🏆`);
        console.log(JSON.stringify(d.result, null, 2));
    });

    // 5. Join Players
    console.log('Sitting players...');
    tableManager.sitDown('human1', 0, 200, { displayName: 'Human 1' });
    tableManager.sitDown('human2', 1, 200, { displayName: 'Human 2' });
    tableManager.sitDown(h1, 2, 200, { displayName: 'Horse 1' });
    tableManager.sitDown(h2, 3, 200, { displayName: 'Horse 2' });

    // Hack: Wait for a few hands to play out. Table auto-starts hands based on GameController config.
    // If it doesn't auto start, we force it.
    setTimeout(() => {
        if (tableManager.game.phase === 'idle') {
            console.log('Forcing startNextHand()...');
            tableManager.startNextHand();
        }
    }, 2000);

    // Wait out 2 full minutes for hands to play out
    await new Promise(r => setTimeout(r, 60000));

    console.log('--- SIMULATION DONE ---');
    process.exit(0);
}

runSimulation().catch(err => {
    console.error(err);
    process.exit(1);
});
