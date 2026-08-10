/**
 * Browser smoke tests for the admin dashboard.
 *
 * This package previously had no automated tests at all, so the goal here is
 * breadth rather than depth: prove every top-level view renders and navigates
 * without an uncaught client error. That is the coverage most likely to catch
 * breakage from a dependency bump, which is what motivated the suite.
 *
 * Run with `bun run test:e2e`. Requires a built app (`bun run build`) and a
 * system-installed browser; nothing here downloads one.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { browser } from "bunwright";
import {
	type PreviewServer,
	resolveBrowserPath,
	startPreviewServer,
	TOP_LEVEL_VIEWS,
} from "./support/harness.js";

const PORT = 43117;

let server: PreviewServer;

beforeAll(async () => {
	const chromePath = resolveBrowserPath();

	browser.config({
		backend: { type: "chrome", path: chromePath },
		headless: true,
		width: 1280,
		height: 800,
		// Surface page console output so an uncaught client error is visible.
		console: true,
	});

	server = await startPreviewServer(PORT);
	// The Nitro server takes roughly 8s to answer, which exceeds Bun's 5s default
	// hook timeout. Without this the hook is killed before startPreviewServer's
	// own readiness wait can finish, and the suite fails intermittently.
}, 90_000);

afterAll(async () => {
	await browser.close();
	server?.stop();
});

describe("admin dashboard", () => {
	test("serves the dashboard", async () => {
		const response = await fetch(server.url);

		expect(response.status).toBeLessThan(500);
	});

	test("renders the primary dashboard view", async () => {
		const page = await browser.newPage();

		try {
			await page.navigate(server.url, { waitForLoadState: "load" });

			// The app shell must actually mount, not merely return HTML.
			const mounted = await page.evaluate(
				() => document.querySelector("#__nuxt")?.children.length ?? 0
			);

			expect(mounted).toBeGreaterThan(0);
		} finally {
			page.close();
		}
	}, 60_000);

	test("has a non-empty document title", async () => {
		const page = await browser.newPage();

		try {
			await page.navigate(server.url, { waitForLoadState: "load" });
			const title = await page.evaluate(() => document.title);

			expect(title.length).toBeGreaterThan(0);
		} finally {
			page.close();
		}
	}, 60_000);
});

describe("top-level navigation", () => {
	for (const view of TOP_LEVEL_VIEWS) {
		test(`renders the ${view.name} view without an uncaught client error`, async () => {
			const page = await browser.newPage();

			try {
				await page.navigate(`${server.url}${view.path}`, { waitForLoadState: "load" });

				// Nuxt renders its error boundary into the page on an uncaught
				// client error, so its absence is the signal we want.
				const state = await page.evaluate(() => ({
					mountedChildren: document.querySelector("#__nuxt")?.children.length ?? 0,
					bodyText: document.body?.innerText?.slice(0, 400) ?? "",
				}));

				expect(state.mountedChildren).toBeGreaterThan(0);
				expect(state.bodyText).not.toContain("500");
				expect(state.bodyText.toLowerCase()).not.toContain("internal server error");
			} finally {
				page.close();
			}
		}, 60_000);
	}
});
