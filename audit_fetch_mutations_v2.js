const fs = require('fs');
const path = require('path');

const DIRS_TO_SCAN = [
  path.join(__dirname, 'pages/commander'),
  path.join(__dirname, 'src/components/commander')
];

function getFiles(dir, filesList = []) {
  if (!fs.existsSync(dir)) return filesList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, filesList);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
      filesList.push(fullPath);
    }
  }
  return filesList;
}

let allFiles = [];
for (const dir of DIRS_TO_SCAN) {
  allFiles = getFiles(dir, allFiles);
}

const suspiciousFiles = [];

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('fetch(')) continue;
  
  // Very rough heuristic to see if res.ok or json.success are missing
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('await fetch(') || line.includes('fetch(')) {
       let block = lines.slice(i, i + 35).join('\n');
       
       // check if it's a mutation (POST, PUT, DELETE)
       if (block.includes('method:') && !block.includes('method: \'GET\'') && !block.includes('method: "GET"')) {
         
         // If it broadcasts or sets state WITHOUT checking res.ok or json.success
         if (!block.includes('res.ok') && !block.includes('.ok') && !block.includes('json.success') && !block.includes('.success')) {
           
           // Does it have a UI updater?
           if (block.includes('broadcastChange(') || block.includes('set') || block.includes('fetch') || block.includes('mutate(')) {
             
             // Check if it's returning the fetch
             if (!block.includes('return fetch')) {
                // Suspicious!
                suspiciousFiles.push({ file: file.split('Smarter-Poker-World-Hub/')[1], line: i + 1 });
             }
           }
         }
       }
    }
  }
}

// deduplicate
const uniqueSuspiciousFiles = [];
const seenFiles = new Set();
for (const item of suspiciousFiles) {
  if (!seenFiles.has(item.file)) {
    seenFiles.add(item.file);
    uniqueSuspiciousFiles.push(item);
  }
}

console.log(JSON.stringify(uniqueSuspiciousFiles, null, 2));
