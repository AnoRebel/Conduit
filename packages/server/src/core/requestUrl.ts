/**
 * Parse a Node `IncomingMessage.url` (origin-form `/path?query`, or absolute-form
 * from a proxy) with the WHATWG URL API. Origin-form is prefixed with a fixed
 * origin rather than resolved against it, so `//evil/x` stays a path instead of
 * being read as a protocol-relative host.
 */
export function parseRequestUrl(raw: string | undefined): {
	pathname: string;
	query: Record<string, string>;
} {
	const value = raw ?? "";
	const url = value.startsWith("/")
		? new URL(`http://localhost${value}`)
		: new URL(value, "http://localhost/");
	return { pathname: url.pathname, query: Object.fromEntries(url.searchParams) };
}
