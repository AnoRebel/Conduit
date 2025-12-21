import type { Route } from "./index.js";
import { error, json, notFound } from "./index.js";

export const clientRoutes: Route[] = [
	{
		method: "GET",
		path: "/clients",
		requiresAuth: true,
		handler: ctx => {
			const clients = ctx.admin.getClientList();
			return json({
				clients,
				total: clients.length,
			});
		},
	},
	{
		method: "GET",
		path: "/clients/:id",
		requiresAuth: true,
		handler: ctx => {
			const id = ctx.params.id ?? "";

			if (!id) {
				return error("Client ID is required");
			}

			const client = ctx.admin.getClientDetails(id);

			if (!client) {
				return notFound(`Client ${id} not found`);
			}

			return json(client);
		},
	},
	{
		method: "DELETE",
		path: "/clients/:id",
		requiresAuth: true,
		handler: ctx => {
			const id = ctx.params.id ?? "";
			const userId = ctx.auth.userId ?? "unknown";

			if (!id) {
				return error("Client ID is required");
			}

			const success = ctx.admin.disconnectClient(id, userId);

			if (!success) {
				return notFound(`Client ${id} not found`);
			}

			return json({ success: true, message: `Client ${id} disconnected` });
		},
	},
	{
		method: "DELETE",
		path: "/clients",
		requiresAuth: true,
		handler: ctx => {
			const userId = ctx.auth.userId ?? "unknown";
			const count = ctx.admin.disconnectAllClients(userId);

			return json({
				success: true,
				message: `Disconnected ${count} clients`,
				count,
			});
		},
	},
	{
		method: "DELETE",
		path: "/clients/:id/queue",
		requiresAuth: true,
		handler: ctx => {
			const id = ctx.params.id ?? "";
			const userId = ctx.auth.userId ?? "unknown";

			if (!id) {
				return error("Client ID is required");
			}

			const success = ctx.admin.clearClientQueue(id, userId);

			if (!success) {
				return error(`Failed to clear queue for client ${id}`);
			}

			return json({ success: true, message: `Queue cleared for client ${id}` });
		},
	},
];
