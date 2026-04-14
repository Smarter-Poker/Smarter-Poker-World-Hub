const https = require('https');
https.get('https://smarter.poker/api/poker/events-calendar?dateRange=1day&limit=20', (resp) => {
  let data = '';
  resp.on('data', (chunk) => { data += chunk; });
  resp.on('end', () => {
    const json = JSON.parse(data);
    const times = json.events.map(e => `${e.event_name} @ ${e.start_time}`);
    console.log("Times:");
    console.log(times.slice(0, 20).join('\n'));
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
