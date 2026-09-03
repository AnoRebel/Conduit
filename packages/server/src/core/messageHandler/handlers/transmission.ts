import { type IMessage, MessageType } from "@conduit/shared";
import type { IClient } from "../../client.js";
import { deliverAcrossCluster, ensureValidDestination } from "../../delivery.js";
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

	if (!ensureValidDestination(client, dst)) {
		return;
	}

	// Resolved across the cluster: a destination on another instance is
	// forwarded to its owning node, and only a peer no node claims is queued.
	// Local delivery never consults the backend, so the common case is
	// unchanged. Fire-and-forget, matching how sends already behave.
	void deliverAcrossCluster(realm, { type, src: client.id, dst, payload }, dst, client.id);
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
