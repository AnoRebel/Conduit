import { ConduitErrorType, SerializationType, TransportType, MessageType } from "@conduit/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogLevel, logger, Conduit, ConduitError, util } from "../src/index.js";

// Mock WebSocket
class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	readyState = MockWebSocket.CONNECTING;
	onopen: (() => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	binaryType = "arraybuffer";

	constructor(public url: string) {
		// Simulate async connection
		setTimeout(() => {
			this.readyState = MockWebSocket.OPEN;
			this.onopen?.();
		}, 10);
	}

	send = vi.fn();
	close = vi.fn(() => {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.();
	});
}

// Mock RTCPeerConnection
class MockRTCPeerConnection {
	localDescription: RTCSessionDescription | null = null;
	remoteDescription: RTCSessionDescription | null = null;
	signalingState = "stable";
	iceConnectionState = "new";
	connectionState = "new";

	onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
	oniceconnectionstatechange: (() => void) | null = null;
	onsignalingstatechange: (() => void) | null = null;
	onnegotiationneeded: (() => void) | null = null;
	ontrack: ((event: RTCTrackEvent) => void) | null = null;
	ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;

	constructor(public config?: RTCConfiguration) {}

	createDataChannel = vi.fn(() => ({
		label: "test",
		readyState: "connecting",
		binaryType: "arraybuffer",
		onopen: null,
		onclose: null,
		onerror: null,
		onmessage: null,
		send: vi.fn(),
		close: vi.fn(),
	}));

	createOffer = vi.fn(() => Promise.resolve({ type: "offer", sdp: "test-sdp" }));
	createAnswer = vi.fn(() => Promise.resolve({ type: "answer", sdp: "test-sdp" }));
	setLocalDescription = vi.fn(() => {
		this.localDescription = { type: "offer", sdp: "test-sdp" } as RTCSessionDescription;
		return Promise.resolve();
	});
	setRemoteDescription = vi.fn(() => Promise.resolve());
	addIceCandidate = vi.fn(() => Promise.resolve());
	addTrack = vi.fn();
	getSenders = vi.fn(() => []);
	getStats = vi.fn(() => Promise.resolve(new Map()));
	close = vi.fn(() => {
		this.connectionState = "closed";
	});
}

