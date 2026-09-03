import { describe, expect, it } from "vitest";
import type {
	IAnswerPayload,
	IBrowserSupport,
	ICandidatePayload,
	IClientInfo,
	IConduitConfig,
	IDataConnectionOptions,
	IErrorPayload,
	IMediaConnectionOptions,
	IMessage,
	IOfferPayload,
	IPublishPayload,
	IRelayPayload,
	IRoomBroadcastPayload,
	IServerConfig,
	IServerMessage,
	PartialServerConfig,
	PayloadOf,
	TypedMessage,
} from "../src/index.js";
import {
	ConduitErrorType,
	ConnectionType,
	MessageType,
	SerializationType,
	TransportType,
} from "../src/index.js";

describe("IMessage", () => {
	it("should accept valid message structure", () => {
		const message: IMessage = {
			type: MessageType.OPEN,
		};
		expect(message.type).toBe(MessageType.OPEN);
	});

	it("should accept message with all optional fields", () => {
		const message: IMessage = {
			type: MessageType.OFFER,
			src: "peer1",
			dst: "peer2",
			payload: { data: "test" },
		};
		expect(message.type).toBe(MessageType.OFFER);
		expect(message.src).toBe("peer1");
		expect(message.dst).toBe("peer2");
		expect(message.payload).toEqual({ data: "test" });
	});
});

describe("IServerMessage", () => {
	it("should require source field", () => {
		const message: IServerMessage = {
			type: MessageType.OPEN,
			src: "server",
		};
		expect(message.src).toBe("server");
	});

	it("should accept optional destination", () => {
		const message: IServerMessage = {
			type: MessageType.ANSWER,
			src: "peer1",
			dst: "peer2",
		};
		expect(message.dst).toBe("peer2");
	});
});

describe("IClientInfo", () => {
	it("should have id and token", () => {
		const client: IClientInfo = {
			id: "client-123",
			token: "token-abc",
		};
		expect(client.id).toBe("client-123");
		expect(client.token).toBe("token-abc");
	});
});

describe("IConduitConfig", () => {
	it("should allow empty config (all optional)", () => {
		const config: IConduitConfig = {};
		expect(config.host).toBeUndefined();
	});

	it("should accept all configuration options", () => {
		const config: IConduitConfig = {
			host: "localhost",
			port: 9000,
			path: "/",
			key: "test-key",
			token: "test-token",
			secure: true,
			pingInterval: 5000,
			debug: 3,
			config: { iceServers: [] },
			referrerPolicy: "no-referrer",
		};
		expect(config.host).toBe("localhost");
		expect(config.port).toBe(9000);
		expect(config.secure).toBe(true);
	});
});

describe("IDataConnectionOptions", () => {
	it("should allow empty options (all optional)", () => {
		const options: IDataConnectionOptions = {};
		expect(options.label).toBeUndefined();
	});

	it("should accept all data connection options", () => {
		const options: IDataConnectionOptions = {
			connectionId: "conn-123",
			label: "my-channel",
			serialization: SerializationType.JSON,
			reliable: true,
			metadata: { foo: "bar" },
			transport: TransportType.Auto,
			fallbackTimeout: 5000,
			sdpTransform: sdp => sdp,
		};
		expect(options.label).toBe("my-channel");
		expect(options.serialization).toBe(SerializationType.JSON);
		expect(options.transport).toBe(TransportType.Auto);
	});
});

describe("IMediaConnectionOptions", () => {
	it("should allow empty options (all optional)", () => {
		const options: IMediaConnectionOptions = {};
		expect(options.connectionId).toBeUndefined();
	});

	it("should accept all media connection options", () => {
		const options: IMediaConnectionOptions = {
			connectionId: "media-123",
			metadata: { callType: "video" },
			sdpTransform: sdp => sdp.replace("a=sendrecv", "a=sendonly"),
		};
		expect(options.connectionId).toBe("media-123");
		expect(options.metadata).toEqual({ callType: "video" });
	});
});

describe("IOfferPayload", () => {
	it("should have all required fields", () => {
		const payload: IOfferPayload = {
			sdp: { type: "offer", sdp: "v=0..." },
			type: ConnectionType.Data,
			connectionId: "conn-123",
		};
		expect(payload.type).toBe(ConnectionType.Data);
		expect(payload.connectionId).toBe("conn-123");
	});

	it("should accept optional fields", () => {
		const payload: IOfferPayload = {
			sdp: { type: "offer", sdp: "v=0..." },
			type: ConnectionType.Data,
			connectionId: "conn-123",
			metadata: { test: true },
			label: "test-label",
			serialization: SerializationType.Binary,
			reliable: true,
			transport: TransportType.WebRTC,
		};
		expect(payload.metadata).toEqual({ test: true });
		expect(payload.transport).toBe(TransportType.WebRTC);
	});
});

