const CARD_RE = /^[2-9TJQKA][cdhs]$/;
const POSITION_RE = /^(UTG|UTG1|UTG2|LJ|MP|HJ|CO|BTN|SB|BB)$/;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export class NativeSolverImportError extends Error {
  constructor(message, code = 'invalid_solver_import') {
    super(message);
    this.name = 'NativeSolverImportError';
    this.code = code;
  }
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new NativeSolverImportError(`${label} Is Required.`);
  return text;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1_000_000) {
    throw new NativeSolverImportError(`${label} Must Be A Positive Number.`);
  }
  return +number.toFixed(3);
}

function position(value, label) {
  const normalized = requiredText(value, label).toUpperCase().replace(/[\s_+\-]+/g, '');
  if (!POSITION_RE.test(normalized)) {
    throw new NativeSolverImportError(`${label} Is Not A Supported Table Position.`);
  }
  return normalized;
}

function cardTokens(value) {
  if (Array.isArray(value)) return value.flatMap(cardTokens);
  return String(value ?? '')
    .replace(/10/gi, 'T')
    .split(/[\s,;/|]+/)
    .flatMap(token => token.match(/.{1,2}/g) || [])
    .filter(Boolean);
}

function cards(value, label = 'Board') {
  const normalized = cardTokens(value).map(raw => `${raw[0]?.toUpperCase() || ''}${raw[1]?.toLowerCase() || ''}`);
  if (normalized.some(card => !CARD_RE.test(card))) {
    throw new NativeSolverImportError(`${label} Contains An Unrecognized Card Code.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new NativeSolverImportError(`Duplicate Card Found In ${label}.`);
  }
  return normalized;
}

function boardObject(value) {
  if (value && !Array.isArray(value) && typeof value === 'object') {
    const flop = cards(value.flop || [], 'Flop');
    const turn = value.turn ? cards([value.turn], 'Turn')[0] : null;
    const river = value.river ? cards([value.river], 'River')[0] : null;
    return validateBoard([...flop, turn, river].filter(Boolean));
  }
  return validateBoard(cards(value));
}

function validateBoard(value) {
  if (![0, 3, 4, 5].includes(value.length)) {
    throw new NativeSolverImportError('Board Must Be Preflop Or Contain Three, Four, Or Five Cards.');
  }
  return { flop: value.slice(0, 3), turn: value[3] || null, river: value[4] || null };
}

function csvRows(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field.trim()); field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field.trim()); field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += character;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizedKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function recordValue(record, ...aliases) {
  const entries = Object.entries(record || {});
  for (const alias of aliases) {
    const found = entries.find(([key]) => normalizedKey(key) === normalizedKey(alias));
    if (found) return found[1];
  }
  return undefined;
}

function parseDelimited(input) {
  const rows = csvRows(input);
  if (rows.length < 2) throw new NativeSolverImportError('Solver CSV Needs A Header And At Least One Data Row.');
  const headers = rows[0];
  return Object.fromEntries(headers.map((header, index) => [header, rows[1][index] ?? '']));
}

function parseLabelledText(input) {
  const record = {};
  for (const line of input.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z +_-]{1,40})\s*[:=]\s*(.*?)\s*$/);
    if (match) record[match[1]] = match[2];
  }
  if (!Object.keys(record).length) {
    throw new NativeSolverImportError('The Solver Export Format Was Not Recognized.');
  }
  return record;
}

function normalizeRecord(record, provider) {
  const firstVillain = Array.isArray(record?.villains) ? record.villains[0] : null;
  const rawBoard = recordValue(record, 'board') ?? [
    recordValue(record, 'flop'), recordValue(record, 'turn'), recordValue(record, 'river'),
  ].filter(Boolean).join(' ');
  const heroPosition = position(recordValue(record, 'hero position', 'heroPosition', 'hero', 'in position'), 'Hero Position');
  const villainPosition = position(firstVillain?.position ?? recordValue(record, 'villain position', 'villainPosition', 'villain', 'out of position'), 'Villain Position');
  if (heroPosition === villainPosition) throw new NativeSolverImportError('Hero And Villain Positions Must Be Different.');
  const potSize = positiveNumber(recordValue(record, 'pot', 'pot size', 'potSize'), 'Pot Size');
  const effStack = positiveNumber(recordValue(record, 'effective stack', 'effStack', 'stack', 'effective stack bb'), 'Effective Stack');
  const villainRange = String(firstVillain?.range ?? recordValue(record, 'villain range', 'oop range', 'range') ?? '').trim();

  return {
    provider,
    formatVersion: 'pa-native-solver-import-v1',
    warnings: [],
    state: {
      board: boardObject(rawBoard),
      heroPosition,
      potSize,
      effStack,
      villains: [{
        id: 1,
        position: villainPosition,
        range: villainRange,
        archetype: { id: 'gto_neutral', name: 'GTO Neutral' },
        stack: effStack,
      }],
    },
  };
}

export function parseNativeSolverImport(input, { fileName = '' } = {}) {
  const text = requiredText(input, 'Solver Export');
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    throw new NativeSolverImportError('Solver Export Must Be No Larger Than 2 MB.', 'solver_import_too_large');
  }
  if (/[\u0000-\u0008\u000E-\u001F]/.test(text) || /\.cfr$/i.test(fileName)) {
    throw new NativeSolverImportError('Binary Solver Trees Are Not Supported. Export The Selected Node As Text, CSV, Or JSON.', 'binary_solver_tree');
  }

  const trimmed = text.trim();
  let provider = 'Smarter.Poker';
  let record;
  if (trimmed.startsWith('{')) {
    try { record = JSON.parse(trimmed); }
    catch { throw new NativeSolverImportError('Solver JSON Could Not Be Parsed.'); }
    provider = String(record.provider || record.solver || provider).trim() || provider;
  } else if (/piosolver/i.test(trimmed) || /\.pio$/i.test(fileName)) {
    provider = 'PioSolver';
    record = parseLabelledText(trimmed);
  } else if (/gto\+/i.test(trimmed) || /gto[+_-]?plus/i.test(fileName)) {
    provider = 'GTO+';
    record = trimmed.includes(',') && trimmed.includes('\n') ? parseDelimited(trimmed) : parseLabelledText(trimmed);
  } else if (trimmed.includes(',') && trimmed.includes('\n')) {
    provider = 'GTO+';
    record = parseDelimited(trimmed);
  } else {
    provider = 'PioSolver';
    record = parseLabelledText(trimmed);
  }
  return normalizeRecord(record, provider);
}

export default { parseNativeSolverImport, NativeSolverImportError };
