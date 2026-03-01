/**
 * GET  /api/poker/engine/tables          → List all active tables
 * GET  /api/poker/engine/tables?id=X     → Get specific table info
 * POST /api/poker/engine/tables          → Create a new table
 * DELETE /api/poker/engine/tables?id=X   → Close a table
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';
const { applyRateLimit } = require('../../../../src/lib/poker-engine/RateLimiter');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limit
  if (!applyRateLimit(req, res, 'poker/engine/tables')) return;

  try {
    const controller = await getController();

    // ── LIST TABLES ──
    if (req.method === 'GET') {
      const { id } = req.query;

      if (id) {
        const info = controller.getTableInfo(id);
        if (!info) return res.status(404).json({ error: 'Table not found' });
        return res.json(info);
      }

      const tables = await controller.listTables();
      return res.json({ tables });
    }

    // ── CREATE TABLE ──
    if (req.method === 'POST') {
      const { authenticatePlayer } = require('../../../../src/lib/poker-engine/authMiddleware');
      const auth = await authenticatePlayer(req, res, { requirePlayerId: false });
      if (!auth) return;

      const result = await controller.createTable({
        ...req.body,
        createdBy: auth.userId,
      });

      if (!result.success) return res.status(400).json(result);
      return res.status(201).json(result);
    }

    // ── CLOSE TABLE ──
    if (req.method === 'DELETE') {
      const { authenticatePlayer } = require('../../../../src/lib/poker-engine/authMiddleware');
      const auth = await authenticatePlayer(req, res, { requirePlayerId: false });
      if (!auth) return;

      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Table id required' });

      const result = await controller.closeTable(id);
      return res.json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[engine/tables]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
