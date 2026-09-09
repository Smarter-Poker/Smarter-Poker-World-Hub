/**
 * Return the first argument from a JavaScript call argument list.
 *
 * CHECK 13 only treats the first insert/update/upsert argument as row data.
 * Supabase accepts a second options object for upsert; those keys are not
 * database columns and must never be scanned as such.
 */
export function firstTopLevelArgument(args) {
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let quote = null;

  for (let i = 0; i < args.length; i += 1) {
    const c = args[i];

    if (quote) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(') paren += 1;
    else if (c === ')') paren -= 1;
    else if (c === '{') brace += 1;
    else if (c === '}') brace -= 1;
    else if (c === '[') bracket += 1;
    else if (c === ']') bracket -= 1;
    else if (c === ',' && paren === 0 && brace === 0 && bracket === 0) {
      return args.slice(0, i);
    }
  }

  return args;
}

function balancedBrace(src, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return [src.slice(openIdx + 1, i), i];
    }
  }
  return [null, -1];
}

/** Literal object keys from the first insert/update/upsert argument. */
export function writeColumns(args) {
  const firstArg = firstTopLevelArgument(args).trim();
  let objSrc = null;
  if (firstArg.startsWith('{')) {
    const [inner] = balancedBrace(firstArg, 0);
    objSrc = inner;
  } else if (firstArg.startsWith('[')) {
    const b = firstArg.indexOf('{');
    if (b !== -1) {
      const [inner] = balancedBrace(firstArg, b);
      objSrc = inner;
    }
  }
  if (objSrc == null) return [];

  const cols = [];
  let depth = 0;
  let i = 0;
  let expectKey = true;
  while (i < objSrc.length) {
    const c = objSrc[i];
    if (c === '{' || c === '[' || c === '(') { depth += 1; i += 1; continue; }
    if (c === '}' || c === ']' || c === ')') { depth -= 1; i += 1; continue; }
    if (depth === 0 && expectKey) {
      const rest = objSrc.slice(i);
      const km = rest.match(/^\s*(?:['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?)\s*:/);
      if (km) { cols.push(km[1]); i += km[0].length; expectKey = false; continue; }
      const sm = rest.match(/^\s*\.\.\./);
      if (sm) { i += sm[0].length; expectKey = false; continue; }
    }
    if (depth === 0 && c === ',') { expectKey = true; i += 1; continue; }
    i += 1;
  }
  return cols;
}
