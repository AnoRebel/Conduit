import type { IMessage } from "@conduit/shared";
import { MessageType } from "@conduit/shared";
import type { ServerConfig } from "../config.js";
import type { IClient } from "./client.js";
import type { IRateLimiter } from "./rateLimiter.js";
import type { IRealm } from "./realm.js";
import { validateId } from "./validation.js";

/**
 * What to do when a recipient cannot be written to right now.
 *
 * Signaling (OFFER/ANSWER/CANDIDATE) is queued for an absent peer so a callee
 * that connects moments later still receives it. Multicast is dropped: a
 * publication is meaningful only to peers currently subscribed, and queueing it
 * would let one sender grow the queue by the size of a room.
 */
export type UndeliverablePolicy = "queue" | "drop";

/** A resolved delivery target. */
export interface Recipient {
	/** The peer's identifier. */
	id: string;
	/** The connected client, when it is local to this instance. */
	client?: IClient;
}

/** Why a fan-out was refused before any recipient was written to. */
export type FanOutRefusal = "too-many-recipients" | "rate-limited";

/**
 * Total messages produced by multicast fan-out since the process started.
 *
 * Counted here because this is the one place that knows how many copies a
 * single inbound message became — the number that reflects egress, and the one
 * an operator needs when sizing a deployment with multicast enabled.
 */
let multicastDeliveryCount = 0;

/** Messages produced by multicast fan-out since the process started. */
export function getMulticastDeliveryCount(): number {
	return multicastDeliveryCount;
}

/** Reset the fan-out counter. Intended for tests and metric resets. */
export function resetMulticastDeliveryCount(): void {
	multicastDeliveryCount = 0;
}

/** Outcome of a delivery attempt. */
export interface DeliveryResult {
	/** Number of recipients the message was written to. */
	delivered: number;
	/** Number of recipients whose copy was queued for later. */
	queued: number;
	/** Number of recipients whose copy was dropped. */
	dropped: number;
}

/**
 * Validate a destination identifier the same way a peer ID is validated.
 *
 * Without this an arbitrary string becomes a message-queue key, letting a
 * client grow the queue map without bound by addressing destinations that never
 * exist. Shared by every handler so the rule cannot drift between them.
 *
 * @returns `true` when the destination is well-formed; otherwise sends the
 * client an error and returns `false`.
 */
export function ensureValidDestination(client: IClient, dst: string): boolean {
	if (validateId(dst).valid) {
		return true;
	}
	client.send({
		type: MessageType.ERROR,
		payload: { msg: "Invalid destination" },
	});
	return false;
}

/**
 * The single point at which a message reaches its recipients.
 *
 * Every handler routes through here so that the fan-out ceiling and the
 * weighted rate-limit charge are enforced in one place. A handler that resolved
 * its own recipients and sent to them directly could bypass both, and that kind
 * of invariant decays as handlers are added -- so there is exactly one door.
 *
 * Rate limiting is charged by recipient count *before* anything is written, so
 * a refused multicast delivers to nobody rather than partially.
 */
export function deliver(
	realm: IRealm,
	message: IMessage,
	recipients: readonly Recipient[],
	policy: UndeliverablePolicy
): DeliveryResult {
	const result: DeliveryResult = { delivered: 0, queued: 0, dropped: 0 };

	for (const recipient of recipients) {
		const target = recipient.client ?? realm.getClient(recipient.id);
		const sent = target ? target.send(message) : false;

		if (sent) {
			result.delivered += 1;
			continue;
		}

		if (policy === "queue") {
			realm.getMessageQueue().addMessage(recipient.id, message);
			result.queued += 1;
		} else {
			result.dropped += 1;
		}
	}

	return result;
}

/**
 * Deliver to exactly one peer, queueing when it is not writable.
 *
 * The shape every pre-existing 1:1 handler needs.
 */
export function deliverToPeer(realm: IRealm, message: IMessage, dst: string): DeliveryResult {
	return deliver(realm, message, [{ id: dst }], "queue");
}

/** Whether a multicast payload is within the configured size limit. */
export function withinMulticastSizeLimit(config: ServerConfig, data: unknown): boolean {
	if (data === undefined) {
		return true;
	}
	return JSON.stringify(data).length <= config.topics.maxMulticastMessageSize;
}

/**
 * Deliver to many recipients, enforcing the amplification bounds first.
 *
 * The order matters and is the whole point of this function:
 *
 * 1. Refuse outright if the recipient set exceeds the per-message ceiling.
 * 2. Charge the sender for every recipient, all-or-nothing.
 * 3. Only then write to anyone.
 *
 * Checking after partial delivery would leave a refused multicast half-sent,
 * and charging one token per inbound message (as the ordinary path does) would
 * let a peer in a large room buy throughput proportional to the room size.
 *
 * @returns The delivery result, or a refusal naming which bound was hit.
 */
