import type { RateLimitConfig } from "../types.js";
import type { Route } from "./index.js";
import { error, json } from "./index.js";

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
