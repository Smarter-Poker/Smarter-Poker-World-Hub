const fs = require('fs');

const dir = '/Users/smarter.poker/.gemini/antigravity/brain/069a2729-d550-442d-8faa-88bead0471f4';
const files = fs.readdirSync(dir)
    .filter(file => file.includes('_animated_') && file.endsWith('.jpg'))
    .sort();

let content = '# Final 50 Animated Throwables\n\n';
content += 'Here are all 50 animated 3D throwables generated with pure black backgrounds:\n\n';
content += '<table>\n';
for (let i = 0; i < files.length; i += 5) {
    content += '  <tr>\n';
    for (let j = 0; j < 5; j++) {
        const file = files[i + j];
        if (file) {
            const name = file.replace(/_animated_\d+\.jpg$/, '').replace(/_/g, ' ').toUpperCase();
            content += `    <td align="center"><img src="${dir}/${file}" width="150" /><br />${name}</td>\n`;
        }
    }
    content += '  </tr>\n';
}
content += '</table>\n';

fs.writeFileSync(`${dir}/all_50_throwables.md`, content);
console.log(`Generated preview with ${files.length} items`);
