const fs = require('fs');

const files = [
  'pages/hub/home-games.js',
  'pages/hub/venues/[id].js',
  'pages/hub/series/[id].js',
  'pages/hub/tours/[code].js'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  if (content.includes('HamburgerMenu')) {
     console.log('Skipping ' + file + ' (already has HamburgerMenu)');
     continue;
  }

  // Add import
  const depth = file.split('/').length - 2; // e.g. pages/hub/home-games.js -> depth 2, pages/hub/venues/[id].js -> depth 3
  const importPath = depth === 3 ? '../../../src/components/ui/HamburgerMenu' : '../../src/components/ui/HamburgerMenu';
  content = content.replace(
    /(import .* UniversalHeader .*;\n)/,
    `$1import HamburgerMenu from '${importPath}';\n`
  );

  // Add menuOpen state inside component
  content = content.replace(
    /(\n\s*const \[.*) = useState/,
    `\n  const [menuOpen, setMenuOpen] = useState(false);$1 = useState`
  );

  // Add onMenuClick to UniversalHeader
  content = content.replace(
    /(<UniversalHeader[^>]* )(\/?>)/,
    `$1onMenuClick={() => setMenuOpen(true)} $2`
  );

  // Add HamburgerMenu component right after UniversalHeader
  content = content.replace(
    /(<UniversalHeader[^>]* \/?>\n)/,
    `$1      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />\n`
  );

  fs.writeFileSync(file, content);
  console.log('Updated ' + file);
}
