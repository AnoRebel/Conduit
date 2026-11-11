import { createHmac } from "node:crypto";
import type { IIceServer } from "@conduit/shared";
import type { TurnConfig } from "../config.js";

/**
 * Mint TURN REST API credentials for one peer: username `<expiry>:<peerId>`,
 * credential base64(HMAC-SHA1(secret, username)). coturn with
 * `use-auth-secret` accepts them until the expiry without any per-user state.
 */
export function turnIceServers(
	turn: TurnConfig,
	peerId: string,
	nowMs: number = Date.now()
): IIceServer[] {
	const username = `${Math.floor(nowMs / 1000) + turn.ttl}:${peerId}`;
	const credential = createHmac("sha1", turn.secret).update(username).digest("base64");
	return [{ urls: turn.urls, username, credential }];
}
