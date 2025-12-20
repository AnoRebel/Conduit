import type {
	ServerStatus,
	MetricsSnapshot,
	ClientInfo,
	ClientDetails,
	BanEntry,
	AuditEntry,
} from "~/types";

export function useAdminApi() {
	const config = useRuntimeConfig();
	const baseUrl = config.public.adminApiUrl;

	const apiKey = useState<string>("apiKey", () => "");
	const isAuthenticated = computed(() => !!apiKey.value);

	function setApiKey(key: string) {
		apiKey.value = key;
		if (import.meta.client) {
			localStorage.setItem("adminApiKey", key);
		}
	}

	function loadApiKey() {
		if (import.meta.client) {
			const stored = localStorage.getItem("adminApiKey");
			if (stored) {
				apiKey.value = stored;
			}
		}
	}

	async function fetchApi<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<T> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			...(options.headers as Record<string, string>),
		};

		if (apiKey.value) {
			headers["X-API-Key"] = apiKey.value;
		}

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

	async function getMetricsHistory(
		duration = "1h",
	): Promise<{ snapshots: MetricsSnapshot[] }> {
		return fetchApi(`/metrics/history?duration=${duration}`);
	}

	// Client endpoints
	async function getClients(): Promise<{ clients: ClientInfo[]; total: number }> {
		return fetchApi("/clients");
	}

	async function getClient(id: string): Promise<ClientDetails> {
		return fetchApi(`/clients/${encodeURIComponent(id)}`);
	}

	async function disconnectClient(
		id: string,
	): Promise<{ success: boolean; message: string }> {
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
		reason?: string,
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

	async function banIP(
		ip: string,
		reason?: string,
	): Promise<{ success: boolean; ban: BanEntry }> {
		return fetchApi(`/bans/ip/${encodeURIComponent(ip)}`, {
			method: "POST",
			body: JSON.stringify({ reason }),
		});
	}

	async function unbanIP(ip: string): Promise<{ success: boolean }> {
		return fetchApi(`/bans/ip/${encodeURIComponent(ip)}`, { method: "DELETE" });
	}

	// Audit endpoints
	async function getAuditLog(
		limit = 100,
	): Promise<{ entries: AuditEntry[]; total: number }> {
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
		payload?: unknown,
	): Promise<{ success: boolean; recipientCount: number }> {
		return fetchApi("/broadcast", {
			method: "POST",
			body: JSON.stringify({ type, payload }),
		});
	}

	return {
		apiKey: readonly(apiKey),
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
