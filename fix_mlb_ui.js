const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const dirPath = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/MLB-ANALYTICS';

walkDir(dirPath, function(filePath) {
  if (!filePath.endsWith('.tsx')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Replace 3xl, 2xl, xl, lg font-bold tabular-nums with extrabold Rajdhani
  content = content.replace(/text-(3xl|2xl|xl|lg)\s+font-bold/g, "text-$1 font-extrabold font-['Rajdhani']");
  
  // 2. Replace h2/h3 section headers
  content = content.replace(/(<h[23]\s+className="[^"]*?)font-bold([^"]*?")/g, "$1font-extrabold font-['Rajdhani'] uppercase$2");
  
  // 3. Add px-4 md:px-0 to grid wrappers that don't have px-
  content = content.replace(/className="([^"]*?grid grid-cols-(1|2|3|4|5|6)[^"]*?gap-[^"]*?)"/g, (match, p1) => {
    if (p1.includes('px-')) return match;
    return `className="${p1} px-4 md:px-0"`;
  });
  
  // 4. Update the cardClass and listPanelClass definitions if they exist to harmonize with new UI
  // Note: we'll skip this if it causes too many issues, but the user liked the status.tsx changes.

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated: ' + filePath);
  }
});
