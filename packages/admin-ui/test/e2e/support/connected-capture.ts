/**
 * Connected-state screenshot capture for manual review.
 *
 * The smoke suite only ever sees the disconnected dashboard. This drives the
 * real connection dialog against a live Conduit admin API, then captures each
 * view with data actually populated, and samples the dashboard twice to show
 * whether realtime updates are arriving.
 *
 * Requires a running server, e.g.:
 *   CONDUIT_KEY=... ADMIN_API_KEY=... node packages/server/bin/conduit.js \
 *     start --port 19700 --admin --admin-api-key ...
 *
 * Usage:
 *   BUN_CHROME_PATH=/usr/bin/helium-browser \
 *   bun test/e2e/support/connected-capture.ts <outDir> <adminUrl> <apiKey>
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { browser } from "bunwright";
import { resolveBrowserPath, startPreviewServer, TOP_LEVEL_VIEWS } from "./harness.js";

const OUT_DIR = process.argv[2] ?? "/tmp/conduit-connected";
const ADMIN_URL = process.argv[3] ?? "http://127.0.0.1:19700/admin/v1";
const API_KEY = process.argv[4] ?? "";
const PORT = 43317;

mkdirSync(OUT_DIR, { recursive: true });

const server = await startPreviewServer(PORT);

browser.config({
	backend: { type: "chrome", path: resolveBrowserPath() },
	headless: true,
	width: 1440,
	height: 900,
	console: true,
});

const results: Record<string, unknown>[] = [];

try {
	const page = await browser.newPage();

	// --- Connect through the real dialog -------------------------------------
	await page.navigate(`${server.url}/`, { waitForLoadState: "load" });
	await page.waitForTimeout(1500);

	await page.type('input[placeholder*="conduit"], input[type="url"]', ADMIN_URL);
	await page.type('input[placeholder*="API key"], input[type="password"]', API_KEY);
	await page.screenshot(join(OUT_DIR, "00-dialog-filled.png"));

	// No :has-text() here -- that is Playwright syntax, not valid CSS. Find the
	// submit button by its label and click it in-page.
	await page.evaluate(() => {
		const button = Array.from(document.querySelectorAll("button")).find(b =>
			b.textContent?.trim().toLowerCase().startsWith("connect")
		);
		(button as HTMLButtonElement | undefined)?.click();
	});
	// Allow the connection handshake and first data fetch to complete.
	await page.waitForTimeout(4000);

	await page.screenshot(join(OUT_DIR, "01-after-connect.png"));

	const afterConnect = await page.evaluate(() => ({
		text: document.body.innerText.slice(0, 600),
		hasDialog: !!document.querySelector('input[type="password"]'),
	}));
	results.push({ step: "after-connect", ...afterConnect });

	// --- Capture each view with data -----------------------------------------
	for (const view of TOP_LEVEL_VIEWS) {
		await page.navigate(`${server.url}${view.path}`, { waitForLoadState: "load" });
		await page.waitForTimeout(2500);
		await page.screenshot(join(OUT_DIR, `view-${view.name}.png`));

		const state = await page.evaluate(() => ({
			text: document.body.innerText.replace(/\s+/g, " ").slice(0, 400),
			rows: document.querySelectorAll("tbody tr").length,
			canvases: document.querySelectorAll("canvas").length,
		}));
		results.push({ view: view.name, ...state });
	}

	// --- Realtime: sample the dashboard twice --------------------------------
	await page.navigate(`${server.url}/`, { waitForLoadState: "load" });
	await page.waitForTimeout(3000);
	const sampleA = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
	await page.waitForTimeout(8000);
	const sampleB = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
	await page.screenshot(join(OUT_DIR, "02-realtime-second-sample.png"));

	results.push({
		step: "realtime",
		changed: sampleA !== sampleB,
		sampleA: sampleA.slice(0, 300),
		sampleB: sampleB.slice(0, 300),
	});

	page.close();
} finally {
	await browser.close();
	server.stop();
}

console.log(JSON.stringify(results, null, 2));
