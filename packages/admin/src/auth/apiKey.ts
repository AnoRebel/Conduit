import type { AuthResult } from "./index.js";
import { timingSafeEqual } from "node:crypto";

export class ApiKeyAuth {
	private readonly _apiKey: string | undefined;
	private readonly _apiKeyBuffer: Buffer | undefined;

	constructor(apiKey?: string) {
		this._apiKey = apiKey;
		if (apiKey) {
			this._apiKeyBuffer = Buffer.from(apiKey);
		}
	}

	validate(key: string): AuthResult {
		if (!this._apiKey || !this._apiKeyBuffer) {
			return { valid: false, error: "API key not configured" };
		}

		if (!key || typeof key !== "string") {
			return { valid: false, error: "Invalid API key format" };
		}

		// Use timing-safe comparison to prevent timing attacks
		const keyBuffer = Buffer.from(key);

		// Lengths must match for timingSafeEqual
		if (keyBuffer.length !== this._apiKeyBuffer.length) {
			return { valid: false, error: "Invalid API key" };
		}

		try {
			const isValid = timingSafeEqual(keyBuffer, this._apiKeyBuffer);
			if (isValid) {
				return { valid: true, userId: "api-key-user" };
			}
			return { valid: false, error: "Invalid API key" };
		} catch {
			return { valid: false, error: "Invalid API key" };
		}
	}
}
