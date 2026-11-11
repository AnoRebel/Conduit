import { createHmac } from "node:crypto";
import { MessageType } from "@conduit/shared";
import { describe, expect, it, vi } from "vitest";
import { createConduitServerCore } from "../src/core/index.js";
import { turnIceServers } from "../src/core/turn.js";

const turn = { urls: ["turn:turn.example.com:3478?transport=udp"], secret: "s3cret", ttl: 600 };

describe("TURN credentials", () => {
	it("mints TURN REST API credentials coturn accepts", () => {
		const [server] = turnIceServers(turn, "peer-1", 1_000_000);
		expect(server?.urls).toEqual(turn.urls);
		expect(server?.username).toBe("1600:peer-1");
		expect(server?.credential).toBe(
			createHmac("sha1", "s3cret").update("1600:peer-1").digest("base64")
		);
	});

	it("sends them in OPEN only when configured", () => {
		for (const withTurn of [true, false]) {
			const core = createConduitServerCore({
				config: {
					key: "test-key",
					logging: { level: "silent", pretty: false },
					...(withTurn && { turn }),
				},
			});
			const send = vi.fn();
			const socket = { send, close: vi.fn(), readyState: 1 } as never;
			core.handleConnection(socket, "peer-1", "token1", "test-key");
			const open = JSON.parse(String(send.mock.calls[0]?.[0]));
			expect(open.type).toBe(MessageType.OPEN);
			if (withTurn) expect(open.payload.iceServers[0].username).toMatch(/^\d+:peer-1$/);
			else expect(open.payload).toBeUndefined();
			core.stop();
		}
	});
});
