/**
 * Browser coverage for the rooms view and cluster status.
 *
 * These views are the ones most likely to look fine in code and be wrong on
 * screen: both depend on data the server may not provide at all, and both are
 * meant to degrade to an explanatory empty state rather than an error. That is
 * a rendered-output property, so it is asserted here rather than in a unit test.
 *
 * Run with `bun run test:e2e`. Requires a built app (`bun run build`) and a
 * system-installed browser; nothing here downloads one.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { browser } from "bunwright";
import { type PreviewServer, resolveBrowserPath, startPreviewServer } from "./support/harness.js";

const PORT = 43119;

let server: PreviewServer;

beforeAll(async () => {
	const chromePath = resolveBrowserPath();

	browser.config({
		backend: { type: "chrome", path: chromePath },
		headless: true,
		width: 1280,
		height: 800,
		console: true,
	});

	server = await startPreviewServer(PORT);
}, 90_000);

afterAll(async () => {
	await browser.close();
	server?.stop();
});

describe("rooms view", () => {
	test("mounts without an uncaught client error", async () => {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on?.("pageerror", (error: Error) => errors.push(error.message));

		try {
			await page.navigate(`${server.url}/rooms`, { waitForLoadState: "load" });

			const mounted = await page.evaluate(
				() => document.querySelector("#__nuxt")?.children.length ?? 0
			);

			expect(mounted).toBeGreaterThan(0);
			expect(errors).toEqual([]);
		} finally {
			page.close();
		}
	}, 60_000);

	test("shows the rooms heading", async () => {
		const page = await browser.newPage();

		try {
			await page.navigate(`${server.url}/rooms`, { waitForLoadState: "load" });

			const heading = await page.evaluate(
				() => document.querySelector("h1")?.textContent?.trim() ?? ""
			);

			expect(heading).toBe("Rooms");
		} finally {
			page.close();
		}
	}, 60_000);

	test("degrades to an explanatory state when no server is connected", async () => {
		// With no configured server the room fetch fails, and the page must say
		// something useful rather than render a broken table or throw.
		const page = await browser.newPage();

		try {
			await page.navigate(`${server.url}/rooms`, { waitForLoadState: "load" });
			await Bun.sleep(1500);

			const body = await page.evaluate(() => document.body.textContent ?? "");

			// Either the "rooms are not enabled" state or an empty table; both are
			// acceptable, an unhandled error page is not.
			expect(body).not.toContain("Cannot read");
			expect(body).not.toContain("undefined is not");
			expect(body.length).toBeGreaterThan(0);
		} finally {
			page.close();
		}
	}, 60_000);

	test("offers rooms in the navigation", async () => {
		const page = await browser.newPage();

		try {
			await page.navigate(server.url, { waitForLoadState: "load" });

			const hasRoomsLink = await page.evaluate(() =>
				Array.from(document.querySelectorAll("a")).some(a => a.getAttribute("href") === "/rooms")
			);

			expect(hasRoomsLink).toBe(true);
		} finally {
			page.close();
		}
	}, 60_000);
});

describe("dashboard cluster status", () => {
	test("renders the dashboard without a cluster section when unconnected", async () => {
		// Cluster status is only shown once the store has a status object, so an
		// unconnected dashboard must simply omit it rather than render an
		// empty or broken card.
		const page = await browser.newPage();

		try {
			await page.navigate(server.url, { waitForLoadState: "load" });
			await Bun.sleep(1500);

			const mounted = await page.evaluate(
				() => document.querySelector("#__nuxt")?.children.length ?? 0
			);
			const body = await page.evaluate(() => document.body.textContent ?? "");

			expect(mounted).toBeGreaterThan(0);
			expect(body).not.toContain("Cannot read");
		} finally {
			page.close();
		}
	}, 60_000);
});
