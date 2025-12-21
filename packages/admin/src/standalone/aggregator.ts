import type {
	ClientMetrics,
	MemoryUsage,
	MessageMetrics,
	MetricsSnapshot,
	ServerStatus,
} from "../types.js";
import type { RemoteServer } from "./connection.js";

export interface AggregatedMetrics {
	timestamp: number;
	serverCount: number;
	connectedServers: number;
	clients: ClientMetrics;
	messages: MessageMetrics;
	memory: MemoryUsage;
	byServer: Record<string, MetricsSnapshot>;
}

export interface AggregatedStatus {
	timestamp: number;
	servers: Array<{
		id: string;
		name?: string;
		status: RemoteServer["status"];
		serverStatus: ServerStatus | null;
	}>;
	totals: {
		running: number;
		clients: number;
		peakClients: number;
		messagesRelayed: number;
	};
}

/**
 * Aggregate metrics from multiple servers
 */
export function aggregateMetrics(servers: RemoteServer[]): AggregatedMetrics {
	const byServer: Record<string, MetricsSnapshot> = {};
	let totalConnected = 0;
	let totalPeak = 0;
	let totalTotal = 0;
	let totalRelayed = 0;
	let totalQueued = 0;
	let totalThroughput = 0;
	let totalHeapUsed = 0;
	let totalHeapTotal = 0;
	let totalExternal = 0;
	let totalRss = 0;
	let connectedServers = 0;

	for (const server of servers) {
		if (server.status === "connected" && server.lastMetrics) {
			connectedServers++;
			const metrics = server.lastMetrics;
			byServer[server.config.id] = metrics;

			totalConnected += metrics.clients.connected;
			totalPeak += metrics.clients.peak;
			totalTotal += metrics.clients.total;
			totalRelayed += metrics.messages.relayed;
			totalQueued += metrics.messages.queued;
			totalThroughput += metrics.messages.throughputPerSecond;
			totalHeapUsed += metrics.memory.heapUsed;
			totalHeapTotal += metrics.memory.heapTotal;
			totalExternal += metrics.memory.external;
			totalRss += metrics.memory.rss;
		}
	}

	return {
		timestamp: Date.now(),
		serverCount: servers.length,
		connectedServers,
		clients: {
			total: totalTotal,
			connected: totalConnected,
			peak: totalPeak,
		},
		messages: {
			relayed: totalRelayed,
			queued: totalQueued,
			throughputPerSecond: totalThroughput,
		},
		memory: {
			heapUsed: totalHeapUsed,
			heapTotal: totalHeapTotal,
			external: totalExternal,
			rss: totalRss,
		},
		byServer,
	};
}

/**
 * Aggregate status from multiple servers
 */
export function aggregateStatus(servers: RemoteServer[]): AggregatedStatus {
	let runningCount = 0;
	let totalClients = 0;
	let peakClients = 0;
	let messagesRelayed = 0;

	const serverStatuses = servers.map(server => {
		const serverStatus = server.lastStatus;

		if (serverStatus?.running) {
			runningCount++;
			totalClients += serverStatus.clients.connected;
			peakClients += serverStatus.clients.peak;
			messagesRelayed += serverStatus.messages.relayed;
		}

		return {
			id: server.config.id,
			name: server.config.name,
			status: server.status,
			serverStatus,
		};
	});

	return {
		timestamp: Date.now(),
		servers: serverStatuses,
		totals: {
			running: runningCount,
			clients: totalClients,
			peakClients,
			messagesRelayed,
		},
	};
}
