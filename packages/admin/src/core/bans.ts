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

export function createBanManager(): BanManager {
	const bans = new Map<string, BanEntry>();

	function banClient(clientId: string, reason?: string): BanEntry {
		const entry: BanEntry = {
			id: clientId,
			type: "client",
			reason,
			bannedAt: Date.now(),
		};
		bans.set(`client:${clientId}`, entry);
		return entry;
	}

	function unbanClient(clientId: string): boolean {
		return bans.delete(`client:${clientId}`);
	}

	function banIP(ip: string, reason?: string): BanEntry {
		const entry: BanEntry = {
			id: ip,
			type: "ip",
			reason,
			bannedAt: Date.now(),
		};
		bans.set(`ip:${ip}`, entry);
		return entry;
	}

	function unbanIP(ip: string): boolean {
		return bans.delete(`ip:${ip}`);
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
		return getBans().filter((b) => b.type === "client");
	}

	function getIPBans(): BanEntry[] {
		return getBans().filter((b) => b.type === "ip");
	}

	function getBan(id: string): BanEntry | undefined {
		return bans.get(`client:${id}`) ?? bans.get(`ip:${id}`);
	}

	function clear(): void {
		bans.clear();
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
