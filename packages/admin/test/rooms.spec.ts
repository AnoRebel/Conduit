import { MessageType } from "@conduit/shared";
import { describe, expect, it, vi } from "vitest";
import type { ActionableCluster, ActionableServerCore } from "../src/core/actions.js";
import { createAuditLogger } from "../src/core/audit.js";
import { createRoomAdmin } from "../src/core/rooms.js";
import { createRoutes, roomsRoutes } from "../src/routes/index.js";

/** An in-memory cluster standing in for the server's backend. */
function fakeCluster(
	rooms: Record<string, string[]> = {},
	subs: Record<string, string[]> = {}
): ActionableCluster & { rooms: Record<string, string[]> } {
	const state = { ...rooms };
	return {
		rooms: state,
		nodeId: "node-a",
		distributed: false,
		getRoomMembers: async (room: string) =>
			(state[room] ?? []).map(peerId => ({ peerId, nodeId: "node-a" })),
		getPeerRooms: async (peerId: string) =>
			Object.entries(state)
				.filter(([, members]) => members.includes(peerId))
				.map(([name]) => name),
		joinRoom: async (room: string, peerId: string, maxMembers: number) => {
			const members = state[room] ?? [];
			if (members.length >= maxMembers) return false;
			if (!members.includes(peerId)) members.push(peerId);
			state[room] = members;
			return true;
		},
		leaveRoom: async (room: string, peerId: string) => {
			state[room] = (state[room] ?? []).filter(id => id !== peerId);
			if (state[room].length === 0) delete state[room];
		},
		countRooms: async () => Object.keys(state).length,
		countTopics: async () => new Set(Object.values(subs).flat()).size,
		getPeerSubscriptions: async (peerId: string) => subs[peerId] ?? [],
		getNodes: async () => [{ nodeId: "node-a", peers: 2 }],
		health: async () => ({ reachable: true }),
	};
}

/** A server core with the given peers and cluster. */
function fakeCore(
	clientIds: string[],
	cluster?: ActionableCluster
): ActionableServerCore & { sent: Array<{ to: string; type: string; payload: unknown }> } {
	const sent: Array<{ to: string; type: string; payload: unknown }> = [];
	return {
		sent,
		realm: {
			getClientIds: () => clientIds,
			getClient: (id: string) =>
				clientIds.includes(id)
					? {
							id,
							token: `${id}-token`,
							socket: { close: vi.fn(), send: vi.fn() },
							send: (message: { type: string; payload?: unknown }) => {
								sent.push({ to: id, type: message.type, payload: message.payload });
							},
						}
					: undefined,
			removeClient: () => true,
			...(cluster ? { cluster } : {}),
		},
		config: {},
	} as unknown as ActionableServerCore & {
		sent: Array<{ to: string; type: string; payload: unknown }>;
	};
}

function makeAdmin(
	clientIds: string[],
	cluster?: ActionableCluster,
	config?: ActionableServerCore["config"]
) {
	const core = fakeCore(clientIds, cluster);
	if (config) {
		Object.assign(core.config, config);
	}
	const audit = createAuditLogger({ enabled: true, maxEntries: 100 });
	return { core, audit, admin: createRoomAdmin({ serverCore: core, auditLogger: audit }) };
}

describe("listing rooms", () => {
	it("should report each room with its member count", async () => {
		const cluster = fakeCluster({ lobby: ["a", "b"], standup: ["a"] });
		const { admin } = makeAdmin(["a", "b"], cluster);

		const rooms = await admin.listRooms();

		expect(rooms).toEqual([
			{ name: "lobby", members: 2 },
			{ name: "standup", members: 1 },
		]);
	});

	it("should return an empty list when no rooms exist", async () => {
		const { admin } = makeAdmin(["a"], fakeCluster());
		expect(await admin.listRooms()).toEqual([]);
	});

	it("should degrade to an empty list on a core without group support", async () => {
		// An older server core exposes no cluster; the admin surface must not fail.
		const { admin } = makeAdmin(["a"]);
		expect(await admin.listRooms()).toEqual([]);
	});
});

describe("inspecting one room", () => {
	it("should return the full membership with node placement", async () => {
		const cluster = fakeCluster({ lobby: ["a", "b"] });
		const { admin } = makeAdmin(["a", "b"], cluster);

		const room = await admin.getRoom("lobby");

		expect(room).toMatchObject({ name: "lobby", members: 2 });
		expect(room?.peers.map(p => p.peerId).sort()).toEqual(["a", "b"]);
		expect(room?.peers.every(p => p.nodeId === "node-a")).toBe(true);
	});

	it("should report a room with no members as absent", async () => {
		const { admin } = makeAdmin(["a"], fakeCluster());
		expect(await admin.getRoom("nosuch")).toBeNull();
	});
});

