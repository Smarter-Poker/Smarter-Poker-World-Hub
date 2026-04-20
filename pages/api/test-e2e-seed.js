// Force Webpack re-compile
import { getController } from '../../src/lib/poker-engine/GameController';
import { reportApiError } from '../../src/lib/sentryWrap';

export default async function handler(req, res) {
  try {
    const controller = await getController();
    
    // 1. Create table
    const result = await controller.createTable({
      name: "Deep Sweep Table",
      variant: 'holdem', 
      maxSeats: 6, 
      autoMuck: true,
      smallBlind: 1,
      bigBlind: 2
    });
    
    if (!result || !result.success) return res.status(500).json({ error: 'Failed to create table', details: result });
    const tableId = result.tableId;
    
    // 2. Sit players
    const p1 = 'user1'; const p2 = 'user2';
    const entry = controller.lobby.tables.get(tableId);
    if (!entry) return res.status(500).json({ error: 'Table not found after creation' });
    
    entry.table.sitDown(p1, 1, 1000, { id: p1, displayName: 'Alice' });
    entry.table.sitDown(p2, 2, 1000, { id: p2, displayName: 'Bob' });
    
    // 3. Start hand
    entry.table.startNextHand();
    
    res.status(200).json({ success: true, tableId, phase: entry.table.game?.phase });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
