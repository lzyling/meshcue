export function registerPanTool(review, ready) {
  // Register beside Orbit so the tools remain discoverable as two camera
  // actions; the registry also owns H and the shortcut sheet entry.
  review.commands.register({
    id: "mode-pan",
    labelKey: "tool.pan",
    titleKey: "tool.panTitle",
    captionKey: "tool.pan",
    icon: "pan",
    shortcuts: "H",
    group: "tools",
    attributes: { "data-mode": "pan", class: "tool" },
    enabled: ready,
    run: () => review.setMode("pan"),
  });
}
