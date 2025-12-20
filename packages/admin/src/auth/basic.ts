import type { AuthResult } from "./index.js";
import { timingSafeEqual } from "node:crypto";

export class BasicAuth {
	private readonly _username: string;
	private readonly _expectedBuffer: Buffer;

	constructor(username: string, password: string) {
		this._username = username;
		// Pre-compute the expected base64 credentials
		this._expectedBuffer = Buffer.from(`${username}:${password}`);
	}

	validate(credentials: string): AuthResult {
		if (!credentials || typeof credentials !== "string") {
			return { valid: false, error: "Invalid credentials format" };
		}

		try {
			// Decode base64 credentials
			const decoded = Buffer.from(credentials, "base64").toString("utf-8");
			const decodedBuffer = Buffer.from(decoded);

			// Use timing-safe comparison
			if (decodedBuffer.length !== this._expectedBuffer.length) {
				return { valid: false, error: "Invalid credentials" };
			}

			const isValid = timingSafeEqual(decodedBuffer, this._expectedBuffer);

			if (isValid) {
				return { valid: true, userId: this._username };
			}

			return { valid: false, error: "Invalid credentials" };
		} catch {
			return { valid: false, error: "Invalid credentials encoding" };
		}
	}

	/**
	 * Create base64 encoded credentials for testing
	 */
	static encode(username: string, password: string): string {
		return Buffer.from(`${username}:${password}`).toString("base64");
	}
}
