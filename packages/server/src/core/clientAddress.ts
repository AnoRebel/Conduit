/**
 * @module
 *
 * Resolving the source address of an incoming connection.
 *
 * `X-Forwarded-For` is set by whoever sends the request, so it is only
 * meaningful when a trusted proxy is known to overwrite it. Honouring it
 * unconditionally lets any client rotate the header to evade rate limits and
 * address bans, which is why this is gated behind the `proxied` setting.
 */

/** The subset of an incoming request needed to determine a client address. */
export interface AddressableRequest {
	headers: Record<string, string | string[] | undefined>;
	socket?: { remoteAddress?: string | undefined };
}

/** The subset of server config that governs proxy trust. */
export interface ProxyTrustConfig {
	/**
	 * Whether the server runs behind a trusted reverse proxy.
	 *
	 * `false` ignores forwarded headers. `true` trusts `X-Forwarded-For`. A string
	 * names the header to read instead.
	 */
	proxied: boolean | string;
}

/**
 * Determine the address to attribute a connection to.
 *
 * Falls back to the transport-level peer address whenever proxy trust is
 * disabled or the configured header is absent.
 */
export function resolveClientAddress(
	request: AddressableRequest,
	config: ProxyTrustConfig
): string | undefined {
	const { proxied } = config;

	if (proxied) {
		const headerName = typeof proxied === "string" ? proxied.toLowerCase() : "x-forwarded-for";
		const raw = request.headers[headerName];
		const value = Array.isArray(raw) ? raw[0] : raw;
		// A forwarded chain lists the original client first.
		const first = value?.split(",")[0]?.trim();

		if (first) {
			return first;
		}
	}

	return request.socket?.remoteAddress;
}
