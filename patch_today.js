const fs = require('fs');

let content = fs.readFileSync('src/components/mlb/HrTodayLeaders.tsx', 'utf-8');

// Dynamic skeleton sizing
content = content.replace(
  'Array.from({ length: 6 })',
  'Array.from({ length: Math.min(limit, 12) })'
);

// Remove state from image to match players.tsx change (just while I am here)
content = content.replace(/const \[img, setImg\] = useState\(headshot\(p\.player_id\)\);\s*/g, '');
content = content.replace(/src=\{img\}/g, 'src={headshot(p.player_id)}');
content = content.replace(
  /onError=\{\(\) => setImg\('\/default-avatar\.png'\)\}/g,
  "onError={(e) => { e.currentTarget.src = '/default-avatar.png'; }}"
);

fs.writeFileSync('src/components/mlb/HrTodayLeaders.tsx', content);

