const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf-8');
  
  // Remove useState for imgSrc
  content = content.replace(/const \[imgSrc, setImgSrc\] = useState\(headshotUrl\);\s*/g, '');
  
  // Remove useEffect for imgSrc sync
  content = content.replace(/useEffect\(\(\) => \{\s*setImgSrc\(headshotUrl\);\s*\}, \[headshotUrl\]\);\s*/g, '');
  
  // Replace src={imgSrc} with src={headshotUrl}
  content = content.replace(/src=\{imgSrc\}/g, 'src={headshotUrl}');
  
  // Replace onError
  content = content.replace(
    /onError=\{\(\) => \{ if \(imgSrc !== '\/default-avatar\.png'\) setImgSrc\('\/default-avatar\.png'\); \}\}/g,
    "onError={(e) => { e.currentTarget.src = '/default-avatar.png'; }}"
  );

  fs.writeFileSync(filepath, content);
}

patchFile('pages/hub/MLB-ANALYTICS/players.tsx');
patchFile('pages/hub/MLB-ANALYTICS/players/[id].tsx');

