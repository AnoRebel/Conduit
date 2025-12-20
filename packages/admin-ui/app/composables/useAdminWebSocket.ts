import type { MetricsSnapshot } from "~/types";

export interface AdminWSMessage {
	type: string;
	data: unknown;
}

export function useAdminWebSocket() {
	const config = useRuntimeConfig();
	const { apiKey } = useAdminApi();

	const ws = ref<WebSocket | null>(null);
	const isConnected = ref(false);
	const lastMessage = ref<AdminWSMessage | null>(null);
	const lastMetrics = ref<MetricsSnapshot | null>(null);
	const reconnectAttempts = ref(0);
	const maxReconnectAttempts = 5;

	let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

	const callbacks = {
		onMetrics: new Set<(metrics: MetricsSnapshot) => void>(),
		onClientConnected: new Set<(data: { id: string; timestamp: number }) => void>(),
		onClientDisconnected: new Set<(data: { id: string; reason: string; timestamp: number }) => void>(),
		onError: new Set<(data: { type: string; message: string; timestamp: number }) => void>(),
	};

	function connect() {
		if (!config.public.adminWsUrl) {
			console.warn("WebSocket URL not configured");
			return;
		}

		if (ws.value?.readyState === WebSocket.OPEN) {
			return;
		}

		const url = new URL(config.public.adminWsUrl);
		if (apiKey.value) {
			url.searchParams.set("apiKey", apiKey.value);
		}

		ws.value = new WebSocket(url.toString());

		ws.value.onopen = () => {
			isConnected.value = true;
			reconnectAttempts.value = 0;

			// Subscribe to events
			ws.value?.send(
				JSON.stringify({
					type: "subscribe",
					data: {
						events: [
							"metrics:update",
							"client:connected",
							"client:disconnected",
							"error:occurred",
						],
					},
				}),
			);
		};

		ws.value.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data) as AdminWSMessage;
				lastMessage.value = message;

				switch (message.type) {
					case "metrics:update":
						lastMetrics.value = message.data as MetricsSnapshot;
						callbacks.onMetrics.forEach((cb) =>
							cb(message.data as MetricsSnapshot),
						);
						break;

					case "client:connected":
						callbacks.onClientConnected.forEach((cb) =>
							cb(message.data as { id: string; timestamp: number }),
						);
						break;

					case "client:disconnected":
						callbacks.onClientDisconnected.forEach((cb) =>
							cb(
								message.data as {
									id: string;
									reason: string;
									timestamp: number;
								},
							),
						);
						break;

					case "error:occurred":
						callbacks.onError.forEach((cb) =>
							cb(
								message.data as {
									type: string;
									message: string;
									timestamp: number;
								},
							),
						);
						break;
				}
			} catch {
				// Ignore parse errors
			}
		};

		ws.value.onclose = () => {
			isConnected.value = false;
			scheduleReconnect();
		};

		ws.value.onerror = () => {
			isConnected.value = false;
		};
	}

	function disconnect() {
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}

		if (ws.value) {
			ws.value.close();
			ws.value = null;
		}

		isConnected.value = false;
	}

	function scheduleReconnect() {
		if (reconnectAttempts.value >= maxReconnectAttempts) {
			return;
		}

		const delay = Math.min(1000 * 2 ** reconnectAttempts.value, 30000);
		reconnectAttempts.value++;

		reconnectTimeout = setTimeout(() => {
			connect();
		}, delay);
	}

	function onMetrics(callback: (metrics: MetricsSnapshot) => void) {
		callbacks.onMetrics.add(callback);
		return () => callbacks.onMetrics.delete(callback);
	}

	function onClientConnected(
		callback: (data: { id: string; timestamp: number }) => void,
	) {
		callbacks.onClientConnected.add(callback);
		return () => callbacks.onClientConnected.delete(callback);
	}

	function onClientDisconnected(
		callback: (data: { id: string; reason: string; timestamp: number }) => void,
	) {
		callbacks.onClientDisconnected.add(callback);
		return () => callbacks.onClientDisconnected.delete(callback);
	}

	function onError(
		callback: (data: { type: string; message: string; timestamp: number }) => void,
	) {
		callbacks.onError.add(callback);
		return () => callbacks.onError.delete(callback);
	}

	// Auto-cleanup on unmount
	onUnmounted(() => {
		disconnect();
	});

	return {
		isConnected: readonly(isConnected),
		lastMessage: readonly(lastMessage),
		lastMetrics: readonly(lastMetrics),
		connect,
		disconnect,
		onMetrics,
		onClientConnected,
		onClientDisconnected,
		onError,
	};
}
