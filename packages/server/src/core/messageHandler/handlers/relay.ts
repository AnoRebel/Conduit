import { type IMessage, MessageType } from "@conduit/shared";
import type { ServerConfig } from "../../../config.js";
import type { IClient } from "../../client.js";
import { ensureValidDestination, resolvePeerNode } from "../../delivery.js";
import type { IRealm } from "../../realm.js";

/**
 * Deliver a relay message to a peer anywhere in the cluster.
 *
 * Relay is a live transport, not signaling, so an undeliverable message is
 * reported or dropped rather than queued: a peer that is not connected has no
 * relay channel to receive it on.
 */
async function deliverRelay(
	realm: IRealm,
	message: IMessage,
	dst: string,
	client: IClient,
	notFoundMessage: string | null,
	onDelivered?: () => void
): Promise<void> {
	const local = realm.getClient(dst);
	if (local) {
		local.send(message);
		onDelivered?.();
		return;
	}

	const owner = await resolvePeerNode(realm, dst);
	if (owner !== null) {
		await realm.cluster
			.forward(owner, {
				fromNodeId: realm.cluster.nodeId,
				srcPeerId: client.id,
				targets: [dst],
				message,
			})
			.catch(() => undefined);
		onDelivered?.();
		return;
	}

	if (notFoundMessage !== null) {
		client.send({
			type: MessageType.ERROR,
			payload: { msg: notFoundMessage },
		});
	}
}

export interface RelayPayload {
	connectionId?: string;
	data?: unknown;
	label?: string;
	metadata?: unknown;
}

/**
 * Handle WebSocket relay messages for fallback transport
 */
export function handleRelay(
	client: IClient,
	message: IMessage,
	realm: IRealm,
	config: ServerConfig
): void {
	if (!config.relay.enabled) {
		return;
	}

	const { dst, payload } = message;

	if (!dst) {
		return;
	}

	if (!ensureValidDestination(client, dst)) {
		return;
	}

	const relayPayload = payload as RelayPayload;

	// Check message size limit
	if (relayPayload?.data) {
		const dataSize = JSON.stringify(relayPayload.data).length;
		if (dataSize > config.relay.maxMessageSize) {
			client.send({
				type: MessageType.ERROR,
				payload: { msg: `Relay message size exceeds limit (${config.relay.maxMessageSize} bytes)` },
			});
			return;
		}
	}

	const relayMessage: IMessage = {
		type: MessageType.RELAY,
		src: client.id,
		dst,
		payload: relayPayload,
	};

	// Resolved across the cluster so a relay peer on another instance is
	// reachable; only a peer no node claims is reported missing.
	void deliverRelay(realm, relayMessage, dst, client, `Relay target peer ${dst} not found`);
}

/**
 * Handle relay connection open
 */
export function handleRelayOpen(
	client: IClient,
	message: IMessage,
	realm: IRealm,
	config: ServerConfig
): void {
	if (!config.relay.enabled) {
		return;
	}

	const { dst, payload } = message;

	if (!dst) {
		return;
	}

	if (!ensureValidDestination(client, dst)) {
		return;
	}

	const openMessage: IMessage = {
		type: MessageType.RELAY_OPEN,
		src: client.id,
		dst,
		payload,
	};

	void deliverRelay(realm, openMessage, dst, client, `Relay target peer ${dst} not found`, () => {
		// Notify sender that relay is ready, once the far side has it.
		client.send({
			type: MessageType.RELAY_OPEN,
			src: dst,
			dst: client.id,
			payload,
		});
	});
}

/**
 * Handle relay connection close
 */
export function handleRelayClose(
	client: IClient,
	message: IMessage,
	realm: IRealm,
	config: ServerConfig
): void {
	if (!config.relay.enabled) {
		return;
	}

	const { dst, payload } = message;

	if (!dst) {
		return;
	}

	if (!ensureValidDestination(client, dst)) {
		return;
	}

	const closeMessage: IMessage = {
		type: MessageType.RELAY_CLOSE,
		src: client.id,
		dst,
		payload,
	};

	// No error when the peer is gone: a close for an absent peer is a no-op.
	void deliverRelay(realm, closeMessage, dst, client, null);
}
