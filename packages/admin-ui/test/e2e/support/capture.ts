/**
 * Screenshot capture harness for manual visual review.
 *
 * Not part of the automated suite: this drives the built app across several
 * viewports and writes PNGs plus a rendered-state report, so a human can
 * confirm the dashboard actually looks right rather than merely mounting.
 *
 * Usage:
 *   BUN_CHROME_PATH=/usr/bin/helium-browser bun test/e2e/support/capture.ts [outDir]
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { browser } from "bunwright";
import { resolveBrowserPath, startPreviewServer, TOP_LEVEL_VIEWS } from "./harness.js";

const OUT_DIR = process.argv[2] ?? "/tmp/conduit-shots";
const PORT = 43217;

/** Viewports covering the responsive breakpoints the UI is expected to handle. */
const VIEWPORTS = [
	{ name: "mobile", width: 390, height: 844 },
	{ name: "tablet", width: 834, height: 1112 },
	{ name: "desktop", width: 1440, height: 900 },
];

interface ViewReport {
	view: string;
	viewport: string;
	title: string;
	mountedChildren: number;
	visibleText: number;
	horizontalOverflow: boolean;
	scrollWidth: number;
	clientWidth: number;
	consoleErrors: string[];
	emptyStates: number;
	screenshot: string;
}

const reports: ViewReport[] = [];

mkdirSync(OUT_DIR, { recursive: true });

const server = await startPreviewServer(PORT);

const chromePath = resolveBrowserPath();

try {
	for (const viewport of VIEWPORTS) {
		// The backend applies width/height at browser launch, so each viewport
		// needs its own browser session rather than a per-page resize.
		await browser.close();
		browser.config({
			backend: { type: "chrome", path: chromePath },
			headless: true,
			width: viewport.width,
			height: viewport.height,
			console: true,
		});

		for (const view of TOP_LEVEL_VIEWS) {
			const page = await browser.newPage();

			try {
				await page.navigate(`${server.url}${view.path}`, { waitForLoadState: "load" });
				// Give client-side data fetching a chance to settle.
				await page.waitForTimeout(1500);

				const state = await page.evaluate(() => {
					const root = document.querySelector("#__nuxt");
					const body = document.body;
					return {
						title: document.title,
						mountedChildren: root?.children.length ?? 0,
						visibleText: (body?.innerText ?? "").trim().length,
						scrollWidth: document.documentElement.scrollWidth,
						clientWidth: document.documentElement.clientWidth,
						// Elements the design uses to signal "no data yet".
						emptyStates: document.querySelectorAll("[data-empty], .empty-state").length,
					};
				});

				const file = join(OUT_DIR, `${view.name}-${viewport.name}.png`);
				await page.screenshot(file);

				reports.push({
					view: view.name,
					viewport: viewport.name,
					title: state.title,
					mountedChildren: state.mountedChildren,
					visibleText: state.visibleText,
					// A page wider than its viewport means the layout broke.
					horizontalOverflow: state.scrollWidth > state.clientWidth + 1,
					scrollWidth: state.scrollWidth,
					clientWidth: state.clientWidth,
					consoleErrors: [],
					emptyStates: state.emptyStates,
					screenshot: file,
				});
			} finally {
				page.close();
			}
		}
	}
} finally {
	await browser.close();
	server.stop();
}

console.log(JSON.stringify(reports, null, 2));
