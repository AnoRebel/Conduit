import { logger } from "./logger.js";

/** Detected browser/runtime capabilities relevant to Conduit. */
export interface BrowserSupport {
	/** Whether the runtime is a browser (vs. Node.js). */
	browser: boolean;
	/** Whether WebRTC APIs are available. */
	webRTC: boolean;
	/** Whether getUserMedia (audio/video capture) is available. */
	audioVideo: boolean;
	/** Whether RTCDataChannel is available. */
	data: boolean;
	/** Whether binary Blob creation is supported. */
	binaryBlob: boolean;
	/** Whether reliable (ordered) data channels are available. */
	reliable: boolean;
	/** Whether the WebSocket API is available. */
	webSocket: boolean;
}

function detectBrowser(): string {
	if (typeof navigator === "undefined") {
		return "node";
	}

	const ua = navigator.userAgent;

	if (ua.includes("Firefox")) return "Firefox";
	if (ua.includes("Edg")) return "Edge";
	if (ua.includes("Chrome")) return "Chrome";
	if (ua.includes("Safari")) return "Safari";
	if (ua.includes("Opera")) return "Opera";

	return "Unknown";
}

function isWebRTCSupported(): boolean {
	return (
		typeof RTCPeerConnection !== "undefined" &&
		typeof RTCSessionDescription !== "undefined" &&
		typeof RTCIceCandidate !== "undefined"
	);
}

function isWebSocketSupported(): boolean {
	return typeof WebSocket !== "undefined";
}

function isDataChannelSupported(): boolean {
	if (!isWebRTCSupported()) return false;

	try {
		const pc = new RTCPeerConnection();
		const dc = pc.createDataChannel("test");
		const supported = !!dc;
		dc.close();
		pc.close();
		return supported;
	} catch {
		return false;
	}
}

function isGetUserMediaSupported(): boolean {
	return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

function isBinaryBlobSupported(): boolean {
	if (typeof Blob === "undefined") return false;

	try {
		const blob = new Blob([new Uint8Array([1, 2, 3])]);
		return blob.size === 3;
	} catch {
		return false;
	}
}

function isReliableSupported(): boolean {
	// Reliable data channels (ordered, retransmits) are supported in all modern browsers
	return isDataChannelSupported();
}

/** Detect the current runtime's WebRTC and related capabilities. */
export function detectSupport(): BrowserSupport {
	const browser = detectBrowser();
	const isBrowser = browser !== "node";

	const support: BrowserSupport = {
		browser: isBrowser,
		webRTC: isWebRTCSupported(),
		audioVideo: isGetUserMediaSupported(),
		data: isDataChannelSupported(),
		binaryBlob: isBinaryBlobSupported(),
		reliable: isReliableSupported(),
		webSocket: isWebSocketSupported(),
	};

	logger.log("Browser support detected:", support);

	return support;
}

/** Cached result of {@link detectSupport}, evaluated once at module load. */
export const supports: BrowserSupport = detectSupport();
