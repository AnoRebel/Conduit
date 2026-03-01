import type { PersistenceStore } from "../persistence/index.js";
import type { BanEntry } from "../types.js";

export interface BanManager {
	banClient(clientId: string, reason?: string): BanEntry;
	unbanClient(clientId: string): boolean;
	banIP(ip: string, reason?: string): BanEntry;
	unbanIP(ip: string): boolean;
	isClientBanned(clientId: string): boolean;
	isIPBanned(ip: string): boolean;
	getBans(): BanEntry[];
	getClientBans(): BanEntry[];
	getIPBans(): BanEntry[];
	getBan(id: string): BanEntry | undefined;
	clear(): void;
}

export interface BanManagerOptions {
	store?: PersistenceStore;
}

export function createBanManager(options: BanManagerOptions = {}): BanManager {
	const { store } = options;
	const bans = new Map<string, BanEntry>();

	// Hydrate from persistence store on creation
	if (store) {
		for (const ban of store.getBans()) {
			bans.set(`${ban.type}:${ban.id}`, ban);
		}
	}

	function banClient(clientId: string, reason?: string): BanEntry {
		const entry: BanEntry = {
			id: clientId,
			type: "client",
			reason,
			bannedAt: Date.now(),
		};
		bans.set(`client:${clientId}`, entry);
		store?.saveBan(entry);
		return entry;
	}

	function unbanClient(clientId: string): boolean {
		const removed = bans.delete(`client:${clientId}`);
		if (removed) {
			store?.removeBan("client", clientId);
		}
		return removed;
	}

	function banIP(ip: string, reason?: string): BanEntry {
		const entry: BanEntry = {
			id: ip,
			type: "ip",
			reason,
			bannedAt: Date.now(),
		};
		bans.set(`ip:${ip}`, entry);
		store?.saveBan(entry);
		return entry;
	}

	function unbanIP(ip: string): boolean {
		const removed = bans.delete(`ip:${ip}`);
		if (removed) {
			store?.removeBan("ip", ip);
		}
		return removed;
	}

	function isClientBanned(clientId: string): boolean {
		return bans.has(`client:${clientId}`);
	}

	function isIPBanned(ip: string): boolean {
		return bans.has(`ip:${ip}`);
	}

	function getBans(): BanEntry[] {
		return Array.from(bans.values());
	}

	function getClientBans(): BanEntry[] {
		return getBans().filter(b => b.type === "client");
	}

	function getIPBans(): BanEntry[] {
		return getBans().filter(b => b.type === "ip");
	}

	function getBan(id: string): BanEntry | undefined {
		return bans.get(`client:${id}`) ?? bans.get(`ip:${id}`);
	}

	function clear(): void {
		bans.clear();
		store?.clearBans();
	}

	return {
		banClient,
		unbanClient,
		banIP,
		unbanIP,
		isClientBanned,
		isIPBanned,
		getBans,
		getClientBans,
		getIPBans,
		getBan,
		clear,
	};
}
