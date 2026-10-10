// Agent HTTP input limits; reused by every tool entry.
export const INPUT_LIMITS = Object.freeze({
  name: 160,
  version: 80,
  units: 30,
  label: 24,
  id: 100,
  keep: 1000,
  summary: 1000,
  annotations: 20,
  clientAddress: 64,
});
export const ID_PATTERN = `^[a-zA-Z0-9_-]{1,${INPUT_LIMITS.id}}$`;
export const DEFAULT_STALL_AFTER = 20;
