const fetch = require('node-fetch');

async function run() {
  const res = await fetch('http://localhost:3000/api/poker/venues?lat=41.71092&lng=-87.7514&radius=50');
  const data = await res.json();
  if (data && data.data) {
     const windCreek = data.data.find(v => v.id == 3096 || (v.name && v.name.includes('Wind Creek')));
     console.log('Wind creek found:', !!windCreek);
     if (windCreek) console.log('Details:', windCreek.distance_mi, 'miles away');
  } else {
     console.log('API returned:', data);
  }
}
run();
