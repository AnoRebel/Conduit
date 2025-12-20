#!/usr/bin/env node

import { confirm, input, number } from "@inquirer/prompts";
import { Command } from "commander";
import { createConduitServer } from "../dist/adapters/node.js";

const program = new Command();

program.name("conduit").description("Conduit Server - WebRTC signaling server").version("1.0.0");

program
	.command("start")
	.alias("serve")
	.description("Start the Conduit server")
	.option("-p, --port <port>", "Port to listen on", "9000")
	.option("-H, --host <host>", "Host to bind to", "0.0.0.0")
	.option("-k, --key <key>", "API key for clients", "conduit")
	.option("--path <path>", "Path prefix", "/")
	.option("--allow-discovery", "Allow peer discovery API", false)
	.option("--concurrent-limit <limit>", "Max concurrent connections", "5000")
	.option("--alive-timeout <ms>", "Connection alive timeout in ms", "60000")
	.option("--expire-timeout <ms>", "Message expire timeout in ms", "5000")
	.option("--cors <origin>", "CORS origin (use * for all)", "*")
	.option("--no-relay", "Disable WebSocket relay transport")
	.action(async options => {
		const port = parseInt(options.port, 10);
		const host = options.host;
		const key = options.key;
		const path = options.path;
		const allowDiscovery = options.allowDiscovery;
		const concurrentLimit = parseInt(options.concurrentLimit, 10);
		const aliveTimeout = parseInt(options.aliveTimeout, 10);
		const expireTimeout = parseInt(options.expireTimeout, 10);
		const corsOrigin = options.cors === "*" ? true : options.cors;
		const relayEnabled = options.relay !== false;

		console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   Conduit Server v1.0.0                   ║
╚═══════════════════════════════════════════════════════════╝
`);

		const server = createConduitServer({
			config: {
				port,
				host,
				key,
				path,
				allowDiscovery,
				concurrentLimit,
				aliveTimeout,
				expireTimeout,
				corsOrigin,
				relay: {
					enabled: relayEnabled,
					maxMessageSize: 65536,
				},
			},
			onClientConnect: client => {
				console.log(`[${new Date().toISOString()}] Client connected: ${client.id}`);
			},
			onClientDisconnect: clientId => {
				console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}`);
			},
		});

		server.listen(port, host, () => {
			console.log(`Server listening on ${host}:${port}`);
			console.log(`Path: ${path}`);
			console.log(`Key: ${key}`);
			console.log(`Discovery: ${allowDiscovery ? "enabled" : "disabled"}`);
			console.log(`Relay: ${relayEnabled ? "enabled" : "disabled"}`);
			console.log("");
			console.log("Press Ctrl+C to stop the server");
		});

		// Graceful shutdown
		process.on("SIGINT", () => {
			console.log("\nShutting down server...");
			server.close(() => {
				console.log("Server stopped");
				process.exit(0);
			});
		});

		process.on("SIGTERM", () => {
			console.log("\nShutting down server...");
			server.close(() => {
				console.log("Server stopped");
				process.exit(0);
			});
		});
	});

program
	.command("init")
	.description("Initialize a new Conduit server configuration interactively")
	.action(async () => {
		console.log("Conduit Server Configuration\n");

		const port = await number({
			message: "Port to listen on:",
			default: 9000,
		});

		const host = await input({
			message: "Host to bind to:",
			default: "0.0.0.0",
		});

		const key = await input({
			message: "API key for clients:",
			default: "conduit",
		});

		const path = await input({
			message: "Path prefix:",
			default: "/",
		});

		const allowDiscovery = await confirm({
			message: "Allow peer discovery API?",
			default: false,
		});

		const enableRelay = await confirm({
			message: "Enable WebSocket relay transport?",
			default: true,
		});

		console.log("\nConfiguration:");
		console.log(
			JSON.stringify(
				{
					port,
					host,
					key,
					path,
					allowDiscovery,
					relay: { enabled: enableRelay },
				},
				null,
				2
			)
		);

		const start = await confirm({
			message: "Start the server with this configuration?",
			default: true,
		});

		if (start) {
			const server = createConduitServer({
				config: {
					port: port ?? 9000,
					host,
					key,
					path,
					allowDiscovery,
					relay: {
						enabled: enableRelay,
						maxMessageSize: 65536,
					},
				},
				onClientConnect: client => {
					console.log(`[${new Date().toISOString()}] Client connected: ${client.id}`);
				},
				onClientDisconnect: clientId => {
					console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}`);
				},
			});

			server.listen(port ?? 9000, host, () => {
				console.log(`\nServer started on ${host}:${port}`);
			});

			process.on("SIGINT", () => {
				console.log("\nShutting down...");
				server.close(() => process.exit(0));
			});
		}
	});

program.parse();
