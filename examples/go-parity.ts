/**
 * Go client parity.
 *
 * Runs the Go client against a live TypeScript server, so the two
 * implementations are checked against each other rather than against a shared
 * assumption. A field-name drift on either side fails here.
 *
 * Skips cleanly when the Go toolchain is absent, since not every contributor
 * has it installed.
 *
 * Run with `bun run examples/go-parity.ts`.
 */

import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createConduitServer } from "@conduit/server/adapters/node";

const PORT = 9312;
const KEY = randomBytes(24).toString("base64url");
const goClientDir = resolve(import.meta.dir, "../packages/go-client");

const hasGo = await Bun.$`go version`.quiet().then(
	() => true,
	() => false
);

if (!hasGo) {
	console.log("• Go toolchain not found — skipping the Go parity example.");
	process.exit(0);
}

/** A Go program that joins a room and reports what the server sent back. */
const program = `package main

import (
	"context"
	"fmt"
	"os"
	"time"

	conduit "github.com/AnoRebel/Conduit/packages/go-client"
)

func main() {
	client, err := conduit.New("127.0.0.1:${PORT}",
		conduit.WithKey("${KEY}"),
		conduit.WithSecure(false),
		conduit.WithID("go-peer"),
	)
	if err != nil {
		fmt.Println("ERR", err)
		os.Exit(1)
	}
	defer client.Close()

	state := make(chan conduit.RoomStatePayload, 1)
	client.OnMessage(func(msg conduit.Message) {
		if msg.Type == conduit.MessageTypeRoomState {
			var p conduit.RoomStatePayload
			if err := msg.ParsePayload(&p); err == nil {
				select {
				case state <- p:
				default:
				}
			}
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		fmt.Println("ERR connect:", err)
		os.Exit(1)
	}

	if _, err := client.Join("go-room"); err != nil {
		fmt.Println("ERR join:", err)
		os.Exit(1)
	}

	select {
	case p := <-state:
		fmt.Printf("ROOM_STATE room=%s members=%d\\n", p.Room, len(p.Members))
	case <-time.After(5 * time.Second):
		fmt.Println("ERR timed out waiting for ROOM_STATE")
		os.Exit(1)
	}
}
`;

const server = createConduitServer({
	config: {
		port: PORT,
		key: KEY,
		logging: { level: "silent", pretty: false },
	},
});

await new Promise<void>(resolve => server.listen(PORT, "127.0.0.1", resolve));

const dir = mkdtempSync(join(tmpdir(), "conduit-go-example-"));
writeFileSync(join(dir, "main.go"), program);
writeFileSync(
	join(dir, "go.mod"),
	`module conduitexample

go 1.24

require github.com/AnoRebel/Conduit/packages/go-client v0.0.0

replace github.com/AnoRebel/Conduit/packages/go-client => ${goClientDir}
`
);

const tidy = await Bun.$`go mod tidy`.cwd(dir).quiet().nothrow();
if (tidy.exitCode !== 0) {
	console.log("• go mod tidy failed (likely offline) — skipping the Go parity example.");
	server.close();
	process.exit(0);
}

const result = await Bun.$`go run .`.cwd(dir).quiet().nothrow();
const output = result.stdout.toString() + result.stderr.toString();

server.close();

if (!output.includes("ROOM_STATE room=go-room members=0")) {
	console.error("Go client did not report the expected room state:\n", output.trim());
	process.exit(1);
}

console.log("Go client joined 'go-room' and received ROOM_STATE from the TypeScript server");
console.log("\n✓ go parity example passed");
process.exit(0);
