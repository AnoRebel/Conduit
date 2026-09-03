import type { ClusterBackend, PeerLocation } from "../cluster/types.js";
import type { ServerConfig } from "../config.js";

/** Why a subscription was refused. */
export type SubscribeRefusal =
	| "topics-disabled"
	| "topic-full"
	| "peer-subscription-limit"
	| "server-topic-limit"
	| "unauthorized";

/** Outcome of a subscribe attempt. */
export type SubscribeResult =
	| { ok: true; alreadySubscribed: boolean }
	| { ok: false; refusal: SubscribeRefusal };

/** Outcome of an unsubscribe attempt. */
export type UnsubscribeResult = { ok: true } | { ok: false; refusal: "not-subscribed" };

/**
 * Decides whether a peer may subscribe to, or publish on, a topic.
 *
 * Absent by default, in which case any authenticated peer may use any topic.
 * Synchronous for the same reason as the room authorizer: an await in the
 * message path is its own amplification vector.
 *
 * @returns `false` to refuse the operation.
 */
export type TopicAuthorizer = (
	peerId: string,
	topic: string,
	action: "subscribe" | "publish"
) => boolean;

/**
 * Every subscription pattern that could match a published topic.
 *
 * For `a.b.c` this is the topic itself plus `a.*` and `a.b.*` — one entry per
 * ancestor namespace. The count is bounded by the topic's segment depth, which
 * validation caps, so resolving subscribers never scales with how many
 * subscriptions exist on the server. That bound is the reason only a trailing
 * `.*` is supported: arbitrary glob matching would force a scan of every
 * subscription per publish, which is itself a denial-of-service vector.
 */
export function matchingPatterns(topic: string): string[] {
	const patterns: string[] = [topic];
	const segments = topic.split(".");
	for (let i = 1; i < segments.length; i++) {
		patterns.push(`${segments.slice(0, i).join(".")}.*`);
	}
	return patterns;
}

/**
 * Topic subscriptions, pattern matching, and the limits that bound them.
 *
 * Like {@link RoomRegistry}, state lives in the {@link ClusterBackend} so a
 * subscription made on one instance is visible to every other.
 */
export class TopicRegistry {
	constructor(
		private readonly backend: ClusterBackend,
		private readonly config: ServerConfig,
		private readonly authorize?: TopicAuthorizer
	) {}

	/** Record a subscription, enforcing every limit and the authorization hook. */
	async subscribe(peerId: string, pattern: string): Promise<SubscribeResult> {
		if (!this.config.topics.enabled) {
			return { ok: false, refusal: "topics-disabled" };
		}
		if (this.authorize && !this.authorize(peerId, pattern, "subscribe")) {
			return { ok: false, refusal: "unauthorized" };
		}

		const current = await this.backend.getPeerSubscriptions(peerId);
		const alreadySubscribed = current.includes(pattern);

		if (!alreadySubscribed) {
			if (current.length >= this.config.topics.maxSubscriptionsPerPeer) {
				return { ok: false, refusal: "peer-subscription-limit" };
			}

			// Only a subscription that creates a topic counts against the cap.
			const existing = await this.backend.getTopicSubscribers(pattern);
			if (existing.length === 0) {
				const topicCount = await this.backend.countTopics();
				if (topicCount >= this.config.topics.maxTopics) {
					return { ok: false, refusal: "server-topic-limit" };
				}
			}
		}

		const admitted = await this.backend.subscribe(
			pattern,
			peerId,
			this.config.topics.maxSubscribersPerTopic
		);
		if (!admitted) {
			return { ok: false, refusal: "topic-full" };
		}

		return { ok: true, alreadySubscribed };
	}

	/** Remove a subscription the peer holds. */
	async unsubscribe(peerId: string, pattern: string): Promise<UnsubscribeResult> {
		const current = await this.backend.getPeerSubscriptions(peerId);
		if (!current.includes(pattern)) {
			return { ok: false, refusal: "not-subscribed" };
		}

		await this.backend.unsubscribe(pattern, peerId);
		return { ok: true };
	}

	/**
	 * Peers whose subscriptions match a published topic.
	 *
	 * A peer holding several matching patterns appears once: the union is taken
	 * by peer id, so a subscriber can never receive one publication twice.
	 */
	async subscribers(topic: string): Promise<readonly PeerLocation[]> {
		const byPeer = new Map<string, PeerLocation>();

		for (const pattern of matchingPatterns(topic)) {
			for (const location of await this.backend.getTopicSubscribers(pattern)) {
				byPeer.set(location.peerId, location);
			}
		}

		return Array.from(byPeer.values());
	}

	/** Whether a peer may publish on a topic. */
	canPublish(peerId: string, topic: string): boolean {
		if (!this.authorize) {
			return true;
		}
		return this.authorize(peerId, topic, "publish");
	}

	/** Subscriptions a peer currently holds. */
	async subscriptionsOf(peerId: string): Promise<readonly string[]> {
		return await this.backend.getPeerSubscriptions(peerId);
	}

	/** Number of distinct topics in existence. */
	async count(): Promise<number> {
		return await this.backend.countTopics();
	}
}
