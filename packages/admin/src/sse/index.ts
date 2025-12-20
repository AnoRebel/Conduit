import type { ServerResponse } from "node:http";
import type { AdminCore } from "../core/index.js";
import type { AdminEventType, ServerToClientEvents } from "../websocket/events.js";

export interface SSEClient {
	id: string;
	response: ServerResponse;
	subscriptions: Set<AdminEventType>;
}

export interface SSEServer {
	addClient(response: ServerResponse, subscriptions?: AdminEventType[]): SSEClient;
	removeClient(clientId: string): boolean;
	broadcast<T extends AdminEventType>(
		type: T,
		data: ServerToClientEvents[T],
	): number;
	broadcastToSubscribers<T extends AdminEventType>(
		type: T,
		data: ServerToClientEvents[T],
	): number;
	getClients(): SSEClient[];
	getClientCount(): number;
	close(): void;
}

export interface SSEServerOptions {
	admin: AdminCore;
	metricsInterval?: number;
	heartbeatInterval?: number;
}

/**
 * Create an SSE server for real-time admin updates
 */
export function createSSEServer(options: SSEServerOptions): SSEServer {
	const { admin, metricsInterval = 5000, heartbeatInterval = 30000 } = options;

	const clients = new Map<string, SSEClient>();
	let clientIdCounter = 0;

	let metricsTimer: ReturnType<typeof setInterval> | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

	// Start periodic tasks
	startMetricsInterval();
	startHeartbeatInterval();

	function addClient(
		response: ServerResponse,
		subscriptions: AdminEventType[] = ["metrics:update"],
	): SSEClient {
		const clientId = `sse_${++clientIdCounter}_${Date.now()}`;

		// Set SSE headers
		response.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no", // Disable nginx buffering
		});

		const client: SSEClient = {
			id: clientId,
			response,
			subscriptions: new Set(subscriptions),
		};

		clients.set(clientId, client);

		// Send initial connection event
		sendEvent(client, "connected", { clientId, subscriptions });

		// Handle client disconnect
		response.on("close", () => {
			clients.delete(clientId);
		});

		return client;
	}

	function removeClient(clientId: string): boolean {
		const client = clients.get(clientId);
		if (client) {
			try {
				client.response.end();
			} catch {
				// Response may already be closed
			}
			return clients.delete(clientId);
		}
		return false;
	}

	function sendEvent(client: SSEClient, type: string, data: unknown): boolean {
		try {
			const payload = JSON.stringify(data);
			client.response.write(`event: ${type}\n`);
			client.response.write(`data: ${payload}\n\n`);
			return true;
		} catch {
			// Client may have disconnected
			clients.delete(client.id);
			return false;
		}
	}

	function broadcast<T extends AdminEventType>(
		type: T,
		data: ServerToClientEvents[T],
	): number {
		let count = 0;

		for (const client of clients.values()) {
			if (sendEvent(client, type, data)) {
				count++;
			}
		}

		return count;
	}

	function broadcastToSubscribers<T extends AdminEventType>(
		type: T,
		data: ServerToClientEvents[T],
	): number {
		let count = 0;

		for (const client of clients.values()) {
			if (client.subscriptions.has(type)) {
				if (sendEvent(client, type, data)) {
					count++;
				}
			}
		}

		return count;
	}

	function getClients(): SSEClient[] {
		return Array.from(clients.values());
	}

	function getClientCount(): number {
		return clients.size;
	}

	function close(): void {
		if (metricsTimer) {
			clearInterval(metricsTimer);
			metricsTimer = null;
		}
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}

		for (const client of clients.values()) {
			try {
				client.response.end();
			} catch {
				// Response may already be closed
			}
		}
		clients.clear();
	}

	function startMetricsInterval(): void {
		metricsTimer = setInterval(() => {
			const snapshot = admin.getMetricsSnapshot();
			broadcastToSubscribers("metrics:update", snapshot);
		}, metricsInterval);

		if (metricsTimer.unref) {
			metricsTimer.unref();
		}
	}

	function startHeartbeatInterval(): void {
		heartbeatTimer = setInterval(() => {
			for (const client of clients.values()) {
				try {
					// Send comment as heartbeat (SSE spec)
					client.response.write(": heartbeat\n\n");
				} catch {
					clients.delete(client.id);
				}
			}
		}, heartbeatInterval);

		if (heartbeatTimer.unref) {
			heartbeatTimer.unref();
		}
	}

	return {
		addClient,
		removeClient,
		broadcast,
		broadcastToSubscribers,
		getClients,
		getClientCount,
		close,
	};
}

/**
 * Create SSE route handlers for the admin API
 */
export function createSSERoutes(sse: SSEServer) {
	return {
		events: (response: ServerResponse, subscriptions?: AdminEventType[]) => {
			return sse.addClient(response, subscriptions);
		},
		logs: (response: ServerResponse) => {
			return sse.addClient(response, ["audit:entry", "error:occurred"]);
		},
	};
}
