const fs = require('fs');
const path = require('path');

const apiDir = 'pages/api/mlb';
const files = fs.readdirSync(apiDir).filter(f => f.endsWith('.ts'));

let results = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(apiDir, file), 'utf-8');
  // extract from('table_name')
  const tables = [...content.matchAll(/\.from\('([^']+)'\)/g)].map(m => m[1]);
  // extract select('fields')
  const selects = [...content.matchAll(/\.select\(\`([^`]+)\`\)/g)].map(m => m[1]);
  const selectsStr = [...content.matchAll(/\.select\('([^']+)'\)/g)].map(m => m[1]);
  results.push({ file, tables: [...new Set(tables)], selects: [...selects, ...selectsStr] });
}

console.log(JSON.stringify(results, null, 2));
