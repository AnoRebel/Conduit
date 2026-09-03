import type { Route } from "./index.js";
import { error, json, notFound } from "./index.js";

/**
 * Mirrors the server's own room-name rule.
 *
 * Duplicated rather than imported because `@conduit/server` is an optional peer
 * dependency: the admin package must build and run without it.
 */
const ROOM_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** How many peers one call may place, bounding the work a single request does. */
const MAX_MEMBERS_PER_REQUEST = 100;

/**
 * Room inspection, dissolution, and cluster status.
 *
 * Every route requires authentication. Dissolution is state-changing, so the
 * adapters' existing CSRF protection applies to it exactly as it does to bans
 * and the other POST actions.
 */
export const roomsRoutes: Route[] = [
	{
		method: "GET",
		path: "/rooms",
		requiresAuth: true,
		handler: async ctx => {
			const rooms = await ctx.admin.listRooms();
			return json({ rooms, total: rooms.length });
		},
	},
	{
		method: "GET",
		path: "/rooms/:name",
		requiresAuth: true,
		handler: async ctx => {
			const name = ctx.params.name ?? "";
			const room = await ctx.admin.getRoom(name);
			if (!room) {
				return notFound(`Room ${name} not found`);
			}
			return json(room);
		},
	},
	{
		method: "POST",
		path: "/rooms/:name/dissolve",
		requiresAuth: true,
		handler: async ctx => {
			const name = ctx.params.name ?? "";
			const userId = ctx.auth.userId ?? "unknown";
			const removed = await ctx.admin.dissolveRoom(name, userId);
			if (removed === 0) {
				return notFound(`Room ${name} not found`);
			}
			return json({ success: true, room: name, removed });
		},
	},
	{
		method: "POST",
		path: "/rooms/:name/members",
		requiresAuth: true,
		handler: async ctx => {
			const name = ctx.params.name ?? "";
			const userId = ctx.auth.userId ?? "unknown";
			const body = ctx.body as { peerIds?: unknown } | undefined;

			if (!ROOM_NAME_PATTERN.test(name)) {
				return error(
					"Room name must be 1-128 characters of letters, digits, dot, underscore, colon or hyphen"
				);
			}

			const peerIds = body?.peerIds;
			if (!Array.isArray(peerIds) || peerIds.length === 0) {
				return error("peerIds must be a non-empty array");
			}
			if (peerIds.length > MAX_MEMBERS_PER_REQUEST) {
				return error(`peerIds may name at most ${MAX_MEMBERS_PER_REQUEST} peers`);
			}
			if (!peerIds.every((id): id is string => typeof id === "string" && id.length > 0)) {
				return error("peerIds must contain only non-empty strings");
			}

			const result = await ctx.admin.addRoomMembers(name, peerIds, userId);
			return json({ success: true, room: name, ...result });
		},
	},
	{
		method: "GET",
		path: "/cluster",
		requiresAuth: true,
		handler: async ctx => {
			const status = await ctx.admin.getClusterStatus();
			return json(status);
		},
	},
];
