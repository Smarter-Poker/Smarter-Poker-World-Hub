// Small independent PostgREST filter/order interpreter for saved-hand fixtures.
// Timestamp ordering retains microseconds, as timestamptz does in PostgreSQL.
function scalar(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const milliseconds = Date.parse(value);
    if (Number.isFinite(milliseconds)) {
      const fraction = value.match(/\.(\d+)/)?.[1] || '';
      return BigInt(milliseconds) * 1_000_000n + BigInt(fraction.padEnd(9, '0').slice(3, 9));
    }
  }
  return value;
}

export function compareFixtureValues(a, b) {
  const left = scalar(a);
  const right = scalar(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function splitClauses(expression) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let start = 0;
  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && quoted) { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { parts.push(expression.slice(start, i)); start = i + 1; }
  }
  parts.push(expression.slice(start));
  return parts;
}

function matchesClause(row, clause) {
  if (clause.startsWith('and(') && clause.endsWith(')')) {
    return splitClauses(clause.slice(4, -1)).every((part) => matchesClause(row, part));
  }
  const match = clause.match(/^([a-z_]+(?:->>[a-zA-Z_]+)?)\.(lt|eq|imatch)\.(.+)$/s);
  if (!match) throw new Error(`Unsupported Fixture Filter: ${clause}`);
  const [, field, operator, raw] = match;
  const value = JSON.parse(raw);
  const [column, jsonField] = field.split('->>');
  const actual = jsonField ? row[column]?.[jsonField] : row[column];
  if (actual === null || actual === undefined) return false;
  if (operator === 'imatch') return new RegExp(value, 'i').test(String(actual));
  const comparison = compareFixtureValues(actual, value);
  return operator === 'lt' ? comparison < 0 : comparison === 0;
}

export function projectFixtureRow(row, columns) {
  if (!columns || !columns.includes(':')) return row;
  return Object.fromEntries(columns.split(',').map((part) => {
    const [alias, expression] = part.trim().split(':');
    if (!expression) return [alias, row[alias]];
    const [column, jsonField] = expression.split('->>');
    return [alias, jsonField ? row[column]?.[jsonField] ?? null : row[column]];
  }));
}

export function matchesFixtureOr(row, expression) {
  return splitClauses(expression).some((clause) => matchesClause(row, clause));
}

export function compareFixtureOrders(a, b, orders) {
  for (const order of orders) {
    const comparison = compareFixtureValues(a[order.col], b[order.col]);
    if (comparison !== 0) return order.descending ? -comparison : comparison;
  }
  return 0;
}
