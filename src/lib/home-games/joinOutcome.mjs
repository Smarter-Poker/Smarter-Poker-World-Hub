// HTTP acceptance is not a membership decision. Only canonical stored statuses
// can unlock a member view; unknown acknowledgments remain explicitly unknown.
export function homeGameJoinOutcome(payload) {
  const result = payload?.data?.membership || payload?.membership || payload?.data || payload || {};
  const status = payload?.status || result.status;
  const error = payload?.error || result.error;
  if (payload?.success === false || result.success === false || error) {
    return { state: 'error', message: error?.message || (typeof error === 'string' ? error : '') || 'This membership request was not accepted.' };
  }
  if (status === 'pending') return { state: 'pending', message: 'Request sent. The host will let you know when you are approved.' };
  if (status === 'approved') return { state: 'joined', message: 'You are in.' };
  if (status === 'banned' || status === 'declined') {
    return { state: 'error', message: 'The host has not granted you access to this group.' };
  }
  return { state: 'unknown', message: 'Your membership could not be confirmed. Review your Home Games before retrying this request.' };
}

export function createHomeGameJoinOperation(makeKey) {
  let active = false;
  const keys = new Map();
  return {
    async run(code, submit) {
      if (active) return null;
      active = true;
      try {
        if (!keys.has(code)) keys.set(code, makeKey());
        return await submit(keys.get(code));
      } finally {
        active = false;
      }
    },
  };
}
