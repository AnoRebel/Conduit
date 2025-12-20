import jwt from "jsonwebtoken";
import type { AuthResult } from "./index.js";
import type { JWTPayload } from "../types.js";

export class JWTAuth {
	private readonly _secret: string;
	private readonly _expiresIn: number;

	constructor(secret: string, expiresIn: number = 3600) {
		this._secret = secret;
		this._expiresIn = expiresIn;
	}

	validate(token: string): AuthResult {
		if (!token || typeof token !== "string") {
			return { valid: false, error: "Invalid token format" };
		}

		try {
			const decoded = jwt.verify(token, this._secret) as JWTPayload;

			return {
				valid: true,
				userId: decoded.sub,
			};
		} catch (error) {
			if (error instanceof jwt.TokenExpiredError) {
				return { valid: false, error: "Token expired" };
			}
			if (error instanceof jwt.JsonWebTokenError) {
				return { valid: false, error: "Invalid token" };
			}
			return { valid: false, error: "Token verification failed" };
		}
	}

	generate(userId: string, role: "admin" | "viewer" = "admin"): string {
		const payload: JWTPayload = {
			sub: userId,
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + this._expiresIn,
			role,
		};

		return jwt.sign(payload, this._secret);
	}

	decode(token: string): JWTPayload | null {
		try {
			return jwt.decode(token) as JWTPayload | null;
		} catch {
			return null;
		}
	}
}
