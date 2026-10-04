/* Use the focused element as well as the event target: nested editable spans
   and programmatically dispatched keys should obey the same typing boundary.
   Native dialogs retain their own Escape handling while application shortcuts
   wait until the modal has closed. */
export function shortcutsBlocked(document, target) {
  const editable = (element) =>
    element?.isContentEditable ||
    element?.closest?.(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    );
  return !!(
    editable(document.activeElement) ||
    editable(target) ||
    document.querySelector("dialog:modal")
  );
}
export function bindKeyboard(review) {
  window.addEventListener("keydown", (event) => {
    if (!shortcutsBlocked(document, event.target))
      review.commands.dispatch(event);
  });
}
