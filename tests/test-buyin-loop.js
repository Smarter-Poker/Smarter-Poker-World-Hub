const crypto = require('crypto');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
async function run() {
  const IDKEY = crypto.randomUUID();
  const promises = Array.from({ length: 10 }, () => fetch(`${BASE}/api/club-arena/buyin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ', 'X-Idempotency-Key': IDKEY },
    body: JSON.stringify({ clubId: '00000000-0000-0000-0000-000000000000', chipAmount: 100 }),
  }));
  const res = await Promise.all(promises);
  for (const r of res) {
    if (r.status === 200 || r.status === 400 || r.status === 401 || r.status === 409 || r.status === 500) {
      console.log(r.status, await r.text());
    }
  }
}
run();
