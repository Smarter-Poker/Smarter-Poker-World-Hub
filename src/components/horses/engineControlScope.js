export function engineControlScope(authFetch, domain, alive = () => true) {
  const scope = authFetch?.captureScope?.();
  if (
    typeof scope?.operatorId !== 'string' ||
    !scope.operatorId ||
    typeof scope.isCurrent !== 'function' ||
    !scope.isCurrent()
  )
    throw new Error('The Operator Account Could Not Be Confirmed');
  const isCurrent = () => alive() && scope.isCurrent() === true;
  return {
    storageKey: `stable-admin-engine-operation:${scope.operatorId}:${domain}`,
    isCurrent,
    options: { expectedOperatorId: scope.operatorId, isCurrent },
    assertCurrent() {
      if (!isCurrent())
        throw new Error('The Account Or View Changed. Read The Original Operation.');
    },
  };
}
