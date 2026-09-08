/**
 * spKeyActivate — make a non-interactive element behave like a button.
 *
 * The social surfaces are full of clickable divs and spans. A div with onClick
 * cannot be focused, cannot be activated by Enter or Space, and is not
 * announced as a control. The fix is always the same three attributes:
 *
 *     role="button" tabIndex={0} onKeyDown={spKeyActivate}
 *
 * Activation goes through currentTarget.click() rather than re-invoking the
 * element's handler, so each control keeps exactly one behaviour: whatever its
 * own onClick already does. A second copy of the handler is a second thing to
 * keep in step, and this codebase has been bitten by that shape more than once.
 *
 * This lives in one module on purpose. It was defined inline in the social feed
 * page first, and four more surfaces needed it - which is precisely how the
 * feed page ended up copied into four components in the first place.
 *
 * NOT for backdrops. A dismissal scrim, a modal overlay or a
 * stopPropagation guard is not a control, and putting a tab stop on a sheet of
 * glass is worse than leaving it: for a dialog the keyboard path is Escape.
 * Mark those `data-sp-skip-a11y="<reason>"` instead - the law reads the reason.
 */
export function spKeyActivate(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  // Space scrolls the page; Enter can submit a surrounding form.
  e.preventDefault();
  e.currentTarget.click();
}

export default spKeyActivate;
