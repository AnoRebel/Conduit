import type { IMessage } from "@conduit/shared";
import { type AuthManager, createAuthManager } from "../auth/index.js";
import type { AdminConfig } from "../config.js";
import { createMetricsCollector, type MetricsCollector } from "../metrics/collector.js";
import {
	type InstrumentableServerCore,
	instrumentServerCore,
	syncRealmToMetrics,
} from "../metrics/instrumentation.js";
import type {
	AuditEntry,
	BanEntry,
	ClientDetails,
	ClientInfo,
	MetricsSnapshot,
	RateLimitConfig,
	ServerStatus,
} from "../types.js";
import { type ActionableServerCore, type AdminActions, createAdminActions } from "./actions.js";
import { type AuditLogger, createAuditLogger } from "./audit.js";
import { type BanManager, createBanManager } from "./bans.js";

export interface AdminCore {
	readonly metrics: MetricsCollector;
	readonly config: AdminConfig;
	readonly auth: AuthManager;
	readonly bans: BanManager;
	readonly audit: AuditLogger;

	// Status
	getServerStatus(): ServerStatus;
	getClientList(): ClientInfo[];
	getClientDetails(id: string): ClientDetails | null;
	getMetricsSnapshot(): MetricsSnapshot;
	getMetricsHistory(startTime: number, endTime: number): MetricsSnapshot[];

	// Bans
	getBans(): BanEntry[];
	isClientBanned(clientId: string): boolean;
	isIPBanned(ip: string): boolean;

	// Audit
	getAuditLog(limit?: number): AuditEntry[];

	// Actions (require userId for audit)
	disconnectClient(clientId: string, userId: string): boolean;
	disconnectAllClients(userId: string): number;
	clearClientQueue(clientId: string, userId: string): boolean;
	banClient(clientId: string, reason: string | undefined, userId: string): boolean;
	unbanClient(clientId: string, userId: string): boolean;
	banIP(ip: string, reason: string | undefined, userId: string): boolean;
	unbanIP(ip: string, userId: string): boolean;
	broadcastMessage(message: IMessage, userId: string): number;
	updateRateLimits(config: Partial<RateLimitConfig>, userId: string): void;
	toggleFeature(feature: "discovery" | "relay", enabled: boolean, userId: string): void;

	// Lifecycle
	attachToServer(core: InstrumentableServerCore): void;
	detach(): void;
	destroy(): void;

	// State
	readonly isAttached: boolean;
	readonly serverCore: InstrumentableServerCore | null;
}

export interface CreateAdminCoreOptions {
	config: AdminConfig;
}

