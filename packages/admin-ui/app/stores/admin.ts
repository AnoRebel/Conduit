import { defineStore } from "pinia";
import type { AuditEntry, BanEntry, ClientInfo, MetricsSnapshot, ServerStatus } from "~/types";

export const useAdminStore = defineStore("admin", () => {
	const api = useAdminApi();
	const ws = useAdminWebSocket();

	// State
	const status = ref<ServerStatus | null>(null);
	const metrics = ref<MetricsSnapshot | null>(null);
	const metricsHistory = ref<MetricsSnapshot[]>([]);
	const clients = ref<ClientInfo[]>([]);
	const bans = ref<BanEntry[]>([]);
	const auditLog = ref<AuditEntry[]>([]);
	const isLoading = ref(false);
	const error = ref<string | null>(null);

	// Computed
	const isConnected = computed(() => status.value?.running ?? false);
	const clientCount = computed(() => clients.value.length);
	const connectedClientCount = computed(() => clients.value.filter(c => c.connected).length);

	// Actions
	async function fetchStatus() {
		try {
			status.value = await api.getStatus();
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to fetch status";
		}
	}

	async function fetchMetrics() {
		try {
			metrics.value = await api.getMetrics();
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to fetch metrics";
		}
	}

	async function fetchMetricsHistory(duration = "1h") {
		try {
			const result = await api.getMetricsHistory(duration);
			metricsHistory.value = result.snapshots;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to fetch metrics history";
		}
	}

	async function fetchClients() {
		try {
			const result = await api.getClients();
			clients.value = result.clients;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to fetch clients";
		}
	}

	async function fetchBans() {
		try {
			const result = await api.getBans();
			bans.value = result.bans;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to fetch bans";
		}
	}

	async function fetchAuditLog(limit = 100) {
		try {
			const result = await api.getAuditLog(limit);
			auditLog.value = result.entries;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to fetch audit log";
		}
	}

	async function disconnectClient(id: string) {
		try {
			await api.disconnectClient(id);
			await fetchClients();
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to disconnect client";
		}
	}

	async function banClient(id: string, reason?: string) {
		try {
			await api.banClient(id, reason);
			await fetchBans();
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to ban client";
		}
	}

	async function unbanClient(id: string) {
		try {
			await api.unbanClient(id);
			await fetchBans();
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to unban client";
		}
	}

	async function initialize() {
		isLoading.value = true;
		error.value = null;

		try {
			await Promise.all([fetchStatus(), fetchMetrics(), fetchClients(), fetchBans()]);

			// Connect WebSocket for real-time updates
			ws.connect();

			// Listen for metrics updates
			ws.onMetrics(m => {
				metrics.value = m;
			});
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to initialize";
		} finally {
			isLoading.value = false;
		}
	}

	function cleanup() {
		ws.disconnect();
	}

	return {
		// State
		status,
		metrics,
		metricsHistory,
		clients,
		bans,
		auditLog,
		isLoading,
		error,

		// Computed
		isConnected,
		clientCount,
		connectedClientCount,

		// Actions
		fetchStatus,
		fetchMetrics,
		fetchMetricsHistory,
		fetchClients,
		fetchBans,
		fetchAuditLog,
		disconnectClient,
		banClient,
		unbanClient,
		initialize,
		cleanup,
	};
});
