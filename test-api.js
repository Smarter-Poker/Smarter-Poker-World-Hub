const http = require('http');
http.get('http://localhost:3000/api/games/cash-001', (res) => {
  console.log('Status Code:', res.statusCode);
  res.on('data', (d) => process.stdout.write(d));
}).on('error', (e) => {
  console.error(e);
});
