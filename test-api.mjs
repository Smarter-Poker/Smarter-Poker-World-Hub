(async () => {
   const r = await fetch('https://smarter.poker/api/poker/tours?tour_code=RGPS&include_series=true');
   const json = await r.json();
   console.log("Upcoming Series Count:", json.tour?.upcoming_series?.length);
   console.log("Stops 2026 Count:", json.tour?.stops_2026?.length);
   console.log("Series 2026 Count:", json.tour?.series_2026?.length);
})();
