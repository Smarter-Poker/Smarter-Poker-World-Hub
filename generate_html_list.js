const fs = require('fs');
const md = fs.readFileSync('/Users/smarter.poker/.gemini/antigravity/brain/f80e6256-8e27-4277-a5cb-6d96a083721e/artifacts/missing_tournaments_list.md', 'utf8');

const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Missing Tournaments List</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #333; line-height: 1.6; background-color: #f9fafb; }
        h1 { color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        h2 { color: #374151; margin-top: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
        ul { list-style-type: none; padding-left: 0; }
        li { padding: 12px 16px; background: white; margin-bottom: 8px; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05); font-size: 15px; }
        b { color: #1f2937; font-size: 16px; }
    </style>
</head>
<body>
    ${
        md
        .replace(/# Venues Without Verified Tournaments \(Total: (\d+)\)/, '<h1>Venues Without Verified Tournaments ($1)</h1>')
        .replace(/The following venues(.*?)\n/, '<p>The following venues$1</p>')
        .replace(/## (.*)/g, '<h2>$1</h2><ul>')
        .replace(/- \*\*(.*?)\*\* \((.*?)\)( - (.*))?/g, '<li><b>$1</b> <span style="display:inline-block; margin-left: 8px; font-size:12px; font-weight:600; padding:2px 8px; background:#eff6ff; color:#2563eb; border-radius:10px; text-transform:uppercase;">$2</span><span style="color:#6b7280;float:right">$4</span></li>')
        .replace(/<\/li>\n\n/g, '</li></ul>\n')
    }
    </ul>
</body>
</html>
`;

fs.writeFileSync('/tmp/missing_tournaments.html', html);
console.log('HTML saved.');
