/**
 * Connection settings composable — manages dynamic server URL, auth type,
 * and credentials with localStorage persistence.
 *
 * Inspired by the Socket.IO Admin UI connection dialog pattern:
 * the admin-ui becomes a generic tool that can connect to ANY Conduit server.
 */

export type AuthType = "apiKey" | "basic" | "none";

export interface ConnectionSettings {
	/** Server URL (e.g., https://conduit.anorebel.net/admin/v1) */
	serverUrl: string;
	/** WebSocket URL override (optional — derived from serverUrl if empty) */
	wsUrl: string;
	/** Authentication type */
	authType: AuthType;
	/** API key (when authType === "apiKey") */
	apiKey: string;
	/** Basic auth username (when authType === "basic") */
	username: string;
	/** Basic auth password (when authType === "basic") */
	password: string;
	/** Whether to remember connection settings in localStorage */
	remember: boolean;
}

const DEFAULT_SETTINGS: ConnectionSettings = {
	serverUrl: "",
	wsUrl: "",
	authType: "apiKey",
	apiKey: "",
	username: "",
	password: "",
	remember: true,
};

/**
 * Derive a WebSocket URL from an HTTP server URL.
 * https://... → wss://.../ws
 * http://... → ws://.../ws
 */
function deriveWsUrl(serverUrl: string): string {
	if (!serverUrl) return "";
	try {
		const url = new URL(serverUrl);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		// Ensure the path ends with /ws
		const path = url.pathname.replace(/\/+$/, "");
		url.pathname = `${path}/ws`;
		return url.toString();
	} catch {
		return "";
	}
}

export function useConnection() {
	const config = useRuntimeConfig();

	// Persisted connection settings — auto-syncs with localStorage
	const stored = useLocalStorage<ConnectionSettings>("conduit-connection", {
		...DEFAULT_SETTINGS,
	});

	// The effective server URL — from stored settings or env fallback
	const serverUrl = computed(() => {
		return stored.value.serverUrl || config.public.adminApiUrl || "";
	});

	// The effective WS URL — explicit override, or derived from server URL
	const wsUrl = computed(() => {
		if (stored.value.wsUrl) return stored.value.wsUrl;
		const envWs = config.public.adminWsUrl;
		if (envWs) return envWs;
		return deriveWsUrl(serverUrl.value);
	});

	// Auth type
	const authType = computed(() => stored.value.authType);

	// Whether we have enough credentials to attempt a connection
	const hasCredentials = computed(() => {
		switch (stored.value.authType) {
			case "apiKey":
				return !!stored.value.apiKey;
			case "basic":
				return !!stored.value.username && !!stored.value.password;
			case "none":
				return true;
			default:
				return false;
		}
	});

	// Whether we have a server URL configured
	const hasServerUrl = computed(() => !!serverUrl.value);

	// Whether the connection dialog should be shown
	const isConfigured = computed(() => hasServerUrl.value && hasCredentials.value);

	/**
	 * Save new connection settings. If `remember` is false, only keep
	 * the settings in memory for the current session.
	 */
	function saveSettings(settings: Partial<ConnectionSettings>) {
		stored.value = {
			...stored.value,
			...settings,
		};
	}

	/**
	 * Clear all stored connection settings — resets to defaults.
	 */
	function clearSettings() {
		stored.value = { ...DEFAULT_SETTINGS };
	}

	/**
	 * Get authorization headers for the current auth type.
	 */
	function getAuthHeaders(): Record<string, string> {
		switch (stored.value.authType) {
			case "apiKey":
				if (stored.value.apiKey) {
					return { "X-API-Key": stored.value.apiKey };
				}
				return {};
			case "basic":
				if (stored.value.username && stored.value.password) {
					const encoded = btoa(`${stored.value.username}:${stored.value.password}`);
					return { Authorization: `Basic ${encoded}` };
				}
				return {};
			default:
				return {};
		}
	}

	return {
		/** Reactive connection settings (persisted to localStorage) */
		settings: stored,
		/** Effective server URL (stored or env fallback) */
		serverUrl,
		/** Effective WebSocket URL */
		wsUrl,
		/** Current auth type */
		authType,
		/** Whether credentials are sufficient for the current auth type */
		hasCredentials,
		/** Whether a server URL is configured */
		hasServerUrl,
		/** Whether connection is fully configured (URL + credentials) */
		isConfigured,
		/** Save partial settings updates */
		saveSettings,
		/** Reset to defaults */
		clearSettings,
		/** Get auth headers for current auth type */
		getAuthHeaders,
		/** Derive WS URL from HTTP URL (exported for testing) */
		deriveWsUrl,
	};
}
