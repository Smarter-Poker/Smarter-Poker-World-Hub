const fs = require('fs');
let content = fs.readFileSync('pages/hub/MLB-ANALYTICS/hr-tracker.tsx', 'utf-8');

content = content.replace(
  'Most Due for a Home Run',
  'Most Due For A Home Run'
);

content = content.replace(
  'Track which hitters are statistically overdue for a home run. Due Score = Games Since\n            Last HR ÷ Career HR Rate.',
  'Track Which Hitters Are Statistically Overdue For A Home Run. Due Score = Games Since\n            Last HR ÷ Career HR Rate.'
);

content = content.replace(
  'The home-run cache is refreshed daily during the MLB season. If the season is\n              underway, check back shortly or tap Refresh.',
  'The Home-Run Cache Is Refreshed Daily During The MLB Season. If The Season Is\n              Underway, Check Back Shortly Or Tap Refresh.'
);

fs.writeFileSync('pages/hub/MLB-ANALYTICS/hr-tracker.tsx', content);

let todayContent = fs.readFileSync('src/components/mlb/HrTodayLeaders.tsx', 'utf-8');
todayContent = todayContent.replace(
  'Could not load today&apos;s home-run projections. Please try again shortly.',
  'Could Not Load Today&apos;s Home-Run Projections. Please Try Again Shortly.'
);
todayContent = todayContent.replace(
  'No home-run projections posted yet for today&apos;s slate.',
  'No Home-Run Projections Posted Yet For Today&apos;s Slate.'
);
fs.writeFileSync('src/components/mlb/HrTodayLeaders.tsx', todayContent);

