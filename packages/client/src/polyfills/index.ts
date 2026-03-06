import { logger } from "../logger.js";

let polyfillsLoaded = false;

/**
 * Load polyfills for older browsers if needed.
 * This is called automatically but can be called explicitly.
 */
export async function loadPolyfills(): Promise<void> {
	if (polyfillsLoaded) return;

	try {
		// TextEncoder/TextDecoder polyfill
		if (typeof TextEncoder === "undefined" || typeof TextDecoder === "undefined") {
			logger.log(
				"TextEncoder/TextDecoder not available - this may cause issues on very old browsers"
			);
		}

		// ReadableStream polyfill for streaming data connections
		// Only needed in very old browsers; modern Node/Deno/Bun all have ReadableStream.
		// The dynamic specifier variable prevents JSR from rewriting the bare npm specifier
		// to a relative path (which would not exist in the published package).
		if (typeof ReadableStream === "undefined") {
			logger.log("Loading ReadableStream polyfill");
			try {
				const mod = "web-streams-polyfill";
				const polyfill = await import(/* @vite-ignore */ mod);
				const RS = polyfill.ReadableStream;
				if (RS && typeof globalThis.ReadableStream === "undefined") {
					(globalThis as unknown as { ReadableStream: typeof RS }).ReadableStream = RS;
				}
			} catch {
				logger.warn("ReadableStream polyfill not available - streaming features may not work");
			}
		}

		polyfillsLoaded = true;
	} catch (error) {
		logger.error("Error loading polyfills:", error);
	}
}

// Auto-load polyfills on import
if (typeof window !== "undefined") {
	loadPolyfills();
}
