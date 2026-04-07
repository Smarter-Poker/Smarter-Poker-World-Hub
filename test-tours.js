const fs = require('fs');
const httpMocks = require('node-mocks-http');
// Mock next/server missing stuff if needed, or better, we can just run the test like this:
const data = JSON.parse(fs.readFileSync('./data/tour-source-registry.json'));
let tours = [];
for (const key of Object.keys(data.tours)) {
  let t = data.tours[key];
  tours.push({
    tour_code: key,
    tour_name: t.name || key,
    stops_2026: t.stops_2026 || [],
  });
}
console.log(tours.find(t => t.tour_code === 'WSOPC').stops_2026.find(s => s.location.includes('Elgin')));
