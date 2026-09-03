/**
 * pagerModel - everything the Pager decides, as one pure function.
 *
 * Two of the three routes behind this console can answer "how many rows are
 * there in total?" and one cannot: hg-reports and hg-appeals page an RPC that
 * provides no count, so they return `total: null` and `hasMore` computed from
 * `rows.length === limit` (PHASE1-CONTRACTS addendum item 15). An unknown
 * total is NOT zero and it is not a number to invent - it is a fact about the
 * source, and the label has to say so while Next still works.
 *
 * Kept separate from Pager.jsx so the copy and the enable/disable rules can be
 * asserted without a DOM.
 */

function fmt(n) {
  return Number(n).toLocaleString();
}

/**
 * @param {object}  o
 * @param {number}  o.offset   Rows skipped before this page.
 * @param {number}  o.limit    Rows requested for this page.
 * @param {number}  o.count    Rows this page actually returned.
 * @param {number|null} o.total  Whole result set, or null when unknown.
 * @param {boolean|undefined} o.hasMore  The route's own answer, when it has one.
 * @param {string}  o.noun     What is being counted, for the label.
 * @returns {{ first:number, last:number, label:string, hasPrevious:boolean,
 *             hasNext:boolean, totalKnown:boolean }}
 */
export function pagerModel({
  offset = 0,
  limit = 50,
  count = 0,
  total = null,
  hasMore = undefined,
  noun = 'Rows',
} = {}) {
  const totalKnown = typeof total === 'number' && Number.isFinite(total);
  const first = count > 0 ? offset + 1 : 0;
  const last = count > 0 ? offset + count : 0;

  let label;
  if (count <= 0) {
    label = totalKnown ? `Showing 0 Of ${fmt(total)} ${noun}` : `Showing 0 ${noun}`;
  } else if (totalKnown) {
    label = `Showing ${fmt(first)}-${fmt(last)} Of ${fmt(total)} ${noun}`;
  } else {
    // No "Of N". A fabricated total is how a list ends up looking complete
    // when nothing knows whether it is.
    label = `Showing ${fmt(first)}-${fmt(last)} ${noun}`;
  }

  // The route's flag wins wherever it sent one, because it is the only party
  // that looked at row limit+1. Otherwise: the total if we have it, and as a
  // last resort a full page, which is the same guess the route makes.
  let hasNext;
  if (typeof hasMore === 'boolean') hasNext = hasMore;
  else if (totalKnown) hasNext = offset + count < total;
  else hasNext = count >= limit;

  return { first, last, label, hasPrevious: offset > 0, hasNext, totalKnown };
}

/** The label alone, for callers that render their own controls. */
export function rangeLabel(options) {
  return pagerModel(options).label;
}

export default pagerModel;
