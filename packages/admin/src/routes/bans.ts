import type { Route } from "./index.js";
import { json, notFound, error } from "./index.js";

export const bansRoutes: Route[] = [
	{
		method: "GET",
		path: "/bans",
		requiresAuth: true,
		handler: (ctx) => {
			const bans = ctx.admin.getBans();
			return json({
				bans,
				total: bans.length,
			});
		},
	},
	{
		method: "GET",
		path: "/bans/clients",
		requiresAuth: true,
		handler: (ctx) => {
			const bans = ctx.admin.bans.getClientBans();
			return json({
				bans,
				total: bans.length,
			});
		},
	},
	{
		method: "GET",
		path: "/bans/ips",
		requiresAuth: true,
		handler: (ctx) => {
			const bans = ctx.admin.bans.getIPBans();
			return json({
				bans,
				total: bans.length,
			});
		},
	},
	{
		method: "POST",
		path: "/bans/client/:id",
		requiresAuth: true,
		handler: (ctx) => {
			const id = ctx.params.id ?? "";
			const userId = ctx.auth.userId ?? "unknown";
			const body = ctx.body as { reason?: string } | undefined;
			const reason = body?.reason;

			if (!id) {
				return error("Client ID is required");
			}

			if (ctx.admin.isClientBanned(id)) {
				return error(`Client ${id} is already banned`);
			}

			ctx.admin.banClient(id, reason, userId);

			return json({
				success: true,
				message: `Client ${id} banned`,
				ban: ctx.admin.bans.getBan(id),
			});
		},
	},
	{
		method: "DELETE",
		path: "/bans/client/:id",
		requiresAuth: true,
		handler: (ctx) => {
			const id = ctx.params.id ?? "";
			const userId = ctx.auth.userId ?? "unknown";

			if (!id) {
				return error("Client ID is required");
			}

			if (!ctx.admin.isClientBanned(id)) {
				return notFound(`Client ${id} is not banned`);
			}

			ctx.admin.unbanClient(id, userId);

			return json({
				success: true,
				message: `Client ${id} unbanned`,
			});
		},
	},
	{
		method: "POST",
		path: "/bans/ip/:ip",
		requiresAuth: true,
		handler: (ctx) => {
			const ip = ctx.params.ip ?? "";
			const userId = ctx.auth.userId ?? "unknown";
			const body = ctx.body as { reason?: string } | undefined;
			const reason = body?.reason;

			if (!ip) {
				return error("IP is required");
			}

			if (ctx.admin.isIPBanned(ip)) {
				return error(`IP ${ip} is already banned`);
			}

			ctx.admin.banIP(ip, reason, userId);

			return json({
				success: true,
				message: `IP ${ip} banned`,
				ban: ctx.admin.bans.getBan(ip),
			});
		},
	},
	{
		method: "DELETE",
		path: "/bans/ip/:ip",
		requiresAuth: true,
		handler: (ctx) => {
			const ip = ctx.params.ip ?? "";
			const userId = ctx.auth.userId ?? "unknown";

			if (!ip) {
				return error("IP is required");
			}

			if (!ctx.admin.isIPBanned(ip)) {
				return notFound(`IP ${ip} is not banned`);
			}

			ctx.admin.unbanIP(ip, userId);

			return json({
				success: true,
				message: `IP ${ip} unbanned`,
			});
		},
	},
	{
		method: "DELETE",
		path: "/bans",
		requiresAuth: true,
		handler: (ctx) => {
			const userId = ctx.auth.userId ?? "unknown";
			const count = ctx.admin.getBans().length;

			ctx.admin.bans.clear();
			ctx.admin.audit.log("clear_bans", userId, { count });

			return json({
				success: true,
				message: `Cleared ${count} bans`,
				count,
			});
		},
	},
];
