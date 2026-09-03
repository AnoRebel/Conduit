import { defineStore } from "pinia";
import type {
	AuditEntry,
	BanEntry,
	ClientInfo,
	ClusterStatus,
	MetricsSnapshot,
	RoomSummary,
	ServerStatus,
} from "~/types";

export const useAdminStore = defineStore("admin", () => {
	const api = useAdminApi();
	const ws = useAdminWebSocket();

	// State
	const status = ref<ServerStatus | null>(null);
	const metrics = ref<MetricsSnapshot | null>(null);
	const metricsHistory = ref<MetricsSnapshot[]>([]);

	/** An hour of one-per-second snapshots, matching the server's own retention. */
	const MAX_HISTORY_POINTS = 3600;
	const clients = ref<ClientInfo[]>([]);
	const bans = ref<BanEntry[]>([]);
	const auditLog = ref<AuditEntry[]>([]);
	const rooms = ref<RoomSummary[]>([]);
	const cluster = ref<ClusterStatus | null>(null);
	/** Whether this server exposes rooms at all; false hides the section. */
	const roomsAvailable = ref(true);
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

	async function fetchRooms() {
		try {
			const result = await api.getRooms();
			rooms.value = result.rooms;
			roomsAvailable.value = true;
		} catch (e) {
			// A server without room support answers 404; treat that as "not
			// available" and hide the section rather than showing an error.
			const message = e instanceof Error ? e.message : "Failed to fetch rooms";
			if (message.includes("404")) {
				roomsAvailable.value = false;
				rooms.value = [];
				return;
			}
			error.value = message;
		}
	}

	async function fetchCluster() {
		try {
			cluster.value = await api.getClusterStatus();
		} catch (e) {
			const message = e instanceof Error ? e.message : "Failed to fetch cluster status";
			if (message.includes("404")) {
				cluster.value = null;
				return;
			}
			error.value = message;
		}
	}

	async function dissolveRoom(name: string) {
		try {
			await api.dissolveRoom(name);
			await fetchRooms();
			return true;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to dissolve room";
			return false;
		}
	}

	/**
	 * Place peers into a room, creating it if this is its first member.
	 *
	 * Returns the per-peer outcome rather than a bare boolean, so the caller can
	 * say which peers moved and which were skipped: a batch where one peer has
	 * since disconnected still moves the rest.
	 */
	async function addRoomMembers(name: string, peerIds: string[]) {
		try {
			const result = await api.addRoomMembers(name, peerIds);
			await fetchRooms();
			return result;
		} catch (e) {
			error.value = e instanceof Error ? e.message : "Failed to add room members";
			return null;
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
			await Promise.all([
				fetchStatus(),
				fetchMetrics(),
				fetchClients(),
				fetchBans(),
				fetchRooms(),
				fetchCluster(),
			]);

			// Connect WebSocket for real-time updates
			ws.connect();

			// Listen for metrics updates
			ws.onMetrics(m => {
				metrics.value = m;

				// Append to history too, or every chart and average derived from it
				// stays frozen at whatever the single on-mount fetch returned: the
				// dashboard's throughput reading drifted further from reality the
				// longer the page stayed open.
				const previous = metricsHistory.value.at(-1);
				if (!previous || m.timestamp > previous.timestamp) {
					metricsHistory.value = [...metricsHistory.value, m];
					// Bound the array so a long-lived tab cannot grow without limit.
					// An hour at one snapshot per second matches the server's own
					// retention, so nothing is trimmed that the API would still hold.
					if (metricsHistory.value.length > MAX_HISTORY_POINTS) {
						metricsHistory.value = metricsHistory.value.slice(-MAX_HISTORY_POINTS);
					}
				}
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

	/**
	 * Drop every server-derived value.
	 *
	 * Disconnecting only closed the socket, so one instance's clients, rooms,
	 * bans and audit entries stayed on screen after logging out or switching to
	 * another server -- and were briefly shown as if they belonged to the new
	 * one. Anything fetched from a server is cleared here; connection settings
	 * are the caller's to manage.
	 */
	function reset() {
		cleanup();
		status.value = null;
		metrics.value = null;
		metricsHistory.value = [];
		clients.value = [];
		bans.value = [];
		auditLog.value = [];
		rooms.value = [];
		cluster.value = null;
		error.value = null;
	}

	return {
		// State
		status,
		metrics,
		metricsHistory,
		clients,
		bans,
		auditLog,
		rooms,
		cluster,
		roomsAvailable,
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
		fetchRooms,
		fetchCluster,
		dissolveRoom,
		addRoomMembers,
		disconnectClient,
		banClient,
		unbanClient,
		initialize,
		cleanup,
		reset,
	};
});
