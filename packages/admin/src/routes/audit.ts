import type { Route } from "./index.js";
import { json, error } from "./index.js";

export const auditRoutes: Route[] = [
	{
		method: "GET",
		path: "/audit",
		requiresAuth: true,
		handler: (ctx) => {
			const { limit, user, action, start, end } = ctx.query;

			let entries;

			if (user) {
				entries = ctx.admin.audit.getEntriesByUser(
					user,
					limit ? parseInt(limit, 10) : undefined,
				);
			} else if (action) {
				entries = ctx.admin.audit.getEntriesByAction(
					action as Parameters<typeof ctx.admin.audit.getEntriesByAction>[0],
					limit ? parseInt(limit, 10) : undefined,
				);
			} else if (start && end) {
				const startTime = parseInt(start, 10);
				const endTime = parseInt(end, 10);

				if (isNaN(startTime) || isNaN(endTime)) {
					return error("Invalid start or end timestamp");
				}

				entries = ctx.admin.audit.getEntriesInRange(startTime, endTime);
			} else {
				entries = ctx.admin.audit.getEntries(
					limit ? parseInt(limit, 10) : 100,
				);
			}

			return json({
				entries,
				total: entries.length,
			});
		},
	},
	{
		method: "DELETE",
		path: "/audit",
		requiresAuth: true,
		handler: (ctx) => {
			const userId = ctx.auth.userId ?? "unknown";
			const count = ctx.admin.audit.size;

			// Log before clearing so this entry is included
			ctx.admin.audit.log("clear_audit", userId, { previousCount: count });
			ctx.admin.audit.clear();

			return json({
				success: true,
				message: `Cleared ${count} audit entries`,
				count,
			});
		},
	},
];
