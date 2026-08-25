export function setupSubjectPanelFocus(root = document) {
  let focusRequested = false;
  let subjectFocusWasInside = false;
  const requestFrame = root.defaultView?.requestAnimationFrame?.bind(root.defaultView)
    ?? globalThis.requestAnimationFrame;

  root.addEventListener('click', event => {
    const summary = event.target.closest?.('[data-subject-summary]');
    if (!summary) return;
    const panel = summary.closest('[data-subject-panel]');
    if (!panel || panel.open) {
      focusRequested = false;
      return;
    }

    const pointerType = typeof event.pointerType === 'string' ? event.pointerType : '';
    const isTouchLike = pointerType === 'touch' || pointerType === 'pen';
    focusRequested = !isTouchLike && root.activeElement === summary;
  });

  root.addEventListener('focusin', event => {
    subjectFocusWasInside = Boolean(event.target.closest?.('[data-subject-list]'));
  });

  root.addEventListener('toggle', event => {
    const panel = event.target;
    if (!panel.matches?.('[data-subject-panel]')) return;

    if (panel.open) {
      if (!focusRequested) return;
      focusRequested = false;
      requestFrame(() => {
        if (!panel.isConnected || !panel.open) return;
        panel.querySelector('[data-subject-list]')?.focus();
      });
      return;
    }

    focusRequested = false;
    if (!subjectFocusWasInside) return;
    const summary = panel.querySelector('[data-subject-summary]');
    if (summary && root.activeElement !== summary) summary.focus();
  }, true);
}
