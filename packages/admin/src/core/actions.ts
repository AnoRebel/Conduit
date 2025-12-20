import type { IMessage } from "@conduit/shared";
import type { InstrumentableServerCore } from "../metrics/instrumentation.js";
import type { BanManager } from "./bans.js";
import type { AuditLogger } from "./audit.js";
import type { RateLimitConfig } from "../types.js";

/**
 * Extended server core interface with additional methods we need
 */
export interface ActionableServerCore extends InstrumentableServerCore {
	readonly realm: {
		getClientIds(): string[];
		getClient(id: string): ActionableClient | undefined;
		removeClient(id: string): boolean;
	};
	readonly config: {
		rateLimit?: {
			enabled?: boolean;
			maxTokens?: number;
			refillRate?: number;
		};
	};
}

export interface ActionableClient {
	id: string;
	token: string;
	socket: { close: () => void; send: (data: string) => void } | null;
	send(message: IMessage): void;
}

export interface AdminActions {
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
}

export interface AdminActionsOptions {
	serverCore: ActionableServerCore;
	banManager: BanManager;
	auditLogger: AuditLogger;
}

export function createAdminActions(options: AdminActionsOptions): AdminActions {
	const { serverCore, banManager, auditLogger } = options;

	function disconnectClient(clientId: string, userId: string): boolean {
		const client = serverCore.realm.getClient(clientId);
		if (!client) {
			return false;
		}

		auditLogger.log("disconnect_client", userId, { clientId });

		if (client.socket) {
			client.socket.close();
		}
		serverCore.realm.removeClient(clientId);

		return true;
	}

	function disconnectAllClients(userId: string): number {
		const clientIds = serverCore.realm.getClientIds();

		auditLogger.log("disconnect_all", userId, { count: clientIds.length });

		let count = 0;
		for (const clientId of clientIds) {
			const client = serverCore.realm.getClient(clientId);
			if (client) {
				if (client.socket) {
					client.socket.close();
				}
				serverCore.realm.removeClient(clientId);
				count++;
			}
		}

		return count;
	}

	function clearClientQueue(clientId: string, userId: string): boolean {
		// Note: This would need access to the message queue
		// For now, we log the action but the actual implementation
		// depends on the server core exposing the message queue
		auditLogger.log("clear_queue", userId, { clientId });

		// Placeholder - actual implementation needs message queue access
		return true;
	}

	function banClient(
		clientId: string,
		reason: string | undefined,
		userId: string,
	): boolean {
		const entry = banManager.banClient(clientId, reason);

		auditLogger.log("ban_client", userId, { clientId, reason });

		// Also disconnect if currently connected
		const client = serverCore.realm.getClient(clientId);
		if (client && client.socket) {
			client.socket.close();
			serverCore.realm.removeClient(clientId);
		}

		return !!entry;
	}

	function unbanClient(clientId: string, userId: string): boolean {
		const result = banManager.unbanClient(clientId);

		if (result) {
			auditLogger.log("unban_client", userId, { clientId });
		}

		return result;
	}

	function banIP(ip: string, reason: string | undefined, userId: string): boolean {
		const entry = banManager.banIP(ip, reason);

		auditLogger.log("ban_ip", userId, { ip, reason });

		// Note: Disconnecting all clients from this IP would require
		// tracking IP addresses in the client - not currently available

		return !!entry;
	}

	function unbanIP(ip: string, userId: string): boolean {
		const result = banManager.unbanIP(ip);

		if (result) {
			auditLogger.log("unban_ip", userId, { ip });
		}

		return result;
	}

	function broadcastMessage(message: IMessage, userId: string): number {
		const clientIds = serverCore.realm.getClientIds();

		auditLogger.log("broadcast", userId, {
			messageType: message.type,
			recipientCount: clientIds.length,
		});

		let sent = 0;
		for (const clientId of clientIds) {
			const client = serverCore.realm.getClient(clientId);
			if (client && client.socket) {
				try {
					client.send(message);
					sent++;
				} catch {
					// Client may have disconnected
				}
			}
		}

		return sent;
	}

	function updateRateLimits(config: Partial<RateLimitConfig>, userId: string): void {
		auditLogger.log("update_rate_limits", userId, { config });

		// Note: Actual rate limit updates would need to be implemented
		// in the server core. This logs the intent.
		// The server core would need to expose a method to update rate limits.
	}

	function toggleFeature(
		feature: "discovery" | "relay",
		enabled: boolean,
		userId: string,
	): void {
		auditLogger.log("toggle_feature", userId, { feature, enabled });

		// Note: Feature toggling would need server core support
		// This logs the intent for now.
	}

	return {
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
	};
}
