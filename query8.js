const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/mlb/best-bets',
  method: 'GET'
}, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      console.log('Top Moneylines:', data.topMoneylines?.map(b => `${b.matchup} - ${b.selection} (${b.win_confidence?.toFixed(2)}%)`));
    } catch (e) {
      console.error('Error parsing JSON:', e);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
