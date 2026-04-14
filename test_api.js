import handler from './pages/api/poker/events-calendar.js';

async function run() {
  const req = {
    method: 'GET',
    query: { dateRange: '30days' },
    headers: {}
  };
  const res = {
    setHeader: () => {},
    status: function(c) {
      this.statusCode = c;
      return this;
    },
    json: function(j) {
      console.log("JSON:", JSON.stringify(j, null, 2).slice(0, 500));
      if (j.error) console.log("ERROR OUTPUT:", j.error);
    }
  };
  await handler(req, res);
}
run();
