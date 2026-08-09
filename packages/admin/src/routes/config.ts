import { MessageType } from "@conduit/shared";
import type { RateLimitConfig } from "../types.js";
import type { Route } from "./index.js";
import { error, json } from "./index.js";

/**
 * Message types an operator may broadcast to every connected peer.
 *
 * Deliberately narrower than the full protocol: connection-negotiation types
 * such as OFFER/ANSWER/CANDIDATE are meaningful only between two specific peers
 * and would corrupt client state if fanned out.
 */
const BROADCASTABLE_TYPES: ReadonlySet<string> = new Set([
	MessageType.ERROR,
	MessageType.EXPIRE,
	MessageType.HEARTBEAT,
	MessageType.LEAVE,
]);

/** Maximum serialized size of a broadcast payload, in bytes. */
const MAX_BROADCAST_PAYLOAD_SIZE = 64 * 1024;

export const configRoutes: Route[] = [
	{
		method: "GET",
		path: "/config",
		requiresAuth: true,
		handler: ctx => {
			// Return non-sensitive config
			const config = ctx.admin.config;

			return json({
				path: config.path,
				apiVersion: config.apiVersion,
				rateLimit: config.rateLimit,
				metrics: config.metrics,
				audit: {
					enabled: config.audit.enabled,
					maxEntries: config.audit.maxEntries,
				},
				websocket: {
					enabled: config.websocket.enabled,
					path: config.websocket.path,
				},
				sse: config.sse,
			});
		},
	},
	{
		method: "PATCH",
		path: "/config/rate-limit",
		requiresAuth: true,
		handler: ctx => {
			const userId = ctx.auth.userId ?? "unknown";
			const body = ctx.body as Partial<RateLimitConfig> | undefined;

			if (!body) {
				return error("Request body required");
			}

			// Validate the config values
			if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
				return error("enabled must be a boolean");
			}
			if (body.maxTokens !== undefined) {
				if (typeof body.maxTokens !== "number" || body.maxTokens < 1) {
					return error("maxTokens must be a positive number");
				}
			}
			if (body.refillRate !== undefined) {
				if (typeof body.refillRate !== "number" || body.refillRate < 1) {
					return error("refillRate must be a positive number");
				}
			}

			ctx.admin.updateRateLimits(body, userId);

			return json({
				success: true,
				message: "Rate limits updated",
				config: body,
			});
		},
	},
	{
		method: "PATCH",
		path: "/config/features",
		requiresAuth: true,
		handler: ctx => {
			const userId = ctx.auth.userId ?? "unknown";
			const body = ctx.body as { feature: string; enabled: boolean } | undefined;

			if (!body) {
				return error("Request body required");
			}

			const { feature, enabled } = body;

			if (!feature || typeof feature !== "string") {
				return error("feature must be a string");
			}

			if (feature !== "discovery" && feature !== "relay") {
				return error("feature must be 'discovery' or 'relay'");
			}

			if (typeof enabled !== "boolean") {
				return error("enabled must be a boolean");
			}

			ctx.admin.toggleFeature(feature, enabled, userId);

			return json({
				success: true,
				message: `Feature '${feature}' ${enabled ? "enabled" : "disabled"}`,
				feature,
				enabled,
			});
		},
	},
	{
		method: "POST",
		path: "/broadcast",
		requiresAuth: true,
		handler: ctx => {
			const userId = ctx.auth.userId ?? "unknown";
			const body = ctx.body as { type: string; payload?: unknown } | undefined;

			if (!body) {
				return error("Request body required");
			}

			const { type, payload } = body;

			if (!type || typeof type !== "string") {
				return error("message type is required");
			}

			// A broadcast reaches every connected peer, so the type must be one the
			// protocol defines rather than an arbitrary string injected into clients.
			if (!BROADCASTABLE_TYPES.has(type)) {
				return error(
					`Unsupported message type "${type}". Expected one of: ${[...BROADCASTABLE_TYPES].join(", ")}`
				);
			}

			// Bound the payload so a single request cannot fan a large message out
			// to the entire client population.
			if (payload !== undefined) {
				const size = JSON.stringify(payload)?.length ?? 0;
				if (size > MAX_BROADCAST_PAYLOAD_SIZE) {
					return error(
						`Broadcast payload exceeds the maximum size of ${MAX_BROADCAST_PAYLOAD_SIZE} bytes`
					);
				}
			}

			const message = { type, payload };
			const count = ctx.admin.broadcastMessage(
				message as Parameters<typeof ctx.admin.broadcastMessage>[0],
				userId
			);

			return json({
				success: true,
				message: `Broadcast sent to ${count} clients`,
				recipientCount: count,
			});
		},
	},
];
