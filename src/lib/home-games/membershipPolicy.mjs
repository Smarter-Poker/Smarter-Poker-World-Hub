const ACTIVE_MEMBERSHIP_STATES = new Set(['approved', 'pending']);

export function allowsDeclinedReRequest(settings) {
  return settings?.allow_declined_re_request === true;
}

export function evaluateSeatRequestMembership(status, settings) {
  if (status == null) {
    return { allowed: true, nextStatus: 'pending' };
  }

  if (status === 'banned') {
    return {
      allowed: false,
      status: 403,
      code: 'MEMBERSHIP_BANNED',
      message: 'You cannot request a seat in this home game.',
    };
  }

  if (status === 'declined') {
    if (!allowsDeclinedReRequest(settings)) {
      return {
        allowed: false,
        status: 409,
        code: 'MEMBERSHIP_DECLINED',
        message: 'The host has declined this membership request.',
      };
    }
    return { allowed: true, nextStatus: 'pending' };
  }

  if (ACTIVE_MEMBERSHIP_STATES.has(status)) {
    return { allowed: true, nextStatus: null };
  }

  return {
    allowed: false,
    status: 409,
    code: 'MEMBERSHIP_STATE_INVALID',
    message: 'This membership state cannot request a seat.',
  };
}