describe("dissolving a room", () => {
	it("should remove every member and notify them", async () => {
		const cluster = fakeCluster({ lobby: ["a", "b", "c"] });
		const { core, admin } = makeAdmin(["a", "b", "c"], cluster);

		const removed = await admin.dissolveRoom("lobby", "admin-1");

		expect(removed).toBe(3);
		// Each remaining member is told about each departure.
		const departures = core.sent.filter(m => m.type === MessageType.PEER_LEFT);
		expect(departures.length).toBeGreaterThan(0);
		const namedPeers = new Set(departures.map(d => (d.payload as { peerId: string }).peerId));
		expect(namedPeers).toEqual(new Set(["a", "b", "c"]));
		// The room is destroyed.
		expect(await admin.getRoom("lobby")).toBeNull();
	});

	it("should not notify a departing member about itself", async () => {
		const cluster = fakeCluster({ lobby: ["a", "b"] });
		const { core, admin } = makeAdmin(["a", "b"], cluster);

		await admin.dissolveRoom("lobby", "admin-1");

		const selfNotices = core.sent.filter(
			m => m.type === MessageType.PEER_LEFT && (m.payload as { peerId: string }).peerId === m.to
		);
		expect(selfNotices).toEqual([]);
	});

	it("should report zero for a room that does not exist", async () => {
		const { admin } = makeAdmin(["a"], fakeCluster());
		expect(await admin.dissolveRoom("nosuch", "admin-1")).toBe(0);
	});

	it("should record an audit entry naming the room", async () => {
		const cluster = fakeCluster({ lobby: ["a", "b"] });
		const { audit, admin } = makeAdmin(["a", "b"], cluster);

		await admin.dissolveRoom("lobby", "admin-1");

		const entries = audit.getEntriesByAction("dissolve_room");
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ action: "dissolve_room", userId: "admin-1" });
		expect(entries[0]?.details).toMatchObject({ room: "lobby", members: 2 });
	});

	it("should not record an audit entry when nothing was dissolved", async () => {
		const { audit, admin } = makeAdmin(["a"], fakeCluster());
		await admin.dissolveRoom("nosuch", "admin-1");
		expect(audit.getEntriesByAction("dissolve_room")).toHaveLength(0);
	});
});

describe("adding members to a room", () => {
	it("should create the room by placing its first member", async () => {
		// Rooms are derived from membership, so "creating" one means putting a
		// peer in it -- there is no empty room to make first.
		const cluster = fakeCluster({});
		const { admin } = makeAdmin(["a", "b"], cluster);

		const result = await admin.addRoomMembers("standup", ["a"], "admin-1");

		expect(result.added).toEqual(["a"]);
		expect(result.skipped).toEqual([]);
		expect((await admin.getRoom("standup"))?.members).toBe(1);
	});

	it("should tell the new member who is already there", async () => {
		const cluster = fakeCluster({ lobby: ["a", "b"] });
		const { core, admin } = makeAdmin(["a", "b", "c"], cluster);

		await admin.addRoomMembers("lobby", ["c"], "admin-1");

		const state = core.sent.find(m => m.type === MessageType.ROOM_STATE && m.to === "c");
		if (!state) throw new Error("expected ROOM_STATE for the new member");
		const members = (state.payload as { members: string[] }).members;
		// The list never includes the peer receiving it.
		expect(new Set(members)).toEqual(new Set(["a", "b"]));
	});

	it("should tell the incumbents that a peer arrived", async () => {
		const cluster = fakeCluster({ lobby: ["a", "b"] });
		const { core, admin } = makeAdmin(["a", "b", "c"], cluster);

		await admin.addRoomMembers("lobby", ["c"], "admin-1");

		const arrivals = core.sent.filter(m => m.type === MessageType.PEER_JOINED);
		expect(new Set(arrivals.map(a => a.to))).toEqual(new Set(["a", "b"]));
		expect(arrivals.every(a => (a.payload as { peerId: string }).peerId === "c")).toBe(true);
	});

	it("should not tell the new member it joined itself", async () => {
		const cluster = fakeCluster({ lobby: ["a"] });
		const { core, admin } = makeAdmin(["a", "b"], cluster);

		await admin.addRoomMembers("lobby", ["b"], "admin-1");

		const selfNotices = core.sent.filter(m => m.type === MessageType.PEER_JOINED && m.to === "b");
		expect(selfNotices).toEqual([]);
	});

	it("should skip a peer that is not connected", async () => {
		// Membership for an absent peer would be reaped anyway, and nobody would
		// receive the room state.
		const cluster = fakeCluster({});
		const { admin } = makeAdmin(["a"], cluster);

		const result = await admin.addRoomMembers("lobby", ["a", "ghost"], "admin-1");

		expect(result.added).toEqual(["a"]);
		expect(result.skipped).toEqual([{ peerId: "ghost", reason: "not-connected" }]);
	});

	it("should skip a peer that is already a member", async () => {
		const cluster = fakeCluster({ lobby: ["a"] });
		const { core, admin } = makeAdmin(["a", "b"], cluster);

		const result = await admin.addRoomMembers("lobby", ["a", "b"], "admin-1");

		expect(result.added).toEqual(["b"]);
		expect(result.skipped).toEqual([{ peerId: "a", reason: "already-member" }]);
		// No duplicate arrival notice for the peer that was already there.
		const arrivalsForA = core.sent.filter(
			m => m.type === MessageType.PEER_JOINED && (m.payload as { peerId: string }).peerId === "a"
		);
		expect(arrivalsForA).toEqual([]);
	});

	it("should move the others when one peer in the batch fails", async () => {
		// Partial success beats failing the whole call: five of six peers still
		// get moved when one has disconnected.
		const cluster = fakeCluster({});
		const { admin } = makeAdmin(["a", "b", "c"], cluster);

		const result = await admin.addRoomMembers("lobby", ["a", "gone", "b", "c"], "admin-1");

		expect(result.added).toEqual(["a", "b", "c"]);
		expect(result.skipped).toEqual([{ peerId: "gone", reason: "not-connected" }]);
	});

	it("should refuse to push a room past the member cap", async () => {
		const cluster = fakeCluster({ lobby: ["a", "b"] });
		const { admin } = makeAdmin(["a", "b", "c"], cluster, { rooms: { maxMembersPerRoom: 2 } });

		const result = await admin.addRoomMembers("lobby", ["c"], "admin-1");

		expect(result.added).toEqual([]);
		expect(result.skipped).toEqual([{ peerId: "c", reason: "room-full" }]);
	});

	it("should record the action in the audit log", async () => {
		const cluster = fakeCluster({});
		const { admin, audit } = makeAdmin(["a"], cluster);

		await admin.addRoomMembers("standup", ["a", "ghost"], "admin-7");

		const entry = audit.getEntries().find(e => e.action === "add_room_members");
		expect(entry).toBeDefined();
		expect(entry?.userId).toBe("admin-7");
		expect(entry?.details).toMatchObject({ room: "standup", added: 1, skipped: 1 });
	});
});