export function deliverFanOut(
	realm: IRealm,
	config: ServerConfig,
	senderId: string,
	message: IMessage,
	recipients: readonly Recipient[],
	rateLimiter: IRateLimiter | null,
	/**
	 * Recipients on other nodes, which this call charges for but does not write
	 * to. Keeps the sender's budget honest when most of a fan-out is remote.
	 */
	remoteRecipientCount = 0
): DeliveryResult | { refused: FanOutRefusal } {
	const totalRecipients = recipients.length + remoteRecipientCount;
	if (totalRecipients > config.topics.maxRecipientsPerMessage) {
		return { refused: "too-many-recipients" };
	}

	// Charged before any write so a refusal delivers to nobody. The ordinary
	// per-message token was already taken by handleMessage; this is the
	// additional charge for the extra copies fan-out produces.
	const extraCopies = Math.max(0, totalRecipients - 1);
	if (extraCopies > 0 && rateLimiter && !rateLimiter.tryConsume(senderId, extraCopies)) {
		return { refused: "rate-limited" };
	}

	// Multicast is never queued: it is meaningful only to peers currently in the
	// room or holding the subscription.
	const result = deliver(realm, message, recipients, "drop");

	// Count what actually went out, including copies handed to other nodes.
	multicastDeliveryCount += result.delivered + remoteRecipientCount;
	return result;
}

/**
 * The node owning a peer, or `null` when no node claims it.
 *
 * Local-first: a peer connected here resolves without consulting the backend.
 * A backend that cannot be reached answers `null` rather than throwing, so
 * callers fall back to their own not-found behaviour instead of failing.
 */
export async function resolvePeerNode(realm: IRealm, peerId: string): Promise<string | null> {
	if (realm.getClient(peerId)) {
		return realm.cluster.nodeId;
	}
	if (!realm.cluster.distributed) {
		return null;
	}
	try {
		return await realm.cluster.lookupPeerNode(peerId);
	} catch {
		return null;
	}
}

/**
 * Resolve a destination across the cluster and deliver.
 *
 * Local-first: a peer connected to this instance is written to directly and the
 * backend is never consulted. Only a local miss asks the backend who owns the
 * peer, so the common case — and every case under an affinity-based load
 * balancer — pays no cross-node cost.
 *
 * This is the function that fixes cross-instance 1:1 signaling. Before it, a
 * local miss meant "queue for a peer that will never read it".
 */
export async function deliverAcrossCluster(
	realm: IRealm,
	message: IMessage,
	dst: string,
	srcPeerId: string
): Promise<DeliveryResult> {
	// Fast path: the destination is on this instance.
	if (realm.getClient(dst)) {
		return deliverToPeer(realm, message, dst);
	}

	const backend = realm.cluster;
	if (!backend.distributed) {
		// Single-node: a local miss really is "not connected", so queue as before.
		return deliverToPeer(realm, message, dst);
	}

	let owner: string | null = null;
	try {
		owner = await backend.lookupPeerNode(dst);
	} catch {
		// Backend unreachable. Fall through to the offline queue rather than
		// reporting a success that never happened.
		return deliverToPeer(realm, message, dst);
	}

	if (owner === null || owner === backend.nodeId) {
		// No node claims it, or we are the claimed owner but have no socket for
		// it — a stale registration. Either way, apply offline-queue behavior.
		return deliverToPeer(realm, message, dst);
	}

	try {
		await backend.forward(owner, {
			fromNodeId: backend.nodeId,
			srcPeerId,
			targets: [dst],
			message,
		});
		return { delivered: 1, queued: 0, dropped: 0 };
	} catch {
		// The owning node is unreachable or has died. Queue rather than claim a
		// delivery that did not occur.
		return deliverToPeer(realm, message, dst);
	}
}

/**
 * Group recipients by the node that owns them.
 *
 * Local recipients come back under `local`; everything else is bucketed by node
 * so one forward carries every recipient on that node rather than one per peer.
 */
export async function groupRecipientsByNode(
	realm: IRealm,
	peerIds: readonly string[]
): Promise<{ local: Recipient[]; remote: Map<string, string[]> }> {
	const local: Recipient[] = [];
	const remote = new Map<string, string[]>();
	const backend = realm.cluster;

	for (const peerId of peerIds) {
		const client = realm.getClient(peerId);
		if (client) {
			local.push({ id: peerId, client });
			continue;
		}
		if (!backend.distributed) {
			// Not connected here and there is nowhere else to look.
			continue;
		}

		let owner: string | null = null;
		try {
			owner = await backend.lookupPeerNode(peerId);
		} catch {
			continue;
		}
		if (owner === null || owner === backend.nodeId) {
			continue;
		}
		const bucket = remote.get(owner) ?? [];
		bucket.push(peerId);
		remote.set(owner, bucket);
	}

	return { local, remote };
}