describe("IAnswerPayload", () => {
	it("should have all required fields", () => {
		const payload: IAnswerPayload = {
			sdp: { type: "answer", sdp: "v=0..." },
			type: ConnectionType.Data,
			connectionId: "conn-123",
		};
		expect(payload.type).toBe(ConnectionType.Data);
	});
});

describe("ICandidatePayload", () => {
	it("should have all required fields", () => {
		const payload: ICandidatePayload = {
			candidate: {
				candidate: "candidate:...",
				sdpMid: "0",
				sdpMLineIndex: 0,
			},
			type: ConnectionType.Data,
			connectionId: "conn-123",
		};
		expect(payload.connectionId).toBe("conn-123");
	});
});

describe("IRelayPayload", () => {
	it("should have connectionId and data", () => {
		const payload: IRelayPayload = {
			connectionId: "relay-123",
			data: { message: "hello" },
		};
		expect(payload.connectionId).toBe("relay-123");
		expect(payload.data).toEqual({ message: "hello" });
	});
});

describe("IErrorPayload", () => {
	it("should have type and message", () => {
		const payload: IErrorPayload = {
			type: ConduitErrorType.Network,
			message: "Connection failed",
		};
		expect(payload.type).toBe(ConduitErrorType.Network);
		expect(payload.message).toBe("Connection failed");
	});
});

describe("IServerConfig", () => {
	it("should have all required fields", () => {
		const config: IServerConfig = {
			host: "0.0.0.0",
			port: 9000,
			path: "/",
			key: "conduit",
			expireTimeout: 5000,
			aliveTimeout: 60000,
			concurrentLimit: 5000,
			allowDiscovery: false,
			proxied: false,
			cleanupOutMsgs: 1000,
			relay: {
				enabled: true,
				maxMessageSize: 65536,
			},
		};
		expect(config.port).toBe(9000);
		expect(config.relay.enabled).toBe(true);
	});

	it("should accept optional SSL config", () => {
		const config: IServerConfig = {
			host: "0.0.0.0",
			port: 443,
			path: "/",
			key: "conduit",
			expireTimeout: 5000,
			aliveTimeout: 60000,
			concurrentLimit: 5000,
			allowDiscovery: false,
			proxied: false,
			cleanupOutMsgs: 1000,
			ssl: {
				key: "/path/to/key.pem",
				cert: "/path/to/cert.pem",
			},
			relay: {
				enabled: true,
				maxMessageSize: 65536,
			},
		};
		expect(config.ssl?.key).toBe("/path/to/key.pem");
	});

	it("should accept relay rate limit config", () => {
		const config: IServerConfig = {
			host: "0.0.0.0",
			port: 9000,
			path: "/",
			key: "conduit",
			expireTimeout: 5000,
			aliveTimeout: 60000,
			concurrentLimit: 5000,
			allowDiscovery: false,
			proxied: false,
			cleanupOutMsgs: 1000,
			relay: {
				enabled: true,
				maxMessageSize: 65536,
				rateLimit: {
					windowMs: 1000,
					maxMessages: 100,
				},
			},
		};
		expect(config.relay.rateLimit?.maxMessages).toBe(100);
	});
});

describe("PartialServerConfig", () => {
	it("should allow partial configuration", () => {
		const config: PartialServerConfig = {
			port: 8080,
		};
		expect(config.port).toBe(8080);
		expect(config.host).toBeUndefined();
	});

	it("should allow empty configuration", () => {
		const config: PartialServerConfig = {};
		expect(Object.keys(config)).toHaveLength(0);
	});
});

describe("IBrowserSupport", () => {
	it("should have all support flags", () => {
		const support: IBrowserSupport = {
			webRTC: true,
			dataChannel: true,
			binaryDataChannel: true,
			mediaStream: true,
			streams: true,
			webSocket: true,
			crypto: true,
		};
		expect(support.webRTC).toBe(true);
		expect(support.dataChannel).toBe(true);
		expect(support.binaryDataChannel).toBe(true);
		expect(support.mediaStream).toBe(true);
		expect(support.streams).toBe(true);
		expect(support.webSocket).toBe(true);
		expect(support.crypto).toBe(true);
	});

	it("should indicate limited support", () => {
		const support: IBrowserSupport = {
			webRTC: true,
			dataChannel: true,
			binaryDataChannel: false,
			mediaStream: false,
			streams: false,
			webSocket: true,
			crypto: true,
		};
		expect(support.webRTC).toBe(true);
		expect(support.binaryDataChannel).toBe(false);
		expect(support.mediaStream).toBe(false);
	});
});

