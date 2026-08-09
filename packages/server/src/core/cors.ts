/**
 * @module
 *
 * Deciding the `Access-Control-Allow-Origin` value for a response.
 *
 * The header accepts exactly one origin or `*` -- never a list. Emitting a
 * comma-joined set of allowed origins produces a header every browser rejects,
 * so an operator configuring an allowlist would get no cross-origin access at
 * all. The correct behaviour is to echo back the single requesting origin when
 * it is allowed, and to signal that the response varies by origin.
 */

/** What a response should send for CORS, given the request's origin. */
export interface CorsDecision {
	/** Value for `Access-Control-Allow-Origin`, or `undefined` to omit it. */
	allowOrigin?: string;
	/** Whether the response must carry `Vary: Origin`. */
	vary: boolean;
}

/**
 * Resolve the allow-origin header for a request.
 *
 * @param requestOrigin - The request's `Origin` header, if any.
 * @param corsOrigin - Configured policy: `false` disables CORS, `true` allows
 * any origin, a string allows exactly that origin, an array allows each listed
 * origin.
 */
export function resolveCorsOrigin(
	requestOrigin: string | undefined,
	corsOrigin: boolean | string | string[]
): CorsDecision {
	if (corsOrigin === false) {
		return { vary: false };
	}

	if (corsOrigin === true) {
		return { allowOrigin: "*", vary: false };
	}

	if (typeof corsOrigin === "string") {
		return { allowOrigin: corsOrigin, vary: false };
	}

	if (Array.isArray(corsOrigin)) {
		// Multiple origins are allowed, but only one may be named per response,
		// so the answer depends on the request -- hence Vary: Origin.
		if (requestOrigin && corsOrigin.includes(requestOrigin)) {
			return { allowOrigin: requestOrigin, vary: true };
		}
		return { vary: true };
	}

	return { vary: false };
}
