import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000 },
  reporter: "list",
  use: {
    channel: "chrome",
    acceptDownloads: true,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--host-resolver-rules=MAP review.test 127.0.0.1",
      ],
    },
    trace: "off",
  },
});
