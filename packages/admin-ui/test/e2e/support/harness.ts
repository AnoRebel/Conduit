/**
 * Test harness for the browser end-to-end suite.
 *
 * Serves the built Nitro output and drives a browser already installed on the
 * host. Nothing here downloads a browser: the executable is taken from
 * BUN_CHROME_PATH, falling back to well-known system locations.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Built server entry produced by `bun run build`. */
export const SERVER_ENTRY = join(packageRoot, ".output/server/index.mjs");

/**
 * Browsers to try when BUN_CHROME_PATH is not set.
 *
 * Deliberately a short list of Chromium-family browsers commonly installed on
 * a developer machine; the environment variable is the supported way to point
 * at anything else.
 */
const FALLBACK_BROWSERS = [
	"/usr/bin/helium-browser",
	"/usr/bin/brave",
	"/usr/bin/chromium",
	"/usr/bin/google-chrome",
];

/**
 * Locate the browser executable to drive.
 *
 * @throws When no browser can be found, naming the setting that supplies one.
 */
export function resolveBrowserPath(): string {
	const fromEnv = process.env.BUN_CHROME_PATH;
	if (fromEnv) {
		if (!existsSync(fromEnv)) {
			throw new Error(
				`BUN_CHROME_PATH points at "${fromEnv}", which does not exist. ` +
					"Set it to an installed Chromium-family browser."
			);
		}
		return fromEnv;
	}

	const found = FALLBACK_BROWSERS.find(candidate => existsSync(candidate));
	if (found) {
		return found;
	}

	throw new Error(
		"No browser found for the end-to-end suite. Set BUN_CHROME_PATH to an " +
			`installed Chromium-family browser (tried: ${FALLBACK_BROWSERS.join(", ")}). ` +
			"This suite never downloads a browser."
	);
}

/** Whether the built server output exists, so the suite has something to serve. */
export function hasBuildOutput(): boolean {
	return existsSync(SERVER_ENTRY);
}

/** A running preview server. */
export interface PreviewServer {
	url: string;
	stop(): void;
}

/**
 * Start the built app on an ephemeral port and wait until it answers.
 *
 * @param port - Port to bind. Chosen by the caller so parallel runs do not collide.
 */
export async function startPreviewServer(port: number): Promise<PreviewServer> {
	if (!hasBuildOutput()) {
		throw new Error(
			`No build output at ${SERVER_ENTRY}. Run \`bun run build\` in packages/admin-ui first.`
		);
	}

	const proc = Bun.spawn(["bun", SERVER_ENTRY], {
		env: { ...process.env, PORT: String(port), NITRO_PORT: String(port), HOST: "127.0.0.1" },
		stdout: "pipe",
		stderr: "pipe",
	});

	const url = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 30_000;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
			if (response.ok || response.status < 500) {
				return {
					url,
					stop() {
						proc.kill();
					},
				};
			}
		} catch {
			// Server not up yet.
		}
		await Bun.sleep(250);
	}

	proc.kill();
	throw new Error(`Preview server did not become ready at ${url} within 30s`);
}

/** Top-level views the smoke suite navigates. */
export const TOP_LEVEL_VIEWS = [
	{ name: "dashboard", path: "/" },
	{ name: "metrics", path: "/metrics" },
	{ name: "clients", path: "/clients" },
	{ name: "bans", path: "/bans" },
	{ name: "audit", path: "/audit" },
	{ name: "settings", path: "/settings" },
] as const;
