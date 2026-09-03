import { createConfig, type ServerConfig, type ServerConfigOverrides } from "../config.js";
import { InMemoryClusterBackend } from "./memory.js";
import { RedisClusterBackend, type RedisLike } from "./redis.js";
import type { ClusterBackend } from "./types.js";

export { InMemoryClusterBackend } from "./memory.js";
export {
	RedisClusterBackend,
	type RedisClusterBackendOptions,
	type RedisLike,
} from "./redis.js";
export type {
	BackendHealth,
	ClusterBackend,
	ForwardedEnvelope,
	ForwardHandler,
	PeerLocation,
} from "./types.js";

/**
 * A backend URL with any embedded credential removed.
 *
 * The password is normally supplied separately, but a URL of the form
 * `redis://user:secret@host` is valid and an operator may well use one. Since
 * this string reaches startup errors and logs, strip the userinfo rather than
 * trusting that nobody does.
 */
export function redactBackendUrl(url: string): string {
	try {
		const parsed = new URL(url);
		if (parsed.username || parsed.password) {
			parsed.username = "";
			parsed.password = "";
			return parsed.toString();
		}
		return url;
	} catch {
		// Not parseable as a URL: report a placeholder rather than echoing a
		// string that might contain anything.
		return "<malformed backend url>";
	}
}

/**
 * Load ioredis at call time.
 *
 * A static import would pull the package into the module graph for every
 * deployment, defeating the point of declaring it optional. Only a server
 * actually configured for the redis backend ever reaches this.
 */
async function loadRedisClient(config: ServerConfig["cluster"]["redis"]): Promise<RedisLike> {
	let RedisCtor: new (url: string, options: Record<string, unknown>) => RedisLike;
	try {
		const mod = (await import("ioredis")) as unknown as {
			default: new (url: string, options: Record<string, unknown>) => RedisLike;
		};
		RedisCtor = mod.default;
	} catch {
		throw new Error(
			"The redis cluster backend requires the optional 'ioredis' dependency.\n" +
				"Install it, or use the default in-memory backend."
		);
	}

	return new RedisCtor(config.url, {
		password: config.password,
		lazyConnect: false,
		maxRetriesPerRequest: 2,
	});
}

/**
 * Build the cluster backend a configuration asks for.
 *
 * Defaults to in-memory, so a server that configures nothing behaves exactly as
 * it did before distribution existed.
 */
export async function createClusterBackend(
	options: ServerConfig | ServerConfigOverrides
): Promise<ClusterBackend> {
	// Callers naturally pass the same partial config they hand to
	// createConduitServer, so normalise rather than trusting every field to be
	// present: a missing peerTtlSeconds would otherwise reach Redis as
	// undefined and fail with "value is not an integer".
	const config = createConfig(options as ServerConfigOverrides);

	if (config.cluster.backend === "memory") {
		return new InMemoryClusterBackend({ nodeId: config.cluster.nodeId });
	}

	const client = await loadRedisClient(config.cluster.redis);
	const backend = new RedisClusterBackend({
		config: config.cluster.redis,
		peerTtlSeconds: config.cluster.peerTtlSeconds,
		nodeId: config.cluster.nodeId,
		client,
	});

	// Fail fast rather than starting a server that looks healthy while unable to
	// route: an operator would otherwise discover the problem only when peers
	// silently stopped reaching each other.
	const health = await backend.health();
	if (!health.reachable) {
		await backend.stop().catch(() => undefined);
		throw new Error(
			`Refusing to start: the redis cluster backend at ${redactBackendUrl(config.cluster.redis.url)} is unreachable.` +
				`\n\n${health.error ?? "No further detail."}` +
				"\n\nStart the backend, correct config.cluster.redis, or use the in-memory backend."
		);
	}

	return backend;
}
