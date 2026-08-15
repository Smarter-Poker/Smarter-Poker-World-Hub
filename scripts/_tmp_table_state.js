const { Pool } = require('pg');
const pool = new Pool({
  host: 'db.kuklfnapbkmacvwxktbh.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
(async () => {
  const client = await pool.connect();
  try {
    // 1. Status of NLH 1/2 table
    const nlh = await client.query(`
      SELECT t.id, t.name, t.status, t.current_players, t.max_players,
        COUNT(ts.id) FILTER (WHERE ts.left_at IS NULL) as seated_count
      FROM public.tables t
      LEFT JOIN public.table_seats ts ON ts.table_id = t.id
      WHERE t.name = 'NLH 1.00/2.00' AND t.tournament_id IS NULL
      GROUP BY t.id, t.name, t.status, t.current_players, t.max_players
    `);
    console.log('NLH 1/2 table state:');
    nlh.rows.forEach(r => console.log(`  ID: ${r.id}\n  Status: ${r.status}\n  Players: ${r.current_players} (${r.seated_count} seated)\n  Max: ${r.max_players}`));

    // 2. Horses currently seated at NLH 1/2
    if (nlh.rows.length > 0) {
      const seats = await client.query(`
        SELECT ts.seat_number, ts.stack, p.display_name, p.username, ts.status
        FROM public.table_seats ts
        JOIN public.profiles p ON p.id = ts.user_id
        WHERE ts.table_id = $1 AND ts.left_at IS NULL
        ORDER BY ts.seat_number
      `, [nlh.rows[0].id]);
      console.log('\nSeated horses:');
      seats.rows.forEach(r => console.log(`  Seat ${r.seat_number}: ${r.display_name || r.username} - stack ${r.stack} (${r.status})`));
    }

    // 3. The user's open table (68c94447)
    const userTable = await client.query(`
      SELECT t.id, t.name, t.status, t.game_type,
        COUNT(ts.id) FILTER (WHERE ts.left_at IS NULL) as seated_count
      FROM public.tables t
      LEFT JOIN public.table_seats ts ON ts.table_id = t.id
      WHERE t.id = '68c94447-85c1-4715-a951-a948c6a80135'
      GROUP BY t.id, t.name, t.status, t.game_type
    `);
    console.log('\nUser open table (68c94447):');
    userTable.rows.forEach(r => console.log(`  Name: ${r.name}\n  Type: ${r.game_type}\n  Status: ${r.status}\n  Seated: ${r.seated_count}`));

    // 4. Summary of all cash tables
    const summary = await client.query(`
      SELECT status, COUNT(*) as count
      FROM public.tables
      WHERE game_type = 'cash' AND tournament_id IS NULL
      GROUP BY status ORDER BY status
    `);
    console.log('\nCash table summary:');
    summary.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

    // 5. Recent hands dealt (last 5)
    const hands = await client.query(`
      SELECT h.started_at, h.ended_at, t.name, h.winners_json
      FROM public.hands h
      JOIN public.tables t ON t.id = h.table_id
      ORDER BY h.started_at DESC LIMIT 5
    `).catch(() => ({ rows: [] }));
    if (hands.rows.length) {
      console.log('\nLast 5 hands:');
      hands.rows.forEach(r => {
        const dur = r.ended_at ? Math.round((new Date(r.ended_at) - new Date(r.started_at))/1000) + 's' : 'ongoing';
        console.log(`  ${r.name}: ${dur} - winners: ${r.winners_json ? JSON.stringify(r.winners_json).slice(0,60) : 'n/a'}`);
      });
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
