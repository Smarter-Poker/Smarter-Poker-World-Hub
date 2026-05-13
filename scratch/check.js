fetch("http://localhost:3000/api/poker/venues?limit=500")
  .then(r => r.json())
  .then(d => {
    console.log("Success:", d.success);
    if (!d.success) console.log("Error:", d);
    else console.log("Venues found:", d.data.length, "Midway?", d.data.some(v => v.name.includes("Midway")));
  })
  .catch(console.error);
