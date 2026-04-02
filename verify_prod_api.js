const fetch = require('node-fetch');

async function run() {
  const res = await fetch('https://smarter.poker/api/poker/venues?lat=41.71092&lng=-87.7514&radius=50');
  const data = await res.json();
  if (data && data.data) {
     const windCreek = data.data.find(v => v.id == 3096 || (v.name && v.name.includes('Wind')));
     console.log('Found in prod:', !!windCreek);
     if (windCreek) console.log(windCreek.name, windCreek.distance_mi);
  } else {
     console.log('Prod API returned:', Object.keys(data));
  }
}
run();
