import type { ServerConfig } from "../../config.js";
import type { IRealm } from "../realm.js";

export interface CheckBrokenConnectionsOptions {
	onClose?: (clientId: string) => void;
}

export class CheckBrokenConnections {
	private _intervalId: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly realm: IRealm,
		private readonly config: ServerConfig,
		private readonly options: CheckBrokenConnectionsOptions = {}
	) {}

	start(): void {
		if (this._intervalId) {
			return;
		}

		this._intervalId = setInterval(() => {
			this.checkConnections();
		}, this.config.aliveTimeout);
	}

	stop(): void {
		if (this._intervalId) {
			clearInterval(this._intervalId);
			this._intervalId = null;
		}
	}

	checkConnections(): void {
		const now = Date.now();
		const clientIds = this.realm.getClientIds();

		for (const clientId of clientIds) {
			const client = this.realm.getClient(clientId);

			if (!client) {
				continue;
			}

			const timeSinceLastPing = now - client.lastPing;

			if (timeSinceLastPing > this.config.aliveTimeout) {
				// Client has not sent a heartbeat in too long
				const socket = client.socket;

				if (socket) {
					try {
						socket.close();
					} catch {
						// Ignore close errors
					}
				}

				this.realm.removeClient(clientId);
				this.options.onClose?.(clientId);
			}
		}
	}
}