describe("TypedMessage union", () => {
	it("should narrow exhaustively over every message type", () => {
		// A switch that returns from every arm and assigns the fallthrough to
		// `never` fails to compile if a union member is unhandled, so this is a
		// compile-time exhaustiveness check as much as a runtime one.
		const describeMessage = (message: TypedMessage): string => {
			switch (message.type) {
				case MessageType.OPEN:
					return "open";
				case MessageType.LEAVE:
					return "leave";
				case MessageType.OFFER:
					return "offer";
				case MessageType.ANSWER:
					return "answer";
				case MessageType.CANDIDATE:
					return "candidate";
				case MessageType.HEARTBEAT:
					return "heartbeat";
				case MessageType.ERROR:
					return "error";
				case MessageType.EXPIRE:
					return "expire";
				case MessageType.ID_TAKEN:
					return "id-taken";
				case MessageType.RELAY:
					return "relay";
				case MessageType.RELAY_OPEN:
					return "relay-open";
				case MessageType.RELAY_CLOSE:
					return "relay-close";
				case MessageType.GOAWAY:
					return "goaway";
				case MessageType.JOIN:
					return `join:${message.payload.room}`;
				case MessageType.LEAVE_ROOM:
					return `leave-room:${message.payload.room}`;
				case MessageType.ROOM_STATE:
					return `room-state:${message.payload.members.length}`;
				case MessageType.PEER_JOINED:
					return `peer-joined:${message.payload.peerId}`;
				case MessageType.PEER_LEFT:
					return `peer-left:${message.payload.peerId}`;
				case MessageType.SUBSCRIBE:
					return `subscribe:${message.payload.topic}`;
				case MessageType.UNSUBSCRIBE:
					return `unsubscribe:${message.payload.topic}`;
				case MessageType.SUBSCRIBED:
					return `subscribed:${message.payload.topic}`;
				case MessageType.UNSUBSCRIBED:
					return `unsubscribed:${message.payload.topic}`;
				case MessageType.PUBLISH:
					return `publish:${message.payload.topic}`;
				case MessageType.TOPIC_MESSAGE:
					return `topic-message:${message.payload.topic}`;
				case MessageType.ROOM_BROADCAST:
					return `room-broadcast:${message.payload.room}`;
				default: {
					const unhandled: never = message;
					return unhandled;
				}
			}
		};

		expect(
			describeMessage({
				type: MessageType.JOIN,
				payload: { room: "lobby" },
			})
		).toBe("join:lobby");

		expect(
			describeMessage({
				type: MessageType.ROOM_STATE,
				dst: "peer-a",
				payload: { room: "lobby", members: ["peer-b", "peer-c"] },
			})
		).toBe("room-state:2");

		expect(
			describeMessage({
				type: MessageType.TOPIC_MESSAGE,
				src: "peer-a",
				dst: "peer-b",
				payload: { topic: "chat.general", data: "hi" },
			})
		).toBe("topic-message:chat.general");
	});

	it("should map each message type to its payload via PayloadOf", () => {
		const join: PayloadOf<typeof MessageType.JOIN> = { room: "lobby" };
		const publish: PayloadOf<typeof MessageType.PUBLISH> = {
			topic: "chat.general",
			data: { text: "hello" },
		};
		const broadcast: PayloadOf<typeof MessageType.ROOM_BROADCAST> = {
			room: "lobby",
			data: 42,
		};
		// Pre-existing mappings must keep resolving as they did before.
		const offer: PayloadOf<typeof MessageType.OFFER> = {
			sdp: { type: "offer", sdp: "v=0" },
			type: ConnectionType.Data,
			connectionId: "conn-1",
		};
		const heartbeat: PayloadOf<typeof MessageType.HEARTBEAT> = undefined;

		expect(join.room).toBe("lobby");
		expect(publish.topic).toBe("chat.general");
		expect(broadcast.room).toBe("lobby");
		expect(offer.connectionId).toBe("conn-1");
		expect(heartbeat).toBeUndefined();
	});

	it("should keep room and topic payloads structurally distinct", () => {
		// Room-addressed and topic-addressed payloads must not be interchangeable;
		// conflating them is how a room name would become a topic key.
		const roomPayload: IRoomBroadcastPayload = { room: "lobby", data: 1 };
		const topicPayload: IPublishPayload = { topic: "chat.general", data: 1 };

		expect("room" in roomPayload).toBe(true);
		expect("topic" in roomPayload).toBe(false);
		expect("topic" in topicPayload).toBe(true);
		expect("room" in topicPayload).toBe(false);
	});
});
