import type { IncomingMessage } from "node:http";
import type { RawData, WebSocket } from "ws";
import type { AdminCore } from "../core/index.js";
import type { MetricsSnapshot } from "../types.js";
import {
	type AdminEventType,
	parseClientMessage,
	type ServerToClientEvents,
	serializeEvent,
} from "./events.js";

export interface AdminWSClient {
	id: string;
	socket: WebSocket;
	subscriptions: Set<AdminEventType>;
	authenticated: boolean;
	userId?: string;
}

export interface AdminWSServer {
	handleConnection(socket: WebSocket, request: IncomingMessage): void;
	broadcast<T extends AdminEventType>(type: T, data: ServerToClientEvents[T]): number;
	broadcastToSubscribers<T extends AdminEventType>(type: T, data: ServerToClientEvents[T]): number;
	getClients(): AdminWSClient[];
	getClientCount(): number;
	close(): void;

	// Event emitting methods
	emitClientConnected(clientId: string): void;
	emitClientDisconnected(clientId: string, reason: string): void;
	emitMetricsUpdate(snapshot: MetricsSnapshot): void;
	emitError(type: string, message: string): void;
}

export interface AdminWSServerOptions {
	admin: AdminCore;
	pingInterval?: number;
	metricsInterval?: number;
}

/**
 * Create a WebSocket server for real-time admin updates
 */
export function createAdminWSServer(options: AdminWSServerOptions): AdminWSServer {
	const { admin, pingInterval = 30000, metricsInterval = 5000 } = options;

	const clients = new Map<string, AdminWSClient>();
	let clientIdCounter = 0;

	let pingTimer: ReturnType<typeof setInterval> | null = null;
	let metricsTimer: ReturnType<typeof setInterval> | null = null;

	// Start periodic tasks
	startPingInterval();
	startMetricsInterval();

	function handleConnection(socket: WebSocket, request: IncomingMessage): void {
		const clientId = `ws_${++clientIdCounter}_${Date.now()}`;

		// Authenticate via query string or headers
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
		const token =
			url.searchParams.get("token") ??
			url.searchParams.get("apiKey") ??
			request.headers["x-api-key"];

		let authResult = { valid: false, userId: undefined as string | undefined };

		if (token) {
			// Try API key first
			const apiKeyResult = admin.auth.validateApiKey(token as string);
			if (apiKeyResult.valid) {
				authResult = { valid: true, userId: apiKeyResult.userId };
			} else {
				// Try JWT
				const jwtResult = admin.auth.validateJWT(token as string);
				if (jwtResult.valid) {
					authResult = { valid: true, userId: jwtResult.userId };
				}
			}
		}

		if (!authResult.valid) {
			socket.close(4001, "Unauthorized");
			return;
		}

		const client: AdminWSClient = {
			id: clientId,
			socket,
			subscriptions: new Set(["metrics:update", "client:connected", "client:disconnected"]),
			authenticated: true,
			userId: authResult.userId,
		};

		clients.set(clientId, client);

		// Send welcome message
		socket.send(
			JSON.stringify({
				type: "connected",
				data: {
					clientId,
					subscriptions: Array.from(client.subscriptions),
				},
			})
		);

		// Handle messages
		socket.on("message", (data: RawData) => {
			handleMessage(client, data);
		});

		// Handle close
		socket.on("close", () => {
			clients.delete(clientId);
		});

		// Handle errors
		socket.on("error", _err => {
			console.error(`WebSocket error for client ${clientId}:`);
			clients.delete(clientId);
		});
	}

	function handleMessage(client: AdminWSClient, data: RawData): void {
		const text = data.toString();
		const message = parseClientMessage(text);

		if (!message) {
			return;
		}

		switch (message.type) {
			case "subscribe": {
				const payload = message.payload as { events?: string[] };
				const events = payload.events ?? [];
				for (const event of events) {
					if (isValidEventType(event)) {
						client.subscriptions.add(event);
					}
				}
				client.socket.send(
					JSON.stringify({
						type: "subscribed",
						data: { events: Array.from(client.subscriptions) },
					})
				);
				break;
			}

			case "unsubscribe": {
				const payload = message.payload as { events?: string[] };
				const events = payload.events ?? [];
				for (const event of events) {
					if (isValidEventType(event)) {
						client.subscriptions.delete(event);
					}
				}
				client.socket.send(
					JSON.stringify({
						type: "unsubscribed",
						data: { events: Array.from(client.subscriptions) },
					})
				);
				break;
			}

			case "ping": {
				client.socket.send(JSON.stringify({ type: "pong", data: {} }));
				break;
			}
		}
	}

	function broadcast<T extends AdminEventType>(type: T, data: ServerToClientEvents[T]): number {
		const message = serializeEvent(type, data);
		let count = 0;

		for (const client of clients.values()) {
			if (client.socket.readyState === 1) {
				// OPEN
				try {
					client.socket.send(message);
					count++;
				} catch {
					// Client may have disconnected
				}
			}
		}

		return count;
	}

	function broadcastToSubscribers<T extends AdminEventType>(
		type: T,
		data: ServerToClientEvents[T]
	): number {
		const message = serializeEvent(type, data);
		let count = 0;

		for (const client of clients.values()) {
			if (client.subscriptions.has(type) && client.socket.readyState === 1) {
				try {
					client.socket.send(message);
					count++;
				} catch {
					// Client may have disconnected
				}
			}
		}

		return count;
	}

	function getClients(): AdminWSClient[] {
		return Array.from(clients.values());
	}

	function getClientCount(): number {
		return clients.size;
	}

	function close(): void {
		if (pingTimer) {
			clearInterval(pingTimer);
			pingTimer = null;
		}
		if (metricsTimer) {
			clearInterval(metricsTimer);
			metricsTimer = null;
		}

		for (const client of clients.values()) {
			client.socket.close(1000, "Server shutting down");
		}
		clients.clear();
	}

	function startPingInterval(): void {
		pingTimer = setInterval(() => {
			for (const client of clients.values()) {
				if (client.socket.readyState === 1) {
					client.socket.ping();
				}
			}
		}, pingInterval);

		if (pingTimer.unref) {
			pingTimer.unref();
		}
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

	// Event emitters
	function emitClientConnected(clientId: string): void {
		broadcastToSubscribers("client:connected", {
			id: clientId,
			timestamp: Date.now(),
		});
	}

	function emitClientDisconnected(clientId: string, reason: string): void {
		broadcastToSubscribers("client:disconnected", {
			id: clientId,
			reason,
			timestamp: Date.now(),
		});
	}

	function emitMetricsUpdate(snapshot: MetricsSnapshot): void {
		broadcastToSubscribers("metrics:update", snapshot);
	}

	function emitError(type: string, message: string): void {
		broadcastToSubscribers("error:occurred", {
			type,
			message,
			timestamp: Date.now(),
		});
	}

	return {
		handleConnection,
		broadcast,
		broadcastToSubscribers,
		getClients,
		getClientCount,
		close,
		emitClientConnected,
		emitClientDisconnected,
		emitMetricsUpdate,
		emitError,
	};
}

function isValidEventType(event: string): event is AdminEventType {
	const validTypes: AdminEventType[] = [
		"client:connected",
		"client:disconnected",
		"metrics:update",
		"error:occurred",
		"ban:added",
		"ban:removed",
		"audit:entry",
	];
	return validTypes.includes(event as AdminEventType);
}

export {
	type AdminEventMessage,
	type AdminEventType,
	type ClientToServerEvents,
	createEvent,
	parseClientMessage,
	type ServerToClientEvents,
	serializeEvent,
} from "./events.js";
