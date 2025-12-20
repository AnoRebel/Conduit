import { type IMessage, MessageType } from "@conduit/shared";
import type { IClient } from "../../client.js";
import type { IRealm } from "../../realm.js";

export interface TransmissionPayload {
	type?: string;
	connectionId?: string;
	sdp?: unknown;
	candidate?: unknown;
	label?: string;
	metadata?: unknown;
	serialization?: string;
	reliable?: boolean;
}

export function handleTransmission(client: IClient, message: IMessage, realm: IRealm): void {
	const { type, dst, payload } = message;

	if (!dst) {
		return;
	}

	const destinationClient = realm.getClient(dst);

	if (destinationClient) {
		// Destination client is online, send directly
		const transmitted: IMessage = {
			type,
			src: client.id,
			dst,
			payload,
		};

		const sent = destinationClient.send(transmitted);

		if (!sent) {
			// Failed to send, queue the message
			realm.getMessageQueue().addMessage(dst, transmitted);
		}
	} else {
		// Destination client is offline, queue the message
		const transmitted: IMessage = {
			type,
			src: client.id,
			dst,
			payload,
		};

		realm.getMessageQueue().addMessage(dst, transmitted);
	}
}

export function handleOffer(client: IClient, message: IMessage, realm: IRealm): void {
	handleTransmission(client, message, realm);
}

export function handleAnswer(client: IClient, message: IMessage, realm: IRealm): void {
	handleTransmission(client, message, realm);
}

export function handleCandidate(client: IClient, message: IMessage, realm: IRealm): void {
	handleTransmission(client, message, realm);
}

export function handleLeave(client: IClient, message: IMessage, realm: IRealm): void {
	const { dst } = message;

	if (!dst) {
		return;
	}

	const destinationClient = realm.getClient(dst);

	if (destinationClient) {
		destinationClient.send({
			type: MessageType.LEAVE,
			src: client.id,
			dst,
		});
	}
}
