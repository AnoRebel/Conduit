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
		if (typeof ReadableStream === "undefined") {
			logger.log("Loading ReadableStream polyfill");
			try {
				const { ReadableStream: RS } = await import("web-streams-polyfill");
				if (typeof globalThis.ReadableStream === "undefined") {
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
