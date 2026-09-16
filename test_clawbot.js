require('dotenv').config({ path: '.env.local' });
// Set VERCEL_URL explicitly so the orchestrator can call itself
process.env.VERCEL_URL = 'localhost:3000';

const orchestrator = require('./pages/api/clawbot/orchestrator').default;
const status = require('./pages/api/clawbot/status').default;
const sentryTriage = require('./pages/api/clawbot/sentry-triage').default;

const mockReq = { 
  method: 'GET',
  headers: {
    authorization: `Bearer ${process.env.CRON_SECRET || ''}`
  }
};
const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.data = data; return res; };
  return res;
};

async function testAll() {
  console.log('--- Testing Status Endpoint ---');
  let res = mockRes();
  await status(mockReq, res);
  console.log(`Status code: ${res.statusCode}`);
  console.log('Status active count:', res.data.clawbot?.summary?.active);
  
  // NOTE: skip full orchestrator and triage in standard test to avoid side-effects (like github issue creation)
  // we just simulate a dry-run or ensure the handler doesn't crash prior to external fetch
  console.log('--- ClawBot Modules Loaded OK ---');
}

testAll().catch(err => {
  console.error(err);
  process.exit(1);
});