export function createAdminCore(options: CreateAdminCoreOptions): AdminCore {
	const { config } = options;

	// Initialize components
	const metrics = createMetricsCollector(config.metrics);
	const auth = createAuthManager(config.auth);
	const bans = createBanManager();
	const audit = createAuditLogger({
		enabled: config.audit.enabled,
		maxEntries: config.audit.maxEntries,
	});

	// Server attachment state
	let serverCore: ActionableServerCore | null = null;
	let uninstrument: (() => void) | null = null;
	let actions: AdminActions | null = null;

	// Start time for uptime calculation
	const startTime = Date.now();

	function getServerStatus(): ServerStatus {
		const snapshot = metrics.getSnapshot();

		return {
			running: serverCore !== null,
			uptime: Date.now() - startTime,
			version: "1.0.0", // Would come from package.json
			clients: snapshot.clients,
			messages: snapshot.messages,
			memory: snapshot.memory,
		};
	}

	function getClientList(): ClientInfo[] {
		if (!serverCore) {
			return [];
		}

		const clientIds = serverCore.realm.getClientIds();
		const now = Date.now();

		return clientIds.map(id => {
			const client = serverCore?.realm.getClient(id);
			return {
				id,
				connected: !!client,
				connectedAt: now, // Would need to track this in instrumentation
				messagesReceived: 0, // Would need per-client tracking
				messagesSent: 0,
				lastActivity: now,
			};
		});
	}

	function getClientDetails(id: string): ClientDetails | null {
		if (!serverCore) {
			return null;
		}

		const client = serverCore.realm.getClient(id);
		if (!client) {
			return null;
		}

		return {
			id: client.id,
			connected: true,
			connectedAt: Date.now(), // Would need tracking
			messagesReceived: 0,
			messagesSent: 0,
			lastActivity: Date.now(),
			ip: undefined, // Would need socket access
			userAgent: undefined,
			queuedMessages: 0, // Would need message queue access
		};
	}

	function getMetricsSnapshot(): MetricsSnapshot {
		return metrics.getSnapshot();
	}

	function getMetricsHistory(startTime: number, endTime: number): MetricsSnapshot[] {
		return metrics.getHistory(startTime, endTime);
	}

	function getBans(): BanEntry[] {
		return bans.getBans();
	}

	function isClientBanned(clientId: string): boolean {
		return bans.isClientBanned(clientId);
	}

	function isIPBanned(ip: string): boolean {
		return bans.isIPBanned(ip);
	}

	function getAuditLog(limit?: number): AuditEntry[] {
		return audit.getEntries(limit);
	}

	// Action methods - delegate to actions module
	function disconnectClient(clientId: string, userId: string): boolean {
		if (!actions) {
			return false;
		}
		return actions.disconnectClient(clientId, userId);
	}

	function disconnectAllClients(userId: string): number {
		if (!actions) {
			return 0;
		}
		return actions.disconnectAllClients(userId);
	}

	function clearClientQueue(clientId: string, userId: string): boolean {
		if (!actions) {
			return false;
		}
		return actions.clearClientQueue(clientId, userId);
	}

	function banClient(clientId: string, reason: string | undefined, userId: string): boolean {
		if (!actions) {
			// Can still ban even without server attached
			bans.banClient(clientId, reason);
			audit.log("ban_client", userId, { clientId, reason });
			return true;
		}
		return actions.banClient(clientId, reason, userId);
	}

	function unbanClient(clientId: string, userId: string): boolean {
		if (!actions) {
			const result = bans.unbanClient(clientId);
			if (result) {
				audit.log("unban_client", userId, { clientId });
			}
			return result;
		}
		return actions.unbanClient(clientId, userId);
	}

	function banIP(ip: string, reason: string | undefined, userId: string): boolean {
		if (!actions) {
			bans.banIP(ip, reason);
			audit.log("ban_ip", userId, { ip, reason });
			return true;
		}
		return actions.banIP(ip, reason, userId);
	}

	function unbanIP(ip: string, userId: string): boolean {
		if (!actions) {
			const result = bans.unbanIP(ip);
			if (result) {
				audit.log("unban_ip", userId, { ip });
			}
			return result;
		}
		return actions.unbanIP(ip, userId);
	}

	function broadcastMessage(message: IMessage, userId: string): number {
		if (!actions) {
			return 0;
		}
		return actions.broadcastMessage(message, userId);
	}

	function updateRateLimits(rateLimitConfig: Partial<RateLimitConfig>, userId: string): void {
		if (!actions) {
			return;
		}
		actions.updateRateLimits(rateLimitConfig, userId);
	}

	function toggleFeature(feature: "discovery" | "relay", enabled: boolean, userId: string): void {
		if (!actions) {
			return;
		}
		actions.toggleFeature(feature, enabled, userId);
	}

	function attachToServer(core: InstrumentableServerCore): void {
		if (serverCore) {
			detach();
		}

		serverCore = core as ActionableServerCore;

		// Sync current state
		syncRealmToMetrics(core, metrics);

		// Instrument the server
		uninstrument = instrumentServerCore(core, metrics, {
			onConnectionOpened: _clientId => {
				// Could emit WebSocket event here
			},
			onConnectionClosed: _clientId => {
				// Could emit WebSocket event here
			},
			onError: _type => {
				// Could emit WebSocket event here
			},
		});

		// Create actions with the attached server
		actions = createAdminActions({
			serverCore,
			banManager: bans,
			auditLogger: audit,
		});

		audit.log("server_attached", "system");
	}

	function detach(): void {
		if (uninstrument) {
			uninstrument();
			uninstrument = null;
		}

		if (serverCore) {
			audit.log("server_detached", "system");
		}

		serverCore = null;
		actions = null;
	}

	function destroy(): void {
		detach();
		metrics.destroy();
		bans.clear();
		audit.clear();
	}

	return {
		metrics,
		config,
		auth,
		bans,
		audit,

		getServerStatus,
		getClientList,
		getClientDetails,
		getMetricsSnapshot,
		getMetricsHistory,

		getBans,
		isClientBanned,
		isIPBanned,

		getAuditLog,

		disconnectClient,
		disconnectAllClients,
		clearClientQueue,
		banClient,
		unbanClient,
		banIP,
		unbanIP,
		broadcastMessage,
		updateRateLimits,
		toggleFeature,

		attachToServer,
		detach,
		destroy,

		get isAttached() {
			return serverCore !== null;
		},
		get serverCore() {
			return serverCore;
		},
	};
}

export {
	type ActionableClient,
	type ActionableServerCore,
	type AdminActions,
	createAdminActions,
} from "./actions.js";
export { type AuditLogger, type AuditLoggerOptions, createAuditLogger } from "./audit.js";
export { type BanManager, createBanManager } from "./bans.js";
