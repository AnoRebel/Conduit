import { MessageType } from "@conduit/shared";

/** Maximum allowed client ID length. */
export const MAX_ID_LENGTH = 64;
/** Maximum allowed connection token length. */
export const MAX_TOKEN_LENGTH = 64;
/** Maximum allowed API key length. */
export const MAX_KEY_LENGTH = 64;
/** Default maximum message size in bytes (64 KB). */
export const MAX_MESSAGE_SIZE = 64 * 1024;
/** Maximum allowed nesting depth for message payloads. */
export const MAX_PAYLOAD_DEPTH = 10;
/** Maximum allowed room name length. */
export const MAX_ROOM_NAME_LENGTH = 128;
/** Maximum allowed topic name length. */
export const MAX_TOPIC_NAME_LENGTH = 128;
/** Maximum number of dot-delimited segments in a topic name. */
export const MAX_TOPIC_SEGMENTS = 8;

// Validation patterns
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_=-]{1,64}$/;
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/**
 * Room names are opaque identifiers. The character set is deliberately an
 * allowlist: an unguessable room name acts as a capability under the default
 * open configuration, so the format must not admit anything that could be
 * interpreted specially elsewhere (path separators, wildcards, whitespace).
 */
const ROOM_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
/** A single topic segment. Excludes `.` so segments cannot be forged. */
const TOPIC_SEGMENT_PATTERN = /^[A-Za-z0-9_:-]+$/;

/** Result of a validation check — `valid: true` or `valid: false` with an error message. */
export interface ValidationResult {
	/** Whether validation passed. */
	valid: boolean;
	/** Human-readable error message when `valid` is `false`. */
	error?: string;
}

/**
 * Validate a client ID
 */
export function validateId(id: unknown): ValidationResult {
	if (typeof id !== "string") {
		return { valid: false, error: "ID must be a string" };
	}
	if (!id?.trim()) {
		return { valid: false, error: "ID cannot be empty" };
	}
	if (id.length > MAX_ID_LENGTH) {
		return { valid: false, error: `ID exceeds maximum length of ${MAX_ID_LENGTH}` };
	}
	if (!ID_PATTERN.test(id)) {
		return { valid: false, error: "ID contains invalid characters" };
	}
	return { valid: true };
}

/**
 * Validate a connection token
 */
export function validateToken(token: unknown): ValidationResult {
	if (typeof token !== "string") {
		return { valid: false, error: "Token must be a string" };
	}
	if (!token?.trim()) {
		return { valid: false, error: "Token cannot be empty" };
	}
	if (token.length > MAX_TOKEN_LENGTH) {
		return { valid: false, error: `Token exceeds maximum length of ${MAX_TOKEN_LENGTH}` };
	}
	if (!TOKEN_PATTERN.test(token)) {
		return { valid: false, error: "Token contains invalid characters" };
	}
	return { valid: true };
}

/**
 * Validate an API key
 */
export function validateKey(key: unknown): ValidationResult {
	if (typeof key !== "string") {
		return { valid: false, error: "Key must be a string" };
	}
	if (!key?.trim()) {
		return { valid: false, error: "Key cannot be empty" };
	}
	if (key.length > MAX_KEY_LENGTH) {
		return { valid: false, error: `Key exceeds maximum length of ${MAX_KEY_LENGTH}` };
	}
	if (!KEY_PATTERN.test(key)) {
		return { valid: false, error: "Key contains invalid characters" };
	}
	return { valid: true };
}

/**
 * Validate a room name.
 *
 * Rejects by allowlist rather than denylist so an unanticipated character
 * cannot slip through.
 */
export function validateRoomName(room: unknown): ValidationResult {
	if (typeof room !== "string") {
		return { valid: false, error: "Room name must be a string" };
	}
	if (!room.trim()) {
		return { valid: false, error: "Room name cannot be empty" };
	}
	if (room.length > MAX_ROOM_NAME_LENGTH) {
		return {
			valid: false,
			error: `Room name exceeds maximum length of ${MAX_ROOM_NAME_LENGTH}`,
		};
	}
	if (!ROOM_NAME_PATTERN.test(room)) {
		return { valid: false, error: "Room name contains invalid characters" };
	}
	return { valid: true };
}

/**
 * Shared checks for a topic name or pattern, applied to the literal part.
 */
function validateTopicSegments(literal: string, subject: string): ValidationResult {
	if (literal === "") {
		return { valid: false, error: `${subject} cannot be empty` };
	}
	const segments = literal.split(".");
	if (segments.length > MAX_TOPIC_SEGMENTS) {
		return {
			valid: false,
			error: `${subject} exceeds maximum of ${MAX_TOPIC_SEGMENTS} segments`,
		};
	}
	for (const segment of segments) {
		if (!TOPIC_SEGMENT_PATTERN.test(segment)) {
			return { valid: false, error: `${subject} contains invalid characters` };
		}
	}
	return { valid: true };
}

