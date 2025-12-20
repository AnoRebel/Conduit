import { MessageType } from "@conduit/shared";

// Maximum sizes for security
export const MAX_ID_LENGTH = 64;
export const MAX_TOKEN_LENGTH = 64;
export const MAX_KEY_LENGTH = 64;
export const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB default
export const MAX_PAYLOAD_DEPTH = 10;

// Validation patterns
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_=-]{1,64}$/;
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface ValidationResult {
	valid: boolean;
	error?: string;
}

/**
 * Validate a client ID
 */
export function validateId(id: unknown): ValidationResult {
	if (typeof id !== "string") {
		return { valid: false, error: "ID must be a string" };
	}
	if (!id || !id.trim()) {
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
	if (!token || !token.trim()) {
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
	if (!key || !key.trim()) {
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
		return Math.max(...obj.map((item) => getObjectDepth(item, currentDepth + 1)));
	}
	const values = Object.values(obj);
	if (values.length === 0) return currentDepth;
	return Math.max(...values.map((value) => getObjectDepth(value, currentDepth + 1)));
}

/**
 * Validate a message structure
 */
export function validateMessage(message: unknown, _maxSize: number = MAX_MESSAGE_SIZE): ValidationResult {
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
			return { valid: false, error: `Payload exceeds maximum nesting depth of ${MAX_PAYLOAD_DEPTH}` };
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
		return { success: false, error: `Invalid JSON: ${error instanceof Error ? error.message : "parse error"}` };
	}
}
