import type { MetricsCollector } from "./collector.js";

/**
 * Minimal interface for what we need from ConduitServerCore
 * This avoids a hard dependency on @conduit/server
 */
export interface InstrumentableServerCore {
	readonly realm: {
		getClientIds(): string[];
		getClient(id: string): { id: string } | undefined;
	};
	readonly config: {
		rateLimit?: { enabled?: boolean };
	};
	handleConnection: (...args: unknown[]) => unknown;
	handleMessage: (...args: unknown[]) => void;
	handleDisconnect: (...args: unknown[]) => void;
}

export interface InstrumentationHooks {
	onConnectionOpened?: (clientId: string) => void;
	onConnectionClosed?: (clientId: string) => void;
	onMessageRelayed?: () => void;
	onMessageQueued?: () => void;
	onRateLimitHit?: () => void;
	onRateLimitRejection?: () => void;
	onError?: (type: string) => void;
}

/**
 * Instrument a ConduitServerCore to collect metrics
 * Uses method wrapping to non-invasively collect data
 */
export function instrumentServerCore(
	core: InstrumentableServerCore,
	collector: MetricsCollector,
	hooks?: InstrumentationHooks
): () => void {
	// Store original methods
	const originalHandleConnection = core.handleConnection.bind(core);
	const originalHandleMessage = core.handleMessage.bind(core);
	const originalHandleDisconnect = core.handleDisconnect.bind(core);

	// Wrap handleConnection
	(core as { handleConnection: typeof core.handleConnection }).handleConnection = (
		...args: unknown[]
	): unknown => {
		const result = originalHandleConnection(...args);

		if (result) {
			// Connection succeeded
			collector.connectionsOpened.increment();
			collector.activeConnections.increment();
			hooks?.onConnectionOpened?.((result as { id: string }).id ?? "unknown");
		}

		return result;
	};

	// Wrap handleMessage
	(core as { handleMessage: typeof core.handleMessage }).handleMessage = (
		...args: unknown[]
	): void => {
		const startTime = performance.now();

		try {
			originalHandleMessage(...args);

			// Message was processed (relayed or queued)
			collector.messagesRelayed.increment();
			hooks?.onMessageRelayed?.();

			// Record latency
			const latencyMs = performance.now() - startTime;
			collector.latency.record(latencyMs);
		} catch (error) {
			collector.recordError("message_handling");
			hooks?.onError?.("message_handling");
			throw error;
		}
	};

	// Wrap handleDisconnect
	(core as { handleDisconnect: typeof core.handleDisconnect }).handleDisconnect = (
		...args: unknown[]
	): void => {
		const client = args[0] as { id: string } | undefined;

		originalHandleDisconnect(...args);

		collector.connectionsClosed.increment();
		collector.activeConnections.decrement();
		hooks?.onConnectionClosed?.(client?.id ?? "unknown");
	};

	// Return cleanup function to restore original methods
	return function uninstrument(): void {
		(core as { handleConnection: typeof core.handleConnection }).handleConnection =
			originalHandleConnection;
		(core as { handleMessage: typeof core.handleMessage }).handleMessage = originalHandleMessage;
		(core as { handleDisconnect: typeof core.handleDisconnect }).handleDisconnect =
			originalHandleDisconnect;
	};
}

/**
 * Create a metrics-aware proxy of ConduitServerCore
 * Alternative to direct instrumentation - creates a wrapper object
 */
export function createMetricsProxy<T extends InstrumentableServerCore>(
	core: T,
	collector: MetricsCollector,
	hooks?: InstrumentationHooks
): T {
	return new Proxy(core, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);

			if (prop === "handleConnection" && typeof value === "function") {
				return (...args: unknown[]): unknown => {
					const result = value.apply(target, args);

					if (result) {
						collector.connectionsOpened.increment();
						collector.activeConnections.increment();
						hooks?.onConnectionOpened?.((result as { id: string }).id ?? "unknown");
					}

					return result;
				};
			}

			if (prop === "handleMessage" && typeof value === "function") {
				return (...args: unknown[]): void => {
					const startTime = performance.now();

					try {
						value.apply(target, args);
						collector.messagesRelayed.increment();
						hooks?.onMessageRelayed?.();

						const latencyMs = performance.now() - startTime;
						collector.latency.record(latencyMs);
					} catch (error) {
						collector.recordError("message_handling");
						hooks?.onError?.("message_handling");
						throw error;
					}
				};
			}

			if (prop === "handleDisconnect" && typeof value === "function") {
				return (...args: unknown[]): void => {
					const client = args[0] as { id: string } | undefined;

					value.apply(target, args);

					collector.connectionsClosed.increment();
					collector.activeConnections.decrement();
					hooks?.onConnectionClosed?.(client?.id ?? "unknown");
				};
			}

			return value;
		},
	});
}

/**
 * Sync current realm state to metrics
 * Useful for initial synchronization when attaching to an existing server
 */
export function syncRealmToMetrics(
	core: InstrumentableServerCore,
	collector: MetricsCollector
): void {
	const clientCount = core.realm.getClientIds().length;
	collector.activeConnections.set(clientCount);
}
