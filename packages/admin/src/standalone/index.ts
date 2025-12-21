import type { AdminConfig } from "../config.js";
import { type AdminConfigOptions, createAdminConfig } from "../config.js";
import type { MetricsSnapshot, ServerConnection } from "../types.js";
import {
	type AggregatedMetrics,
	type AggregatedStatus,
	aggregateMetrics,
	aggregateStatus,
} from "./aggregator.js";
import { createRemoteServer, type RemoteServer } from "./connection.js";

export interface StandaloneAdmin {
	readonly config: AdminConfig;
	readonly servers: ReadonlyMap<string, RemoteServer>;

	// Connection management
	addServer(connection: ServerConnection): RemoteServer;
	removeServer(id: string): boolean;
	getServer(id: string): RemoteServer | undefined;

	// Lifecycle
	connectAll(): Promise<void>;
	disconnectAll(): void;
	destroy(): void;

	// Aggregated data
	getAggregatedMetrics(): AggregatedMetrics;
	getAggregatedStatus(): AggregatedStatus;

	// Callbacks
	onMetricsUpdate(callback: (serverId: string, metrics: MetricsSnapshot) => void): () => void;
	onStatusChange(callback: (serverId: string, status: RemoteServer["status"]) => void): () => void;
}

export interface StandaloneAdminOptions {
	config?: Partial<AdminConfigOptions>;
	servers?: ServerConnection[];
}

/**
 * Create a standalone admin that can connect to multiple Conduit servers
 */
export function createStandaloneAdmin(options: StandaloneAdminOptions = {}): StandaloneAdmin {
	const config = createAdminConfig(options.config);
	const servers = new Map<string, RemoteServer>();

	// Event callbacks
	const metricsCallbacks = new Set<(serverId: string, metrics: MetricsSnapshot) => void>();
	const statusCallbacks = new Set<(serverId: string, status: RemoteServer["status"]) => void>();

	// Polling interval for servers without WebSocket
	let pollingInterval: ReturnType<typeof setInterval> | null = null;

	function addServer(connection: ServerConnection): RemoteServer {
		if (servers.has(connection.id)) {
			throw new Error(`Server with id '${connection.id}' already exists`);
		}

		const server = createRemoteServer({
			config: connection,
			onStatusChange: _s => {
				for (const callback of statusCallbacks) {
					callback(connection.id, _s.status);
				}
			},
			onMetricsUpdate: (_s, metrics) => {
				for (const callback of metricsCallbacks) {
					callback(connection.id, metrics);
				}
			},
			onError: (_s, error) => {
				console.error(`Server ${connection.id} error:`, error.message);
			},
		});

		servers.set(connection.id, server);
		return server;
	}

	function removeServer(id: string): boolean {
		const server = servers.get(id);
		if (server) {
			server.disconnect();
			return servers.delete(id);
		}
		return false;
	}

	function getServer(id: string): RemoteServer | undefined {
		return servers.get(id);
	}

	async function connectAll(): Promise<void> {
		const promises = Array.from(servers.values()).map(server =>
			server.connect().catch(err => {
				console.error(`Failed to connect to ${server.config.id}:`, err.message);
			})
		);

		await Promise.all(promises);

		// Start polling for servers that don't use WebSocket
		startPolling();
	}

	function disconnectAll(): void {
		stopPolling();

		for (const server of servers.values()) {
			server.disconnect();
		}
	}

	function destroy(): void {
		disconnectAll();
		servers.clear();
		metricsCallbacks.clear();
		statusCallbacks.clear();
	}

	function startPolling(): void {
		if (pollingInterval) {
			return;
		}

		pollingInterval = setInterval(async () => {
			for (const server of servers.values()) {
				if (server.status === "connected") {
					try {
						const metrics = await server.fetchMetrics();
						for (const callback of metricsCallbacks) {
							callback(server.config.id, metrics);
						}
					} catch {
						// Server may have become unavailable
					}
				}
			}
		}, config.metrics.snapshotIntervalMs);

		if (pollingInterval.unref) {
			pollingInterval.unref();
		}
	}

	function stopPolling(): void {
		if (pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = null;
		}
	}

	function getAggregatedMetrics(): AggregatedMetrics {
		return aggregateMetrics(Array.from(servers.values()));
	}

	function getAggregatedStatus(): AggregatedStatus {
		return aggregateStatus(Array.from(servers.values()));
	}

	function onMetricsUpdate(
		callback: (serverId: string, metrics: MetricsSnapshot) => void
	): () => void {
		metricsCallbacks.add(callback);
		return () => metricsCallbacks.delete(callback);
	}

	function onStatusChange(
		callback: (serverId: string, status: RemoteServer["status"]) => void
	): () => void {
		statusCallbacks.add(callback);
		return () => statusCallbacks.delete(callback);
	}

	// Add initial servers
	if (options.servers) {
		for (const connection of options.servers) {
			addServer(connection);
		}
	}

	return {
		config,
		servers,
		addServer,
		removeServer,
		getServer,
		connectAll,
		disconnectAll,
		destroy,
		getAggregatedMetrics,
		getAggregatedStatus,
		onMetricsUpdate,
		onStatusChange,
	};
}

export {
	type AggregatedMetrics,
	type AggregatedStatus,
	aggregateMetrics,
	aggregateStatus,
} from "./aggregator.js";
export { createRemoteServer, type RemoteServer, type RemoteServerOptions } from "./connection.js";