/**
 * Validate a concrete topic name.
 *
 * A published topic is always literal: wildcards belong to subscriptions only,
 * so accepting one here would let a publisher address a whole namespace.
 */
export function validateTopicName(topic: unknown): ValidationResult {
	if (typeof topic !== "string") {
		return { valid: false, error: "Topic name must be a string" };
	}
	if (!topic.trim()) {
		return { valid: false, error: "Topic name cannot be empty" };
	}
	if (topic.length > MAX_TOPIC_NAME_LENGTH) {
		return {
			valid: false,
			error: `Topic name exceeds maximum length of ${MAX_TOPIC_NAME_LENGTH}`,
		};
	}
	if (topic.includes("*")) {
		return { valid: false, error: "Topic name cannot contain a wildcard" };
	}
	return validateTopicSegments(topic, "Topic name");
}

/**
 * Validate a topic subscription pattern.
 *
 * Accepts an exact name, or a namespace prefix ending in `.*`. No other
 * wildcard form is supported: arbitrary glob matching would make subscriber
 * resolution scale with the total number of subscriptions, which is itself a
 * denial-of-service vector, and compiling user patterns to regex invites
 * catastrophic backtracking.
 */
export function validateTopicPattern(pattern: unknown): ValidationResult {
	if (typeof pattern !== "string") {
		return { valid: false, error: "Topic pattern must be a string" };
	}
	if (!pattern.trim()) {
		return { valid: false, error: "Topic pattern cannot be empty" };
	}
	if (pattern.length > MAX_TOPIC_NAME_LENGTH) {
		return {
			valid: false,
			error: `Topic pattern exceeds maximum length of ${MAX_TOPIC_NAME_LENGTH}`,
		};
	}

	const wildcards = (pattern.match(/\*/g) ?? []).length;
	if (wildcards === 0) {
		return validateTopicSegments(pattern, "Topic pattern");
	}
	if (wildcards > 1 || !pattern.endsWith(".*")) {
		return {
			valid: false,
			error: "Topic pattern supports a single trailing '.*' wildcard only",
		};
	}

	// Strip the trailing ".*" and validate the literal prefix that remains.
	const literal = pattern.slice(0, -2);
	return validateTopicSegments(literal, "Topic pattern");
}

/**
 * Check object depth to prevent deeply nested JSON attacks
 */
function getObjectDepth(obj: unknown, currentDepth = 0): number {
	if (currentDepth > MAX_PAYLOAD_DEPTH) {
		return currentDepth;
	}
	if (obj === null || typeof obj !== "object") {
		return currentDepth;
	}
	if (Array.isArray(obj)) {
		if (obj.length === 0) return currentDepth;
		return Math.max(...obj.map(item => getObjectDepth(item, currentDepth + 1)));
	}
	const values = Object.values(obj);
	if (values.length === 0) return currentDepth;
	return Math.max(...values.map(value => getObjectDepth(value, currentDepth + 1)));
}

/**
 * Validate a message structure
 */
export function validateMessage(
	message: unknown,
	_maxSize: number = MAX_MESSAGE_SIZE
): ValidationResult {
	if (typeof message !== "object" || message === null) {
		return { valid: false, error: "Message must be an object" };
	}

	const msg = message as Record<string, unknown>;

	// Check type field
	if (!("type" in msg)) {
		return { valid: false, error: "Message must have a type field" };
	}

	if (typeof msg.type !== "string") {
		return { valid: false, error: "Message type must be a string" };
	}

	// Validate message type is known
	const validTypes = Object.values(MessageType);
	if (!validTypes.includes(msg.type as MessageType)) {
		return { valid: false, error: `Unknown message type: ${msg.type}` };
	}

	// Check payload depth
	if ("payload" in msg) {
		const depth = getObjectDepth(msg.payload);
		if (depth > MAX_PAYLOAD_DEPTH) {
			return {
				valid: false,
				error: `Payload exceeds maximum nesting depth of ${MAX_PAYLOAD_DEPTH}`,
			};
		}
	}

	return { valid: true };
}

/**
 * Validate message payload has required destination
 */
export function validatePayloadDestination(payload: unknown): ValidationResult {
	if (typeof payload !== "object" || payload === null) {
		return { valid: false, error: "Payload must be an object" };
	}

	const p = payload as Record<string, unknown>;

	if (!("dst" in p)) {
		return { valid: false, error: "Payload must have a destination (dst)" };
	}

	return validateId(p.dst);
}

/**
 * Safely parse JSON with size limits
 */
export function safeJsonParse(
	text: string,
	maxSize: number = MAX_MESSAGE_SIZE
): { success: true; data: unknown } | { success: false; error: string } {
	// Check size before parsing
	if (text.length > maxSize) {
		return { success: false, error: `Message exceeds maximum size of ${maxSize} bytes` };
	}

	try {
		const data = JSON.parse(text);
		return { success: true, data };
	} catch (error) {
		return {
			success: false,
			error: `Invalid JSON: ${error instanceof Error ? error.message : "parse error"}`,
		};
	}
}
