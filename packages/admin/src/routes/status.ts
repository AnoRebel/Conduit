import type { Route } from "./index.js";
import { json } from "./index.js";

export const statusRoutes: Route[] = [
	{
		method: "GET",
		path: "/status",
		requiresAuth: true,
		handler: ctx => {
			const status = ctx.admin.getServerStatus();
			return json(status);
		},
	},
	{
		method: "GET",
		path: "/health",
		requiresAuth: false,
		handler: _ctx => {
			// Basic health check - no auth required
			return json({
				status: "ok",
				timestamp: Date.now(),
			});
		},
	},
];
