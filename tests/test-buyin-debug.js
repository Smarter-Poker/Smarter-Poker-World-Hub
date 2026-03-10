const BASE = process.env.BASE_URL || 'http://localhost:3000';
async function run() {
  const IDKEY = crypto.randomUUID();
  const res = await fetch(`${BASE}/api/club-arena/buyin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ', 'X-Idempotency-Key': IDKEY },
    body: JSON.stringify({ clubId: '00000000-0000-0000-0000-000000000000', chipAmount: 100 }),
  });
  console.log(res.status, await res.text());
}
run();
