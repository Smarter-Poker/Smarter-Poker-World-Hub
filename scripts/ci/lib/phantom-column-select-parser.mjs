const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Column names from a .select('...') string. Empty array when unparseable. */
export function selectColumns(arg) {
  const m = arg.match(/^\s*['"`]([\s\S]*?)['"`]\s*(,|$)/);
  if (!m) return [];
  const body = m[1];
  if (body.includes('(')) return []; // embeds mix in other tables' columns
  const cols = [];
  for (let part of body.split(',')) {
    part = part.trim();
    if (!part || part === '*') continue;
    // PostgREST casts change representation, not the referenced column. Strip
    // one simple type suffix before interpreting a single colon as an alias.
    part = part.replace(/\s*::\s*[a-zA-Z_][a-zA-Z0-9_]*$/, '').trim();
    const fields = part.split(':');
    if (fields.length > 2) continue; // repeated casts or unsupported grammar
    if (fields.length === 2) {
      part = fields[1].trim();
    }
    if (/[*.>"!\s]/.test(part)) continue; // json paths, embeds, oddities
    if (IDENT.test(part)) cols.push(part);
  }
  return cols;
}
