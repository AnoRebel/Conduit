import { type IMessage, MessageType } from "@conduit/shared";
import type { ServerConfig } from "../../../config.js";
import type { IClient } from "../../client.js";
import { deliverFanOut, groupRecipientsByNode, withinMulticastSizeLimit } from "../../delivery.js";
import type { IRateLimiter } from "../../rateLimiter.js";
import type { IRealm } from "../../realm.js";
import type { RoomRegistry } from "../../roomRegistry.js";
import type { SubscribeRefusal, TopicRegistry } from "../../topicRegistry.js";
import { validateRoomName, validateTopicName, validateTopicPattern } from "../../validation.js";

/** Error text for a refused subscription. */
function refusalMessage(refusal: SubscribeRefusal, config: ServerConfig): string {
	switch (refusal) {
		case "topics-disabled":
			return "Topics are not enabled on this server";
		case "topic-full":
			return `Topic is at capacity (${config.topics.maxSubscribersPerTopic} subscribers)`;
		case "peer-subscription-limit":
			return `Peer holds the maximum number of subscriptions (${config.topics.maxSubscriptionsPerPeer})`;
		case "server-topic-limit":
			return `Server is at its topic limit (${config.topics.maxTopics})`;
		case "unauthorized":
			return "Not permitted to use that topic";
	}
}

/**
 * Send an error, optionally naming the topic or room it concerns.
 *
 * The context lets a client route the failure to the handle that caused it
 * rather than treating it as fatal to the whole peer.
 */
function sendError(
	client: IClient,
	msg: string,
	context: { topic?: string; room?: string } = {}
): void {
	client.send({ type: MessageType.ERROR, payload: { msg, ...context } });
}

/**
 * Fan a message out to a resolved recipient set, local and remote.
 *
 * Everything goes through {@link deliverFanOut} so the per-message recipient
 * ceiling and the weighted rate-limit charge apply in one place; a handler that
 * sent directly could bypass both.
 */
async function multicast(
	realm: IRealm,
	config: ServerConfig,
	rateLimiter: IRateLimiter | null,
	senderId: string,
	message: IMessage,
	peerIds: readonly string[]
): Promise<{ refused?: string }> {
	// The ceiling is checked against the cluster-wide recipient count, before
	// the set is split by node, so it cannot be evaded by spreading recipients
	// across instances.
	if (peerIds.length > config.topics.maxRecipientsPerMessage) {
		return {
			refused: `Message would reach more than the maximum of ${config.topics.maxRecipientsPerMessage} recipients`,
		};
	}

	const { local, remote } = await groupRecipientsByNode(realm, peerIds);

	// Charge for every recipient, local and remote, before writing to any of
	// them. Passing the full count keeps the budget honest even when most
	// recipients live on other nodes.
	const totalRemote = Array.from(remote.values()).reduce((n, t) => n + t.length, 0);
	const charged = deliverFanOut(realm, config, senderId, message, local, rateLimiter, totalRemote);
	if ("refused" in charged) {
		return {
			refused:
				charged.refused === "rate-limited"
					? "Rate limit exceeded. Please slow down."
					: `Message would reach more than the maximum of ${config.topics.maxRecipientsPerMessage} recipients`,
		};
	}

	for (const [nodeId, targets] of remote) {
		await realm.cluster
			.forward(nodeId, {
				fromNodeId: realm.cluster.nodeId,
				srcPeerId: senderId,
				targets,
				message,
			})
			.catch(() => undefined);
	}

	return {};
}

/** Handle a request to subscribe to a topic or prefix pattern. */
export async function handleSubscribe(
	client: IClient,
	message: IMessage,
	config: ServerConfig,
	topics: TopicRegistry
): Promise<void> {
	const pattern = (message.payload as { topic?: unknown } | undefined)?.topic;
	const validation = validateTopicPattern(pattern);
	if (!validation.valid) {
		sendError(client, validation.error ?? "Invalid topic pattern");
		return;
	}

	const result = await topics.subscribe(client.id, pattern as string);
	if (!result.ok) {
		sendError(client, refusalMessage(result.refusal, config), { topic: pattern as string });
		return;
	}

	client.send({
		type: MessageType.SUBSCRIBED,
		dst: client.id,
		payload: { topic: pattern as string },
	});
}

