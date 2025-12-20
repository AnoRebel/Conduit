import type { IClient } from "../../client.js";

export function handleHeartbeat(client: IClient): void {
	client.updateLastPing();
}