describe("cluster status", () => {
	it("should report participating nodes and backend health", async () => {
		const cluster = fakeCluster({ lobby: ["a"] });
		const { admin } = makeAdmin(["a"], cluster);

		const status = await admin.getClusterStatus();

		expect(status).toMatchObject({
			nodeId: "node-a",
			backendReachable: true,
			distributed: false,
		});
		expect(status.nodes).toEqual([{ nodeId: "node-a", peers: 2 }]);
	});

	it("should report a single healthy node when no cluster is configured", async () => {
		// Nothing is wrong on a single-process server; it simply has no cluster.
		const { admin } = makeAdmin(["a", "b"]);

		const status = await admin.getClusterStatus();

		expect(status.distributed).toBe(false);
		expect(status.backendReachable).toBe(true);
		expect(status.nodes).toEqual([{ nodeId: "local", peers: 2 }]);
	});

	it("should surface an unreachable backend with its reason", async () => {
		const cluster = fakeCluster();
		cluster.health = async () => ({ reachable: false, error: "connection refused" });
		const { admin } = makeAdmin(["a"], cluster);

		const status = await admin.getClusterStatus();

		expect(status.backendReachable).toBe(false);
		expect(status.backendError).toBe("connection refused");
	});
});

describe("topic totals", () => {
	it("should count distinct topics and total subscriptions", async () => {
		const cluster = fakeCluster({}, { a: ["chat", "alerts"], b: ["chat"] });
		const { admin } = makeAdmin(["a", "b"], cluster);

		expect(await admin.getTopicTotals()).toEqual({ topics: 2, subscriptions: 3 });
	});

	it("should report zeroes on a core without group support", async () => {
		const { admin } = makeAdmin(["a"]);
		expect(await admin.getTopicTotals()).toEqual({ topics: 0, subscriptions: 0 });
	});
});

describe("room routes", () => {
	it("should require authentication on every room and cluster route", () => {
		// An unauthorized caller must not reach room membership or cluster shape.
		for (const route of roomsRoutes) {
			expect(route.requiresAuth).toBe(true);
		}
	});

	it("should register the room and cluster routes", () => {
		const paths = createRoutes().map(r => `${r.method} ${r.path}`);
		expect(paths).toContain("GET /rooms");
		expect(paths).toContain("GET /rooms/:name");
		expect(paths).toContain("POST /rooms/:name/dissolve");
		expect(paths).toContain("GET /cluster");
	});

	it("should expose dissolution as a POST so CSRF protection applies", () => {
		// The adapters guard state-changing methods; a GET would bypass that.
		const dissolve = roomsRoutes.find(r => r.path === "/rooms/:name/dissolve");
		expect(dissolve?.method).toBe("POST");
	});

	it("should expose read-only room routes as GET", () => {
		expect(roomsRoutes.find(r => r.path === "/rooms")?.method).toBe("GET");
		expect(roomsRoutes.find(r => r.path === "/cluster")?.method).toBe("GET");
	});
});
