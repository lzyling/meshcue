// Missing show is the original colour + letter representation.
export const LABEL_ONLY_COLOR = "#8a9399";
export const MARK_SHOW_KEY = "meshcue-mark-show";
export function markAppearance(show, color) {
  return {
    color: show === "label" ? LABEL_ONLY_COLOR : color,
    ...(["color", "label"].includes(show) ? { show } : {}),
  };
}
