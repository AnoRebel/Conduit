import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["html", { open: "never" }], ["list"]],
	timeout: 60000,

	use: {
		baseURL: "http://localhost:3000",
		trace: "on-first-retry",
		video: "on-first-retry",
		screenshot: "only-on-failure",
	},

	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				permissions: ["camera", "microphone"],
			},
		},
		{
			name: "firefox",
			use: {
				...devices["Desktop Firefox"],
				launchOptions: {
					firefoxUserPrefs: {
						"media.navigator.streams.fake": true,
						"media.navigator.permission.disabled": true,
					},
				},
			},
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
	],

	webServer: [
		{
			command: "bun run --filter=@conduit/server start -- --port 9000 --allow-discovery",
			port: 9000,
			reuseExistingServer: !process.env.CI,
			timeout: 30000,
		},
		{
			command: "bun run serve-fixtures",
			port: 3000,
			reuseExistingServer: !process.env.CI,
		},
	],
});
