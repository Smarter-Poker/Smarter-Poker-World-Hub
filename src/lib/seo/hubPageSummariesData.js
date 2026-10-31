/**
 * Pure data utility to extract HUB_PAGE_SUMMARIES from src/components/seo/HubPageSummary.js
 * without evaluating the JSX component in plain Node ESM environments (such as node --test).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedSummaries = null;

export function getHubPageSummaries() {
  if (cachedSummaries) return cachedSummaries;
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const src = fs.readFileSync(path.join(root, 'src/components/seo/HubPageSummary.js'), 'utf8');
    const marker = 'export const HUB_PAGE_SUMMARIES = {';
    const startIdx = src.indexOf(marker);
    const endIdx = src.indexOf('\n};\n\n// The page keys');
    if (startIdx !== -1 && endIdx !== -1) {
      const objLiteral = src.slice(startIdx + 'export const HUB_PAGE_SUMMARIES = '.length, endIdx + 2);
      const fn = new Function(`return (${objLiteral});`);
      cachedSummaries = fn();
      return cachedSummaries;
    }
  } catch {
    // fallback empty object
  }
  return {};
}
