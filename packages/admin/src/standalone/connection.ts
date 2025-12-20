import type { ServerConnection, ServerStatus, MetricsSnapshot } from "../types.js";

export interface RemoteServer {
	readonly config: ServerConnection;
	readonly status: "connecting" | "connected" | "disconnected" | "error";
	readonly lastStatus: ServerStatus | null;
	readonly lastMetrics: MetricsSnapshot | null;
	readonly lastError: string | null;
	readonly lastUpdate: number;

	connect(): Promise<void>;
	disconnect(): void;
	fetchStatus(): Promise<ServerStatus>;
	fetchMetrics(): Promise<MetricsSnapshot>;
	executeAction(action: string, params: Record<string, unknown>): Promise<unknown>;
}

export interface RemoteServerOptions {
	config: ServerConnection;
	onStatusChange?: (server: RemoteServer) => void;
	onMetricsUpdate?: (server: RemoteServer, metrics: MetricsSnapshot) => void;
	onError?: (server: RemoteServer, error: Error) => void;
}

/**
 * Create a connection to a remote Conduit server's admin API
 */
export function createRemoteServer(options: RemoteServerOptions): RemoteServer {
	const { config, onStatusChange, onMetricsUpdate, onError } = options;

	let status: RemoteServer["status"] = "disconnected";
	let lastStatus: ServerStatus | null = null;
	let lastMetrics: MetricsSnapshot | null = null;
	let lastError: string | null = null;
	let lastUpdate = 0;

	let ws: WebSocket | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	function buildHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		if (config.adminKey) {
			headers["X-API-Key"] = config.adminKey;
		}

		return headers;
	}

	async function connect(): Promise<void> {
		if (status === "connected" || status === "connecting") {
			return;
		}

		setStatus("connecting");

		try {
			// Try HTTP first to verify connectivity
			await fetchStatus();
			setStatus("connected");

			// If WebSocket URL is available, connect for real-time updates
			if (config.url.startsWith("ws://") || config.url.startsWith("wss://")) {
				connectWebSocket();
			}
		} catch (error) {
			setStatus("error");
			lastError = error instanceof Error ? error.message : "Connection failed";
			onError?.(server, error instanceof Error ? error : new Error(lastError));
			throw error;
		}
	}

	function connectWebSocket(): void {
		const wsUrl = new URL(config.url);
		if (config.adminKey) {
			wsUrl.searchParams.set("apiKey", config.adminKey);
		}

		ws = new WebSocket(wsUrl.toString());

		ws.onopen = () => {
			setStatus("connected");
			// Subscribe to events
			ws?.send(
				JSON.stringify({
					type: "subscribe",
					data: { events: ["metrics:update", "client:connected", "client:disconnected"] },
				}),
			);
		};

		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data as string);
				if (message.type === "metrics:update") {
					lastMetrics = message.data;
					lastUpdate = Date.now();
					onMetricsUpdate?.(server, message.data);
				}
			} catch {
				// Ignore parse errors
			}
		};

		ws.onclose = () => {
			setStatus("disconnected");
			scheduleReconnect();
		};

		ws.onerror = () => {
			setStatus("error");
			lastError = "WebSocket error";
		};
	}

	function scheduleReconnect(): void {
		if (reconnectTimer) {
			return;
		}

		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			if (status === "disconnected") {
				connect().catch(() => {
					// Reconnection failed, will try again
					scheduleReconnect();
				});
			}
		}, 5000);
	}

	function disconnect(): void {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}

		if (ws) {
			ws.close();
			ws = null;
		}

		setStatus("disconnected");
	}

	function setStatus(newStatus: RemoteServer["status"]): void {
		if (status !== newStatus) {
			status = newStatus;
			onStatusChange?.(server);
		}
	}

	async function fetchStatus(): Promise<ServerStatus> {
		const httpUrl = config.url.replace(/^ws/, "http");
		const response = await fetch(`${httpUrl}/status`, {
			headers: buildHeaders(),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = (await response.json()) as ServerStatus;
		lastStatus = data;
		lastUpdate = Date.now();
		return data;
	}

	async function fetchMetrics(): Promise<MetricsSnapshot> {
		const httpUrl = config.url.replace(/^ws/, "http");
		const response = await fetch(`${httpUrl}/metrics`, {
			headers: buildHeaders(),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = (await response.json()) as MetricsSnapshot;
		lastMetrics = data;
		lastUpdate = Date.now();
		return data;
	}

	async function executeAction(
		action: string,
		params: Record<string, unknown>,
	): Promise<unknown> {
		const httpUrl = config.url.replace(/^ws/, "http");
		const response = await fetch(`${httpUrl}/${action}`, {
			method: "POST",
			headers: buildHeaders(),
			body: JSON.stringify(params),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return response.json();
	}

	const server: RemoteServer = {
		config,
		get status() {
			return status;
		},
		get lastStatus() {
			return lastStatus;
		},
		get lastMetrics() {
			return lastMetrics;
		},
		get lastError() {
			return lastError;
		},
		get lastUpdate() {
			return lastUpdate;
		},
		connect,
		disconnect,
		fetchStatus,
		fetchMetrics,
		executeAction,
	};

	return server;
}
