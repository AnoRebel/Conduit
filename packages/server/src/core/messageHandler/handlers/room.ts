import { type IMessage, MessageType } from "@conduit/shared";
import type { ServerConfig } from "../../../config.js";
import type { IClient } from "../../client.js";
import { deliverFanOut, groupRecipientsByNode } from "../../delivery.js";
import type { IRateLimiter } from "../../rateLimiter.js";
import type { IRealm } from "../../realm.js";
import type { JoinRefusal, RoomRegistry } from "../../roomRegistry.js";
import { validateRoomName } from "../../validation.js";

/**
 * Error text for a refused join.
 *
 * "unauthorized" and "room-full" deliberately read the same to a caller who is
 * not a member: distinguishing them would turn the error into an oracle for
 * whether a room exists, which matters because an unguessable room name acts as
 * a capability under the default open configuration.
 */
function refusalMessage(refusal: JoinRefusal, config: ServerConfig): string {
	switch (refusal) {
		case "rooms-disabled":
			return "Rooms are not enabled on this server";
		case "room-full":
			return `Room is at capacity (${config.rooms.maxMembersPerRoom} members)`;
		case "peer-room-limit":
			return `Peer is in the maximum number of rooms (${config.rooms.maxRoomsPerPeer})`;
		case "server-room-limit":
			return `Server is at its room limit (${config.rooms.maxRooms})`;
		case "unauthorized":
			return "Not permitted to join that room";
	}
}

/**
 * Send an error naming the room it concerns.
 *
 * The `room` field lets a client route the failure to the handle that caused
 * it rather than treating every server error as fatal to the whole peer. It
 * carries no information the caller did not already supply.
 */
function sendRoomError(client: IClient, room: string | undefined, msg: string): void {
	client.send({
		type: MessageType.ERROR,
		payload: room === undefined ? { msg } : { msg, room },
	});
}

/** Read and validate the room name from a message payload. */
function readRoom(client: IClient, payload: unknown): string | null {
	const room = (payload as { room?: unknown } | undefined)?.room;
	const validation = validateRoomName(room);
	if (!validation.valid) {
		sendRoomError(
			client,
			typeof room === "string" ? room : undefined,
			validation.error ?? "Invalid room name"
		);
		return null;
	}
	return room as string;
}

/**
 * Notify a room's members that a peer arrived or departed.
 *
 * Routed through the shared fan-out path so presence is subject to the same
 * recipient ceiling and weighted rate limiting as any other multicast; a room
 * at the member cap must not become a way to amplify traffic for free.
 */
async function notifyRoom(
	realm: IRealm,
	config: ServerConfig,
	rateLimiter: IRateLimiter | null,
	senderId: string,
	room: string,
	type: typeof MessageType.PEER_JOINED | typeof MessageType.PEER_LEFT,
	peerId: string,
	registry: RoomRegistry
): Promise<void> {
	const others = await registry.otherMembers(room, peerId);
	if (others.length === 0) {
		return;
	}

	const { local, remote } = await groupRecipientsByNode(
		realm,
		others.map(m => m.peerId)
	);

	const message: IMessage = {
		type,
		src: peerId,
		payload: { room, peerId },
	};

	if (local.length > 0) {
		deliverFanOut(realm, config, senderId, message, local, rateLimiter);
	}

	// One forward per node carries every recipient on it.
	for (const [nodeId, targets] of remote) {
		await realm.cluster
			.forward(nodeId, {
				fromNodeId: realm.cluster.nodeId,
				srcPeerId: peerId,
				targets,
				message,
			})
			.catch(() => undefined);
	}
}

/** Handle a request to join a room. */
export async function handleJoin(
	client: IClient,
	message: IMessage,
	realm: IRealm,
	config: ServerConfig,
	registry: RoomRegistry,
	rateLimiter: IRateLimiter | null
): Promise<void> {
	const room = readRoom(client, message.payload);
	if (room === null) {
		return;
	}

	const result = await registry.join(client.id, room);
	if (!result.ok) {
		sendRoomError(client, room, refusalMessage(result.refusal, config));
		return;
	}

	// The member list reflects membership at the moment the join took effect and
	// never contains the joiner itself.
	client.send({
		type: MessageType.ROOM_STATE,
		dst: client.id,
		payload: { room, members: result.members.map(m => m.peerId) },
	});

	// Re-joining a room already joined succeeds without a second arrival
	// notification, so members never see a duplicate.
	if (!result.alreadyMember) {
		await notifyRoom(
			realm,
			config,
			rateLimiter,
			client.id,
			room,
			MessageType.PEER_JOINED,
			client.id,
			registry
		);
	}
}

/** Handle a request to leave a room. */
export async function handleLeaveRoom(
	client: IClient,
	message: IMessage,
	realm: IRealm,
	config: ServerConfig,
	registry: RoomRegistry,
	rateLimiter: IRateLimiter | null
): Promise<void> {
	const room = readRoom(client, message.payload);
	if (room === null) {
		return;
	}

	const result = await registry.leave(client.id, room);
	if (!result.ok) {
		sendRoomError(client, room, "Not a member of that room");
		return;
	}

	client.send({
		type: MessageType.LEAVE_ROOM,
		dst: client.id,
		payload: { room },
	});

	await notifyRoom(
		realm,
		config,
		rateLimiter,
		client.id,
		room,
		MessageType.PEER_LEFT,
		client.id,
		registry
	);
}

/**
 * Announce that a peer has left every room it occupied.
 *
 * Used when a connection is reaped rather than left explicitly, so remaining
 * members are told regardless of how the peer departed.
 */
export async function announceDeparture(
	realm: IRealm,
	config: ServerConfig,
	registry: RoomRegistry,
	rateLimiter: IRateLimiter | null,
	peerId: string
): Promise<void> {
	const rooms = await registry.roomsOf(peerId);
	for (const room of rooms) {
		await notifyRoom(
			realm,
			config,
			rateLimiter,
			peerId,
			room,
			MessageType.PEER_LEFT,
			peerId,
			registry
		);
	}
}