describe("Conduit", () => {
	beforeEach(() => {
		// Setup mocks - add static properties to WebSocket global
		const WebSocketMock = MockWebSocket as unknown as typeof WebSocket;
		vi.stubGlobal("WebSocket", WebSocketMock);
		vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
		vi.stubGlobal(
			"RTCSessionDescription",
			class {
				constructor(public description: RTCSessionDescriptionInit) {}
			}
		);
		vi.stubGlobal(
			"RTCIceCandidate",
			class {
				constructor(public candidate: RTCIceCandidateInit) {}
			}
		);

		// Mock fetch for API calls
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					text: () => Promise.resolve("test-id"),
					json: () => Promise.resolve(["peer1", "peer2"]),
				})
			)
		);

		// Disable logging during tests
		logger.logLevel = LogLevel.Disabled;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("should create a conduit with default options", () => {
			const conduit = new Conduit();
			expect(conduit.destroyed).toBe(false);
			expect(conduit.disconnected).toBe(false);
		});

		it("should create a conduit with a custom ID", () => {
			const conduit = new Conduit("my-custom-id");
			expect(conduit.id).toBe("my-custom-id");
		});

		it("should create a conduit with custom options", () => {
			const conduit = new Conduit({
				host: "custom-host.com",
				port: 8080,
				secure: false,
			});
			expect(conduit.options.host).toBe("custom-host.com");
			expect(conduit.options.port).toBe(8080);
			expect(conduit.options.secure).toBe(false);
		});

		it("should accept both ID and options", () => {
			const conduit = new Conduit("my-id", { host: "example.com" });
			expect(conduit.id).toBe("my-id");
			expect(conduit.options.host).toBe("example.com");
		});

		it("should use default cloud host when not specified", () => {
			const conduit = new Conduit();
			expect(conduit.options.host).toBe("conduit.anorebel.net");
			expect(conduit.options.port).toBe(443);
			expect(conduit.options.secure).toBe(true);
		});
	});

	describe("destroy", () => {
		it("should mark conduit as destroyed", () => {
			const conduit = new Conduit("test-conduit");
			conduit.destroy();
			expect(conduit.destroyed).toBe(true);
		});

		it("should emit close event on destroy", () => {
			const conduit = new Conduit("test-conduit");
			const closeHandler = vi.fn();
			conduit.on("close", closeHandler);

			conduit.destroy();

			expect(closeHandler).toHaveBeenCalled();
		});

		it("should not allow connect after destroy", () => {
			const conduit = new Conduit("test-conduit");
			conduit.destroy();

			expect(() => conduit.connect("other-peer")).toThrow();
		});

		it("should not allow call after destroy", () => {
			const conduit = new Conduit("test-conduit");
			conduit.destroy();

			const mockStream = {} as MediaStream;
			expect(() => conduit.call("other-peer", mockStream)).toThrow();
		});
	});

	describe("disconnect/reconnect", () => {
		it("should mark conduit as disconnected", () => {
			const conduit = new Conduit("test-conduit");
			conduit.disconnect();
			expect(conduit.disconnected).toBe(true);
		});

		it("should emit disconnected event", () => {
			const conduit = new Conduit("test-conduit");
			const handler = vi.fn();
			conduit.on("disconnected", handler);

			conduit.disconnect();

			expect(handler).toHaveBeenCalled();
		});

		it("should not disconnect twice", () => {
			const conduit = new Conduit("test-conduit");
			const handler = vi.fn();
			conduit.on("disconnected", handler);

			conduit.disconnect();
			conduit.disconnect();

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("connect", () => {
		it("should throw error for empty peer ID", () => {
			const conduit = new Conduit("test-conduit");
			expect(() => conduit.connect("")).toThrow();
		});

		it("should create a data connection", () => {
			const conduit = new Conduit("test-conduit");
			const connection = conduit.connect("other-peer");

			expect(connection).toBeDefined();
			expect(connection.remote).toBe("other-peer");
		});

		it("should accept connection options", () => {
			const conduit = new Conduit("test-conduit");
			const connection = conduit.connect("other-peer", {
				label: "custom-label",
				metadata: { foo: "bar" },
				serialization: SerializationType.JSON,
			});

			expect(connection.label).toBe("custom-label");
			expect(connection.metadata).toEqual({ foo: "bar" });
		});
	});

	describe("connections", () => {
		it("should track connections map", () => {
			const conduit = new Conduit("test-conduit");
			expect(conduit.connections).toBeInstanceOf(Map);
			expect(conduit.connections.size).toBe(0);
		});

		it("should add connections to the map", () => {
			const conduit = new Conduit("test-conduit");
			conduit.connect("other-peer");

			expect(conduit.connections.size).toBe(1);
			expect(conduit.connections.has("other-peer")).toBe(true);
		});
	});
});

describe("ConduitError", () => {
	it("should create error with type and message", () => {
		const error = new ConduitError(ConduitErrorType.Network, "Connection failed");
		expect(error.type).toBe(ConduitErrorType.Network);
		expect(error.message).toBe("Connection failed");
		expect(error.name).toBe("ConduitError");
	});

	it("should be an instance of Error", () => {
		const error = new ConduitError(ConduitErrorType.ServerError, "Server error");
		expect(error).toBeInstanceOf(Error);
	});

	it("should have all error types", () => {
		expect(ConduitErrorType.BrowserIncompatible).toBe("browser-incompatible");
		expect(ConduitErrorType.Disconnected).toBe("disconnected");
		expect(ConduitErrorType.InvalidKey).toBe("invalid-key");
		expect(ConduitErrorType.InvalidID).toBe("invalid-id");
		expect(ConduitErrorType.Network).toBe("network");
		expect(ConduitErrorType.ConduitUnavailable).toBe("conduit-unavailable");
		expect(ConduitErrorType.SslUnavailable).toBe("ssl-unavailable");
		expect(ConduitErrorType.ServerError).toBe("server-error");
		expect(ConduitErrorType.SocketError).toBe("socket-error");
		expect(ConduitErrorType.SocketClosed).toBe("socket-closed");
		expect(ConduitErrorType.UnavailableID).toBe("unavailable-id");
		expect(ConduitErrorType.WebRTC).toBe("webrtc");
	});
});

describe("util", () => {
	it("should validate peer IDs", () => {
		expect(util.validateId("valid-id")).toBe(true);
		expect(util.validateId("valid_id")).toBe(true);
		expect(util.validateId("ValidId123")).toBe(true);
		expect(util.validateId("")).toBe(false); // Empty is invalid (security fix)
		expect(util.validateId("invalid id")).toBe(false); // Spaces not allowed
		expect(util.validateId("invalid.id")).toBe(false); // Dots not allowed
		expect(util.validateId("invalid@id")).toBe(false); // @ not allowed
		expect(util.validateId("invalid#id")).toBe(false); // # not allowed
		// Max length check (64 chars)
		expect(util.validateId("a".repeat(64))).toBe(true);
		expect(util.validateId("a".repeat(65))).toBe(false);
	});

	it("should generate random tokens", () => {
		const token1 = util.randomToken();
		const token2 = util.randomToken();
		expect(token1).not.toBe(token2);
		expect(typeof token1).toBe("string");
		expect(token1.length).toBeGreaterThan(0);
	});

	it("should detect secure connections", () => {
		// In test environment, location might not be defined
		const result = util.isSecure();
		expect(typeof result).toBe("boolean");
	});

	it("should have default config with ICE servers", () => {
		expect(util.defaultConfig).toBeDefined();
		expect(util.defaultConfig.iceServers).toBeDefined();
		expect(Array.isArray(util.defaultConfig.iceServers)).toBe(true);
		expect(util.defaultConfig.iceServers!.length).toBeGreaterThan(0);
	});

	it("should have version info", () => {
		expect(util.version).toBeDefined();
		expect(typeof util.version).toBe("string");
	});

	it("should chunk blobs correctly", () => {
		const data = new Uint8Array(50000).fill(1);
		const blob = new Blob([data]);
		const chunks = util.chunk(blob);

		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks[0].__peerData).toBeDefined();
		expect(chunks[0].n).toBe(0);
		expect(chunks[0].total).toBe(chunks.length);
	});
});

describe("supports", () => {
	it("should export browser support info", async () => {
		const { supports } = await import("../src/supports.js");
		expect(typeof supports.browser).toBe("boolean");
		expect(typeof supports.webRTC).toBe("boolean");
		expect(typeof supports.webSocket).toBe("boolean");
	});
});

describe("TransportType", () => {
	it("should have correct transport types", () => {
		expect(TransportType.WebRTC).toBe("webrtc");
		expect(TransportType.WebSocket).toBe("websocket");
		expect(TransportType.Auto).toBe("auto");
	});
});

describe("SerializationType", () => {
	it("should have correct serialization types", () => {
		expect(SerializationType.Binary).toBe("binary");
		expect(SerializationType.BinaryUTF8).toBe("binary-utf8");
		expect(SerializationType.JSON).toBe("json");
		expect(SerializationType.MsgPack).toBe("msgpack");
		expect(SerializationType.None).toBe("raw");
	});
});

describe("MessageType", () => {
	it("should have correct message types", () => {
		expect(MessageType.OPEN).toBe("OPEN");
		expect(MessageType.LEAVE).toBe("LEAVE");
		expect(MessageType.CANDIDATE).toBe("CANDIDATE");
		expect(MessageType.OFFER).toBe("OFFER");
		expect(MessageType.ANSWER).toBe("ANSWER");
		expect(MessageType.EXPIRE).toBe("EXPIRE");
		expect(MessageType.HEARTBEAT).toBe("HEARTBEAT");
		expect(MessageType.ID_TAKEN).toBe("ID-TAKEN");
		expect(MessageType.ERROR).toBe("ERROR");
		expect(MessageType.RELAY).toBe("RELAY");
		expect(MessageType.RELAY_OPEN).toBe("RELAY_OPEN");
		expect(MessageType.RELAY_CLOSE).toBe("RELAY_CLOSE");
	});
});

describe("Logger", () => {
	it("should have log levels", () => {
		expect(LogLevel.Disabled).toBe(0);
		expect(LogLevel.Errors).toBe(1);
		expect(LogLevel.Warnings).toBe(2);
		expect(LogLevel.All).toBe(3);
	});

	it("should allow setting log level", () => {
		logger.logLevel = LogLevel.All;
		expect(logger.logLevel).toBe(LogLevel.All);

		logger.logLevel = LogLevel.Disabled;
		expect(logger.logLevel).toBe(LogLevel.Disabled);
	});
});
