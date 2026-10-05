export function disclosureTone(state = '') {
  if (/unknown|failed|residue|critical|stale/.test(state)) return 'danger';
  if (/missing|never|unstable|unrecorded|invocation|mutable|partial/.test(state)) return 'warn';
  if (/ready|balanced|recorded/.test(state)) return 'good';
  return 'info';
}
export function burninChecks(value) {
  if (Array.isArray(value?.checks)) return value.checks;
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.entries(value).filter(([key]) => key !== 'verdict').map(([name, item]) => ({
      name,
      passed: item === true || item?.passed === true || item?.ok === true,
      value: item?.value ?? item,
    }));
  }
  return [];
}

export function findingStability(row) {
  const seatCount = row?.seat_count_in_force ?? row?.auditTerms?.seat_count_in_force;
  const rakeCap = row?.max_rake_cap_in_force ?? row?.auditTerms?.max_rake_cap_in_force;
  return seatCount === null || seatCount === undefined
    || rakeCap === null || rakeCap === undefined
    ? 'rakelaw.verdict_unstable'
    : 'rakelaw.derived_from_record';
}

export function evidenceAgeState(value, { staleAfterMs, now = Date.now(), ready = 'evidence.recorded', stale = 'evidence.stale', absent = 'evidence.never_recorded' } = {}) {
  if (!value) return absent;
  const stamp = new Date(value).getTime();
  if (!Number.isFinite(stamp)) return absent;
  return Number.isFinite(staleAfterMs) && now - stamp > staleAfterMs ? stale : ready;
}

export function cadenceState(lastRunAt, cadenceMs, graceMs = 0, now = Date.now()) {
  if (!lastRunAt) return 'job.no_evidence';
  const stamp = new Date(lastRunAt).getTime();
  if (!Number.isFinite(stamp)) return 'job.no_evidence';
  return now - stamp > cadenceMs + graceMs ? 'job.run_missed' : 'job.evidence_recorded';
}
