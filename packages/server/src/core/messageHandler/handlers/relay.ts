import { type IMessage, MessageType } from "@conduit/shared";
import type { ServerConfig } from "../../../config.js";
import type { IClient } from "../../client.js";
import type { IRealm } from "../../realm.js";

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

	const destinationClient = realm.getClient(dst);

	if (destinationClient) {
		const relayMessage: IMessage = {
			type: MessageType.RELAY,
			src: client.id,
			dst,
			payload: relayPayload,
		};

		destinationClient.send(relayMessage);
	} else {
		// Destination not found
		client.send({
			type: MessageType.ERROR,
			payload: { msg: `Relay target peer ${dst} not found` },
		});
	}
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

	const destinationClient = realm.getClient(dst);

	if (destinationClient) {
		// Notify destination about incoming relay connection
		const openMessage: IMessage = {
			type: MessageType.RELAY_OPEN,
			src: client.id,
			dst,
			payload,
		};

		destinationClient.send(openMessage);

		// Notify sender that relay is ready
		client.send({
			type: MessageType.RELAY_OPEN,
			src: dst,
			dst: client.id,
			payload,
		});
	} else {
		// Destination not found
		client.send({
			type: MessageType.ERROR,
			payload: { msg: `Relay target peer ${dst} not found` },
		});
	}
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

	const destinationClient = realm.getClient(dst);

	if (destinationClient) {
		const closeMessage: IMessage = {
			type: MessageType.RELAY_CLOSE,
			src: client.id,
			dst,
			payload,
		};

		destinationClient.send(closeMessage);
	}
}
