export function bindOverlayLayout(review) {
  const shell = review.$(".viewer-shell");
  const toolbar = review.$(".toolbar");
  const update = () => {
    // Translated captions and Parts can wrap the toolbar at any window width.
    // Anchor options to its measured top instead of assuming a single row.
    const bottom = shell.getBoundingClientRect().bottom;
    shell.style.setProperty(
      "--tool-options-bottom",
      `${bottom - toolbar.getBoundingClientRect().top + 8}px`,
    );
  };
  new ResizeObserver(update).observe(toolbar);
  new ResizeObserver(update).observe(shell);
  update();
}