/** Handle a request to remove a subscription. */
export async function handleUnsubscribe(
	client: IClient,
	message: IMessage,
	topics: TopicRegistry
): Promise<void> {
	const pattern = (message.payload as { topic?: unknown } | undefined)?.topic;
	const validation = validateTopicPattern(pattern);
	if (!validation.valid) {
		sendError(client, validation.error ?? "Invalid topic pattern");
		return;
	}

	const result = await topics.unsubscribe(client.id, pattern as string);
	if (!result.ok) {
		sendError(client, "Not subscribed to that topic", { topic: pattern as string });
		return;
	}

	client.send({
		type: MessageType.UNSUBSCRIBED,
		dst: client.id,
		payload: { topic: pattern as string },
	});
}

/** Handle a publication addressed to a topic. */
export async function handlePublish(
	client: IClient,
	message: IMessage,
	realm: IRealm,
	config: ServerConfig,
	topics: TopicRegistry,
	rateLimiter: IRateLimiter | null
): Promise<void> {
	if (!config.topics.enabled) {
		sendError(client, "Topics are not enabled on this server");
		return;
	}

	const payload = message.payload as
		| { topic?: unknown; data?: unknown; selfDeliver?: unknown }
		| undefined;

	const validation = validateTopicName(payload?.topic);
	if (!validation.valid) {
		sendError(client, validation.error ?? "Invalid topic name");
		return;
	}
	const topic = payload?.topic as string;

	if (!topics.canPublish(client.id, topic)) {
		sendError(client, "Not permitted to use that topic");
		return;
	}

	// Size is checked before fan-out, so an oversized payload is never
	// transmitted to anyone.
	if (!withinMulticastSizeLimit(config, payload?.data)) {
		sendError(
			client,
			`Multicast payload exceeds the limit of ${config.topics.maxMulticastMessageSize} bytes`
		);
		return;
	}

	const matched = await topics.subscribers(topic);
	const recipients = matched
		.map(m => m.peerId)
		// The publisher is excluded unless it asked for its own copy and holds a
		// matching subscription.
		.filter(peerId => peerId !== client.id || payload?.selfDeliver === true);

	// A publication with no subscribers is accepted and simply goes nowhere; it
	// is never retained for a future subscriber.
	if (recipients.length === 0) {
		return;
	}

	const outcome = await multicast(
		realm,
		config,
		rateLimiter,
		client.id,
		{
			type: MessageType.TOPIC_MESSAGE,
			src: client.id,
			payload: { topic, data: payload?.data },
		},
		recipients
	);

	if (outcome.refused) {
		sendError(client, outcome.refused);
	}
}

/** Handle a broadcast addressed to a room's members. */
export async function handleRoomBroadcast(
	client: IClient,
	message: IMessage,
	realm: IRealm,
	config: ServerConfig,
	rooms: RoomRegistry,
	rateLimiter: IRateLimiter | null
): Promise<void> {
	if (!config.topics.enabled) {
		sendError(client, "Topics are not enabled on this server");
		return;
	}

	const payload = message.payload as { room?: unknown; data?: unknown } | undefined;

	const validation = validateRoomName(payload?.room);
	if (!validation.valid) {
		sendError(client, validation.error ?? "Invalid room name");
		return;
	}
	const room = payload?.room as string;

	// A non-member is refused with the same message whether the room exists or
	// not, so a broadcast cannot be used to probe for rooms.
	if (!(await rooms.isMember(client.id, room))) {
		sendError(client, "Not a member of that room", { room });
		return;
	}

	if (!withinMulticastSizeLimit(config, payload?.data)) {
		sendError(
			client,
			`Multicast payload exceeds the limit of ${config.topics.maxMulticastMessageSize} bytes`
		);
		return;
	}

	const others = await rooms.otherMembers(room, client.id);
	if (others.length === 0) {
		return;
	}

	const outcome = await multicast(
		realm,
		config,
		rateLimiter,
		client.id,
		{
			type: MessageType.ROOM_BROADCAST,
			src: client.id,
			payload: { room, data: payload?.data },
		},
		others.map(m => m.peerId)
	);

	if (outcome.refused) {
		sendError(client, outcome.refused);
	}
}
