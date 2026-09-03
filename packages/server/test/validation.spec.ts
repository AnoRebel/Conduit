import { MessageType } from "@conduit/shared";
import { describe, expect, it } from "vitest";
import {
	MAX_ID_LENGTH,
	MAX_KEY_LENGTH,
	MAX_MESSAGE_SIZE,
	MAX_PAYLOAD_DEPTH,
	MAX_ROOM_NAME_LENGTH,
	MAX_TOKEN_LENGTH,
	MAX_TOPIC_NAME_LENGTH,
	MAX_TOPIC_SEGMENTS,
	safeJsonParse,
	validateId,
	validateKey,
	validateMessage,
	validatePayloadDestination,
	validateRoomName,
	validateToken,
	validateTopicName,
	validateTopicPattern,
} from "../src/core/validation.js";

describe("Constants", () => {
	it("should have correct max lengths", () => {
		expect(MAX_ID_LENGTH).toBe(64);
		expect(MAX_TOKEN_LENGTH).toBe(64);
		expect(MAX_KEY_LENGTH).toBe(64);
		expect(MAX_MESSAGE_SIZE).toBe(64 * 1024); // 64KB
		expect(MAX_PAYLOAD_DEPTH).toBe(10);
	});
});

describe("validateId", () => {
	it("should accept valid alphanumeric IDs", () => {
		expect(validateId("abc123").valid).toBe(true);
		expect(validateId("ABC123").valid).toBe(true);
		expect(validateId("test").valid).toBe(true);
	});

	it("should accept IDs with underscores and hyphens", () => {
		expect(validateId("test_id").valid).toBe(true);
		expect(validateId("test-id").valid).toBe(true);
		expect(validateId("test_id-123").valid).toBe(true);
	});

	it("should reject non-string values", () => {
		expect(validateId(123).valid).toBe(false);
		expect(validateId(123).error).toBe("ID must be a string");
		expect(validateId(null).valid).toBe(false);
		expect(validateId(undefined).valid).toBe(false);
		expect(validateId({}).valid).toBe(false);
	});

	it("should reject empty strings", () => {
		expect(validateId("").valid).toBe(false);
		expect(validateId("").error).toBe("ID cannot be empty");
		expect(validateId("   ").valid).toBe(false);
	});

	it("should reject IDs exceeding max length", () => {
		const longId = "a".repeat(65);
		const result = validateId(longId);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("exceeds maximum length");
	});

	it("should accept IDs at max length", () => {
		const maxId = "a".repeat(64);
		expect(validateId(maxId).valid).toBe(true);
	});

	it("should reject IDs with invalid characters", () => {
		expect(validateId("test id").valid).toBe(false); // Space
		expect(validateId("test.id").valid).toBe(false); // Dot
		expect(validateId("test@id").valid).toBe(false); // @
		expect(validateId("test#id").valid).toBe(false); // #
		expect(validateId("test$id").valid).toBe(false); // $
		expect(validateId("test!id").valid).toBe(false); // !
	});
});

describe("validateToken", () => {
	it("should accept valid tokens", () => {
		expect(validateToken("abc123").valid).toBe(true);
		expect(validateToken("ABC123").valid).toBe(true);
		expect(validateToken("test_token").valid).toBe(true);
		expect(validateToken("test-token").valid).toBe(true);
	});

	it("should accept tokens with equals signs (base64)", () => {
		expect(validateToken("abc123==").valid).toBe(true);
		expect(validateToken("token=").valid).toBe(true);
	});

	it("should reject non-string values", () => {
		expect(validateToken(123).valid).toBe(false);
		expect(validateToken(123).error).toBe("Token must be a string");
	});

	it("should reject empty strings", () => {
		expect(validateToken("").valid).toBe(false);
		expect(validateToken("").error).toBe("Token cannot be empty");
	});

	it("should reject tokens exceeding max length", () => {
		const longToken = "a".repeat(65);
		const result = validateToken(longToken);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("exceeds maximum length");
	});

	it("should accept tokens at max length", () => {
		const maxToken = "a".repeat(64);
		expect(validateToken(maxToken).valid).toBe(true);
	});
});

describe("validateKey", () => {
	it("should accept valid keys", () => {
		expect(validateKey("conduit").valid).toBe(true);
		expect(validateKey("my-api-key").valid).toBe(true);
		expect(validateKey("my_api_key").valid).toBe(true);
		expect(validateKey("ApiKey123").valid).toBe(true);
	});

	it("should reject non-string values", () => {
		expect(validateKey(123).valid).toBe(false);
		expect(validateKey(123).error).toBe("Key must be a string");
	});

	it("should reject empty strings", () => {
		expect(validateKey("").valid).toBe(false);
		expect(validateKey("").error).toBe("Key cannot be empty");
	});

	it("should reject keys exceeding max length", () => {
		const longKey = "a".repeat(65);
		const result = validateKey(longKey);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("exceeds maximum length");
	});
});

