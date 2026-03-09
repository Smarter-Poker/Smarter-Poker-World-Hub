const fs = require('fs');

const files = [
  'spr-trainer.js', 'hand-comparison.js', 'range-advisor.js', 'ev-trainer.js',
  'quiz-gauntlet.js', 'icm-calculator.js', 'preflop-advisor.js', 'villain-range.js',
  'pot-geometry.js', 'preflop-charts.js'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Insert import if missing
  if (!content.includes('import { eventBus, EventType, busEmit }')) {
     content = content.replace("import useTrainingBus from '../../../src/hooks/useTrainingBus';", "import useTrainingBus from '../../../src/hooks/useTrainingBus';\nimport { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';");
  }

  // Remove the shadow busEmit functions (handling variations)
  content = content.replace(/function busEmit\(e, d\) \{ if \(typeof window !== 'undefined'\) window\.dispatchEvent\(new CustomEvent\(e, \{ detail: d \}\)\); \}\n?/g, '');
  content = content.replace(/function busEmit\(event, data\) \{\n\s*if \(typeof window !== 'undefined'\) window\.dispatchEvent\(new CustomEvent\(event, \{ detail: data \}\)\);\n\}\n?/g, '');
  content = content.replace(/function busEmit\(event, data\) \{\n\s*if \(typeof window !== 'undefined'\) \{\n\s*window\.dispatchEvent\(new CustomEvent\(event, \{ detail: data \}\)\);\n\s*\}\n\}\n?/g, '');

  fs.writeFileSync(file, content);
  console.log(`Fixed ${file}`);
}
