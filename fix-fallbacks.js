const fs = require('fs');
const files = [
  { path: 'pages/hub/tours/[code].js', search: "/hub/poker-near-me/tours", replace: "/hub/poker-tours" },
  { path: 'pages/hub/poker-tours.js', search: "/hub/poker-near-me/lobby", replace: "/hub" },
  { path: 'pages/hub/poker-series.js', search: "/hub/poker-near-me/lobby", replace: "/hub" },
  { path: 'pages/hub/events-calendar.js', search: "/hub/poker-near-me/lobby", replace: "/hub" },
  { path: 'pages/hub/daily-tournaments.js', search: "/hub/poker-near-me/lobby", replace: "/hub" },
  { path: 'pages/hub/home-games.js', search: "/hub/poker-near-me/lobby", replace: "/hub" },
  { path: 'pages/hub/poker-near-me/[pnmTab].js', search: "router.push('/hub')", replace: "router.push('/hub/poker-near-me/lobby')" }
];

for (const task of files) {
   let content = fs.readFileSync(task.path, 'utf8');
   // Only replace the fallbacks inside onBackClick
   // We will target the exact strings inside the else blocks
   if (content.includes(task.search)) {
      content = content.replace(task.search, task.replace);
      fs.writeFileSync(task.path, content);
      console.log(`Updated ${task.path}`);
   } else {
      console.log(`Search string not found in ${task.path}`);
   }
}
