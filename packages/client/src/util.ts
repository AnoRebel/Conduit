import { version } from "./version.js";

const DEFAULT_CONFIG = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:global.stun.twilio.com:3478" },
	],
	sdpSemantics: "unified-plan" as const,
};

export const util = {
	noop(): void {},

	CLOUD_HOST: "conduit.anorebel.net" as const,
	CLOUD_PORT: 443 as const,

	chunkedBrowsers: { Chrome: 1, chrome: 1 } as { Chrome: number; chrome: number },
	chunkedMTU: 16300,

	defaultConfig: DEFAULT_CONFIG as RTCConfiguration,

	browser: "Unknown" as string,
	browserVersion: 0 as number,

	supports: {
		browser: true,
		webRTC: true,
		audioVideo: true,
		data: true,
		binaryBlob: true,
		reliable: true,
		webSocket: true,
	},

	validateId(id: string): boolean {
		// Reject empty or whitespace-only ids
		if (!id || !id.trim()) return false;
		// Only alphanumeric, -, _ (max 64 chars)
		return /^[A-Za-z0-9_-]{1,64}$/.test(id);
	},

	randomToken(): string {
		// Use crypto API for secure random token generation
		if (typeof crypto !== "undefined" && crypto.randomUUID) {
			return crypto.randomUUID().replace(/-/g, "");
		}
		// Fallback for older browsers
		if (typeof crypto !== "undefined" && crypto.getRandomValues) {
			const array = new Uint8Array(16);
			crypto.getRandomValues(array);
			return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
		}
		// Last resort fallback (less secure)
		return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
	},

	pack<T>(data: T): ArrayBuffer | string {
		return JSON.stringify(data);
	},

	unpack<T>(data: string | ArrayBuffer): T {
		if (typeof data === "string") {
			return JSON.parse(data) as T;
		}
		if (data instanceof ArrayBuffer) {
			const decoder = new TextDecoder();
			return JSON.parse(decoder.decode(data)) as T;
		}
		return data as T;
	},

	chunk(blob: Blob): { __peerData: number; n: number; total: number; data: Blob }[] {
		const chunks: { __peerData: number; n: number; total: number; data: Blob }[] = [];
		const size = blob.size;
		const total = Math.ceil(size / util.chunkedMTU);
		// Use crypto for secure chunk ID generation
		let id: number;
		if (typeof crypto !== "undefined" && crypto.getRandomValues) {
			const array = new Uint32Array(1);
			crypto.getRandomValues(array);
			id = array[0] ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
		} else {
			id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
		}

		let index = 0;
		let start = 0;

		while (start < size) {
			const end = Math.min(size, start + util.chunkedMTU);
			const chunk = blob.slice(start, end);

			chunks.push({
				__peerData: id,
				n: index,
				total,
				data: chunk,
			});

			start = end;
			index++;
		}

		return chunks;
	},

	blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
		return blob.arrayBuffer();
	},

	isSecure(): boolean {
		return typeof location !== "undefined" && location.protocol === "https:";
	},

	version,
};

// Detect browser
if (typeof navigator !== "undefined") {
	const ua = navigator.userAgent;

	if (ua.includes("Firefox")) {
		util.browser = "Firefox";
		const match = ua.match(/Firefox\/(\d+)/);
		util.browserVersion = match?.[1] ? Number.parseInt(match[1], 10) : 0;
	} else if (ua.includes("Chrome")) {
		util.browser = "Chrome";
		const match = ua.match(/Chrome\/(\d+)/);
		util.browserVersion = match?.[1] ? Number.parseInt(match[1], 10) : 0;
	} else if (ua.includes("Safari")) {
		util.browser = "Safari";
		const match = ua.match(/Version\/(\d+)/);
		util.browserVersion = match?.[1] ? Number.parseInt(match[1], 10) : 0;
	} else if (ua.includes("Edge")) {
		util.browser = "Edge";
		const match = ua.match(/Edge\/(\d+)/);
		util.browserVersion = match?.[1] ? Number.parseInt(match[1], 10) : 0;
	}
}
