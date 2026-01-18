import { describe, expect, it } from "vitest";
import {
	ConduitErrorType,
	ConnectionType,
	MessageType,
	SerializationType,
	ServerErrorType,
	SocketEventType,
	TransportType,
} from "../src/index.js";

describe("MessageType", () => {
	it("should have all signaling message types", () => {
		expect(MessageType.OPEN).toBe("OPEN");
		expect(MessageType.LEAVE).toBe("LEAVE");
		expect(MessageType.CANDIDATE).toBe("CANDIDATE");
		expect(MessageType.OFFER).toBe("OFFER");
		expect(MessageType.ANSWER).toBe("ANSWER");
		expect(MessageType.EXPIRE).toBe("EXPIRE");
		expect(MessageType.HEARTBEAT).toBe("HEARTBEAT");
		expect(MessageType.ID_TAKEN).toBe("ID-TAKEN");
		expect(MessageType.ERROR).toBe("ERROR");
	});

	it("should have WebSocket relay message types", () => {
		expect(MessageType.RELAY).toBe("RELAY");
		expect(MessageType.RELAY_OPEN).toBe("RELAY_OPEN");
		expect(MessageType.RELAY_CLOSE).toBe("RELAY_CLOSE");
	});

	it("should have server lifecycle message types", () => {
		expect(MessageType.GOAWAY).toBe("GOAWAY");
	});

	it("should have correct number of message types", () => {
		const types = Object.values(MessageType);
		expect(types).toHaveLength(13);
	});
});

describe("ConnectionType", () => {
	it("should have data connection type", () => {
		expect(ConnectionType.Data).toBe("data");
	});

	it("should have media connection type", () => {
		expect(ConnectionType.Media).toBe("media");
	});

	it("should have exactly 2 connection types", () => {
		const types = Object.values(ConnectionType);
		expect(types).toHaveLength(2);
	});
});

describe("SerializationType", () => {
	it("should have binary serialization type", () => {
		expect(SerializationType.Binary).toBe("binary");
	});

	it("should have binary UTF-8 serialization type", () => {
		expect(SerializationType.BinaryUTF8).toBe("binary-utf8");
	});

	it("should have JSON serialization type", () => {
		expect(SerializationType.JSON).toBe("json");
	});

	it("should have raw (none) serialization type", () => {
		expect(SerializationType.None).toBe("raw");
	});

	it("should have MessagePack serialization type", () => {
		expect(SerializationType.MsgPack).toBe("msgpack");
	});

	it("should have exactly 5 serialization types", () => {
		const types = Object.values(SerializationType);
		expect(types).toHaveLength(5);
	});
});

describe("TransportType", () => {
	it("should have WebRTC transport type", () => {
		expect(TransportType.WebRTC).toBe("webrtc");
	});

	it("should have WebSocket transport type", () => {
		expect(TransportType.WebSocket).toBe("websocket");
	});

	it("should have Auto transport type", () => {
		expect(TransportType.Auto).toBe("auto");
	});

	it("should have exactly 3 transport types", () => {
		const types = Object.values(TransportType);
		expect(types).toHaveLength(3);
	});
});

describe("ConduitErrorType", () => {
	it("should have browser incompatible error", () => {
		expect(ConduitErrorType.BrowserIncompatible).toBe("browser-incompatible");
	});

	it("should have disconnected error", () => {
		expect(ConduitErrorType.Disconnected).toBe("disconnected");
	});

	it("should have invalid key error", () => {
		expect(ConduitErrorType.InvalidKey).toBe("invalid-key");
	});

	it("should have invalid ID error", () => {
		expect(ConduitErrorType.InvalidID).toBe("invalid-id");
	});

	it("should have network error", () => {
		expect(ConduitErrorType.Network).toBe("network");
	});

	it("should have conduit unavailable error", () => {
		expect(ConduitErrorType.ConduitUnavailable).toBe("conduit-unavailable");
	});

	it("should have SSL unavailable error", () => {
		expect(ConduitErrorType.SslUnavailable).toBe("ssl-unavailable");
	});

	it("should have server error", () => {
		expect(ConduitErrorType.ServerError).toBe("server-error");
	});

	it("should have socket error", () => {
		expect(ConduitErrorType.SocketError).toBe("socket-error");
	});

	it("should have socket closed error", () => {
		expect(ConduitErrorType.SocketClosed).toBe("socket-closed");
	});

	it("should have unavailable ID error", () => {
		expect(ConduitErrorType.UnavailableID).toBe("unavailable-id");
	});

	it("should have WebRTC error", () => {
		expect(ConduitErrorType.WebRTC).toBe("webrtc");
	});

	it("should have exactly 12 error types", () => {
		const types = Object.values(ConduitErrorType);
		expect(types).toHaveLength(12);
	});
});

describe("ServerErrorType", () => {
	it("should have invalid WS parameters error", () => {
		expect(ServerErrorType.InvalidWSParameters).toBe("Invalid WS parameters");
	});

	it("should have connection limit exceeded error", () => {
		expect(ServerErrorType.ConnectionLimitExceed).toBe("Connection limit exceeded");
	});

	it("should have invalid key error", () => {
		expect(ServerErrorType.InvalidKey).toBe("Invalid key");
	});

	it("should have exactly 3 server error types", () => {
		const types = Object.values(ServerErrorType);
		expect(types).toHaveLength(3);
	});
});

describe("SocketEventType", () => {
	it("should have message event", () => {
		expect(SocketEventType.Message).toBe("message");
	});

	it("should have disconnected event", () => {
		expect(SocketEventType.Disconnected).toBe("disconnected");
	});

	it("should have error event", () => {
		expect(SocketEventType.Error).toBe("error");
	});

	it("should have close event", () => {
		expect(SocketEventType.Close).toBe("close");
	});

	it("should have exactly 4 socket event types", () => {
		const types = Object.values(SocketEventType);
		expect(types).toHaveLength(4);
	});
});
