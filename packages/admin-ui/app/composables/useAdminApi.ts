import type {
	AuditEntry,
	BanEntry,
	ClientDetails,
	ClientInfo,
	MetricsSnapshot,
	ServerStatus,
} from "~/types";

export function useAdminApi() {
	const connection = useConnection();

	// Backward-compat: isAuthenticated is true when we have URL + credentials
	const isAuthenticated = computed(() => connection.isConfigured.value);

	/**
	 * @deprecated Use connection.saveSettings({ apiKey }) instead.
	 * Kept for backward compat with existing code paths.
	 */
	function setApiKey(key: string) {
		connection.saveSettings({ apiKey: key, authType: "apiKey" });
	}

	/**
	 * @deprecated No-op — useConnection auto-hydrates from localStorage.
	 */
	function loadApiKey() {
		// No-op: useLocalStorage auto-hydrates
	}

	async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const baseUrl = connection.serverUrl.value;
		if (!baseUrl) {
			throw new Error("Server URL not configured");
		}

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			...connection.getAuthHeaders(),
			...(options.headers as Record<string, string>),
		};

		const response = await fetch(`${baseUrl}${endpoint}`, {
			...options,
			headers,
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error.error || `HTTP ${response.status}`);
		}

		return response.json();
	}

	// Status endpoints
	async function getStatus(): Promise<ServerStatus> {
		return fetchApi<ServerStatus>("/status");
	}

	async function getHealth(): Promise<{ status: string; timestamp: number }> {
		return fetchApi("/health");
	}

	// Metrics endpoints
	async function getMetrics(): Promise<MetricsSnapshot> {
		return fetchApi<MetricsSnapshot>("/metrics");
	}

	async function getMetricsHistory(duration = "1h"): Promise<{ snapshots: MetricsSnapshot[] }> {
		return fetchApi(`/metrics/history?duration=${duration}`);
	}

	// Client endpoints
	async function getClients(): Promise<{ clients: ClientInfo[]; total: number }> {
		return fetchApi("/clients");
	}

	async function getClient(id: string): Promise<ClientDetails> {
		return fetchApi(`/clients/${encodeURIComponent(id)}`);
	}

	async function disconnectClient(id: string): Promise<{ success: boolean; message: string }> {
		return fetchApi(`/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
	}

	async function disconnectAllClients(): Promise<{
		success: boolean;
		count: number;
	}> {
		return fetchApi("/clients", { method: "DELETE" });
	}

	// Ban endpoints
	async function getBans(): Promise<{ bans: BanEntry[]; total: number }> {
		return fetchApi("/bans");
	}

	async function banClient(
		id: string,
		reason?: string
	): Promise<{ success: boolean; ban: BanEntry }> {
		return fetchApi(`/bans/client/${encodeURIComponent(id)}`, {
			method: "POST",
			body: JSON.stringify({ reason }),
		});
	}

	async function unbanClient(id: string): Promise<{ success: boolean }> {
		return fetchApi(`/bans/client/${encodeURIComponent(id)}`, {
			method: "DELETE",
		});
	}

	async function banIP(ip: string, reason?: string): Promise<{ success: boolean; ban: BanEntry }> {
		return fetchApi(`/bans/ip/${encodeURIComponent(ip)}`, {
			method: "POST",
			body: JSON.stringify({ reason }),
		});
	}

	async function unbanIP(ip: string): Promise<{ success: boolean }> {
		return fetchApi(`/bans/ip/${encodeURIComponent(ip)}`, { method: "DELETE" });
	}

	// Audit endpoints
	async function getAuditLog(limit = 100): Promise<{ entries: AuditEntry[]; total: number }> {
		return fetchApi(`/audit?limit=${limit}`);
	}

	// Config endpoints
	async function getConfig(): Promise<Record<string, unknown>> {
		return fetchApi("/config");
	}

	async function updateRateLimits(config: {
		enabled?: boolean;
		maxTokens?: number;
		refillRate?: number;
	}): Promise<{ success: boolean }> {
		return fetchApi("/config/rate-limit", {
			method: "PATCH",
			body: JSON.stringify(config),
		});
	}

	// Broadcast
	async function broadcast(
		type: string,
		payload?: unknown
	): Promise<{ success: boolean; recipientCount: number }> {
		return fetchApi("/broadcast", {
			method: "POST",
			body: JSON.stringify({ type, payload }),
		});
	}

	return {
		isAuthenticated,
		setApiKey,
		loadApiKey,
		fetchApi,
		getStatus,
		getHealth,
		getMetrics,
		getMetricsHistory,
		getClients,
		getClient,
		disconnectClient,
		disconnectAllClients,
		getBans,
		banClient,
		unbanClient,
		banIP,
		unbanIP,
		getAuditLog,
		getConfig,
		updateRateLimits,
		broadcast,
	};
}