describe("validateMessage", () => {
	it("should accept valid messages", () => {
		expect(validateMessage({ type: MessageType.OPEN }).valid).toBe(true);
		expect(validateMessage({ type: MessageType.OFFER, src: "peer1", dst: "peer2" }).valid).toBe(
			true
		);
	});

	it("should reject non-object messages", () => {
		expect(validateMessage("not an object").valid).toBe(false);
		expect(validateMessage(123).valid).toBe(false);
		expect(validateMessage(null).valid).toBe(false);
		expect(validateMessage(undefined).valid).toBe(false);
	});

	it("should reject messages without type", () => {
		const result = validateMessage({ src: "peer1" });
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Message must have a type field");
	});

	it("should reject messages with non-string type", () => {
		const result = validateMessage({ type: 123 });
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Message type must be a string");
	});

	it("should reject messages with unknown type", () => {
		const result = validateMessage({ type: "UNKNOWN_TYPE" });
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Unknown message type");
	});

	it("should accept all valid message types", () => {
		const validTypes = [
			MessageType.OPEN,
			MessageType.LEAVE,
			MessageType.CANDIDATE,
			MessageType.OFFER,
			MessageType.ANSWER,
			MessageType.EXPIRE,
			MessageType.HEARTBEAT,
			MessageType.ID_TAKEN,
			MessageType.ERROR,
			MessageType.RELAY,
			MessageType.RELAY_OPEN,
			MessageType.RELAY_CLOSE,
			MessageType.GOAWAY,
		];

		for (const type of validTypes) {
			expect(validateMessage({ type }).valid).toBe(true);
		}
	});

	it("should reject deeply nested payloads", () => {
		// Create deeply nested object
		let nested: Record<string, unknown> = { value: "deep" };
		for (let i = 0; i < 15; i++) {
			nested = { nested };
		}

		const result = validateMessage({ type: MessageType.OFFER, payload: nested });
		expect(result.valid).toBe(false);
		expect(result.error).toContain("exceeds maximum nesting depth");
	});

	it("should accept payloads within depth limit", () => {
		let nested: Record<string, unknown> = { value: "ok" };
		for (let i = 0; i < 8; i++) {
			nested = { nested };
		}

		const result = validateMessage({ type: MessageType.OFFER, payload: nested });
		expect(result.valid).toBe(true);
	});

	it("should handle arrays in depth calculation", () => {
		const payload = {
			items: [{ nested: { deeper: [{ deepest: "value" }] } }],
		};

		const result = validateMessage({ type: MessageType.OFFER, payload });
		expect(result.valid).toBe(true);
	});
});

describe("validatePayloadDestination", () => {
	it("should accept valid destination", () => {
		expect(validatePayloadDestination({ dst: "peer1" }).valid).toBe(true);
	});

	it("should reject non-object payload", () => {
		expect(validatePayloadDestination("not object").valid).toBe(false);
		expect(validatePayloadDestination(null).valid).toBe(false);
	});

	it("should reject payload without destination", () => {
		const result = validatePayloadDestination({ src: "peer1" });
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Payload must have a destination (dst)");
	});

	it("should validate destination ID format", () => {
		expect(validatePayloadDestination({ dst: "valid-id" }).valid).toBe(true);
		expect(validatePayloadDestination({ dst: "" }).valid).toBe(false);
		expect(validatePayloadDestination({ dst: "a".repeat(65) }).valid).toBe(false);
	});
});

describe("safeJsonParse", () => {
	it("should parse valid JSON", () => {
		const result = safeJsonParse('{"key": "value"}');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({ key: "value" });
		}
	});

	it("should parse arrays", () => {
		const result = safeJsonParse("[1, 2, 3]");
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual([1, 2, 3]);
		}
	});

	it("should parse primitive values", () => {
		expect(safeJsonParse("123").success).toBe(true);
		expect(safeJsonParse('"string"').success).toBe(true);
		expect(safeJsonParse("true").success).toBe(true);
		expect(safeJsonParse("null").success).toBe(true);
	});

	it("should reject invalid JSON", () => {
		const result = safeJsonParse("not valid json");
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("Invalid JSON");
		}
	});

	it("should reject oversized messages with default limit", () => {
		const largeJson = JSON.stringify({ data: "x".repeat(70000) });
		const result = safeJsonParse(largeJson);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("exceeds maximum size");
		}
	});

	it("should reject oversized messages with custom limit", () => {
		const result = safeJsonParse('{"key": "value"}', 5);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("exceeds maximum size");
		}
	});

	it("should accept messages within size limit", () => {
		const json = '{"key": "value"}';
		const result = safeJsonParse(json, 1000);
		expect(result.success).toBe(true);
	});
});

