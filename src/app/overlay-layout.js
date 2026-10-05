export function bindOverlayLayout(review) {
  const shell = review.$(".viewer-shell");
  const toolbar = review.$(".toolbar");
  const viewer = review.viewer;
  let pending = true;
  const update = () => {
    // Translated captions and Parts can wrap the toolbar at any window width.
    // Anchor options to its measured top instead of assuming a single row.
    const bottom = shell.getBoundingClientRect().bottom;
    shell.style.setProperty(
      "--tool-options-bottom",
      `${bottom - toolbar.getBoundingClientRect().top + 8}px`,
    );
    pending = true;
  };
  const observer = new ResizeObserver(update);
  for (const el of [toolbar, shell, viewer.container]) observer.observe(el);
  viewer.navigationViewport = () => {
    // Docked panels already reduce the canvas. Reserve only overlays that
    // occupy its top or bottom, using their live layout after wrapping.
    const canvas = viewer.container.getBoundingClientRect();
    let top = canvas.top + 36;
    let bottom = Math.min(
      canvas.bottom - 8,
      toolbar.getBoundingClientRect().top - 8,
    );
    const options = review.$("#tool-options"),
      section = review.$("#section-options");
    if (!options.hidden)
      bottom = Math.min(bottom, options.getBoundingClientRect().top - 8);
    if (!section.hidden)
      top = Math.max(top, section.getBoundingClientRect().bottom + 8);
    // Very short embedded viewers still need a finite fit while panels settle.
    top = Math.min(top, bottom - Math.min(80, canvas.height * 0.25));
    return {
      left: 8 / canvas.width,
      right: 1 - 8 / canvas.width,
      top: Math.max(0, (top - canvas.top) / canvas.height),
      bottom: Math.max(0.1, (bottom - canvas.top) / canvas.height),
    };
  };
  viewer.addFrameHook(() => {
    if (!pending || !viewer.enabled || viewer.navigationAnimation) return;
    pending = false;
    // Loading may open a panel after the first home/restore. Once navigation
    // has begun, resizing the layout must never take the camera from the user.
    if (viewer.navigationFitOnLayout) {
      viewer.fitAll({ animate: false });
      viewer.navigationFitOnLayout = true;
    }
  });
  update();
}
