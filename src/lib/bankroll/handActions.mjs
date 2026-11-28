// action_sequence is jsonb: usually an array of steps, sometimes a string.
// Rendering the raw array crashed the whole section ("Objects are not valid
// as a React child") as soon as one hand carried real steps.
export function describeAction(action) {
  if (action == null) return '';
  if (typeof action === 'string') return action;
  if (Array.isArray(action)) {
    return action.map(step => {
      if (step == null) return '';
      if (typeof step !== 'object') return String(step);
      return [step.street, step.player || step.position, step.action || step.type, step.amount != null ? step.amount : null]
        .filter(part => part !== null && part !== undefined && part !== '').join(' ');
    }).filter(Boolean).join(', ');
  }
  if (typeof action === 'object') return Object.values(action).filter(v => typeof v !== 'object').join(' ');
  return String(action);
}