describe("validateRoomName", () => {
	it("should accept well-formed room names", () => {
		expect(validateRoomName("lobby").valid).toBe(true);
		expect(validateRoomName("team-standup").valid).toBe(true);
		expect(validateRoomName("org:acme.room_1").valid).toBe(true);
		expect(validateRoomName("a").valid).toBe(true);
	});

	it("should reject non-strings", () => {
		expect(validateRoomName(undefined).valid).toBe(false);
		expect(validateRoomName(null).valid).toBe(false);
		expect(validateRoomName(42).valid).toBe(false);
		expect(validateRoomName({}).valid).toBe(false);
	});

	it("should reject empty and whitespace-only names", () => {
		expect(validateRoomName("").valid).toBe(false);
		expect(validateRoomName("   ").valid).toBe(false);
	});

	it("should reject names over the maximum length", () => {
		const tooLong = "a".repeat(MAX_ROOM_NAME_LENGTH + 1);
		const result = validateRoomName(tooLong);
		expect(result.valid).toBe(false);
		expect(result.error).toContain(String(MAX_ROOM_NAME_LENGTH));
	});

	it("should accept a name exactly at the maximum length", () => {
		expect(validateRoomName("a".repeat(MAX_ROOM_NAME_LENGTH)).valid).toBe(true);
	});

	it("should reject characters outside the allowlist", () => {
		// Path separators, wildcards, whitespace, and control characters must not
		// be admitted: a room name is an opaque capability, not a path.
		expect(validateRoomName("room/../etc").valid).toBe(false);
		expect(validateRoomName("room name").valid).toBe(false);
		expect(validateRoomName("room*").valid).toBe(false);
		expect(validateRoomName("room\n").valid).toBe(false);
		expect(validateRoomName("room#1").valid).toBe(false);
		expect(validateRoomName("rööm").valid).toBe(false);
	});
});

describe("validateTopicName", () => {
	it("should accept well-formed topic names", () => {
		expect(validateTopicName("chat").valid).toBe(true);
		expect(validateTopicName("chat.general").valid).toBe(true);
		expect(validateTopicName("a.b.c.d").valid).toBe(true);
	});

	it("should reject a wildcard in a published topic", () => {
		// Publishing is always to a literal topic; a wildcard here would let a
		// publisher address an entire namespace at once.
		expect(validateTopicName("chat.*").valid).toBe(false);
		expect(validateTopicName("*").valid).toBe(false);
	});

	it("should reject empty segments", () => {
		expect(validateTopicName("chat..general").valid).toBe(false);
		expect(validateTopicName(".chat").valid).toBe(false);
		expect(validateTopicName("chat.").valid).toBe(false);
	});

	it("should reject names over the maximum length", () => {
		const result = validateTopicName("a".repeat(MAX_TOPIC_NAME_LENGTH + 1));
		expect(result.valid).toBe(false);
		expect(result.error).toContain(String(MAX_TOPIC_NAME_LENGTH));
	});

	it("should reject excessive namespace depth", () => {
		const tooDeep = Array.from({ length: MAX_TOPIC_SEGMENTS + 1 }, () => "a").join(".");
		const result = validateTopicName(tooDeep);
		expect(result.valid).toBe(false);
		expect(result.error).toContain(String(MAX_TOPIC_SEGMENTS));
	});

	it("should accept a topic exactly at the segment limit", () => {
		const atLimit = Array.from({ length: MAX_TOPIC_SEGMENTS }, () => "a").join(".");
		expect(validateTopicName(atLimit).valid).toBe(true);
	});

	it("should reject non-strings and invalid characters", () => {
		expect(validateTopicName(null).valid).toBe(false);
		expect(validateTopicName("chat general").valid).toBe(false);
		expect(validateTopicName("chat/general").valid).toBe(false);
	});
});

describe("validateTopicPattern", () => {
	it("should accept an exact topic name", () => {
		expect(validateTopicPattern("chat.general").valid).toBe(true);
	});

	it("should accept a single trailing prefix wildcard", () => {
		expect(validateTopicPattern("chat.*").valid).toBe(true);
		expect(validateTopicPattern("a.b.c.*").valid).toBe(true);
	});

	it("should reject unsupported wildcard forms", () => {
		// Only a trailing `.*` is supported. Mid-pattern and multi-level
		// wildcards would make resolution scale with total subscription count.
		expect(validateTopicPattern("chat.*.urgent").valid).toBe(false);
		expect(validateTopicPattern("*.general").valid).toBe(false);
		expect(validateTopicPattern("chat.**").valid).toBe(false);
		expect(validateTopicPattern("chat.*.*").valid).toBe(false);
		expect(validateTopicPattern("*").valid).toBe(false);
		expect(validateTopicPattern("chat*").valid).toBe(false);
	});

	it("should reject an empty literal prefix before the wildcard", () => {
		expect(validateTopicPattern(".*").valid).toBe(false);
	});

	it("should enforce length and depth on the literal prefix", () => {
		expect(validateTopicPattern("a".repeat(MAX_TOPIC_NAME_LENGTH + 1)).valid).toBe(false);
		const tooDeep = `${Array.from({ length: MAX_TOPIC_SEGMENTS + 1 }, () => "a").join(".")}.*`;
		expect(validateTopicPattern(tooDeep).valid).toBe(false);
	});

	it("should reject non-strings and empty patterns", () => {
		expect(validateTopicPattern(undefined).valid).toBe(false);
		expect(validateTopicPattern("").valid).toBe(false);
		expect(validateTopicPattern("   ").valid).toBe(false);
	});
});
