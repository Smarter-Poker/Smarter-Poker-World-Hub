const fs = require('fs');
let content = fs.readFileSync('pages/hub/MLB-ANALYTICS/hr-tracker.tsx', 'utf-8');

// Fix clipping on mobile spotlight container by adding -mx-4 to allow bleed, and keeping px-4
content = content.replace(
  'className="flex flex-nowrap overflow-x-auto snap-x md:grid md:grid-cols-5 gap-3 px-4 md:px-0 pb-4 md:pb-0"',
  'className="flex flex-nowrap overflow-x-auto snap-x md:grid md:grid-cols-5 gap-3 -mx-4 px-4 md:mx-0 md:px-0 pb-4 md:pb-0"'
);

fs.writeFileSync('pages/hub/MLB-ANALYTICS/hr-tracker.tsx', content);
