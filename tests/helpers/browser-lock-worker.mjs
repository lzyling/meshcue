import { acquireBrowserLock } from "../../scripts/browser-lock.mjs";
const release = await acquireBrowserLock({
  file: process.argv[2],
  ci: false,
  waitMs: 10,
  log: (message) => process.send({ waiting: message }),
});
process.send({ acquired: true });
process.on("message", () => {
  release();
  process.exit(0);
});
